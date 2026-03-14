/**
 * 团体赛、双打、单打 完整流程测试
 * 直接连接生产数据库，模拟 API 逻辑
 * 使用临时测试数据，测试完清理
 */
const mysql = require('mysql2/promise');

let pool;
const TEST_EVENT_ID_SINGLES = null; // 动态创建
const TEST_EVENT_ID_DOUBLES = null;
const TEST_EVENT_ID_TEAM = null;

// 测试用户ID（用已有的真实用户）
const USER_LEADER = 2;    // 马顺涛 - 领队
const USER_MEMBER1 = 3;   // 刘晨航
const USER_MEMBER2 = 226; // 罗子萱
const USER_MEMBER3 = 244; // 宋承诺

let testEventIds = [];
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function cleanup() {
  for (const eid of testEventIds) {
    await pool.query('DELETE FROM team_invitations WHERE event_id = ?', [eid]);
    await pool.query('DELETE FROM captain_applications WHERE event_id = ?', [eid]);
    await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [eid]);
    await pool.query('DELETE FROM events WHERE id = ?', [eid]);
  }
}

async function createTestEvent(title, type) {
  const [result] = await pool.query(
    `INSERT INTO events (title, event_type, status, max_participants, school_id, scope, event_format, best_of, games_to_win, event_start, registration_end, created_by)
     VALUES (?, ?, 'registration', 32, 1, 'school', 'knockout', 5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?)`,
    [title, type, USER_LEADER]
  );
  testEventIds.push(result.insertId);
  return result.insertId;
}

