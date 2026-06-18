import { Database, PlugZap, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Setup({ onReady }) {
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function testConnection() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api('/setup/test-database', {
        method: 'POST',
        body: { database_url: databaseUrl }
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncDatabase(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const result = await api('/setup/sync-database', {
        method: 'POST',
        body: { database_url: databaseUrl }
      });
      setMessage(`${result.message}. Login: ${result.login.email} / ${result.login.password}`);
      setTimeout(onReady, 1000);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="setup-page">
      <section className="setup-panel">
        <div className="brand-mark large">OS</div>
        <span className="kicker">first run database setup</span>
        <h1>Connect your PostgreSQL database</h1>
        <p>
          Use your VPS PostgreSQL connection string. The app will test the connection,
          create the schema, seed demo users, and then unlock the dashboard.
        </p>
        <form onSubmit={syncDatabase}>
          <label>
            PostgreSQL connection URL
            <input
              value={databaseUrl}
              onChange={(event) => setDatabaseUrl(event.target.value)}
              placeholder="postgres://user:password@host:5432/oration_spin_hub"
              required
            />
          </label>
          <div className="setup-actions">
            <button type="button" className="secondary-btn" onClick={testConnection} disabled={loading || !databaseUrl}>
              <PlugZap size={16} />
              Test Connection
            </button>
            <button className="primary-btn" disabled={loading || !databaseUrl}>
              {loading ? <RefreshCw size={16} /> : <Database size={16} />}
              Sync Database
            </button>
          </div>
        </form>
        {message ? <div className="toast-inline">{message}</div> : null}
      </section>
    </main>
  );
}

