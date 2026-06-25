import express from 'express';
import multer from 'multer';
import { query, withTransaction } from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditLog } from '../services/auditService.js';
import { awardPoints } from '../services/gamificationService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
router.use(authenticate);

const objectiveTypes = new Set(['multiple_choice', 'multiple_select', 'true_false', 'fill_blank']);
const questionTypes = ['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'short_answer', 'long_answer', 'rating'];

function isManager(user) {
  return ['super_admin', 'admin'].includes(user.role);
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function jsonParam(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function stripCorrectAnswers(question, user) {
  if (isManager(user)) return question;
  const { correct_answer, explanation, ...safe } = question;
  return safe;
}

function extractUploadedText(file) {
  if (!file) return '';
  const raw = file.buffer.toString('utf8');
  return raw
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 4500);
}

function seededOptions(topic) {
  const words = topic.split(/\s+/).filter((word) => word.length > 3).slice(0, 4);
  return [
    words[0] || 'Preparation',
    words[1] || 'Practice',
    words[2] || 'Feedback',
    words[3] || 'Delivery'
  ];
}

function generateQuizQuestions({ topic = 'Oration Skills', notes = '', count = 7 }) {
  const cleanTopic = topic.trim() || 'Oration Skills';
  const options = seededOptions(`${cleanTopic} ${notes}`);
  const generated = [
    {
      question_type: 'multiple_choice',
      prompt: `Which concept best describes the core theme of ${cleanTopic}?`,
      options,
      correct_answer: [options[0]],
      points: 10,
      bonus_points: 2,
      difficulty: 'easy',
      explanation: `The first option is treated as the primary generated theme.`
    },
    {
      question_type: 'multiple_select',
      prompt: `Select the practices that improve a ${cleanTopic} session.`,
      options: ['Clear examples', 'Audience interaction', 'No rehearsal', 'Structured conclusion'],
      correct_answer: ['Clear examples', 'Audience interaction', 'Structured conclusion'],
      points: 15,
      bonus_points: 3,
      difficulty: 'medium',
      explanation: 'Preparation, interaction, and structure usually improve retention.'
    },
    {
      question_type: 'true_false',
      prompt: `True or False: A strong ${cleanTopic} presentation should include a concise conclusion.`,
      options: ['True', 'False'],
      correct_answer: ['True'],
      points: 8,
      bonus_points: 1,
      difficulty: 'easy',
      explanation: 'A concise conclusion helps the audience retain the message.'
    },
    {
      question_type: 'fill_blank',
      prompt: `Fill in the blank: The best sessions connect ideas to practical _____.`,
      options: [],
      correct_answer: ['examples', 'use cases'],
      points: 10,
      bonus_points: 0,
      difficulty: 'medium',
      explanation: 'Examples and use cases make concepts usable.'
    },
    {
      question_type: 'short_answer',
      prompt: `Name one takeaway from ${cleanTopic} that a team can apply immediately.`,
      options: [],
      correct_answer: [],
      points: 10,
      bonus_points: 0,
      difficulty: 'medium',
      explanation: 'Short answers are stored for review.'
    },
    {
      question_type: 'long_answer',
      prompt: `Explain how ${cleanTopic} could improve day-to-day work in your department.`,
      options: [],
      correct_answer: [],
      points: 15,
      bonus_points: 0,
      difficulty: 'hard',
      explanation: 'Long answers are stored for review.'
    },
    {
      question_type: 'rating',
      prompt: `Rate your confidence in applying ${cleanTopic}.`,
      options: ['1', '2', '3', '4', '5'],
      correct_answer: [],
      points: 0,
      bonus_points: 0,
      difficulty: 'easy',
      explanation: 'Rating questions are not scored automatically.'
    }
  ];
  return generated.slice(0, Math.max(1, Math.min(Number(count) || 7, generated.length)));
}

function scoreAnswer(question, rawAnswer, negativeMarks) {
  const answer = asArray(rawAnswer);
  const correct = asArray(question.correct_answer);
  if (!objectiveTypes.has(question.question_type)) {
    return { isCorrect: null, score: 0, bonus: 0 };
  }

  let isCorrect = false;
  if (question.question_type === 'multiple_select') {
    const selected = answer.map(normalizeText).sort();
    const expected = correct.map(normalizeText).sort();
    isCorrect = selected.length === expected.length && selected.every((item, index) => item === expected[index]);
  } else if (question.question_type === 'fill_blank') {
    isCorrect = correct.map(normalizeText).includes(normalizeText(answer[0]));
  } else {
    isCorrect = normalizeText(answer[0]) === normalizeText(correct[0]);
  }

  if (isCorrect) {
    return { isCorrect, score: Number(question.points || 0) + Number(question.bonus_points || 0), bonus: Number(question.bonus_points || 0) };
  }
  return { isCorrect, score: -Math.abs(Number(negativeMarks || 0)), bonus: 0 };
}

async function recalculateRanks(client, quizId) {
  await client.query(
    `WITH ranked AS (
       SELECT id, RANK() OVER (ORDER BY total_score DESC, submitted_at ASC) AS quiz_rank
       FROM quiz_attempts
       WHERE quiz_id = $1 AND submitted_at IS NOT NULL
     )
     UPDATE quiz_attempts a
     SET rank = ranked.quiz_rank
     FROM ranked
     WHERE a.id = ranked.id`,
    [quizId]
  );
}

router.get('/', asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];
  if (!isManager(req.user)) filters.push(`q.status = 'published'`);
  if (req.query.event_id) {
    params.push(req.query.event_id);
    filters.push(`q.event_id = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT q.*,
            b.title AS event_title,
            COUNT(qq.id)::int AS question_count,
            COUNT(a.id)::int AS attempt_count
     FROM quizzes q
     LEFT JOIN event_banners b ON b.id = q.event_id
     LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
     LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.submitted_at IS NOT NULL
     ${where}
     GROUP BY q.id, b.title
     ORDER BY q.created_at DESC`,
    params
  );
  res.json(rows);
}));

