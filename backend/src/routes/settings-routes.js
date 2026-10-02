const { DEFAULTS, getSettings } = require('../services/settings-service');

const META = {
  'business.name': ['business','Business Name','The organization name shown across customer-facing experiences.','string',true],
  'business.contact_email': ['business','Contact Email','Primary business contact email.','string',true],
  'business.contact_phone': ['business','Contact Phone','Primary business contact phone.','string',true],
  'business.address': ['business','Business Address','Head Office business address.','string',true],
  'business.currency': ['business','Currency','Currency used for customer-facing prices.','string',true],
  'business.timezone': ['business','Timezone','Organization timezone used for operating dates and times.','string',true],
  'orders.eat_here_enabled': ['orders','Eat Here','Allow customers to place Eat Here orders.','boolean',true],
  'orders.take_parcel_enabled': ['orders','Take Parcel','Allow customers to place Take Parcel orders.','boolean',true],
  'orders.cash_enabled': ['orders','Cash Payment','Allow Cash as a kiosk payment method.','boolean',true],
  'orders.upi_enabled': ['orders','UPI Payment','Allow UPI as a kiosk payment method.','boolean',true],
  'kiosk.enabled': ['kiosk','Kiosk Enabled','Allow the customer kiosk to accept new orders.','boolean',true],
  'kiosk.show_bestseller': ['kiosk','Show Bestseller','Show bestseller labels on the kiosk menu.','boolean',true],
  'kiosk.show_vegetarian': ['kiosk','Show Vegetarian','Show vegetarian labels on the kiosk menu.','boolean',true],
  'kiosk.show_preparation_time': ['kiosk','Show Preparation Time','Show preparation time on the kiosk menu.','boolean',true],
  'kiosk.allow_customizations': ['kiosk','Allow Customizations','Allow customers to select configured menu customizations.','boolean',true],
  'kds.max_active_orders': ['kds','Maximum Active Orders','Maximum number of orders actively prepared at one kitchen location.','number',false],
  'kds.show_preparation_timer': ['kds','Show Preparation Timer','Show preparation timers on KDS screens.','boolean',false],
  'kds.sound_alerts': ['kds','Sound Alerts','Enable KDS sound alerts for new orders.','boolean',false],
  'kds.new_order_alerts': ['kds','New Order Alerts','Enable KDS new-order alerts.','boolean',false],
  'inventory.allow_negative_stock': ['inventory','Allow Negative Stock','Allow inventory balances below zero.','boolean',false],
  'inventory.low_stock_alerts': ['inventory','Low Stock Alerts','Enable low-stock inventory alerts.','boolean',false],
  'inventory.out_of_stock_alerts': ['inventory','Out of Stock Alerts','Enable out-of-stock inventory alerts.','boolean',false],
  'notifications.new_order': ['notifications','New Order Alerts','Enable new-order administrative notifications.','boolean',false],
  'notifications.low_stock': ['notifications','Low Stock Alerts','Enable low-stock administrative notifications.','boolean',false],
  'notifications.out_of_stock': ['notifications','Out of Stock Alerts','Enable out-of-stock administrative notifications.','boolean',false],
  'notifications.kds': ['notifications','KDS Alerts','Enable kitchen operational notifications.','boolean',false]
};

module.exports = function registerSettingsRoutes(app, { query, auth }) {
  app.get('/api/settings/public', async (req, res) => {
    try {
      const settings = await getSettings(query);
      const publicSettings = Object.fromEntries(
        Object.entries(settings).filter(([key]) => META[key]?.[4])
      );
      res.json({ settings: publicSettings });
    } catch (error) {
      console.error('Public settings failed:', error.message);
      res.status(500).json({ message: 'Unable to load settings' });
    }
  });

  app.get('/api/admin/settings', auth(['admin']), async (req, res) => {
    try {
      const { rows } = await query(
        'SELECT setting_key,category,label,description,value,value_type,is_public,updated_at FROM system_settings ORDER BY category,setting_key'
      );
      res.json({ settings: rows });
    } catch (error) {
      console.error('Admin settings failed:', error.message);
      res.status(500).json({ message: 'Unable to load settings' });
    }
  });

  app.patch('/api/admin/settings', auth(['admin']), async (req, res) => {
    const updates = req.body?.settings;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ message: 'Settings object is required' });
    }

    const entries = Object.entries(updates);
    if (!entries.length) return res.status(400).json({ message: 'At least one setting is required' });

    for (const [key, value] of entries) {
      const meta = META[key];
      if (!meta) return res.status(400).json({ message: `Unsupported setting: ${key}` });
      const type = meta[3];
      if (type === 'boolean' && typeof value !== 'boolean') return res.status(400).json({ message: `${key} must be boolean` });
      if (type === 'number' && (!Number.isInteger(value) || value < 1 || value > 20)) return res.status(400).json({ message: `${key} must be an integer between 1 and 20` });
      if (type === 'string' && typeof value !== 'string') return res.status(400).json({ message: `${key} must be text` });
      if (key === 'business.currency' && !/^[A-Z]{3}$/.test(value)) return res.status(400).json({ message: 'Currency must be a 3-letter ISO code' });
      if (key === 'business.timezone' && !value.trim()) return res.status(400).json({ message: 'Timezone is required' });
      if (key === 'business.name' && !value.trim()) return res.status(400).json({ message: 'Business name is required' });
    }

    const client = await query('SELECT 1');
    try {
      for (const [key, value] of entries) {
        await query(
          'UPDATE system_settings SET value=$1::jsonb,updated_at=NOW(),updated_by=$2 WHERE setting_key=$3',
          [JSON.stringify(value), req.user.id, key]
        );
      }
      const settings = await getSettings(query);
      res.json({ message: 'Settings saved successfully', settings });
    } catch (error) {
      console.error('Admin settings update failed:', error.message);
      res.status(500).json({ message: 'Unable to save settings' });
    }
  });
};