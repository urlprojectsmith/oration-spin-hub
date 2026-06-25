import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

const trendSeeds = ['AI workflow automation', 'cybersecurity hygiene', 'cloud cost optimization', 'data storytelling', 'design systems', 'API reliability'];

function titleCase(value = '') {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function generateTopics({ department = 'General', skill_level = 'intermediate', previous_topics = '', trending = '' }) {
  const dept = titleCase(department || 'General');
  const level = titleCase(skill_level || 'intermediate');
  const previous = previous_topics
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const trends = (trending || trendSeeds.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return trends.slice(0, 6).map((trend, index) => {
    const base = `${dept} Playbook: ${titleCase(trend)}`;
    const title = previous.some((item) => base.toLowerCase().includes(item))
      ? `${base} - Next Practices`
      : base;
    return {
      title,
      category: dept,
      skill_level: level.toLowerCase(),
      description: `${level} session covering practical use cases, risks, demos, and team-ready takeaways for ${trend}.`,
      department: dept,
      source: 'ai',
      confidence: 88 - index * 4
    };
  });
}

function generateOutline({ topic, audience = 'office audience', duration = '20 minutes' }) {
  const title = topic || 'High Impact Oration Session';
  return {
    title,
    introduction: [
      `Open with a relatable ${audience} problem connected to ${title}.`,
      `State why this matters now and what the audience will be able to use after ${duration}.`
    ],
    main_points: [
      `Define the core idea in plain language.`,
      `Show a practical workflow or framework.`,
      `Discuss common mistakes and how to avoid them.`,
      `Connect the topic to team or department outcomes.`
    ],
    examples: [
      `Use one internal scenario or customer-style story.`,
      `Include one quick demo, metric, or before-and-after comparison.`
    ],
    conclusion: [
      `Summarize the three strongest takeaways.`,
      `Close with one action the audience can try this week.`
    ],
    qa_suggestions: [
      `What is the easiest first step for a beginner?`,
      `Where can this fail in real projects?`,
      `How should teams measure improvement?`
    ]
  };
}

router.post('/topics/generate', asyncHandler(async (req, res) => {
  const topics = generateTopics(req.body);
  const saved = [];
  if (req.body.save) {
    for (const topic of topics) {
      const { rows } = await query(
        `INSERT INTO topic_suggestions (title, description, category, department, skill_level, source, submitted_by)
         VALUES ($1, $2, $3, $4, $5, 'ai', $6)
         RETURNING *`,
        [topic.title, topic.description, topic.category, topic.department, topic.skill_level, req.user.id]
      );
      saved.push(rows[0]);
    }
  }
  await auditLog({ userId: req.user.id, action: 'generate_ai_topics', entityType: 'ai_generated_asset', metadata: req.body, ip: req.ip });
  res.json({ topics, saved });
}));

router.post('/outlines/generate', asyncHandler(async (req, res) => {
  const outline = generateOutline(req.body);
  let saved = null;
  if (req.body.save) {
    const { rows } = await query(
      `INSERT INTO ai_generated_assets (asset_type, title, content, created_by)
       VALUES ('outline', $1, $2::jsonb, $3)
       RETURNING *`,
      [outline.title, JSON.stringify(outline), req.user.id]
    );
    saved = rows[0];
  }
  await auditLog({ userId: req.user.id, action: 'generate_ai_outline', entityType: 'ai_generated_asset', metadata: { title: outline.title }, ip: req.ip });
  res.json({ outline, saved });
}));

router.post('/admin-assistant', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').toLowerCase();
  let answer = '';
  let rows = [];

  if (question.includes('not spoken') && question.includes('month')) {
    const result = await query(
      `SELECT e.employee_id, e.employee_name, e.email
       FROM employees e
       WHERE e.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM spin_results r
           WHERE LOWER(r.winner_email) = LOWER(e.email)
             AND r.wheel_type = 'speaker'
             AND DATE_TRUNC('month', r.created_at) = DATE_TRUNC('month', CURRENT_DATE)
         )
       ORDER BY e.employee_name`
    );
    rows = result.rows;
    answer = `${rows.length} active employees have not spoken this month.`;
  } else if (question.includes('next') && question.includes('queue')) {
    const result = await query(
      `SELECT s.event_date, s.event_time, s.event_type, e.employee_name, e.email
       FROM speaker_schedules s
       LEFT JOIN employees e ON e.id = s.selected_speaker_id
       WHERE s.event_date >= CURRENT_DATE AND s.status IN ('Scheduled', 'Rescheduled')
       ORDER BY s.event_date ASC, s.event_time ASC NULLS LAST
       LIMIT 5`
    );
    rows = result.rows;
    answer = rows[0] ? `${rows[0].employee_name || 'TBD'} is next in queue.` : 'No upcoming speaker is scheduled.';
  } else if (question.includes('top speaker')) {
    const result = await query(
      `SELECT winner_name, winner_email, COUNT(*)::int AS sessions
       FROM spin_results
       WHERE wheel_type = 'speaker'
       GROUP BY winner_name, winner_email
       ORDER BY sessions DESC, winner_name ASC
       LIMIT 10`
    );
    rows = result.rows;
    answer = rows[0] ? `${rows[0].winner_name} currently leads with ${rows[0].sessions} speaker sessions.` : 'No speaker history yet.';
  } else if (question.includes('low participation')) {
    const result = await query(
      `SELECT e.employee_id, e.employee_name, e.email, COUNT(r.id)::int AS sessions
       FROM employees e
       LEFT JOIN spin_results r ON LOWER(r.winner_email) = LOWER(e.email) AND r.wheel_type = 'speaker'
       WHERE e.status = 'active'
       GROUP BY e.id
       ORDER BY sessions ASC, e.employee_name ASC
       LIMIT 10`
    );
    rows = result.rows;
    answer = 'These employees have the lowest speaking participation.';
  } else {
    answer = 'Try asking: Who has not spoken this month? Who is next in queue? Top speakers. Low participation employees.';
  }

  res.json({ answer, rows });
}));

export default router;