router.get('/leaderboard', asyncHandler(async (req, res) => {
  const { scope = 'all_time', event_id } = req.query;
  const params = [];
  const filters = [`a.submitted_at IS NOT NULL`];
  if (event_id) {
    params.push(event_id);
    filters.push(`q.event_id = $${params.length}`);
  }
  if (scope === 'monthly') filters.push(`DATE_TRUNC('month', a.submitted_at) = DATE_TRUNC('month', CURRENT_DATE)`);
  if (scope === 'yearly') filters.push(`DATE_TRUNC('year', a.submitted_at) = DATE_TRUNC('year', CURRENT_DATE)`);
  const { rows } = await query(
    `SELECT COALESCE(u.name, e.employee_name, 'Participant') AS participant,
            COALESCE(u.email, e.email) AS email,
            q.title AS quiz_title,
            b.title AS event_title,
            MAX(a.total_score)::numeric(10,2) AS best_score,
            MAX(a.percentage)::numeric(5,2) AS best_percentage,
            COUNT(a.id)::int AS attempts
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     LEFT JOIN event_banners b ON b.id = q.event_id
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE ${filters.join(' AND ')}
     GROUP BY participant, email, q.title, b.title
     ORDER BY best_score DESC, best_percentage DESC, participant ASC
     LIMIT 100`,
    params
  );
  res.json(rows);
}));

