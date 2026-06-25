import { BarChart3, HelpCircle, PlayCircle, Plus, Save, Settings, Sparkles, Trophy, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api, canManage } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyQuiz = {
  title: '',
  description: '',
  event_id: '',
  timer_minutes: 15,
  pass_percentage: 60,
  negative_marks: 0,
  random_questions: false,
  random_options: false,
  status: 'draft'
};

const emptyQuestion = {
  question_type: 'multiple_choice',
  prompt: '',
  optionsText: 'Option A\nOption B\nOption C\nOption D',
  correctText: 'Option A',
  points: 10,
  bonus_points: 0,
  difficulty: 'medium',
  explanation: ''
};

const questionTypes = [
  ['multiple_choice', 'Multiple Choice'],
  ['multiple_select', 'Multiple Select'],
  ['true_false', 'True/False'],
  ['fill_blank', 'Fill in the Blank'],
  ['short_answer', 'Short Answer'],
  ['long_answer', 'Long Answer'],
  ['rating', 'Rating Question']
];

function lines(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function answerInputFor(question, value, onChange) {
  if (question.question_type === 'multiple_select') {
    return (
      <div className="quiz-answer-options">
        {(question.options || []).map((option) => (
          <label className="check-row" key={option}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(option)}
              onChange={(event) => {
                const current = Array.isArray(value) ? value : [];
                onChange(event.target.checked ? [...current, option] : current.filter((item) => item !== option));
              }}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (['multiple_choice', 'true_false', 'rating'].includes(question.question_type)) {
    return (
      <select value={Array.isArray(value) ? value[0] || '' : value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select answer</option>
        {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  return <textarea value={Array.isArray(value) ? value[0] || '' : value || ''} onChange={(event) => onChange(event.target.value)} />;
}

export default function QuizStudio() {
  const { user } = useAuth();
  const manager = canManage(user.role);
  const [quizzes, setQuizzes] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [quizForm, setQuizForm] = useState(emptyQuiz);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [generator, setGenerator] = useState({ topic: '', notes: '', count: 7, save: true, status: 'draft', file: null });
  const [generated, setGenerated] = useState([]);
  const [leaderboardScope, setLeaderboardScope] = useState('all_time');
  const [leaderboard, setLeaderboard] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');

  async function load() {
    const [quizRows, eventRows, leaderboardRows] = await Promise.all([
      api('/quizzes'),
      api('/events'),
      api(`/quizzes/leaderboard?scope=${leaderboardScope}`)
    ]);
    setQuizzes(quizRows);
    setEvents(eventRows);
    setLeaderboard(leaderboardRows);
    if (!selectedId && quizRows[0]) setSelectedId(quizRows[0].id);
  }

  useEffect(() => {
    load();
  }, [leaderboardScope]);

  useEffect(() => {
    if (!selectedId) return;
    Promise.all([
      api(`/quizzes/${selectedId}`),
      manager ? api(`/quizzes/analytics?quiz_id=${selectedId}`) : Promise.resolve(null)
    ]).then(([quiz, analyticsData]) => {
      setSelected(quiz);
      setQuizForm({
        title: quiz.title || '',
        description: quiz.description || '',
        event_id: quiz.event_id || '',
        timer_minutes: quiz.timer_minutes || 15,
        pass_percentage: quiz.pass_percentage || 60,
        negative_marks: quiz.negative_marks || 0,
        random_questions: Boolean(quiz.random_questions),
        random_options: Boolean(quiz.random_options),
        status: quiz.status || 'draft'
      });
      setAnalytics(analyticsData);
      setAttempt(null);
      setAnswers({});
    });
  }, [selectedId, manager]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === quizForm.event_id), [events, quizForm.event_id]);

  async function createQuiz(event) {
    event.preventDefault();
    const quiz = await api('/quizzes', { method: 'POST', body: quizForm });
    setMessage('Quiz created.');
    setSelectedId(quiz.id);
    await load();
  }

  async function saveSettings(event) {
    event.preventDefault();
    await api(`/quizzes/${selectedId}/settings`, { method: 'PATCH', body: quizForm });
    setMessage('Quiz settings saved.');
    await load();
  }

  async function addQuestion(event) {
    event.preventDefault();
    await api(`/quizzes/${selectedId}/questions`, {
      method: 'POST',
      body: {
        question_type: questionForm.question_type,
        prompt: questionForm.prompt,
        options: questionForm.question_type === 'true_false' ? ['True', 'False'] : questionForm.question_type === 'rating' ? ['1', '2', '3', '4', '5'] : lines(questionForm.optionsText),
        correct_answer: lines(questionForm.correctText),
        points: Number(questionForm.points) || 0,
        bonus_points: Number(questionForm.bonus_points) || 0,
        difficulty: questionForm.difficulty,
        explanation: questionForm.explanation
      }
    });
    setQuestionForm(emptyQuestion);
    setMessage('Question added.');
    setSelected(await api(`/quizzes/${selectedId}`));
  }

  async function generateQuiz(event) {
    event.preventDefault();
    const body = new FormData();
    for (const [key, value] of Object.entries(generator)) {
      if (key === 'file') continue;
      body.append(key, value);
    }
    if (!generator.topic && selectedEvent?.title) body.set('topic', selectedEvent.title);
    if (quizForm.event_id) body.append('event_id', quizForm.event_id);
    if (generator.file) body.append('file', generator.file);
    const result = await api('/quizzes/generate', { method: 'POST', body });
    setGenerated(result.questions);
    if (result.quiz?.id) {
      setSelectedId(result.quiz.id);
      setMessage('AI quiz generated and saved.');
      await load();
    } else {
      setMessage('AI quiz questions generated.');
    }
  }

  async function startAttempt() {
    const created = await api(`/quizzes/${selectedId}/attempts`, { method: 'POST' });
    setAttempt(created);
    setMessage('Attempt started.');
  }

  async function submitAttempt(event) {
    event.preventDefault();
    const result = await api(`/quizzes/${selectedId}/attempts/${attempt.id}/submit`, {
      method: 'POST',
      body: {
        answers: Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer }))
      }
    });
    setAttempt(result);
    setMessage(`Submitted: ${result.percentage}% (${result.total_score}/${result.max_score}), rank ${result.rank || '-'}.`);
    setLeaderboard(await api(`/quizzes/leaderboard?scope=${leaderboardScope}`));
    if (manager) setAnalytics(await api(`/quizzes/analytics?quiz_id=${selectedId}`));
  }

  return (
    <>
      <PageHeader title="Quiz Studio" kicker="builder, scoring, leaderboard, analytics" />
      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="quiz-layout">
        <aside className="panel quiz-sidebar">
          <div className="panel-title">
            <HelpCircle size={20} />
            Quizzes
          </div>
          <div className="quiz-list">
            {quizzes.map((quiz) => (
              <button key={quiz.id} className={selectedId === quiz.id ? 'active' : ''} onClick={() => setSelectedId(quiz.id)}>
                <strong>{quiz.title}</strong>
                <span>{quiz.event_title || 'No event'} - {quiz.question_count} questions</span>
              </button>
            ))}
            {!quizzes.length ? <div className="empty-state">No quizzes yet.</div> : null}
          </div>

          {manager ? (
            <form className="quiz-create-form" onSubmit={createQuiz}>
              <div className="panel-title">
                <Plus size={20} />
                New Quiz
              </div>
              <input placeholder="Quiz title" value={quizForm.title} onChange={(event) => setQuizForm({ ...quizForm, title: event.target.value })} required />
              <select value={quizForm.event_id} onChange={(event) => setQuizForm({ ...quizForm, event_id: event.target.value })}>
                <option value="">No event</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
              <button className="primary-btn">Create Quiz</button>
            </form>
          ) : null}
        </aside>

        <main className="quiz-main">
          {manager ? (
            <section className="panel quiz-generator">
              <div className="panel-title">
                <Sparkles size={20} />
                AI Quiz Generator
              </div>
              <form onSubmit={generateQuiz}>
                <div className="form-grid-2">
                  <input placeholder="Event topic" value={generator.topic || selectedEvent?.title || ''} onChange={(event) => setGenerator({ ...generator, topic: event.target.value })} />
                  <input type="number" min="1" max="7" value={generator.count} onChange={(event) => setGenerator({ ...generator, count: event.target.value })} />
                </div>
                <textarea placeholder="Paste notes or source content" value={generator.notes} onChange={(event) => setGenerator({ ...generator, notes: event.target.value })} />
                <label className="file-btn secondary-btn">
                  <Upload size={16} />
                  {generator.file ? generator.file.name : 'Upload PDF/PPT'}
                  <input type="file" accept=".pdf,.ppt,.pptx,.txt,.md" onChange={(event) => setGenerator({ ...generator, file: event.target.files?.[0] || null })} />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={generator.save} onChange={(event) => setGenerator({ ...generator, save: event.target.checked })} />
                  Save generated quiz
                </label>
                <button className="secondary-btn">
                  <Sparkles size={16} />
                  Generate Quiz
                </button>
              </form>
              {generated.length ? (
                <div className="generated-questions">
                  {generated.map((question) => (
                    <div key={question.prompt}>
                      <strong>{question.prompt}</strong>
                      <span>{question.question_type.replaceAll('_', ' ')} - {question.points} pts</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {selected ? (
            <>
              <section className="panel quiz-settings">
                <div className="panel-title">
                  <Settings size={20} />
                  Quiz Settings
                </div>
                <form onSubmit={saveSettings}>
                  <div className="form-grid-2">
                    <input value={quizForm.title} onChange={(event) => setQuizForm({ ...quizForm, title: event.target.value })} disabled={!manager} />
                    <select value={quizForm.event_id} onChange={(event) => setQuizForm({ ...quizForm, event_id: event.target.value })} disabled={!manager}>
                      <option value="">No event</option>
                      {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
                    </select>
                    <label>Timer<input type="number" value={quizForm.timer_minutes} onChange={(event) => setQuizForm({ ...quizForm, timer_minutes: Number(event.target.value) })} disabled={!manager} /></label>
                    <label>Pass %<input type="number" value={quizForm.pass_percentage} onChange={(event) => setQuizForm({ ...quizForm, pass_percentage: Number(event.target.value) })} disabled={!manager} /></label>
                    <label>Negative Marks<input type="number" step="0.25" value={quizForm.negative_marks} onChange={(event) => setQuizForm({ ...quizForm, negative_marks: Number(event.target.value) })} disabled={!manager} /></label>
                    <select value={quizForm.status} onChange={(event) => setQuizForm({ ...quizForm, status: event.target.value })} disabled={!manager}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className="toggle-grid">
                    <label className="check-row"><input type="checkbox" checked={quizForm.random_questions} onChange={(event) => setQuizForm({ ...quizForm, random_questions: event.target.checked })} disabled={!manager} />Random questions</label>
                    <label className="check-row"><input type="checkbox" checked={quizForm.random_options} onChange={(event) => setQuizForm({ ...quizForm, random_options: event.target.checked })} disabled={!manager} />Random options</label>
                  </div>
                  {manager ? <button className="primary-btn"><Save size={16} />Save Settings</button> : null}
                </form>
              </section>

              <section className="panel quiz-builder">
                <div className="panel-title">
                  <HelpCircle size={20} />
                  Quiz Builder
                </div>
                {manager ? (
                  <form className="question-form" onSubmit={addQuestion}>
                    <div className="form-grid-2">
                      <select value={questionForm.question_type} onChange={(event) => setQuestionForm({ ...questionForm, question_type: event.target.value })}>
                        {questionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select value={questionForm.difficulty} onChange={(event) => setQuestionForm({ ...questionForm, difficulty: event.target.value })}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <textarea placeholder="Question prompt" value={questionForm.prompt} onChange={(event) => setQuestionForm({ ...questionForm, prompt: event.target.value })} required />
                    <div className="form-grid-2">
                      <textarea placeholder="Options, one per line" value={questionForm.optionsText} onChange={(event) => setQuestionForm({ ...questionForm, optionsText: event.target.value })} />
                      <textarea placeholder="Correct answers, one per line" value={questionForm.correctText} onChange={(event) => setQuestionForm({ ...questionForm, correctText: event.target.value })} />
                      <input type="number" placeholder="Points" value={questionForm.points} onChange={(event) => setQuestionForm({ ...questionForm, points: event.target.value })} />
                      <input type="number" placeholder="Bonus points" value={questionForm.bonus_points} onChange={(event) => setQuestionForm({ ...questionForm, bonus_points: event.target.value })} />
                    </div>
                    <input placeholder="Explanation" value={questionForm.explanation} onChange={(event) => setQuestionForm({ ...questionForm, explanation: event.target.value })} />
                    <button className="secondary-btn"><Plus size={16} />Add Question</button>
                  </form>
                ) : null}

                <div className="question-list">
                  {selected.questions.map((question, index) => (
                    <article key={question.id}>
                      <span className="kicker">#{index + 1} - {question.question_type.replaceAll('_', ' ')} - {question.difficulty}</span>
                      <strong>{question.prompt}</strong>
                      <small>{question.points} pts + {question.bonus_points} bonus</small>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel quiz-attempt-panel">
                <div className="panel-title">
                  <PlayCircle size={20} />
                  Quiz Attempt
                </div>
                {!attempt ? (
                  <button className="primary-btn" onClick={startAttempt}>Start Attempt</button>
                ) : attempt.submitted_at ? (
                  <div className="result-box">
                    <span>Final Score</span>
                    <strong>{attempt.percentage}%</strong>
                    <small>{attempt.total_score}/{attempt.max_score} points - rank {attempt.rank || '-'}</small>
                  </div>
                ) : (
                  <form className="attempt-form" onSubmit={submitAttempt}>
                    {selected.questions.map((question) => (
                      <label key={question.id}>
                        {question.prompt}
                        {answerInputFor(question, answers[question.id], (value) => setAnswers({ ...answers, [question.id]: value }))}
                      </label>
                    ))}
                    <button className="primary-btn">Submit Attempt</button>
                  </form>
                )}
              </section>
            </>
          ) : null}
        </main>

        <aside className="quiz-side-panels">
          <section className="panel">
            <div className="panel-title">
              <Trophy size={20} />
              Leaderboard
            </div>
            <select value={leaderboardScope} onChange={(event) => setLeaderboardScope(event.target.value)}>
              <option value="all_time">All Time</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <div className="leaderboard quiz-leaderboard">
              {leaderboard.slice(0, 8).map((row, index) => (
                <div key={`${row.email}-${row.quiz_title}-${index}`}>
                  <span>#{index + 1}</span>
                  <strong>{row.participant}</strong>
                  <small>{row.best_score} pts - {row.best_percentage}%</small>
                </div>
              ))}
              {!leaderboard.length ? <div className="empty-state">No quiz attempts yet.</div> : null}
            </div>
          </section>

          {manager && analytics ? (
            <section className="panel">
              <div className="panel-title">
                <BarChart3 size={20} />
                Analytics
              </div>
              <div className="analytics-grid">
                <div><span>Average</span><strong>{analytics.summary.average_score}%</strong></div>
                <div><span>Top</span><strong>{analytics.summary.top_score}%</strong></div>
                <div><span>Pass Rate</span><strong>{analytics.summary.pass_rate}%</strong></div>
                <div><span>Attempts</span><strong>{analytics.summary.attempts}</strong></div>
              </div>
              <div className="difficulty-list">
                {analytics.question_difficulty.slice(0, 6).map((item) => (
                  <div key={item.id}>
                    <strong>{item.correct_rate}% correct</strong>
                    <span>{item.prompt}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </>
  );
}
