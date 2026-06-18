import { CalendarDays, ChevronLeft, ChevronRight, Maximize2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const emptyForm = {
  event_date: '',
  event_type: 'Oration Task',
  selected_speaker_id: '',
  status: 'Scheduled',
  notes: '',
  reason: ''
};

function toDateInput(value) {
  return value ? value.slice(0, 10) : '';
}

function sameDate(a, b) {
  return a.toISOString().slice(0, 10) === b;
}

function monthLabel(date) {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function UpcomingSpeakers() {
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [monthDate, setMonthDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const [scheduleRows, employeeRows] = await Promise.all([api('/schedules'), api('/employees?status=active')]);
    setSchedules(scheduleRows);
    setEmployees(employeeRows);
  }

  useEffect(() => {
    load();
  }, []);

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const schedulesByDate = useMemo(() => {
    return schedules.reduce((acc, item) => {
      const key = toDateInput(item.event_date);
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [schedules]);

  const upcoming = schedules
    .filter((item) => new Date(item.event_date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  function openCreate(date = '') {
    setEditingId(null);
    setForm({ ...emptyForm, event_date: date });
    setIsModalOpen(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      event_date: toDateInput(item.event_date),
      event_type: item.event_type || 'Oration Task',
      selected_speaker_id: item.selected_speaker_id || '',
      status: item.status || 'Scheduled',
      notes: item.notes || '',
      reason: item.reschedule_reason || ''
    });
    setIsModalOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    const path = editingId ? `/schedules/${editingId}` : '/schedules';
    const method = editingId ? 'PATCH' : 'POST';
    await api(path, { method, body: form });
    setIsModalOpen(false);
    await load();
  }

  async function remove(item) {
    if (!confirm(`Delete speaker schedule for ${new Date(item.event_date).toLocaleDateString()}?`)) return;
    await api(`/schedules/${item.id}`, { method: 'DELETE' });
    await load();
  }

  function moveMonth(offset) {
    const next = new Date(monthDate);
    next.setMonth(monthDate.getMonth() + offset);
    setMonthDate(next);
  }

  function fullscreenCalendar() {
    document.querySelector('.calendar-shell')?.requestFullscreen?.();
  }

  return (
    <>
      <PageHeader
        title="Upcoming Speakers"
        kicker="manual schedule and calendar"
        actions={
          <>
            <button className="secondary-btn" onClick={fullscreenCalendar}>
              <Maximize2 size={16} />
              Full Screen Calendar
            </button>
            <button className="primary-btn" onClick={() => openCreate()}>
              <Plus size={16} />
              Create Manually
            </button>
          </>
        }
      />

      <section className="upcoming-speaker-layout">
        <section className="calendar-shell panel">
          <div className="calendar-header">
            <button className="icon-btn" onClick={() => moveMonth(-1)} title="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div>
              <span className="kicker">speaker calendar</span>
              <h2>{monthLabel(monthDate)}</h2>
            </div>
            <button className="icon-btn" onClick={() => moveMonth(1)} title="Next month">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const daySchedules = schedulesByDate[key] || [];
              const isCurrentMonth = day.getMonth() === monthDate.getMonth();
              const isToday = sameDate(day, new Date().toISOString().slice(0, 10));
              const isOrationDay = day.getDay() === 2 || day.getDay() === 4;

              return (
                <button
                  className={`calendar-day ${isCurrentMonth ? '' : 'muted'} ${isToday ? 'today' : ''} ${isOrationDay ? 'oration-day' : ''} ${daySchedules.length ? 'has-speaker' : ''}`}
                  key={key}
                  onClick={() => daySchedules[0] ? openEdit(daySchedules[0]) : openCreate(key)}
                >
                  <span className="date-number">{day.getDate()}</span>
                  {daySchedules.map((item) => (
                    <span className="speaker-badge" key={item.id}>
                      {item.employee_name || 'TBD'}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="panel speaker-list-panel">
          <div className="panel-title">
            <CalendarDays size={20} />
            Upcoming List
          </div>
          <div className="speaker-schedule-list">
            {upcoming.slice(0, 12).map((item) => (
              <div className="speaker-schedule-card" key={item.id}>
                <div>
                  <span>{item.day} · {new Date(item.event_date).toLocaleDateString()}</span>
                  <strong>{item.employee_name || 'Speaker TBD'}</strong>
                  <small>{item.event_type} · {item.status}</small>
                </div>
                <div className="card-actions">
                  <button className="icon-btn" title="Edit" onClick={() => openEdit(item)}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => remove(item)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {!upcoming.length ? <div className="empty-state">No upcoming speakers yet. Create one manually or spin a speaker.</div> : null}
          </div>
        </aside>
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-panel event-modal" onSubmit={save}>
            <div className="modal-header">
              <div className="panel-title">
                <CalendarDays size={20} />
                {editingId ? 'Edit Upcoming Speaker' : 'Create Upcoming Speaker'}
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid-2">
              <label>
                Date
                <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              </label>
              <label>
                Event Type
                <input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} required />
              </label>
              <label>
                Speaker
                <select value={form.selected_speaker_id} onChange={(e) => setForm({ ...form, selected_speaker_id: e.target.value })} required>
                  <option value="">Select speaker</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.employee_name}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Scheduled</option>
                  <option>Completed</option>
                  <option>Rescheduled</option>
                  <option>Cancelled</option>
                </select>
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label>
              Reschedule Reason
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </label>
            <button className="primary-btn">{editingId ? 'Update Speaker' : 'Create Speaker'}</button>
          </form>
        </div>
      ) : null}
    </>
  );
}

