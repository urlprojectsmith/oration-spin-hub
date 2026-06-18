import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS || 40);
const delayMs = Number(process.env.DB_WAIT_DELAY_MS || 1500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log(`Database is reachable after ${attempt} attempt(s).`);
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => {});
    console.log(`Waiting for database (${attempt}/${maxAttempts}): ${error.code || error.message}`);
    await sleep(delayMs);
  }
}

console.error('Database did not become reachable in time.');
process.exit(1);

