import { pool } from './db.js';

const images = {
  'GT-FSTR-001': 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
  'GT-LPS-002': 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?auto=format&fit=crop&w=800&q=80',
  'GT-AC-003': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80',
  'BS-JB-010': 'https://images.unsplash.com/photo-1556449895-a33c9dba33dd?auto=format&fit=crop&w=800&q=80',
  'BS-STG-011': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80',
  'DR-SPD-020': 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=800&q=80',
  'DR-ELEC-021': 'https://images.unsplash.com/photo-1571327073757-71ad63c2a91e?auto=format&fit=crop&w=800&q=80',
  'KB-PSR-030': 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=800&q=80',
  'KB-NORD-031': 'https://images.unsplash.com/photo-1552422535-c45813c61732?auto=format&fit=crop&w=800&q=80',
  'AM-VOX-040': 'https://images.unsplash.com/photo-1525201544353-043616f32786?auto=format&fit=crop&w=800&q=80',
  'AM-MRSH-041': 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80',
  'AC-CAB-050': 'https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80',
  'AC-STR-051': 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
  'AC-STD-052': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
  'GT-IBZ-004': 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?auto=format&fit=crop&w=800&q=80',
};

async function hasColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column }
  );
  return Number(rows[0].c) > 0;
}

async function hasTable(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table }
  );
  return Number(rows[0].c) > 0;
}

async function migrate() {
  if (!(await hasColumn('products', 'image_url'))) {
    await pool.query(`ALTER TABLE products ADD COLUMN image_url VARCHAR(500) NULL AFTER image_emoji`);
    console.log('+ products.image_url');
  }

  for (const [sku, url] of Object.entries(images)) {
    await pool.query(`UPDATE products SET image_url = :url WHERE sku = :sku`, { url, sku });
  }

  if (!(await hasTable('seasonal_promotions'))) {
    await pool.query(`
      CREATE TABLE seasonal_promotions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        season ENUM('hiver','printemps','ete','automne','soldes','ramadan','rentree') NOT NULL,
        discount_percent DECIMAL(5,2) NOT NULL,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        description VARCHAR(255) NULL
      )`);
    console.log('+ seasonal_promotions');
  }

  const [promoCount] = await pool.query(`SELECT COUNT(*) AS c FROM seasonal_promotions`);
  if (Number(promoCount[0].c) === 0) {
    await pool.query(`
      INSERT INTO seasonal_promotions (code, name, season, discount_percent, starts_on, ends_on, active, description) VALUES
      ('ETE2026', 'Soldes d''été MusicShop', 'ete', 15.00, '2026-06-01', '2026-08-31', 1, 'Remise saisonnière été sur toute la commande'),
      ('RENTREE26', 'Rentrée musicale', 'rentree', 10.00, '2026-09-01', '2026-09-30', 1, 'Promo rentrée écoles de musique'),
      ('HIVER26', 'Hivernales Soft', 'hiver', 8.00, '2026-12-01', '2027-02-28', 1, 'Remise hiver'),
      ('FLASH50', 'Flash weekend (inactif)', 'soldes', 50.00, '2025-01-01', '2025-01-02', 0, 'Expirée')`);
    console.log('+ seed promotions');
  }

  const orderCols = [
    ['invoice_number', `VARCHAR(40) NULL UNIQUE`],
    ['receipt_number', `VARCHAR(40) NULL UNIQUE`],
    ['subtotal', `DECIMAL(10,2) NOT NULL DEFAULT 0`],
    ['discount_percent', `DECIMAL(5,2) NOT NULL DEFAULT 0`],
    ['discount_amount', `DECIMAL(10,2) NOT NULL DEFAULT 0`],
    ['tax_amount', `DECIMAL(10,2) NOT NULL DEFAULT 0`],
    ['promotion_id', `INT NULL`],
    ['payment_method', `VARCHAR(40) NULL`],
    ['paid_at', `TIMESTAMP NULL`],
  ];
  for (const [col, def] of orderCols) {
    if (!(await hasColumn('orders', col))) {
      await pool.query(`ALTER TABLE orders ADD COLUMN ${col} ${def}`);
      console.log(`+ orders.${col}`);
    }
  }

  // Expand enum for invoiced
  await pool.query(`
    ALTER TABLE orders
    MODIFY status ENUM('pending','invoiced','paid','shipped','cancelled') NOT NULL DEFAULT 'pending'
  `);

  if (!(await hasColumn('order_items', 'line_total'))) {
    await pool.query(`ALTER TABLE order_items ADD COLUMN line_total DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER unit_price`);
    await pool.query(`UPDATE order_items SET line_total = quantity * unit_price`);
    console.log('+ order_items.line_total');
  }

  console.log('Migration OK');
  process.exit(0);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
