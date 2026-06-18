import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { emitWebhookEvent } from '../services/webhookService.js';

const router = express.Router();
router.use(authenticate);

function mapEvent(row) {
  return {
    ...row,
    questions: row.questions || []
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const params = [];
  const filters = [];
  if (status) {
    params.push(status);
    filters.push(`b.status = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT b.*,
            e.employee_name,
            e.email AS employee_email,
            u.name AS created_by_name,
            COALESCE(
              json_agg(q ORDER BY q.sort_order, q.created_at) FILTER (WHERE q.id IS NOT NULL),
              '[]'
            ) AS questions
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     LEFT JOIN users u ON u.id = b.created_by
     LEFT JOIN event_quiz_questions q ON q.event_id = b.id
     ${where}
     GROUP BY b.id, e.employee_name, e.email, u.name
     ORDER BY COALESCE(b.event_date, b.created_at::date) ASC, b.created_at DESC`,
    params
  );
  res.json(rows.map(mapEvent));
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { title, description, event_date, event_type, assigned_employee_id, status = 'upcoming', hero_tone = 'neon', questions = [] } = req.body;
  const { rows } = await query(
    `INSERT INTO event_banners
     (title, description, event_date, event_type, assigned_employee_id, status, hero_tone, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [title, description || null, event_date || null, event_type || 'Oration Task', assigned_employee_id || null, status, hero_tone, req.user.id]
  );

  for (const [index, item] of questions.entries()) {
    if (!item.question) continue;
    await query(
      `INSERT INTO event_quiz_questions (event_id, question, answer, points, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].id, item.question, item.answer || null, item.points || 10, item.sort_order ?? index]
    );
  }

  await auditLog({ userId: req.user.id, action: 'create_event_banner', entityType: 'event_banner', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  await emitWebhookEvent('event.created', { event: rows[0], createdBy: req.user });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { title, description, event_date, event_type, assigned_employee_id, status, hero_tone, questions } = req.body;
  const { rows } = await query(
    `UPDATE event_banners
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         event_date = COALESCE($3, event_date),
         event_type = COALESCE($4, event_type),
         assigned_employee_id = COALESCE($5, assigned_employee_id),
         status = COALESCE($6, status),
         hero_tone = COALESCE($7, hero_tone),
         updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [title, description, event_date, event_type, assigned_employee_id, status, hero_tone, req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ message: 'Event banner not found' });

  if (Array.isArray(questions)) {
    await query(`DELETE FROM event_quiz_questions WHERE event_id = $1`, [rows[0].id]);
    for (const [index, item] of questions.entries()) {
      if (!item.question) continue;
      await query(
        `INSERT INTO event_quiz_questions (event_id, question, answer, points, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, item.question, item.answer || null, item.points || 10, item.sort_order ?? index]
      );
    }
  }

  await auditLog({ userId: req.user.id, action: 'update_event_banner', entityType: 'event_banner', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  await emitWebhookEvent('event.updated', { event: rows[0], updatedBy: req.user });
  res.json(rows[0]);
}));

router.delete('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM event_banners WHERE id = $1`, [req.params.id]);
  await auditLog({ userId: req.user.id, action: 'delete_event_banner', entityType: 'event_banner', entityId: req.params.id, ip: req.ip });
  await emitWebhookEvent('event.deleted', { id: req.params.id, deletedBy: req.user });
  res.status(204).send();
}));

router.post('/:id/questions', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { question, answer, points = 10, sort_order = 0 } = req.body;
  const { rows } = await query(
    `INSERT INTO event_quiz_questions (event_id, question, answer, points, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.params.id, question, answer || null, points, sort_order]
  );
  await emitWebhookEvent('event.question.created', { eventId: req.params.id, question: rows[0] });
  res.status(201).json(rows[0]);
}));

router.patch('/:id/questions/:questionId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { question, answer, points, sort_order } = req.body;
  const { rows } = await query(
    `UPDATE event_quiz_questions
     SET question = COALESCE($1, question),
         answer = COALESCE($2, answer),
         points = COALESCE($3, points),
         sort_order = COALESCE($4, sort_order),
         updated_at = NOW()
     WHERE event_id = $5 AND id = $6
     RETURNING *`,
    [question, answer, points, sort_order, req.params.id, req.params.questionId]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Quiz question not found' });
  await emitWebhookEvent('event.question.updated', { eventId: req.params.id, question: rows[0] });
  res.json(rows[0]);
}));

router.delete('/:id/questions/:questionId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM event_quiz_questions WHERE event_id = $1 AND id = $2`, [req.params.id, req.params.questionId]);
  await emitWebhookEvent('event.question.deleted', { eventId: req.params.id, questionId: req.params.questionId });
  res.status(204).send();
}));

export default router;
