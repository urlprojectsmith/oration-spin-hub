import { query } from '../config/db.js';

export const pointRuleDefaults = [
  { action_type: 'attend_event', label: 'Attend Event', points: 10 },
  { action_type: 'complete_quiz', label: 'Complete Quiz', points: 20 },
  { action_type: 'pass_quiz', label: 'Pass Quiz', points: 30 },
  { action_type: 'speaker', label: 'Speaker', points: 60 },
  { action_type: 'coordinator', label: 'Coordinator', points: 35 },
  { action_type: 'feedback_submission', label: 'Feedback Submission', points: 10 }
];

export const skillTags = ['Communication', 'Leadership', 'Technical', 'Sales', 'AI', 'Others'];

export const levels = [
  { name: 'Bronze', min_points: 0 },
  { name: 'Silver', min_points: 150 },
  { name: 'Gold', min_points: 350 },
  { name: 'Platinum', min_points: 700 },
  { name: 'Diamond', min_points: 1200 },
  { name: 'Master', min_points: 2000 }
];

const achievements = {
  first_speaker: {
    title: 'First Speaker',
    description: 'Completed the first speaker selection.'
  },
  quiz_master: {
    title: 'Quiz Master',
    description: 'Passed at least three quizzes.'
  },
  knowledge_champion: {
    title: 'Knowledge Champion',
    description: 'Built a strong quiz performance score.'
  },
  top_coordinator: {
    title: 'Top Coordinator',
    description: 'Coordinated three or more sessions.'
  },
  best_presenter: {
    title: 'Best Presenter',
    description: 'Maintained excellent presenter ratings.'
  }
};

function runner(client) {
  return client || { query };
}

function levelFor(points) {
  return levels.reduce((current, level) => (Number(points || 0) >= level.min_points ? level : current), levels[0]);
}

export function decorateLevel(row) {
  const points = Number(row.total_points || 0);
  const current = levelFor(points);
  const next = levels.find((level) => level.min_points > points) || null;
  return {
    ...row,
    total_points: points,
    level: current.name,
    next_level: next?.name || null,
    points_to_next: next ? next.min_points - points : 0
  };
}

export async function seedPointRules(client = null) {
  const db = runner(client);
  for (const item of pointRuleDefaults) {
    await db.query(
      `INSERT INTO gamification_point_rules (action_type, label, points)
       VALUES ($1, $2, $3)
       ON CONFLICT (action_type)
       DO NOTHING`,
      [item.action_type, item.label, item.points]
    );
  }
}

async function awardAchievement(db, employeeId, key, metadata = {}) {
  const item = achievements[key];
  if (!item) return null;
  const { rows } = await db.query(
    `INSERT INTO employee_achievements (employee_id, achievement_key, title, description, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (employee_id, achievement_key)
     DO NOTHING
     RETURNING *`,
    [employeeId, key, item.title, item.description, JSON.stringify(metadata)]
  );
  return rows[0] || null;
}

