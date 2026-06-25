import { BarChart3, FileText, History, Library, RefreshCw, Save, Send, Swords, Trophy, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, canManage } from '../lib/api.js';

const defaultMeta = {
  event_categories: ['Oration', 'Training', 'Workshop', 'Quiz', 'Debate', 'Demo', 'Celebration'],
  event_modes: ['standard', 'debate', 'team_battle'],
  resource_types: ['PDF', 'PPT', 'Video', 'Link', 'Document']
};

function lines(value) {
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}

function toLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

export default function AdvancedEvents() {
  const { user } = useAuth();
  const manager = canManage(user.role);
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState(defaultMeta);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [battleBoard, setBattleBoard] = useState([]);
  const [message, setMessage] = useState('');
  const [eventPatch, setEventPatch] = useState({ event_category: 'Oration', event_mode: 'standard', status: 'draft' });
  const [debateForm, setDebateForm] = useState({ team_a_name: 'Team A', team_b_name: 'Team B', team_a_members: '', team_b_members: '', moderator_employee_id: '', winner_team: 'pending', notes: '' });
  const [battleForm, setBattleForm] = useState({ team_a_department: '', team_b_department: '', team_a_score: 0, team_b_score: 0, notes: '' });
  const [pollForm, setPollForm] = useState({ question: '', options: 'Yes\nNo\nMaybe', status: 'draft' });
  const [resourceForm, setResourceForm] = useState({ title: '', resource_type: 'PDF', resource_url: '', file: null });

  async function load() {
    const requests = [
      api('/events'),
      api('/advanced-events/meta').catch(() => defaultMeta),
      api('/advanced-events/team-battles/leaderboard').catch(() => [])
    ];
    if (manager) requests.push(api('/employees?status=active'));
    const [eventRows, metaData, battleRows, employeeRows = employees] = await Promise.all(requests);
    setEvents(eventRows);
    setMeta(metaData);
    setBattleBoard(battleRows);
    setEmployees(employeeRows);
    if (!selectedId && eventRows[0]) setSelectedId(eventRows[0].id);
  }

  async function loadDetail(id = selectedId) {
    if (!id) return;
    const advanced = await api(`/advanced-events/events/${id}`);
    setDetail(advanced);
    setEventPatch({
      event_category: advanced.event.event_category || 'Oration',
      event_mode: advanced.event.event_mode || 'standard',
      status: advanced.event.status || 'draft'
    });
    setDebateForm({
      team_a_name: advanced.debate?.team_a_name || 'Team A',
      team_b_name: advanced.debate?.team_b_name || 'Team B',
      team_a_members: toLines(advanced.debate?.team_a_members),
      team_b_members: toLines(advanced.debate?.team_b_members),
      moderator_employee_id: advanced.debate?.moderator_employee_id || '',
      winner_team: advanced.debate?.winner_team || 'pending',
      notes: advanced.debate?.notes || ''
    });
    setBattleForm({
      team_a_department: advanced.team_battle?.team_a_department || advanced.event.department || '',
      team_b_department: advanced.team_battle?.team_b_department || '',
      team_a_score: advanced.team_battle?.team_a_score || 0,
      team_b_score: advanced.team_battle?.team_b_score || 0,
      notes: advanced.team_battle?.notes || ''
    });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedId), [events, selectedId]);

  async function saveEventMode(event) {
    event.preventDefault();
    await api(`/events/${selectedId}`, { method: 'PATCH', body: { ...eventPatch, change_summary: 'Advanced event settings update' } });
    setMessage('Event category and mode saved.');
    await load();
    await loadDetail();
  }

  async function publishDraft() {
    await api(`/events/${selectedId}/publish`, { method: 'POST' });
    setMessage('Draft event published.');
    await load();
    await loadDetail();
  }

  async function saveDebate(event) {
    event.preventDefault();
    await api(`/advanced-events/events/${selectedId}/debate`, {
      method: 'PUT',
      body: { ...debateForm, team_a_members: lines(debateForm.team_a_members), team_b_members: lines(debateForm.team_b_members) }
    });
    setMessage('Debate mode saved.');
    await load();
    await loadDetail();
  }

  async function saveBattle(event) {
    event.preventDefault();
    await api(`/advanced-events/events/${selectedId}/team-battle`, { method: 'PUT', body: battleForm });
    setMessage('Team battle saved.');
    await load();
    await loadDetail();
  }

  async function createPoll(event) {
    event.preventDefault();
    await api(`/advanced-events/events/${selectedId}/polls`, { method: 'POST', body: { ...pollForm, options: lines(pollForm.options) } });
    setPollForm({ question: '', options: 'Yes\nNo\nMaybe', status: 'draft' });
    setMessage('Poll created.');
    await loadDetail();
  }

  async function updatePoll(poll, patch) {
    await api(`/advanced-events/polls/${poll.id}`, { method: 'PATCH', body: patch });
    await loadDetail();
  }

  async function votePoll(poll, option) {
    await api(`/advanced-events/polls/${poll.id}/vote`, { method: 'POST', body: { option_text: option } });
    await loadDetail();
  }

  async function addResource(event) {
    event.preventDefault();
    const body = new FormData();
    body.append('title', resourceForm.title);
    body.append('resource_type', resourceForm.resource_type);
    if (resourceForm.resource_url) body.append('resource_url', resourceForm.resource_url);
    if (resourceForm.file) body.append('file', resourceForm.file);
    await api(`/advanced-events/events/${selectedId}/resources`, { method: 'POST', body });
    setResourceForm({ title: '', resource_type: 'PDF', resource_url: '', file: null });
    setMessage('Resource added.');
    await loadDetail();
  }

  async function restoreVersion(version) {
    if (!confirm(`Restore version ${version.version_number}?`)) return;
    await api(`/events/${selectedId}/versions/${version.id}/restore`, { method: 'POST' });
    setMessage(`Version ${version.version_number} restored.`);
    await load();
    await loadDetail();
  }

  return (
    <>
      <PageHeader
        title="Advanced Events"
        kicker="categories, debates, battles, live polls, resources"
        actions={
          <button className="secondary-btn" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />
      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="advanced-event-layout">
        <aside className="panel advanced-event-sidebar">
          <div className="panel-title">
            <Library size={20} />
            Events
          </div>
          <div className="advanced-event-list">
            {events.map((event) => (
              <button key={event.id} className={selectedId === event.id ? 'active' : ''} onClick={() => setSelectedId(event.id)}>
                <strong>{event.title}</strong>
                <span>{event.event_category || event.event_type} - {event.event_mode || 'standard'}</span>
                <small>{event.status}</small>
              </button>
            ))}
            {!events.length ? <div className="empty-state">No events yet.</div> : null}
          </div>

          {selectedEvent && manager ? (
            <form className="advanced-form" onSubmit={saveEventMode}>
              <div className="panel-title">
                <Save size={20} />
                Event Draft & Category
              </div>
              <select value={eventPatch.event_category} onChange={(event) => setEventPatch({ ...eventPatch, event_category: event.target.value })}>
                {meta.event_categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={eventPatch.event_mode} onChange={(event) => setEventPatch({ ...eventPatch, event_mode: event.target.value })}>
                <option value="standard">Standard</option>
                <option value="debate">Debate Mode</option>
                <option value="team_battle">Team Battle Mode</option>
              </select>
              <select value={eventPatch.status} onChange={(event) => setEventPatch({ ...eventPatch, status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="primary-btn"><Save size={16} />Save Event Settings</button>
              {detail?.event?.status === 'draft' ? <button type="button" className="secondary-btn" onClick={publishDraft}>Publish Draft</button> : null}
            </form>
          ) : null}
        </aside>

        <main className="advanced-event-main">
          {detail ? (
            <>
              {manager ? (
                <section className="panel advanced-split">
                  <form className="advanced-form" onSubmit={saveDebate}>
                    <div className="panel-title">
                      <Swords size={20} />
                      Debate Mode
                    </div>
                    <div className="form-grid-2">
                      <input placeholder="Team A" value={debateForm.team_a_name} onChange={(event) => setDebateForm({ ...debateForm, team_a_name: event.target.value })} />
                      <input placeholder="Team B" value={debateForm.team_b_name} onChange={(event) => setDebateForm({ ...debateForm, team_b_name: event.target.value })} />
                      <textarea placeholder="Team A members, one per line" value={debateForm.team_a_members} onChange={(event) => setDebateForm({ ...debateForm, team_a_members: event.target.value })} />
                      <textarea placeholder="Team B members, one per line" value={debateForm.team_b_members} onChange={(event) => setDebateForm({ ...debateForm, team_b_members: event.target.value })} />
                      <select value={debateForm.moderator_employee_id} onChange={(event) => setDebateForm({ ...debateForm, moderator_employee_id: event.target.value })}>
                        <option value="">Moderator</option>
                        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_name}</option>)}
                      </select>
                      <select value={debateForm.winner_team} onChange={(event) => setDebateForm({ ...debateForm, winner_team: event.target.value })}>
                        <option value="pending">Winner pending</option>
                        <option value="team_a">Team A</option>
                        <option value="team_b">Team B</option>
                        <option value="draw">Draw</option>
                      </select>
                    </div>
                    <input placeholder="Debate notes" value={debateForm.notes} onChange={(event) => setDebateForm({ ...debateForm, notes: event.target.value })} />
                    <button className="primary-btn"><Save size={16} />Save Debate</button>
                  </form>

                  <form className="advanced-form" onSubmit={saveBattle}>
                    <div className="panel-title">
                      <Trophy size={20} />
                      Team Battle
                    </div>
                    <div className="form-grid-2">
                      <input placeholder="Department A" value={battleForm.team_a_department} onChange={(event) => setBattleForm({ ...battleForm, team_a_department: event.target.value })} required />
                      <input placeholder="Department B" value={battleForm.team_b_department} onChange={(event) => setBattleForm({ ...battleForm, team_b_department: event.target.value })} required />
                      <input type="number" step="0.5" value={battleForm.team_a_score} onChange={(event) => setBattleForm({ ...battleForm, team_a_score: event.target.value })} />
                      <input type="number" step="0.5" value={battleForm.team_b_score} onChange={(event) => setBattleForm({ ...battleForm, team_b_score: event.target.value })} />
                    </div>
                    <input placeholder="Scoring notes" value={battleForm.notes} onChange={(event) => setBattleForm({ ...battleForm, notes: event.target.value })} />
                    <button className="primary-btn"><Save size={16} />Save Battle</button>
                  </form>
                </section>
              ) : null}

              <section className="panel">
                <div className="panel-title">
                  <Vote size={20} />
                  Live Polls
                </div>
                {manager ? (
                  <form className="advanced-form" onSubmit={createPoll}>
                    <input placeholder="Poll question" value={pollForm.question} onChange={(event) => setPollForm({ ...pollForm, question: event.target.value })} required />
                    <textarea placeholder="Options, one per line" value={pollForm.options} onChange={(event) => setPollForm({ ...pollForm, options: event.target.value })} />
                    <select value={pollForm.status} onChange={(event) => setPollForm({ ...pollForm, status: event.target.value })}>
                      <option value="draft">Draft</option>
                      <option value="live">Live</option>
                      <option value="closed">Closed</option>
                    </select>
                    <button className="secondary-btn"><Send size={16} />Create Poll</button>
                  </form>
                ) : null}
                <div className="poll-list">
                  {(detail.polls || []).map((poll) => (
                    <article key={poll.id}>
                      <div>
                        <strong>{poll.question}</strong>
                        <span>{poll.status} - {poll.total_votes} vote{poll.total_votes === 1 ? '' : 's'}</span>
                      </div>
                      <div className="poll-options">
                        {(poll.options || []).map((option) => (
                          <button key={option} className="secondary-btn" disabled={poll.status !== 'live'} onClick={() => votePoll(poll, option)}>{option}</button>
                        ))}
                      </div>
                      <div className="poll-results">
                        {(poll.results || []).map((item) => (
                          <span key={item.option}>{item.option}: {item.votes}</span>
                        ))}
                      </div>
                      {manager ? (
                        <div className="row-actions">
                          <button onClick={() => updatePoll(poll, { status: 'live' })}>Go Live</button>
                          <button onClick={() => updatePoll(poll, { status: 'closed' })}>Close</button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {!detail.polls?.length ? <div className="empty-state">No polls yet.</div> : null}
                </div>
              </section>

              <section className="panel">
                <div className="panel-title">
                  <FileText size={20} />
                  Resource Library
                </div>
                {manager ? (
                  <form className="advanced-form" onSubmit={addResource}>
                    <div className="form-grid-2">
                      <input placeholder="Resource title" value={resourceForm.title} onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })} />
                      <select value={resourceForm.resource_type} onChange={(event) => setResourceForm({ ...resourceForm, resource_type: event.target.value })}>
                        {meta.resource_types.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <input placeholder="Link URL" value={resourceForm.resource_url} onChange={(event) => setResourceForm({ ...resourceForm, resource_url: event.target.value })} />
                      <label className="file-btn secondary-btn">
                        {resourceForm.file ? resourceForm.file.name : 'Upload File'}
                        <input type="file" accept=".pdf,.ppt,.pptx,.mp4,.mov,.doc,.docx,.txt,.md" onChange={(event) => setResourceForm({ ...resourceForm, file: event.target.files?.[0] || null })} />
                      </label>
                    </div>
                    <button className="primary-btn"><Save size={16} />Add Resource</button>
                  </form>
                ) : null}
                <div className="resource-list">
                  {(detail.resources || []).map((resource) => (
                    <a key={resource.id} href={resource.resource_url} target="_blank" rel="noreferrer">
                      <strong>{resource.title}</strong>
                      <span>{resource.resource_type} - {resource.file_name || resource.resource_url}</span>
                    </a>
                  ))}
                  {!detail.resources?.length ? <div className="empty-state">No resources uploaded.</div> : null}
                </div>
              </section>
            </>
          ) : <div className="panel empty-state">Select an event to manage advanced features.</div>}
        </main>

        <aside className="panel advanced-event-side">
          <div className="panel-title">
            <BarChart3 size={20} />
            Battle Leaderboard
          </div>
          <div className="battle-board">
            {battleBoard.map((row, index) => (
              <div key={row.department}>
                <strong>#{index + 1} {row.department}</strong>
                <span>{row.total_score} pts - {row.wins} wins</span>
              </div>
            ))}
            {!battleBoard.length ? <div className="empty-state">No department battles yet.</div> : null}
          </div>

          <div className="panel-title">
            <History size={20} />
            Version History
          </div>
          <div className="version-list">
            {(detail?.versions || []).map((version) => (
              <article key={version.id}>
                <strong>Version {version.version_number}</strong>
                <span>{version.change_summary || 'Event snapshot'}</span>
                <small>{version.created_by_name || 'System'} - {new Date(version.created_at).toLocaleString()}</small>
                {manager ? <button className="secondary-btn" onClick={() => restoreVersion(version)}>Restore</button> : null}
              </article>
            ))}
            {!detail?.versions?.length ? <div className="empty-state">No saved versions yet. Edit an event to create the first snapshot.</div> : null}
          </div>
        </aside>
      </section>
    </>
  );
}
