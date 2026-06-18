import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import spinRoutes from './routes/spinRoutes.js';
import wheelRoutes from './routes/wheelRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import userRoutes from './routes/userRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import setupRoutes from './routes/setupRoutes.js';
import { errorHandler, notFound } from './middleware/error.js';
import { ensureRuntimeSchema } from './config/migrations.js';
import { hasDatabaseConfig } from './config/db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,https://orationarena.urlfactory.website')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, app: 'ORATION ARENA' });
});

app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/spin', spinRoutes);
app.use('/api/wheels', wheelRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

if (hasDatabaseConfig()) {
  try {
    await ensureRuntimeSchema();
  } catch (error) {
    console.warn(`Database setup is required: ${error.message}`);
  }
} else {
  console.warn('Database setup is required: DATABASE_URL is not configured');
}

app.listen(port, () => {
  console.log(`ORATION ARENA API listening on http://localhost:${port}`);
});
