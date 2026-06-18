import { Download, FileBarChart } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

export default function Reports() {
  const [notSpoken, setNotSpoken] = useState([]);
  const [cycles, setCycles] = useState([]);

  useEffect(() => {
    Promise.all([api('/reports/not-spoken'), api('/reports/cycle-completion')]).then(([notSpokenRows, cycleRows]) => {
      setNotSpoken(notSpokenRows);
      setCycles(cycleRows);
    });
  }, []);

  async function exportCsv() {
    const csv = await api('/reports/export.csv');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oration-history.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Reports"
        kicker="analytics and exports"
        actions={<button className="primary-btn" onClick={exportCsv}><Download size={16} /> Export CSV</button>}
      />
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-title">
            <FileBarChart size={20} />
            Employees Not Yet Spoken
          </div>
          <div className="stack-list">
            {notSpoken.map((item) => (
              <div key={item.employee_id}>
                <strong>{item.employee_name}</strong>
                <span>{item.email}</span>
              </div>
            ))}
            {!notSpoken.length ? <div className="empty-state">Everyone has spoken in the current cycle.</div> : null}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <FileBarChart size={20} />
            Cycle Completion
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Selections</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.cycle_number}>
                    <td>#{cycle.cycle_number}</td>
                    <td>{cycle.status}</td>
                    <td>{cycle.speakers_selected}</td>
                    <td>{cycle.completed_at ? new Date(cycle.completed_at).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}

