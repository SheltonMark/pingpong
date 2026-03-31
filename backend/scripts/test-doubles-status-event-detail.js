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
    `SELECT id, school_id, name, gender, avatar_url
     FROM users
     WHERE school_id IS NOT NULL
       AND gender IN ('male', 'female')
     ORDER BY id ASC
     LIMIT 3`
  );

  assert(rows.length >= 3, 'Need at least 3 test users with school_id and gender');
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

async function cleanup(context) {
  if (context.avatarBackups.length > 0) {
    for (const backup of context.avatarBackups) {
      await pool.query(
        'UPDATE users SET avatar_url = ? WHERE id = ?',
        [backup.avatar_url, backup.id]
      );
    }
  }

  if (context.eventIds.length === 0) {
    return;
  }

  await pool.query('DELETE FROM team_invitations WHERE event_id IN (?)', [context.eventIds]);
  await pool.query('DELETE FROM event_registrations WHERE event_id IN (?)', [context.eventIds]);
  await pool.query('DELETE FROM events WHERE id IN (?)', [context.eventIds]);
}

async function seedAvatarUrls(users, context) {
  const timestamp = Date.now();

  for (const [index, user] of users.entries()) {
    context.avatarBackups.push({ id: user.id, avatar_url: user.avatar_url });
    user.avatar_url = `https://example.com/test-avatar-${timestamp}-${index + 1}.png`;
    await pool.query(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [user.avatar_url, user.id]
    );
  }
}

async function main() {
  const context = {
    eventIds: [],
    avatarBackups: []
  };

  try {
    const [inviter, invitee, openLinkCandidate] = await getTestUsers();
    await seedAvatarUrls([inviter, invitee, openLinkCandidate], context);

    const targetedEventId = await createDoublesEvent(inviter.id, inviter.school_id);
    context.eventIds.push(targetedEventId);
    await pool.query(
      `INSERT INTO event_registrations (event_id, user_id, status)
       VALUES (?, ?, 'waiting_partner')`,
      [targetedEventId, invitee.id]
    );

    const registerRes = await request('POST', `/api/events/${targetedEventId}/register-doubles`, {
      user_id: inviter.id,
      partner_mode: 'select',
      partner_id: invitee.id
    });

    assert(registerRes.body.success, `register-doubles failed: ${registerRes.body.message || registerRes.status}`);

    const statusRes = await request('GET', `/api/events/${targetedEventId}/doubles-status`, {
      user_id: inviter.id
    });

    assert(statusRes.body.success, `doubles-status failed: ${statusRes.body.message || statusRes.status}`);
    assert(statusRes.body.data?.registration_state === 'invite_pending', 'Expected registration_state=invite_pending');
    assert(statusRes.body.data?.pending_invite?.invite_token, 'Expected pending_invite.invite_token');
    assert(statusRes.body.data?.pending_invite?.share_path, 'Expected pending_invite.share_path');
    assert(statusRes.body.data?.pending_invite?.partner_name === invitee.name, 'Expected pending_invite.partner_name');
    assert(
      statusRes.body.data?.pending_invite?.partner_avatar_url === invitee.avatar_url,
      'Expected pending_invite.partner_avatar_url'
    );

    const detailRes = await request('GET', `/api/events/${targetedEventId}`);
    assert(detailRes.body.success, `event detail failed: ${detailRes.body.message || detailRes.status}`);
    assert(Array.isArray(detailRes.body.data?.registrations), 'Expected registrations array');

    const inviterRow = detailRes.body.data.registrations.find((row) => Number(row.user_id) === Number(inviter.id));
    assert(inviterRow, 'Expected inviter registration row in event detail');
    assert(inviterRow.gender === inviter.gender, 'Expected event detail to include player gender');
    assert(inviterRow.partner_gender === invitee.gender, 'Expected event detail to include partner gender');

    const openLinkEventId = await createDoublesEvent(inviter.id, inviter.school_id);
    context.eventIds.push(openLinkEventId);

    const openLinkRes = await request('POST', `/api/events/${openLinkEventId}/doubles-open-invitations`, {
      user_id: inviter.id
    });

    assert(openLinkRes.body.success, `doubles-open-invitations failed: ${openLinkRes.body.message || openLinkRes.status}`);
    assert(openLinkRes.body.data?.invite_mode === 'open_link', 'Expected open-link invite mode');

    const openLinkStatusRes = await request('GET', `/api/events/${openLinkEventId}/doubles-status`, {
      user_id: inviter.id
    });

    assert(openLinkStatusRes.body.success, `open-link doubles-status failed: ${openLinkStatusRes.body.message || openLinkStatusRes.status}`);
    assert(openLinkStatusRes.body.data?.registration_state === 'waiting_partner', 'Expected open-link registration_state=waiting_partner');
    assert(openLinkStatusRes.body.data?.pending_invite?.invite_mode === 'open_link', 'Expected pending open-link invite');

    await pool.query(
      `INSERT INTO event_registrations (event_id, user_id, status)
       VALUES (?, ?, 'waiting_partner')`,
      [openLinkEventId, openLinkCandidate.id]
    );

    const targetedAfterOpenLinkRes = await request('POST', `/api/events/${openLinkEventId}/register-doubles`, {
      user_id: inviter.id,
      partner_mode: 'select',
      partner_id: openLinkCandidate.id
    });

    assert(
      targetedAfterOpenLinkRes.body.success,
      `register-doubles after open-link failed: ${targetedAfterOpenLinkRes.body.message || targetedAfterOpenLinkRes.status}`
    );

    const [openLinkInvitationRows] = await pool.query(
      `SELECT status
       FROM team_invitations
       WHERE event_id = ?
         AND inviter_id = ?
         AND type = 'doubles'
         AND invitee_id IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [openLinkEventId, inviter.id]
    );

    assert(openLinkInvitationRows.length === 1, 'Expected open-link invitation row');
    assert(openLinkInvitationRows[0].status === 'cancelled', 'Expected previous open-link invitation to be cancelled');

    console.log('All assertions passed');
  } finally {
    await cleanup(context);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
