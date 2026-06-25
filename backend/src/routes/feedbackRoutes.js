import express from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { awardPoints } from '../services/gamificationService.js';

const router = express.Router();
router.use(authenticate);

const defaultQuestions = [
  { question_type: 'star_rating', prompt: 'How was the session?', required: true, sort_order: 0 },
  { question_type: 'star_rating', prompt: 'Speaker knowledge rating?', required: true, sort_order: 1 },
  { question_type: 'star_rating', prompt: 'Communication rating?', required: true, sort_order: 2 },
  { question_type: 'nps', prompt: 'Would you recommend this session?', required: true, sort_order: 3 },
  { question_type: 'emoji_rating', prompt: 'How did the session feel?', options: ['Great', 'Good', 'Okay', 'Poor'], sort_order: 4 },
  { question_type: 'text', prompt: 'Key takeaways or suggestions?', sort_order: 5 }
];

function isManager(user) {
  return ['super_admin', 'admin'].includes(user.role);
}

function asNumber(value) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (value && typeof value === 'object') return Object.values(value).join(' ');
  return String(value || '');
}

function sentimentFromAnswers(answers, overallRating, npsScore) {
  const text = answers.map((item) => textValue(item.answer)).join(' ').toLowerCase();
  const positiveWords = ['great', 'good', 'excellent', 'useful', 'helpful', 'clear', 'engaging', 'love'];
  const negativeWords = ['poor', 'bad', 'boring', 'confusing', 'slow', 'unclear', 'not useful'];
  const positive = positiveWords.filter((word) => text.includes(word)).length + (overallRating >= 4 ? 1 : 0) + (npsScore >= 9 ? 1 : 0);
  const negative = negativeWords.filter((word) => text.includes(word)).length + (overallRating && overallRating <= 2 ? 1 : 0) + (npsScore !== null && npsScore <= 6 ? 1 : 0);
  if (positive > negative) return 'positive';
  if (negative > positive) return 'negative';
  return 'neutral';
}

function mapIdentity(row) {
  if (row.anonymous) return { ...row, user_name: 'Anonymous', user_email: null, employee_name: null, employee_email: null };
  return row;
}

async function ensureDefaultForm(eventId, userId = null) {
  const { rows: existing } = await query(`SELECT * FROM feedback_forms WHERE event_id = $1`, [eventId]);
  if (existing[0]) return existing[0];

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO feedback_forms (event_id, title, description, anonymous_mode, auto_trigger, created_by)
       VALUES ($1, 'Event Feedback', 'Share your session rating, suggestions, and takeaways.', false, true, $2)
       RETURNING *`,
      [eventId, userId]
    );
    for (const item of defaultQuestions) {
      await client.query(
        `INSERT INTO feedback_questions (form_id, question_type, prompt, options, required, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [rows[0].id, item.question_type, item.prompt, JSON.stringify(item.options || []), Boolean(item.required), item.sort_order]
      );
    }
    return rows[0];
  });
}

async function autoTriggerCompletedEvents(user) {
  const { rows: events } = await query(
    `SELECT b.id
     FROM event_banners b
     WHERE b.status = 'completed' AND b.feedback_required = true
       AND NOT EXISTS (
         SELECT 1 FROM feedback_triggers t
         WHERE t.event_id = b.id AND t.trigger_mode = 'auto'
       )
     LIMIT 20`
  );
  for (const event of events) {
    const form = await ensureDefaultForm(event.id, null);
    if (!form.auto_trigger) continue;
    await query(
      `INSERT INTO feedback_triggers (event_id, form_id, trigger_mode, message, triggered_by)
       VALUES ($1, $2, 'auto', 'Feedback requested after event completion.', $3)`,
      [event.id, form.id, user?.id || null]
    );
  }
}

router.get('/pending', asyncHandler(async (req, res) => {
  await autoTriggerCompletedEvents(req.user);
  const { rows } = await query(
    `SELECT f.*,
            b.title AS event_title,
            b.event_type,
            b.event_date,
            COALESCE(
              json_agg(q ORDER BY q.sort_order, q.created_at) FILTER (WHERE q.id IS NOT NULL),
              '[]'
            ) AS questions
     FROM feedback_forms f
     JOIN event_banners b ON b.id = f.event_id
     JOIN feedback_triggers t ON t.form_id = f.id
     LEFT JOIN feedback_questions q ON q.form_id = f.id
     WHERE f.status = 'active'
       AND (b.status = 'completed' OR t.trigger_mode = 'manual')
       AND NOT EXISTS (
         SELECT 1 FROM feedback_responses r
         WHERE r.form_id = f.id AND r.user_id = $1
       )
     GROUP BY f.id, b.title, b.event_type, b.event_date
     ORDER BY MAX(t.created_at) DESC
     LIMIT 5`,
    [req.user.id]
  );
  res.json(rows);
}));

