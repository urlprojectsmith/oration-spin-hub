import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { emitWebhookEvent } from '../services/webhookService.js';

const router = express.Router();
router.use(authenticate);

const managerRoles = ['super_admin', 'admin'];
const eventCategories = ['Oration', 'Training', 'Workshop', 'Quiz', 'Debate', 'Demo', 'Celebration'];
const eventModes = ['standard', 'debate', 'team_battle'];
const approvalActions = {
  approve: { status: 'approved', eventStatus: 'upcoming', audit: 'approve_event_request' },
  reject: { status: 'rejected', eventStatus: 'draft', audit: 'reject_event_request' },
  hold: { status: 'on_hold', eventStatus: 'draft', audit: 'hold_event_request' },
  clarification: { status: 'need_clarification', eventStatus: 'draft', audit: 'request_event_clarification' }
};

function isManager(user) {
  return managerRoles.includes(user.role);
}

function mapEvent(row) {
  return {
    ...row,
    questions: row.questions || [],
    can_edit: Boolean(row.can_edit),
    can_delete: Boolean(row.can_delete),
    can_approve: Boolean(row.can_approve)
  };
}

function canUserManageEvent(row, user) {
  if (isManager(user)) return true;
  return row.created_by === user.id || row.employee_email?.toLowerCase() === user.email.toLowerCase();
}

function isUserEditableRequest(row, user) {
  return row.created_by === user.id && ['pending', 'need_clarification', 'on_hold'].includes(row.approval_status);
}

function buildHistoryItem({ action, note, user }) {
  return {
    action,
    note: note || '',
    by: { id: user.id, name: user.name, role: user.role },
    at: new Date().toISOString()
  };
}

function eventSelectClause({ managerParam, userIdParam, userEmailParam }) {
  return `b.*,
          e.employee_name,
          e.email AS employee_email,
          u.name AS created_by_name,
          ($${managerParam}::boolean OR b.created_by = $${userIdParam} OR LOWER(e.email) = LOWER($${userEmailParam})) AS can_edit,
          ($${managerParam}::boolean OR b.created_by = $${userIdParam} OR LOWER(e.email) = LOWER($${userEmailParam})) AS can_delete,
          $${managerParam}::boolean AS can_approve,
          COALESCE(
            json_agg(q ORDER BY q.sort_order, q.created_at) FILTER (WHERE q.id IS NOT NULL),
            '[]'
          ) AS questions`;
}

