import { CalendarPlus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import SpinWheel from '../components/SpinWheel.jsx';
import { api } from '../lib/api.js';

function nextOrationDate() {
  const date = new Date();
  for (let i = 0; i < 8; i += 1) {
    const day = date.getDay();
    if (day === 2 || day === 4) return date.toISOString().slice(0, 10);
    date.setDate(date.getDate() + 1);
  }
  return new Date().toISOString().slice(0, 10);
}

export default function Spin({ type }) {
  const { wheelId } = useParams();
  const [employees, setEmployees] = useState([]);
  const [wheels, setWheels] = useState([]);
  const [eventDate, setEventDate] = useState(nextOrationDate());
  const [count, setCount] = useState(1);
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const [spinIntent, setSpinIntent] = useState('normal');
  const [spinToken, setSpinToken] = useState(0);
  const spinIntentRef = useRef('normal');

  async function load() {
    if (type === 'custom') {
      setWheels(await api('/wheels'));
    } else {
      setEmployees(await api('/employees?status=active'));
    }
  }

  useEffect(() => {
    load();
  }, [type, wheelId]);

  const currentWheel = wheels.find((wheel) => wheel.id === wheelId);
  const names = useMemo(() => {
    if (type === 'speaker') return employees.filter((item) => !item.already_spoken).map((item) => item.employee_name);
    if (type === 'coordinator') return employees.filter((item) => item.coordinator_eligible).map((item) => item.employee_name);
    return currentWheel?.entries?.filter((item) => item.status === 'active').map((item) => item.label) || [];
  }, [employees, currentWheel, type]);

  async function spin() {
    let response;
    if (type === 'speaker') {
      if (spinIntentRef.current === 'reselect' && result?.result?.id) {
        response = await api('/spin/speaker/reselect', {
          method: 'POST',
          body: {
            previous_result_id: result.result.id,
            event_date: eventDate,
            notify,
            notes: notes || 'Respin requested from speaker wheel'
          }
        });
      } else {
        response = await api('/spin/speaker', { method: 'POST', body: { event_date: eventDate, notify, notes } });
      }
    } else if (type === 'coordinator') {
      response = await api('/spin/coordinator', { method: 'POST', body: { count, notes } });
    } else {
      response = await api(`/spin/custom/${wheelId}`, { method: 'POST', body: { notes } });
    }
    spinIntentRef.current = 'normal';
    setSpinIntent('normal');
    setResult(response);
    await load();
    return response;
  }

  function requestRespin() {
    spinIntentRef.current = 'reselect';
    setSpinIntent('reselect');
    setSpinToken((value) => value + 1);
  }

  const title = type === 'speaker' ? 'Speaker Spin Wheel' : type === 'coordinator' ? 'Coordinator Spin Wheel' : currentWheel?.name || 'Custom Wheel';

  return (
    <>
      <PageHeader title={title} kicker="projector-ready selection" />
      <section className="spin-layout">
        <SpinWheel
          names={names}
          onSpin={spin}
          mode={type}
          title={title}
          spinToken={spinToken}
          actionLabel={spinIntent === 'reselect' ? 'Respinning...' : 'Spin Now'}
        />
        <aside className="panel spin-controls">
          <div className="panel-title">
            <CalendarPlus size={20} />
            Spin Controls
          </div>
          {type === 'speaker' ? (
            <>
              <label>
                Event date
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </label>
              <label className="check-row">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Send email and Webex notifications
              </label>
            </>
          ) : null}
          {type === 'coordinator' ? (
            <label>
              Coordinators
              <select value={count} onChange={(e) => setCount(e.target.value)}>
                <option value="1">Select one</option>
                <option value="2">Select two</option>
              </select>
            </label>
          ) : null}
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional reason, context, or event note" />
          </label>
          <div className="pool-count">
            <strong>{names.length}</strong>
            <span>available names</span>
          </div>
          {result ? (
            <div className="result-box">
              <span>Latest result</span>
              <strong>
                {result.winner?.employee_name || result.winner?.label || result.winners?.map((item) => item.employee_name).join(', ')}
              </strong>
              {result.cycle ? <small>Cycle #{result.cycle.cycle_number}</small> : null}
              {type === 'speaker' && result.result?.id ? (
                <button className="secondary-btn reselect-btn" onClick={requestRespin}>
                  <RotateCcw size={15} />
                  Respin - Choose Another
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>
    </>
  );
}
