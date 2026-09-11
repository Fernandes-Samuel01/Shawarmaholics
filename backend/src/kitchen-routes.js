module.exports=function registerKitchenRoutes(app,query,io){
  app.patch('/api/inventory/:id',async(req,res)=>{try{const quantity=Number(req.body.quantity);const {rows}=await query("UPDATE inventory_items SET quantity=$1,updated_at=NOW() WHERE id=$2 RETURNING *,CASE WHEN quantity<=0 THEN 'out' WHEN quantity<=low_stock_threshold THEN 'low' ELSE 'available' END status",[quantity,req.params.id]);if(!rows[0])return res.status(404).json({message:'Inventory item not found'});io.emit('inventory:updated',rows[0]);res.json({item:rows[0]})}catch(e){res.status(500).json({message:e.message})}});
};
