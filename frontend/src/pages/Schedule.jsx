import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

export default function Schedule() {
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ event_date: '', selected_speaker_id: '', status: 'Scheduled', notes: '' });

  async function load() {
    const [scheduleRows, employeeRows] = await Promise.all([api('/schedules'), api('/employees?status=active')]);
    setSchedules(scheduleRows);
    setEmployees(employeeRows);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();
    await api('/schedules', { method: 'POST', body: form });
    setForm({ event_date: '', selected_speaker_id: '', status: 'Scheduled', notes: '' });
    load();
  }

  return (
    <>
      <PageHeader title="Schedule" kicker="Tuesday and Thursday planning" />
      <section className="management-grid">
        <form className="panel form-panel" onSubmit={save}>
          <div className="panel-title">
            <Save size={20} />
            Schedule Speaker
          </div>
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
          <select value={form.selected_speaker_id} onChange={(e) => setForm({ ...form, selected_speaker_id: e.target.value })} required>
            <option value="">Select speaker</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.employee_name}</option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Scheduled</option>
            <option>Completed</option>
            <option>Rescheduled</option>
            <option>Cancelled</option>
          </select>
          <textarea placeholder="Notes or reschedule reason" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="primary-btn">Save Schedule</button>
        </form>

        <section className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Event</th>
                  <th>Speaker</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.event_date).toLocaleDateString()}</td>
                    <td>{item.day}</td>
                    <td>{item.event_type}</td>
                    <td>{item.employee_name || 'TBD'}</td>
                    <td>{item.status}</td>
                    <td>{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}

