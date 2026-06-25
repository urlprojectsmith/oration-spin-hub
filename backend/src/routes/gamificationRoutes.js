import express from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import {
  awardPoints,
  decorateLevel,
  evaluateAchievements,
  getHallOfFame,
  getLeaderboard,
  getSpeakerRankings,
  levels,
  pointRuleDefaults,
  seedPointRules,
  skillTags
} from '../services/gamificationService.js';

const router = express.Router();
router.use(authenticate);

function isManager(user) {
  return ['super_admin', 'admin'].includes(user.role);
}

router.get('/overview', asyncHandler(async (req, res) => {
  await seedPointRules();
  const [rules, leaderboard, hallOfFame, speakerRankings, recentAchievements, totals] = await Promise.all([
    query(`SELECT * FROM gamification_point_rules ORDER BY action_type`),
    getLeaderboard({ scope: req.query.scope || 'all_time', limit: 10 }),
    getHallOfFame(),
    getSpeakerRankings(),
    query(
      `SELECT a.*, e.employee_name, e.email
       FROM employee_achievements a
       JOIN employees e ON e.id = a.employee_id
       ORDER BY a.awarded_at DESC
       LIMIT 12`
    ),
    query(
      `SELECT
         (SELECT COUNT(DISTINCT employee_id)::int FROM gamification_point_events) AS active_players,
         (SELECT COALESCE(SUM(points), 0)::int FROM gamification_point_events) AS total_points,
         (SELECT COUNT(id)::int FROM employee_achievements) AS achievements_awarded`
    )
  ]);

  res.json({
    levels,
    skill_tags: skillTags,
    rules: rules.rows,
    leaderboard,
    hall_of_fame: hallOfFame,
    speaker_rankings: speakerRankings,
    recent_achievements: recentAchievements.rows,
    totals: totals.rows[0]
  });
}));

router.get('/leaderboard', asyncHandler(async (req, res) => {
  res.json(await getLeaderboard({ scope: req.query.scope || 'all_time', limit: req.query.limit || 50 }));
}));

router.get('/hall-of-fame', asyncHandler(async (req, res) => {
  res.json(await getHallOfFame());
}));

router.get('/speaker-rankings', asyncHandler(async (req, res) => {
  res.json(await getSpeakerRankings());
}));

router.get('/employees/:employeeId', asyncHandler(async (req, res) => {
  const [employee, points, achievements, tags] = await Promise.all([
    query(
      `SELECT e.*,
              COALESCE(SUM(p.points), 0)::int AS total_points,
              COUNT(p.id)::int AS point_events
       FROM employees e
       LEFT JOIN gamification_point_events p ON p.employee_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [req.params.employeeId]
    ),
    query(
      `SELECT p.*, r.label
       FROM gamification_point_events p
       LEFT JOIN gamification_point_rules r ON r.action_type = p.action_type
       WHERE p.employee_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [req.params.employeeId]
    ),
    query(`SELECT * FROM employee_achievements WHERE employee_id = $1 ORDER BY awarded_at DESC`, [req.params.employeeId]),
    query(`SELECT tag FROM employee_skill_tags WHERE employee_id = $1 ORDER BY tag`, [req.params.employeeId])
  ]);
  if (!employee.rows[0]) return res.status(404).json({ message: 'Employee not found' });
  res.json({
    employee: decorateLevel(employee.rows[0]),
    points: points.rows,
    achievements: achievements.rows,
    skill_tags: tags.rows.map((item) => item.tag)
  });
}));

router.patch('/rules/:actionType', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await seedPointRules();
  const { rows } = await query(
    `UPDATE gamification_point_rules
     SET points = COALESCE($1, points),
         active = COALESCE($2, active),
         label = COALESCE($3, label),
         updated_at = NOW()
     WHERE action_type = $4
     RETURNING *`,
    [req.body.points, req.body.active, req.body.label, req.params.actionType]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Point rule not found' });
  await auditLog({ userId: req.user.id, action: 'update_point_rule', entityType: 'gamification_rule', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.post('/award', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { employee_id, action_type = 'attend_event', points, source_type = 'manual', source_id, notes } = req.body;
  const awarded = await awardPoints({
    employeeId: employee_id,
    userId: req.body.user_id || null,
    actionType: action_type,
    sourceType: source_type,
    sourceId: source_id || null,
    pointsOverride: points === undefined || points === '' ? null : points,
    awardedBy: req.user.id,
    metadata: { notes: notes || 'Manual gamification award' }
  });
  if (!awarded) return res.status(400).json({ message: 'No points awarded. Check employee, rule status, or duplicate source.' });
  await auditLog({ userId: req.user.id, action: 'award_gamification_points', entityType: 'gamification_point_event', entityId: awarded.id, metadata: req.body, ip: req.ip });
  res.status(201).json(awarded);
}));

router.post('/achievements/recalculate', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const params = [];
  const filter = req.body.employee_id ? `WHERE id = $1` : '';
  if (req.body.employee_id) params.push(req.body.employee_id);
  const { rows } = await query(`SELECT id FROM employees ${filter}`, params);
  const created = [];
  for (const employee of rows) {
    created.push(...await evaluateAchievements(employee.id));
  }
  res.json({ checked: rows.length, awarded: created.length, achievements: created });
}));

router.patch('/employees/:employeeId/skill-tags', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const tags = Array.isArray(req.body.tags) ? req.body.tags.filter((tag) => skillTags.includes(tag)) : [];
  const output = await withTransaction(async (client) => {
    await client.query(`DELETE FROM employee_skill_tags WHERE employee_id = $1`, [req.params.employeeId]);
    const inserted = [];
    for (const tag of tags) {
      const { rows } = await client.query(
        `INSERT INTO employee_skill_tags (employee_id, tag, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, tag)
         DO NOTHING
         RETURNING *`,
        [req.params.employeeId, tag, req.user.id]
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    return inserted;
  });
  await auditLog({ userId: req.user.id, action: 'update_employee_skill_tags', entityType: 'employee', entityId: req.params.employeeId, metadata: { tags }, ip: req.ip });
  res.json({ tags: output.map((item) => item.tag) });
}));

router.get('/skill-tags', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.tag,
            COUNT(t.employee_id)::int AS employees,
            COALESCE(json_agg(json_build_object('id', e.id, 'name', e.employee_name, 'email', e.email) ORDER BY e.employee_name), '[]') AS members
     FROM employee_skill_tags t
     JOIN employees e ON e.id = t.employee_id
     GROUP BY t.tag
     ORDER BY t.tag`
  );
  res.json({ allowed_tags: skillTags, groups: rows });
}));

router.get('/rules', asyncHandler(async (req, res) => {
  await seedPointRules();
  const { rows } = await query(`SELECT * FROM gamification_point_rules ORDER BY action_type`);
  const missing = pointRuleDefaults.filter((item) => !rows.some((row) => row.action_type === item.action_type));
  res.json({ rules: rows, defaults: pointRuleDefaults, missing });
}));

export default router;
