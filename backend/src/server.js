require('dotenv').config();
const express=require('express');
const cors=require('cors');
const http=require('http');
const {Server}=require('socket.io');
const {Pool}=require('pg');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:process.env.FRONTEND_URL||'*'}});
const db=new Pool({connectionString:process.env.DATABASE_URL});
app.use(cors());
app.use(express.json());
const query=(text,params=[])=>db.query(text,params);
require('./kitchen-routes')(app,query,io);
require('./kitchen-performance')(app,query);
require('./routes/staff-attendance-routes')(app,{query,db});

const auth=(roles=[])=> (req,res,next)=>{
  try{
    const user=jwt.verify((req.headers.authorization||'').replace('Bearer ',''),process.env.JWT_SECRET);
    if(roles.length&&!roles.includes(user.role))return res.status(403).json({message:'Not authorized'});
    req.user=user;next();
  }catch(e){res.status(401).json({message:'Authentication required'});}
};

const orderQuery=`SELECT o.*,COALESCE(json_agg(json_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'customizations',oi.customizations)) FILTER(WHERE oi.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id`;
const kitchenOrderQuery=condition=>`${orderQuery} WHERE ${condition} GROUP BY o.id ORDER BY o.created_at ASC,o.id ASC`;
const completedOrderQuery=`SELECT o.id,o.status,o.order_type,o.received_at,o.activated_at,o.completed_at,o.prep_time_seconds,o.target_prep_seconds,o.was_delayed,COALESCE(json_agg(json_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'customizations',oi.customizations)) FILTER(WHERE oi.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id`;

function queueSnapshot(orders,maxActive=2){
  const eligible=orders.filter(order=>order.payment_status==='paid'&&!['completed','cancelled'].includes(order.status))
    .slice().sort((a,b)=>new Date(a.received_at||a.created_at)-new Date(b.received_at||b.created_at)||Number(a.id)-Number(b.id));
  return {active:eligible.slice(0,maxActive),upNext:eligible.slice(maxActive,maxActive+1)[0]||null,waiting:eligible.slice(maxActive+1)};
}
async function getKitchenQueue(){
  const {rows}=await query(kitchenOrderQuery("o.payment_status='paid' AND o.status NOT IN('completed','cancelled')"));
  return {orders:rows,queue:queueSnapshot(rows)};
}

