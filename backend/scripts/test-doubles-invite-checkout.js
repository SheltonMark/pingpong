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

  assert(rows.length >= 3, '需要至少 3 个带 school_id 的测试用户');
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
    [`测试双打邀请_${Date.now()}`, schoolId, createdBy]
  );

  return result.insertId;
}

async function createCheckinPoint(createdBy, schoolId) {
  const [result] = await pool.query(
    `INSERT INTO check_in_points (
      school_id, name, location, latitude, longitude, radius, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NOW())`,
    [schoolId, `测试签到点_${Date.now()}`, '测试场地', 30.2741, 120.1551, 150, createdBy]
  );

  return result.insertId;
}

async function cleanup(context) {
  const {
    eventId,
    pointId,
    userIds = []
  } = context;

  if (pointId) {
    if (userIds.length > 0) {
      await pool.query('DELETE FROM check_ins WHERE point_id = ? AND user_id IN (?)', [pointId, userIds]);
    } else {
      await pool.query('DELETE FROM check_ins WHERE point_id = ?', [pointId]);
    }
    await pool.query('DELETE FROM check_in_points WHERE id = ?', [pointId]);
  }

  if (eventId) {
    await pool.query('DELETE FROM team_invitations WHERE event_id = ?', [eventId]);
    await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [eventId]);
    await pool.query('DELETE FROM events WHERE id = ?', [eventId]);
  }
}

async function testDoublesInviteFlow(users, context) {
  console.log('\n[1] 双打指定搭档应生成邀请 token 和分享路径');

  context.eventId = await createDoublesEvent(users[0].id, users[0].school_id);

  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, status)
     VALUES (?, ?, 'waiting_partner')`,
    [context.eventId, users[1].id]
  );

  const response = await request('POST', `/api/events/${context.eventId}/register-doubles`, {
    user_id: users[0].id,
    partner_mode: 'select',
    partner_id: users[1].id
  });

  assert(response.body.success, `双打报名失败: ${response.body.message || response.status}`);
  assert(response.body.data?.invite_token, '双打报名未返回 invite_token');
  assert(response.body.data?.share_path, '双打报名未返回 share_path');

  const [invites] = await pool.query(
    `SELECT invite_token
     FROM team_invitations
     WHERE event_id = ? AND inviter_id = ? AND invitee_id = ? AND type = 'doubles'
     ORDER BY id DESC
     LIMIT 1`,
    [context.eventId, users[0].id, users[1].id]
  );

  assert(invites.length === 1, '未写入双打邀请记录');
  assert(invites[0].invite_token, '数据库中的双打邀请未生成 invite_token');

  const detailRes = await request('GET', `/api/events/doubles-invitations/${invites[0].invite_token}`, {
    user_id: users[1].id
  });
  assert(detailRes.body.success, `双打邀请详情接口失败: ${detailRes.body.message || detailRes.status}`);
}

async function testCheckoutFlow(users, context) {
  console.log('\n[2] 签到后应可签退并返回签退时间');

  context.pointId = await createCheckinPoint(users[0].id, users[2].school_id);

  const checkinRes = await request('POST', '/api/checkin/check-in', {
    user_id: users[2].id,
    point_id: context.pointId,
    latitude: 30.2741,
    longitude: 120.1551
  });
  assert(checkinRes.body.success, `签到失败: ${checkinRes.body.message || checkinRes.status}`);

  const checkoutRes = await request('POST', '/api/checkin/check-out', {
    user_id: users[2].id,
    point_id: context.pointId,
    latitude: 30.2741,
    longitude: 120.1551
  });
  assert(checkoutRes.body.success, `签退失败: ${checkoutRes.body.message || checkoutRes.status}`);

  const recordsRes = await request('GET', '/api/checkin/records', {
    user_id: users[2].id
  });
  assert(recordsRes.body.success, `读取签到记录失败: ${recordsRes.body.message || recordsRes.status}`);
  assert(Array.isArray(recordsRes.body.data?.records), '签到记录格式错误');
  assert(
    recordsRes.body.data.records.some((record) => record.point_id === context.pointId && record.check_out_time),
    '签到记录中未返回 check_out_time'
  );
}

async function main() {
  const context = { userIds: [] };

  try {
    const users = await getTestUsers();
    context.userIds = users.map((user) => user.id);

    await testDoublesInviteFlow(users, context);
    await testCheckoutFlow(users, context);

    console.log('\n全部断言通过');
  } finally {
    await cleanup(context);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n测试失败:', error.message);
  process.exit(1);
});
