import { Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

export default function Wheels() {
  const [wheels, setWheels] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', entries: '' });

  async function load() {
    setWheels(await api('/wheels'));
  }

  useEffect(() => {
    load();
  }, []);

  async function createWheel(event) {
    event.preventDefault();
    const entries = form.entries
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
    await api('/wheels', { method: 'POST', body: { ...form, entries } });
    setForm({ name: '', description: '', entries: '' });
    load();
  }

  return (
    <>
      <PageHeader title="Custom Wheels" kicker="multipurpose events" />
      <section className="management-grid">
        <form className="panel form-panel" onSubmit={createWheel}>
          <div className="panel-title">
            <Plus size={20} />
            Create Wheel
          </div>
          <input placeholder="Wheel name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea
            placeholder={'Entries, one per line\nFun Friday\nLucky Draw\nRewards'}
            value={form.entries}
            onChange={(e) => setForm({ ...form, entries: e.target.value })}
            required
          />
          <button className="primary-btn">Create</button>
        </form>

        <section className="cards-grid">
          {wheels.map((wheel) => (
            <article className="wheel-card" key={wheel.id}>
              <Sparkles size={24} />
              <h3>{wheel.name}</h3>
              <p>{wheel.description || 'Custom event wheel'}</p>
              <span>{wheel.entries?.length || 0} entries</span>
              <Link className="primary-btn" to={`/custom-wheels/${wheel.id}/spin`}>Open Wheel</Link>
            </article>
          ))}
        </section>
      </section>
    </>
  );
}

