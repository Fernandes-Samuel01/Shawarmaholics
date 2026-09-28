export const ALERT_TTL = { newOrder: 6500, lowStock: 7500, outOfStock: 12000, delayed: 12000 };
const STORAGE_KEY = 'kds-alert-ledger-v1';

export function alertKey(type, id) { return `${type}:${id}`; }
export function loadAlertLedger() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { return new Set(); }
}
export function rememberAlert(ledger, key) {
  if (ledger.has(key)) return false;
  ledger.add(key);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ledger].slice(-500))); } catch { }
  return true;
}
export function elapsedSeconds(order, now = Date.now()) {
  const started = order.activated_at || order.preparation_started_at;
  return started ? Math.max(0, Math.floor((now - new Date(started).getTime()) / 1000)) : 0;
}
export function targetSeconds(order) { return Number(order.target_prep_seconds) || 480; }
export function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
