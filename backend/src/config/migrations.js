import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from './db.js';

export async function applyBaseSchema() {
  const schemaPath = process.env.SCHEMA_PATH || path.resolve(process.cwd(), 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await query(schema);
}

export async function ensureRuntimeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS event_banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      event_date DATE,
      event_type TEXT NOT NULL DEFAULT 'Oration Task',
      assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('draft', 'upcoming', 'live', 'completed', 'cancelled')),
      hero_tone TEXT NOT NULL DEFAULT 'neon' CHECK (hero_tone IN ('neon', 'gold', 'cyber', 'aurora')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_quiz_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT,
      points INT NOT NULL DEFAULT 10,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT,
      events TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id UUID REFERENCES webhook_subscriptions(id) ON DELETE SET NULL,
      event_name TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
      response_status INT,
      response_body TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_event_banners_status_date ON event_banners(status, event_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC)`);
}

