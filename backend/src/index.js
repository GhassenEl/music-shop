import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, pingDb } from './db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5100);
const TAX_RATE = 0.19; // TVA TN

app.use(cors({ origin: ['http://localhost:3100', 'http://127.0.0.1:3100'] }));
app.use(express.json());

function mapProduct(r) {
  return {
    ...r,
    price: Number(r.price),
    featured: Boolean(r.featured),
    imageUrl: r.imageUrl || r.image_url || null,
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function getActivePromotion(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, name, season, discount_percent AS discountPercent,
            starts_on AS startsOn, ends_on AS endsOn, description
     FROM seasonal_promotions
     WHERE active = 1 AND CURDATE() BETWEEN starts_on AND ends_on
     ORDER BY discount_percent DESC
     LIMIT 1`
  );
  if (!rows.length) return null;
  return { ...rows[0], discountPercent: Number(rows[0].discountPercent) };
}

async function buildOrderView(orderId) {
  const [orders] = await pool.query(
    `SELECT o.id, o.status, o.invoice_number AS invoiceNumber, o.receipt_number AS receiptNumber,
            o.subtotal, o.discount_percent AS discountPercent, o.discount_amount AS discountAmount,
            o.tax_amount AS taxAmount, o.total, o.payment_method AS paymentMethod,
            o.paid_at AS paidAt, o.created_at AS createdAt, o.promotion_id AS promotionId,
            cu.full_name AS customerName, cu.email AS customerEmail, cu.phone AS customerPhone,
            sp.code AS promoCode, sp.name AS promoName, sp.season AS promoSeason
     FROM orders o
     JOIN customers cu ON cu.id = o.customer_id
     LEFT JOIN seasonal_promotions sp ON sp.id = o.promotion_id
     WHERE o.id = :id`,
    { id: orderId }
  );
  if (!orders.length) return null;
  const o = orders[0];
  const [items] = await pool.query(
    `SELECT oi.id, oi.quantity, oi.unit_price AS unitPrice, oi.line_total AS lineTotal,
            p.id AS productId, p.name, p.brand, p.sku, p.image_url AS imageUrl
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = :id`,
    { id: orderId }
  );
  return {
    id: o.id,
    status: o.status,
    invoiceNumber: o.invoiceNumber,
    receiptNumber: o.receiptNumber,
    subtotal: Number(o.subtotal),
    discountPercent: Number(o.discountPercent),
    discountAmount: Number(o.discountAmount),
    taxAmount: Number(o.taxAmount),
    total: Number(o.total),
    paymentMethod: o.paymentMethod,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    customer: {
      name: o.customerName,
      email: o.customerEmail,
      phone: o.customerPhone,
    },
    promotion: o.promoCode
      ? { code: o.promoCode, name: o.promoName, season: o.promoSeason }
      : null,
    items: items.map((it) => ({
      ...it,
      unitPrice: Number(it.unitPrice),
      lineTotal: Number(it.lineTotal),
    })),
  };
}

app.get('/api/v1', (_req, res) => {
  res.json({
    ok: true,
    service: 'music-shop-api',
    version: 'v1',
    endpoints: [
      'GET /api/v1/health',
      'GET /api/v1/promotions/active',
      'GET /api/v1/products',
      'POST /api/v1/orders',
      'GET /api/v1/orders/:id',
      'GET /api/v1/orders/:id/invoice',
      'POST /api/v1/orders/:id/pay',
      'GET /api/v1/orders/:id/receipt',
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

app.get('/api/v1/promotions/active', async (_req, res, next) => {
  try {
    const promo = await getActivePromotion();
    const [all] = await pool.query(
      `SELECT code, name, season, discount_percent AS discountPercent,
              starts_on AS startsOn, ends_on AS endsOn, active, description
       FROM seasonal_promotions ORDER BY starts_on DESC`
    );
    res.json({
      active: promo,
      items: all.map((p) => ({ ...p, discountPercent: Number(p.discountPercent), active: Boolean(p.active) })),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/stats', async (_req, res, next) => {
  try {
    const [[p]] = await pool.query('SELECT COUNT(*) AS products, SUM(stock) AS stock FROM products');
    const [[c]] = await pool.query('SELECT COUNT(*) AS categories FROM categories');
    const [[o]] = await pool.query(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END),0) AS revenue
       FROM orders`
    );
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
    const promo = await getActivePromotion();

    if (category) {
      where.push('(c.slug = :category OR c.id = :categoryId)');
      params.category = String(category);
      params.categoryId = Number(category) || 0;
    }
    if (q) {
      where.push('(p.name LIKE :q OR p.brand LIKE :q OR p.description LIKE :q)');
      params.q = `%${q}%`;
    }
    if (featured === '1' || featured === 'true') where.push('p.featured = 1');

    const sql = `
      SELECT p.id, p.sku, p.name, p.brand, p.price, p.stock, p.description,
             p.image_emoji AS imageEmoji, p.image_url AS imageUrl, p.featured,
             c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.featured DESC, p.name ASC`;

    const [rows] = await pool.query(sql, params);
    const discount = promo?.discountPercent || 0;
    res.json({
      activePromotion: promo,
      items: rows.map((r) => {
        const price = Number(r.price);
        const discounted = discount ? round2(price * (1 - discount / 100)) : price;
        return {
          ...mapProduct(r),
          originalPrice: price,
          price: discounted,
          discountPercent: discount,
        };
      }),
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
              p.image_emoji AS imageEmoji, p.image_url AS imageUrl, p.featured,
              c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = :id`,
      { id: Number(req.params.id) }
    );
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(mapProduct(rows[0]));
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/orders', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.status, o.invoice_number AS invoiceNumber, o.receipt_number AS receiptNumber,
              o.subtotal, o.discount_amount AS discountAmount, o.total, o.created_at AS createdAt,
              cu.full_name AS customerName, cu.email AS customerEmail
       FROM orders o
       JOIN customers cu ON cu.id = o.customer_id
       ORDER BY o.created_at DESC
       LIMIT 50`
    );
    res.json({
      items: rows.map((r) => ({
        ...r,
        subtotal: Number(r.subtotal),
        discountAmount: Number(r.discountAmount),
        total: Number(r.total),
      })),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/orders/:id', async (req, res, next) => {
  try {
    const order = await buildOrderView(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    res.json(order);
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/orders/:id/invoice', async (req, res, next) => {
  try {
    const order = await buildOrderView(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    res.json({
      type: 'invoice',
      title: 'Facture MusicShop',
      ...order,
      taxRate: TAX_RATE,
      payable: order.status === 'invoiced' || order.status === 'pending',
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/orders/:id/receipt', async (req, res, next) => {
  try {
    const order = await buildOrderView(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.status !== 'paid') {
      return res.status(409).json({ error: 'Reçu disponible uniquement après paiement' });
    }
    res.json({
      type: 'receipt',
      title: 'Reçu de paiement MusicShop',
      ...order,
      message: 'Merci pour votre achat — paiement confirmé.',
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
    const promo = await getActivePromotion(conn);

    const [custResult] = await conn.query(
      `INSERT INTO customers (full_name, email, phone) VALUES (:fullName, :email, :phone)`,
      {
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone || null,
      }
    );
    const customerId = custResult.insertId;

    let subtotal = 0;
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
      const lineTotal = round2(unit * qty);
      subtotal += lineTotal;
      prepared.push({ productId, quantity: qty, unitPrice: unit, lineTotal });
    }

    subtotal = round2(subtotal);
    const discountPercent = promo ? Number(promo.discountPercent) : 0;
    const discountAmount = round2(subtotal * (discountPercent / 100));
    const taxable = round2(subtotal - discountAmount);
    const taxAmount = round2(taxable * TAX_RATE);
    const total = round2(taxable + taxAmount);

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (customer_id, status, subtotal, discount_percent, discount_amount, tax_amount, total, promotion_id)
       VALUES
        (:customerId, 'pending', :subtotal, :discountPercent, :discountAmount, :taxAmount, :total, :promotionId)`,
      {
        customerId,
        subtotal,
        discountPercent,
        discountAmount,
        taxAmount,
        total,
        promotionId: promo?.id || null,
      }
    );
    const orderId = orderResult.insertId;
    const invoiceNumber = `FAC-${new Date().getFullYear()}-${String(orderId).padStart(5, '0')}`;

    await conn.query(
      `UPDATE orders SET invoice_number = :invoiceNumber, status = 'invoiced' WHERE id = :orderId`,
      { invoiceNumber, orderId }
    );

    for (const it of prepared) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
         VALUES (:orderId, :productId, :quantity, :unitPrice, :lineTotal)`,
        { orderId, ...it }
      );
      await conn.query(
        `UPDATE products SET stock = stock - :quantity WHERE id = :productId`,
        { quantity: it.quantity, productId: it.productId }
      );
    }

    await conn.commit();
    const order = await buildOrderView(orderId);
    res.status(201).json({
      ok: true,
      message: 'Commande créée — facture émise',
      order,
      invoice: {
        type: 'invoice',
        title: 'Facture MusicShop',
        ...order,
        taxRate: TAX_RATE,
        payable: true,
      },
    });
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  } finally {
    conn.release();
  }
});

app.post('/api/v1/orders/:id/pay', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const orderId = Number(req.params.id);
    const method = String(req.body?.paymentMethod || 'carte').toLowerCase();
    const allowed = ['carte', 'espece', 'virement', 'paypal'];
    if (!allowed.includes(method)) {
      return res.status(400).json({ error: `Méthode invalide (${allowed.join(', ')})` });
    }

    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, status FROM orders WHERE id = :id FOR UPDATE`,
      { id: orderId }
    );
    if (!rows.length) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
    if (rows[0].status === 'paid') throw Object.assign(new Error('Déjà payée'), { status: 409 });
    if (rows[0].status === 'cancelled') throw Object.assign(new Error('Commande annulée'), { status: 409 });

    const receiptNumber = `REC-${new Date().getFullYear()}-${String(orderId).padStart(5, '0')}`;
    await conn.query(
      `UPDATE orders
       SET status = 'paid', payment_method = :method, paid_at = NOW(), receipt_number = :receiptNumber
       WHERE id = :id`,
      { method, receiptNumber, id: orderId }
    );
    await conn.commit();

    const order = await buildOrderView(orderId);
    res.json({
      ok: true,
      message: 'Paiement confirmé — reçu généré',
      order,
      receipt: {
        type: 'receipt',
        title: 'Reçu de paiement MusicShop',
        ...order,
        message: 'Merci pour votre achat — paiement confirmé.',
      },
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
