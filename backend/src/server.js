import cors from 'cors';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { pool } from './database.js';

const app = express();
const port = Number(process.env.PORT || 4000);

const configuredWebOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin(origin, callback) {
    const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS !== 'false';
    const isLocalDevOrigin = !origin || origin === configuredWebOrigin || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(origin);
    callback(null, allowAllOrigins || isLocalDevOrigin);
  },
}));
app.use(express.json());

const authTokenTtlDays = 30;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [, salt, expectedHex] = String(storedHash || '').split('$');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name };
}

const authInput = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.'),
  password: z.string().min(8).max(200),
});
const registerInput = authInput.extend({ fullName: z.string().trim().min(2).max(100) });

async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  await pool.execute(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${authTokenTtlDays} DAY))`,
    [hashToken(token), userId],
  );
  return token;
}

async function authenticate(request, response, next) {
  const isPublic = request.path === '/health' || request.path === '/auth/login' || request.path === '/auth/register';
  if (isPublic) return next();
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return response.status(401).json({ message: 'Giriş yapmanız gerekiyor.' });
  try {
    const [[user]] = await pool.execute(`
      SELECT u.id, u.username, u.full_name, u.role_name
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`, [hashToken(token)]);
    if (!user) return response.status(401).json({ message: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.' });
    request.user = user;
    request.authToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

app.get('/', (request, response) => {
  const requestHost = request.hostname === 'localhost' || request.hostname === '127.0.0.1' ? 'localhost' : request.hostname;
  response.redirect(`http://${requestHost}:5173`);
});

app.get('/api', (_request, response) => {
  response.json({ name: 'Barfas Depo API', status: 'ok', interface: process.env.WEB_ORIGIN || 'http://localhost:5173' });
});

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

