import express from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { year, month, event_type } = req.query;
  const params = [];
  const filters = [];

  if (year) {
    params.push(year);
    filters.push(`EXTRACT(YEAR FROM COALESCE(event_date, created_at)) = $${params.length}`);
  }
  if (month) {
    params.push(month);
    filters.push(`EXTRACT(MONTH FROM COALESCE(event_date, created_at)) = $${params.length}`);
  }
  if (event_type) {
    params.push(event_type);
    filters.push(`wheel_type = $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT r.id,
            COALESCE(r.event_date, r.created_at::date) AS date,
            TRIM(TO_CHAR(COALESCE(r.event_date, r.created_at::date), 'Day')) AS day,
            r.wheel_type AS event_type,
            r.winner_name,
            r.winner_email,
            u.name AS selected_by,
            r.cycle_number,
            r.notes,
            r.created_at
     FROM spin_results r
     LEFT JOIN users u ON u.id = r.selected_by
     ${where}
     ORDER BY COALESCE(r.event_date, r.created_at::date) DESC, r.created_at DESC`,
    params
  );
  res.json(rows);
}));

export default router;

