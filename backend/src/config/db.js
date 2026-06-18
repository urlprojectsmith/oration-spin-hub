import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const runtimeDbFile = path.join(dataDir, 'database-url.txt');
let pool;

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (fs.existsSync(runtimeDbFile)) return fs.readFileSync(runtimeDbFile, 'utf8').trim();
  return '';
}

export function hasDatabaseConfig() {
  return Boolean(getDatabaseUrl());
}

export function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    const error = new Error('Database is not configured');
    error.status = 503;
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}

export async function configureDatabase(connectionString) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(runtimeDbFile, connectionString, 'utf8');
  process.env.DATABASE_URL = connectionString;
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function testDatabaseConnection(connectionString = getDatabaseUrl()) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
}

export async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
