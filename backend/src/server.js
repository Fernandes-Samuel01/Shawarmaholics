require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || '*' } });
const db = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(cors());
app.use(express.json());
const query = (text, params = []) => db.query(text, params);
require('./kitchen-routes')(app, query, io);
require('./kitchen-performance')(app, query);
require('./routes/staff-attendance-routes')(app, { query, db });
const auth = (roles = []) => (req, res, next) => {
  try {
    const user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ message: 'Not authorized' });
    req.user = user; next();
  } catch (e) { res.status(401).json({ message: 'Authentication required' }); }
};
require('./routes/branch-pricing-routes')(app, { query, db, auth });

const orderQuery = `SELECT o.*,COALESCE(json_agg(json_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'customizations',oi.customizations)) FILTER(WHERE oi.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id`;
const kitchenOrderQuery = condition => `${orderQuery} WHERE ${condition} GROUP BY o.id ORDER BY o.created_at ASC,o.id ASC`;
const completedOrderQuery = `SELECT o.id,o.status,o.order_type,o.received_at,o.activated_at,o.completed_at,o.prep_time_seconds,o.target_prep_seconds,o.was_delayed,COALESCE(json_agg(json_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'customizations',oi.customizations)) FILTER(WHERE oi.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id`;

function queueSnapshot(orders, maxActive = 2) {
  const eligible = orders.filter(order => order.payment_status === 'paid' && !['completed', 'cancelled'].includes(order.status))
    .slice().sort((a, b) => new Date(a.received_at || a.created_at) - new Date(b.received_at || b.created_at) || Number(a.id) - Number(b.id));
  return { active: eligible.slice(0, maxActive), upNext: eligible.slice(maxActive, maxActive + 1)[0] || null, waiting: eligible.slice(maxActive + 1) };
}
async function activateQueueOrders(queue) {
  const pending = queue.active.filter(order => order.status !== 'preparing');
  if (!pending.length) return [];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const activated = [];
    for (const order of pending) {
      const { rows } = await client.query("UPDATE orders SET status='preparing',activated_at=COALESCE(activated_at,NOW()),preparation_started_at=COALESCE(preparation_started_at,NOW()) WHERE id=$1 AND payment_status='paid' AND status NOT IN('preparing','completed','cancelled') RETURNING *", [order.id]);
      if (rows[0]) activated.push(rows[0]);
    }
    await client.query('COMMIT');
    activated.forEach(order => { io.emit('order:activated', order); io.emit('order:updated', order) });
    return activated;
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
async function getKitchenQueue() {
  let { rows } = await query(kitchenOrderQuery("o.payment_status='paid' AND o.status NOT IN('completed','cancelled')"));
  let queue = queueSnapshot(rows);
  if ((await activateQueueOrders(queue)).length) {
    ({ rows } = await query(kitchenOrderQuery("o.payment_status='paid' AND o.status NOT IN('completed','cancelled')")));
    queue = queueSnapshot(rows);
  }
  return { orders: rows, queue };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/auth/login', async (req, res) => { try { const { rows } = await query('SELECT u.*,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE email=$1', [req.body.email]); if (!rows[0] || !await bcrypt.compare(req.body.password, rows[0].password_hash)) return res.status(401).json({ message: 'Invalid credentials' }); const user = rows[0]; res.json({ token: jwt.sign({ id: user.id, role: user.role, branch_id: user.branch_id || null }, process.env.JWT_SECRET, { expiresIn: '8h' }), user: { id: user.id, name: user.name, role: user.role, branch_id: user.branch_id || null } }) } catch (e) { res.status(500).json({ message: e.message }) } });
app.get('/api/branches', async (req, res) => { try { const { rows } = await query('SELECT id,code,name,type,address,city,state,country,postal_code,timezone,is_active FROM branches WHERE is_active=true ORDER BY name ASC'); res.json({ branches: rows }) } catch (e) { res.status(500).json({ message: 'Unable to load branches' }) } });
app.get('/api/branches/:id', async (req, res) => { try { const branchId = Number(req.params.id); if (!Number.isInteger(branchId) || branchId < 1) return res.status(404).json({ message: 'Branch not found' }); const { rows } = await query('SELECT id,code,name,type,address,city,state,country,postal_code,timezone,is_active FROM branches WHERE id=$1', [branchId]); if (!rows[0]) return res.status(404).json({ message: 'Branch not found' }); res.json({ branch: rows[0] }) } catch (e) { res.status(500).json({ message: 'Unable to load branch' }) } });
app.get('/api/admin/menu/categories', async (req, res) => { try { const { rows } = await query('SELECT mc.id,mc.name,mc.position,mc.is_active,COUNT(mi.id)::int menu_item_count FROM menu_categories mc LEFT JOIN menu_items mi ON mi.category_id=mc.id GROUP BY mc.id ORDER BY mc.position ASC NULLS LAST,mc.id ASC'); res.json({ categories: rows }) } catch (e) { res.status(500).json({ message: 'Unable to load menu categories' }) } });
app.get('/api/admin/menu/items', async (req, res) => { try { const { rows } = await query("SELECT mi.id,mi.name,mi.description,mi.category_id,mc.name category_name,mc.is_active category_is_active,mi.is_active,mi.price,mi.image_url,mi.available,mi.bestseller,mi.vegetarian,mi.preparation_minutes,mi.created_at,mc.position category_position FROM menu_items mi LEFT JOIN menu_categories mc ON mc.id=mi.category_id ORDER BY mc.position ASC NULLS LAST,mi.name ASC,mi.id ASC"); res.json({ items: rows }) } catch (e) { res.status(500).json({ message: 'Unable to load master menu items' }) } });
app.post('/api/admin/menu/items', async (req, res) => {
  const body = req.body || {};
  const rawName = body.name;
  const categoryId = Number(body.category_id);
  const price = typeof body.price === 'string' && body.price.trim() === '' ? NaN : Number(body.price);
  const preparationMinutes = Number(body.preparation_minutes);
  if (typeof rawName !== 'string' || !rawName.trim()) return res.status(400).json({ message: 'Item name is required' });
  if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'A valid category is required' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Master price must be a non-negative number' });
  if (!Number.isInteger(preparationMinutes) || preparationMinutes < 0) return res.status(400).json({ message: 'Preparation time must be a non-negative integer' });
  if (body.description != null && typeof body.description !== 'string') return res.status(400).json({ message: 'Description must be text' });
  if (body.image_url != null && typeof body.image_url !== 'string') return res.status(400).json({ message: 'Image URL must be text' });
  if (typeof body.available !== 'boolean' || typeof body.bestseller !== 'boolean' || typeof body.vegetarian !== 'boolean') return res.status(400).json({ message: 'Availability, bestseller, and vegetarian must be boolean values' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [category] } = await client.query('SELECT id FROM menu_categories WHERE id=$1 AND is_active=true FOR UPDATE', [categoryId]);
    if (!category) { const { rows: exists } = await client.query('SELECT id FROM menu_categories WHERE id=$1', [categoryId]); await client.query('ROLLBACK'); return res.status(exists[0] ? 400 : 404).json({ message: exists[0] ? 'Cannot create a menu item under an archived category' : 'Category not found' }) }
    const { rows: [created] } = await client.query('INSERT INTO menu_items(category_id,name,description,price,image_url,available,bestseller,vegetarian,preparation_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [categoryId, rawName.trim(), body.description == null || !body.description.trim() ? null : body.description.trim(), price, body.image_url == null || !body.image_url.trim() ? null : body.image_url.trim(), body.available, body.bestseller, body.vegetarian, preparationMinutes]);
    const { rows: [item] } = await client.query("SELECT mi.id,mi.name,mi.description,mi.category_id,mc.name category_name,mc.is_active category_is_active,mi.is_active,mi.price,mi.image_url,mi.available,mi.bestseller,mi.vegetarian,mi.preparation_minutes,mi.created_at,mc.position category_position FROM menu_items mi LEFT JOIN menu_categories mc ON mc.id=mi.category_id WHERE mi.id=$1", [created.id]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Menu item created successfully', item });
  } catch (e) { try { await client.query('ROLLBACK') } catch { }; res.status(500).json({ message: 'Unable to create master menu item' }) } finally { client.release() }
});
app.patch('/api/admin/menu/items/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  const body = req.body || {};
  const allowed = ['name', 'description', 'category_id', 'price', 'image_url', 'available', 'bestseller', 'vegetarian', 'preparation_minutes'];
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  if (unknown.length) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (!Object.keys(body).length) return res.status(400).json({ message: 'At least one menu item field is required' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT * FROM menu_items WHERE id=$1 FOR UPDATE', [itemId]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }) }
    const updates = {}, has = key => Object.prototype.hasOwnProperty.call(body, key);
    if (has('name')) { if (typeof body.name !== 'string' || !body.name.trim()) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Item name cannot be empty' }) } updates.name = body.name.trim() }
    if (has('description')) { if (body.description != null && typeof body.description !== 'string') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Description must be text' }) } updates.description = body.description == null || !body.description.trim() ? null : body.description.trim() }
    if (has('image_url')) { if (body.image_url != null && typeof body.image_url !== 'string') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Image URL must be text' }) } updates.image_url = body.image_url == null || !body.image_url.trim() ? null : body.image_url.trim() }
    if (has('price')) { const value = typeof body.price === 'string' && body.price.trim() === '' ? NaN : Number(body.price); if (!Number.isFinite(value) || value < 0) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Master price must be a non-negative number' }) } updates.price = value }
    if (has('preparation_minutes')) { const value = Number(body.preparation_minutes); if (!Number.isInteger(value) || value < 0) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Preparation time must be a non-negative integer' }) } updates.preparation_minutes = value }
    for (const field of ['available', 'bestseller', 'vegetarian']) if (has(field)) { if (typeof body[field] !== 'boolean') { await client.query('ROLLBACK'); return res.status(400).json({ message: `${field} must be a boolean value` }) } updates[field] = body[field] }
    if (has('category_id')) {
      const categoryId = Number(body.category_id);
      if (!Number.isInteger(categoryId) || categoryId < 1) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'A valid category is required' }) }
      if (categoryId !== existing.category_id) { const { rows: [category] } = await client.query('SELECT id FROM menu_categories WHERE id=$1 AND is_active=true', [categoryId]); if (!category) { const { rows: exists } = await client.query('SELECT id FROM menu_categories WHERE id=$1', [categoryId]); await client.query('ROLLBACK'); return res.status(exists[0] ? 400 : 404).json({ message: exists[0] ? 'Cannot move a menu item into an archived category' : 'Category not found' }) } }
      updates.category_id = categoryId;
    }
    const columns = Object.keys(updates); const values = columns.map(column => updates[column]); const assignments = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
    const { rows: [updated] } = await client.query(`UPDATE menu_items SET ${assignments} WHERE id=$${values.length + 1} RETURNING id`, [...values, itemId]);
    const { rows: [item] } = await client.query("SELECT mi.id,mi.name,mi.description,mi.category_id,mc.name category_name,mc.is_active category_is_active,mi.is_active,mi.price,mi.image_url,mi.available,mi.bestseller,mi.vegetarian,mi.preparation_minutes,mi.created_at,mc.position category_position FROM menu_items mi LEFT JOIN menu_categories mc ON mc.id=mi.category_id WHERE mi.id=$1", [updated.id]);
    await client.query('COMMIT');
    res.json({ message: 'Menu item updated successfully', item });
  } catch (e) { try { await client.query('ROLLBACK') } catch { }; res.status(500).json({ message: 'Unable to update master menu item' }) } finally { client.release() }
});
app.patch('/api/admin/menu/items/:id/status', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({ message: 'is_active must be a boolean' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [updated] } = await client.query('UPDATE menu_items SET is_active=$1 WHERE id=$2 RETURNING id', [req.body.is_active, itemId]);
    if (!updated) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }) }
    const { rows: [item] } = await client.query("SELECT mi.id,mi.name,mi.description,mi.category_id,mc.name category_name,mc.is_active category_is_active,mi.is_active,mi.price,mi.image_url,mi.available,mi.bestseller,mi.vegetarian,mi.preparation_minutes,mi.created_at,mc.position category_position FROM menu_items mi LEFT JOIN menu_categories mc ON mc.id=mi.category_id WHERE mi.id=$1", [itemId]);
    await client.query('COMMIT');
    res.json({ message: req.body.is_active ? 'Menu item activated successfully' : 'Menu item archived successfully', item });
  } catch (e) { try { await client.query('ROLLBACK') } catch { }; res.status(500).json({ message: 'Unable to update menu item status' }) } finally { client.release() }
});
app.get('/api/admin/menu/items/:itemId/customization-groups', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  try {
    const { rows: [item] } = await query('SELECT id FROM menu_items WHERE id=$1', [itemId]);
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    const { rows } = await query('SELECT micg.group_id,mcg.name group_name,mcg.code group_code,mcg.group_type,mcg.is_active group_is_active,micg.is_required,micg.min_selections,micg.max_selections,micg.position FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=$1 ORDER BY micg.position ASC,micg.group_id ASC', [itemId]);
    res.json({ groups: rows });
  } catch (e) { res.status(500).json({ message: 'Unable to load menu item customization groups' }) }
});
app.get('/api/admin/menu/items/:itemId/customization-groups/available', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  try {
    const { rows: [item] } = await query('SELECT id FROM menu_items WHERE id=$1', [itemId]);
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    const { rows } = await query('SELECT mcg.id,mcg.name,mcg.code,mcg.group_type,mcg.position,mcg.is_active FROM menu_customization_groups mcg WHERE mcg.is_active=true AND NOT EXISTS(SELECT 1 FROM menu_item_customization_groups micg WHERE micg.menu_item_id=$1 AND micg.group_id=mcg.id) ORDER BY mcg.position ASC,mcg.id ASC', [itemId]);
    res.json({ groups: rows });
  } catch (e) { res.status(500).json({ message: 'Unable to load available customization groups' }) }
});
app.post('/api/admin/menu/items/:itemId/customization-groups', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  const body = req.body || {};
  const allowed = ['group_id', 'is_required', 'min_selections', 'max_selections'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  const groupId = body.group_id;
  const minSelections = body.min_selections;
  const maxSelections = body.max_selections;
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'A valid customization group is required' });
  if (typeof body.is_required !== 'boolean') return res.status(400).json({ message: 'is_required must be a boolean' });
  if (!Number.isInteger(minSelections) || minSelections < 0) return res.status(400).json({ message: 'Minimum selections must be a non-negative integer' });
  if (!Number.isInteger(maxSelections) || maxSelections < 0) return res.status(400).json({ message: 'Maximum selections must be a non-negative integer' });
  if (maxSelections < minSelections) return res.status(400).json({ message: 'Maximum selections must be greater than or equal to minimum selections' });
  if (body.is_required && minSelections < 1) return res.status(400).json({ message: 'Required customization groups must have at least one minimum selection' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [item] } = await client.query('SELECT id,is_active FROM menu_items WHERE id=$1 FOR UPDATE', [itemId]);
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }) }
    if (!item.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Cannot assign customization groups to an archived menu item' }) }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_item_customization_groups_position:'||$1::text))", [itemId]);
    const { rows: [group] } = await client.query('SELECT id,is_active FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    if (!group.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Cannot assign an archived customization group' }) }
    const { rows: [existing] } = await client.query('SELECT group_id FROM menu_item_customization_groups WHERE menu_item_id=$1 AND group_id=$2', [itemId, groupId]);
    if (existing) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'This customization group is already assigned to the menu item' }) }
    const { rows: [created] } = await client.query('INSERT INTO menu_item_customization_groups(menu_item_id,group_id,is_required,min_selections,max_selections,position) VALUES($1,$2,$3,$4,$5,COALESCE((SELECT MAX(position) FROM menu_item_customization_groups WHERE menu_item_id=$1),0)+1) RETURNING group_id', [itemId, groupId, body.is_required, minSelections, maxSelections]);
    const { rows: [assignment] } = await client.query('SELECT micg.group_id,mcg.name group_name,mcg.code group_code,mcg.group_type,mcg.is_active group_is_active,micg.is_required,micg.min_selections,micg.max_selections,micg.position FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=$1 AND micg.group_id=$2', [itemId, created.group_id]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Customization group assigned successfully', assignment });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'This customization group is already assigned to the menu item' });
    res.status(500).json({ message: 'Unable to assign customization group' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/items/:itemId/customization-groups/reorder', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });

  const groupIds = req.body?.group_ids;
  if (!Array.isArray(groupIds) || !groupIds.length) return res.status(400).json({ message: 'group_ids must be a non-empty array' });
  if (groupIds.some(groupId => !Number.isInteger(groupId) || groupId < 1)) return res.status(400).json({ message: 'group_ids must contain valid customization group IDs' });
  if (new Set(groupIds).size !== groupIds.length) return res.status(400).json({ message: 'group_ids must not contain duplicates' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [item] } = await client.query('SELECT id FROM menu_items WHERE id=$1 FOR UPDATE', [itemId]);
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Menu item not found' });
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_item_customization_groups_position:'||$1::text))", [itemId]);

    const { rows: assignments } = await client.query(
      'SELECT group_id FROM menu_item_customization_groups WHERE menu_item_id=$1 ORDER BY position ASC,group_id ASC',
      [itemId]
    );

    if (assignments.length !== groupIds.length || assignments.some((assignment, index) => assignment.group_id !== groupIds[index])) {
      const assignedIds = assignments.map(assignment => assignment.group_id).sort((a, b) => a - b);
      const requestedIds = [...groupIds].sort((a, b) => a - b);
      if (assignedIds.length !== requestedIds.length || assignedIds.some((groupId, index) => groupId !== requestedIds[index])) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'group_ids must contain exactly the customization groups assigned to this menu item' });
      }
    }

    for (let index = 0; index < groupIds.length; index += 1) {
      await client.query(
        'UPDATE menu_item_customization_groups SET position=$1 WHERE menu_item_id=$2 AND group_id=$3',
        [index + 1, itemId, groupIds[index]]
      );
    }

    const { rows: reorderedGroups } = await client.query(
      'SELECT micg.group_id,mcg.name group_name,mcg.code group_code,mcg.group_type,mcg.is_active group_is_active,micg.is_required,micg.min_selections,micg.max_selections,micg.position FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=$1 ORDER BY micg.position ASC,micg.group_id ASC',
      [itemId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Customization group order updated successfully', groups: reorderedGroups });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to reorder customization groups' });
  } finally {
    client.release();
  }
});
app.patch('/api/admin/menu/items/:itemId/customization-groups/:groupId', async (req, res) => {
  const itemId = Number(req.params.itemId), groupId = Number(req.params.groupId);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  const body = req.body || {};
  const allowed = ['is_required', 'min_selections', 'max_selections'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (!Object.keys(body).length) return res.status(400).json({ message: 'At least one assignment field is required' });
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const updates = {};
  if (has('is_required')) {
    if (typeof body.is_required !== 'boolean') return res.status(400).json({ message: 'is_required must be a boolean' });
    updates.is_required = body.is_required;
  }
  if (has('min_selections')) {
    if (!Number.isInteger(body.min_selections) || body.min_selections < 0) return res.status(400).json({ message: 'Minimum selections must be a non-negative integer' });
    updates.min_selections = body.min_selections;
  }
  if (has('max_selections')) {
    if (!Number.isInteger(body.max_selections) || body.max_selections < 0) return res.status(400).json({ message: 'Maximum selections must be a non-negative integer' });
    updates.max_selections = body.max_selections;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [item] } = await client.query('SELECT id FROM menu_items WHERE id=$1 FOR UPDATE', [itemId]);
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Menu item not found' }) }
    const { rows: [group] } = await client.query('SELECT id FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    const { rows: [existing] } = await client.query('SELECT is_required,min_selections,max_selections FROM menu_item_customization_groups WHERE menu_item_id=$1 AND group_id=$2 FOR UPDATE', [itemId, groupId]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group is not assigned to this menu item' }) }
    const finalState = { ...existing, ...updates };
    if (finalState.max_selections < finalState.min_selections) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Maximum selections must be greater than or equal to minimum selections' }) }
    if (finalState.is_required && finalState.min_selections < 1) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Required customization groups must have at least one minimum selection' }) }
    const columns = Object.keys(updates), values = columns.map(column => updates[column]);
    const assignments = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
    await client.query(`UPDATE menu_item_customization_groups SET ${assignments} WHERE menu_item_id=$${values.length + 1} AND group_id=$${values.length + 2}`, [...values, itemId, groupId]);
    const { rows: [assignment] } = await client.query('SELECT micg.group_id,mcg.name group_name,mcg.code group_code,mcg.group_type,mcg.is_active group_is_active,micg.is_required,micg.min_selections,micg.max_selections,micg.position FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=$1 AND micg.group_id=$2', [itemId, groupId]);
    await client.query('COMMIT');
    res.json({ message: 'Customization group assignment updated successfully', assignment });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to update customization group assignment' });
  } finally { client.release() }
});
app.delete('/api/admin/menu/items/:itemId/customization-groups/:groupId', async (req, res) => {
  const itemId = Number(req.params.itemId), groupId = Number(req.params.groupId);

  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid menu item ID' });
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows: [item] } = await client.query('SELECT id FROM menu_items WHERE id=$1 FOR UPDATE', [itemId]);

    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Menu item not found' });
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_item_customization_groups_position:'||$1::text))", [itemId]);

    const { rows: [assignment] } = await client.query(
      'DELETE FROM menu_item_customization_groups WHERE menu_item_id=$1 AND group_id=$2 RETURNING group_id',
      [itemId, groupId]
    );

    if (!assignment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Customization group is not assigned to this menu item' });
    }

    await client.query('COMMIT');

    res.json({ message: 'Customization group unassigned successfully' });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to unassign customization group' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/menu/customization-groups', async (req, res) => { try { const { rows } = await query('SELECT id,name,code,group_type,position,is_active,created_at,updated_at FROM menu_customization_groups ORDER BY position ASC,id ASC'); res.json({ groups: rows }) } catch (e) { res.status(500).json({ message: 'Unable to load customization groups' }) } });
