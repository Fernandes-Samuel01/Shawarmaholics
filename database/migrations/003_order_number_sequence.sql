-- Keep the database-backed order number generator ahead of all existing orders.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 101;

-- Existing installs already have a UNIQUE order_number constraint from schema.sql.
-- This index is an additional safe guard for databases created from older revisions.
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique_idx ON orders(order_number);

-- nextval() will return one greater than the current maximum order number.
SELECT setval(
  'order_number_seq',
  GREATEST(
    100,
    COALESCE(
      (SELECT MAX((substring(order_number FROM 'A-([0-9]+)'))::bigint)
       FROM orders
       WHERE order_number ~ '^A-[0-9]+$'),
      100
    )
  ),
  true
);
