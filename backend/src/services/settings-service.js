const DEFAULTS = {
  'business.name': 'Shawarmaholics',
  'business.contact_email': '',
  'business.contact_phone': '',
  'business.address': '',
  'business.currency': 'INR',
  'business.timezone': 'Asia/Kolkata',
  'orders.eat_here_enabled': true,
  'orders.take_parcel_enabled': true,
  'orders.cash_enabled': true,
  'orders.upi_enabled': true,
  'kiosk.enabled': true,
  'kiosk.show_bestseller': true,
  'kiosk.show_vegetarian': true,
  'kiosk.show_preparation_time': true,
  'kiosk.allow_customizations': true,
  'kds.max_active_orders': 2,
  'kds.show_preparation_timer': true,
  'kds.sound_alerts': true,
  'kds.new_order_alerts': true,
  'inventory.allow_negative_stock': false,
  'inventory.low_stock_alerts': true,
  'inventory.out_of_stock_alerts': true,
  'notifications.new_order': true,
  'notifications.low_stock': true,
  'notifications.out_of_stock': true,
  'notifications.kds': true
};

function normalizeScope(locationType = 'HEAD_OFFICE', branchId = null) {
  const normalized = String(locationType || 'HEAD_OFFICE').toUpperCase();
  if (normalized === 'HEAD_OFFICE') return { locationType: 'HEAD_OFFICE', branchId: null };
  if (normalized === 'BRANCH') {
    const id = Number(branchId);
    if (!Number.isInteger(id) || id < 1) throw new Error('A valid branch is required');
    return { locationType: 'BRANCH', branchId: id };
  }
  throw new Error('Invalid settings location');
}

async function getSettings(query, locationType = 'HEAD_OFFICE', branchId = null) {
  const scope = normalizeScope(locationType, branchId);
  const { rows } = await query(
    'SELECT setting_key,value,value_type,is_public FROM system_settings WHERE location_type=$1 AND branch_id IS NOT DISTINCT FROM $2 ORDER BY category,setting_key',
    [scope.locationType, scope.branchId]
  );
  return rows.reduce((result, row) => {
    result[row.setting_key] = row.value;
    return result;
  }, { ...DEFAULTS });
}

async function getSetting(query, key, locationType = 'HEAD_OFFICE', branchId = null) {
  const settings = await getSettings(query, locationType, branchId);
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : DEFAULTS[key];
}

module.exports = { DEFAULTS, normalizeScope, getSettings, getSetting };