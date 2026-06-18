import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { query, withTransaction } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { search = '', spoken, status } = req.query;
  const filters = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(employee_name ILIKE $${params.length} OR employee_id ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (spoken === 'true' || spoken === 'false') {
    params.push(spoken === 'true');
    filters.push(`already_spoken = $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(`SELECT * FROM employees ${where} ORDER BY employee_name`, params);
  res.json(rows);
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { employee_id, employee_name, email, status = 'active', already_spoken = false, coordinator_eligible = true } = req.body;
  const { rows } = await query(
    `INSERT INTO employees (employee_id, employee_name, email, status, already_spoken, coordinator_eligible)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [employee_id, employee_name, email, status, already_spoken, coordinator_eligible]
  );
  await auditLog({ userId: req.user.id, action: 'create_employee', entityType: 'employee', entityId: rows[0].id, metadata: rows[0], ip: req.ip });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { employee_id, employee_name, email, status, already_spoken, coordinator_eligible } = req.body;
  const { rows } = await query(
    `UPDATE employees
     SET employee_id = COALESCE($1, employee_id),
         employee_name = COALESCE($2, employee_name),
         email = COALESCE($3, email),
         status = COALESCE($4, status),
         already_spoken = COALESCE($5, already_spoken),
         coordinator_eligible = COALESCE($6, coordinator_eligible),
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [employee_id, employee_name, email, status, already_spoken, coordinator_eligible, req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ message: 'Employee not found' });
  await auditLog({ userId: req.user.id, action: 'update_employee', entityType: 'employee', entityId: rows[0].id, metadata: req.body, ip: req.ip });
  res.json(rows[0]);
}));

router.delete('/:id', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM employees WHERE id = $1`, [req.params.id]);
  await auditLog({ userId: req.user.id, action: 'delete_employee', entityType: 'employee', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
}));

router.post('/bulk-import', allowRoles('super_admin', 'admin'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

  const records = parse(req.file.buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const imported = await withTransaction(async (client) => {
    const output = [];
    for (const record of records) {
      const values = [
        record.employee_id || record['Employee ID'],
        record.employee_name || record['Employee Name'] || record.name,
        record.email || record.Email,
        record.status || 'active',
        ['true', 'yes', '1'].includes(String(record.already_spoken || record['Already Spoken']).toLowerCase()),
        !['false', 'no', '0'].includes(String(record.coordinator_eligible || record['Coordinator Eligible'] || 'true').toLowerCase())
      ];
      const { rows } = await client.query(
        `INSERT INTO employees (employee_id, employee_name, email, status, already_spoken, coordinator_eligible)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_id)
         DO UPDATE SET employee_name = EXCLUDED.employee_name,
                       email = EXCLUDED.email,
                       status = EXCLUDED.status,
                       already_spoken = EXCLUDED.already_spoken,
                       coordinator_eligible = EXCLUDED.coordinator_eligible,
                       updated_at = NOW()
         RETURNING *`,
        values
      );
      output.push(rows[0]);
    }
    return output;
  });

  await auditLog({ userId: req.user.id, action: 'bulk_import_employees', entityType: 'employee', metadata: { count: imported.length }, ip: req.ip });
  res.json({ imported });
}));

router.post('/bulk-action', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { employee_ids = [], action } = req.body;
  if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
    return res.status(400).json({ message: 'Select at least one employee' });
  }

  const actions = {
    activate: [`UPDATE employees SET status = 'active', updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    deactivate: [`UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    mark_spoken: [`UPDATE employees SET already_spoken = true, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    mark_not_spoken: [`UPDATE employees SET already_spoken = false, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    coordinator_yes: [`UPDATE employees SET coordinator_eligible = true, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    coordinator_no: [`UPDATE employees SET coordinator_eligible = false, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING *`],
    delete: [`DELETE FROM employees WHERE id = ANY($1::uuid[]) RETURNING *`]
  };

  if (!actions[action]) {
    return res.status(400).json({ message: 'Invalid bulk action' });
  }

  const { rows } = await query(actions[action][0], [employee_ids]);
  await auditLog({
    userId: req.user.id,
    action: `bulk_${action}_employees`,
    entityType: 'employee',
    metadata: { count: rows.length, employee_ids },
    ip: req.ip
  });
  res.json({ count: rows.length, employees: rows });
}));

router.post('/reset-spoken', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`UPDATE employees SET already_spoken = false, updated_at = NOW() WHERE status = 'active'`);
  await query(`UPDATE spin_cycles SET status = 'completed', completed_at = NOW() WHERE wheel_type = 'speaker' AND status = 'active'`);
  await auditLog({ userId: req.user.id, action: 'manual_reset_spoken_cycle', entityType: 'cycle', metadata: req.body, ip: req.ip });
  res.json({ message: 'Spoken status reset and active speaker cycle closed' });
}));

export default router;
