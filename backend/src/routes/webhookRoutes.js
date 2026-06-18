import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { deliverWebhook } from '../services/webhookService.js';

const router = express.Router();
router.use(authenticate, allowRoles('super_admin', 'admin'));

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT id, name, url, events, status, created_at, updated_at FROM webhook_subscriptions ORDER BY created_at DESC`);
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, url, secret, events = ['*'], status = 'active' } = req.body;
  const { rows } = await query(
    `INSERT INTO webhook_subscriptions (name, url, secret, events, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, url, events, status, created_at`,
    [name, url, secret || null, events, status, req.user.id]
  );
  await auditLog({ userId: req.user.id, action: 'create_webhook', entityType: 'webhook', entityId: rows[0].id, metadata: { name, url, events, status }, ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { name, url, secret, events, status } = req.body;
  const { rows } = await query(
    `UPDATE webhook_subscriptions
     SET name = COALESCE($1, name),
         url = COALESCE($2, url),
         secret = COALESCE($3, secret),
         events = COALESCE($4::TEXT[], events),
         status = COALESCE($5, status),
         updated_at = NOW()
     WHERE id = $6
     RETURNING id, name, url, events, status, updated_at`,
    [name, url, secret, events, status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Webhook not found' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query(`DELETE FROM webhook_subscriptions WHERE id = $1`, [req.params.id]);
  res.status(204).send();
}));

router.post('/:id/test', asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT * FROM webhook_subscriptions WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Webhook not found' });
  await deliverWebhook(rows[0], 'webhook.test', { ok: true, webhookId: req.params.id, sentAt: new Date().toISOString() });
  res.json({ message: 'Test webhook event queued' });
}));

router.get('/deliveries/recent', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, w.name AS webhook_name
     FROM webhook_deliveries d
     LEFT JOIN webhook_subscriptions w ON w.id = d.webhook_id
     ORDER BY d.created_at DESC
     LIMIT 100`
  );
  res.json(rows);
}));

export default router;
