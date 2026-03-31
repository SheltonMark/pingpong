const fetch = globalThis.fetch || require('node-fetch');
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
    `SELECT id, school_id, name
     FROM users
     WHERE school_id IS NOT NULL
     ORDER BY id ASC
     LIMIT 3`
  );

  assert(rows.length >= 3, 'Need at least 3 test users with school_id');
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
    [`Doubles invite test ${Date.now()}`, schoolId, createdBy]
  );

  return result.insertId;
}

async function createCheckinPoint(createdBy, schoolId) {
  const [result] = await pool.query(
    `INSERT INTO check_in_points (
      school_id, name, location, latitude, longitude, radius, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NOW())`,
    [schoolId, `Checkin point ${Date.now()}`, 'Test venue', 30.2741, 120.1551, 150, createdBy]
  );

  return result.insertId;
}

async function cleanup(context) {
  const eventIds = [...new Set((context.eventIds || []).filter(Boolean))];

  if (context.pointId) {
    if ((context.userIds || []).length > 0) {
      await pool.query('DELETE FROM check_ins WHERE point_id = ? AND user_id IN (?)', [context.pointId, context.userIds]);
    } else {
      await pool.query('DELETE FROM check_ins WHERE point_id = ?', [context.pointId]);
    }
    await pool.query('DELETE FROM check_in_points WHERE id = ?', [context.pointId]);
  }

  if (eventIds.length > 0) {
    await pool.query('DELETE FROM team_invitations WHERE event_id IN (?)', [eventIds]);
    await pool.query('DELETE FROM event_registrations WHERE event_id IN (?)', [eventIds]);
    await pool.query('DELETE FROM events WHERE id IN (?)', [eventIds]);
  }
}

async function testTargetedDoublesInviteFlow(users, context) {
  console.log('\n[1] Targeted doubles invite should return token, detail and status context');

  const eventId = await createDoublesEvent(users[0].id, users[0].school_id);
  context.eventIds.push(eventId);

  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, status)
     VALUES (?, ?, 'waiting_partner')`,
    [eventId, users[1].id]
  );

  const response = await request('POST', `/api/events/${eventId}/register-doubles`, {
    user_id: users[0].id,
    partner_mode: 'select',
    partner_id: users[1].id
  });

  assert(response.body.success, `Targeted doubles invite failed: ${response.body.message || response.status}`);
  assert(response.body.data?.invite_token, 'Targeted doubles invite did not return invite_token');
  assert(response.body.data?.share_path, 'Targeted doubles invite did not return share_path');

  const detailRes = await request('GET', `/api/events/doubles-invitations/${response.body.data.invite_token}`, {
    user_id: users[1].id
  });
  assert(detailRes.body.success, `Targeted doubles detail failed: ${detailRes.body.message || detailRes.status}`);

  const statusRes = await request('GET', `/api/events/${eventId}/doubles-status`, {
    user_id: users[0].id
  });
  assert(statusRes.body.success, `Doubles status failed: ${statusRes.body.message || statusRes.status}`);
  assert(statusRes.body.data?.registration_state === 'invite_pending', 'Expected inviter registration_state=invite_pending');
  assert(Array.isArray(statusRes.body.data?.available_partners), 'Expected available_partners array');
}

async function testOpenLinkDoublesInviteFlow(users, context) {
  console.log('\n[2] Open-link doubles invite should allow first eligible responder to confirm');

  const eventId = await createDoublesEvent(users[0].id, users[0].school_id);
  context.eventIds.push(eventId);

  const createRes = await request('POST', `/api/events/${eventId}/doubles-open-invitations`, {
    user_id: users[0].id
  });
  assert(createRes.body.success, `Open-link invite creation failed: ${createRes.body.message || createRes.status}`);
  assert(createRes.body.data?.invite_token, 'Open-link invite did not return invite_token');

  const detailRes = await request('GET', `/api/events/doubles-invitations/${createRes.body.data.invite_token}`, {
    user_id: users[2].id
  });
  assert(detailRes.body.success, `Open-link detail failed: ${detailRes.body.message || detailRes.status}`);
  assert(detailRes.body.data?.invite_mode === 'open_link', 'Expected invite_mode=open_link');

  const respondRes = await request('POST', `/api/events/doubles-invitations/${createRes.body.data.invite_token}/respond`, {
    user_id: users[2].id,
    action: 'accept'
  });
  assert(respondRes.body.success, `Open-link accept failed: ${respondRes.body.message || respondRes.status}`);

  const [registrations] = await pool.query(
    `SELECT user_id, status, partner_id
     FROM event_registrations
     WHERE event_id = ?
       AND user_id IN (?, ?)
       AND status != 'cancelled'`,
    [eventId, users[0].id, users[2].id]
  );

  assert(registrations.length === 2, 'Open-link accept did not create both registration rows');
  assert(registrations.every((row) => row.status === 'confirmed'), 'Open-link accept did not confirm both players');
}

async function testCheckoutFlow(users, context) {
  console.log('\n[3] Check-in should support check-out and return check-out time');

  context.pointId = await createCheckinPoint(users[0].id, users[2].school_id);

  const checkinRes = await request('POST', '/api/checkin/check-in', {
    user_id: users[2].id,
    point_id: context.pointId,
    latitude: 30.2741,
    longitude: 120.1551
  });
  assert(checkinRes.body.success, `Check-in failed: ${checkinRes.body.message || checkinRes.status}`);

  const checkoutRes = await request('POST', '/api/checkin/check-out', {
    user_id: users[2].id,
    point_id: context.pointId,
    latitude: 30.2741,
    longitude: 120.1551
  });
  assert(checkoutRes.body.success, `Check-out failed: ${checkoutRes.body.message || checkoutRes.status}`);

  const recordsRes = await request('GET', '/api/checkin/records', {
    user_id: users[2].id
  });
  assert(recordsRes.body.success, `Check-in records failed: ${recordsRes.body.message || recordsRes.status}`);
  assert(Array.isArray(recordsRes.body.data?.records), 'Check-in records should return an array');
  assert(
    recordsRes.body.data.records.some((record) => record.point_id === context.pointId && record.check_out_time),
    'Check-in records did not return check_out_time'
  );
}

async function main() {
  const context = {
    eventIds: [],
    pointId: null,
    userIds: []
  };

  try {
    const users = await getTestUsers();
    context.userIds = users.map((user) => user.id);

    await testTargetedDoublesInviteFlow(users, context);
    await testOpenLinkDoublesInviteFlow(users, context);
    await testCheckoutFlow(users, context);

    console.log('\nAll assertions passed');
  } finally {
    await cleanup(context);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\nTest failed:', error.message);
  process.exit(1);
});
