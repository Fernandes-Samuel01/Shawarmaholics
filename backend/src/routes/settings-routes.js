const { DEFAULTS, normalizeScope, getSettings } = require('../services/settings-service');

const META = {
  'business.name': ['business','Business Name','The organization name shown across customer-facing experiences.','string',true],
  'business.contact_email': ['business','Contact Email','Primary business contact email.','string',true],
  'business.contact_phone': ['business','Contact Phone','Primary business contact phone.','string',true],
  'business.address': ['business','Business Address','Location address used for this operating site.','string',true],
  'business.currency': ['business','Currency','Currency used for customer-facing prices.','string',true],
  'business.timezone': ['business','Timezone','Location timezone used for operating dates and times.','string',true],
  'orders.eat_here_enabled': ['orders','Eat Here','Allow customers to place Eat Here orders at this location.','boolean',true],
  'orders.take_parcel_enabled': ['orders','Take Parcel','Allow customers to place Take Parcel orders at this location.','boolean',true],
  'orders.cash_enabled': ['orders','Cash Payment','Allow Cash as a kiosk payment method at this location.','boolean',true],
  'orders.upi_enabled': ['orders','UPI Payment','Allow UPI as a kiosk payment method at this location.','boolean',true],
  'kiosk.enabled': ['kiosk','Kiosk Enabled','Allow this customer kiosk to accept new orders.','boolean',true],
  'kiosk.show_bestseller': ['kiosk','Show Bestseller','Show bestseller labels on this location kiosk.','boolean',true],
  'kiosk.show_vegetarian': ['kiosk','Show Vegetarian','Show vegetarian labels on this location kiosk.','boolean',true],
  'kiosk.show_preparation_time': ['kiosk','Show Preparation Time','Show preparation time on this location kiosk.','boolean',true],
  'kiosk.allow_customizations': ['kiosk','Allow Customizations','Allow customers to select configured menu customizations at this location.','boolean',true],
  'kds.max_active_orders': ['kds','Maximum Active Orders','Maximum number of orders actively prepared at this kitchen location.','number',true],
  'kds.show_preparation_timer': ['kds','Show Preparation Timer','Show preparation timers on this location KDS.','boolean',true],
  'kds.sound_alerts': ['kds','Sound Alerts','Enable sound alerts on this location KDS.','boolean',true],
  'kds.new_order_alerts': ['kds','New Order Alerts','Enable new-order alerts on this location KDS.','boolean',true],
  'inventory.allow_negative_stock': ['inventory','Allow Negative Stock','Allow inventory balances below zero at this location.','boolean',false],
  'inventory.low_stock_alerts': ['inventory','Low Stock Alerts','Enable low-stock inventory alerts for this location.','boolean',true],
  'inventory.out_of_stock_alerts': ['inventory','Out of Stock Alerts','Enable out-of-stock inventory alerts for this location.','boolean',true],
  'notifications.new_order': ['notifications','New Order Alerts','Enable new-order administrative notifications for this location.','boolean',false],
  'notifications.low_stock': ['notifications','Low Stock Alerts','Enable low-stock administrative notifications for this location.','boolean',false],
  'notifications.out_of_stock': ['notifications','Out of Stock Alerts','Enable out-of-stock administrative notifications for this location.','boolean',false],
  'notifications.kds': ['notifications','KDS Alerts','Enable kitchen operational notifications for this location.','boolean',false]
};

async function resolveScope(query, req) {
  try {
    const scope = normalizeScope(req.query.locationType || 'HEAD_OFFICE', req.query.branchId || null);
    if (scope.locationType === 'BRANCH') {
      const { rows } = await query('SELECT id,name,is_active FROM branches WHERE id=$1', [scope.branchId]);
      if (!rows[0]) return { error: { status: 404, message: 'Branch not found' } };
      return { scope, branch: rows[0] };
    }
    return { scope, branch: null };
  } catch (error) {
    return { error: { status: 400, message: error.message } };
  }
}

module.exports = function registerSettingsRoutes(app, { query, db, auth, io, kdsIo }) {
  app.get('/api/settings/public', async (req, res) => {
    const resolved = await resolveScope(query, req);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    try {
      const settings = await getSettings(query, resolved.scope.locationType, resolved.scope.branchId);
      const publicSettings = Object.fromEntries(
        Object.entries(settings).filter(([key]) => META[key]?.[4] && key !== 'business.contact_email' && key !== 'business.contact_phone' && key !== 'business.address')
      );
      res.json({ settings: publicSettings, locationType: resolved.scope.locationType, branchId: resolved.scope.branchId, branch: resolved.branch });
    } catch (error) {
      console.error('Public settings failed:', error.message);
      res.status(500).json({ message: 'Unable to load settings' });
    }
  });

  app.get('/api/admin/settings', auth(['admin']), async (req, res) => {
    const resolved = await resolveScope(query, req);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    try {
      const { rows } = await query(
        'SELECT setting_key,category,label,description,value,value_type,is_public,location_type,branch_id,updated_at FROM system_settings WHERE location_type=$1 AND branch_id IS NOT DISTINCT FROM $2 ORDER BY category,setting_key',
        [resolved.scope.locationType, resolved.scope.branchId]
      );
      res.json({ settings: rows, locationType: resolved.scope.locationType, branchId: resolved.scope.branchId, branch: resolved.branch });
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

    const resolved = await resolveScope(query, req);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });

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

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        const result = await client.query(
          'UPDATE system_settings SET value=$1::jsonb,updated_at=NOW(),updated_by=$2 WHERE setting_key=$3 AND location_type=$4 AND branch_id IS NOT DISTINCT FROM $5',
          [JSON.stringify(value), req.user.id, key, resolved.scope.locationType, resolved.scope.branchId]
        );
        if (!result.rowCount) throw new Error(`Setting is not configured for this location: ${key}`);
      }
      await client.query('COMMIT');
      const settings = await getSettings(query, resolved.scope.locationType, resolved.scope.branchId);
      if (io) {
        const publicSettings = Object.fromEntries(
          Object.entries(settings).filter(([key]) => META[key]?.[4] && key !== 'business.contact_email' && key !== 'business.contact_phone' && key !== 'business.address')
        );
        io.emit('settings:updated', {
          settings: publicSettings,
          locationType: resolved.scope.locationType,
          branchId: resolved.scope.branchId,
          branch: resolved.branch
        });
        if (kdsIo) kdsIo.emit('settings:updated', { settings: publicSettings, locationType: resolved.scope.locationType, branchId: resolved.scope.branchId, branch: resolved.branch });
      }
      res.json({ message: 'Settings saved successfully', settings, locationType: resolved.scope.locationType, branchId: resolved.scope.branchId, branch: resolved.branch });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('Admin settings update failed:', error.message);
      res.status(500).json({ message: 'Unable to save settings' });
    } finally {
      client.release();
    }
  });
};