router.get('/analytics', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { quiz_id } = req.query;
  const params = [];
  const quizFilter = quiz_id ? `WHERE q.id = $1` : '';
  if (quiz_id) params.push(quiz_id);

  const [summary, topPerformers, difficulty] = await Promise.all([
    query(
      `SELECT COUNT(a.id)::int AS attempts,
              COALESCE(AVG(a.percentage), 0)::numeric(5,2) AS average_score,
              COALESCE(MAX(a.percentage), 0)::numeric(5,2) AS top_score,
              COALESCE(AVG(CASE WHEN a.passed THEN 1 ELSE 0 END) * 100, 0)::numeric(5,2) AS pass_rate
       FROM quizzes q
       LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.submitted_at IS NOT NULL
       ${quizFilter}`,
      params
    ),
    query(
      `SELECT COALESCE(u.name, e.employee_name, 'Participant') AS participant,
              q.title AS quiz_title,
              a.total_score,
              a.percentage,
              a.rank
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${quiz_id ? 'WHERE q.id = $1 AND a.submitted_at IS NOT NULL' : 'WHERE a.submitted_at IS NOT NULL'}
       ORDER BY a.total_score DESC, a.submitted_at ASC
       LIMIT 10`,
      params
    ),
    query(
      `SELECT qq.id,
              qq.prompt,
              qq.question_type,
              qq.difficulty,
              COUNT(qa.id)::int AS answers,
              COALESCE(AVG(CASE WHEN qa.is_correct THEN 1 WHEN qa.is_correct = false THEN 0 ELSE NULL END) * 100, 0)::numeric(5,2) AS correct_rate
       FROM quiz_questions qq
       JOIN quizzes q ON q.id = qq.quiz_id
       LEFT JOIN quiz_answers qa ON qa.question_id = qq.id
       ${quizFilter}
       GROUP BY qq.id
       ORDER BY correct_rate ASC, answers DESC`,
      params
    )
  ]);

  res.json({
    summary: summary.rows[0],
    top_performers: topPerformers.rows,
    question_difficulty: difficulty.rows
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [quiz, questions] = await Promise.all([
    query(
      `SELECT q.*, b.title AS event_title
       FROM quizzes q
       LEFT JOIN event_banners b ON b.id = q.event_id
       WHERE q.id = $1`,
      [req.params.id]
    ),
    query(`SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY sort_order, created_at`, [req.params.id])
  ]);
  if (!quiz.rows[0]) return res.status(404).json({ message: 'Quiz not found' });
  if (!isManager(req.user) && quiz.rows[0].status !== 'published') return res.status(403).json({ message: 'Quiz is not published' });
  const questionRows = quiz.rows[0].random_questions
    ? [...questions.rows].sort(() => Math.random() - 0.5)
    : questions.rows;
  res.json({
    ...quiz.rows[0],
    questions: questionRows.map((question) => {
      const withOptions = quiz.rows[0].random_options && Array.isArray(question.options)
        ? { ...question, options: [...question.options].sort(() => Math.random() - 0.5) }
        : question;
      return stripCorrectAnswers(withOptions, req.user);
    })
  });
}));

router.post('/', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { event_id, title, description, timer_minutes = 15, pass_percentage = 60, negative_marks = 0, random_questions = false, random_options = false, status = 'draft', questions = [] } = req.body;
  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO quizzes (event_id, title, description, timer_minutes, pass_percentage, negative_marks, random_questions, random_options, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [event_id || null, title, description || null, timer_minutes, pass_percentage, negative_marks, random_questions, random_options, status, req.user.id]
    );
    for (const [index, item] of questions.entries()) {
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_type, prompt, options, correct_answer, points, bonus_points, sort_order, difficulty, explanation)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)`,
        [
          rows[0].id,
          questionTypes.includes(item.question_type) ? item.question_type : 'multiple_choice',
          item.prompt,
          jsonParam(item.options, []),
          jsonParam(item.correct_answer, []),
          item.points || 10,
          item.bonus_points || 0,
          item.sort_order ?? index,
          item.difficulty || 'medium',
          item.explanation || null
        ]
      );
    }
    return rows[0];
  });
  await auditLog({ userId: req.user.id, action: 'create_quiz', entityType: 'quiz', entityId: created.id, metadata: req.body, ip: req.ip });
  res.status(201).json(created);
}));

router.patch('/:id/settings', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { title, description, timer_minutes, pass_percentage, negative_marks, random_questions, random_options, status, event_id } = req.body;
  const { rows } = await query(
    `UPDATE quizzes
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         timer_minutes = COALESCE($3, timer_minutes),
         pass_percentage = COALESCE($4, pass_percentage),
         negative_marks = COALESCE($5, negative_marks),
         random_questions = COALESCE($6, random_questions),
         random_options = COALESCE($7, random_options),
         status = COALESCE($8, status),
         event_id = COALESCE($9, event_id),
         updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [title, description, timer_minutes, pass_percentage, negative_marks, random_questions, random_options, status, event_id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Quiz not found' });
  res.json(rows[0]);
}));

