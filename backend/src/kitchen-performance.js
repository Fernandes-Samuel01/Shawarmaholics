const TARGET_PREP_SECONDS = 480;

function formatPrepTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = function registerKitchenPerformance(app, query, requireKdsDevice) {
  app.get('/api/kitchen/performance', requireKdsDevice, async (req, res) => {
    const period = String(req.query.period || 'today').toLowerCase();
    if (period !== 'today') return res.status(400).json({ message: 'Unsupported performance period. Use period=today.' });
    const branchId = req.query.branchId == null || req.query.branchId === '' ? null : Number(req.query.branchId);
    if (branchId !== null && (!Number.isInteger(branchId) || branchId < 1)) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const { rows: [metrics] } = await query(`
        SELECT
          COUNT(*) FILTER (WHERE received_at >= CURRENT_DATE AND received_at < CURRENT_DATE + INTERVAL '1 day')::int AS orders_received,
          COUNT(*) FILTER (WHERE status='completed' AND completed_at >= CURRENT_DATE AND completed_at < CURRENT_DATE + INTERVAL '1 day')::int AS completed_orders,
          COUNT(*) FILTER (WHERE status='preparing' AND payment_status='paid')::int AS active_orders,
          COUNT(*) FILTER (WHERE payment_status='paid' AND status NOT IN ('preparing','completed','cancelled','awaiting_payment'))::int AS waiting_orders,
          COALESCE(AVG(prep_time_seconds) FILTER (WHERE status='completed' AND completed_at >= CURRENT_DATE AND completed_at < CURRENT_DATE + INTERVAL '1 day' AND prep_time_seconds IS NOT NULL),0) AS average_prep_time_seconds,
          COUNT(*) FILTER (WHERE status='completed' AND completed_at >= CURRENT_DATE AND completed_at < CURRENT_DATE + INTERVAL '1 day' AND was_delayed=false)::int AS on_time_orders,
          COUNT(*) FILTER (WHERE status='completed' AND completed_at >= CURRENT_DATE AND completed_at < CURRENT_DATE + INTERVAL '1 day' AND was_delayed=true)::int AS delayed_orders
        FROM orders
        ${branchId ? 'WHERE branch_id=$1' : ''}
      `, branchId ? [branchId] : []);
      const average = Math.round(Number(metrics.average_prep_time_seconds) || 0);
      const completed = Number(metrics.completed_orders) || 0;
      const onTime = Number(metrics.on_time_orders) || 0;
      res.json({
        period,
        orders_received: Number(metrics.orders_received) || 0,
        completed_orders: completed,
        active_orders: Number(metrics.active_orders) || 0,
        waiting_orders: Number(metrics.waiting_orders) || 0,
        average_prep_time_seconds: average,
        average_prep_time_formatted: formatPrepTime(average),
        on_time_orders: onTime,
        delayed_orders: Number(metrics.delayed_orders) || 0,
        on_time_percentage: completed ? Math.round((onTime / completed) * 100) : 0,
        target_prep_time_seconds: TARGET_PREP_SECONDS,
        target_prep_time_formatted: formatPrepTime(TARGET_PREP_SECONDS)
      });
    } catch (error) {
      console.error('Kitchen performance query failed:', error.message);
      res.status(500).json({ message: 'Unable to load kitchen performance' });
    }
  });
};

module.exports.formatPrepTime = formatPrepTime;
module.exports.TARGET_PREP_SECONDS = TARGET_PREP_SECONDS;