async function insertQuestions(eventId, questions = []) {
  for (const [index, item] of questions.entries()) {
    if (!item.question) continue;
    await query(
      `INSERT INTO event_quiz_questions (event_id, question, answer, points, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, item.question, item.answer || null, item.points || 10, item.sort_order ?? index]
    );
  }
}

async function createEventVersion(eventId, user, changeSummary = 'Event updated') {
  const { rows } = await query(
    `SELECT b.*,
            COALESCE(
              json_agg(q ORDER BY q.sort_order, q.created_at) FILTER (WHERE q.id IS NOT NULL),
              '[]'
            ) AS questions
     FROM event_banners b
     LEFT JOIN event_quiz_questions q ON q.event_id = b.id
     WHERE b.id = $1
     GROUP BY b.id`,
    [eventId]
  );
  if (!rows[0]) return null;
  const next = await query(`SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM event_versions WHERE event_id = $1`, [eventId]);
  const created = await query(
    `INSERT INTO event_versions (event_id, version_number, snapshot, change_summary, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [eventId, next.rows[0].version_number, JSON.stringify(rows[0]), changeSummary, user.id]
  );
  return created.rows[0];
}

router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const params = [];
  const filters = [];

  if (status) {
    params.push(status);
    filters.push(`b.status = $${params.length}`);
  }

  if (!isManager(req.user)) {
    params.push(req.user.id, req.user.email);
    filters.push(`(b.approval_status = 'approved' OR b.created_by = $${params.length - 1} OR LOWER(e.email) = LOWER($${params.length}))`);
  }

  const managerParam = params.length + 1;
  const userIdParam = params.length + 2;
  const userEmailParam = params.length + 3;
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT ${eventSelectClause({ managerParam, userIdParam, userEmailParam })}
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     LEFT JOIN users u ON u.id = b.created_by
     LEFT JOIN event_quiz_questions q ON q.event_id = b.id
     ${where}
     GROUP BY b.id, e.employee_name, e.email, u.name
     ORDER BY COALESCE(b.event_date, b.created_at::date) ASC, b.created_at DESC`,
    [...params, isManager(req.user), req.user.id, req.user.email]
  );
  res.json(rows.map(mapEvent));
}));

router.get('/approvals', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { approval_status } = req.query;
  const params = [];
  const filters = [];
  if (approval_status) {
    params.push(approval_status);
    filters.push(`b.approval_status = $${params.length}`);
  }

  const managerParam = params.length + 1;
  const userIdParam = params.length + 2;
  const userEmailParam = params.length + 3;
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT ${eventSelectClause({ managerParam, userIdParam, userEmailParam })}
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     LEFT JOIN users u ON u.id = b.created_by
     LEFT JOIN event_quiz_questions q ON q.event_id = b.id
     ${where}
     GROUP BY b.id, e.employee_name, e.email, u.name
     ORDER BY b.created_at DESC`,
    [...params, true, req.user.id, req.user.email]
  );
  res.json(rows.map(mapEvent));
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    title,
    description,
    event_date,
    event_time,
    event_type,
    event_category,
    event_mode,
    department,
    presenter,
    expected_audience,
    banner_image_url,
    template = 'corporate',
    quiz_required = false,
    feedback_required = true,
    assigned_employee_id,
    status,
    hero_tone = 'neon',
    questions = []
  } = req.body;

  const manager = isManager(req.user);
  const approvalStatus = manager ? 'approved' : 'pending';
  const eventStatus = manager ? (status || 'upcoming') : 'draft';
  const history = [
    buildHistoryItem({
      action: manager ? 'created_and_published' : 'submitted',
      note: manager ? 'Created by admin' : 'Submitted for approval',
      user: req.user
    })
  ];

  const { rows } = await query(
    `INSERT INTO event_banners
     (title, description, event_date, event_time, event_type, event_category, event_mode, department, presenter, expected_audience,
      banner_image_url, template, quiz_required, feedback_required, assigned_employee_id, status, hero_tone,
      approval_status, approval_history, published_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21)
     RETURNING *`,
    [
      title,
      description || null,
      event_date || null,
      event_time || null,
      event_type || event_category || 'Oration',
      eventCategories.includes(event_category) ? event_category : 'Oration',
      eventModes.includes(event_mode) ? event_mode : event_category === 'Debate' ? 'debate' : 'standard',
      department || null,
      presenter || null,
      expected_audience || null,
      banner_image_url || null,
      template,
      Boolean(quiz_required),
      Boolean(feedback_required),
      manager ? assigned_employee_id || null : null,
      eventStatus,
      hero_tone,
      approvalStatus,
      JSON.stringify(history),
      manager ? new Date() : null,
      req.user.id
    ]
  );

  await insertQuestions(rows[0].id, questions);

  await auditLog({
    userId: req.user.id,
    action: manager ? 'create_event_banner' : 'submit_event_request',
    entityType: 'event_banner',
    entityId: rows[0].id,
    metadata: req.body,
    ip: req.ip
  });
  await emitWebhookEvent(manager ? 'event.created' : 'event.requested', { event: rows[0], createdBy: req.user });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { rows: existingRows } = await query(
    `SELECT b.*, e.email AS employee_email
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!existingRows[0]) return res.status(404).json({ message: 'Event banner not found' });

  const existing = existingRows[0];
  const manager = isManager(req.user);
  if (!canUserManageEvent(existing, req.user)) {
    return res.status(403).json({ message: 'You can only edit events you created or were assigned to' });
  }
  if (!manager && existing.created_by === req.user.id && !isUserEditableRequest(existing, req.user)) {
    return res.status(403).json({ message: 'Approved or rejected requests need an admin to change them' });
  }

  const {
    title,
    description,
    event_date,
    event_time,
    event_type,
    event_category,
    event_mode,
    department,
    presenter,
    expected_audience,
    banner_image_url,
    template,
    quiz_required,
    feedback_required,
    assigned_employee_id,
    status,
    hero_tone,
    questions
  } = req.body;

  await createEventVersion(req.params.id, req.user, req.body.change_summary || 'Before event update');

  const { rows } = await query(
    `UPDATE event_banners
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         event_date = COALESCE($3, event_date),
         event_type = COALESCE($4, event_type),
         assigned_employee_id = COALESCE($5, assigned_employee_id),
         status = COALESCE($6, status),
         hero_tone = COALESCE($7, hero_tone),
         event_time = COALESCE($8, event_time),
         department = COALESCE($9, department),
         presenter = COALESCE($10, presenter),
         expected_audience = COALESCE($11, expected_audience),
         banner_image_url = COALESCE($12, banner_image_url),
         template = COALESCE($13, template),
         quiz_required = COALESCE($14, quiz_required),
         feedback_required = COALESCE($15, feedback_required),
         event_category = COALESCE($16, event_category),
         event_mode = COALESCE($17, event_mode),
         updated_at = NOW()
     WHERE id = $18
     RETURNING *`,
    [
      title,
      description,
      event_date,
      event_type,
      manager ? assigned_employee_id : undefined,
      manager ? status : undefined,
      hero_tone,
      event_time,
      department,
      presenter,
      expected_audience,
      banner_image_url,
      template,
      typeof quiz_required === 'boolean' ? quiz_required : undefined,
      typeof feedback_required === 'boolean' ? feedback_required : undefined,
      eventCategories.includes(event_category) ? event_category : undefined,
      eventModes.includes(event_mode) ? event_mode : undefined,
      req.params.id
    ]
  );

  if (Array.isArray(questions)) {
    await query(`DELETE FROM event_quiz_questions WHERE event_id = $1`, [rows[0].id]);
    await insertQuestions(rows[0].id, questions);
  }

  await auditLog({ userId: req.user.id, action: 'update_event_banner', entityType: 'event_banner', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  await emitWebhookEvent('event.updated', { event: rows[0], updatedBy: req.user });
  res.json(rows[0]);
}));

router.get('/:id/versions', asyncHandler(async (req, res) => {
  const { rows: eventRows } = await query(
    `SELECT b.*, e.email AS employee_email
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!eventRows[0]) return res.status(404).json({ message: 'Event not found' });
  if (!canUserManageEvent(eventRows[0], req.user)) return res.status(403).json({ message: 'You cannot view this event history' });
  const { rows } = await query(
    `SELECT v.*, u.name AS created_by_name
     FROM event_versions v
     LEFT JOIN users u ON u.id = v.created_by
     WHERE v.event_id = $1
     ORDER BY v.version_number DESC`,
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/:id/versions/:versionId/restore', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { rows: versionRows } = await query(`SELECT * FROM event_versions WHERE id = $1 AND event_id = $2`, [req.params.versionId, req.params.id]);
  if (!versionRows[0]) return res.status(404).json({ message: 'Event version not found' });
  await createEventVersion(req.params.id, req.user, `Before restoring version ${versionRows[0].version_number}`);
  const snapshot = versionRows[0].snapshot;
  const { rows } = await query(
    `UPDATE event_banners
     SET title = $1,
         description = $2,
         event_date = $3,
         event_time = $4,
         event_type = $5,
         event_category = $6,
         event_mode = $7,
         department = $8,
         presenter = $9,
         expected_audience = $10,
         banner_image_url = $11,
         template = $12,
         quiz_required = $13,
         feedback_required = $14,
         assigned_employee_id = $15,
         status = $16,
         hero_tone = $17,
         updated_at = NOW()
     WHERE id = $18
     RETURNING *`,
    [
      snapshot.title,
      snapshot.description || null,
      snapshot.event_date || null,
      snapshot.event_time || null,
      snapshot.event_type || 'Oration',
      snapshot.event_category || 'Oration',
      snapshot.event_mode || 'standard',
      snapshot.department || null,
      snapshot.presenter || null,
      snapshot.expected_audience || null,
      snapshot.banner_image_url || null,
      snapshot.template || 'corporate',
      Boolean(snapshot.quiz_required),
      Boolean(snapshot.feedback_required),
      snapshot.assigned_employee_id || null,
      snapshot.status || 'draft',
      snapshot.hero_tone || 'neon',
      req.params.id
    ]
  );
  await query(`DELETE FROM event_quiz_questions WHERE event_id = $1`, [req.params.id]);
  await insertQuestions(req.params.id, snapshot.questions || []);
  await auditLog({ userId: req.user.id, action: 'restore_event_version', entityType: 'event_banner', entityId: req.params.id, metadata: { version_id: req.params.versionId }, ip: req.ip });
  await emitWebhookEvent('event.version.restored', { event: rows[0], version: versionRows[0], restoredBy: req.user });
  res.json(rows[0]);
}));

