import express from 'express';
import nodemailer from 'nodemailer';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

const checklistFields = ['topic_selected', 'slides_uploaded', 'demo_ready', 'notes_prepared', 'rehearsal_completed'];
const reminderWindows = [
  { key: 'one_day', label: '1 day before event', minutesBefore: 24 * 60 },
  { key: 'one_hour', label: '1 hour before event', minutesBefore: 60 },
  { key: 'fifteen_minutes', label: '15 minutes before event', minutesBefore: 15 }
];

async function getSettings() {
  const { rows } = await query(`SELECT key, value FROM app_settings`);
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

function buildTransport(settings = {}) {
  const host = settings.smtp_host || process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(settings.smtp_port || process.env.SMTP_PORT || 587),
    secure: String(settings.smtp_secure || process.env.SMTP_SECURE) === 'true',
    auth: {
      user: settings.smtp_user || process.env.SMTP_USER,
      pass: settings.smtp_pass || process.env.SMTP_PASS
    }
  });
}

function isManager(user) {
  return ['super_admin', 'admin'].includes(user.role);
}

function completion(row) {
  const completed = checklistFields.filter((field) => row[field]).length;
  return Math.round((completed / checklistFields.length) * 100);
}

function mapPrep(row) {
  return {
    ...row,
    completion_percentage: completion(row),
    reminders: row.reminders || []
  };
}

function scheduleDateTime(row) {
  const date = row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : String(row.event_date).slice(0, 10);
  const time = row.event_time ? String(row.event_time).slice(0, 5) : '10:00';
  return new Date(`${date}T${time}:00`);
}

function reminderStatus(eventAt, logs = []) {
  const now = new Date();
  return reminderWindows.map((window) => {
    const dueAt = new Date(eventAt.getTime() - window.minutesBefore * 60 * 1000);
    const sent = logs.filter((log) => log.reminder_key === window.key);
    return {
      ...window,
      due_at: dueAt.toISOString(),
      due: now >= dueAt && now <= eventAt,
      sent_email: sent.some((log) => log.channel === 'email' && log.status === 'sent'),
      sent_in_app: sent.some((log) => log.channel === 'in_app' && log.status === 'sent')
    };
  });
}

async function ensurePreparation(scheduleId, userId) {
  const { rows } = await query(
    `INSERT INTO speaker_preparations (schedule_id, updated_by)
     VALUES ($1, $2)
     ON CONFLICT (schedule_id) DO NOTHING
     RETURNING *`,
    [scheduleId, userId]
  );
  return rows[0];
}

router.get('/schedules', asyncHandler(async (req, res) => {
  const params = [isManager(req.user), req.user.id, req.user.email];
  const { rows } = await query(
    `SELECT s.id AS schedule_id,
            s.event_date,
            s.event_time,
            s.day,
            s.event_type,
            s.status,
            s.notes AS schedule_notes,
            s.created_by,
            e.id AS employee_id,
            e.employee_name,
            e.email AS employee_email,
            COALESCE(p.topic_selected, false) AS topic_selected,
            COALESCE(p.slides_uploaded, false) AS slides_uploaded,
            COALESCE(p.demo_ready, false) AS demo_ready,
            COALESCE(p.notes_prepared, false) AS notes_prepared,
            COALESCE(p.rehearsal_completed, false) AS rehearsal_completed,
            p.topic,
            p.slides_url,
            p.notes,
            COALESCE(
              json_agg(json_build_object(
                'reminder_key', r.reminder_key,
                'channel', r.channel,
                'status', r.status,
                'message', r.message,
                'created_at', r.created_at
              ) ORDER BY r.created_at DESC) FILTER (WHERE r.id IS NOT NULL),
              '[]'
            ) AS reminder_logs,
            ($1::boolean OR s.created_by = $2 OR LOWER(e.email) = LOWER($3)) AS can_update
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     LEFT JOIN speaker_preparations p ON p.schedule_id = s.id
     LEFT JOIN speaker_reminder_logs r ON r.schedule_id = s.id
     WHERE s.event_date >= CURRENT_DATE - INTERVAL '7 days'
       AND ($1::boolean OR s.created_by = $2 OR LOWER(e.email) = LOWER($3))
     GROUP BY s.id, e.id, e.employee_name, e.email, p.id
     ORDER BY s.event_date ASC
     LIMIT 100`,
    params
  );

  res.json(rows.map((row) => {
    const eventAt = scheduleDateTime(row);
    return mapPrep({
      ...row,
      reminders: reminderStatus(eventAt, row.reminder_logs)
    });
  }));
}));