app.post('/api/auth/register', async (request, response, next) => {
  const parsed = registerInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Ad, kullanıcı adı ve en az 8 karakterli parola gerekli.' });
  try {
    const { username, password, fullName } = parsed.data;
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, full_name, role_name) VALUES (?, ?, ?, \'DEPO_PERSONELI\')',
      [username, hashPassword(password), fullName],
    );
    const [[user]] = await pool.execute('SELECT id, username, full_name, role_name FROM users WHERE id = ?', [result.insertId]);
    const token = await createSession(user.id);
    response.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  const parsed = authInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Kullanıcı adı ve en az 8 karakterli parola gerekli.' });
  try {
    const [[user]] = await pool.execute('SELECT id, username, password_hash, full_name, role_name FROM users WHERE username = ?', [parsed.data.username]);
    if (!user || !user.password_hash || !verifyPassword(parsed.data.password, user.password_hash)) {
      return response.status(401).json({ message: 'Kullanıcı adı veya parola hatalı.' });
    }
    const token = await createSession(user.id);
    response.json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.use('/api', authenticate);

app.get('/api/auth/me', (request, response) => {
  response.json({ user: publicUser(request.user) });
});

const profileInput = z.object({
  fullName: z.string().trim().min(2).max(100),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

app.put('/api/auth/profile', async (request, response, next) => {
  const parsed = profileInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Ad soyad geçerli olmalı; yeni parola en az 8 karakter olmalı.' });
  const { fullName, currentPassword, newPassword } = parsed.data;
  if (newPassword && !currentPassword) return response.status(422).json({ message: 'Parola değiştirmek için mevcut parolanızı girin.' });
  try {
    const [[currentUser]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [request.user.id]);
    if (newPassword && !verifyPassword(currentPassword, currentUser?.password_hash)) return response.status(401).json({ message: 'Mevcut parolanız hatalı.' });
    if (newPassword) {
      await pool.execute('UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?', [fullName, hashPassword(newPassword), request.user.id]);
    } else {
      await pool.execute('UPDATE users SET full_name = ? WHERE id = ?', [fullName, request.user.id]);
    }
    const [[updatedUser]] = await pool.execute('SELECT id, username, full_name, role_name FROM users WHERE id = ?', [request.user.id]);
    response.json({ user: publicUser(updatedUser) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(request.authToken)]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', async (_request, response, next) => {
  try {
    const [[summary]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE archived_at IS NULL) AS product_count,
        (SELECT COUNT(*) FROM inventory_units WHERE status = 'IN_STOCK') AS ready_unit_count,
        (SELECT COUNT(*) FROM inventory_movements WHERE DATE(performed_at) = CURDATE()) AS today_movement_count,
        (SELECT COUNT(*) FROM (
          SELECT p.id
          FROM products p
          LEFT JOIN stock_balances b ON b.product_id = p.id
          WHERE p.archived_at IS NULL
          GROUP BY p.id, p.minimum_stock
          HAVING COALESCE(SUM(b.quantity), 0) <= p.minimum_stock
        ) AS low_stock) AS low_stock_count
    `);
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', async (_request, response, next) => {
  try {
    const [products] = await pool.query(`
      SELECT p.id, p.name, p.category_id, p.stock_code, p.unit_name, p.minimum_stock,
        c.name AS category_name, COALESCE(SUM(b.quantity), 0) AS current_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.archived_at IS NULL
      GROUP BY p.id, c.name
      ORDER BY p.name
    `);
    response.json(products);
  } catch (error) {
    next(error);
  }
});

app.get('/api/products/:id/details', async (request, response, next) => {
  try {
    const productId = Number(request.params.id);
    if (!Number.isInteger(productId) || productId <= 0) return response.status(400).json({ message: 'Ürün kimliği geçersiz.' });
    const [[product]] = await pool.query(`
      SELECT p.id, p.name, p.stock_code, p.unit_name, p.minimum_stock, p.created_at, p.updated_at,
        c.name AS category_name, COALESCE(b.current_stock, 0) AS current_stock,
        COUNT(DISTINCT u.id) AS total_units,
        COUNT(DISTINCT CASE WHEN u.status = 'IN_STOCK' THEN u.id END) AS available_units
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (SELECT product_id, SUM(quantity) AS current_stock FROM stock_balances GROUP BY product_id) b ON b.product_id = p.id
      LEFT JOIN inventory_units u ON u.product_id = p.id
      WHERE p.id = ? AND p.archived_at IS NULL
      GROUP BY p.id, c.name`, [productId]);
    if (!product) return response.status(404).json({ message: 'Ürün bulunamadı.' });

    const [units] = await pool.query(`
      SELECT u.id, u.code_type, u.code_value, u.serial_number, u.status, u.created_at,
        CASE WHEN legacy.qr_code_blob IS NULL THEN NULL ELSE TO_BASE64(legacy.qr_code_blob) END AS legacy_qr_base64,
        l.code AS location_code, l.name AS location_name, w.name AS warehouse_name
      FROM inventory_units u
      LEFT JOIN legacy_product_units legacy ON legacy.legacy_id = u.legacy_id
      LEFT JOIN locations l ON l.id = u.current_location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      WHERE u.product_id = ?
      ORDER BY u.id`, [productId]);
    const [movements] = await pool.query(`
      SELECT m.id, m.movement_no, m.movement_type, m.quantity, m.reason_text, m.recipient_name,
        m.recipient_unit, m.document_no, m.note_text, m.performed_at, m.inventory_unit_id,
        u.code_value AS unit_code, source.code AS from_location_code, target.code AS to_location_code,
        supplier.name AS supplier_name, loan.status AS loan_status,
        performer.full_name AS performed_by_name, performer.username AS performed_by_username
      FROM inventory_movements m
      LEFT JOIN inventory_units u ON u.id = m.inventory_unit_id
      LEFT JOIN locations source ON source.id = m.from_location_id
      LEFT JOIN locations target ON target.id = m.to_location_id
      LEFT JOIN suppliers supplier ON supplier.id = m.supplier_id
      LEFT JOIN loan_records loan ON loan.movement_id = m.id
      LEFT JOIN users performer ON performer.id = m.performed_by_user_id
      WHERE m.product_id = ?
      ORDER BY m.performed_at DESC, m.id DESC`, [productId]);
    const [legacySupplies] = await pool.query(`
      SELECT CONCAT('legacy-supply-', s.legacy_id) AS id, 'IN' AS movement_type, s.quantity,
        'Eski sistem mal kabulü' AS reason_text, NULL AS recipient_name, NULL AS recipient_unit,
        NULL AS document_no, NULL AS note_text, s.supplied_at AS performed_at, NULL AS movement_no,
        NULL AS inventory_unit_id, NULL AS unit_code, NULL AS from_location_code, NULL AS to_location_code,
        s.supplier_name, NULL AS loan_status
      FROM legacy_supplies s JOIN products p ON p.legacy_id = s.legacy_product_id
      WHERE p.id = ?`, [productId]);
    const [legacyReturns] = await pool.query(`
      SELECT CONCAT('legacy-return-', rl.legacy_id) AS id, 'RETURN' AS movement_type, rl.quantity,
        COALESCE(r.description_text, 'Eski sistem iade kaydı') AS reason_text, NULL AS recipient_name,
        NULL AS recipient_unit, NULL AS document_no, NULL AS note_text, rl.returned_on AS performed_at,
        NULL AS movement_no, NULL AS inventory_unit_id, NULL AS unit_code, NULL AS from_location_code,
        NULL AS to_location_code, NULL AS supplier_name, NULL AS loan_status
      FROM legacy_return_lines rl JOIN legacy_returns r ON r.legacy_id = rl.legacy_return_id
        JOIN products p ON p.legacy_id = rl.legacy_product_id
      WHERE p.id = ?`, [productId]);
    const [legacyOrders] = await pool.query(`
      SELECT CONCAT('legacy-order-', ol.legacy_id) AS id, 'ORDER' AS movement_type, ol.quantity,
        COALESCE(ol.description_text, 'Eski sistem sipariş kaydı') AS reason_text, NULL AS recipient_name,
        NULL AS recipient_unit, NULL AS document_no, NULL AS note_text, ol.ordered_on AS performed_at,
        NULL AS movement_no, NULL AS inventory_unit_id, NULL AS unit_code, NULL AS from_location_code,
        NULL AS to_location_code, NULL AS supplier_name, NULL AS loan_status
      FROM legacy_order_lines ol JOIN products p ON p.legacy_id = ol.legacy_product_id
      WHERE p.id = ?`, [productId]);
    const [legacySales] = await pool.query(`
      SELECT CONCAT('legacy-sale-', s.legacy_id) AS id, 'OUT' AS movement_type, s.quantity,
        'Eski sistem satış kaydı' AS reason_text, c.name AS recipient_name, NULL AS recipient_unit,
        NULL AS document_no, NULL AS note_text, NULL AS performed_at, NULL AS movement_no,
        NULL AS inventory_unit_id, NULL AS unit_code, NULL AS from_location_code, NULL AS to_location_code,
        NULL AS supplier_name, NULL AS loan_status
      FROM legacy_sales s JOIN products p ON p.legacy_id = s.legacy_product_id
        LEFT JOIN legacy_customers c ON c.legacy_id = s.legacy_customer_id
      WHERE p.id = ?`, [productId]);
    response.json({ product, units, movements, legacyMovements: [...legacySupplies, ...legacyReturns, ...legacyOrders, ...legacySales] });
  } catch (error) { next(error); }
});

app.get('/api/products/:id/codes', async (request, response, next) => {
  try {
    const [codes] = await pool.query(`SELECT u.id, u.code_type, u.code_value, u.serial_number, u.status, u.current_location_id,
      CASE WHEN legacy.qr_code_blob IS NULL THEN NULL ELSE TO_BASE64(legacy.qr_code_blob) END AS legacy_qr_base64
      FROM inventory_units u LEFT JOIN legacy_product_units legacy ON legacy.legacy_id = u.legacy_id
      WHERE u.product_id = ? ORDER BY u.id`, [request.params.id]);
    response.json(codes);
  } catch (error) { next(error); }
});

const productInput = z.object({
  name: z.string().trim().min(2).max(255),
  stockCode: z.string().trim().min(1).max(100).optional(),
  unitName: z.string().trim().min(1).max(50).default('Adet'),
  minimumStock: z.coerce.number().nonnegative().default(0),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
});

app.post('/api/products', async (request, response, next) => {
  const parsed = productInput.safeParse(request.body);
  if (!parsed.success) {
    return response.status(422).json({ message: 'Ürün bilgileri geçersiz.', fields: parsed.error.flatten() });
  }

  try {
    const { name, stockCode, unitName, minimumStock, categoryId } = parsed.data;
    const [result] = await pool.execute(
      'INSERT INTO products (name, stock_code, unit_name, minimum_stock, category_id) VALUES (?, ?, ?, ?, ?)',
      [name, stockCode || null, unitName, minimumStock, categoryId || null],
    );
    response.status(201).json({ id: result.insertId, ...parsed.data });
  } catch (error) {
    next(error);
  }
});

const nameInput = z.object({ name: z.string().trim().min(2).max(150), contact: z.string().trim().max(255).optional(), note: z.string().trim().max(2000).optional() });
app.post('/api/categories', async (request, response, next) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100) }).safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Kategori adı geçersiz.' });
  try { const [result] = await pool.execute('INSERT INTO categories (name) VALUES (?)', [parsed.data.name]); response.status(201).json({ id: result.insertId, ...parsed.data }); } catch (error) { next(error); }
});
app.post('/api/suppliers', async (request, response, next) => {
  const parsed = nameInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Tedarikçi bilgileri geçersiz.' });
  try { const [result] = await pool.execute('INSERT INTO suppliers (name, contact_text, note_text) VALUES (?, ?, ?)', [parsed.data.name, parsed.data.contact || null, parsed.data.note || null]); response.status(201).json({ id: result.insertId, ...parsed.data }); } catch (error) { next(error); }
});
app.post('/api/customers', async (request, response, next) => {
  const parsed = nameInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Müşteri bilgileri geçersiz.' });
  try { const [result] = await pool.execute('INSERT INTO customers (name, note_text) VALUES (?, ?)', [parsed.data.name, parsed.data.note || null]); response.status(201).json({ id: result.insertId, ...parsed.data }); } catch (error) { next(error); }
});

app.get('/api/supplies', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.legacy_id AS id, s.supplier_name, s.supplied_at, s.quantity, s.unit_name, p.name AS product_name
      FROM legacy_supplies s LEFT JOIN legacy_products p ON p.legacy_id = s.legacy_product_id
      UNION ALL
      SELECT (1000000 + m.id) AS id, sp.name AS supplier_name, m.performed_at AS supplied_at, m.quantity,
        p.unit_name, p.name AS product_name
      FROM inventory_movements m JOIN suppliers sp ON sp.id = m.supplier_id JOIN products p ON p.id = m.product_id
      WHERE m.movement_type = 'IN' AND m.supplier_id IS NOT NULL
      ORDER BY supplied_at DESC, id DESC LIMIT 100`);
    response.json(rows);
  } catch (error) { next(error); }
});

const orderInput = z.object({ customerId: z.coerce.number().int().positive().nullable().optional(), orderDate: z.string().min(10).max(10), note: z.string().trim().max(2000).optional(), items: z.array(z.object({ productId: z.coerce.number().int().positive(), quantity: z.coerce.number().positive() })).min(1) });
app.get('/api/orders', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT o.id, o.order_no, o.order_date, o.status, o.note_text, c.name AS customer_name,
      COUNT(oi.id) AS item_count, COALESCE(SUM(oi.quantity), 0) AS total_quantity
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id, c.name ORDER BY o.created_at DESC LIMIT 100`);
    response.json(rows);
  } catch (error) { next(error); }
});
app.post('/api/orders', async (request, response, next) => {
  const parsed = orderInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Sipariş bilgileri geçersiz.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const orderNo = `SIP-${Date.now()}`;
    const [order] = await connection.execute('INSERT INTO orders (order_no, customer_id, order_date, note_text) VALUES (?, ?, ?, ?)', [orderNo, parsed.data.customerId || null, parsed.data.orderDate, parsed.data.note || null]);
    for (const item of parsed.data.items) await connection.execute('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)', [order.insertId, item.productId, item.quantity]);
    await connection.commit(); response.status(201).json({ id: order.insertId, orderNo });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

app.get('/api/loans', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT l.id, l.quantity, l.recipient_name, l.recipient_unit, l.status, l.lent_at, l.returned_at,
      p.name AS product_name, u.code_value AS unit_code FROM loan_records l JOIN products p ON p.id = l.product_id
      LEFT JOIN inventory_units u ON u.id = l.inventory_unit_id ORDER BY l.lent_at DESC LIMIT 100`);
    response.json(rows);
  } catch (error) { next(error); }
});

app.put('/api/loans/:id/return', async (request, response, next) => {
  const parsed = z.object({ toLocationId: z.coerce.number().int().positive(), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'İade konumu seçilmelidir.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[loan]] = await connection.execute('SELECT * FROM loan_records WHERE id = ? FOR UPDATE', [request.params.id]);
    if (!loan) throw requestError('Emanet kaydı bulunamadı.', 404);
    if (loan.status === 'RETURNED') throw requestError('Bu emanet zaten teslim alınmış.');
    await changeBalance(connection, loan.product_id, parsed.data.toLocationId, Number(loan.quantity));
    const movementNo = `HRK-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const [movement] = await connection.execute(`INSERT INTO inventory_movements (movement_no, movement_type, product_id, inventory_unit_id, to_location_id, quantity, reason_text, note_text, performed_by_user_id)
      VALUES (?, 'RETURN', ?, ?, ?, ?, 'Emanet teslim alındı', ?, ?)`, [movementNo, loan.product_id, loan.inventory_unit_id, parsed.data.toLocationId, loan.quantity, parsed.data.note || null, request.user.id]);
    await connection.execute('UPDATE loan_records SET status = \'RETURNED\', returned_at = CURRENT_TIMESTAMP WHERE id = ?', [loan.id]);
    if (loan.inventory_unit_id) await connection.execute('UPDATE inventory_units SET status = \'IN_STOCK\', current_location_id = ? WHERE id = ?', [parsed.data.toLocationId, loan.inventory_unit_id]);
    await connection.commit(); response.json({ movementId: movement.insertId, message: 'Emanet teslim alındı.' });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

app.get('/api/reports/stock', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT p.name, p.stock_code, p.unit_name, c.name AS category_name,
      COALESCE(SUM(b.quantity), 0) AS current_stock, p.minimum_stock
      FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.archived_at IS NULL GROUP BY p.id, c.name ORDER BY p.name`);
    response.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/reference-data', async (_request, response, next) => {
  try {
    const [products, locations, categories, suppliers, customers] = await Promise.all([
      pool.query('SELECT id, name, stock_code, unit_name FROM products WHERE archived_at IS NULL ORDER BY name'),
      pool.query(`SELECT l.id, l.code, l.name, w.name AS warehouse_name
        FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
        WHERE l.is_active = TRUE ORDER BY w.name, l.code`),
      pool.query('SELECT id, name FROM categories WHERE archived_at IS NULL ORDER BY name'),
      pool.query('SELECT id, name, contact_text FROM suppliers ORDER BY name'),
      pool.query('SELECT id, name FROM customers ORDER BY name'),
    ]);
    response.json({ products: products[0], locations: locations[0], categories: categories[0], suppliers: suppliers[0], customers: customers[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/locations', async (_request, response, next) => {
  try {
    const [locations] = await pool.query(`SELECT l.id, l.code, l.name, w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name
      FROM locations l JOIN warehouses w ON w.id = l.warehouse_id ORDER BY w.name, l.code`);
    response.json(locations);
  } catch (error) {
    next(error);
  }
});

const warehouseInput = z.object({ code: z.string().trim().min(2).max(50), name: z.string().trim().min(2).max(100) });
const locationInput = z.object({ warehouseId: z.coerce.number().int().positive(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(100) });

app.post('/api/warehouses', async (request, response, next) => {
  const parsed = warehouseInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Depo bilgileri geçersiz.' });
  try {
    const [result] = await pool.execute('INSERT INTO warehouses (code, name) VALUES (?, ?)', [parsed.data.code, parsed.data.name]);
    response.status(201).json({ id: result.insertId, ...parsed.data });
  } catch (error) { next(error); }
});

app.post('/api/locations', async (request, response, next) => {
  const parsed = locationInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Raf/alan bilgileri geçersiz.' });
  try {
    const [result] = await pool.execute('INSERT INTO locations (warehouse_id, code, name) VALUES (?, ?, ?)', [parsed.data.warehouseId, parsed.data.code, parsed.data.name]);
    response.status(201).json({ id: result.insertId, ...parsed.data });
  } catch (error) { next(error); }
});

const unitInput = z.object({
  productId: z.coerce.number().int().positive(),
  codeValue: z.string().trim().min(2).max(150),
  codeType: z.enum(['QR', 'BARCODE']).default('QR'),
  serialNumber: z.string().trim().max(150).optional(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
});

app.post('/api/inventory-units', async (request, response, next) => {
  const parsed = unitInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Etiket bilgileri geçersiz.' });
  try {
    const { productId, codeValue, codeType, serialNumber, locationId } = parsed.data;
    const [result] = await pool.execute(`INSERT INTO inventory_units (product_id, code_type, code_value, serial_number, current_location_id)
      VALUES (?, ?, ?, ?, ?)`, [productId, codeType, codeValue, serialNumber || null, locationId || null]);
    response.status(201).json({ id: result.insertId, codeValue });
  } catch (error) { next(error); }
});

app.get('/api/movements', async (_request, response, next) => {
  try {
    const [movements] = await pool.query(`SELECT m.id, m.movement_no, m.movement_type, m.quantity, m.reason_text, m.recipient_name,
      m.performed_at, p.name AS product_name, u.code_value AS unit_code,
      source.code AS from_location_code, target.code AS to_location_code,
      performer.full_name AS performed_by_name, performer.username AS performed_by_username
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN inventory_units u ON u.id = m.inventory_unit_id
      LEFT JOIN locations source ON source.id = m.from_location_id
      LEFT JOIN locations target ON target.id = m.to_location_id
      LEFT JOIN users performer ON performer.id = m.performed_by_user_id
      ORDER BY m.performed_at DESC, m.id DESC LIMIT 30`);
    response.json(movements);
  } catch (error) { next(error); }
});

const movementInput = z.object({
  type: z.enum(['IN', 'OUT', 'RETURN', 'TRANSFER', 'COUNT']),
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  countedQuantity: z.coerce.number().nonnegative().optional(),
  fromLocationId: z.coerce.number().int().positive().nullable().optional(),
  toLocationId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(2).max(255),
  recipientName: z.string().trim().max(150).optional(),
  recipientUnit: z.string().trim().max(150).optional(),
  documentNo: z.string().trim().max(100).optional(),
  note: z.string().trim().max(5000).optional(),
  unitCode: z.string().trim().max(150).optional(),
  supplierId: z.coerce.number().int().positive().nullable().optional(),
});

function requestError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function changeBalance(connection, productId, locationId, delta) {
  const [rows] = await connection.execute('SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ? FOR UPDATE', [productId, locationId]);
  const current = rows.length ? Number(rows[0].quantity) : 0;
  const next = current + delta;
  if (next < 0) throw requestError('Bu konumda yeterli stok bulunmuyor.');
  await connection.execute(`INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`, [productId, locationId, next]);
}

app.post('/api/movements', async (request, response, next) => {
  const parsed = movementInput.safeParse(request.body);
  if (!parsed.success) return response.status(422).json({ message: 'Hareket bilgileri geçersiz.', fields: parsed.error.flatten() });
  const data = parsed.data;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[product]] = await connection.execute('SELECT id FROM products WHERE id = ? AND archived_at IS NULL', [data.productId]);
    if (!product) throw requestError('Ürün bulunamadı.', 404);

    let unit = null;
    if (data.unitCode) {
      const [units] = await connection.execute('SELECT id, product_id FROM inventory_units WHERE code_value = ? FOR UPDATE', [data.unitCode]);
      unit = units[0];
      if (!unit) throw requestError('Okutulan QR/barkod bulunamadı.', 404);
      if (Number(unit.product_id) !== data.productId) throw requestError('Okutulan cihaz seçilen ürüne ait değil.');
    }

    let movementType = data.type;
    let movementQuantity = data.quantity;
    if (data.type === 'IN' || data.type === 'RETURN') {
      if (!data.toLocationId) throw requestError('Giriş yapılacak depo/raf seçilmelidir.');
      await changeBalance(connection, data.productId, data.toLocationId, data.quantity);
      movementType = data.type;
    } else if (data.type === 'OUT') {
      if (!data.fromLocationId) throw requestError('Çıkış yapılacak depo/raf seçilmelidir.');
      await changeBalance(connection, data.productId, data.fromLocationId, -data.quantity);
    } else if (data.type === 'TRANSFER') {
      if (!data.fromLocationId || !data.toLocationId || data.fromLocationId === data.toLocationId) throw requestError('Farklı kaynak ve hedef konum seçilmelidir.');
      await changeBalance(connection, data.productId, data.fromLocationId, -data.quantity);
      await changeBalance(connection, data.productId, data.toLocationId, data.quantity);
      movementType = 'TRANSFER_OUT';
    } else {
      if (!data.toLocationId || data.countedQuantity === undefined) throw requestError('Sayım miktarı ve konum seçilmelidir.');
      const [balanceRows] = await connection.execute('SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ? FOR UPDATE', [data.productId, data.toLocationId]);
      movementQuantity = data.countedQuantity - Number(balanceRows[0]?.quantity || 0);
      await changeBalance(connection, data.productId, data.toLocationId, movementQuantity);
      movementType = 'COUNT_ADJUSTMENT';
    }

    const movementNo = `HRK-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const [movementResult] = await connection.execute(`INSERT INTO inventory_movements
      (movement_no, movement_type, product_id, inventory_unit_id, from_location_id, to_location_id, quantity, reason_text, recipient_name, recipient_unit, document_no, note_text, supplier_id, performed_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      movementNo, movementType, data.productId, unit?.id || null, data.fromLocationId || null, data.toLocationId || null,
      movementQuantity, data.reason, data.recipientName || null, data.recipientUnit || null, data.documentNo || null, data.note || null, data.supplierId || null, request.user.id,
    ]);

    if (data.type === 'OUT' && data.recipientName) {
      await connection.execute(`INSERT INTO loan_records (movement_id, product_id, inventory_unit_id, recipient_name, recipient_unit, quantity, note_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [movementResult.insertId, data.productId, unit?.id || null, data.recipientName, data.recipientUnit || null, movementQuantity, data.note || null]);
    }

    if (unit) {
      const unitStatus = data.type === 'OUT' ? (data.recipientName ? 'ASSIGNED' : 'OUT_OF_STOCK') : 'IN_STOCK';
      const unitLocation = data.type === 'OUT' ? null : (data.toLocationId || null);
      await connection.execute('UPDATE inventory_units SET status = ?, current_location_id = ? WHERE id = ?', [unitStatus, unitLocation, unit.id]);
    }
    await connection.commit();
    response.status(201).json({ movementNo, message: 'Stok hareketi kaydedildi.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.use((error, _request, response, _next) => {
  if (error.status) return response.status(error.status).json({ message: error.message });
  if (error.code === 'ER_DUP_ENTRY') {
    if (error.message?.includes('username')) return response.status(409).json({ message: 'Bu kullanıcı adı zaten kullanılıyor.' });
    return response.status(409).json({ message: 'Bu stok kodu zaten kullanılıyor.' });
  }
  console.error(error);
  response.status(500).json({ message: 'Beklenmeyen bir sunucu hatası oluştu.' });
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_auth_sessions_expiry (expires_at)
    ) ENGINE=InnoDB
  `);
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
  app.listen(port, '0.0.0.0', () => {
    console.log(`Barfas API tüm ağ arayüzlerinde :${port} portunda çalışıyor.`);
  });
}

start().catch((error) => {
  console.error('Barfas API başlatılamadı.', error);
  process.exitCode = 1;
});
