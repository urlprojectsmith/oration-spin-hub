import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { getPool, query } from './config/db.js';

dotenv.config();

const DEFAULT_EMAIL = 'superadmin@oration.local';

export async function resetSuperAdminPassword({
  email = process.env.SUPER_ADMIN_EMAIL || DEFAULT_EMAIL,
  password = process.env.SUPER_ADMIN_PASSWORD
} = {}) {
  if (!password) {
    throw new Error('SUPER_ADMIN_PASSWORD is required');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, status)
     VALUES ('Super Admin', $1, $2, 'super_admin', 'active')
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name,
                   password_hash = EXCLUDED.password_hash,
                   role = 'super_admin',
                   status = 'active'
     RETURNING id, email, role, status`,
    [email, passwordHash]
  );

  return rows[0];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const user = await resetSuperAdminPassword();
    console.log(`Super admin password reset for ${user.email}`);
  } finally {
    await getPool().end();
  }
}
