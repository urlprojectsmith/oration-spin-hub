import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, name, email, role, status FROM users WHERE id = $1`,
      [payload.sub]
    );

    if (!rows[0] || rows[0].status !== 'active') {
      return res.status(401).json({ message: 'User is inactive or missing' });
    }

    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }
    next();
  };
}

