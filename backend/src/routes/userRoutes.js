import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();

router.use(authenticate, allowRoles('super_admin'));

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, role, status, created_at, updated_at
     FROM users ORDER BY created_at DESC`
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role = 'admin', status = 'active' } = req.body;
  const passwordHash = await bcrypt.hash(password || 'Password@123', 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, status, created_at`,
    [name, email, passwordHash, role, status]
  );
  await auditLog({ userId: req.user.id, action: 'create_user', entityType: 'user', entityId: rows[0].id, metadata: rows[0], ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { name, role, status, password } = req.body;
  let passwordHash = null;
  if (password) passwordHash = await bcrypt.hash(password, 10);

  const { rows } = await query(
    `UPDATE users
     SET name = COALESCE($1, name),
         role = COALESCE($2, role),
         status = COALESCE($3, status),
         password_hash = COALESCE($4, password_hash),
         updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, email, role, status, updated_at`,
    [name, role, status, passwordHash, req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ message: 'User not found' });
  await auditLog({ userId: req.user.id, action: 'update_user', entityType: 'user', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query(`DELETE FROM users WHERE id = $1 AND id <> $2`, [req.params.id, req.user.id]);
  await auditLog({ userId: req.user.id, action: 'delete_user', entityType: 'user', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
}));

export default router;