router.post('/:id/questions', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const item = req.body;
  const { rows } = await query(
    `INSERT INTO quiz_questions (quiz_id, question_type, prompt, options, correct_answer, points, bonus_points, sort_order, difficulty, explanation)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      req.params.id,
      questionTypes.includes(item.question_type) ? item.question_type : 'multiple_choice',
      item.prompt,
      jsonParam(item.options, []),
      jsonParam(item.correct_answer, []),
      item.points || 10,
      item.bonus_points || 0,
      item.sort_order || 0,
      item.difficulty || 'medium',
      item.explanation || null
    ]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id/questions/:questionId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const item = req.body;
  const { rows } = await query(
    `UPDATE quiz_questions
     SET question_type = COALESCE($1, question_type),
         prompt = COALESCE($2, prompt),
         options = COALESCE($3::jsonb, options),
         correct_answer = COALESCE($4::jsonb, correct_answer),
         points = COALESCE($5, points),
         bonus_points = COALESCE($6, bonus_points),
         sort_order = COALESCE($7, sort_order),
         difficulty = COALESCE($8, difficulty),
         explanation = COALESCE($9, explanation),
         updated_at = NOW()
     WHERE quiz_id = $10 AND id = $11
     RETURNING *`,
    [
      item.question_type,
      item.prompt,
      item.options === undefined ? null : jsonParam(item.options, []),
      item.correct_answer === undefined ? null : jsonParam(item.correct_answer, []),
      item.points,
      item.bonus_points,
      item.sort_order,
      item.difficulty,
      item.explanation,
      req.params.id,
      req.params.questionId
    ]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Question not found' });
  res.json(rows[0]);
}));

router.delete('/:id/questions/:questionId', allowRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM quiz_questions WHERE quiz_id = $1 AND id = $2`, [req.params.id, req.params.questionId]);
  res.status(204).send();
}));

router.post('/generate', allowRoles('super_admin', 'admin'), upload.single('file'), asyncHandler(async (req, res) => {
  const uploadedText = extractUploadedText(req.file);
  const topic = req.body.topic || req.body.event_topic || req.file?.originalname?.replace(/\.[^.]+$/, '') || 'Event Quiz';
  const notes = [req.body.notes, uploadedText].filter(Boolean).join('\n\n');
  const questions = generateQuizQuestions({ topic, notes, count: req.body.count });
  let quiz = null;
  if (String(req.body.save) === 'true') {
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO quizzes (event_id, title, description, source_type, timer_minutes, pass_percentage, negative_marks, random_questions, random_options, status, created_by)
         VALUES ($1, $2, $3, 'ai', $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.body.event_id || null,
          `${topic} Quiz`,
          `AI-generated quiz from ${req.file?.originalname || 'topic and notes'}`,
          req.body.timer_minutes || 15,
          req.body.pass_percentage || 60,
          req.body.negative_marks || 0,
          String(req.body.random_questions) === 'true',
          String(req.body.random_options) === 'true',
          req.body.status || 'draft',
          req.user.id
        ]
      );
      for (const [index, item] of questions.entries()) {
        await client.query(
          `INSERT INTO quiz_questions (quiz_id, question_type, prompt, options, correct_answer, points, bonus_points, sort_order, difficulty, explanation)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)`,
          [rows[0].id, item.question_type, item.prompt, jsonParam(item.options, []), jsonParam(item.correct_answer, []), item.points, item.bonus_points, index, item.difficulty, item.explanation]
        );
      }
      return rows[0];
    });
    quiz = created;
  }
  await auditLog({ userId: req.user.id, action: 'generate_ai_quiz', entityType: 'quiz', entityId: quiz?.id, metadata: { topic, file: req.file?.originalname }, ip: req.ip });
  res.json({ topic, source_file: req.file?.originalname || null, questions, quiz });
}));

