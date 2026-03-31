const { pool } = require('../config/database');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3100';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(method, path, data = null) {
  let url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (data && method === 'GET') {
    const params = new URLSearchParams(data);
    url += `?${params.toString()}`;
  } else if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  try {
    return {
      status: response.status,
      body: JSON.parse(text)
    };
  } catch (error) {
    return {
      status: response.status,
      body: {
        success: false,
        message: text
      }
    };
  }
}

async function getTestUsers() {
  const [rows] = await pool.query(
    `SELECT id, school_id, name, gender
     FROM users
     WHERE school_id IS NOT NULL
       AND gender IN ('male', 'female')
     ORDER BY id ASC
     LIMIT 2`
  );

  assert(rows.length >= 2, 'Need at least 2 test users with school_id and gender');
  return rows;
}

async function createDoublesEvent(createdBy, schoolId) {
  const [result] = await pool.query(
    `INSERT INTO events (
      title, event_type, status, max_participants, school_id, scope,
      event_format, best_of, games_to_win, event_start, registration_end, created_by
    ) VALUES (
      ?, 'doubles', 'registration', 32, ?, 'school',
      'knockout', 5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?
    )`,
    [`Doubles status test ${Date.now()}`, schoolId, createdBy]
  );

  return result.insertId;
}

async function cleanup(eventId) {
  if (!eventId) {
    return;
  }

  await pool.query('DELETE FROM team_invitations WHERE event_id = ?', [eventId]);
  await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [eventId]);
  await pool.query('DELETE FROM events WHERE id = ?', [eventId]);
}

async function main() {
  let eventId = null;

  try {
    const [inviter, invitee] = await getTestUsers();
    eventId = await createDoublesEvent(inviter.id, inviter.school_id);

    await pool.query(
      `INSERT INTO event_registrations (event_id, user_id, status)
       VALUES (?, ?, 'waiting_partner')`,
      [eventId, invitee.id]
    );

    const registerRes = await request('POST', `/api/events/${eventId}/register-doubles`, {
      user_id: inviter.id,
      partner_mode: 'select',
      partner_id: invitee.id
    });

    assert(registerRes.body.success, `register-doubles failed: ${registerRes.body.message || registerRes.status}`);

    const statusRes = await request('GET', `/api/events/${eventId}/doubles-status`, {
      user_id: inviter.id
    });

    assert(statusRes.body.success, `doubles-status failed: ${statusRes.body.message || statusRes.status}`);
    assert(statusRes.body.data?.registration_state === 'invite_pending', 'Expected registration_state=invite_pending');
    assert(statusRes.body.data?.pending_invite?.invite_token, 'Expected pending_invite.invite_token');
    assert(statusRes.body.data?.pending_invite?.share_path, 'Expected pending_invite.share_path');
    assert(statusRes.body.data?.pending_invite?.partner_name === invitee.name, 'Expected pending_invite.partner_name');

    const detailRes = await request('GET', `/api/events/${eventId}`);
    assert(detailRes.body.success, `event detail failed: ${detailRes.body.message || detailRes.status}`);
    assert(Array.isArray(detailRes.body.data?.registrations), 'Expected registrations array');

    const inviterRow = detailRes.body.data.registrations.find((row) => Number(row.user_id) === Number(inviter.id));
    assert(inviterRow, 'Expected inviter registration row in event detail');
    assert(inviterRow.gender === inviter.gender, 'Expected event detail to include player gender');
    assert(inviterRow.partner_gender === invitee.gender, 'Expected event detail to include partner gender');

    console.log('All assertions passed');
  } finally {
    await cleanup(eventId);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
