import { PlugZap, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const keys = [
  ['smtp_host', 'SMTP Host'],
  ['smtp_port', 'SMTP Port'],
  ['smtp_secure', 'SMTP Secure true/false'],
  ['smtp_user', 'SMTP User'],
  ['smtp_pass', 'SMTP Password'],
  ['email_from', 'Email From'],
  ['email_subject_template', 'Email Subject Template'],
  ['email_body_template', 'Email Body Template'],
  ['webex_bot_token', 'Webex Bot Token'],
  ['webex_room_id', 'Webex Room ID'],
  ['webex_body_template', 'Webex Body Template']
];

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [webhooks, setWebhooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', secret: '', events: '*' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/settings').then(setSettings);
    loadWebhooks();
  }, []);

  async function loadWebhooks() {
    const [hookRows, deliveryRows] = await Promise.all([
      api('/webhooks'),
      api('/webhooks/deliveries/recent')
    ]);
    setWebhooks(hookRows);
    setDeliveries(deliveryRows);
  }

  async function save(event) {
    event.preventDefault();
    await api('/settings', { method: 'PUT', body: settings });
    setMessage('Settings saved');
  }

  async function createWebhook(event) {
    event.preventDefault();
    await api('/webhooks', {
      method: 'POST',
      body: {
        ...webhookForm,
        events: webhookForm.events.split(',').map((item) => item.trim()).filter(Boolean)
      }
    });
    setWebhookForm({ name: '', url: '', secret: '', events: '*' });
    await loadWebhooks();
  }

  async function testWebhook(id) {
    await api(`/webhooks/${id}/test`, { method: 'POST', body: {} });
    setTimeout(loadWebhooks, 800);
  }

  return (
    <>
      <PageHeader title="Settings" kicker="notifications and integrations" />
      <section className="settings-layout">
        <form className="panel settings-grid" onSubmit={save}>
          {keys.map(([key, label]) => (
            <label key={key} className={key.includes('template') ? 'wide' : ''}>
              {label}
              {key.includes('template') ? (
                <textarea value={settings[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
              ) : (
                <input
                  type={key.includes('pass') || key.includes('token') ? 'password' : 'text'}
                  value={settings[key] || ''}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <button className="primary-btn wide">
            <Save size={16} />
            Save Settings
          </button>
          {message ? <div className="toast-inline wide">{message}</div> : null}
        </form>

        <section className="panel webhook-panel">
          <div className="panel-title">
            <PlugZap size={20} />
            Webhook Endpoints
          </div>
          <form className="webhook-form" onSubmit={createWebhook}>
            <input placeholder="Webhook name" value={webhookForm.name} onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })} required />
            <input placeholder="https://example.com/webhook" value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })} required />
            <input placeholder="Secret for signature" value={webhookForm.secret} onChange={(e) => setWebhookForm({ ...webhookForm, secret: e.target.value })} />
            <input placeholder="Events: *, event.created, spin.speaker.selected" value={webhookForm.events} onChange={(e) => setWebhookForm({ ...webhookForm, events: e.target.value })} />
            <button className="primary-btn">Add Webhook</button>
          </form>
          <div className="webhook-list">
            {webhooks.map((hook) => (
              <div className="webhook-item" key={hook.id}>
                <div>
                  <strong>{hook.name}</strong>
                  <span>{hook.url}</span>
                  <small>{hook.events.join(', ')}</small>
                </div>
                <button className="secondary-btn" onClick={() => testWebhook(hook.id)}>
                  <Send size={15} />
                  Test
                </button>
              </div>
            ))}
            {!webhooks.length ? <div className="empty-state">No webhook endpoints configured.</div> : null}
          </div>
          <div className="delivery-list">
            <span className="kicker">recent deliveries</span>
            {deliveries.slice(0, 5).map((delivery) => (
              <div key={delivery.id}>
                <strong>{delivery.event_name}</strong>
                <span>{delivery.status}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