router.post('/:id/attempts', asyncHandler(async (req, res) => {
  const { rows: quizRows } = await query(`SELECT * FROM quizzes WHERE id = $1`, [req.params.id]);
  if (!quizRows[0]) return res.status(404).json({ message: 'Quiz not found' });
  if (!isManager(req.user) && quizRows[0].status !== 'published') return res.status(403).json({ message: 'Quiz is not published' });
  const { rows: employeeRows } = await query(`SELECT id FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`, [req.user.email]);
  const { rows } = await query(
    `INSERT INTO quiz_attempts (quiz_id, user_id, employee_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.params.id, req.user.id, employeeRows[0]?.id || null]
  );
  res.status(201).json(rows[0]);
}));

router.post('/:id/attempts/:attemptId/submit', asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const { rows: quizRows } = await client.query(`SELECT * FROM quizzes WHERE id = $1`, [req.params.id]);
    if (!quizRows[0]) {
      const error = new Error('Quiz not found');
      error.status = 404;
      throw error;
    }
    const { rows: attemptRows } = await client.query(
      `SELECT * FROM quiz_attempts WHERE id = $1 AND quiz_id = $2 AND submitted_at IS NULL`,
      [req.params.attemptId, req.params.id]
    );
    if (!attemptRows[0]) {
      const error = new Error('Open attempt not found');
      error.status = 404;
      throw error;
    }
    if (!isManager(req.user) && attemptRows[0].user_id !== req.user.id) {
      const error = new Error('You can submit only your own attempt');
      error.status = 403;
      throw error;
    }

    const { rows: questions } = await client.query(`SELECT * FROM quiz_questions WHERE quiz_id = $1`, [req.params.id]);
    const answersByQuestion = new Map((req.body.answers || []).map((item) => [item.question_id, item.answer]));
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let bonusScore = 0;

    for (const question of questions) {
      maxScore += Number(question.points || 0) + Number(question.bonus_points || 0);
      const rawAnswer = answersByQuestion.get(question.id);
      const scored = scoreAnswer(question, rawAnswer, quizRows[0].negative_marks);
      totalScore += scored.score;
      bonusScore += scored.bonus;
      if (scored.isCorrect === true) correctCount += 1;
      if (scored.isCorrect === false) wrongCount += 1;
      await client.query(
        `INSERT INTO quiz_answers (attempt_id, question_id, answer, is_correct, score)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET answer = EXCLUDED.answer, is_correct = EXCLUDED.is_correct, score = EXCLUDED.score`,
        [req.params.attemptId, question.id, jsonParam(asArray(rawAnswer), []), scored.isCorrect, scored.score]
      );
    }

    const safeScore = Math.max(totalScore, 0);
    const percentage = maxScore ? Math.round((safeScore / maxScore) * 10000) / 100 : 0;
    const passed = percentage >= Number(quizRows[0].pass_percentage);
    const { rows: updated } = await client.query(
      `UPDATE quiz_attempts
       SET total_score = $1,
           max_score = $2,
           percentage = $3,
           correct_count = $4,
           wrong_count = $5,
           bonus_score = $6,
           passed = $7,
           submitted_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [safeScore, maxScore, percentage, correctCount, wrongCount, bonusScore, passed, req.params.attemptId]
    );
    await recalculateRanks(client, req.params.id);
    const { rows: ranked } = await client.query(`SELECT * FROM quiz_attempts WHERE id = $1`, [req.params.attemptId]);
    return ranked[0] || updated[0];
  });
  if (result.employee_id) {
    await awardPoints({
      employeeId: result.employee_id,
      userId: result.user_id,
      actionType: 'complete_quiz',
      sourceType: 'quiz_attempt',
      sourceId: result.id,
      metadata: { quiz_id: req.params.id, percentage: result.percentage, total_score: result.total_score }
    });
    if (result.passed) {
      await awardPoints({
        employeeId: result.employee_id,
        userId: result.user_id,
        actionType: 'pass_quiz',
        sourceType: 'quiz_attempt',
        sourceId: result.id,
        metadata: { quiz_id: req.params.id, percentage: result.percentage, total_score: result.total_score }
      });
    }
  }
  await auditLog({ userId: req.user.id, action: 'submit_quiz_attempt', entityType: 'quiz_attempt', entityId: result.id, metadata: { quiz_id: req.params.id }, ip: req.ip });
  res.json(result);
}));

export default router;
