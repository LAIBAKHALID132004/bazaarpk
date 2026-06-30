// BazaarPK — Express API Server
// Node.js 18+ | Express 4 | MySQL 8
// Run: npm install && node server.js

const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ─── Database pool ─────────────────────────────────────────────────────────────
const db = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASS     || '',
  database:           process.env.DB_NAME     || 'bazaarpk',
  waitForConnections: true,
  connectionLimit:    10,
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// ─── Auth helpers ──────────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ─── Helper: generate order number ─────────────────────────────────────────────
function genOrderNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BPK-${ts}-${rand}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)',
      [name, email, phone || null, hash]
    );
    const user = { id: result.insertId, role: 'customer' };
    res.status(201).json({ token: signToken(user), user: { id: user.id, name, email } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
});

// GET /api/auth/me
app.get('/api/auth/me', auth, async (req, res) => {
  const [[user]] = await db.query(
    'SELECT id,name,email,phone,role,city,province,avatar_url,created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json(user);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/products  — list with filters
app.get('/api/products', async (req, res) => {
  const {
    category, search, sort = 'created_at', order = 'DESC',
    min_price, max_price, page = 1, limit = 20, featured
  } = req.query;

  let where = 'WHERE p.is_active = 1';
  const params = [];

  if (category) {
    where += ' AND c.slug = ?'; params.push(category);
  }
  if (search) {
    where += ' AND MATCH(p.name, p.description) AGAINST(? IN BOOLEAN MODE)';
    params.push(search + '*');
  }
  if (min_price) { where += ' AND p.price >= ?'; params.push(min_price); }
  if (max_price) { where += ' AND p.price <= ?'; params.push(max_price); }
  if (featured)  { where += ' AND p.is_featured = 1'; }

  const allowedSort  = ['created_at', 'price', 'views'];
  const allowedOrder = ['ASC', 'DESC'];
  const safeSort  = allowedSort.includes(sort) ? sort : 'created_at';
  const safeOrder = allowedOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

  const offset = (Math.max(1, page) - 1) * Math.min(50, limit);

  const sql = `
    SELECT p.id, p.name, p.name_ur, p.slug, p.price, p.sale_price, p.stock,
           p.images, p.is_featured, p.views, p.created_at,
           c.name AS category, c.slug AS category_slug,
           COALESCE(AVG(r.rating),0) AS avg_rating,
           COUNT(r.id) AS review_count
    FROM   products p
    JOIN   categories c ON c.id = p.category_id
    LEFT JOIN reviews r ON r.product_id = p.id
    ${where}
    GROUP BY p.id
    ORDER BY p.${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?`;

  params.push(Number(limit), Number(offset));
  const [rows] = await db.query(sql, params);
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${where}`,
    params.slice(0, -2)
  );
  res.json({ products: rows, total, page: Number(page), limit: Number(limit) });
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  const [[product]] = await db.query(`
    SELECT p.*, c.name AS category, c.slug AS category_slug,
           COALESCE(AVG(r.rating),0) AS avg_rating, COUNT(r.id) AS review_count
    FROM   products p
    JOIN   categories c ON c.id = p.category_id
    LEFT JOIN reviews r ON r.product_id = p.id
    WHERE  p.id = ? AND p.is_active = 1
    GROUP BY p.id`, [req.params.id]);

  if (!product) return res.status(404).json({ error: 'Not found' });
  await db.query('UPDATE products SET views = views + 1 WHERE id = ?', [product.id]);

  const [reviews] = await db.query(
    'SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 10',
    [product.id]
  );
  res.json({ ...product, reviews });
});

// POST /api/products  — admin/seller create
app.post('/api/products', auth, async (req, res) => {
  const { name, name_ur, category_id, price, sale_price, description, description_ur,
          stock, images, tags, sku, weight_kg } = req.body;
  const [r] = await db.query(
    `INSERT INTO products
     (seller_id, category_id, name, name_ur, slug, price, sale_price, description, description_ur, stock, images, tags, sku, weight_kg)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, category_id, name, name_ur,
     name.toLowerCase().replace(/\s+/g,'-') + '-' + Date.now(),
     price, sale_price||null, description, description_ur,
     stock||0, JSON.stringify(images||[]), JSON.stringify(tags||[]), sku||null, weight_kg||null]
  );
  res.status(201).json({ id: r.insertId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/categories', async (_req, res) => {
  const [rows] = await db.query('SELECT * FROM categories ORDER BY sort_order');
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CART (server-side, requires auth)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/cart', auth, async (req, res) => {
  const [items] = await db.query(`
    SELECT ci.product_id, ci.quantity, p.name, p.price, p.sale_price, p.images, p.stock
    FROM   cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE  ci.user_id = ?`, [req.user.id]);
  res.json(items);
});

app.post('/api/cart', auth, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  await db.query(
    'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
    [req.user.id, product_id, quantity, quantity]
  );
  res.json({ ok: true });
});

app.put('/api/cart/:productId', auth, async (req, res) => {
  const { quantity } = req.body;
  if (quantity <= 0) {
    await db.query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
  } else {
    await db.query('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?',
      [quantity, req.user.id, req.params.productId]);
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/orders — place order
app.post('/api/orders', auth, async (req, res) => {
  const { items, payment_method, promo_code, shipping, notes } = req.body;
  // Validate promo
  let discount = 0;
  if (promo_code) {
    const [[promo]] = await db.query(
      'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())',
      [promo_code]
    );
    if (promo) {
      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      if (subtotal >= promo.min_order) {
        discount = promo.type === 'percent'
          ? Math.min(subtotal * promo.value / 100, promo.max_discount || Infinity)
          : promo.value;
        await db.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', [promo.id]);
      }
    }
  }

  const subtotal    = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping_fee = subtotal >= 2000 ? 0 : 200;
  const total       = subtotal - discount + shipping_fee;
  const order_number = genOrderNo();

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [order] = await conn.query(
      `INSERT INTO orders
       (user_id, order_number, status, payment_method, subtotal, discount, shipping_fee, total,
        promo_code, notes, shipping_name, shipping_phone, shipping_street, shipping_city, shipping_province)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, order_number, 'pending', payment_method,
       subtotal, discount, shipping_fee, total, promo_code||null, notes||null,
       shipping.name, shipping.phone, shipping.street, shipping.city, shipping.province]
    );
    const orderId = order.insertId;

    for (const item of items) {
      const [[p]] = await conn.query('SELECT name, images FROM products WHERE id = ?', [item.product_id]);
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, total, snapshot) VALUES (?,?,?,?,?,?)',
        [orderId, item.product_id, item.quantity, item.price,
         item.price * item.quantity, JSON.stringify({ name: p.name, image: JSON.parse(p.images||'[]')[0] })]
      );
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    // Clear cart
    await conn.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    await conn.query(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?,?,?)',
      [orderId, 'pending', req.user.id]
    );

    await conn.commit();
    res.status(201).json({ order_number, order_id: orderId, total });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// GET /api/orders — my orders
app.get('/api/orders', auth, async (req, res) => {
  const [orders] = await db.query(
    `SELECT o.*, GROUP_CONCAT(oi.quantity, 'x ', JSON_UNQUOTE(JSON_EXTRACT(oi.snapshot,'$.name')) SEPARATOR ', ') AS items_summary
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ? GROUP BY o.id ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  res.json(orders);
});

// GET /api/orders/:id
app.get('/api/orders/:id', auth, async (req, res) => {
  const [[order]] = await db.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const [history] = await db.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at', [order.id]);
  res.json({ ...order, items, history });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/products/:id/reviews', auth, async (req, res) => {
  const { rating, comment } = req.body;
  await db.query(
    'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment)',
    [req.params.id, req.user.id, rating, comment]
  );
  res.status(201).json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROMO CODES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/promo/validate', auth, async (req, res) => {
  const { code, subtotal } = req.body;
  const [[promo]] = await db.query(
    'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())',
    [code]
  );
  if (!promo) return res.status(404).json({ error: 'Invalid promo code' });
  if (subtotal < promo.min_order) return res.status(400).json({ error: `Minimum order Rs ${promo.min_order}` });
  const discount = promo.type === 'percent'
    ? Math.min(subtotal * promo.value / 100, promo.max_discount || Infinity)
    : promo.value;
  res.json({ discount: Math.round(discount), type: promo.type, value: promo.value });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/stats', auth, adminOnly, async (_req, res) => {
  const [[revenue]]  = await db.query("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status='paid'");
  const [[orders]]   = await db.query("SELECT COUNT(*) AS total FROM orders");
  const [[products]] = await db.query("SELECT COUNT(*) AS total FROM products WHERE is_active=1");
  const [[users]]    = await db.query("SELECT COUNT(*) AS total FROM users WHERE role='customer'");
  const [topCats]    = await db.query(`
    SELECT c.name, SUM(oi.total) AS revenue
    FROM order_items oi
    JOIN products p  ON p.id = oi.product_id
    JOIN categories c ON c.id = p.category_id
    GROUP BY c.id ORDER BY revenue DESC LIMIT 5`);
  const [payMethods] = await db.query(`
    SELECT payment_method, COUNT(*) AS count FROM orders GROUP BY payment_method`);
  res.json({ revenue: revenue.total, orders: orders.total, products: products.total,
             users: users.total, topCats, payMethods });
});

app.get('/api/admin/orders', auth, adminOnly, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let where = '';
  const params = [];
  if (status) { where = 'WHERE o.status = ?'; params.push(status); }
  const offset = (page - 1) * limit;
  const [rows] = await db.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o JOIN users u ON u.id = o.user_id
     ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  res.json(rows);
});

app.patch('/api/admin/orders/:id', auth, adminOnly, async (req, res) => {
  const { status, tracking_number, payment_status } = req.body;
  await db.query('UPDATE orders SET status=COALESCE(?,status), tracking_number=COALESCE(?,tracking_number), payment_status=COALESCE(?,payment_status) WHERE id=?',
    [status||null, tracking_number||null, payment_status||null, req.params.id]);
  if (status) {
    await db.query('INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?,?,?)',
      [req.params.id, status, req.user.id]);
  }
  res.json({ ok: true });
});

// ─── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`BazaarPK API running on :${PORT}`));