export async function evaluateAchievements(employeeId, client = null) {
  if (!employeeId) return [];
  const db = runner(client);
  const [speaker, quiz, coordinator, presenter] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS sessions
       FROM spin_results
       WHERE employee_id = $1 AND wheel_type = 'speaker'`,
      [employeeId]
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE passed)::int AS passed_quizzes,
              COALESCE(SUM(total_score), 0)::numeric(10,2) AS quiz_points,
              COALESCE(AVG(percentage), 0)::numeric(5,2) AS average_percentage
       FROM quiz_attempts
       WHERE employee_id = $1 AND submitted_at IS NOT NULL`,
      [employeeId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS sessions
       FROM spin_results
       WHERE employee_id = $1 AND wheel_type = 'coordinator'`,
      [employeeId]
    ),
    db.query(
      `SELECT COALESCE(AVG(r.overall_rating), 0)::numeric(5,2) AS average_rating,
              COUNT(r.id)::int AS ratings
       FROM event_banners b
       JOIN feedback_responses r ON r.event_id = b.id
       WHERE b.assigned_employee_id = $1 AND r.overall_rating IS NOT NULL`,
      [employeeId]
    )
  ]);

  const created = [];
  if (speaker.rows[0].sessions >= 1) created.push(await awardAchievement(db, employeeId, 'first_speaker', speaker.rows[0]));
  if (quiz.rows[0].passed_quizzes >= 3) created.push(await awardAchievement(db, employeeId, 'quiz_master', quiz.rows[0]));
  if (Number(quiz.rows[0].quiz_points) >= 250 || Number(quiz.rows[0].average_percentage) >= 85) {
    created.push(await awardAchievement(db, employeeId, 'knowledge_champion', quiz.rows[0]));
  }
  if (coordinator.rows[0].sessions >= 3) created.push(await awardAchievement(db, employeeId, 'top_coordinator', coordinator.rows[0]));
  if (Number(presenter.rows[0].average_rating) >= 4.5 && presenter.rows[0].ratings >= 3) {
    created.push(await awardAchievement(db, employeeId, 'best_presenter', presenter.rows[0]));
  }
  return created.filter(Boolean);
}

export async function awardPoints({
  employeeId,
  userId = null,
  actionType,
  sourceType = 'manual',
  sourceId = null,
  metadata = {},
  awardedBy = null,
  pointsOverride = null,
  client = null
}) {
  if (!employeeId || !actionType) return null;
  const db = runner(client);
  await seedPointRules(client);
  const { rows: rules } = await db.query(
    `SELECT * FROM gamification_point_rules WHERE action_type = $1 AND active = true`,
    [actionType]
  );
  const rule = rules[0];
  if (!rule && pointsOverride === null) return null;
  const points = pointsOverride === null || pointsOverride === undefined ? Number(rule.points || 0) : Number(pointsOverride);
  const { rows } = await db.query(
    `INSERT INTO gamification_point_events (employee_id, user_id, action_type, points, source_type, source_id, metadata, awarded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (employee_id, action_type, source_type, source_id)
     DO NOTHING
     RETURNING *`,
    [employeeId, userId, actionType, points, sourceType, sourceId, JSON.stringify(metadata), awardedBy]
  );
  if (rows[0]) await evaluateAchievements(employeeId, client);
  return rows[0] || null;
}

export async function findEmployeeForUser(user, client = null) {
  if (!user?.email) return null;
  const db = runner(client);
  const { rows } = await db.query(`SELECT * FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`, [user.email]);
  return rows[0] || null;
}

export async function getLeaderboard({ scope = 'all_time', limit = 25 } = {}) {
  const filters = [];
  if (scope === 'monthly') filters.push(`DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
  if (scope === 'quarterly') filters.push(`DATE_TRUNC('quarter', p.created_at) = DATE_TRUNC('quarter', CURRENT_DATE)`);
  if (scope === 'yearly') filters.push(`DATE_TRUNC('year', p.created_at) = DATE_TRUNC('year', CURRENT_DATE)`);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `WITH point_totals AS (
       SELECT p.employee_id,
              COALESCE(SUM(p.points), 0)::int AS total_points,
              COUNT(p.id)::int AS point_events
       FROM gamification_point_events p
       ${where}
       GROUP BY p.employee_id
     ),
     tag_totals AS (
       SELECT employee_id, json_agg(tag ORDER BY tag) AS skill_tags
       FROM employee_skill_tags
       GROUP BY employee_id
     ),
     achievement_totals AS (
       SELECT employee_id, json_agg(title ORDER BY awarded_at DESC) AS achievements
       FROM employee_achievements
       GROUP BY employee_id
     )
     SELECT e.id,
            e.employee_name,
            e.email,
            COALESCE(pt.total_points, 0)::int AS total_points,
            COALESCE(pt.point_events, 0)::int AS point_events,
            COALESCE(tt.skill_tags, '[]'::json) AS skill_tags,
            COALESCE(at.achievements, '[]'::json) AS achievements
     FROM employees e
     LEFT JOIN point_totals pt ON pt.employee_id = e.id
     LEFT JOIN tag_totals tt ON tt.employee_id = e.id
     LEFT JOIN achievement_totals at ON at.employee_id = e.id
     ORDER BY total_points DESC, point_events DESC, e.employee_name ASC
     LIMIT $1`,
    [Math.min(Number(limit) || 25, 100)]
  );
  return rows.map(decorateLevel);
}

export async function getHallOfFame() {
  const [monthly, quarterly, yearly] = await Promise.all([
    getLeaderboard({ scope: 'monthly', limit: 5 }),
    getLeaderboard({ scope: 'quarterly', limit: 5 }),
    getLeaderboard({ scope: 'yearly', limit: 5 })
  ]);
  return { monthly, quarterly, yearly };
}

export async function getSpeakerRankings() {
  const { rows } = await query(
    `WITH attendance AS (
       SELECT employee_id, COUNT(*)::int AS attendance_count
       FROM gamification_point_events
       WHERE action_type = 'attend_event'
       GROUP BY employee_id
     ),
     point_totals AS (
       SELECT employee_id, COALESCE(SUM(points), 0)::int AS participation_points
       FROM gamification_point_events
       GROUP BY employee_id
     ),
     speakers AS (
       SELECT employee_id, COUNT(*)::int AS speaker_sessions
       FROM spin_results
       WHERE wheel_type = 'speaker'
       GROUP BY employee_id
     ),
     coordinators AS (
       SELECT employee_id, COUNT(*)::int AS coordinator_sessions
       FROM spin_results
       WHERE wheel_type = 'coordinator'
       GROUP BY employee_id
     ),
     presenter_ratings AS (
       SELECT b.assigned_employee_id AS employee_id,
              COALESCE(AVG(r.overall_rating), 0)::numeric(5,2) AS average_rating
       FROM event_banners b
       JOIN feedback_responses r ON r.event_id = b.id AND r.overall_rating IS NOT NULL
       WHERE b.assigned_employee_id IS NOT NULL
       GROUP BY b.assigned_employee_id
     ),
     quiz_scores AS (
       SELECT employee_id, COALESCE(AVG(percentage), 0)::numeric(5,2) AS quiz_average
       FROM quiz_attempts
       WHERE submitted_at IS NOT NULL
       GROUP BY employee_id
     ),
     tag_totals AS (
       SELECT employee_id, json_agg(tag ORDER BY tag) AS skill_tags
       FROM employee_skill_tags
       GROUP BY employee_id
     )
     SELECT e.id,
            e.employee_name,
            e.email,
            COALESCE(attendance.attendance_count, 0)::int AS attendance_count,
            COALESCE(speakers.speaker_sessions, 0)::int AS speaker_sessions,
            COALESCE(coordinators.coordinator_sessions, 0)::int AS coordinator_sessions,
            COALESCE(presenter_ratings.average_rating, 0)::numeric(5,2) AS average_rating,
            COALESCE(quiz_scores.quiz_average, 0)::numeric(5,2) AS quiz_average,
            COALESCE(point_totals.participation_points, 0)::int AS participation_points,
            COALESCE(tag_totals.skill_tags, '[]'::json) AS skill_tags
     FROM employees e
     LEFT JOIN attendance ON attendance.employee_id = e.id
     LEFT JOIN speakers ON speakers.employee_id = e.id
     LEFT JOIN coordinators ON coordinators.employee_id = e.id
     LEFT JOIN presenter_ratings ON presenter_ratings.employee_id = e.id
     LEFT JOIN quiz_scores ON quiz_scores.employee_id = e.id
     LEFT JOIN point_totals ON point_totals.employee_id = e.id
     LEFT JOIN tag_totals ON tag_totals.employee_id = e.id
     WHERE e.status = 'active'
     ORDER BY (
       COALESCE(point_totals.participation_points, 0)
       + COALESCE(attendance.attendance_count, 0) * 8
       + COALESCE(speakers.speaker_sessions, 0) * 20
       + COALESCE(coordinators.coordinator_sessions, 0) * 10
       + COALESCE(presenter_ratings.average_rating, 0) * 20
       + COALESCE(quiz_scores.quiz_average, 0)
     ) DESC,
     e.employee_name ASC
     LIMIT 100`
  );
  return rows.map((row) => ({
    ...row,
    speaker_score: Math.round(
      Number(row.participation_points || 0)
      + Number(row.attendance_count || 0) * 8
      + Number(row.speaker_sessions || 0) * 20
      + Number(row.coordinator_sessions || 0) * 10
      + Number(row.average_rating || 0) * 20
      + Number(row.quiz_average || 0)
    )
  }));
}
