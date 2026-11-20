import { pool } from './database.js';

try {
  const [rows] = await pool.query('SELECT DATABASE() AS database_name, NOW() AS checked_at');
  console.log(JSON.stringify(rows[0], null, 2));
  await pool.end();
} catch (error) {
  console.error(`MySQL bağlantısı kurulamadı: ${error.message}`);
  process.exitCode = 1;
}
