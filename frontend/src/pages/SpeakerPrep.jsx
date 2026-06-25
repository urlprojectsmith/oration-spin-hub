import { Bell, CheckCircle2, Clock3, FileText, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const checklist = [
  ['topic_selected', 'Topic selected'],
  ['slides_uploaded', 'Slides uploaded'],
  ['demo_ready', 'Demo ready'],
  ['notes_prepared', 'Notes prepared'],
  ['rehearsal_completed', 'Rehearsal completed']
];

function dateLabel(item) {
  const date = item.event_date ? new Date(item.event_date).toLocaleDateString() : 'No date';
  return `${date}${item.event_time ? ` at ${item.event_time.slice(0, 5)}` : ''}`;
}

export default function SpeakerPrep() {
  const [items, setItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState('');

  async function load() {
    const [prepRows, notificationRows] = await Promise.all([
      api('/preparation/schedules'),
      api('/preparation/notifications')
    ]);
    setItems(prepRows);
    setNotifications(notificationRows);
    if (!selected && prepRows[0]) {
      setSelected(prepRows[0]);
      setDraft(prepRows[0]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function selectItem(item) {
    setSelected(item);
    setDraft(item);
    setMessage('');
  }

  async function save(event) {
    event.preventDefault();
    const updated = await api(`/preparation/schedules/${selected.schedule_id}`, { method: 'PATCH', body: draft });
    setMessage(`Checklist saved at ${updated.completion_percentage}% complete.`);
    await load();
  }

  async function runReminders() {
    const result = await api('/preparation/reminders/run', { method: 'POST' });
    setMessage(`${result.created_count} reminder records created.`);
    await load();
  }

  return (
    <>
      <PageHeader
        title="Speaker Prep"
        kicker="readiness and reminders"
        actions={
          <button className="secondary-btn" onClick={runReminders}>
            <RefreshCw size={16} />
            Run Reminder Check
          </button>
        }
      />

      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="prep-layout">
        <aside className="panel prep-list">
          <div className="panel-title">
            <CheckCircle2 size={20} />
            Upcoming Speakers
          </div>
          {items.map((item) => (
            <button
              key={item.schedule_id}
              className={`prep-card ${selected?.schedule_id === item.schedule_id ? 'active' : ''}`}
              onClick={() => selectItem(item)}
            >
              <span>{dateLabel(item)}</span>
              <strong>{item.employee_name || 'Speaker TBD'}</strong>
              <small>{item.event_type} - {item.completion_percentage}% ready</small>
              <div className="progress-track"><span style={{ width: `${item.completion_percentage}%` }} /></div>
            </button>
          ))}
          {!items.length ? <div className="empty-state">No upcoming speaker preparations found.</div> : null}
        </aside>

        <section className="panel prep-editor">
          {selected ? (
            <form onSubmit={save}>
              <div className="panel-title">
                <FileText size={20} />
                Preparation Checklist
              </div>
              <div className="readiness-meter">
                <strong>{draft.completion_percentage ?? selected.completion_percentage}%</strong>
                <span>complete</span>
              </div>
              <div className="checklist-grid">
                {checklist.map(([key, label]) => (
                  <label className="check-row prep-check" key={key}>
                    <input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="form-grid-2">
                <label>
                  Topic
                  <input value={draft.topic || ''} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} />
                </label>
                <label>
                  Slides URL
                  <input value={draft.slides_url || ''} onChange={(event) => setDraft({ ...draft, slides_url: event.target.value })} />
                </label>
              </div>
              <label>
                Notes
                <textarea value={draft.notes || ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </label>
              <button className="primary-btn">
                <Save size={16} />
                Save Checklist
              </button>
            </form>
          ) : (
            <div className="empty-state">Select a speaker schedule to manage preparation.</div>
          )}
        </section>

        <aside className="panel reminder-panel">
          <div className="panel-title">
            <Bell size={20} />
            Reminder Windows
          </div>
          {selected?.reminders?.map((item) => (
            <div className="reminder-row" key={item.key}>
              <Clock3 size={16} />
              <div>
                <strong>{item.label}</strong>
                <span>{new Date(item.due_at).toLocaleString()}</span>
              </div>
              <span className={`mini-pill ${item.sent_in_app ? 'ready' : item.due ? 'yes' : 'inactive'}`}>
                {item.sent_in_app ? 'sent' : item.due ? 'due' : 'waiting'}
              </span>
            </div>
          ))}
          <div className="panel-title notification-title">
            <Bell size={20} />
            In-app Notifications
          </div>
          <div className="notification-list">
            {notifications.slice(0, 8).map((item) => (
              <div key={item.id} className={item.read_at ? '' : 'unread'}>
                <strong>{item.title}</strong>
                <span>{item.message}</span>
              </div>
            ))}
            {!notifications.length ? <div className="empty-state">No notifications yet.</div> : null}
          </div>
        </aside>
      </section>
    </>
  );
}
