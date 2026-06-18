import { Filter } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

export default function History() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), month: '', event_type: '' });

  async function load() {
    const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))).toString();
    setRows(await api(`/history?${query}`));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Winner History" kicker="permanent selection record" />
      <section className="panel">
        <div className="filter-row">
          <Filter size={18} />
          <input value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} placeholder="Year" />
          <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option value={index + 1} key={index + 1}>{new Date(2026, index, 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <select value={filters.event_type} onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}>
            <option value="">All events</option>
            <option value="speaker">Speaker</option>
            <option value="coordinator">Coordinator</option>
            <option value="custom">Custom</option>
          </select>
          <button className="secondary-btn" onClick={load}>Apply</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Event Type</th>
                <th>Winner</th>
                <th>Email</th>
                <th>Selected By</th>
                <th>Cycle</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.date).toLocaleDateString()}</td>
                  <td>{row.day}</td>
                  <td>{row.event_type}</td>
                  <td>{row.winner_name}</td>
                  <td>{row.winner_email}</td>
                  <td>{row.selected_by}</td>
                  <td>{row.cycle_number || '-'}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

