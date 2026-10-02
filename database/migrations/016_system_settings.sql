-- Head Office global settings foundation.
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  value JSONB NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS system_settings_category_idx
  ON system_settings(category);

INSERT INTO system_settings
  (setting_key, category, label, description, value, value_type, is_public)
VALUES
  ('business.name','business','Business Name','The organization name shown across customer-facing experiences.',to_jsonb('Shawarmaholics'::text),'string',true),
  ('business.contact_email','business','Contact Email','Primary business contact email.',to_jsonb(''::text),'string',true),
  ('business.contact_phone','business','Contact Phone','Primary business contact phone.',to_jsonb(''::text),'string',true),
  ('business.address','business','Business Address','Head Office business address.',to_jsonb(''::text),'string',true),
  ('business.currency','business','Currency','Currency used for customer-facing prices.',to_jsonb('INR'::text),'string',true),
  ('business.timezone','business','Timezone','Organization timezone used for operating dates and times.',to_jsonb('Asia/Kolkata'::text),'string',true),

  ('orders.eat_here_enabled','orders','Eat Here','Allow customers to place Eat Here orders.',to_jsonb(true),'boolean',true),
  ('orders.take_parcel_enabled','orders','Take Parcel','Allow customers to place Take Parcel orders.',to_jsonb(true),'boolean',true),
  ('orders.cash_enabled','orders','Cash Payment','Allow Cash as a kiosk payment method.',to_jsonb(true),'boolean',true),
  ('orders.upi_enabled','orders','UPI Payment','Allow UPI as a kiosk payment method.',to_jsonb(true),'boolean',true),

  ('kiosk.enabled','kiosk','Kiosk Enabled','Allow the customer kiosk to accept new orders.',to_jsonb(true),'boolean',true),
  ('kiosk.show_bestseller','kiosk','Show Bestseller','Show bestseller labels on the kiosk menu.',to_jsonb(true),'boolean',true),
  ('kiosk.show_vegetarian','kiosk','Show Vegetarian','Show vegetarian labels on the kiosk menu.',to_jsonb(true),'boolean',true),
  ('kiosk.show_preparation_time','kiosk','Show Preparation Time','Show preparation time on the kiosk menu.',to_jsonb(true),'boolean',true),
  ('kiosk.allow_customizations','kiosk','Allow Customizations','Allow customers to select configured menu customizations.',to_jsonb(true),'boolean',true),

  ('kds.max_active_orders','kds','Maximum Active Orders','Maximum number of orders actively prepared at one kitchen location.',to_jsonb(2),'number',false),
  ('kds.show_preparation_timer','kds','Show Preparation Timer','Show preparation timers on KDS screens.',to_jsonb(true),'boolean',false),
  ('kds.sound_alerts','kds','Sound Alerts','Enable KDS sound alerts for new orders.',to_jsonb(true),'boolean',false),
  ('kds.new_order_alerts','kds','New Order Alerts','Enable KDS new-order alerts.',to_jsonb(true),'boolean',false),

  ('inventory.allow_negative_stock','inventory','Allow Negative Stock','Allow inventory balances below zero. Keep disabled for controlled stock.',to_jsonb(false),'boolean',false),
  ('inventory.low_stock_alerts','inventory','Low Stock Alerts','Enable low-stock inventory alerts.',to_jsonb(true),'boolean',false),
  ('inventory.out_of_stock_alerts','inventory','Out of Stock Alerts','Enable out-of-stock inventory alerts.',to_jsonb(true),'boolean',false),

  ('notifications.new_order','notifications','New Order Alerts','Enable new-order administrative notifications.',to_jsonb(true),'boolean',false),
  ('notifications.low_stock','notifications','Low Stock Alerts','Enable low-stock administrative notifications.',to_jsonb(true),'boolean',false),
  ('notifications.out_of_stock','notifications','Out of Stock Alerts','Enable out-of-stock administrative notifications.',to_jsonb(true),'boolean',false),
  ('notifications.kds','notifications','KDS Alerts','Enable kitchen operational notifications.',to_jsonb(true),'boolean',false)
ON CONFLICT (setting_key) DO NOTHING;