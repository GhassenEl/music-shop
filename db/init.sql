CREATE DATABASE IF NOT EXISTS music_shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE music_shop;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  category_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  description TEXT,
  image_emoji VARCHAR(16) DEFAULT '🎸',
  image_url VARCHAR(500) NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS seasonal_promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  season ENUM('hiver','printemps','ete','automne','soldes','ramadan','rentree') NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  description VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  status ENUM('pending','invoiced','paid','shipped','cancelled') NOT NULL DEFAULT 'pending',
  invoice_number VARCHAR(40) NULL UNIQUE,
  receipt_number VARCHAR(40) NULL UNIQUE,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  promotion_id INT NULL,
  payment_method VARCHAR(40) NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_orders_promo FOREIGN KEY (promotion_id) REFERENCES seasonal_promotions(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO categories (name, slug) VALUES
  ('Guitares', 'guitares'),
  ('Basses', 'basses'),
  ('Batteries', 'batteries'),
  ('Claviers', 'claviers'),
  ('Audio & Ampli', 'audio-ampli'),
  ('Accessoires', 'accessoires');

INSERT INTO products (sku, name, brand, category_id, price, stock, description, image_emoji, image_url, featured) VALUES
  ('GT-FSTR-001', 'Stratocaster Player', 'Fender', 1, 899.00, 8, 'Guitare électrique polyvalente, corps aulne, micro single-coil.', '🎸', '/products/gt-fstr.jpg', 1),
  ('GT-LPS-002', 'Les Paul Standard', 'Gibson', 1, 2499.00, 3, 'Sons chauds et sustain, ideal rock / blues.', '🎸', '/products/gt-lps.jpg', 1),
  ('GT-AC-003', 'FG830 Acoustique', 'Yamaha', 1, 279.00, 15, 'Acoustique solide pour débutants et composition.', '🪕', '/products/gt-ac.jpg', 0),
  ('BS-JB-010', 'Jazz Bass V', 'Fender', 2, 1190.00, 5, 'Basse 5 cordes, gorge confortable.', '🎸', '/products/bs-jb.jpg', 1),
  ('BS-STG-011', 'StingRay Special', 'Music Man', 2, 1899.00, 4, 'Attack percussif signature StingRay.', '🎸', '/products/bs-stg.jpg', 0),
  ('DR-SPD-020', 'SpeedFire Drum Set', 'Pearl', 3, 749.00, 6, 'Kit complet 5 fûts + cymbales d''initiation.', '🥁', '/products/dr-spd.jpg', 1),
  ('DR-ELEC-021', 'TD-17KVX Electronic', 'Roland', 3, 1599.00, 4, 'Batterie électronique mesh pads, module TD-17.', '🥁', '/products/dr-elec.jpg', 1),
  ('KB-PSR-030', 'PSR-E473', 'Yamaha', 4, 329.00, 12, 'Clavier arrangeur 61 touches, styles modernes.', '🎹', '/products/kb-psr.jpg', 0),
  ('KB-NORD-031', 'Nord Stage 4 Compact', 'Nord', 4, 3990.00, 2, 'Workstation scène, sons piano / orgue / synth.', '🎹', '/products/kb-nord.jpg', 1),
  ('AM-VOX-040', 'AC15C1', 'Vox', 5, 599.00, 7, 'Combo à lampes 15W, son britannique classique.', '🔊', '/products/am-vox.jpg', 1),
  ('AM-MRSH-041', 'MG10XU Mixer', 'Yamaha', 5, 229.00, 10, 'Console 10 voies USB, effets SPX.', '🎚️', '/products/am-mx.jpg', 0),
  ('AC-CAB-050', 'Câble jack 6m Pro', 'Planet Waves', 6, 24.90, 40, 'Câble instrument blindé, connecteurs or.', '🔌', '/products/ac-cab.jpg', 0),
  ('AC-STR-051', 'Cordes EXL110', 'D''Addario', 6, 8.50, 100, 'Jeu nickel wound 10-46.', '🧵', '/products/ac-str.jpg', 0),
  ('AC-STD-052', 'Stand guitare X', 'Hercules', 6, 39.00, 25, 'Support stable pour guitare / basse.', '🧰', '/products/ac-std.jpg', 0),
  ('GT-IBZ-004', 'RG450DXB', 'Ibanez', 1, 449.00, 9, 'Guitare métal / hard rock, micro Quantum.', '🎸', '/products/gt-ibz.jpg', 0);

INSERT INTO seasonal_promotions (code, name, season, discount_percent, starts_on, ends_on, active, description) VALUES
  ('ETE2026', 'Soldes d''été MusicShop', 'ete', 15.00, '2026-06-01', '2026-08-31', 1, 'Remise saisonnière été sur toute la commande'),
  ('RENTREE26', 'Rentrée musicale', 'rentree', 10.00, '2026-09-01', '2026-09-30', 1, 'Promo rentrée écoles de musique'),
  ('HIVER26', 'Hivernales Soft', 'hiver', 8.00, '2026-12-01', '2027-02-28', 1, 'Remise hiver'),
  ('FLASH50', 'Flash weekend (inactif)', 'soldes', 50.00, '2025-01-01', '2025-01-02', 0, 'Expirée');
