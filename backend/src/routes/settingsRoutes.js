import express from 'express';
import { query } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
router.use(authenticate);

router.get('/', allowRoles('super_admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT key, value FROM app_settings ORDER BY key`);
  res.json(rows.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {}));
}));

router.put('/', allowRoles('super_admin'), asyncHandler(async (req, res) => {
  const safeKeys = [
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_user',
    'smtp_pass',
    'email_from',
    'email_subject_template',
    'email_body_template',
    'webex_bot_token',
    'webex_room_id',
    'webex_body_template'
  ];

  for (const key of safeKeys) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      await query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, req.body[key]]
      );
    }
  }

  await auditLog({ userId: req.user.id, action: 'update_settings', entityType: 'settings', metadata: { keys: Object.keys(req.body) }, ip: req.ip });
  res.json({ message: 'Settings saved' });
}));

export default router;