router.post('/:id/publish', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await createEventVersion(req.params.id, req.user, 'Before draft publish');
  const { rows } = await query(
    `UPDATE event_banners
     SET status = 'upcoming',
         approval_status = 'approved',
         published_at = COALESCE(published_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Event not found' });
  await auditLog({ userId: req.user.id, action: 'publish_event_draft', entityType: 'event_banner', entityId: req.params.id, ip: req.ip });
  await emitWebhookEvent('event.published', { event: rows[0], publishedBy: req.user });
  res.json(rows[0]);
}));

router.post('/:id/approval', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { action, note = '' } = req.body;
  const approval = approvalActions[action];
  if (!approval) return res.status(400).json({ message: 'Invalid approval action' });

  const { rows: existingRows } = await query(`SELECT approval_history FROM event_banners WHERE id = $1`, [req.params.id]);
  if (!existingRows[0]) return res.status(404).json({ message: 'Event request not found' });

  const history = [
    ...(Array.isArray(existingRows[0].approval_history) ? existingRows[0].approval_history : []),
    buildHistoryItem({ action, note, user: req.user })
  ];

  const { rows } = await query(
    `UPDATE event_banners
     SET approval_status = $1,
         status = $2,
         approval_note = $3,
         approval_history = $4::jsonb,
         published_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE published_at END,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [approval.status, approval.eventStatus, note || null, JSON.stringify(history), req.params.id]
  );

  await auditLog({ userId: req.user.id, action: approval.audit, entityType: 'event_banner', entityId: rows[0].id, metadata: { action, note }, ip: req.ip });
  await emitWebhookEvent(`event.approval.${approval.status}`, { event: rows[0], approvedBy: req.user });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, e.email AS employee_email
     FROM event_banners b
     LEFT JOIN employees e ON e.id = b.assigned_employee_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Event banner not found' });
  if (!canUserManageEvent(rows[0], req.user)) {
    return res.status(403).json({ message: 'You can only delete events you created or were assigned to' });
  }

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
