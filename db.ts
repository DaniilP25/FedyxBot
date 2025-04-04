import { Pool } from 'pg';

const pool = new Pool({
  user: 'your_username',
  host: 'your_host',
  database: 'your_database',
  password: 'postgresXOLOKOCT',
  port: 8841,
});

async function main() {
  try {
    const res = await pool.query('SELECT * FROM your_table');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    // Вызов pool.end() только при завершении приложения
    await pool.end();
    process.exit(0);
  }
}

main();