router.get('/forms', asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  if (req.query.event_id) {
    params.push(req.query.event_id);
    filters.push(`f.event_id = $${params.length}`);
  }
  if (!isManager(req.user)) filters.push(`f.status = 'active'`);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT f.*,
            b.title AS event_title,
            COALESCE(
              json_agg(q ORDER BY q.sort_order, q.created_at) FILTER (WHERE q.id IS NOT NULL),
              '[]'
            ) AS questions
     FROM feedback_forms f
     JOIN event_banners b ON b.id = f.event_id
     LEFT JOIN feedback_questions q ON q.form_id = f.id
     ${where}
     GROUP BY f.id, b.title
     ORDER BY f.created_at DESC`,
    params
  );
  res.json(rows);
}));

router.post('/forms', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { event_id, title = 'Event Feedback', description, anonymous_mode = false, auto_trigger = true, questions = defaultQuestions } = req.body;
  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO feedback_forms (event_id, title, description, anonymous_mode, auto_trigger, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id)
       DO UPDATE SET title = EXCLUDED.title,
                     description = EXCLUDED.description,
                     anonymous_mode = EXCLUDED.anonymous_mode,
                     auto_trigger = EXCLUDED.auto_trigger,
                     updated_at = NOW()
       RETURNING *`,
      [event_id, title, description || null, anonymous_mode, auto_trigger, req.user.id]
    );
    await client.query(`DELETE FROM feedback_questions WHERE form_id = $1`, [rows[0].id]);
    for (const [index, item] of questions.entries()) {
      await client.query(
        `INSERT INTO feedback_questions (form_id, question_type, prompt, options, required, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [rows[0].id, item.question_type || 'text', item.prompt, JSON.stringify(item.options || []), Boolean(item.required), item.sort_order ?? index]
      );
    }
    return rows[0];
  });
  await auditLog({ userId: req.user.id, action: 'save_feedback_form', entityType: 'feedback_form', entityId: created.id, metadata: req.body, ip: req.ip });
  res.status(201).json(created);
}));

router.post('/events/:eventId/trigger', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const form = await ensureDefaultForm(req.params.eventId, req.user.id);
  const { rows } = await query(
    `INSERT INTO feedback_triggers (event_id, form_id, trigger_mode, message, triggered_by)
     VALUES ($1, $2, 'manual', $3, $4)
     RETURNING *`,
    [req.params.eventId, form.id, req.body.message || 'Admin requested feedback for this event.', req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'manual_feedback_trigger', entityType: 'feedback_trigger', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.post('/forms/:id/responses', asyncHandler(async (req, res) => {
  const { rows: forms } = await query(`SELECT * FROM feedback_forms WHERE id = $1 AND status = 'active'`, [req.params.id]);
  if (!forms[0]) return res.status(404).json({ message: 'Feedback form not found' });
  const form = forms[0];
  const answers = req.body.answers || [];
  const { rows: questions } = await query(`SELECT * FROM feedback_questions WHERE form_id = $1`, [form.id]);
  const byQuestion = new Map(answers.map((item) => [item.question_id, item.answer]));

  const ratingValues = [];
  let npsScore = null;
  const answerPayload = questions.map((question) => {
    const answer = byQuestion.get(question.id);
    if (question.question_type === 'star_rating') {
      const score = asNumber(answer);
      if (score !== null) ratingValues.push(score);
    }
    if (question.question_type === 'nps') npsScore = asNumber(answer);
    return { question, answer };
  });
  const overallRating = ratingValues.length ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length : null;
  const sentiment = sentimentFromAnswers(answerPayload, overallRating, npsScore);
  const anonymous = Boolean(req.body.anonymous || form.anonymous_mode);
  const { rows: employeeRows } = await query(`SELECT id FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`, [req.user.email]);

  const response = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO feedback_responses (form_id, event_id, user_id, employee_id, anonymous, overall_rating, nps_score, sentiment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [form.id, form.event_id, req.user.id, employeeRows[0]?.id || null, anonymous, overallRating, npsScore, sentiment]
    );
    for (const item of answerPayload) {
      await client.query(
        `INSERT INTO feedback_answers (response_id, question_id, answer)
         VALUES ($1, $2, $3::jsonb)`,
        [rows[0].id, item.question.id, JSON.stringify(item.answer ?? '')]
      );
    }
    return rows[0];
  });
  if (response.employee_id) {
    await awardPoints({
      employeeId: response.employee_id,
      userId: response.user_id,
      actionType: 'feedback_submission',
      sourceType: 'feedback_response',
      sourceId: response.id,
      metadata: { form_id: form.id, event_id: form.event_id, anonymous }
    });
  }
  await auditLog({ userId: req.user.id, action: 'submit_feedback', entityType: 'feedback_response', entityId: response.id, metadata: { form_id: form.id, anonymous }, ip: req.ip });
  res.status(201).json(response);
}));

router.patch('/responses/:id/moderate', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  if (req.body.action === 'delete') {
    await query(`DELETE FROM feedback_responses WHERE id = $1`, [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'delete_feedback_response', entityType: 'feedback_response', entityId: req.params.id, ip: req.ip });
    return res.status(204).send();
  }
  const statusMap = { approve: 'approved', hide: 'hidden', pending: 'pending' };
  const nextStatus = statusMap[req.body.action];
  if (!nextStatus) return res.status(400).json({ message: 'Invalid moderation action' });
  const { rows } = await query(
    `UPDATE feedback_responses SET moderation_status = $1 WHERE id = $2 RETURNING *`,
    [nextStatus, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Feedback response not found' });
  await auditLog({ userId: req.user.id, action: `${req.body.action}_feedback_response`, entityType: 'feedback_response', entityId: req.params.id, ip: req.ip });
  res.json(rows[0]);
}));

router.get('/dashboard', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const params = [];
  const filter = req.query.event_id ? `WHERE r.event_id = $1` : '';
  if (req.query.event_id) params.push(req.query.event_id);
  const [summary, trends, comments] = await Promise.all([
    query(
      `SELECT COUNT(r.id)::int AS total_responses,
              COALESCE(AVG(r.overall_rating), 0)::numeric(5,2) AS average_rating,
              COALESCE(AVG(r.nps_score), 0)::numeric(5,2) AS average_nps,
              COUNT(*) FILTER (WHERE r.sentiment = 'positive')::int AS positive_count,
              COUNT(*) FILTER (WHERE r.sentiment = 'negative')::int AS negative_count
       FROM feedback_responses r
       ${filter}`,
      params
    ),
    query(
      `SELECT DATE_TRUNC('day', r.submitted_at)::date AS day,
              COUNT(r.id)::int AS responses,
              COALESCE(AVG(r.overall_rating), 0)::numeric(5,2) AS average_rating
       FROM feedback_responses r
       ${filter}
       GROUP BY day
       ORDER BY day DESC
       LIMIT 30`,
      params
    ),
    query(
      `SELECT r.*,
              b.title AS event_title,
              u.name AS user_name,
              u.email AS user_email,
              e.employee_name,
              e.email AS employee_email,
              COALESCE(
                json_agg(json_build_object('question', q.prompt, 'type', q.question_type, 'answer', a.answer) ORDER BY q.sort_order) FILTER (WHERE a.id IS NOT NULL),
                '[]'
              ) AS answers
       FROM feedback_responses r
       JOIN event_banners b ON b.id = r.event_id
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN employees e ON e.id = r.employee_id
       LEFT JOIN feedback_answers a ON a.response_id = r.id
       LEFT JOIN feedback_questions q ON q.id = a.question_id
       ${filter}
       GROUP BY r.id, b.title, u.name, u.email, e.employee_name, e.email
       ORDER BY r.submitted_at DESC
       LIMIT 100`,
      params
    )
  ]);
  res.json({
    summary: summary.rows[0],
    trends: trends.rows,
    responses: comments.rows.map(mapIdentity)
  });
}));

router.post('/summary', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const params = [];
  const filter = req.body.event_id ? `WHERE r.event_id = $1` : '';
  if (req.body.event_id) params.push(req.body.event_id);
  const { rows } = await query(
    `SELECT r.sentiment, r.overall_rating, r.nps_score, a.answer
     FROM feedback_responses r
     LEFT JOIN feedback_answers a ON a.response_id = r.id
     LEFT JOIN feedback_questions q ON q.id = a.question_id
     ${filter}`,
    params
  );
  const text = rows.map((row) => textValue(row.answer)).join(' ');
  const suggestions = text
    .split(/[.!?]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 12)
    .slice(0, 5);
  const positiveCount = rows.filter((row) => row.sentiment === 'positive').length;
  const negativeCount = rows.filter((row) => row.sentiment === 'negative').length;
  res.json({
    positive_highlights: positiveCount ? ['Audience found useful, clear, or engaging parts in the session.'] : ['No strong positive pattern yet.'],
    improvement_areas: negativeCount ? ['Review low-rated comments and unclear content mentions.'] : ['No strong negative pattern yet.'],
    common_suggestions: suggestions.length ? suggestions : ['Collect more text feedback for stronger suggestion clustering.'],
    sentiment_analysis: positiveCount > negativeCount ? 'positive' : negativeCount > positiveCount ? 'negative' : 'neutral'
  });
}));

export default router;