app.post('/api/admin/menu/customization-groups', async (req, res) => {
  const body = req.body || {};
  const allowed = ['name', 'code', 'group_type'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (typeof body.name !== 'string') return res.status(400).json({ message: 'Group name is required' });
  if (typeof body.code !== 'string') return res.status(400).json({ message: 'Group code is required' });
  if (typeof body.group_type !== 'string') return res.status(400).json({ message: 'Group type is required' });
  const name = body.name.trim();
  const code = body.code.trim().toUpperCase();
  const groupType = body.group_type.trim().toUpperCase();
  if (!name) return res.status(400).json({ message: 'Group name cannot be empty' });
  if (!code) return res.status(400).json({ message: 'Group code cannot be empty' });
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return res.status(400).json({ message: 'Group code may contain only letters, numbers, hyphens, and underscores' });
  if (!['SAUCE', 'EXTRA', 'ADD_ON'].includes(groupType)) return res.status(400).json({ message: 'Group type must be SAUCE, EXTRA, or ADD_ON' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_customization_groups_position'))");
    const { rows: duplicate } = await client.query('SELECT id FROM menu_customization_groups WHERE lower(name)=lower($1) OR lower(code)=lower($2) LIMIT 1', [name, code]);
    if (duplicate[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A customization group with this name or code already exists' }) }
    const { rows: [group] } = await client.query("INSERT INTO menu_customization_groups(name,code,group_type,position,is_active) VALUES($1,$2,$3,COALESCE((SELECT MAX(position) FROM menu_customization_groups),0)+1,TRUE) RETURNING id,name,code,group_type,position,is_active,created_at,updated_at", [name, code, groupType]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Customization group created successfully', group });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'A customization group with this name or code already exists' });
    res.status(500).json({ message: 'Unable to create customization group' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/customization-groups/:id', async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  const body = req.body || {};
  const allowed = ['name', 'code'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (!Object.keys(body).length) return res.status(400).json({ message: 'At least one customization group field is required' });
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const updates = {};
  if (has('name')) {
    if (typeof body.name !== 'string') return res.status(400).json({ message: 'Group name is required' });
    const name = body.name.trim();
    if (!name) return res.status(400).json({ message: 'Group name cannot be empty' });
    updates.name = name;
  }
  if (has('code')) {
    if (typeof body.code !== 'string') return res.status(400).json({ message: 'Group code is required' });
    const code = body.code.trim().toUpperCase();
    if (!code) return res.status(400).json({ message: 'Group code cannot be empty' });
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return res.status(400).json({ message: 'Group code may contain only letters, numbers, hyphens, and underscores' });
    updates.code = code;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT id FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    const duplicateChecks = [], duplicateValues = [];
    if (updates.name) { duplicateValues.push(updates.name); duplicateChecks.push(`lower(name)=lower($${duplicateValues.length})`) }
    if (updates.code) { duplicateValues.push(updates.code); duplicateChecks.push(`lower(code)=lower($${duplicateValues.length})`) }
    const { rows: duplicate } = await client.query(`SELECT id FROM menu_customization_groups WHERE id<>$${duplicateValues.length + 1} AND (${duplicateChecks.join(' OR ')}) LIMIT 1`, [...duplicateValues, groupId]);
    if (duplicate[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A customization group with this name or code already exists' }) }
    const columns = Object.keys(updates); const values = columns.map(column => updates[column]);
    const assignments = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
    const { rows: [group] } = await client.query(`UPDATE menu_customization_groups SET ${assignments},updated_at=NOW() WHERE id=$${values.length + 1} RETURNING id,name,code,group_type,position,is_active,created_at,updated_at`, [...values, groupId]);
    await client.query('COMMIT');
    res.json({ message: 'Customization group updated successfully', group });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'A customization group with this name or code already exists' });
    res.status(500).json({ message: 'Unable to update customization group' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/customization-groups/:id/status', async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({ message: 'is_active must be a boolean' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [group] } = await client.query('UPDATE menu_customization_groups SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,code,group_type,position,is_active,created_at,updated_at', [req.body.is_active, groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    await client.query('COMMIT');
    res.json({ message: req.body.is_active ? 'Customization group activated successfully' : 'Customization group archived successfully', group });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to update customization group status' });
  } finally { client.release() }
});
app.get('/api/admin/menu/customization-groups/:groupId/options', async (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  try {
    const { rows: [group] } = await query('SELECT id FROM menu_customization_groups WHERE id=$1', [groupId]);
    if (!group) return res.status(404).json({ message: 'Customization group not found' });
    const { rows } = await query('SELECT id,group_id,name,price,position,is_active,created_at,updated_at FROM menu_customization_options WHERE group_id=$1 ORDER BY position ASC,id ASC', [groupId]);
    res.json({ options: rows });
  } catch (e) { res.status(500).json({ message: 'Unable to load customization options' }) }
});
app.post('/api/admin/menu/customization-groups/:groupId/options', async (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  const body = req.body || {};
  const allowed = ['name', 'price'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (typeof body.name !== 'string') return res.status(400).json({ message: 'Option name is required' });
  const name = body.name.trim();
  const price = typeof body.price === 'string' && body.price.trim() === '' ? NaN : Number(body.price);
  if (!name) return res.status(400).json({ message: 'Option name cannot be empty' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Option price must be a non-negative number' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [group] } = await client.query('SELECT id,is_active FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    if (!group.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Cannot create an option under an archived customization group' }) }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_customization_options_position:'||$1::text))", [groupId]);
    const { rows: duplicate } = await client.query('SELECT id FROM menu_customization_options WHERE group_id=$1 AND lower(name)=lower($2) LIMIT 1', [groupId, name]);
    if (duplicate[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'An option with this name already exists in this customization group' }) }
    const { rows: [option] } = await client.query("INSERT INTO menu_customization_options(group_id,name,price,position,is_active) VALUES($1,$2,$3,COALESCE((SELECT MAX(position) FROM menu_customization_options WHERE group_id=$1),0)+1,TRUE) RETURNING id,group_id,name,price,position,is_active,created_at,updated_at", [groupId, name, price]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Customization option created successfully', option });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'An option with this name already exists in this customization group' });
    res.status(500).json({ message: 'Unable to create customization option' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/customization-groups/:groupId/options/:optionId', async (req, res) => {
  const groupId = Number(req.params.groupId), optionId = Number(req.params.optionId);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  if (!Number.isInteger(optionId) || optionId < 1) return res.status(400).json({ message: 'Invalid customization option ID' });
  const body = req.body || {};
  const allowed = ['name', 'price'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Request contains unsupported fields' });
  if (!Object.keys(body).length) return res.status(400).json({ message: 'At least one customization option field is required' });
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const updates = {};
  if (has('name')) {
    if (typeof body.name !== 'string') return res.status(400).json({ message: 'Option name is required' });
    const name = body.name.trim();
    if (!name) return res.status(400).json({ message: 'Option name cannot be empty' });
    updates.name = name;
  }
  if (has('price')) {
    const price = typeof body.price === 'string' && body.price.trim() === '' ? NaN : Number(body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Option price must be a non-negative number' });
    updates.price = price;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [group] } = await client.query('SELECT id FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    const { rows: [existing] } = await client.query('SELECT id FROM menu_customization_options WHERE id=$1 AND group_id=$2 FOR UPDATE', [optionId, groupId]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization option not found for this group' }) }
    if (updates.name) {
      const { rows: [duplicate] } = await client.query('SELECT id FROM menu_customization_options WHERE group_id=$1 AND lower(name)=lower($2) AND id<>$3 LIMIT 1', [groupId, updates.name, optionId]);
      if (duplicate) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'An option with this name already exists in this customization group' }) }
    }
    const columns = Object.keys(updates), values = columns.map(column => updates[column]);
    const assignments = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
    const { rows: [option] } = await client.query(`UPDATE menu_customization_options SET ${assignments},updated_at=NOW() WHERE id=$${values.length + 1} AND group_id=$${values.length + 2} RETURNING id,group_id,name,price,position,is_active,created_at,updated_at`, [...values, optionId, groupId]);
    await client.query('COMMIT');
    res.json({ message: 'Customization option updated successfully', option });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'An option with this name already exists in this customization group' });
    res.status(500).json({ message: 'Unable to update customization option' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/customization-groups/:groupId/options/:optionId/status', async (req, res) => {
  const groupId = Number(req.params.groupId), optionId = Number(req.params.optionId);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ message: 'Invalid customization group ID' });
  if (!Number.isInteger(optionId) || optionId < 1) return res.status(400).json({ message: 'Invalid customization option ID' });
  const body = req.body || {};
  if (Object.keys(body).some(key => key !== 'is_active') || typeof body.is_active !== 'boolean') return res.status(400).json({ message: 'is_active must be a boolean' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [group] } = await client.query('SELECT id FROM menu_customization_groups WHERE id=$1 FOR UPDATE', [groupId]);
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization group not found' }) }
    const { rows: [option] } = await client.query('UPDATE menu_customization_options SET is_active=$1,updated_at=NOW() WHERE id=$2 AND group_id=$3 RETURNING id,group_id,name,price,position,is_active,created_at,updated_at', [body.is_active, optionId, groupId]);
    if (!option) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Customization option not found for this group' }) }
    await client.query('COMMIT');
    res.json({ message: body.is_active ? 'Customization option activated successfully' : 'Customization option archived successfully', option });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to update customization option status' });
  } finally { client.release() }
});
app.post('/api/admin/menu/categories', async (req, res) => {
  const rawName = req.body?.name;
  if (typeof rawName !== 'string') return res.status(400).json({ message: 'Category name is required' });
  const name = rawName.trim();
  if (!name) return res.status(400).json({ message: 'Category name cannot be empty' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_categories_position'))");
    const { rows: duplicate } = await client.query('SELECT id FROM menu_categories WHERE lower(name)=lower($1) LIMIT 1', [name]);
    if (duplicate[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A category with this name already exists' }) }
    const { rows: [category] } = await client.query("INSERT INTO menu_categories(name,position,is_active) VALUES($1,COALESCE((SELECT MAX(position) FROM menu_categories),0)+1,TRUE) RETURNING id,name,position,is_active", [name]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Category created successfully', category: { ...category, menu_item_count: 0 } });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'A category with this name already exists' });
    res.status(500).json({ message: 'Unable to create category' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/categories/:id', async (req, res) => {
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'Invalid category ID' });
  const rawName = req.body?.name;
  if (typeof rawName !== 'string') return res.status(400).json({ message: 'Category name is required' });
  const name = rawName.trim();
  if (!name) return res.status(400).json({ message: 'Category name cannot be empty' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT id FROM menu_categories WHERE id=$1 FOR UPDATE', [categoryId]);
    if (!existing[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Category not found' }) }
    const { rows: duplicate } = await client.query('SELECT id FROM menu_categories WHERE lower(name)=lower($1) AND id<>$2 LIMIT 1', [name, categoryId]);
    if (duplicate[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A category with this name already exists' }) }
    const { rows: [category] } = await client.query("UPDATE menu_categories SET name=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,position,is_active", [name, categoryId]);
    const { rows: [count] } = await client.query('SELECT COUNT(*)::int menu_item_count FROM menu_items WHERE category_id=$1', [categoryId]);
    await client.query('COMMIT');
    res.json({ message: 'Category updated successfully', category: { ...category, menu_item_count: count.menu_item_count } });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    if (e.code === '23505') return res.status(409).json({ message: 'A category with this name already exists' });
    res.status(500).json({ message: 'Unable to update category' });
  } finally { client.release() }
});
app.patch('/api/admin/menu/categories/:id/status', async (req, res) => {
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'Invalid category ID' });
  if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({ message: 'is_active must be a boolean' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [category] } = await client.query("UPDATE menu_categories SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,position,is_active", [req.body.is_active, categoryId]);
    if (!category) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Category not found' }) }
    const { rows: [count] } = await client.query('SELECT COUNT(*)::int menu_item_count FROM menu_items WHERE category_id=$1', [categoryId]);
    await client.query('COMMIT');
    res.json({ message: req.body.is_active ? 'Category activated successfully' : 'Category archived successfully', category: { ...category, menu_item_count: count.menu_item_count } });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    res.status(500).json({ message: 'Unable to update category status' });
  } finally { client.release() }
});
app.get('/api/kiosk/menu', async (req, res) => {
  try {
    const branchId = req.query.branchId == null || req.query.branchId === '' ? null : Number(req.query.branchId);
    if (branchId !== null && (!Number.isInteger(branchId) || branchId < 1)) return res.status(400).json({ message: 'Invalid branch ID' });
    let branch = null;
    if (branchId !== null) {
      const { rows } = await query('SELECT id,code,name,type,city,state,timezone,is_active FROM branches WHERE id=$1', [branchId]);
      if (!rows[0]) return res.status(404).json({ message: 'Branch not found' });
      if (!rows[0].is_active) return res.status(400).json({ message: 'Branch is inactive' });
      branch = rows[0];
    }
    const { rows: categories } = await query(
      "SELECT mc.id,mc.name,mc.position FROM menu_categories mc WHERE mc.is_active=true AND EXISTS(SELECT 1 FROM menu_items mi WHERE mi.category_id=mc.id AND mi.is_active=true AND mi.available=true) ORDER BY mc.position ASC,mc.id ASC"
    );
    const { rows: items } = await query(
      "SELECT mi.id,mi.name,mi.description,mi.category_id,mc.name category_name,mc.position category_position,COALESCE(bmp.effective_price,mi.price) price,mi.image_url,mi.available,mi.bestseller,mi.vegetarian,mi.preparation_minutes,COALESCE(cg.customization_groups,'[]'::json) customization_groups FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id LEFT JOIN branch_menu_prices bmp ON bmp.menu_item_id=mi.id AND bmp.branch_id=$1 LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',micg.group_id,'name',mcg.name,'code',mcg.code,'type',mcg.group_type,'position',micg.position,'required',micg.is_required,'minSelections',micg.min_selections,'maxSelections',micg.max_selections,'options',COALESCE((SELECT json_agg(json_build_object('id',mco.id,'name',mco.name,'price',mco.price,'position',mco.position) ORDER BY mco.position ASC,mco.id ASC) FROM menu_customization_options mco WHERE mco.group_id=mcg.id AND mco.is_active=true),'[]'::json)) ORDER BY micg.position ASC,micg.group_id ASC) customization_groups FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=mi.id AND mcg.is_active=true) cg ON true WHERE mi.is_active=true AND mi.available=true AND mc.is_active=true ORDER BY mc.position ASC,mi.name ASC,mi.id ASC"
    , [branchId]
    );
    res.json({ branch, categories, items });
  } catch (e) {
    res.status(500).json({ message: 'Unable to load kiosk menu' });
  }
});
app.get('/api/menu', async (req, res) => { try { const { rows } = await query('SELECT mi.*,mc.name category FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id WHERE mi.available AND mi.is_active=true ORDER BY mc.position,mi.name'); res.json({ items: rows }) } catch (e) { res.status(500).json({ message: e.message }) } });
app.get('/api/orders', async (req, res) => { try { const states = (req.query.status || '').split(',').filter(Boolean); const sql = `${orderQuery} ${states.length ? 'WHERE o.status=ANY($1)' : ''} GROUP BY o.id ORDER BY o.created_at DESC`; const { rows } = await query(sql, states.length ? [states] : []); res.json({ orders: rows }) } catch (e) { res.status(500).json({ message: e.message }) } });

app.get('/api/admin/orders', auth(['admin']), async (req, res) => {
  try {
    const allowedStatuses = new Set(['awaiting_payment', 'confirmed', 'new', 'preparing', 'completed', 'cancelled']);
    const requestedStatuses = String(req.query.status || '').split(',').map(value => value.trim()).filter(Boolean);
    const statuses = requestedStatuses.filter(value => allowedStatuses.has(value));
    if (requestedStatuses.length && statuses.length !== requestedStatuses.length) return res.status(400).json({ message: 'Invalid order status filter' });

    const branchId = req.query.branchId == null || req.query.branchId === '' || req.query.branchId === 'ALL' ? null : Number(req.query.branchId);
    if (branchId !== null && (!Number.isInteger(branchId) || branchId < 1)) return res.status(400).json({ message: 'Invalid branch ID' });

    const search = String(req.query.search || '').trim();
    const limitRaw = Number(req.query.limit || 200);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

    const conditions = [];
    const params = [];
    if (statuses.length) { params.push(statuses); conditions.push('o.status=ANY($' + params.length + ')'); }
    if (branchId !== null) { params.push(branchId); conditions.push('o.branch_id=$' + params.length); }
    if (search) { params.push('%' + search + '%'); conditions.push('(o.order_number ILIKE $' + params.length + ' OR EXISTS (SELECT 1 FROM order_items soi WHERE soi.order_id=o.id AND soi.item_name ILIKE $' + params.length + '))'); }

    params.push(limit);
    const sql = `SELECT o.*,b.code branch_code,b.name branch_name,b.type branch_type,
      COALESCE(json_agg(json_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'customizations',oi.customizations) ORDER BY oi.id ASC) FILTER(WHERE oi.id IS NOT NULL),'[]') items
      FROM orders o
      LEFT JOIN branches b ON b.id=o.branch_id
      LEFT JOIN order_items oi ON oi.order_id=o.id
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      GROUP BY o.id,b.id
      ORDER BY o.created_at DESC,o.id DESC
      LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    res.json({ orders: rows });
  } catch (e) {
    res.status(500).json({ message: 'Unable to load admin orders' });
  }
});


app.post('/api/orders', async (req, res) => {
  const client = await db.connect();
  try {
    const body = req.body || {};
    const { orderType, items = [], paymentMethod, paymentStatus = 'pending', orderStatus = 'awaiting_payment' } = body;
    const branchId = body.branchId == null || body.branchId === '' ? null : Number(body.branchId);
    if (branchId !== null && (!Number.isInteger(branchId) || branchId < 1)) return res.status(400).json({ message: 'Invalid branch ID' });
    if (!['EAT HERE', 'TAKE PARCEL'].includes(orderType)) return res.status(400).json({ message: 'Invalid order type' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Items required' });
    if (!['upi', 'cash'].includes(paymentMethod) || !['pending', 'paid'].includes(paymentStatus) || !['awaiting_payment', 'confirmed'].includes(orderStatus)) return res.status(400).json({ message: 'Invalid payment or order status' });
    if (items.length > 50) return res.status(400).json({ message: 'Too many order items' });

    await client.query('BEGIN');
    if (branchId !== null) {
      const { rows: [branch] } = await client.query('SELECT id,is_active FROM branches WHERE id=$1 FOR UPDATE', [branchId]);
      if (!branch) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Branch not found' }); }
      if (!branch.is_active) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Branch is inactive' }); }
    }

    const normalizedItems = [];
    let totalCents = 0n;
    const toCents = value => {
      const text = String(value);
      if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid monetary value');
      const [whole, fraction = ''] = text.split('.');
      return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
    };

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid order item' });
      }

      const menuItemId = item.menuItemId;
      const quantity = item.quantity;

      if (!Number.isInteger(menuItemId) || menuItemId < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid menu item ID' });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Quantity must be an integer between 1 and 99' });
      }

      const { rows: [menuItem] } = await client.query(
        'SELECT mi.id,mi.name,COALESCE(bmp.effective_price,mi.price) price,mi.is_active,mi.available FROM menu_items mi LEFT JOIN branch_menu_prices bmp ON bmp.menu_item_id=mi.id AND bmp.branch_id=$2 WHERE mi.id=$1 FOR UPDATE',
        [menuItemId, branchId]
      );

      if (!menuItem) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Menu item not found' });
      }
      if (!menuItem.is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Menu item is archived' });
      }
      if (!menuItem.available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Menu item is unavailable' });
      }

      const customizations = item.customizations;
      if (customizations != null && (typeof customizations !== 'object' || Array.isArray(customizations))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid customizations' });
      }
      if (customizations?.specialRequest != null && (typeof customizations.specialRequest !== 'string' || customizations.specialRequest.length > 500)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Special request must be text up to 500 characters' });
      }

      const submittedGroups = customizations?.groups;
      if (submittedGroups != null && !Array.isArray(submittedGroups)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Customization groups must be an array' });
      }

      const groupsInput = submittedGroups || [];
      const submittedGroupIds = new Set();
      const groupSelections = [];

      for (const groupInput of groupsInput) {
        if (!groupInput || typeof groupInput !== 'object' || Array.isArray(groupInput)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Invalid customization group selection' });
        }

        const groupId = groupInput.groupId;
        const optionIds = groupInput.optionIds;

        if (!Number.isInteger(groupId) || groupId < 1) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Invalid customization group ID' });
        }
        if (submittedGroupIds.has(groupId)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Duplicate customization group' });
        }
        submittedGroupIds.add(groupId);

        if (!Array.isArray(optionIds) || optionIds.some(optionId => !Number.isInteger(optionId) || optionId < 1)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Customization option IDs must be valid integers' });
        }
        if (new Set(optionIds).size !== optionIds.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Customization options must not contain duplicates' });
        }

        groupSelections.push({ groupId, optionIds });
      }

      const { rows: assignedGroups } = await client.query(
        'SELECT micg.group_id,micg.is_required,micg.min_selections,micg.max_selections,micg.position,mcg.name,mcg.code,mcg.group_type,mcg.is_active FROM menu_item_customization_groups micg JOIN menu_customization_groups mcg ON mcg.id=micg.group_id WHERE micg.menu_item_id=$1 ORDER BY micg.position ASC,micg.group_id ASC',
        [menuItemId]
      );

      const assignedById = new Map(assignedGroups.map(group => [group.group_id, group]));

      for (const group of assignedGroups) {
        if (!group.is_active) {
          if (group.is_required || submittedGroupIds.has(group.group_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Customization group is inactive' });
          }
          continue;
        }

        const selection = groupSelections.find(entry => entry.groupId === group.group_id);
        const count = selection?.optionIds.length || 0;

        if (count < Number(group.min_selections) || count > Number(group.max_selections)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Invalid number of customization selections' });
        }
      }

      for (const selection of groupSelections) {
        const group = assignedById.get(selection.groupId);
        if (!group) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Customization group is not assigned to this menu item' });
        }
        if (!group.is_active) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Customization group is inactive' });
        }

        const { rows: options } = await client.query(
          'SELECT id,group_id,name,price,position,is_active FROM menu_customization_options WHERE group_id=$1 AND id=ANY($2::int[]) ORDER BY position ASC,id ASC',
          [selection.groupId, selection.optionIds]
        );

        if (options.length !== selection.optionIds.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'One or more customization options do not belong to the selected group' });
        }
        if (options.some(option => !option.is_active)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Customization option is inactive' });
        }

        selection.options = options;
      }

      const baseCents = toCents(menuItem.price);
      const snapshotGroups = [];
      let customizationCents = 0n;

      for (const group of assignedGroups) {
        const selection = groupSelections.find(entry => entry.groupId === group.group_id);
        const options = selection?.options || [];
        const selectedOptions = options.map(option => {
          const optionCents = toCents(option.price);
          customizationCents += optionCents;
          return {
            id: option.id,
            name: option.name,
            price: Number(option.price)
          };
        });

        if (selectedOptions.length) {
          snapshotGroups.push({
            groupId: group.group_id,
            name: group.name,
            code: group.code,
            type: group.group_type,
            required: group.is_required,
            minSelections: Number(group.min_selections),
            maxSelections: Number(group.max_selections),
            options: selectedOptions
          });
        }
      }

      const unitCents = baseCents + customizationCents;
      const lineTotalCents = unitCents * BigInt(quantity);
      totalCents += lineTotalCents;

      if (totalCents > 999999999999n) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Order total is too large' });
      }

      const selectedSauce = snapshotGroups.find(group => group.type === 'SAUCE')?.options?.[0] || null;
      const extras = snapshotGroups
        .filter(group => group.type === 'EXTRA' || group.type === 'ADD_ON')
        .flatMap(group => group.options.map(option => ({
          name: option.name,
          price: option.price,
          groupId: group.groupId
        })));

      const customizationSnapshot = {
        basePrice: Number(menuItem.price),
        baseTotal: Number(baseCents) / 100 * quantity,
        customizationTotal: Number(customizationCents) / 100 * quantity,
        sauce: selectedSauce ? { name: selectedSauce.name, price: selectedSauce.price } : null,
        sauceTotal: selectedSauce ? selectedSauce.price : 0,
        extras,
        extrasTotal: extras.reduce((sum, extra) => sum + Number(extra.price || 0), 0),
        groups: snapshotGroups,
        finalTotal: Number(lineTotalCents) / 100,
        specialRequest: customizations?.specialRequest?.trim() || ''
      };

      normalizedItems.push({
        menuItemId,
        name: menuItem.name,
        quantity,
        unitPrice: Number(menuItem.price),
        customizations: customizationSnapshot,
        finalTotal: Number(lineTotalCents) / 100
      });
    }

    const total = Number(totalCents) / 100;
    const { rows: [order] } = await client.query(
      "INSERT INTO orders(order_number,branch_id,order_type,total,payment_method,payment_status,status,received_at,target_prep_seconds) VALUES ('A-'||nextval('order_number_seq'),$1,$2,$3,$4,$5,$6,NOW(),480) RETURNING *",
      [branchId, orderType, total.toFixed(2), paymentMethod, paymentStatus, orderStatus]
    );

    const storedItems = [];
    for (const item of normalizedItems) {
      const { rows: [stored] } = await client.query(
        'INSERT INTO order_items(order_id,menu_item_id,item_name,quantity,unit_price,customizations) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [order.id, item.menuItemId, item.name, item.quantity, item.unitPrice, item.customizations]
      );
      storedItems.push({ ...item, id: stored.id });
    }

    await client.query('COMMIT');

    const result = { ...order, items: storedItems };
    io.emit(orderStatus === 'confirmed' ? 'order:new' : 'order:awaiting_payment', result);
    if (orderStatus === 'confirmed') await getKitchenQueue();
    res.status(201).json({ order: { ...result, estimated_minutes: 12 } });
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    const message = e.message === 'Invalid monetary value' ? 'Invalid database price' : 'Unable to create order';
    res.status(500).json({ message });
  } finally { client.release() }
});

async function updateOrderStatus(req, res, source = 'orders') {
  const status = String(req.body.status || '').toLowerCase();
  if (!['preparing', 'completed'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  try {
    const { rows: currentRows } = await query('SELECT status,payment_status FROM orders WHERE id=$1', [req.params.id]);
    const currentStatus = currentRows[0];
    if (!currentStatus) return res.status(404).json({ message: source === 'kitchen' ? 'Kitchen order not found' : 'Not found' });
    if (source === 'kitchen' && currentStatus.payment_status !== 'paid') return res.status(404).json({ message: 'Kitchen order not found' });
    let result;
    if (status === 'preparing') {
      if (currentStatus.status === 'preparing') return res.status(409).json({ message: 'Order is already preparing' });
      if (['completed', 'cancelled'].includes(currentStatus.status)) return res.status(409).json({ message: `Cannot prepare a ${currentStatus.status} order` });
      if (!['confirmed', 'new'].includes(currentStatus.status)) return res.status(409).json({ message: `Cannot prepare an order in ${currentStatus.status} status` });
      const { rows } = await query(`UPDATE orders SET status='preparing',activated_at=COALESCE(activated_at,NOW()),preparation_started_at=COALESCE(preparation_started_at,NOW()) WHERE id=$1 ${source === 'kitchen' ? "AND payment_status='paid'" : ''} AND status IN('confirmed','new') RETURNING *`, [req.params.id]);
      if (!rows[0]) return res.status(409).json({ message: 'Order transition could not be completed' });
      result = rows[0];
    } else {
      if (currentStatus.status === 'completed') return res.status(409).json({ message: 'Order is already completed or unavailable' });
      if (currentStatus.status === 'cancelled') return res.status(409).json({ message: 'Cannot complete a cancelled order' });
      if (currentStatus.status !== 'preparing') return res.status(409).json({ message: 'Order must be preparing before completion' });
      const { rows } = await query(`UPDATE orders SET status='completed',completed_at=NOW(),prep_time_seconds=CASE WHEN COALESCE(activated_at,preparation_started_at) IS NULL THEN NULL ELSE GREATEST(0,EXTRACT(EPOCH FROM (NOW()-COALESCE(activated_at,preparation_started_at)))::int) END,was_delayed=CASE WHEN COALESCE(activated_at,preparation_started_at) IS NULL THEN false ELSE EXTRACT(EPOCH FROM (NOW()-COALESCE(activated_at,preparation_started_at)))::int>COALESCE(target_prep_seconds,480) END WHERE id=$1 ${source === 'kitchen' ? "AND payment_status='paid'" : ''} AND status='preparing' RETURNING *`, [req.params.id]);
      if (!rows[0]) return res.status(409).json({ message: 'Order is already completed or unavailable' });
      result = rows[0];
    }
    io.emit(status === 'preparing' ? 'order:activated' : 'order:completed', result);
    io.emit('order:updated', result);
    const current = await getKitchenQueue();
    res.json({ success: true, order: result, completedOrder: status === 'completed' ? result : undefined, queue: current.queue });
  } catch (e) { res.status(500).json({ message: e.message }) }
}
app.patch('/api/orders/:id/status', (req, res) => updateOrderStatus(req, res, 'orders'));
app.patch('/api/admin/orders/:id/status', auth(['admin']), (req, res) => updateOrderStatus(req, res, 'orders'));
app.get('/api/inventory', async (req, res) => { try { const { rows } = await query("SELECT *,CASE WHEN quantity<=0 THEN 'out' WHEN quantity<=low_stock_threshold THEN 'low' ELSE 'available' END status FROM inventory_items ORDER BY quantity"); res.json({ items: rows }) } catch (e) { res.status(500).json({ message: e.message }) } });
app.get('/api/analytics/dashboard', auth(['admin', 'manager']), async (req, res) => { try { const { rows: [metrics] } = await query("SELECT COALESCE(SUM(total) FILTER(WHERE created_at::date=CURRENT_DATE),0) revenue,COUNT(*) FILTER(WHERE created_at::date=CURRENT_DATE) orders,COALESCE(ROUND(AVG(total) FILTER(WHERE created_at::date=CURRENT_DATE)),0) aov,COUNT(*) FILTER(WHERE created_at::date=CURRENT_DATE) customers FROM orders"); res.json({ metrics }) } catch (e) { res.status(500).json({ message: e.message }) } });

app.get('/api/kitchen/orders', async (req, res) => { try { const current = await getKitchenQueue(); res.json(current) } catch (e) { res.status(500).json({ message: e.message }) } });
app.get('/api/kitchen/orders/completed', async (req, res) => { try { const { rows } = await query(`${completedOrderQuery} WHERE o.status='completed' GROUP BY o.id ORDER BY o.completed_at DESC NULLS LAST,o.id DESC`); res.json({ orders: rows }) } catch (e) { res.status(500).json({ message: e.message }) } });
app.patch('/api/kitchen/orders/:id/status', (req, res) => updateOrderStatus(req, res, 'kitchen'));
io.on('connection', socket => socket.emit('system:ready'));
server.listen(process.env.PORT || 4000, () => console.log('SHAWARMAHOLICS API running'));
