const parseBranchId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

module.exports = function registerAnalyticsRoutes(app, { query, auth }) {
  app.get('/api/admin/analytics/dashboard', auth(['admin']), async (req, res) => {
    const branchId = req.query.branchId ? parseBranchId(req.query.branchId) : null;
    if (req.query.branchId && !branchId) return res.status(400).json({ message: 'Invalid branch ID' });

    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = today;
    const defaultTo = today;
    const from = req.query.from ? String(req.query.from) : defaultFrom;
    const to = req.query.to ? String(req.query.to) : defaultTo;

    if (!validDate(from) || !validDate(to)) return res.status(400).json({ message: 'Use YYYY-MM-DD dates' });
    if (from > to) return res.status(400).json({ message: 'Analytics start date cannot be after end date' });

    try {
      if (branchId) {
        const { rows: [branch] } = await query(
          'SELECT id,name,code,type,city,state,is_active FROM branches WHERE id=$1',
          [branchId]
        );
        if (!branch) return res.status(404).json({ message: 'Branch not found' });
      }

      const scope = branchId ? 'BRANCH' : 'HEAD_OFFICE';
      const orderCondition = branchId ? 'o.branch_id=$3' : 'TRUE';
      const itemCondition = branchId ? 'o.branch_id=$3' : 'TRUE';
      const params = [from, to, ...(branchId ? [branchId] : [])];

      const { rows: [summary] } = await query(
        `SELECT
          COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue,
          COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
          COALESCE(AVG(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS aov,
          COUNT(*) FILTER (WHERE o.status='completed' AND o.payment_status='paid')::int AS completed_orders,
          COUNT(*) FILTER (WHERE o.status='preparing' AND o.payment_status='paid')::int AS preparing_orders,
          COUNT(*) FILTER (WHERE o.status IN ('confirmed','new') AND o.payment_status='paid')::int AS queued_orders
        FROM orders o
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND ${orderCondition}`,
        params
      );

      const { rows: trend } = await query(
        `SELECT o.created_at::date AS date,
          COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue,
          COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders
        FROM orders o
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND ${orderCondition}
        GROUP BY o.created_at::date
        ORDER BY o.created_at::date ASC`,
        params
      );

      const { rows: topItems } = await query(
        `SELECT oi.item_name AS name,
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::int AS quantity,
          COALESCE(SUM(oi.quantity * oi.unit_price) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue
        FROM order_items oi
        JOIN orders o ON o.id=oi.order_id
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND ${itemCondition}
        GROUP BY oi.item_name
        ORDER BY quantity DESC, revenue DESC, oi.item_name ASC
        LIMIT 8`,
        params
      );

      const { rows: payments } = await query(
        `SELECT COALESCE(o.payment_method,'unknown') AS method,
          COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
          COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue
        FROM orders o
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND ${orderCondition}
        GROUP BY o.payment_method
        ORDER BY revenue DESC`,
        params
      );

      const { rows: statuses } = await query(
        `SELECT o.status,
          COUNT(*)::int AS orders
        FROM orders o
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND ${orderCondition}
        GROUP BY o.status
        ORDER BY orders DESC`,
        params
      );

      let branches = [];
      if (!branchId) {
        const result = await query(
          `SELECT COALESCE(b.name,'Head Office') AS name,
            COUNT(*) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled')::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status='paid' AND o.status <> 'cancelled'),0)::numeric AS revenue
           FROM orders o
           LEFT JOIN branches b ON b.id=o.branch_id
           WHERE o.created_at::date BETWEEN $1::date AND $2::date
           GROUP BY COALESCE(b.name,'Head Office')
           ORDER BY revenue DESC, name ASC`,
          [from, to]
        );
        branches = result.rows;
      }

      const numeric = value => Number(value || 0);
      res.json({
        scope,
        branch: branchId ? (await query('SELECT id,name,code,type,city,state,is_active FROM branches WHERE id=$1',[branchId])).rows[0] : null,
        range: { from, to },
        summary: {
          revenue: numeric(summary.revenue),
          orders: Number(summary.orders || 0),
          aov: numeric(summary.aov),
          completed_orders: Number(summary.completed_orders || 0),
          preparing_orders: Number(summary.preparing_orders || 0),
          queued_orders: Number(summary.queued_orders || 0)
        },
        trend: trend.map(row => ({ date: row.date, revenue: numeric(row.revenue), orders: Number(row.orders || 0) })),
        topItems: topItems.map(row => ({ name: row.name, quantity: Number(row.quantity || 0), revenue: numeric(row.revenue) })),
        payments: payments.map(row => ({ method: row.method, orders: Number(row.orders || 0), revenue: numeric(row.revenue) })),
        statuses: statuses.map(row => ({ status: row.status, orders: Number(row.orders || 0) })),
        branches: branches.map(row => ({ name: row.name, orders: Number(row.orders || 0), revenue: numeric(row.revenue) }))
      });
    } catch (error) {
      console.error('Admin analytics failed:', error.message);
      res.status(500).json({ message: 'Unable to load analytics' });
    }
  });
};
