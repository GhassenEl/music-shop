import { pool } from './db.js';

/** Images servies par le front Vite: http://localhost:3100/products/... */
const images = {
  'GT-FSTR-001': '/products/gt-fstr.jpg',
  'GT-LPS-002': '/products/gt-lps.jpg',
  'GT-AC-003': '/products/gt-ac.jpg',
  'BS-JB-010': '/products/bs-jb.jpg',
  'BS-STG-011': '/products/bs-stg.jpg',
  'DR-SPD-020': '/products/dr-spd.jpg',
  'DR-ELEC-021': '/products/dr-elec.jpg',
  'KB-PSR-030': '/products/kb-psr.jpg',
  'KB-NORD-031': '/products/kb-nord.jpg',
  'AM-VOX-040': '/products/am-vox.jpg',
  'AM-MRSH-041': '/products/am-mx.jpg',
  'AC-CAB-050': '/products/ac-cab.jpg',
  'AC-STR-051': '/products/ac-str.jpg',
  'AC-STD-052': '/products/ac-std.jpg',
  'GT-IBZ-004': '/products/gt-ibz.jpg',
};

const texts = {
  'GT-FSTR-001': { name: 'Stratocaster Player', description: 'Guitare électrique polyvalente, corps aulne, micro single-coil.' },
  'GT-LPS-002': { name: 'Les Paul Standard', description: 'Sons chauds et sustain, ideal rock / blues.' },
  'GT-AC-003': { name: 'FG830 Acoustique', description: 'Acoustique solide pour débutants et composition.' },
  'BS-JB-010': { name: 'Jazz Bass V', description: 'Basse 5 cordes, gorge confortable.' },
  'BS-STG-011': { name: 'StingRay Special', description: 'Attack percussif signature StingRay.' },
  'DR-SPD-020': { name: 'SpeedFire Drum Set', description: "Kit complet 5 fûts + cymbales d'initiation." },
  'DR-ELEC-021': { name: 'TD-17KVX Electronic', description: 'Batterie électronique mesh pads, module TD-17.' },
  'KB-PSR-030': { name: 'PSR-E473', description: 'Clavier arrangeur 61 touches, styles modernes.' },
  'KB-NORD-031': { name: 'Nord Stage 4 Compact', description: 'Workstation scène, sons piano / orgue / synth.' },
  'AM-VOX-040': { name: 'AC15C1', description: 'Combo à lampes 15W, son britannique classique.' },
  'AM-MRSH-041': { name: 'MG10XU Mixer', description: 'Console 10 voies USB, effets SPX.' },
  'AC-CAB-050': { name: 'Câble jack 6m Pro', description: 'Câble instrument blindé, connecteurs or.' },
  'AC-STR-051': { name: 'Cordes EXL110', description: "Jeu nickel wound 10-46." },
  'AC-STD-052': { name: 'Stand guitare X', description: 'Support stable pour guitare / basse.' },
  'GT-IBZ-004': { name: 'RG450DXB', description: 'Guitare métal / hard rock, micro Quantum.' },
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
  await pool.query(`SET NAMES utf8mb4`);

  if (!(await hasColumn('products', 'image_url'))) {
    await pool.query(`ALTER TABLE products ADD COLUMN image_url VARCHAR(500) NULL AFTER image_emoji`);
    console.log('+ products.image_url');
  }

  for (const [sku, url] of Object.entries(images)) {
    const t = texts[sku];
    await pool.query(
      `UPDATE products SET image_url = :url, name = :name, description = :description WHERE sku = :sku`,
      { url, name: t.name, description: t.description, sku }
    );
  }
  console.log('images + textes UTF-8 mis à jour');

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
    ['invoice_number', `VARCHAR(40) NULL`],
    ['receipt_number', `VARCHAR(40) NULL`],
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
