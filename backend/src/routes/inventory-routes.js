const movementTypes = new Set(['RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','WASTE','RETURN']);
const inboundTypes = new Set(['RECEIPT','ADJUSTMENT_IN','RETURN']);

module.exports = function registerInventoryRoutes(app, { query, db, auth }) {
  const parseId = value => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

  app.get('/api/admin/inventory', auth(['admin']), async (req, res) => {
    try {
      const branchId = req.query.branchId ? parseId(req.query.branchId) : null;
      if (req.query.branchId && !branchId) return res.status(400).json({ message: 'Invalid branch ID' });
      const search = String(req.query.search || '').trim();
      const lowStock = String(req.query.lowStock || '') === 'true';
      const params = [];
      const where = ['ii.is_active=true'];
      if (branchId) { params.push(branchId); where.push('b.id=$' + params.length); }
      if (search) { params.push('%' + search + '%'); where.push('(ii.name ILIKE $' + params.length + ' OR ii.sku ILIKE $' + params.length + ')'); }
      if (lowStock) where.push('COALESCE(bib.quantity,0) <= ii.low_stock_threshold');
      const { rows } = await query(
        'SELECT ii.id,ii.sku,ii.name,ii.unit,ii.low_stock_threshold,ii.is_active,b.id branch_id,b.name branch_name,b.code branch_code,COALESCE(bib.quantity,0) quantity,bib.updated_at FROM inventory_items ii CROSS JOIN branches b LEFT JOIN branch_inventory_balances bib ON bib.inventory_item_id=ii.id AND bib.branch_id=b.id WHERE ' + where.join(' AND ') + ' ORDER BY b.name ASC,ii.name ASC',
        params
      );
      res.json({ items: rows });
    } catch (e) { res.status(500).json({ message: 'Unable to load inventory' }); }
  });

  app.get('/api/admin/inventory/items', auth(['admin']), async (req, res) => {
    try {
      const { rows } = await query('SELECT id,sku,name,unit,low_stock_threshold,is_active,created_at FROM inventory_items ORDER BY name ASC,id ASC');
      res.json({ items: rows });
    } catch (e) { res.status(500).json({ message: 'Unable to load inventory items' }); }
  });

  app.post('/api/admin/inventory/items', auth(['admin']), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const unit = typeof req.body?.unit === 'string' ? req.body.unit.trim() : '';
    const sku = typeof req.body?.sku === 'string' ? req.body.sku.trim().toUpperCase() : '';
    const threshold = Number(req.body?.lowStockThreshold);
    if (!name) return res.status(400).json({ message: 'Inventory item name is required' });
    if (!unit) return res.status(400).json({ message: 'Unit is required' });
    if (!Number.isFinite(threshold) || threshold < 0) return res.status(400).json({ message: 'Low-stock threshold must be a non-negative number' });
    try {
      const { rows } = await query(
        "INSERT INTO inventory_items(name,sku,unit,low_stock_threshold) VALUES($1,COALESCE(NULLIF($2,''),'INV-'||LPAD((SELECT COALESCE(MAX(id),0)+1 FROM inventory_items)::text,5,'0')),$3,$4) RETURNING id,sku,name,unit,low_stock_threshold,is_active,created_at",
        [name, sku, unit, threshold]
      );
      res.status(201).json({ item: rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ message: 'An inventory item with this name or SKU already exists' });
      res.status(500).json({ message: 'Unable to create inventory item' });
    }
  });

  app.patch('/api/admin/inventory/items/:id', auth(['admin']), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid inventory item ID' });
    const updates = [], values = [];
    const add = (field, value) => { values.push(value); updates.push(field + '=$' + values.length); };
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body,'name')) { if (typeof body.name !== 'string' || !body.name.trim()) return res.status(400).json({message:'Item name cannot be empty'}); add('name',body.name.trim()); }
    if (Object.prototype.hasOwnProperty.call(body,'unit')) { if (typeof body.unit !== 'string' || !body.unit.trim()) return res.status(400).json({message:'Unit cannot be empty'}); add('unit',body.unit.trim()); }
    if (Object.prototype.hasOwnProperty.call(body,'lowStockThreshold')) { const v=Number(body.lowStockThreshold); if(!Number.isFinite(v)||v<0)return res.status(400).json({message:'Low-stock threshold must be a non-negative number'}); add('low_stock_threshold',v); }
    if (Object.prototype.hasOwnProperty.call(body,'isActive')) { if(typeof body.isActive!=='boolean')return res.status(400).json({message:'isActive must be boolean'}); add('is_active',body.isActive); }
    if (!updates.length) return res.status(400).json({message:'At least one inventory item field is required'});
    values.push(id);
    try {
      const {rows}=await query('UPDATE inventory_items SET '+updates.join(',')+' WHERE id=$'+values.length+' RETURNING id,sku,name,unit,low_stock_threshold,is_active,created_at',values);
      if(!rows[0])return res.status(404).json({message:'Inventory item not found'});
      res.json({item:rows[0]});
    } catch(e){ if(e.code==='23505')return res.status(409).json({message:'An inventory item with this name already exists'}); res.status(500).json({message:'Unable to update inventory item'}); }
  });

  app.get('/api/admin/inventory/movements', auth(['admin']), async (req,res)=>{
    try{
      const branchId=req.query.branchId?parseId(req.query.branchId):null, itemId=req.query.itemId?parseId(req.query.itemId):null;
      const limitRaw=Number(req.query.limit||100), limit=Number.isInteger(limitRaw)?Math.min(Math.max(limitRaw,1),200):100;
      const params=[],where=[];
      if(branchId){params.push(branchId);where.push('im.branch_id=$'+params.length);}
      if(itemId){params.push(itemId);where.push('im.inventory_item_id=$'+params.length);}
      params.push(limit);
      const {rows}=await query('SELECT im.id,im.branch_id,b.name branch_name,im.inventory_item_id,ii.name item_name,ii.sku,ii.unit,im.movement_type,im.quantity,im.unit_cost,im.reason,im.created_at,u.name created_by_name FROM inventory_movements im JOIN branches b ON b.id=im.branch_id JOIN inventory_items ii ON ii.id=im.inventory_item_id LEFT JOIN users u ON u.id=im.created_by '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY im.created_at DESC,im.id DESC LIMIT $'+params.length,params);
      res.json({movements:rows});
    }catch(e){res.status(500).json({message:'Unable to load inventory movement history'});}
  });

  app.post('/api/admin/inventory/movements', auth(['admin']), async (req,res)=>{
    const branchId=parseId(req.body?.branchId), itemId=parseId(req.body?.inventoryItemId), movementType=String(req.body?.movementType||'').toUpperCase();
    const quantity=Number(req.body?.quantity), unitCost=req.body?.unitCost===''||req.body?.unitCost==null?null:Number(req.body.unitCost);
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():null;
    if(!branchId)return res.status(400).json({message:'A valid branch is required'});
    if(!itemId)return res.status(400).json({message:'A valid inventory item is required'});
    if(!movementTypes.has(movementType))return res.status(400).json({message:'Invalid inventory movement type'});
    if(!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({message:'Quantity must be greater than zero'});
    if(unitCost!=null&&(!Number.isFinite(unitCost)||unitCost<0))return res.status(400).json({message:'Unit cost must be a non-negative number'});
    if(['ADJUSTMENT_IN','ADJUSTMENT_OUT','WASTE'].includes(movementType)&&!reason)return res.status(400).json({message:'A reason is required for adjustments and waste'});
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      const {rows:[branch]}=await client.query('SELECT id FROM branches WHERE id=$1 AND is_active=true FOR UPDATE',[branchId]);
      if(!branch){await client.query('ROLLBACK');return res.status(404).json({message:'Branch not found'});}
      const {rows:[item]}=await client.query('SELECT id,is_active,unit FROM inventory_items WHERE id=$1 FOR UPDATE',[itemId]);
      if(!item){await client.query('ROLLBACK');return res.status(404).json({message:'Inventory item not found'});}
      if(!item.is_active){await client.query('ROLLBACK');return res.status(400).json({message:'Cannot post stock for an inactive inventory item'});}
      await client.query('INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[branchId,itemId]);
      const {rows:[balance]}=await client.query('SELECT quantity FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2 FOR UPDATE',[branchId,itemId]);
      const next=Number(balance.quantity)+(inboundTypes.has(movementType)?quantity:-quantity);
      if(next<0){await client.query('ROLLBACK');return res.status(409).json({message:'Insufficient stock. Current stock is '+balance.quantity+' '+item.unit});}
      const {rows:[movement]}=await client.query('INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,unit_cost,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at',[branchId,itemId,movementType,quantity,unitCost,reason,req.user.id]);
      await client.query('UPDATE branch_inventory_balances SET quantity=$1,updated_at=NOW() WHERE branch_id=$2 AND inventory_item_id=$3',[next,branchId,itemId]);
      await client.query('COMMIT');
      res.status(201).json({movement:{...movement,quantity,movementType,branchId,inventoryItemId:itemId,newQuantity:next}});
    }catch(e){try{await client.query('ROLLBACK')}catch{}res.status(500).json({message:'Unable to post inventory movement'});}finally{client.release();}
  });
};