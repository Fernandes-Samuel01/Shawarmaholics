module.exports = function registerKitchenRoutes(app, query, io, db) {
  app.get('/api/inventory', async (req, res) => {
    try {
      const locationType = String(req.query.locationType || 'BRANCH').toUpperCase();
      const branchId = Number(req.query.branchId);
      if (locationType !== 'BRANCH' || !Number.isInteger(branchId) || branchId < 1) {
        return res.status(400).json({ message: 'A valid kitchen branch is required' });
      }

      const { rows: [branch] } = await query(
        'SELECT id,code,name FROM branches WHERE id=$1 AND is_active=true',
        [branchId]
      );
      if (!branch) return res.status(404).json({ message: 'Kitchen branch not found' });

      const { rows } = await query(
        "SELECT ii.id,ii.sku,ii.name,ii.unit,ii.low_stock_threshold,COALESCE(b.quantity,0) quantity,CASE WHEN COALESCE(b.quantity,0)<=0 THEN 'out' WHEN COALESCE(b.quantity,0)<=ii.low_stock_threshold THEN 'low' ELSE 'available' END status FROM inventory_items ii LEFT JOIN branch_inventory_balances b ON b.inventory_item_id=ii.id AND b.branch_id=$1 WHERE ii.is_active=true ORDER BY ii.name ASC,ii.id ASC",
        [branchId]
      );

      res.json({ location: 'BRANCH', branchId, branch, items: rows });
    } catch (e) {
      res.status(500).json({ message: 'Unable to load kitchen inventory' });
    }
  });

  app.patch('/api/inventory/:id', async (req, res) => {
    const itemId = Number(req.params.id);
    const branchId = Number(req.body?.branchId);
    const quantity = Number(req.body?.quantity);
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Kitchen stock status update';

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ message: 'Invalid inventory item ID' });
    }
    if (!Number.isInteger(branchId) || branchId < 1) {
      return res.status(400).json({ message: 'A valid kitchen branch is required' });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ message: 'Invalid inventory quantity' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [branch] } = await client.query(
        'SELECT id,code,name FROM branches WHERE id=$1 AND is_active=true FOR UPDATE',
        [branchId]
      );
      if (!branch) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Kitchen branch not found' });
      }

      const { rows: [item] } = await client.query(
        'SELECT id,sku,name,unit,low_stock_threshold,is_active FROM inventory_items WHERE id=$1 FOR UPDATE',
        [itemId]
      );
      if (!item) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Inventory item not found' });
      }
      if (!item.is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Inventory item is inactive' });
      }

      await client.query(
        'INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',
        [branchId, itemId]
      );
      const { rows: [balance] } = await client.query(
        'SELECT quantity FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2 FOR UPDATE',
        [branchId, itemId]
      );

      const current = Number(balance.quantity);
      if (Math.abs(current - quantity) < 0.0000001) {
        await client.query('ROLLBACK');
        return res.json({
          item: {
            ...item,
            quantity: current,
            status: current <= 0 ? 'out' : current <= Number(item.low_stock_threshold) ? 'low' : 'available',
            branchId,
            locationType: 'BRANCH'
          }
        });
      }

      const delta = quantity - current;
      const movementType = delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const movementQuantity = Math.abs(delta);

      const { rows: [movement] } = await client.query(
        'INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,reason,created_by) VALUES($1,$2,$3,$4,$5,NULL) RETURNING id,created_at',
        [branchId, itemId, movementType, movementQuantity, reason]
      );

      await client.query(
        'UPDATE branch_inventory_balances SET quantity=$1,updated_at=NOW() WHERE branch_id=$2 AND inventory_item_id=$3',
        [quantity, branchId, itemId]
      );

      await client.query('COMMIT');

      const status = quantity <= 0 ? 'out' : quantity <= Number(item.low_stock_threshold) ? 'low' : 'available';
      const liveItem = {
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        low_stock_threshold: item.low_stock_threshold,
        quantity,
        status,
        branchId,
        locationType: 'BRANCH',
        movementType,
        movementId: movement.id
      };

      io.emit('inventory.updated', liveItem);
      if (status === 'low') io.emit('inventory.low', liveItem);
      if (status === 'out') io.emit('inventory.out_of_stock', liveItem);

      res.json({ item: liveItem, movement });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(500).json({ message: 'Unable to update kitchen inventory' });
    } finally {
      client.release();
    }
  });
};
