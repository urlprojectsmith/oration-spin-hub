import { query } from '../config/db.js';

export async function auditLog({ userId, action, entityType, entityId, metadata = {}, ip }) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId || null, action, entityType, entityId || null, metadata, ip || null]
  );
}

