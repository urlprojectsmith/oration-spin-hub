import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { category = '', search = '' } = req.query;
  const params = [req.user.id];
  const filters = [`t.status = 'active'`];
  if (category) {
    params.push(category);
    filters.push(`LOWER(t.category) = LOWER($${params.length})`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT t.*,
            u.name AS submitted_by_name,
            COUNT(v.id)::int AS votes,
            BOOL_OR(v.user_id = $1)::boolean AS voted_by_me
     FROM topic_suggestions t
     LEFT JOIN users u ON u.id = t.submitted_by
     LEFT JOIN topic_votes v ON v.topic_id = t.id
     WHERE ${filters.join(' AND ')}
     GROUP BY t.id, u.name
     ORDER BY votes DESC, t.created_at DESC`,
    params
  );
  res.json(rows);
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT category, COUNT(*)::int AS count
     FROM topic_suggestions
     WHERE status = 'active'
     GROUP BY category
     ORDER BY category ASC`
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, description, category = 'General', department, skill_level = 'intermediate', source = 'user' } = req.body;
  const allowedSource = source === 'ai' && ['super_admin', 'admin'].includes(req.user.role) ? 'ai' : 'user';
  const { rows } = await query(
    `INSERT INTO topic_suggestions (title, description, category, department, skill_level, source, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [title, description || null, category, department || null, skill_level, allowedSource, req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'create_topic_suggestion', entityType: 'topic_suggestion', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.post('/:id/vote', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO topic_votes (topic_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (topic_id, user_id) DO NOTHING
     RETURNING *`,
    [req.params.id, req.user.id]
  );
  res.status(rows[0] ? 201 : 200).json({ voted: true });
}));

router.delete('/:id/vote', asyncHandler(async (req, res) => {
  await query(`DELETE FROM topic_votes WHERE topic_id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  res.json({ voted: false });
}));

router.delete('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`UPDATE topic_suggestions SET status = 'archived', updated_at = NOW() WHERE id = $1`, [req.params.id]);
  await auditLog({ userId: req.user.id, action: 'archive_topic_suggestion', entityType: 'topic_suggestion', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
}));

export default router;
