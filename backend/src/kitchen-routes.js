module.exports = function registerKitchenRoutes(app, query, io, db, auth) {
  app.get('/api/inventory', async (req, res) => {
    try {
      const locationType = String(req.query.locationType || 'HEAD_OFFICE').toUpperCase();
      const branchId = locationType === 'BRANCH' ? Number(req.query.branchId) : null;
      if (!['HEAD_OFFICE', 'BRANCH'].includes(locationType)) {
        return res.status(400).json({ message: 'Invalid kitchen location' });
      }
      if (locationType === 'BRANCH' && (!Number.isInteger(branchId) || branchId < 1)) {
        return res.status(400).json({ message: 'A valid kitchen branch is required' });
      }

      let branch = null;
      if (locationType === 'BRANCH') {
        const { rows: [foundBranch] } = await query(
          'SELECT id,code,name FROM branches WHERE id=$1 AND is_active=true',
          [branchId]
        );
        if (!foundBranch) return res.status(404).json({ message: 'Kitchen branch not found' });
        branch = foundBranch;
      }

      const balanceTable = locationType === 'HEAD_OFFICE'
        ? 'head_office_inventory_balances'
        : 'branch_inventory_balances';
      const join = locationType === 'HEAD_OFFICE'
        ? 'b.inventory_item_id=ii.id'
        : 'b.inventory_item_id=ii.id AND b.branch_id=$1';
      const params = locationType === 'HEAD_OFFICE' ? [] : [branchId];

      const { rows } = await query(
        `SELECT ii.id,ii.sku,ii.name,ii.unit,ii.low_stock_threshold,COALESCE(b.quantity,0) quantity,CASE WHEN COALESCE(b.quantity,0)<=0 THEN 'out' WHEN COALESCE(b.quantity,0)<=ii.low_stock_threshold THEN 'low' ELSE 'available' END status FROM inventory_items ii LEFT JOIN ${balanceTable} b ON ${join} WHERE ii.is_active=true ORDER BY ii.name ASC,ii.id ASC`,
        params
      );

      res.json({ location: locationType, locationType, branchId, branch, items: rows });
    } catch (e) {
      res.status(500).json({ message: 'Unable to load kitchen inventory' });
    }
  });

  app.patch('/api/inventory/:id', async (req, res) => {
    const itemId = Number(req.params.id);
    const locationType = String(req.body?.locationType || 'HEAD_OFFICE').toUpperCase();
    const branchId = locationType === 'BRANCH' ? Number(req.body?.branchId) : null;
    const quantity = Number(req.body?.quantity);
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Kitchen stock status update';

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ message: 'Invalid inventory item ID' });
    }
    if (!['HEAD_OFFICE', 'BRANCH'].includes(locationType)) {
      return res.status(400).json({ message: 'Invalid kitchen location' });
    }
    if (locationType === 'BRANCH' && (!Number.isInteger(branchId) || branchId < 1)) {
      return res.status(400).json({ message: 'A valid kitchen branch is required' });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ message: 'Invalid inventory quantity' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let branch = null;
      if (locationType === 'BRANCH') {
        const { rows: [foundBranch] } = await client.query(
          'SELECT id,code,name FROM branches WHERE id=$1 AND is_active=true FOR UPDATE',
          [branchId]
        );
        if (!foundBranch) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: 'Kitchen branch not found' });
        }
        branch = foundBranch;
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

      const balanceTable = locationType === 'HEAD_OFFICE'
        ? 'head_office_inventory_balances'
        : 'branch_inventory_balances';
      const movementTable = locationType === 'HEAD_OFFICE'
        ? 'head_office_inventory_movements'
        : 'inventory_movements';
      const balanceColumns = locationType === 'HEAD_OFFICE'
        ? '(inventory_item_id,quantity)'
        : '(branch_id,inventory_item_id,quantity)';
      const balanceValues = locationType === 'HEAD_OFFICE'
        ? '($1,0)'
        : '($1,$2,0)';
      const balanceParams = locationType === 'HEAD_OFFICE' ? [itemId] : [branchId, itemId];

      await client.query(
        `INSERT INTO ${balanceTable}${balanceColumns} VALUES${balanceValues} ON CONFLICT DO NOTHING`,
        balanceParams
      );

      const balanceQuery = locationType === 'HEAD_OFFICE'
        ? 'SELECT quantity FROM head_office_inventory_balances WHERE inventory_item_id=$1 FOR UPDATE'
        : 'SELECT quantity FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2 FOR UPDATE';
      const { rows: [balance] } = await client.query(balanceQuery, balanceParams);

      const current = Number(balance.quantity);
      if (Math.abs(current - quantity) < 0.0000001) {
        await client.query('ROLLBACK');
        return res.json({
          item: {
            ...item,
            quantity: current,
            status: current <= 0 ? 'out' : current <= Number(item.low_stock_threshold) ? 'low' : 'available',
            locationType,
            branchId,
            branch
          }
        });
      }

      const delta = quantity - current;
      const movementType = delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const movementQuantity = Math.abs(delta);

      const movementQuery = locationType === 'HEAD_OFFICE'
        ? 'INSERT INTO head_office_inventory_movements(inventory_item_id,movement_type,quantity,reason,created_by) VALUES($1,$2,$3,$4,NULL) RETURNING id,created_at'
        : 'INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,reason,created_by) VALUES($1,$2,$3,$4,$5,NULL) RETURNING id,created_at';
      const movementParams = locationType === 'HEAD_OFFICE'
        ? [itemId, movementType, movementQuantity, reason]
        : [branchId, itemId, movementType, movementQuantity, reason];
      const { rows: [movement] } = await client.query(movementQuery, movementParams);

      const updateQuery = locationType === 'HEAD_OFFICE'
        ? 'UPDATE head_office_inventory_balances SET quantity=$1,updated_at=NOW() WHERE inventory_item_id=$2'
        : 'UPDATE branch_inventory_balances SET quantity=$1,updated_at=NOW() WHERE branch_id=$2 AND inventory_item_id=$3';
      const updateParams = locationType === 'HEAD_OFFICE'
        ? [quantity, itemId]
        : [quantity, branchId, itemId];
      await client.query(updateQuery, updateParams);

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
        locationType,
        branchId,
        branch,
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
