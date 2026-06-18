import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT w.*, COALESCE(json_agg(e.*) FILTER (WHERE e.id IS NOT NULL), '[]') AS entries
     FROM wheels w
     LEFT JOIN wheel_entries e ON e.wheel_id = w.id
     GROUP BY w.id
     ORDER BY w.created_at DESC`
  );
  res.json(rows);
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { name, description, entries = [] } = req.body;
  const { rows } = await query(
    `INSERT INTO wheels (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [name, description || null, req.user.id]
  );

  for (const entry of entries) {
    await query(
      `INSERT INTO wheel_entries (wheel_id, label, email, status) VALUES ($1, $2, $3, $4)`,
      [rows[0].id, entry.label, entry.email || null, entry.status || 'active']
    );
  }

  res.status(201).json(rows[0]);
}));

router.patch('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { name, description, status } = req.body;
  const { rows } = await query(
    `UPDATE wheels
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [name, description, status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Wheel not found' });
  res.json(rows[0]);
}));

router.post('/:id/entries', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { label, email, status = 'active' } = req.body;
  const { rows } = await query(
    `INSERT INTO wheel_entries (wheel_id, label, email, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, label, email || null, status]
  );
  res.status(201).json(rows[0]);
}));

router.delete('/:id/entries/:entryId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM wheel_entries WHERE wheel_id = $1 AND id = $2`, [req.params.id, req.params.entryId]);
  res.status(204).send();
}));

export default router;

