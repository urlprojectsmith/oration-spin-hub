import axios from 'axios';
import nodemailer from 'nodemailer';
import { query } from '../config/db.js';

function buildTransport(settings = {}) {
  const host = settings.smtp_host || process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(settings.smtp_port || process.env.SMTP_PORT || 587),
    secure: String(settings.smtp_secure || process.env.SMTP_SECURE) === 'true',
    auth: {
      user: settings.smtp_user || process.env.SMTP_USER,
      pass: settings.smtp_pass || process.env.SMTP_PASS
    }
  });
}

async function getSettings() {
  const { rows } = await query(`SELECT key, value FROM app_settings`);
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

export async function sendSelectionNotifications({ employee, eventDate, eventType, selectedBy }) {
  const settings = await getSettings();
  const logs = [];
  const dateText = new Date(eventDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const subject =
    settings.email_subject_template ||
    `You are selected for Oration Task`;
  const body =
    settings.email_body_template ||
    `Hi ${employee.employee_name},\nYou have been selected as the speaker for the Oration Task on ${dateText}.\nPlease be ready with your topic and presentation.`;

  const webexBody =
    settings.webex_body_template ||
    `Hi ${employee.employee_name},\nYou have been selected for the Oration Task on ${dateText}.\nGet ready to speak, inspire, and improve your skills!`;

  const transport = buildTransport(settings);
  if (transport && employee.email) {
    try {
      await transport.sendMail({
        from: settings.email_from || process.env.EMAIL_FROM,
        to: employee.email,
        subject,
        text: body
      });
      logs.push(['email', 'sent', body]);
    } catch (error) {
      logs.push(['email', 'failed', error.message]);
    }
  }

  const webexToken = settings.webex_bot_token || process.env.WEBEX_BOT_TOKEN;
  const webexRoom = settings.webex_room_id || process.env.WEBEX_ROOM_ID;
  if (webexToken && webexRoom) {
    try {
      await axios.post(
        'https://webexapis.com/v1/messages',
        { roomId: webexRoom, text: webexBody },
        { headers: { Authorization: `Bearer ${webexToken}` } }
      );
      logs.push(['webex', 'sent', webexBody]);
    } catch (error) {
      logs.push(['webex', 'failed', error.response?.data?.message || error.message]);
    }
  }

  for (const [channel, status, message] of logs) {
    await query(
      `INSERT INTO notification_logs
       (employee_id, channel, event_type, status, message, selected_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [employee.id, channel, eventType, status, message, selectedBy]
    );
  }

  return logs;
}

