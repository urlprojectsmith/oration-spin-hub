import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

function isManager(user) {
  return ['super_admin', 'admin'].includes(user.role);
}

function canModifySchedule(row, user) {
  if (isManager(user)) return true;
  return row.created_by === user.id ||
    row.speaker_email?.toLowerCase() === user.email.toLowerCase() ||
    row.coordinator_email?.toLowerCase() === user.email.toLowerCase();
}

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*,
            e.employee_name,
            e.email AS speaker_email,
            c.employee_name AS coordinator_name,
            c.email AS coordinator_email,
            u.name AS created_by_name,
            ($1::boolean OR s.created_by = $2 OR LOWER(e.email) = LOWER($3) OR LOWER(c.email) = LOWER($3)) AS can_edit,
            ($1::boolean OR s.created_by = $2 OR LOWER(e.email) = LOWER($3) OR LOWER(c.email) = LOWER($3)) AS can_delete
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     LEFT JOIN employees c ON c.id = s.selected_coordinator_id
     LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.event_date DESC
     LIMIT 200`,
    [isManager(req.user), req.user.id, req.user.email]
  );
  res.json(rows);
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { event_date, event_time, event_type = 'Oration Task', selected_speaker_id, selected_coordinator_id, status = 'Scheduled', notes } = req.body;
  const day = new Date(event_date).toLocaleDateString('en-US', { weekday: 'long' });
  const { rows } = await query(
    `INSERT INTO speaker_schedules
     (event_date, event_time, day, event_type, selected_speaker_id, selected_coordinator_id, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (event_date, event_type)
     DO UPDATE SET selected_speaker_id = EXCLUDED.selected_speaker_id,
                   selected_coordinator_id = EXCLUDED.selected_coordinator_id,
                   event_time = EXCLUDED.event_time,
                   status = EXCLUDED.status,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()
     RETURNING *`,
    [event_date, event_time || null, day, event_type, selected_speaker_id || null, selected_coordinator_id || null, status, notes || null, req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'upsert_schedule', entityType: 'schedule', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { rows: existingRows } = await query(
    `SELECT s.*, e.email AS speaker_email, c.email AS coordinator_email
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     LEFT JOIN employees c ON c.id = s.selected_coordinator_id
     WHERE s.id = $1`,
    [req.params.id]
  );
  if (!existingRows[0]) return res.status(404).json({ message: 'Schedule not found' });
  const manager = isManager(req.user);
  if (!canModifySchedule(existingRows[0], req.user)) {
    return res.status(403).json({ message: 'You can only edit schedules you created or were assigned to' });
  }

  const { event_date, event_time, event_type, status, notes, reason, selected_speaker_id, selected_coordinator_id } = req.body;
  const day = event_date ? new Date(event_date).toLocaleDateString('en-US', { weekday: 'long' }) : null;
  const { rows } = await query(
    `UPDATE speaker_schedules
     SET event_date = COALESCE($1, event_date),
         day = COALESCE($2, day),
         event_type = COALESCE($3, event_type),
         status = COALESCE($4, status),
         notes = COALESCE($5, notes),
         reschedule_reason = COALESCE($6, reschedule_reason),
         selected_speaker_id = COALESCE($7, selected_speaker_id),
         selected_coordinator_id = COALESCE($8, selected_coordinator_id),
         event_time = COALESCE($9, event_time),
         updated_at = NOW()
     WHERE id = $10 RETURNING *`,
    [
      manager ? event_date : undefined,
      manager ? day : undefined,
      manager ? event_type : undefined,
      status,
      notes,
      reason,
      manager ? selected_speaker_id : undefined,
      manager ? selected_coordinator_id : undefined,
      manager ? event_time : undefined,
      req.params.id
    ]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Schedule not found' });
  await auditLog({ userId: req.user.id, action: 'update_schedule', entityType: 'schedule', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, e.email AS speaker_email, c.email AS coordinator_email
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     LEFT JOIN employees c ON c.id = s.selected_coordinator_id
     WHERE s.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Schedule not found' });
  if (!canModifySchedule(rows[0], req.user)) {
    return res.status(403).json({ message: 'You can only delete schedules you created or were assigned to' });
  }

  await query(`DELETE FROM speaker_schedules WHERE id = $1`, [req.params.id]);
  await auditLog({ userId: req.user.id, action: 'delete_schedule', entityType: 'schedule', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
}));

export default router;
