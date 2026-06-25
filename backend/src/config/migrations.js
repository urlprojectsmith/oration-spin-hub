import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from './db.js';

export async function applyBaseSchema() {
  const schemaPath = process.env.SCHEMA_PATH || path.resolve(process.cwd(), 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await query(schema);
}

export async function ensureRuntimeSchema() {
  await query(`ALTER TABLE speaker_schedules ADD COLUMN IF NOT EXISTS event_time TIME`);

  await query(`
    CREATE TABLE IF NOT EXISTS event_banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      event_date DATE,
      event_time TIME,
      event_type TEXT NOT NULL DEFAULT 'Oration Task',
      event_category TEXT NOT NULL DEFAULT 'Oration' CHECK (event_category IN ('Oration', 'Training', 'Workshop', 'Quiz', 'Debate', 'Demo', 'Celebration')),
      event_mode TEXT NOT NULL DEFAULT 'standard' CHECK (event_mode IN ('standard', 'debate', 'team_battle')),
      department TEXT,
      presenter TEXT,
      expected_audience INT,
      banner_image_url TEXT,
      template TEXT NOT NULL DEFAULT 'corporate',
      quiz_required BOOLEAN NOT NULL DEFAULT false,
      feedback_required BOOLEAN NOT NULL DEFAULT true,
      approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'need_clarification', 'on_hold')),
      approval_note TEXT,
      approval_history JSONB NOT NULL DEFAULT '[]',
      published_at TIMESTAMPTZ,
      assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('draft', 'upcoming', 'live', 'completed', 'cancelled')),
      hero_tone TEXT NOT NULL DEFAULT 'neon' CHECK (hero_tone IN ('neon', 'gold', 'cyber', 'aurora')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS event_time TIME`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS event_category TEXT NOT NULL DEFAULT 'Oration'`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS event_mode TEXT NOT NULL DEFAULT 'standard'`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS department TEXT`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS presenter TEXT`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS expected_audience INT`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS banner_image_url TEXT`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT 'corporate'`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS quiz_required BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS feedback_required BOOLEAN NOT NULL DEFAULT true`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS approval_note TEXT`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS approval_history JSONB NOT NULL DEFAULT '[]'`);
  await query(`ALTER TABLE event_banners ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);

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
    CREATE TABLE IF NOT EXISTS event_debates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL UNIQUE REFERENCES event_banners(id) ON DELETE CASCADE,
      team_a_name TEXT NOT NULL DEFAULT 'Team A',
      team_b_name TEXT NOT NULL DEFAULT 'Team B',
      team_a_members JSONB NOT NULL DEFAULT '[]',
      team_b_members JSONB NOT NULL DEFAULT '[]',
      moderator_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      winner_team TEXT NOT NULL DEFAULT 'pending' CHECK (winner_team IN ('pending', 'team_a', 'team_b', 'draw')),
      notes TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_team_battles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL UNIQUE REFERENCES event_banners(id) ON DELETE CASCADE,
      team_a_department TEXT NOT NULL,
      team_b_department TEXT NOT NULL,
      team_a_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      team_b_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      winner_department TEXT,
      notes TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_live_polls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'closed')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_live_poll_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      poll_id UUID NOT NULL REFERENCES event_live_polls(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      option_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (poll_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_resources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('PDF', 'PPT', 'Video', 'Link', 'Document')),
      title TEXT NOT NULL,
      resource_url TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      file_size BIGINT,
      uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      version_number INT NOT NULL,
      snapshot JSONB NOT NULL,
      change_summary TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_id, version_number)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS speaker_preparations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      schedule_id UUID NOT NULL UNIQUE REFERENCES speaker_schedules(id) ON DELETE CASCADE,
      topic_selected BOOLEAN NOT NULL DEFAULT false,
      slides_uploaded BOOLEAN NOT NULL DEFAULT false,
      demo_ready BOOLEAN NOT NULL DEFAULT false,
      notes_prepared BOOLEAN NOT NULL DEFAULT false,
      rehearsal_completed BOOLEAN NOT NULL DEFAULT false,
      topic TEXT,
      slides_url TEXT,
      notes TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      read_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS speaker_reminder_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      schedule_id UUID NOT NULL REFERENCES speaker_schedules(id) ON DELETE CASCADE,
      reminder_key TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (schedule_id, reminder_key, channel)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS topic_suggestions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      department TEXT,
      skill_level TEXT NOT NULL DEFAULT 'intermediate',
      source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
      submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS topic_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      topic_id UUID NOT NULL REFERENCES topic_suggestions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (topic_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ai_generated_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_type TEXT NOT NULL CHECK (asset_type IN ('topic', 'outline')),
      title TEXT NOT NULL,
      content JSONB NOT NULL DEFAULT '{}',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID REFERENCES event_banners(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai')),
      timer_minutes INT NOT NULL DEFAULT 15,
      pass_percentage INT NOT NULL DEFAULT 60,
      negative_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
      random_questions BOOLEAN NOT NULL DEFAULT false,
      random_options BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'short_answer', 'long_answer', 'rating')),
      prompt TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]',
      correct_answer JSONB NOT NULL DEFAULT '[]',
      points NUMERIC(8,2) NOT NULL DEFAULT 10,
      bonus_points NUMERIC(8,2) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      explanation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      max_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      correct_count INT NOT NULL DEFAULT 0,
      wrong_count INT NOT NULL DEFAULT 0,
      bonus_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      rank INT,
      passed BOOLEAN NOT NULL DEFAULT false,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
      answer JSONB NOT NULL DEFAULT '[]',
      is_correct BOOLEAN,
      score NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (attempt_id, question_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS feedback_forms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      anonymous_mode BOOLEAN NOT NULL DEFAULT false,
      auto_trigger BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS feedback_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL CHECK (question_type IN ('star_rating', 'emoji_rating', 'multiple_choice', 'text', 'nps')),
      prompt TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]',
      required BOOLEAN NOT NULL DEFAULT false,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS feedback_triggers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      form_id UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
      trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('auto', 'manual')),
      message TEXT,
      triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS feedback_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES event_banners(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      anonymous BOOLEAN NOT NULL DEFAULT false,
      moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
      overall_rating NUMERIC(5,2),
      nps_score INT,
      sentiment TEXT NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS feedback_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      response_id UUID NOT NULL REFERENCES feedback_responses(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES feedback_questions(id) ON DELETE CASCADE,
      answer JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (response_id, question_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS gamification_point_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_type TEXT NOT NULL UNIQUE CHECK (action_type IN ('attend_event', 'complete_quiz', 'pass_quiz', 'speaker', 'coordinator', 'feedback_submission')),
      label TEXT NOT NULL,
      points INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS gamification_point_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('attend_event', 'complete_quiz', 'pass_quiz', 'speaker', 'coordinator', 'feedback_submission')),
      points INT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}',
      awarded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, action_type, source_type, source_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS employee_achievements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      achievement_key TEXT NOT NULL CHECK (achievement_key IN ('first_speaker', 'quiz_master', 'knowledge_champion', 'top_coordinator', 'best_presenter')),
      title TEXT NOT NULL,
      description TEXT,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}',
      UNIQUE (employee_id, achievement_key)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS employee_skill_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      tag TEXT NOT NULL CHECK (tag IN ('Communication', 'Leadership', 'Technical', 'Sales', 'AI', 'Others')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, tag)
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
  await query(`CREATE INDEX IF NOT EXISTS idx_event_banners_approval ON event_banners(approval_status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_banners_category ON event_banners(event_category, event_mode, event_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_polls_event ON event_live_polls(event_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_resources_event ON event_resources(event_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_versions_event ON event_versions(event_id, version_number DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_speaker_preparations_schedule ON speaker_preparations(schedule_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON in_app_notifications(user_id, read_at, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reminders_schedule ON speaker_reminder_logs(schedule_id, reminder_key)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_topic_suggestions_category ON topic_suggestions(category, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_quizzes_event ON quizzes(event_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, sort_order)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_score ON quiz_attempts(quiz_id, total_score DESC, submitted_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_feedback_forms_event ON feedback_forms(event_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_feedback_responses_event ON feedback_responses(event_id, submitted_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_feedback_responses_moderation ON feedback_responses(moderation_status, submitted_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_feedback_triggers_event ON feedback_triggers(event_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_gamification_points_employee ON gamification_point_events(employee_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_gamification_points_scope ON gamification_point_events(action_type, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_achievements_employee ON employee_achievements(employee_id, awarded_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_skill_tags_tag ON employee_skill_tags(tag)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC)`);

  const pointRules = [
    ['attend_event', 'Attend Event', 10],
    ['complete_quiz', 'Complete Quiz', 20],
    ['pass_quiz', 'Pass Quiz', 30],
    ['speaker', 'Speaker', 60],
    ['coordinator', 'Coordinator', 35],
    ['feedback_submission', 'Feedback Submission', 10]
  ];
  for (const [actionType, label, points] of pointRules) {
    await query(
      `INSERT INTO gamification_point_rules (action_type, label, points)
       VALUES ($1, $2, $3)
       ON CONFLICT (action_type)
       DO NOTHING`,
      [actionType, label, points]
    );
  }
}
