import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const runtimeDbFile = path.join(dataDir, 'database-url.txt');
let pool;

const databaseState = {
  connected: false,
  checkedAt: null,
  lastError: null,
  lastErrorCode: null
};

function updateDatabaseState({ connected, error = null }) {
  databaseState.connected = connected;
  databaseState.checkedAt = new Date().toISOString();
  databaseState.lastError = error ? error.message : null;
  databaseState.lastErrorCode = error ? (error.code || null) : null;
}

function logDatabaseError(error, connectionString) {
  const target = connectionString || 'DATABASE_URL is not configured';
  console.warn(`[database] connection failed for ${target}: ${error.code || error.message}`);
}

export function getDatabaseState() {
  return {
    connected: databaseState.connected,
    checkedAt: databaseState.checkedAt,
    lastError: databaseState.lastError,
    lastErrorCode: databaseState.lastErrorCode
  };
}

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

export async function probeDatabase(connectionString = getDatabaseUrl(), options = {}) {
  if (!connectionString) {
    const error = new Error('Database is not configured');
    error.status = 503;
    error.code = 'DATABASE_NOT_CONFIGURED';
    updateDatabaseState({ connected: false, error });
    return { connected: false, error };
  }

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis || 1500
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    updateDatabaseState({ connected: true });
    return { connected: true };
  } catch (error) {
    logDatabaseError(error, connectionString);
    updateDatabaseState({ connected: false, error });
    return { connected: false, error };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function testDatabaseConnection(connectionString = getDatabaseUrl(), options = {}) {
  const result = await probeDatabase(connectionString, options);
  if (!result.connected) {
    const error = result.error || new Error('Database is not reachable');
    if (!error.status) error.status = 503;
    throw error;
  }
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
