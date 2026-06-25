import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { emitWebhookEvent } from '../services/webhookService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const resourceDir = path.join(dataDir, 'event-resources');

router.use(authenticate);

const eventCategories = ['Oration', 'Training', 'Workshop', 'Quiz', 'Debate', 'Demo', 'Celebration'];
const eventModes = ['standard', 'debate', 'team_battle'];
const resourceTypes = ['PDF', 'PPT', 'Video', 'Link', 'Document'];

function lines(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}

async function pollWithResults(pollId) {
  const { rows } = await query(
    `SELECT p.*,
            COALESCE((SELECT COUNT(*)::int FROM event_live_poll_votes WHERE poll_id = p.id), 0) AS total_votes,
            COALESCE((
              SELECT json_agg(json_build_object('option', option_text, 'votes', votes) ORDER BY option_text)
              FROM (
                SELECT option_text, COUNT(*)::int AS votes
                FROM event_live_poll_votes
                WHERE poll_id = p.id
                GROUP BY option_text
              ) grouped
            ), '[]'::json) AS results
     FROM event_live_polls p
     WHERE p.id = $1
     LIMIT 1`,
    [pollId]
  );
  return rows[0] || null;
}

router.get('/meta', asyncHandler(async (req, res) => {
  res.json({ event_categories: eventCategories, event_modes: eventModes, resource_types: resourceTypes });
}));

router.get('/events/:eventId', asyncHandler(async (req, res) => {
  const [event, debate, battle, polls, resources, versions] = await Promise.all([
    query(`SELECT * FROM event_banners WHERE id = $1`, [req.params.eventId]),
    query(
      `SELECT d.*, e.employee_name AS moderator_name, e.email AS moderator_email
       FROM event_debates d
       LEFT JOIN employees e ON e.id = d.moderator_employee_id
       WHERE d.event_id = $1`,
      [req.params.eventId]
    ),
    query(`SELECT * FROM event_team_battles WHERE event_id = $1`, [req.params.eventId]),
    query(
      `SELECT p.*,
              COALESCE((SELECT COUNT(*)::int FROM event_live_poll_votes WHERE poll_id = p.id), 0) AS total_votes,
              COALESCE((
                SELECT json_agg(json_build_object('option', option_text, 'votes', votes) ORDER BY option_text)
                FROM (
                  SELECT option_text, COUNT(*)::int AS votes
                  FROM event_live_poll_votes
                  WHERE poll_id = p.id
                  GROUP BY option_text
                ) grouped
              ), '[]'::json) AS results
       FROM event_live_polls p
       WHERE p.event_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.eventId]
    ),
    query(
      `SELECT r.*, u.name AS uploaded_by_name
       FROM event_resources r
       LEFT JOIN users u ON u.id = r.uploaded_by
       WHERE r.event_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.eventId]
    ),
    query(
      `SELECT v.*, u.name AS created_by_name
       FROM event_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.event_id = $1
       ORDER BY v.version_number DESC
       LIMIT 20`,
      [req.params.eventId]
    )
  ]);
  if (!event.rows[0]) return res.status(404).json({ message: 'Event not found' });
  res.json({
    event: event.rows[0],
    debate: debate.rows[0] || null,
    team_battle: battle.rows[0] || null,
    polls: polls.rows,
    resources: resources.rows,
    versions: versions.rows
  });
}));

router.put('/events/:eventId/debate', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { team_a_name = 'Team A', team_b_name = 'Team B', team_a_members = [], team_b_members = [], moderator_employee_id, winner_team = 'pending', notes } = req.body;
  const { rows } = await query(
    `INSERT INTO event_debates (event_id, team_a_name, team_b_name, team_a_members, team_b_members, moderator_employee_id, winner_team, notes, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
     ON CONFLICT (event_id)
     DO UPDATE SET team_a_name = EXCLUDED.team_a_name,
                   team_b_name = EXCLUDED.team_b_name,
                   team_a_members = EXCLUDED.team_a_members,
                   team_b_members = EXCLUDED.team_b_members,
                   moderator_employee_id = EXCLUDED.moderator_employee_id,
                   winner_team = EXCLUDED.winner_team,
                   notes = EXCLUDED.notes,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
     RETURNING *`,
    [
      req.params.eventId,
      team_a_name,
      team_b_name,
      JSON.stringify(lines(team_a_members)),
      JSON.stringify(lines(team_b_members)),
      moderator_employee_id || null,
      ['pending', 'team_a', 'team_b', 'draw'].includes(winner_team) ? winner_team : 'pending',
      notes || null,
      req.user.id
    ]
  );
  await query(`UPDATE event_banners SET event_category = 'Debate', event_mode = 'debate', updated_at = NOW() WHERE id = $1`, [req.params.eventId]);
  await auditLog({ userId: req.user.id, action: 'save_debate_mode', entityType: 'event_debate', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  await emitWebhookEvent('event.debate.saved', { eventId: req.params.eventId, debate: rows[0], updatedBy: req.user });
  res.json(rows[0]);
}));

