import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'music',
  password: process.env.DB_PASSWORD || 'music123',
  database: process.env.DB_NAME || 'music_shop',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function pingDb() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}
