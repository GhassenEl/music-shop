import { pool } from './db.js';

async function wait() {
  const max = 40;
  for (let i = 1; i <= max; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('MySQL prêt');
      process.exit(0);
    } catch (e) {
      console.log(`Attente MySQL (${i}/${max})… ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('MySQL indisponible');
  process.exit(1);
}

wait();
