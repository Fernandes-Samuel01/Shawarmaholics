const parseId = value => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

module.exports = function registerBranchAvailabilityRoutes(app, { query, db, auth }) {
  app.get('/api/admin/branches/:branchId/menu-availability', auth(['admin']), async (req, res) => {
    const branchId = parseId(req.params.branchId);
    if (!branchId) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const { rows: [branch] } = await query('SELECT id,is_active FROM branches WHERE id=$1', [branchId]);
      if (!branch) return res.status(404).json({ message: 'Branch not found' });
      const { rows } = await query(`
        SELECT mi.id,mi.name,mi.is_active,mc.name category_name,
          COALESCE(bma.is_available,mi.available) AS branch_available,
          COALESCE(bma.updated_at,mi.created_at) AS updated_at
        FROM menu_items mi
        LEFT JOIN menu_categories mc ON mc.id=mi.category_id
        LEFT JOIN branch_menu_availability bma ON bma.menu_item_id=mi.id AND bma.branch_id=$1
        ORDER BY mc.position ASC NULLS LAST,mc.name ASC,mi.name ASC,mi.id ASC
      `, [branchId]);
      res.json({ branchId, items: rows });
    } catch (error) {
      console.error('Branch menu availability load failed:', error.message);
      res.status(500).json({ message: 'Unable to load branch menu availability' });
    }
  });

  app.patch('/api/admin/branches/:branchId/menu-availability/:itemId', auth(['admin']), async (req, res) => {
    const branchId = parseId(req.params.branchId);
    const itemId = parseId(req.params.itemId);
    const available = req.body?.is_available;
    if (!branchId || !itemId) return res.status(400).json({ message: 'Invalid branch or menu item ID' });
    if (typeof available !== 'boolean') return res.status(400).json({ message: 'is_available must be a boolean' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [branch] } = await client.query('SELECT id,is_active FROM branches WHERE id=$1 FOR SHARE', [branchId]);
      if (!branch) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Branch not found' }); }
      if (!branch.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Cannot change availability for an inactive branch' }); }
      const { rows: [item] } = await client.query('SELECT id,name,is_active FROM menu_items WHERE id=$1 FOR SHARE', [itemId]);
      if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }); }
      if (!item.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Archived menu items cannot be made available' }); }
      const { rows: [updated] } = await client.query(`
        INSERT INTO branch_menu_availability(branch_id,menu_item_id,is_available,updated_at,updated_by)
        VALUES($1,$2,$3,NOW(),$4)
        ON CONFLICT(branch_id,menu_item_id) DO UPDATE SET is_available=EXCLUDED.is_available,updated_at=NOW(),updated_by=EXCLUDED.updated_by
        RETURNING branch_id,menu_item_id,is_available,updated_at
      `, [branchId, itemId, available, req.user?.id || null]);
      await client.query('COMMIT');
      res.json({ item: { id: itemId, name: item.name, is_available: updated.is_available, updated_at: updated.updated_at } });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('Branch menu availability update failed:', error.message);
      res.status(500).json({ message: 'Unable to update branch menu availability' });
    } finally { client.release(); }
  });
};
