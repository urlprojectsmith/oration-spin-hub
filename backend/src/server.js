import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'node:path';
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
import preparationRoutes from './routes/preparationRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import gamificationRoutes from './routes/gamificationRoutes.js';
import advancedEventRoutes from './routes/advancedEventRoutes.js';
import { errorHandler, notFound } from './middleware/error.js';
import { applyBaseSchema, ensureRuntimeSchema } from './config/migrations.js';
import { getDatabaseState, hasDatabaseConfig, probeDatabase } from './config/db.js';
import { seedDatabase } from './seed.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,https://orationarena.urlfactory.website')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
let databaseHealthTimer;

async function bootstrapDatabase() {
  if (!hasDatabaseConfig()) {
    console.warn('Database setup is required: DATABASE_URL is not configured');
    return;
  }

  const probe = await probeDatabase(undefined, { connectionTimeoutMillis: 1500 });
  if (!probe.connected) {
    console.warn(`Database setup is required: ${probe.error?.message || 'database not reachable'}`);
    return;
  }

  try {
    await applyBaseSchema();
    await ensureRuntimeSchema();
    await seedDatabase();
    console.log('Database schema is ready.');
  } catch (error) {
    console.warn(`Database schema bootstrap failed: ${error.message}`);
  }
}

async function handleHealthCheck(req, res) {
  const state = getDatabaseState();
  res.json({
    ok: true,
    service: 'oration-spin-hub-api',
    database: state.connected ? 'connected' : 'disconnected'
  });
}

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use('/resources', express.static(path.join(dataDir, 'event-resources')));

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);

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
app.use('/api/advanced-events', advancedEventRoutes);
app.use('/api/preparation', preparationRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`oration-spin-hub-api listening on http://0.0.0.0:${port}`);
  probeDatabase(undefined, { connectionTimeoutMillis: 1000 }).catch((error) => {
    console.warn(`Initial database probe failed: ${error.message}`);
  });
  bootstrapDatabase().catch((error) => {
    console.warn(`Database bootstrap failed: ${error.message}`);
  });
  databaseHealthTimer = setInterval(() => {
    probeDatabase(undefined, { connectionTimeoutMillis: 1000 }).catch((error) => {
      console.warn(`Database probe failed: ${error.message}`);
    });
  }, Number(process.env.DB_HEALTH_CHECK_INTERVAL_MS || 30000));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (databaseHealthTimer) clearInterval(databaseHealthTimer);
    process.exit(0);
  });
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection in backend process:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in backend process:', error);
});