router.patch('/schedules/:scheduleId', asyncHandler(async (req, res) => {
  const { rows: scheduleRows } = await query(
    `SELECT s.*, e.email AS employee_email
     FROM speaker_schedules s
     LEFT JOIN employees e ON e.id = s.selected_speaker_id
     WHERE s.id = $1`,
    [req.params.scheduleId]
  );
  if (!scheduleRows[0]) return res.status(404).json({ message: 'Schedule not found' });
  const allowed = isManager(req.user) || scheduleRows[0].created_by === req.user.id || scheduleRows[0].employee_email?.toLowerCase() === req.user.email.toLowerCase();
  if (!allowed) return res.status(403).json({ message: 'You can update only your assigned preparation checklist' });

  await ensurePreparation(req.params.scheduleId, req.user.id);
  const values = checklistFields.map((field) => (typeof req.body[field] === 'boolean' ? req.body[field] : undefined));
  const { topic, slides_url, notes } = req.body;
  const { rows } = await query(
    `UPDATE speaker_preparations
     SET topic_selected = COALESCE($1, topic_selected),
         slides_uploaded = COALESCE($2, slides_uploaded),
         demo_ready = COALESCE($3, demo_ready),
         notes_prepared = COALESCE($4, notes_prepared),
         rehearsal_completed = COALESCE($5, rehearsal_completed),
         topic = COALESCE($6, topic),
         slides_url = COALESCE($7, slides_url),
         notes = COALESCE($8, notes),
         updated_by = $9,
         updated_at = NOW()
     WHERE schedule_id = $10
     RETURNING *`,
    [...values, topic, slides_url, notes, req.user.id, req.params.scheduleId]
  );
  await auditLog({ userId: req.user.id, action: 'update_speaker_preparation', entityType: 'speaker_preparation', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json({ ...rows[0], completion_percentage: completion(rows[0]) });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM in_app_notifications
     WHERE user_id = $1 OR employee_id IN (SELECT id FROM employees WHERE LOWER(email) = LOWER($2))
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id, req.user.email]
  );
  res.json(rows);
}));

router.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE in_app_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND (user_id = $2 OR employee_id IN (SELECT id FROM employees WHERE LOWER(email) = LOWER($3)))
     RETURNING *`,
    [req.params.id, req.user.id, req.user.email]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Notification not found' });
  res.json(rows[0]);
}));

router.post('/reminders/run', asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const transport = buildTransport(settings);
  const { rows: schedules } = await query(
    `SELECT s.*, e.id AS employee_id, e.employee_name, e.email AS employee_email
     FROM speaker_schedules s
     JOIN employees e ON e.id = s.selected_speaker_id
     WHERE s.status IN ('Scheduled', 'Rescheduled')
       AND s.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days'`
  );

  const created = [];
  for (const schedule of schedules) {
    const eventAt = scheduleDateTime(schedule);
    const statuses = reminderStatus(eventAt, []);
    for (const reminder of statuses.filter((item) => item.due)) {
      const message = `Reminder: ${schedule.employee_name} is scheduled for ${schedule.event_type} on ${eventAt.toLocaleString()}.`;
      const inApp = await query(
        `INSERT INTO speaker_reminder_logs (schedule_id, reminder_key, channel, status, message)
         VALUES ($1, $2, 'in_app', 'sent', $3)
         ON CONFLICT (schedule_id, reminder_key, channel) DO NOTHING
         RETURNING *`,
        [schedule.id, reminder.key, message]
      );
      if (inApp.rows[0]) {
        await query(
          `INSERT INTO in_app_notifications (employee_id, title, message, type, metadata)
           VALUES ($1, $2, $3, 'reminder', $4::jsonb)`,
          [schedule.employee_id, reminder.label, message, JSON.stringify({ schedule_id: schedule.id, reminder_key: reminder.key })]
        );
        created.push(inApp.rows[0]);
      }

      let emailStatus = 'failed';
      let emailMessage = 'SMTP delivery is not configured; reminder is available in-app.';
      if (transport && schedule.employee_email) {
        try {
          await transport.sendMail({
            from: settings.email_from || process.env.EMAIL_FROM,
            to: schedule.employee_email,
            subject: `${reminder.label}: ${schedule.event_type}`,
            text: message
          });
          emailStatus = 'sent';
          emailMessage = message;
        } catch (error) {
          emailMessage = error.message;
        }
      }
      const emailLog = await query(
        `INSERT INTO speaker_reminder_logs (schedule_id, reminder_key, channel, status, message)
         VALUES ($1, $2, 'email', $3, $4)
         ON CONFLICT (schedule_id, reminder_key, channel) DO NOTHING
         RETURNING *`,
        [schedule.id, reminder.key, emailStatus, emailMessage]
      );
      if (emailLog.rows[0]) created.push(emailLog.rows[0]);
    }
  }

  await auditLog({ userId: req.user.id, action: 'run_speaker_reminders', entityType: 'speaker_reminder', metadata: { count: created.length }, ip: req.ip });
  res.json({ created_count: created.length, reminders: created });
}));

export default router;
