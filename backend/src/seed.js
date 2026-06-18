import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { getPool, query } from './config/db.js';
import { fileURLToPath } from 'node:url';

dotenv.config();

const users = [
  ['Super Admin', 'superadmin@oration.local', 'super_admin'],
  ['Admin User', 'admin@oration.local', 'admin'],
  ['Demo User', 'user@oration.local', 'user']
];

const employees = [
  ['EMP001', 'Aarav Sharma', 'aarav.sharma@example.com'],
  ['EMP002', 'Ananya Iyer', 'ananya.iyer@example.com'],
  ['EMP003', 'Dev Patel', 'dev.patel@example.com'],
  ['EMP004', 'Diya Nair', 'diya.nair@example.com'],
  ['EMP005', 'Kabir Mehta', 'kabir.mehta@example.com'],
  ['EMP006', 'Meera Rao', 'meera.rao@example.com'],
  ['EMP007', 'Nikhil Verma', 'nikhil.verma@example.com'],
  ['EMP008', 'Priya Menon', 'priya.menon@example.com'],
  ['EMP009', 'Rohan Das', 'rohan.das@example.com'],
  ['EMP010', 'Sara Khan', 'sara.khan@example.com'],
  ['EMP011', 'Vihaan Gupta', 'vihaan.gupta@example.com'],
  ['EMP012', 'Zoya Thomas', 'zoya.thomas@example.com']
];

export async function seedDatabase() {
  const passwordHash = await bcrypt.hash('Password@123', 10);

  for (const [name, email, role] of users) {
    await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email)
       DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
      [name, email, passwordHash, role]
    );
  }

  for (const [employeeId, employeeName, email] of employees) {
    await query(
      `INSERT INTO employees (employee_id, employee_name, email, status, coordinator_eligible)
       VALUES ($1, $2, $3, 'active', true)
       ON CONFLICT (employee_id)
       DO UPDATE SET employee_name = EXCLUDED.employee_name,
                     email = EXCLUDED.email,
                     status = 'active',
                     coordinator_eligible = true`,
      [employeeId, employeeName, email]
    );
  }

  const { rows: superAdmins } = await query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
  const ownerId = superAdmins[0]?.id || null;
  const { rows: wheels } = await query(
    `INSERT INTO wheels (name, description, created_by)
     VALUES ('Fun Friday Lucky Draw', 'Rewards, recognition, and surprise picks', $1)
     ON CONFLICT (name)
     DO UPDATE SET description = EXCLUDED.description
     RETURNING id`,
    [ownerId]
  );

  const entries = ['Coffee Voucher', 'Early Logout Pass', 'Team Shoutout', 'Snack Treat', 'Desk Trophy'];
  for (const label of entries) {
    await query(
      `INSERT INTO wheel_entries (wheel_id, label)
       VALUES ($1, $2)
       ON CONFLICT (wheel_id, label) DO NOTHING`,
      [wheels[0].id, label]
    );
  }

  await query(
    `INSERT INTO spin_cycles (wheel_type, cycle_number, status)
     VALUES ('speaker', 1, 'active')
     ON CONFLICT (wheel_type, cycle_number) DO NOTHING`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seedDatabase();
  console.log('Seed complete. Login password for all seed users: Password@123');
  await getPool().end();
}
