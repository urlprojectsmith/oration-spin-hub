import { CalendarClock, CheckCircle2, HelpCircle, Image, MessageSquare, Pencil, Plus, Send, Sparkles, Star, Target, Trash2, Trophy, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, canManage } from '../lib/api.js';

const emptyEvent = {
  title: '',
  description: '',
  event_date: '',
  event_time: '',
  event_type: 'Oration Task',
  event_category: 'Oration',
  event_mode: 'standard',
  presenter: '',
  department: '',
  expected_audience: '',
  banner_image_url: '',
  template: 'corporate',
  assigned_employee_id: '',
  status: 'upcoming',
  hero_tone: 'neon',
  quiz_required: false,
  feedback_required: true,
  questionsText: ''
};

const bannerTemplates = ['corporate', 'technology', 'training', 'workshop', 'oration session', 'motivation', 'celebration'];
const eventCategories = ['Oration', 'Training', 'Workshop', 'Quiz', 'Debate', 'Demo', 'Celebration'];

function parseQuestions(text) {
  return text
    .split('\n')
    .map((line, index) => {
      const [question, answer, points] = line.split('|').map((part) => part?.trim());
      return question
        ? {
            question,
            answer: answer || '',
            points: Number(points) || 10,
            sort_order: index
          }
        : null;
    })
    .filter(Boolean);
}

