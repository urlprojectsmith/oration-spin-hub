import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [
    employees,
    spoken,
    cycle,
    upcoming,
    lastSpeaker,
    monthly,
    leaderboard
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM employees WHERE status = 'active'`),
    query(`SELECT COUNT(*)::int AS total FROM employees WHERE status = 'active' AND already_spoken = true`),
    query(`SELECT * FROM spin_cycles WHERE wheel_type = 'speaker' AND status = 'active' ORDER BY cycle_number DESC LIMIT 1`),
    query(
      `SELECT s.*, e.employee_name, e.email
       FROM speaker_schedules s
       LEFT JOIN employees e ON e.id = s.selected_speaker_id
       WHERE s.event_date >= CURRENT_DATE AND s.status IN ('Scheduled', 'Rescheduled')
       ORDER BY s.event_date ASC LIMIT 6`
    ),
    query(`SELECT * FROM spin_results WHERE wheel_type = 'speaker' ORDER BY created_at DESC LIMIT 1`),
    query(
      `SELECT COUNT(*)::int AS total FROM spin_results
       WHERE wheel_type = 'speaker'
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`
    ),
    query(
      `SELECT winner_name, COUNT(*)::int AS wins
       FROM spin_results
       WHERE wheel_type = 'speaker'
       GROUP BY winner_name
       ORDER BY wins DESC, winner_name ASC
       LIMIT 10`
    )
  ]);

  const total = employees.rows[0].total;
  const spokenCount = spoken.rows[0].total;

  res.json({
    totalEmployees: total,
    spokenEmployees: spokenCount,
    remainingEmployees: Math.max(total - spokenCount, 0),
    currentCycleNumber: cycle.rows[0]?.cycle_number || 1,
    completionPercentage: total ? Math.round((spokenCount / total) * 100) : 0,
    upcoming: upcoming.rows,
    lastSelectedSpeaker: lastSpeaker.rows[0] || null,
    monthlyOrationCount: monthly.rows[0].total,
    leaderboard: leaderboard.rows
  });
}));

router.get('/not-spoken', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT employee_id, employee_name, email FROM employees
     WHERE status = 'active' AND already_spoken = false
     ORDER BY employee_name`
  );
  res.json(rows);
}));

router.get('/cycle-completion', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.cycle_number,
            c.status,
            c.started_at,
            c.completed_at,
            COUNT(r.id)::int AS speakers_selected
     FROM spin_cycles c
     LEFT JOIN spin_results r ON r.cycle_id = c.id
     WHERE c.wheel_type = 'speaker'
     GROUP BY c.id
     ORDER BY c.cycle_number DESC`
  );
  res.json(rows);
}));

router.get('/export.csv', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT COALESCE(event_date, created_at::date) AS date,
            wheel_type,
            winner_name,
            winner_email,
            cycle_number,
            notes
     FROM spin_results
     ORDER BY created_at DESC`
  );
  const header = ['date', 'event_type', 'winner_name', 'winner_email', 'cycle_number', 'notes'];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      header.map((key) => `"${String(row[key === 'event_type' ? 'wheel_type' : key] ?? '').replaceAll('"', '""')}"`).join(',')
    )
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="oration-history.csv"');
  res.send(csv);
}));

export default router;
