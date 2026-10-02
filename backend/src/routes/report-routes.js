const parseBranchId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

module.exports = function registerReportRoutes(app, { query, auth }) {
  app.get('/api/admin/reports', auth(['admin']), async (req, res) => {
    const type = String(req.query.type || 'sales');
    const branchId = req.query.branchId ? parseBranchId(req.query.branchId) : null;
    const from = String(req.query.from || new Date().toISOString().slice(0, 10));
    const to = String(req.query.to || from);

    if (!['sales', 'items', 'payments', 'branches', 'orders'].includes(type)) {
      return res.status(400).json({ message: 'Invalid report type' });
    }
    if (!validDate(from) || !validDate(to) || from > to) {
      return res.status(400).json({ message: 'Use a valid YYYY-MM-DD date range' });
    }
    if (req.query.branchId && !branchId) {
      return res.status(400).json({ message: 'Invalid branch ID' });
    }

    try {
      if (branchId) {
        const { rows: [branch] } = await query('SELECT id,name,code,type,city,state,is_active FROM branches WHERE id=$1', [branchId]);
        if (!branch) return res.status(404).json({ message: 'Branch not found' });
      }

      const condition = branchId ? 'AND o.branch_id=$3' : '';
      const params = branchId ? [from, to, branchId] : [from, to];
      let rows = [];

      if (type === 'sales') {
        ({ rows } = await query(
          `SELECT o.created_at::date AS report_date,
            COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue,
            COALESCE(AVG(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS average_order_value,
            COUNT(*) FILTER (WHERE o.status='completed' AND o.payment_status='paid')::int AS completed_orders
           FROM orders o
           WHERE o.created_at::date BETWEEN $1::date AND $2::date ${condition}
           GROUP BY o.created_at::date
           ORDER BY o.created_at::date ASC`,
          params
        ));
      }

      if (type === 'items') {
        ({ rows } = await query(
          `SELECT oi.item_name AS item,
            SUM(oi.quantity) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS quantity_sold,
            COALESCE(SUM(oi.quantity * oi.unit_price) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue,
            COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders
           FROM order_items oi
           JOIN orders o ON o.id=oi.order_id
           WHERE o.created_at::date BETWEEN $1::date AND $2::date ${condition}
           GROUP BY oi.item_name
           ORDER BY quantity_sold DESC, revenue DESC, oi.item_name ASC`,
          params
        ));
      }

      if (type === 'payments') {
        ({ rows } = await query(
          `SELECT COALESCE(o.payment_method,'unknown') AS payment_method,
            COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue
           FROM orders o
           WHERE o.created_at::date BETWEEN $1::date AND $2::date ${condition}
           GROUP BY o.payment_method
           ORDER BY revenue DESC, payment_method ASC`,
          params
        ));
      }

      if (type === 'branches') {
        ({ rows } = await query(
          `SELECT COALESCE(b.name,'Head Office') AS branch,
            COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue,
            COALESCE(AVG(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS average_order_value
           FROM orders o
           LEFT JOIN branches b ON b.id=o.branch_id
           WHERE o.created_at::date BETWEEN $1::date AND $2::date ${condition}
           GROUP BY COALESCE(b.name,'Head Office')
           ORDER BY revenue DESC, branch ASC`,
          params
        ));
      }

      if (type === 'orders') {
        ({ rows } = await query(
          `SELECT o.order_number,
            o.created_at,
            COALESCE(b.name,'Head Office') AS branch,
            o.order_type,
            o.payment_method,
            o.payment_status,
            o.status,
            o.total
           FROM orders o
           LEFT JOIN branches b ON b.id=o.branch_id
           WHERE o.created_at::date BETWEEN $1::date AND $2::date ${condition}
           ORDER BY o.created_at DESC, o.id DESC
           LIMIT 1000`,
          params
        ));
      }

      const normalize = value => value == null ? '' : value;
      const data = rows.map(row => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, normalize(value)])
      ));

      res.json({
        report: type,
        scope: branchId ? 'BRANCH' : 'HEAD_OFFICE',
        range: { from, to },
        rowCount: data.length,
        rows: data
      });
    } catch (error) {
      console.error('Admin report failed:', error.message);
      res.status(500).json({ message: 'Unable to generate report' });
    }
  });
};
