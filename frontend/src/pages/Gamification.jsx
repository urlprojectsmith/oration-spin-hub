import { Award, Crown, Medal, RefreshCw, Save, Sparkles, Star, Tags, Trophy, UserCheck, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, canManage } from '../lib/api.js';

const actionLabels = {
  attend_event: 'Attend Event',
  complete_quiz: 'Complete Quiz',
  pass_quiz: 'Pass Quiz',
  speaker: 'Speaker',
  coordinator: 'Coordinator',
  feedback_submission: 'Feedback Submission'
};

export default function Gamification() {
  const { user } = useAuth();
  const manager = canManage(user.role);
  const [overview, setOverview] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [scope, setScope] = useState('all_time');
  const [message, setMessage] = useState('');
  const [awardForm, setAwardForm] = useState({ employee_id: '', action_type: 'attend_event', points: '', notes: '' });
  const [tagEmployeeId, setTagEmployeeId] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  async function load() {
    const [overviewData, employeeRows] = await Promise.all([
      api(`/gamification/overview?scope=${scope}`),
      api('/employees?status=active')
    ]);
    setOverview(overviewData);
    setEmployees(employeeRows);
    if (!awardForm.employee_id && employeeRows[0]) {
      setAwardForm((current) => ({ ...current, employee_id: employeeRows[0].id }));
      setTagEmployeeId(employeeRows[0].id);
    }
  }

  useEffect(() => {
    load();
  }, [scope]);

  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === tagEmployeeId), [employees, tagEmployeeId]);

  async function awardPoints(event) {
    event.preventDefault();
    await api('/gamification/award', {
      method: 'POST',
      body: {
        ...awardForm,
        points: awardForm.points === '' ? undefined : Number(awardForm.points)
      }
    });
    setMessage('Points awarded.');
    await load();
  }

  async function saveRule(rule) {
    await api(`/gamification/rules/${rule.action_type}`, {
      method: 'PATCH',
      body: { points: Number(rule.points), active: rule.active, label: rule.label }
    });
    setMessage('Point rule updated.');
    await load();
  }

  async function saveTags(event) {
    event.preventDefault();
    await api(`/gamification/employees/${tagEmployeeId}/skill-tags`, { method: 'PATCH', body: { tags: selectedTags } });
    setMessage('Skill tags saved.');
    await load();
  }

  async function loadEmployeeTags(employeeId) {
    setTagEmployeeId(employeeId);
    setSelectedTags([]);
    if (!employeeId) return;
    const detail = await api(`/gamification/employees/${employeeId}`);
    setSelectedTags(detail.skill_tags || []);
  }

  async function recalculateAchievements() {
    const result = await api('/gamification/achievements/recalculate', { method: 'POST', body: {} });
    setMessage(`Achievements recalculated. ${result.awarded} new award${result.awarded === 1 ? '' : 's'}.`);
    await load();
  }

  function toggleTag(tag) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  if (!overview) return <div className="loading">Loading gamification...</div>;

  return (
    <>
      <PageHeader
        title="Gamification Hub"
        kicker="points, achievements, rankings, skill tags"
        actions={
          <button className="secondary-btn" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />
      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="stats-grid">
        <div className="stat-card">
          <span>Active Players</span>
          <strong>{overview.totals.active_players || 0}</strong>
        </div>
        <div className="stat-card pink">
          <span>Total Points</span>
          <strong>{overview.totals.total_points || 0}</strong>
        </div>
        <div className="stat-card green">
          <span>Achievements</span>
          <strong>{overview.totals.achievements_awarded || 0}</strong>
        </div>
      </section>

      <section className="gamification-layout">
        <aside className="panel gamification-side">
          <div className="panel-title">
            <Zap size={20} />
            Points Engine
          </div>
          <div className="point-rule-list">
            {(overview.rules || []).map((rule) => (
              <article key={rule.action_type}>
                <div>
                  <strong>{rule.label}</strong>
                  <span>{rule.action_type.replaceAll('_', ' ')}</span>
                </div>
                {manager ? (
                  <>
                    <input type="number" value={rule.points} onChange={(event) => {
                      setOverview({
                        ...overview,
                        rules: overview.rules.map((item) => item.action_type === rule.action_type ? { ...item, points: event.target.value } : item)
                      });
                    }} />
                    <label className="check-row">
                      <input type="checkbox" checked={rule.active} onChange={(event) => {
                        setOverview({
                          ...overview,
                          rules: overview.rules.map((item) => item.action_type === rule.action_type ? { ...item, active: event.target.checked } : item)
                        });
                      }} />
                      Active
                    </label>
                    <button className="secondary-btn" onClick={() => saveRule(rule)}><Save size={15} />Save</button>
                  </>
                ) : (
                  <strong>{rule.points} pts</strong>
                )}
              </article>
            ))}
          </div>

          {manager ? (
            <form className="manual-award-form" onSubmit={awardPoints}>
              <div className="panel-title">
                <Star size={20} />
                Manual Award
              </div>
              <select value={awardForm.employee_id} onChange={(event) => setAwardForm({ ...awardForm, employee_id: event.target.value })} required>
                <option value="">Select employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_name}</option>)}
              </select>
              <select value={awardForm.action_type} onChange={(event) => setAwardForm({ ...awardForm, action_type: event.target.value })}>
                {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="number" placeholder="Override points, optional" value={awardForm.points} onChange={(event) => setAwardForm({ ...awardForm, points: event.target.value })} />
              <input placeholder="Notes" value={awardForm.notes} onChange={(event) => setAwardForm({ ...awardForm, notes: event.target.value })} />
              <button className="primary-btn"><Zap size={16} />Award Points</button>
            </form>
          ) : null}
        </aside>

        <main className="gamification-main">
          <section className="panel">
            <div className="panel-title">
              <Trophy size={20} />
              Leaderboard
            </div>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="all_time">All Time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            <div className="leaderboard gamification-leaderboard">
              {(overview.leaderboard || []).map((row, index) => (
                <div key={row.id}>
                  <span>#{index + 1}</span>
                  <strong>{row.employee_name}</strong>
                  <small>{row.total_points} pts - {row.level}{row.next_level ? ` - ${row.points_to_next} to ${row.next_level}` : ''}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Medal size={20} />
              Levels
            </div>
            <div className="level-grid">
              {(overview.levels || []).map((level) => (
                <article key={level.name}>
                  <strong>{level.name}</strong>
                  <span>{level.min_points}+ points</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Crown size={20} />
              Hall of Fame
            </div>
            <div className="hall-grid">
              {Object.entries(overview.hall_of_fame || {}).map(([period, rows]) => (
                <article key={period}>
                  <span className="kicker">{period}</span>
                  {(rows || []).slice(0, 3).map((row, index) => (
                    <div key={row.id}>
                      <strong>#{index + 1} {row.employee_name}</strong>
                      <span>{row.total_points} pts</span>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <UserCheck size={20} />
              Speaker Ranking
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Score</th>
                    <th>Attendance</th>
                    <th>Rating</th>
                    <th>Quiz</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.speaker_rankings || []).slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.employee_name}</strong></td>
                      <td>{row.speaker_score}</td>
                      <td>{row.attendance_count}</td>
                      <td>{row.average_rating}</td>
                      <td>{row.quiz_average}%</td>
                      <td>{(row.skill_tags || []).join(', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="panel gamification-side">
          <div className="panel-title">
            <Award size={20} />
            Achievements
          </div>
          {manager ? <button className="secondary-btn" onClick={recalculateAchievements}><Sparkles size={16} />Recalculate</button> : null}
          <div className="achievement-list">
            {(overview.recent_achievements || []).map((achievement) => (
              <article key={achievement.id}>
                <strong>{achievement.title}</strong>
                <span>{achievement.employee_name}</span>
                <small>{new Date(achievement.awarded_at).toLocaleDateString()}</small>
              </article>
            ))}
            {!overview.recent_achievements?.length ? <div className="empty-state">No achievements yet.</div> : null}
          </div>

          {manager ? (
            <form className="skill-tag-editor" onSubmit={saveTags}>
              <div className="panel-title">
                <Tags size={20} />
                Employee Skill Tags
              </div>
              <select value={tagEmployeeId} onChange={(event) => loadEmployeeTags(event.target.value)}>
                <option value="">Select employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_name}</option>)}
              </select>
              <div className="skill-tag-grid">
                {(overview.skill_tags || []).map((tag) => (
                  <label className="check-row" key={tag}>
                    <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} disabled={!selectedEmployee} />
                    {tag}
                  </label>
                ))}
              </div>
              <button className="primary-btn" disabled={!tagEmployeeId}><Save size={16} />Save Tags</button>
            </form>
          ) : null}
        </aside>
      </section>
    </>
  );
}
