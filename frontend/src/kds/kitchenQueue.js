export function recalculateKitchenQueue(orders, maxActive = 2) {
  const relevant = orders.filter(order => !['completed', 'cancelled'].includes(order.status) && order.payment_status !== 'pending')
    .slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id) - Number(b.id));
  return { all: relevant, active: relevant.slice(0, maxActive), upNext: relevant.slice(maxActive, maxActive + 1)[0] || null, waiting: relevant.slice(maxActive + 1) };
}