app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/auth/login',async(req,res)=>{try{const {rows}=await query('SELECT u.*,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE email=$1',[req.body.email]);if(!rows[0]||!await bcrypt.compare(req.body.password,rows[0].password_hash))return res.status(401).json({message:'Invalid credentials'});const user=rows[0];res.json({token:jwt.sign({id:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'8h'}),user:{id:user.id,name:user.name,role:user.role}})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/menu',async(req,res)=>{try{const {rows}=await query('SELECT mi.*,mc.name category FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id WHERE mi.available ORDER BY mc.position,mi.name');res.json({items:rows})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/orders',async(req,res)=>{try{const states=(req.query.status||'').split(',').filter(Boolean);const sql=`${orderQuery} ${states.length?'WHERE o.status=ANY($1)':''} GROUP BY o.id ORDER BY o.created_at DESC`;const {rows}=await query(sql,states.length?[states]:[]);res.json({orders:rows})}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/orders',async(req,res)=>{
  const client=await db.connect();
  try{
    const {orderType,items=[],paymentMethod,paymentStatus='pending',orderStatus='awaiting_payment'}=req.body;
    if(!items.length)return res.status(400).json({message:'Items required'});
    if(!['upi','cash'].includes(paymentMethod)||!['pending','paid'].includes(paymentStatus)||!['awaiting_payment','confirmed'].includes(orderStatus))return res.status(400).json({message:'Invalid payment or order status'});
    await client.query('BEGIN');
    const calculateLineTotal=item=>{const customizations=item.customizations||{};const extrasTotal=(customizations.extras||[]).reduce((sum,extra)=>sum+Number(extra.price||0),0);const sauceTotal=Number(customizations.sauce?.price||0);return Number(item.unitPrice||0)*Number(item.quantity||0)+extrasTotal+sauceTotal};
    const total=items.reduce((sum,item)=>sum+calculateLineTotal(item),0);
    const {rows:[order]}=await client.query("INSERT INTO orders(order_number,order_type,total,payment_method,payment_status,status,received_at,target_prep_seconds) VALUES ('A-'||nextval('order_number_seq'),$1,$2,$3,$4,$5,NOW(),480) RETURNING *",[orderType,total,paymentMethod,paymentStatus,orderStatus]);
    for(const item of items)await client.query('INSERT INTO order_items(order_id,menu_item_id,item_name,quantity,unit_price,customizations) VALUES($1,$2,$3,$4,$5,$6)',[order.id,item.menuItemId||null,item.name,item.quantity,item.unitPrice,item.customizations||{}]);
    await client.query('COMMIT');
    const result={...order,items};
    io.emit(orderStatus==='confirmed'?'order:new':'order:awaiting_payment',result);
    res.status(201).json({order:{...result,estimated_minutes:12}});
  }catch(e){await client.query('ROLLBACK');res.status(500).json({message:e.message})}finally{client.release()}
});

async function updateOrderStatus(req,res,source='orders'){
  const status=String(req.body.status||'').toLowerCase();
  if(!['preparing','completed'].includes(status))return res.status(400).json({message:'Invalid status'});
  try{
    let result;
    if(status==='preparing'){
      const {rows}=await query(`UPDATE orders SET status='preparing',activated_at=COALESCE(activated_at,NOW()),preparation_started_at=COALESCE(preparation_started_at,NOW()) WHERE id=$1 ${source==='kitchen'?"AND payment_status='paid'":''} AND status NOT IN('completed','cancelled') RETURNING *`,[req.params.id]);
      if(!rows[0])return res.status(404).json({message:source==='kitchen'?'Kitchen order not found':'Not found'});
      result=rows[0];
    }else{
      const {rows}=await query(`UPDATE orders SET status='completed',completed_at=NOW(),prep_time_seconds=CASE WHEN COALESCE(activated_at,preparation_started_at) IS NULL THEN NULL ELSE GREATEST(0,EXTRACT(EPOCH FROM (NOW()-COALESCE(activated_at,preparation_started_at)))::int) END,was_delayed=CASE WHEN COALESCE(activated_at,preparation_started_at) IS NULL THEN false ELSE EXTRACT(EPOCH FROM (NOW()-COALESCE(activated_at,preparation_started_at)))::int>COALESCE(target_prep_seconds,480) END WHERE id=$1 ${source==='kitchen'?"AND payment_status='paid'":''} AND status NOT IN('completed','cancelled') RETURNING *`,[req.params.id]);
      if(!rows[0])return res.status(409).json({message:'Order is already completed or unavailable'});
      result=rows[0];
    }
    io.emit(status==='preparing'?'order:activated':'order:completed',result);
    io.emit('order:updated',result);
    const current=await getKitchenQueue();
    res.json({success:true,order:result,completedOrder:status==='completed'?result:undefined,queue:current.queue});
  }catch(e){res.status(500).json({message:e.message})}
}
app.patch('/api/orders/:id/status',(req,res)=>updateOrderStatus(req,res,'orders'));
app.get('/api/inventory',async(req,res)=>{try{const {rows}=await query("SELECT *,CASE WHEN quantity<=0 THEN 'out' WHEN quantity<=low_stock_threshold THEN 'low' ELSE 'available' END status FROM inventory_items ORDER BY quantity");res.json({items:rows})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/analytics/dashboard',auth(['admin','manager']),async(req,res)=>{try{const {rows:[metrics]}=await query("SELECT COALESCE(SUM(total) FILTER(WHERE created_at::date=CURRENT_DATE),0) revenue,COUNT(*) FILTER(WHERE created_at::date=CURRENT_DATE) orders,COALESCE(ROUND(AVG(total) FILTER(WHERE created_at::date=CURRENT_DATE)),0) aov,COUNT(*) FILTER(WHERE created_at::date=CURRENT_DATE) customers FROM orders");res.json({metrics})}catch(e){res.status(500).json({message:e.message})}});

app.get('/api/kitchen/orders',async(req,res)=>{try{const current=await getKitchenQueue();res.json(current)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/kitchen/orders/completed',async(req,res)=>{try{const {rows}=await query(`${completedOrderQuery} WHERE o.status='completed' GROUP BY o.id ORDER BY o.completed_at DESC NULLS LAST,o.id DESC`);res.json({orders:rows})}catch(e){res.status(500).json({message:e.message})}});
app.patch('/api/kitchen/orders/:id/status',(req,res)=>updateOrderStatus(req,res,'kitchen'));
io.on('connection',socket=>socket.emit('system:ready'));
server.listen(process.env.PORT||4000,()=>console.log('SHAWARMAHOLICS API running'));
