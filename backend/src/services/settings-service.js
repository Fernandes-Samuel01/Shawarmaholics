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

async function getSettings(query) {
  const { rows } = await query(
    'SELECT setting_key,value,value_type,is_public FROM system_settings ORDER BY category,setting_key'
  );
  return rows.reduce((result, row) => {
    result[row.setting_key] = row.value;
    return result;
  }, { ...DEFAULTS });
}

async function getSetting(query, key) {
  const settings = await getSettings(query);
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : DEFAULTS[key];
}

module.exports = { DEFAULTS, getSettings, getSetting };