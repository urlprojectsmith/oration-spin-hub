import crypto from 'crypto';
import { withTransaction } from '../config/db.js';

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function getOrCreateSpeakerCycle(client) {
  const current = await client.query(
    `SELECT * FROM spin_cycles WHERE wheel_type = 'speaker' AND status = 'active' ORDER BY cycle_number DESC LIMIT 1`
  );
  if (current.rows[0]) return current.rows[0];

  const last = await client.query(
    `SELECT COALESCE(MAX(cycle_number), 0) + 1 AS next_cycle FROM spin_cycles WHERE wheel_type = 'speaker'`
  );
  const created = await client.query(
    `INSERT INTO spin_cycles (wheel_type, cycle_number, status)
     VALUES ('speaker', $1, 'active') RETURNING *`,
    [last.rows[0].next_cycle]
  );
  return created.rows[0];
}

async function getSpeakerPool(client, excludeEmployeeIds = []) {
  let cycle = await getOrCreateSpeakerCycle(client);
  let eligible = await client.query(
    `SELECT * FROM employees
     WHERE status = 'active' AND already_spoken = false
     ORDER BY employee_name`
  );

  if (eligible.rows.length === 0) {
    const total = await client.query(`SELECT COUNT(*)::int AS total FROM employees WHERE status = 'active'`);
    if (total.rows[0].total === 0) {
      const error = new Error('No active employees are available for speaker selection');
      error.status = 400;
      throw error;
    }

    await client.query(
      `UPDATE spin_cycles SET status = 'completed', completed_at = NOW()
       WHERE id = $1`,
      [cycle.id]
    );
    await client.query(`UPDATE employees SET already_spoken = false, updated_at = NOW() WHERE status = 'active'`);

    const next = await client.query(
      `INSERT INTO spin_cycles (wheel_type, cycle_number, status)
       VALUES ('speaker', $1, 'active') RETURNING *`,
      [cycle.cycle_number + 1]
    );
    cycle = next.rows[0];
    eligible = await client.query(
      `SELECT * FROM employees WHERE status = 'active' ORDER BY employee_name`
    );
  }

  const excluded = new Set(excludeEmployeeIds.filter(Boolean));
  const filtered = eligible.rows.filter((employee) => !excluded.has(employee.id));
  if (eligible.rows.length > 1 && filtered.length === 0) {
    const error = new Error('No alternate employee is available for respin');
    error.status = 400;
    throw error;
  }

  return { cycle, employees: filtered.length ? filtered : eligible.rows };
}

async function createSpeakerSelection(client, { selectedBy, eventDate, notes, notify, excludeEmployeeIds = [], status = 'Scheduled' }) {
    const { cycle, employees } = await getSpeakerPool(client, excludeEmployeeIds);
    const winner = randomItem(employees);
    const day = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { weekday: 'long' }) : null;

    await client.query(
      `UPDATE employees SET already_spoken = true, updated_at = NOW() WHERE id = $1`,
      [winner.id]
    );

    const result = await client.query(
      `INSERT INTO spin_results
       (wheel_type, employee_id, winner_name, winner_email, selected_by, cycle_id, cycle_number, event_date, notes, batch_id)
       VALUES ('speaker', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [winner.id, winner.employee_name, winner.email, selectedBy, cycle.id, cycle.cycle_number, eventDate || null, notes || null, crypto.randomUUID()]
    );

    if (eventDate) {
      await client.query(
        `INSERT INTO speaker_schedules
         (event_date, day, event_type, selected_speaker_id, status, notes, cycle_number, created_by)
         VALUES ($1, $2, 'Oration Task', $3, 'Scheduled', $4, $5, $6)
         ON CONFLICT (event_date, event_type)
         DO UPDATE SET selected_speaker_id = EXCLUDED.selected_speaker_id,
                       status = $7,
                       notes = EXCLUDED.notes,
                       cycle_number = EXCLUDED.cycle_number,
                       updated_at = NOW()
         RETURNING *`,
        [eventDate, day, winner.id, notes || null, cycle.cycle_number, selectedBy, status]
      );
    }

    return { winner, cycle, result: result.rows[0], notify };
}

export async function spinSpeaker({ selectedBy, eventDate, notes, notify }) {
  return withTransaction(async (client) => {
    return createSpeakerSelection(client, { selectedBy, eventDate, notes, notify });
  });
}

export async function reselectSpeaker({ selectedBy, previousResultId, eventDate, notes, notify }) {
  return withTransaction(async (client) => {
    const previous = await client.query(
      `SELECT * FROM spin_results WHERE id = $1 AND wheel_type = 'speaker'`,
      [previousResultId]
    );
    if (!previous.rows[0]) {
      const error = new Error('Previous speaker result not found');
      error.status = 404;
      throw error;
    }

    const previousResult = previous.rows[0];
    if (previousResult.employee_id) {
      await client.query(
        `UPDATE employees SET already_spoken = false, updated_at = NOW() WHERE id = $1`,
        [previousResult.employee_id]
      );
    }
    await client.query(
      `UPDATE spin_results
       SET notes = CONCAT(COALESCE(notes, ''), CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n' END, $1::text)
       WHERE id = $2`,
      [`Reselected by admin. Reason: ${notes || 'Choose another employee'}`, previousResult.id]
    );

    return createSpeakerSelection(client, {
      selectedBy,
      eventDate: eventDate || previousResult.event_date,
      notes: notes || 'Reselected speaker',
      notify,
      excludeEmployeeIds: [previousResult.employee_id],
      status: 'Rescheduled'
    });
  });
}

export async function spinCoordinator({ selectedBy, count = 1, notes }) {
  return withTransaction(async (client) => {
    const pool = await client.query(
      `SELECT * FROM employees
       WHERE status = 'active' AND coordinator_eligible = true
       ORDER BY employee_name`
    );
    if (pool.rows.length === 0) {
      const error = new Error('No coordinator-eligible employees are available');
      error.status = 400;
      throw error;
    }

    const batchId = crypto.randomUUID();
    const winners = [];
    const available = [...pool.rows];
    const winnerCount = Math.min(Number(count) || 1, 2, available.length);

    for (let i = 0; i < winnerCount; i += 1) {
      const winner = randomItem(available);
      available.splice(available.findIndex((item) => item.id === winner.id), 1);
      winners.push(winner);
      await client.query(
        `INSERT INTO spin_results
         (wheel_type, employee_id, winner_name, winner_email, selected_by, notes, batch_id)
         VALUES ('coordinator', $1, $2, $3, $4, $5, $6)`,
        [winner.id, winner.employee_name, winner.email, selectedBy, notes || null, batchId]
      );
    }

    return { winners, batchId };
  });
}

export async function spinCustomWheel({ wheelId, selectedBy, notes }) {
  return withTransaction(async (client) => {
    const entries = await client.query(
      `SELECT * FROM wheel_entries WHERE wheel_id = $1 AND status = 'active' ORDER BY label`,
      [wheelId]
    );
    if (entries.rows.length === 0) {
      const error = new Error('This custom wheel has no active entries');
      error.status = 400;
      throw error;
    }

    const wheel = await client.query(`SELECT * FROM wheels WHERE id = $1`, [wheelId]);
    const winner = randomItem(entries.rows);
    const result = await client.query(
      `INSERT INTO spin_results
       (wheel_type, wheel_id, custom_entry_id, winner_name, winner_email, selected_by, notes, batch_id)
       VALUES ('custom', $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [wheelId, winner.id, winner.label, winner.email, selectedBy, notes || null, crypto.randomUUID()]
    );

    return { winner, wheel: wheel.rows[0], result: result.rows[0] };
  });
}
