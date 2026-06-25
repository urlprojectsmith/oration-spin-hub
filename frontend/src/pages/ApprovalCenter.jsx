import { CheckCircle2, Clock3, HelpCircle, PauseCircle, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'need_clarification', label: 'Need Clarification' },
  { value: 'on_hold', label: 'On Hold' }
];

const actionConfig = {
  approve: { label: 'Approve', icon: CheckCircle2 },
  reject: { label: 'Reject', icon: XCircle },
  hold: { label: 'Hold', icon: PauseCircle },
  clarification: { label: 'Request Clarification', icon: HelpCircle }
};

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'No date';
}

export default function ApprovalCenter() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const suffix = filter ? `?approval_status=${filter}` : '';
    try {
      setError('');
      setEvents(await api(`/events/approvals${suffix}`));
    } catch (err) {
      setEvents([]);
      setError(err.message || 'Approval queue is unavailable');
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function decide(event, action) {
    setBusyId(event.id);
    try {
      await api(`/events/${event.id}/approval`, { method: 'POST', body: { action, note } });
      setNote('');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Approval Center"
        kicker="event request workflow"
        actions={
          <button className="secondary-btn" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <section className="approval-layout">
        <aside className="panel approval-sidebar">
          <div className="panel-title">
            <Clock3 size={20} />
            Queue
          </div>
          <div className="filter-tabs">
            {statusFilters.map((item) => (
              <button key={item.value} className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <label>
            Decision Note
            <textarea
              placeholder="Add a reason, clarification request, or approval note."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </aside>

        <section className="approval-list">
          {error ? <div className="alert">Approval Center is waiting for the upgraded backend route: {error}</div> : null}
          {events.map((event) => (
            <article className="panel approval-card" key={event.id}>
              <div className="approval-card-head">
                <div>
                  <span className="kicker">{event.event_type}</span>
                  <h2>{event.title}</h2>
                  <p>{event.description || 'No description provided.'}</p>
                </div>
                <span className={`status-pill ${event.approval_status}`}>{event.approval_status.replace('_', ' ')}</span>
              </div>

              <div className="approval-meta">
                <span>{formatDate(event.event_date)} {event.event_time ? `at ${event.event_time.slice(0, 5)}` : ''}</span>
                <span>{event.presenter || event.employee_name || 'Presenter TBD'}</span>
                <span>{event.department || 'Department TBD'}</span>
                <span>{event.expected_audience || 0} expected</span>
                <span>{event.quiz_required ? 'Quiz required' : 'No quiz'}</span>
                <span>{event.feedback_required ? 'Feedback required' : 'No feedback'}</span>
              </div>

              <div className="approval-history">
                {(event.approval_history || []).slice(-3).map((item, index) => (
                  <div key={`${item.at}-${index}`}>
                    <strong>{item.action.replace('_', ' ')}</strong>
                    <span>{item.by?.name || 'System'} - {new Date(item.at).toLocaleString()}</span>
                    {item.note ? <small>{item.note}</small> : null}
                  </div>
                ))}
              </div>

              <div className="approval-actions">
                {Object.entries(actionConfig).map(([action, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={action}
                      className={action === 'approve' ? 'primary-btn' : 'secondary-btn'}
                      disabled={busyId === event.id}
                      onClick={() => decide(event, action)}
                    >
                      <Icon size={16} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
          {!events.length ? <div className="panel empty-state">No event requests in this queue.</div> : null}
        </section>
      </section>
    </>
  );
}
