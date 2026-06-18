import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  const user = rows[0];

  if (!user || user.status !== 'active') {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;

