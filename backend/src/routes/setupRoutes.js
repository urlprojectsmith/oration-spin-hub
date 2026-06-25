import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configureDatabase, hasDatabaseConfig, probeDatabase, query, testDatabaseConnection } from '../config/db.js';
import { ensureRuntimeSchema } from '../config/migrations.js';
import { seedDatabase } from '../seed.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

async function hasUsersTable() {
  try {
    const { rows } = await query(`SELECT to_regclass('public.users') AS table_name`);
    return Boolean(rows[0]?.table_name);
  } catch {
    return false;
  }
}

async function runSchemaSql() {
  const schemaPath = process.env.SCHEMA_PATH || path.resolve(process.cwd(), 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await query(schema);
}

router.get('/status', asyncHandler(async (req, res) => {
  if (!hasDatabaseConfig()) {
    return res.json({ configured: false, ready: false, needsSetup: true });
  }

  const probe = await probeDatabase();
  if (!probe.connected) {
    return res.json({ configured: true, ready: false, needsSetup: true, error: probe.error?.message || 'database unavailable' });
  }

  const ready = await hasUsersTable();
  res.json({ configured: true, ready, needsSetup: !ready });
}));

router.post('/test-database', asyncHandler(async (req, res) => {
  await testDatabaseConnection(req.body.database_url);
  res.json({ ok: true, message: 'Database connection successful' });
}));

router.post('/sync-database', asyncHandler(async (req, res) => {
  const { database_url } = req.body;
  if (!database_url) return res.status(400).json({ message: 'database_url is required' });

  await testDatabaseConnection(database_url);
  await configureDatabase(database_url);
  await runSchemaSql();
  await ensureRuntimeSchema();
  await seedDatabase();

  res.json({
    ok: true,
    message: 'Database synced and seed data created',
    login: {
      email: 'superadmin@oration.local',
      password: process.env.SEED_USER_PASSWORD || 'Oration@2026!'
    }
  });
}));

export default router;