function questionsToText(questions = []) {
  return questions.map((item) => `${item.question}${item.answer ? ` | ${item.answer}` : ''}${item.points ? ` | ${item.points}` : ''}`).join('\n');
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString() : 'Date pending';
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [pendingFeedback, setPendingFeedback] = useState([]);
  const [feedbackAnswers, setFeedbackAnswers] = useState({});
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const manager = canManage(user.role);
  const activeFeedback = pendingFeedback[0];

  async function loadDashboard() {
    const requests = [api('/reports/dashboard'), api('/events')];
    if (manager) requests.push(api('/employees?status=active'));
    requests.push(api('/feedback/pending').catch(() => []));
    const [dashboardData, eventRows, employeeRows = []] = await Promise.all(requests);
    setData(dashboardData);
    setEvents(eventRows);
    if (manager) {
      setEmployees(employeeRows);
      setPendingFeedback([]);
    } else {
      setPendingFeedback(employeeRows);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!activeFeedback) return;
    const initialAnswers = {};
    for (const question of activeFeedback.questions || []) {
      if (question.question_type === 'multiple_choice' || question.question_type === 'emoji_rating') {
        initialAnswers[question.id] = question.options?.[0] || '';
      } else {
        initialAnswers[question.id] = '';
      }
    }
    setFeedbackAnswers(initialAnswers);
    setFeedbackAnonymous(Boolean(activeFeedback.anonymous_mode));
    setFeedbackMessage('');
  }, [activeFeedback?.id]);

  if (!data) return <div className="loading">Loading dashboard...</div>;

  const nextTuesday = data.upcoming?.find((item) => item.day === 'Tuesday');
  const nextThursday = data.upcoming?.find((item) => item.day === 'Thursday');
  const upcomingCards = [nextTuesday, nextThursday].filter(Boolean);
  const fallbackUpcoming = upcomingCards.length ? upcomingCards : data.upcoming?.slice(0, 2) || [];
  const heroEvent = events.find((item) => ['live', 'upcoming'].includes(item.status) && item.approval_status === 'approved') || events[0];
  const totalQuestPoints = heroEvent?.questions?.reduce((sum, item) => sum + Number(item.points || 0), 0) || 0;
  const myRequests = events.filter((item) => item.created_by === user.id && item.approval_status !== 'approved');

  function openCreateEvent() {
    setEditingEventId(null);
    setEventForm(emptyEvent);
    setIsEventModalOpen(true);
  }

  function openEditEvent(event) {
    setEditingEventId(event.id);
    setEventForm({
      title: event.title || '',
      description: event.description || '',
      event_date: event.event_date ? event.event_date.slice(0, 10) : '',
      event_time: event.event_time ? event.event_time.slice(0, 5) : '',
      event_type: event.event_type || 'Oration Task',
      event_category: event.event_category || 'Oration',
      event_mode: event.event_mode || 'standard',
      presenter: event.presenter || '',
      department: event.department || '',
      expected_audience: event.expected_audience || '',
      banner_image_url: event.banner_image_url || '',
      template: event.template || 'corporate',
      assigned_employee_id: event.assigned_employee_id || '',
      status: event.status || 'upcoming',
      hero_tone: event.hero_tone || 'neon',
      quiz_required: Boolean(event.quiz_required),
      feedback_required: Boolean(event.feedback_required),
      questionsText: questionsToText(event.questions)
    });
    setIsEventModalOpen(true);
  }

  async function saveEvent(event) {
    event.preventDefault();
    const payload = {
      ...eventForm,
      expected_audience: eventForm.expected_audience ? Number(eventForm.expected_audience) : null,
      assigned_employee_id: eventForm.assigned_employee_id || null,
      questions: parseQuestions(eventForm.questionsText)
    };
    delete payload.questionsText;
    const path = editingEventId ? `/events/${editingEventId}` : '/events';
    const method = editingEventId ? 'PATCH' : 'POST';
    await api(path, { method, body: payload });
    setIsEventModalOpen(false);
    await loadDashboard();
  }

  async function deleteEvent(event) {
    if (!confirm(`Delete ${event.title}?`)) return;
    await api(`/events/${event.id}`, { method: 'DELETE' });
    await loadDashboard();
  }

  function updateFeedbackAnswer(questionId, value) {
    setFeedbackAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const missingQuestion = (activeFeedback.questions || []).find((question) => {
      if (!question.required) return false;
      const value = feedbackAnswers[question.id];
      return value === undefined || value === null || value === '';
    });
    if (missingQuestion) {
      setFeedbackMessage(`Please answer: ${missingQuestion.prompt}`);
      return;
    }
    await api(`/feedback/forms/${activeFeedback.id}/responses`, {
      method: 'POST',
      body: {
        anonymous: feedbackAnonymous,
        answers: (activeFeedback.questions || []).map((question) => ({
          question_id: question.id,
          answer: feedbackAnswers[question.id]
        }))
      }
    });
    setPendingFeedback((current) => current.slice(1));
  }

  function renderFeedbackInput(question) {
    const value = feedbackAnswers[question.id] ?? '';
    if (question.question_type === 'star_rating') {
      return (
        <div className="star-picker">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              type="button"
              key={score}
              className={Number(value) >= score ? 'active' : ''}
              onClick={() => updateFeedbackAnswer(question.id, score)}
              title={`${score} star${score === 1 ? '' : 's'}`}
            >
              <Star size={18} fill="currentColor" />
            </button>
          ))}
        </div>
      );
    }
    if (question.question_type === 'emoji_rating' || question.question_type === 'multiple_choice') {
      return (
        <select value={value} onChange={(event) => updateFeedbackAnswer(question.id, event.target.value)}>
          <option value="">Select an option</option>
          {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if (question.question_type === 'nps') {
      return (
        <div className="nps-picker">
          {Array.from({ length: 11 }, (_, score) => (
            <button
              type="button"
              key={score}
              className={Number(value) === score ? 'active' : ''}
              onClick={() => updateFeedbackAnswer(question.id, score)}
            >
              {score}
            </button>
          ))}
        </div>
      );
    }
    return <textarea value={value} onChange={(event) => updateFeedbackAnswer(question.id, event.target.value)} placeholder="Write your feedback" />;
  }

  const heroStyle = heroEvent?.banner_image_url
    ? { backgroundImage: `linear-gradient(135deg, rgba(6, 8, 20, 0.9), rgba(10, 13, 28, 0.74)), url("${heroEvent.banner_image_url}")` }
    : undefined;

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="cycle command center"
        actions={
          <button className="primary-btn" onClick={openCreateEvent}>
            {manager ? <Plus size={16} /> : <Send size={16} />}
            {manager ? 'Create Event' : 'Request Event'}
          </button>
        }
      />

      <section className={`event-hero ${heroEvent?.hero_tone || 'neon'} ${heroEvent?.banner_image_url ? 'image-hero' : ''}`} style={heroStyle}>
        <div className="event-hero-copy">
          <span className="kicker">dashboard banner</span>
          <h2>{heroEvent?.title || 'Create the next oration event'}</h2>
          <p>{heroEvent?.description || 'Publish an event banner, collect quiz responses, and trigger feedback from one place.'}</p>
          <div className="quest-chips">
            <span><CalendarClock size={15} /> {dateLabel(heroEvent?.event_date)} {heroEvent?.event_time ? `at ${heroEvent.event_time.slice(0, 5)}` : ''}</span>
            <span><Target size={15} /> {heroEvent?.employee_name || heroEvent?.presenter || 'Presenter TBD'}</span>
            <span><Image size={15} /> {heroEvent?.template || 'corporate'} template</span>
            <span><HelpCircle size={15} /> {heroEvent?.questions?.length || 0} questions</span>
            <span><Zap size={15} /> {totalQuestPoints} XP</span>
          </div>
        </div>
        <div className="event-hero-card">
          <Sparkles size={30} />
          <strong>{heroEvent?.event_type || 'Oration Task'}</strong>
          <span>{heroEvent?.approval_status || 'draft'} / {heroEvent?.status || 'draft'}</span>
          {heroEvent?.feedback_required ? <span className="mini-pill yes">Feedback on</span> : null}
          {heroEvent?.can_edit ? (
            <button className="secondary-btn" onClick={() => openEditEvent(heroEvent)}>
              <Pencil size={15} />
              Edit
            </button>
          ) : null}
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Total Employees" value={data.totalEmployees} />
        <StatCard label="Spoken" value={data.spokenEmployees} tone="pink" />
        <StatCard label="Remaining" value={data.remainingEmployees} tone="green" />
        <StatCard label="Cycle" value={`#${data.currentCycleNumber}`} tone="gold" />
        <StatCard label="Completion" value={`${data.completionPercentage}%`} helper="Current speaker cycle" />
        <StatCard label="This Month" value={data.monthlyOrationCount} helper="Oration selections" tone="pink" />
      </section>

      {myRequests.length ? (
        <section className="panel request-strip">
          <div className="panel-title">
            <CheckCircle2 size={20} />
            My Event Requests
          </div>
          <div className="quest-list">
            {myRequests.map((item) => (
              <div className="quest-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.approval_note || 'Waiting for admin review'}</span>
                </div>
                <span className={`status-pill ${item.approval_status}`}>{item.approval_status.replace('_', ' ')}</span>
                {item.can_edit ? <button onClick={() => openEditEvent(item)}>Edit</button> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-title">
            <CalendarClock size={20} />
            Upcoming Speakers
          </div>
          <div className="upcoming-list">
            {fallbackUpcoming.map((item) => (
              <div className="upcoming-item" key={item.id}>
                <span>{item.day}</span>
                <strong>{item.employee_name || 'Not selected'}</strong>
                <small>{dateLabel(item.event_date)}</small>
              </div>
            ))}
            {!fallbackUpcoming.length ? <div className="empty-state">No upcoming speakers scheduled.</div> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <Trophy size={20} />
            Leaderboard
          </div>
          <div className="leaderboard">
            {data.leaderboard.map((row, index) => (
              <div key={row.winner_name}>
                <span>#{index + 1}</span>
                <strong>{row.winner_name}</strong>
                <small>{row.wins} win{row.wins === 1 ? '' : 's'}</small>
              </div>
            ))}
            {!data.leaderboard.length ? <div className="empty-state">Leaderboard appears after the first spin.</div> : null}
          </div>
        </article>

        <article className="panel glow-panel">
          <span className="kicker">last speaker</span>
          <h2>{data.lastSelectedSpeaker?.winner_name || 'Awaiting first spin'}</h2>
          <p>{data.lastSelectedSpeaker?.winner_email || 'The next spin will light this up.'}</p>
        </article>

        <article className="panel quest-panel">
          <div className="panel-title">
            <Sparkles size={20} />
            Event Quest Board
          </div>
          <div className="quest-list">
            {events.slice(0, 5).map((item) => (
              <div className="quest-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.presenter || item.employee_name || 'Unassigned'} - {dateLabel(item.event_date)}</span>
                </div>
                <span className={`status-pill ${item.approval_status}`}>{item.approval_status?.replace('_', ' ') || item.status}</span>
                <div className="row-actions">
                  {item.can_edit ? <button title="Edit" onClick={() => openEditEvent(item)}><Pencil size={15} /></button> : null}
                  {item.can_delete ? <button title="Delete" onClick={() => deleteEvent(item)}><Trash2 size={15} /></button> : null}
                </div>
              </div>
            ))}
            {!events.length ? <div className="empty-state">No event banners yet.</div> : null}
          </div>
        </article>
      </section>

      {isEventModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-panel event-modal" onSubmit={saveEvent}>
            <div className="modal-header">
              <div className="panel-title">
                <Sparkles size={20} />
                {editingEventId ? 'Edit Event' : manager ? 'Create Event' : 'Create Event Request'}
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setIsEventModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <input placeholder="Event Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
            <textarea placeholder="Description" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
            <div className="form-grid-2">
              <label>
                Date
                <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} />
              </label>
              <label>
                Time
                <input type="time" value={eventForm.event_time} onChange={(e) => setEventForm({ ...eventForm, event_time: e.target.value })} />
              </label>
              <label>
                Event Type
                <input value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })} />
              </label>
              <label>
                Category
                <select value={eventForm.event_category} onChange={(e) => setEventForm({ ...eventForm, event_category: e.target.value })}>
                  {eventCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                Event Mode
                <select value={eventForm.event_mode} onChange={(e) => setEventForm({ ...eventForm, event_mode: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="debate">Debate</option>
                  <option value="team_battle">Team Battle</option>
                </select>
              </label>
              <label>
                Presenter
                <input value={eventForm.presenter} onChange={(e) => setEventForm({ ...eventForm, presenter: e.target.value })} />
              </label>
              <label>
                Department
                <input value={eventForm.department} onChange={(e) => setEventForm({ ...eventForm, department: e.target.value })} />
              </label>
              <label>
                Expected Audience
                <input type="number" min="0" value={eventForm.expected_audience} onChange={(e) => setEventForm({ ...eventForm, expected_audience: e.target.value })} />
              </label>
              <label>
                Banner Image URL
                <input value={eventForm.banner_image_url} onChange={(e) => setEventForm({ ...eventForm, banner_image_url: e.target.value })} />
              </label>
              <label>
                Banner Template
                <select value={eventForm.template} onChange={(e) => setEventForm({ ...eventForm, template: e.target.value })}>
                  {bannerTemplates.map((template) => <option key={template} value={template}>{template}</option>)}
                </select>
              </label>
              {manager ? (
                <>
                  <label>
                    Particular Employee
                    <select value={eventForm.assigned_employee_id} onChange={(e) => setEventForm({ ...eventForm, assigned_employee_id: e.target.value })}>
                      <option value="">Unassigned</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.employee_name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={eventForm.status} onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}>
                      <option value="draft">Draft</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                </>
              ) : null}
              <label>
                Banner Style
                <select value={eventForm.hero_tone} onChange={(e) => setEventForm({ ...eventForm, hero_tone: e.target.value })}>
                  <option value="neon">Neon</option>
                  <option value="gold">Gold Trophy</option>
                  <option value="cyber">Cyber</option>
                  <option value="aurora">Aurora</option>
                </select>
              </label>
            </div>
            <div className="toggle-grid">
              <label className="check-row">
                <input type="checkbox" checked={eventForm.quiz_required} onChange={(e) => setEventForm({ ...eventForm, quiz_required: e.target.checked })} />
                Quiz Required
              </label>
              <label className="check-row">
                <input type="checkbox" checked={eventForm.feedback_required} onChange={(e) => setEventForm({ ...eventForm, feedback_required: e.target.checked })} />
                Feedback Required
              </label>
            </div>
            <label>
              Quiz Questions
              <textarea
                className="questions-input"
                placeholder={'One per line: Question | Answer | Points\nExample: What is vocal variety? | Pitch, pace, pause | 20'}
                value={eventForm.questionsText}
                onChange={(e) => setEventForm({ ...eventForm, questionsText: e.target.value })}
              />
            </label>
            <button className="primary-btn">{editingEventId ? 'Save Event' : manager ? 'Publish Event' : 'Submit Request'}</button>
          </form>
        </div>
      ) : null}

      {activeFeedback ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-panel feedback-popup" onSubmit={submitFeedback}>
            <div className="modal-header">
              <div className="panel-title">
                <MessageSquare size={20} />
                {activeFeedback.title || 'Event Feedback'}
              </div>
              <button type="button" className="icon-btn" title="Later" onClick={() => setPendingFeedback((current) => current.slice(1))}>
                <X size={18} />
              </button>
            </div>
            <div className="feedback-event-label">
              <span className="kicker">{activeFeedback.event_title}</span>
              <p>{activeFeedback.description || 'Share a quick rating and suggestion for this completed event.'}</p>
            </div>
            <div className="feedback-popup-questions">
              {(activeFeedback.questions || []).map((question) => (
                <label key={question.id} className="feedback-question">
                  <span>{question.prompt}{question.required ? ' *' : ''}</span>
                  {renderFeedbackInput(question)}
                </label>
              ))}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={feedbackAnonymous}
                onChange={(event) => setFeedbackAnonymous(event.target.checked)}
                disabled={activeFeedback.anonymous_mode}
              />
              Submit anonymously
            </label>
            {feedbackMessage ? <div className="toast-inline">{feedbackMessage}</div> : null}
            <button className="primary-btn">
              <Send size={16} />
              Submit Feedback
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