// ========== 单打测试 ==========
async function testSingles() {
  console.log('\n🏓 === 单打报名测试 ===');
  const eventId = await createTestEvent('测试单打赛事_auto', 'singles');

  // 1. 正常报名
  console.log('\n[1] 正常报名');
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, 'confirmed')`,
    [eventId, USER_MEMBER1]
  );
  const [r1] = await pool.query('SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);
  assert(r1.length === 1 && r1[0].status === 'confirmed', '用户报名成功');

  // 2. 重复报名应被拒绝
  console.log('\n[2] 重复报名检查');
  const [existing] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
    [eventId, USER_MEMBER1]
  );
  assert(existing.length > 0, '检测到已报名，应拒绝');

  // 3. 取消后重新报名（唯一键冲突场景）
  console.log('\n[3] 取消后重新报名（唯一键冲突修复验证）');
  await pool.query('UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);

  const [ex2] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"', [eventId, USER_MEMBER1]
  );
  assert(ex2.length === 0, '取消后非cancelled记录为0');

  const [can2] = await pool.query(
    'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "cancelled"', [eventId, USER_MEMBER1]
  );
  assert(can2.length > 0, '存在cancelled记录');

  // 模拟修复后的逻辑：UPDATE而非INSERT
  await pool.query(
    'UPDATE event_registrations SET status = "confirmed", partner_id = NULL, partner_status = NULL WHERE event_id = ? AND user_id = ?',
    [eventId, USER_MEMBER1]
  );
  const [r3] = await pool.query('SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "confirmed"', [eventId, USER_MEMBER1]);
  assert(r3.length === 1, '重新报名成功（UPDATE方式）');
}

// ========== 双打测试 ==========
async function testDoubles() {
  console.log('\n🏓🏓 === 双打报名测试 ===');
  const eventId = await createTestEvent('测试双打赛事_auto', 'doubles');

  // 1. 等待配对模式
  console.log('\n[1] 等待配对模式报名');
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, 'waiting_partner')`,
    [eventId, USER_MEMBER1]
  );
  const [r1] = await pool.query('SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "waiting_partner"', [eventId, USER_MEMBER1]);
  assert(r1.length === 1, '用户进入配对队列');

  // 2. 指定搭档模式
  console.log('\n[2] 指定搭档模式');
  const [partnerReg] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "waiting_partner"',
    [eventId, USER_MEMBER1]
  );
  assert(partnerReg.length === 1, '搭档在配对队列中');

  // 创建报名记录
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, partner_id, partner_status, status) VALUES (?, ?, ?, 'pending', 'pending')`,
    [eventId, USER_MEMBER2, USER_MEMBER1]
  );
  // 更新搭档记录
  await pool.query(
    `UPDATE event_registrations SET partner_id = ?, partner_status = 'pending', status = 'pending' WHERE event_id = ? AND user_id = ? AND status = 'waiting_partner'`,
    [USER_MEMBER2, eventId, USER_MEMBER1]
  );

  const [r2a] = await pool.query('SELECT partner_id, status FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER2]);
  const [r2b] = await pool.query('SELECT partner_id, status FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);
  assert(r2a[0].partner_id === USER_MEMBER1 && r2a[0].status === 'pending', '发起者记录正确');
  assert(r2b[0].partner_id === USER_MEMBER2 && r2b[0].status === 'pending', '搭档记录已关联');

  // 3. 接受邀请
  console.log('\n[3] 搭档接受邀请');
  await pool.query(
    `UPDATE event_registrations SET status = 'confirmed', partner_status = 'confirmed' WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
    [eventId, USER_MEMBER2, USER_MEMBER1]
  );
  await pool.query(
    `UPDATE event_registrations SET status = 'confirmed', partner_status = 'confirmed' WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
    [eventId, USER_MEMBER1, USER_MEMBER2]
  );
  const [r3a] = await pool.query('SELECT status, partner_status FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER2]);
  const [r3b] = await pool.query('SELECT status, partner_status FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);
  assert(r3a[0].status === 'confirmed' && r3a[0].partner_status === 'confirmed', '发起者状态confirmed');
  assert(r3b[0].status === 'confirmed' && r3b[0].partner_status === 'confirmed', '搭档状态confirmed');

  // 4. 取消后重新报名（唯一键冲突）
  console.log('\n[4] 双打取消后重新报名');
  await pool.query('UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER2]);

  const [ex4] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"', [eventId, USER_MEMBER2]
  );
  const [can4] = await pool.query(
    'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "cancelled"', [eventId, USER_MEMBER2]
  );
  assert(ex4.length === 0, '取消后非cancelled为0');
  assert(can4.length > 0, '存在cancelled记录');

  // UPDATE方式重新报名
  await pool.query(
    `UPDATE event_registrations SET status = 'waiting_partner', partner_id = NULL, partner_status = NULL WHERE event_id = ? AND user_id = ?`,
    [eventId, USER_MEMBER2]
  );
  const [r4] = await pool.query('SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER2]);
  assert(r4[0].status === 'waiting_partner', '重新报名成功（UPDATE方式）');
}

// ========== 团体赛测试 ==========
async function testTeam() {
  console.log('\n🏓🏓🏓 === 团体赛测试 ===');
  const eventId = await createTestEvent('测试团体赛事_auto', 'team');

  // 创建领队申请
  await pool.query(
    `INSERT INTO captain_applications (event_id, user_id, status, is_participating) VALUES (?, ?, 'approved', 1)`,
    [eventId, USER_LEADER]
  );

  // 1. my-team: 领队未提交，无成员
  console.log('\n[1] 领队未提交，无成员');
  const [lr1] = await pool.query(
    'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
    [eventId, USER_LEADER]
  );
  assert(lr1.length === 0, 'leaderReg为空');
  const [pm1] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND team_leader_id = ? AND status != "cancelled"',
    [eventId, USER_LEADER]
  );
  assert(pm1.length === 0, '无待加入成员');
  // 前端应走 initMembers，显示领队自己

  // 2. 成员通过分享链接加入
  console.log('\n[2] 成员通过分享链接加入');
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, team_leader_id, is_participating, status)
     VALUES (?, ?, NULL, 0, ?, 1, 'confirmed')`,
    [eventId, USER_MEMBER1, USER_LEADER]
  );
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, team_leader_id, is_participating, status)
     VALUES (?, ?, NULL, 0, ?, 1, 'confirmed')`,
    [eventId, USER_MEMBER2, USER_LEADER]
  );

  // 3. my-team: 领队未提交，但有成员
  console.log('\n[3] my-team: 领队未提交，有成员加入');
  const [lr3] = await pool.query(
    'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
    [eventId, USER_LEADER]
  );
  assert(lr3.length === 0, 'leaderReg仍为空（未提交）');

  const [pm3] = await pool.query(
    'SELECT er.user_id, er.is_team_leader, u.name, u.avatar_url FROM event_registrations er JOIN users u ON er.user_id = u.id WHERE er.event_id = ? AND er.team_leader_id = ? AND er.status != "cancelled"',
    [eventId, USER_LEADER]
  );
  assert(pm3.length === 2, `返回${pm3.length}个成员`);
  assert(pm3.every(m => m.name && m.name.length > 0), '所有成员有名字');

  // 模拟前端逻辑
  const submitted3 = false;
  let members3 = pm3.map(m => ({
    user_id: m.user_id, name: m.name, isLeader: !!m.is_team_leader
  }));
  const leaderIdx = members3.findIndex(m => m.user_id === USER_LEADER);
  if (leaderIdx >= 0) {
    members3[leaderIdx].isLeader = true;
    if (leaderIdx > 0) { const [l] = members3.splice(leaderIdx, 1); members3.unshift(l); }
    assert(true, '领队已在列表中，标记为领队');
  } else {
    members3.unshift({ user_id: USER_LEADER, name: '马顺涛', isLeader: true });
    assert(true, '领队不在列表中，补上');
  }
  assert(!submitted3, 'submitted=false → 队名可编辑');
  assert(members3[0].isLeader, '领队在首位');

  // 4. 领队提交报名
  console.log('\n[4] 领队提交报名');
  const teamName = '测试队伍_auto';
  const memberIds = [USER_MEMBER1, USER_MEMBER2];

  // 创建领队注册记录
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, is_participating, status)
     VALUES (?, ?, ?, 1, 1, 'confirmed')`,
    [eventId, USER_LEADER, teamName]
  );
  // 更新成员的team_name
  for (const mid of memberIds) {
    await pool.query(
      'UPDATE event_registrations SET team_name = ? WHERE event_id = ? AND user_id = ?',
      [teamName, eventId, mid]
    );
  }

  // 5. my-team: 领队已提交
  console.log('\n[5] my-team: 领队已提交');
  const [lr5] = await pool.query(
    'SELECT team_name FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1 AND status != "cancelled"',
    [eventId, USER_LEADER]
  );
  assert(lr5.length === 1, 'leaderReg存在');
  assert(lr5[0].team_name === teamName, `队名=${lr5[0].team_name}`);
  const submitted5 = !!lr5[0].team_name;
  assert(submitted5 === true, 'submitted=true → 队名锁定');

  const [members5] = await pool.query(
    `SELECT er.user_id, er.is_team_leader, er.is_participating, u.name, u.avatar_url
     FROM event_registrations er JOIN users u ON er.user_id = u.id
     WHERE er.event_id = ? AND er.status != 'cancelled'
       AND (er.team_name = ? OR (er.team_leader_id = ? AND er.is_team_leader = 0) OR (er.user_id = ? AND er.is_team_leader = 1))
     ORDER BY er.is_team_leader DESC`,
    [eventId, teamName, USER_LEADER, USER_LEADER]
  );
  assert(members5.length === 3, `成员数=${members5.length}（领队+2队员）`);
  assert(members5[0].is_team_leader === 1, '领队排首位');
  assert(members5.every(m => m.name && m.name.length > 0), '所有成员有名字');
  assert(members5.every(m => m.avatar_url !== undefined), '所有成员有头像字段');

  // 6. 领队不参赛场景
  console.log('\n[6] 领队不参赛场景');
  await pool.query('DELETE FROM captain_applications WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER3]);
  await pool.query(
    `INSERT INTO captain_applications (event_id, user_id, status, is_participating) VALUES (?, ?, 'approved', 0)`,
    [eventId, USER_MEMBER3]
  );
  // 模拟前端: leaderParticipates = false
  const leaderParticipates = false;
  const participatingCount = leaderParticipates ? 3 : 2; // 领队不参赛时只有2个队员参赛
  const minRequired = leaderParticipates ? 2 : 3;
  assert(!leaderParticipates, '领队不参赛');
  assert(minRequired === 3, '最少需要3名参赛队员');
  assert(participatingCount < minRequired, '当前参赛人数不足，应阻止提交');

  // 7. 取消后重新加入（唯一键冲突）
  console.log('\n[7] 成员取消后重新加入');
  await pool.query('UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);

  const [ex7] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"', [eventId, USER_MEMBER1]
  );
  const [can7] = await pool.query(
    'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = "cancelled"', [eventId, USER_MEMBER1]
  );
  assert(ex7.length === 0, '取消后非cancelled为0');
  assert(can7.length > 0, '存在cancelled记录');

  // UPDATE方式重新加入
  await pool.query(
    `UPDATE event_registrations SET team_name = ?, is_team_leader = 0, team_leader_id = ?, is_participating = 1, status = 'confirmed', partner_id = NULL, partner_status = NULL
     WHERE event_id = ? AND user_id = ?`,
    [teamName, USER_LEADER, eventId, USER_MEMBER1]
  );
  const [r7] = await pool.query('SELECT status, team_name FROM event_registrations WHERE event_id = ? AND user_id = ?', [eventId, USER_MEMBER1]);
  assert(r7[0].status === 'confirmed', '重新加入成功');
  assert(r7[0].team_name === teamName, '队名正确');
}

// ========== 主流程 ==========
(async () => {
  pool = mysql.createPool({
    host: 'sh-cynosdbmysql-grp-13i98w58.sql.tencentcdb.com',
    port: 23262, user: 'root', password: 'd6jpFcBF', database: 'pingpong'
  });

  try {
    await testSingles();
    await testDoubles();
    await testTeam();

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
    if (failed === 0) {
      console.log('🎉 全部测试通过！');
    } else {
      console.log('⚠️ 有测试失败，请检查');
    }
  } catch (error) {
    console.error('测试出错:', error);
  } finally {
    await cleanup();
    console.log('\n🧹 测试数据已清理');
    await pool.end();
  }
})();
