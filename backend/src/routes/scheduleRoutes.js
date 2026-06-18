import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, e.employee_name, e.email, u.name AS created_by_name
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.event_date DESC
     LIMIT 200`
  );
  res.json(rows);
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { event_date, event_type = 'Oration Task', selected_speaker_id, selected_coordinator_id, status = 'Scheduled', notes } = req.body;
  const day = new Date(event_date).toLocaleDateString('en-US', { weekday: 'long' });
  const { rows } = await query(
    `INSERT INTO speaker_schedules
     (event_date, day, event_type, selected_speaker_id, selected_coordinator_id, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (event_date, event_type)
     DO UPDATE SET selected_speaker_id = EXCLUDED.selected_speaker_id,
                   selected_coordinator_id = EXCLUDED.selected_coordinator_id,
                   status = EXCLUDED.status,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()
     RETURNING *`,
    [event_date, day, event_type, selected_speaker_id || null, selected_coordinator_id || null, status, notes || null, req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'upsert_schedule', entityType: 'schedule', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { event_date, event_type, status, notes, reason, selected_speaker_id, selected_coordinator_id } = req.body;
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
         updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [event_date, day, event_type, status, notes, reason, selected_speaker_id, selected_coordinator_id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Schedule not found' });
  await auditLog({ userId: req.user.id, action: 'update_schedule', entityType: 'schedule', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.delete('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM speaker_schedules WHERE id = $1`, [req.params.id]);
  await auditLog({ userId: req.user.id, action: 'delete_schedule', entityType: 'schedule', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
}));

export default router;
