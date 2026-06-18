import { CalendarClock, HelpCircle, Pencil, Plus, Sparkles, Target, Trophy, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { canManage } from '../lib/api.js';
import { api } from '../lib/api.js';

const emptyEvent = {
  title: '',
  description: '',
  event_date: '',
  event_type: 'Oration Task',
  assigned_employee_id: '',
  status: 'upcoming',
  hero_tone: 'neon',
  questionsText: ''
};

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

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const manager = canManage(user.role);

  async function loadDashboard() {
    const requests = [api('/reports/dashboard'), api('/events')];
    if (manager) requests.push(api('/employees?status=active'));
    const [dashboardData, eventRows, employeeRows = []] = await Promise.all(requests);
    setData(dashboardData);
    setEvents(eventRows);
    setEmployees(employeeRows);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (!data) return <div className="loading">Loading dashboard...</div>;

  const nextTuesday = data.upcoming?.find((item) => item.day === 'Tuesday');
  const nextThursday = data.upcoming?.find((item) => item.day === 'Thursday');
  const upcomingCards = [nextTuesday, nextThursday].filter(Boolean);
  const fallbackUpcoming = upcomingCards.length ? upcomingCards : data.upcoming?.slice(0, 2) || [];
  const heroEvent = events.find((item) => ['live', 'upcoming'].includes(item.status)) || events[0];
  const totalQuestPoints = heroEvent?.questions?.reduce((sum, item) => sum + Number(item.points || 0), 0) || 0;

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
      event_type: event.event_type || 'Oration Task',
      assigned_employee_id: event.assigned_employee_id || '',
      status: event.status || 'upcoming',
      hero_tone: event.hero_tone || 'neon',
      questionsText: questionsToText(event.questions)
    });
    setIsEventModalOpen(true);
  }

  async function saveEvent(event) {
    event.preventDefault();
    const payload = {
      ...eventForm,
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="cycle command center"
        actions={
          manager ? (
            <button className="primary-btn" onClick={openCreateEvent}>
              <Plus size={16} />
              Create Event
            </button>
          ) : null
        }
      />

      <section className={`event-hero ${heroEvent?.hero_tone || 'neon'}`}>
        <div className="event-hero-copy">
          <span className="kicker">upcoming quest banner</span>
          <h2>{heroEvent?.title || 'Create the next oration event'}</h2>
          <p>{heroEvent?.description || 'Admins can publish a banner, assign it to an employee, and add quiz questions for the session.'}</p>
          <div className="quest-chips">
            <span><CalendarClock size={15} /> {heroEvent?.event_date ? new Date(heroEvent.event_date).toLocaleDateString() : 'Date pending'}</span>
            <span><Target size={15} /> {heroEvent?.employee_name || 'Employee TBD'}</span>
            <span><HelpCircle size={15} /> {heroEvent?.questions?.length || 0} questions</span>
            <span><Zap size={15} /> {totalQuestPoints} XP</span>
          </div>
        </div>
        <div className="event-hero-card">
          <Sparkles size={30} />
          <strong>{heroEvent?.event_type || 'Oration Task'}</strong>
          <span>{heroEvent?.status || 'draft'}</span>
          {manager && heroEvent ? (
            <button className="secondary-btn" onClick={() => openEditEvent(heroEvent)}>
              <Pencil size={15} />
              Edit Banner
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
                <small>{new Date(item.event_date).toLocaleDateString()}</small>
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
            {events.slice(0, 4).map((item) => (
              <div className="quest-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.employee_name || 'Unassigned'} - {item.event_date ? new Date(item.event_date).toLocaleDateString() : 'No date'}</span>
                </div>
                <span className="status-pill">{item.status}</span>
                {manager ? <button onClick={() => openEditEvent(item)}>Edit</button> : null}
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
                {editingEventId ? 'Edit Event Banner' : 'Create Event Banner'}
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setIsEventModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <input placeholder="Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
            <textarea placeholder="Description" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
            <div className="form-grid-2">
              <label>
                Date
                <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} />
              </label>
              <label>
                Event Type
                <input value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })} />
              </label>
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
            <label>
              Quiz Questions
              <textarea
                className="questions-input"
                placeholder={'One per line: Question | Answer | Points\nExample: What is vocal variety? | Pitch, pace, pause | 20'}
                value={eventForm.questionsText}
                onChange={(e) => setEventForm({ ...eventForm, questionsText: e.target.value })}
              />
            </label>
            <button className="primary-btn">{editingEventId ? 'Save Banner' : 'Launch Banner'}</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
