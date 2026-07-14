import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, pingDb } from './db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5100);

app.use(cors({ origin: ['http://localhost:3100', 'http://127.0.0.1:3100'] }));
app.use(express.json());

app.get('/api/v1', (_req, res) => {
  res.json({
    ok: true,
    service: 'music-shop-api',
    version: 'v1',
    endpoints: [
      'GET /api/v1/health',
      'GET /api/v1/categories',
      'GET /api/v1/products',
      'GET /api/v1/products/:id',
      'GET /api/v1/stats',
      'POST /api/v1/orders',
      'GET /api/v1/orders',
    ],
  });
});

app.get('/api/v1/health', async (_req, res) => {
  try {
    const db = await pingDb();
    res.json({ ok: true, service: 'music-shop-api', db });
  } catch (e) {
    res.status(503).json({ ok: false, service: 'music-shop-api', error: e.message });
  }
});

app.get('/api/v1/stats', async (_req, res, next) => {
  try {
    const [[p]] = await pool.query('SELECT COUNT(*) AS products, SUM(stock) AS stock FROM products');
    const [[c]] = await pool.query('SELECT COUNT(*) AS categories FROM categories');
    const [[o]] = await pool.query('SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders');
    res.json({
      products: Number(p.products),
      stock: Number(p.stock || 0),
      categories: Number(c.categories),
      orders: Number(o.orders),
      revenue: Number(o.revenue),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.slug, COUNT(p.id) AS productCount
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id
       ORDER BY c.name`
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/products', async (req, res, next) => {
  try {
    const { category, q, featured } = req.query;
    const where = [];
    const params = {};

    if (category) {
      where.push('(c.slug = :category OR c.id = :categoryId)');
      params.category = String(category);
      params.categoryId = Number(category) || 0;
    }
    if (q) {
      where.push('(p.name LIKE :q OR p.brand LIKE :q OR p.description LIKE :q)');
      params.q = `%${q}%`;
    }
    if (featured === '1' || featured === 'true') {
      where.push('p.featured = 1');
    }

    const sql = `
      SELECT p.id, p.sku, p.name, p.brand, p.price, p.stock, p.description,
             p.image_emoji AS imageEmoji, p.featured,
             c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.featured DESC, p.name ASC`;

    const [rows] = await pool.query(sql, params);
    res.json({
      items: rows.map((r) => ({
        ...r,
        price: Number(r.price),
        featured: Boolean(r.featured),
      })),
      count: rows.length,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/products/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.sku, p.name, p.brand, p.price, p.stock, p.description,
              p.image_emoji AS imageEmoji, p.featured,
              c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = :id`,
      { id: Number(req.params.id) }
    );
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable' });
    const r = rows[0];
    res.json({ ...r, price: Number(r.price), featured: Boolean(r.featured) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/orders', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.status, o.total, o.created_at AS createdAt,
              cu.full_name AS customerName, cu.email AS customerEmail
       FROM orders o
       JOIN customers cu ON cu.id = o.customer_id
       ORDER BY o.created_at DESC
       LIMIT 50`
    );
    res.json({
      items: rows.map((r) => ({ ...r, total: Number(r.total) })),
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/orders', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { customer, items } = req.body || {};
    if (!customer?.fullName || !customer?.email || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer + items requis' });
    }

    await conn.beginTransaction();

    const [custResult] = await conn.query(
      `INSERT INTO customers (full_name, email, phone) VALUES (:fullName, :email, :phone)`,
      {
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone || null,
      }
    );
    const customerId = custResult.insertId;

    let total = 0;
    const prepared = [];
    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const productId = Number(it.productId);
      if (!productId || qty < 1) {
        throw Object.assign(new Error('Item invalide'), { status: 400 });
      }
      const [prows] = await conn.query(
        `SELECT id, price, stock, name FROM products WHERE id = :id FOR UPDATE`,
        { id: productId }
      );
      if (!prows.length) throw Object.assign(new Error(`Produit ${productId} introuvable`), { status: 404 });
      if (prows[0].stock < qty) {
        throw Object.assign(new Error(`Stock insuffisant pour ${prows[0].name}`), { status: 409 });
      }
      const unit = Number(prows[0].price);
      total += unit * qty;
      prepared.push({ productId, quantity: qty, unitPrice: unit });
    }

    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, status, total) VALUES (:customerId, 'pending', :total)`,
      { customerId, total }
    );
    const orderId = orderResult.insertId;

    for (const it of prepared) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES (:orderId, :productId, :quantity, :unitPrice)`,
        { orderId, ...it }
      );
      await conn.query(
        `UPDATE products SET stock = stock - :quantity WHERE id = :productId`,
        { quantity: it.quantity, productId: it.productId }
      );
    }

    await conn.commit();
    res.status(201).json({
      ok: true,
      orderId,
      total,
      status: 'pending',
      items: prepared.length,
    });
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  } finally {
    conn.release();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Music Shop API http://localhost:${PORT}/api/v1`);
});
