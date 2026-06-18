CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL UNIQUE,
  employee_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  already_spoken BOOLEAN NOT NULL DEFAULT false,
  coordinator_eligible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wheels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wheel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id UUID NOT NULL REFERENCES wheels(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wheel_id, label)
);

CREATE TABLE IF NOT EXISTS spin_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_type TEXT NOT NULL CHECK (wheel_type IN ('speaker', 'coordinator', 'custom')),
  cycle_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (wheel_type, cycle_number)
);

CREATE TABLE IF NOT EXISTS spin_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_type TEXT NOT NULL CHECK (wheel_type IN ('speaker', 'coordinator', 'custom')),
  wheel_id UUID REFERENCES wheels(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  custom_entry_id UUID REFERENCES wheel_entries(id) ON DELETE SET NULL,
  winner_name TEXT NOT NULL,
  winner_email TEXT,
  selected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cycle_id UUID REFERENCES spin_cycles(id) ON DELETE SET NULL,
  cycle_number INT,
  event_date DATE,
  notes TEXT,
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS speaker_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  day TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'Oration Task',
  selected_speaker_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  selected_coordinator_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Completed', 'Rescheduled', 'Cancelled')),
  notes TEXT,
  reschedule_reason TEXT,
  cycle_number INT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_date, event_type)
);

CREATE TABLE IF NOT EXISTS coordinator_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  day TEXT NOT NULL,
  selected_coordinator_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Completed', 'Rescheduled', 'Cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'webex')),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  message TEXT,
  selected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

CREATE TABLE IF NOT EXISTS event_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  points INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_employees_status_spoken ON employees(status, already_spoken);
CREATE INDEX IF NOT EXISTS idx_spin_results_type_date ON spin_results(wheel_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON speaker_schedules(event_date);
CREATE INDEX IF NOT EXISTS idx_event_banners_status_date ON event_banners(status, event_date);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
