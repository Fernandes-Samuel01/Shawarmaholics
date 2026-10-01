const parseBranchId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parsePrice = value => {
  if (typeof value === 'string' && !value.trim()) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Number(price.toFixed(2)) : null;
};

const branchScope = (req, branchId) => {
  if (req.user?.role === 'admin') return true;
  return Number(req.user?.branch_id) === Number(branchId);
};

module.exports = function registerBranchPricingRoutes(app, { query, db, auth }) {
  app.get('/api/branches/:branchId/pricing', auth(['admin','manager']), async (req, res) => {
    const branchId = parseBranchId(req.params.branchId);
    if (!branchId) return res.status(400).json({ message: 'Invalid branch ID' });
    if (!branchScope(req, branchId)) return res.status(403).json({ message: 'Not authorized for this branch' });
    try {
      const { rows } = await query(
        `SELECT mi.id menu_item_id,mi.name,mi.price master_price,bmp.effective_price,
          COALESCE(bmp.effective_price,mi.price) effective_price,
          pending.id pending_proposal_id,pending.proposed_price pending_price,pending.proposed_at pending_at,
          pending.master_price_at_proposal
         FROM menu_items mi
         LEFT JOIN branch_menu_prices bmp ON bmp.menu_item_id=mi.id AND bmp.branch_id=$1
         LEFT JOIN LATERAL (
           SELECT id,proposed_price,proposed_at,master_price_at_proposal
           FROM branch_price_proposals
           WHERE branch_id=$1 AND menu_item_id=mi.id AND status='PENDING'
           ORDER BY id DESC LIMIT 1
         ) pending ON true
         WHERE mi.is_active=true
         ORDER BY mi.name ASC,mi.id ASC`,
        [branchId]
      );
      const { rows: [branch] } = await query('SELECT id,code,name,type,is_active FROM branches WHERE id=$1',[branchId]);
      if (!branch) return res.status(404).json({ message: 'Branch not found' });
      const { rows: history } = await query(
        `SELECT p.id,p.menu_item_id,p.proposed_price,p.status,p.proposed_at,p.reviewed_at,p.rejection_reason,mi.name menu_item_name
         FROM branch_price_proposals p JOIN menu_items mi ON mi.id=p.menu_item_id
         WHERE p.branch_id=$1 ORDER BY p.proposed_at DESC,p.id DESC LIMIT 100`,
        [branchId]
      );
      res.json({ branch, items: rows, history });
    } catch (e) {
      res.status(500).json({ message: 'Unable to load branch pricing' });
    }
  });

  app.post('/api/branches/:branchId/pricing/proposals', auth(['admin','manager']), async (req, res) => {
    const branchId = parseBranchId(req.params.branchId);
    const menuItemId = Number(req.body?.menuItemId);
    const proposedPrice = parsePrice(req.body?.proposedPrice);
    if (!branchId) return res.status(400).json({ message: 'Invalid branch ID' });
    if (!branchScope(req, branchId)) return res.status(403).json({ message: 'Not authorized for this branch' });
    if (!Number.isInteger(menuItemId) || menuItemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
    if (proposedPrice == null) return res.status(400).json({ message: 'Proposed price must be a non-negative number' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [branch] } = await client.query('SELECT id,is_active FROM branches WHERE id=$1 FOR UPDATE',[branchId]);
      if (!branch) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Branch not found' }); }
      if (!branch.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Branch is inactive' }); }

      const { rows: [item] } = await client.query('SELECT id,name,price,is_active FROM menu_items WHERE id=$1 FOR UPDATE',[menuItemId]);
      if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }); }
      if (!item.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Menu item is archived' }); }

      if (proposedPrice < Number(item.price)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Proposed branch price cannot be below the current master price' });
      }

      const { rows: [pending] } = await client.query(
        "SELECT id FROM branch_price_proposals WHERE branch_id=$1 AND menu_item_id=$2 AND status='PENDING'",
        [branchId,menuItemId]
      );
      if (pending) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'A price proposal is already pending for this menu item' });
      }

      const { rows: [proposal] } = await client.query(
        "INSERT INTO branch_price_proposals(branch_id,menu_item_id,proposed_price,proposed_by,master_price_at_proposal) VALUES($1,$2,$3,$4,$5) RETURNING id,branch_id,menu_item_id,proposed_price,status,proposed_at,master_price_at_proposal",
        [branchId,menuItemId,proposedPrice,req.user?.id || null,item.price]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: 'Price proposal submitted for Head Office approval', proposal });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      if (e.code === '23505') return res.status(409).json({ message: 'A price proposal is already pending for this menu item' });
      res.status(500).json({ message: 'Unable to submit price proposal' });
    } finally { client.release(); }
  });

  app.get('/api/admin/branch-pricing/proposals', auth(['admin']), async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT p.id,p.branch_id,p.menu_item_id,p.proposed_price,p.status,p.proposed_at,p.reviewed_at,
          p.rejection_reason,p.master_price_at_proposal,b.name branch_name,b.code branch_code,
          mi.name menu_item_name,mi.price current_master_price,bmp.effective_price
         FROM branch_price_proposals p
         JOIN branches b ON b.id=p.branch_id
         JOIN menu_items mi ON mi.id=p.menu_item_id
         LEFT JOIN branch_menu_prices bmp ON bmp.branch_id=p.branch_id AND bmp.menu_item_id=p.menu_item_id
         ORDER BY CASE WHEN p.status='PENDING' THEN 0 WHEN p.status='APPROVED' THEN 1 ELSE 2 END,p.proposed_at DESC,p.id DESC`
      );
      res.json({ proposals: rows });
    } catch (e) {
      res.status(500).json({ message: 'Unable to load branch price proposals' });
    }
  });

  app.patch('/api/admin/branch-pricing/proposals/:id', auth(['admin']), async (req, res) => {
    const proposalId = Number(req.params.id);
    const decision = String(req.body?.decision || '').toUpperCase();
    const rejectionReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isInteger(proposalId) || proposalId < 1) return res.status(400).json({ message: 'Invalid proposal ID' });
    if (!['APPROVE','REJECT'].includes(decision)) return res.status(400).json({ message: 'Decision must be APPROVE or REJECT' });
    if (decision === 'REJECT' && rejectionReason.length > 500) return res.status(400).json({ message: 'Rejection reason must be 500 characters or less' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [proposal] } = await client.query(
        'SELECT * FROM branch_price_proposals WHERE id=$1 FOR UPDATE',
        [proposalId]
      );
      if (!proposal) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Price proposal not found' }); }
      if (proposal.status !== 'PENDING') { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Only pending price proposals can be reviewed' }); }

      const { rows: [item] } = await client.query('SELECT id,price,is_active FROM menu_items WHERE id=$1 FOR UPDATE',[proposal.menu_item_id]);
      if (!item || !item.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Menu item is unavailable for price approval' }); }
      const { rows: [branch] } = await client.query('SELECT id,is_active FROM branches WHERE id=$1 FOR UPDATE',[proposal.branch_id]);
      if (!branch || !branch.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Branch is inactive or missing' }); }

      if (decision === 'APPROVE') {
        if (Number(proposal.proposed_price) < Number(item.price)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'Proposal is below the current master price and cannot be approved' });
        }
        await client.query(
          `INSERT INTO branch_menu_prices(branch_id,menu_item_id,effective_price,updated_at)
           VALUES($1,$2,$3,NOW())
           ON CONFLICT(branch_id,menu_item_id) DO UPDATE SET effective_price=EXCLUDED.effective_price,updated_at=NOW()`,
          [proposal.branch_id,proposal.menu_item_id,proposal.proposed_price]
        );
        await client.query(
          "UPDATE branch_price_proposals SET status='APPROVED',reviewed_by=$1,reviewed_at=NOW(),updated_at=NOW() WHERE id=$2",
          [req.user.id,proposalId]
        );
      } else {
        await client.query(
          "UPDATE branch_price_proposals SET status='REJECTED',reviewed_by=$1,reviewed_at=NOW(),rejection_reason=$2,updated_at=NOW() WHERE id=$3",
          [req.user.id,rejectionReason || null,proposalId]
        );
      }

      const { rows: [updated] } = await client.query(
        `SELECT p.id,p.branch_id,p.menu_item_id,p.proposed_price,p.status,p.proposed_at,p.reviewed_at,p.rejection_reason,
          p.master_price_at_proposal,mi.name menu_item_name,mi.price current_master_price,bmp.effective_price
         FROM branch_price_proposals p
         JOIN menu_items mi ON mi.id=p.menu_item_id
         LEFT JOIN branch_menu_prices bmp ON bmp.branch_id=p.branch_id AND bmp.menu_item_id=p.menu_item_id
         WHERE p.id=$1`,
        [proposalId]
      );
      await client.query('COMMIT');
      res.json({ message: decision === 'APPROVE' ? 'Price proposal approved and activated' : 'Price proposal rejected', proposal: updated });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(500).json({ message: 'Unable to review price proposal' });
    } finally { client.release(); }
  });

  app.get('/api/admin/branch-pricing/items', auth(['admin']), async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT mi.id menu_item_id,mi.name,mi.price master_price,COUNT(p.id) FILTER(WHERE p.status='PENDING')::int pending_count
         FROM menu_items mi LEFT JOIN branch_price_proposals p ON p.menu_item_id=mi.id
         WHERE mi.is_active=true GROUP BY mi.id ORDER BY mi.name ASC,mi.id ASC`
      );
      res.json({ items: rows });
    } catch (e) { res.status(500).json({ message: 'Unable to load master pricing items' }); }
  });

  app.get('/api/kiosk/menu-effective', async (req, res) => {
    const branchId = parseBranchId(req.query.branchId);
    if (!branchId) return res.status(400).json({ message: 'A valid branchId query parameter is required' });
    try {
      const { rows } = await query(
        `SELECT mi.id,COALESCE(bmp.effective_price,mi.price) effective_price
         FROM menu_items mi
         LEFT JOIN branch_menu_prices bmp ON bmp.branch_id=$1 AND bmp.menu_item_id=mi.id
         WHERE mi.is_active=true`,
        [branchId]
      );
      res.json({ branch_id: branchId, prices: rows });
    } catch (e) { res.status(500).json({ message: 'Unable to load effective branch prices' }); }
  });
};