router.put('/events/:eventId/team-battle', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { team_a_department, team_b_department, team_a_score = 0, team_b_score = 0, notes } = req.body;
  const winner = Number(team_a_score) === Number(team_b_score)
    ? 'Draw'
    : Number(team_a_score) > Number(team_b_score)
      ? team_a_department
      : team_b_department;
  const { rows } = await query(
    `INSERT INTO event_team_battles (event_id, team_a_department, team_b_department, team_a_score, team_b_score, winner_department, notes, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (event_id)
     DO UPDATE SET team_a_department = EXCLUDED.team_a_department,
                   team_b_department = EXCLUDED.team_b_department,
                   team_a_score = EXCLUDED.team_a_score,
                   team_b_score = EXCLUDED.team_b_score,
                   winner_department = EXCLUDED.winner_department,
                   notes = EXCLUDED.notes,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
     RETURNING *`,
    [req.params.eventId, team_a_department, team_b_department, Number(team_a_score) || 0, Number(team_b_score) || 0, winner, notes || null, req.user.id]
  );
  await query(`UPDATE event_banners SET event_mode = 'team_battle', updated_at = NOW() WHERE id = $1`, [req.params.eventId]);
  await auditLog({ userId: req.user.id, action: 'save_team_battle', entityType: 'event_team_battle', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.get('/team-battles/leaderboard', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `WITH scores AS (
       SELECT team_a_department AS department,
              SUM(team_a_score)::numeric(10,2) AS points,
              COUNT(*) FILTER (WHERE winner_department = team_a_department)::int AS wins,
              COUNT(*)::int AS battles
       FROM event_team_battles
       GROUP BY team_a_department
       UNION ALL
       SELECT team_b_department AS department,
              SUM(team_b_score)::numeric(10,2) AS points,
              COUNT(*) FILTER (WHERE winner_department = team_b_department)::int AS wins,
              COUNT(*)::int AS battles
       FROM event_team_battles
       GROUP BY team_b_department
     )
     SELECT department,
            COALESCE(SUM(points), 0)::numeric(10,2) AS total_score,
            SUM(wins)::int AS wins,
            SUM(battles)::int AS battles
     FROM scores
     GROUP BY department
     ORDER BY total_score DESC, wins DESC, department ASC`
  );
  res.json(rows);
}));

router.post('/events/:eventId/polls', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { question, options = [], status = 'draft' } = req.body;
  const { rows } = await query(
    `INSERT INTO event_live_polls (event_id, question, options, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [req.params.eventId, question, JSON.stringify(lines(options)), ['draft', 'live', 'closed'].includes(status) ? status : 'draft', req.user.id]
  );
  await emitWebhookEvent('event.poll.created', { eventId: req.params.eventId, poll: rows[0], createdBy: req.user });
  res.status(201).json(rows[0]);
}));

router.patch('/polls/:pollId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { question, options, status } = req.body;
  const { rows } = await query(
    `UPDATE event_live_polls
     SET question = COALESCE($1, question),
         options = COALESCE($2::jsonb, options),
         status = COALESCE($3, status),
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [question, options === undefined ? null : JSON.stringify(lines(options)), ['draft', 'live', 'closed'].includes(status) ? status : undefined, req.params.pollId]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Poll not found' });
  res.json(rows[0]);
}));

router.post('/polls/:pollId/vote', asyncHandler(async (req, res) => {
  const { rows: polls } = await query(`SELECT * FROM event_live_polls WHERE id = $1 AND status = 'live'`, [req.params.pollId]);
  if (!polls[0]) return res.status(404).json({ message: 'Live poll not found' });
  const option = String(req.body.option_text || '').trim();
  if (!polls[0].options.includes(option)) return res.status(400).json({ message: 'Invalid poll option' });
  await query(
    `INSERT INTO event_live_poll_votes (poll_id, user_id, option_text)
     VALUES ($1, $2, $3)
     ON CONFLICT (poll_id, user_id)
     DO UPDATE SET option_text = EXCLUDED.option_text, created_at = NOW()`,
    [req.params.pollId, req.user.id, option]
  );
  res.json(await pollWithResults(req.params.pollId));
}));

router.get('/polls/:pollId/results', asyncHandler(async (req, res) => {
  const poll = await pollWithResults(req.params.pollId);
  if (!poll) return res.status(404).json({ message: 'Poll not found' });
  res.json(poll);
}));

router.post('/events/:eventId/resources', allowRoles('super_admin', 'admin'), upload.single('file'), asyncHandler(async (req, res) => {
  const type = resourceTypes.includes(req.body.resource_type) ? req.body.resource_type : 'Document';
  let resourceUrl = req.body.resource_url || '';
  let fileName = null;
  let mimeType = null;
  let fileSize = null;
  if (req.file) {
    await fs.mkdir(resourceDir, { recursive: true });
    const extension = path.extname(req.file.originalname || '') || '';
    fileName = `${crypto.randomUUID()}${extension}`;
    await fs.writeFile(path.join(resourceDir, fileName), req.file.buffer);
    resourceUrl = `/resources/${fileName}`;
    mimeType = req.file.mimetype;
    fileSize = req.file.size;
  }
  if (!resourceUrl) return res.status(400).json({ message: 'Provide a resource link or upload a file' });
  const { rows } = await query(
    `INSERT INTO event_resources (event_id, resource_type, title, resource_url, file_name, mime_type, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [req.params.eventId, type, req.body.title || req.file?.originalname || 'Event Resource', resourceUrl, fileName, mimeType, fileSize, req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'add_event_resource', entityType: 'event_resource', entityId: rows[0].id, metadata: { event_id: req.params.eventId, type }, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.delete('/resources/:resourceId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(`DELETE FROM event_resources WHERE id = $1 RETURNING *`, [req.params.resourceId]);
  if (!rows[0]) return res.status(404).json({ message: 'Resource not found' });
  if (rows[0].file_name) await fs.unlink(path.join(resourceDir, rows[0].file_name)).catch(() => {});
  await auditLog({ userId: req.user.id, action: 'delete_event_resource', entityType: 'event_resource', entityId: req.params.resourceId, ip: req.ip });
  res.status(204).send();
}));

export default router;
