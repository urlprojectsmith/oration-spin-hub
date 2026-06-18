import crypto from 'crypto';
import axios from 'axios';
import { query } from '../config/db.js';

function signature(secret, payload) {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export async function deliverWebhook(hook, eventName, payload) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Oration-Event': eventName
    };
    const signed = signature(hook.secret, payload);
    if (signed) headers['X-Oration-Signature'] = signed;

    try {
      const response = await axios.post(hook.url, payload, { headers, timeout: 6000 });
      await query(
        `INSERT INTO webhook_deliveries
         (webhook_id, event_name, payload, status, response_status, response_body)
         VALUES ($1, $2, $3, 'sent', $4, $5)`,
        [hook.id, eventName, payload, response.status, JSON.stringify(response.data).slice(0, 2000)]
      );
    } catch (error) {
      await query(
        `INSERT INTO webhook_deliveries
         (webhook_id, event_name, payload, status, response_status, error)
         VALUES ($1, $2, $3, 'failed', $4, $5)`,
        [hook.id, eventName, payload, error.response?.status || null, error.message]
      );
    }
}

export async function emitWebhookEvent(eventName, payload) {
  const { rows: hooks } = await query(
    `SELECT * FROM webhook_subscriptions
     WHERE status = 'active' AND ($1 = ANY(events) OR '*' = ANY(events))`,
    [eventName]
  );

  for (const hook of hooks) {
    await deliverWebhook(hook, eventName, payload);
  }
}
