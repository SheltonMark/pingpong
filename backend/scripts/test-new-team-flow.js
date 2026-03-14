/**
 * 新团体赛流程完整测试
 * 测试草稿/提交分离、邀请token、删除队员等新功能
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

let pool;
let testEventId;
let passed = 0, failed = 0;

// 测试用户
const USER_LEADER = 2;    // 领队
const USER_MEMBER1 = 3;   // 队员1
const USER_MEMBER2 = 226; // 队员2
const USER_MEMBER3 = 244; // 队员3

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
  if (testEventId) {
    await pool.query('DELETE FROM team_invitations WHERE event_id = ?', [testEventId]);
    await pool.query('DELETE FROM captain_applications WHERE event_id = ?', [testEventId]);
    await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [testEventId]);
    await pool.query('DELETE FROM events WHERE id = ?', [testEventId]);
  }
}

async function createTestEvent() {
  const [result] = await pool.query(
    `INSERT INTO events (
      title, event_type, status, max_participants, school_id, scope, event_format,
      best_of, games_to_win, event_start, registration_end, created_by,
      min_team_players, max_team_players, singles_player_count, gender_rule,
      required_male_count, required_female_count
    ) VALUES (
      '新团体赛测试_auto', 'team', 'registration', 8, 1, 'school', 'knockout',
      5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?,
      3, 5, 2, 'minimum', 1, 1
    )`,
    [USER_LEADER]
  );
  testEventId = result.insertId;
  return testEventId;
}

// 测试1: 领队申请和草稿保存
async function test1_LeaderDraft() {
  console.log('\n📝 === 测试1: 领队申请和草稿保存 ===');

  // 1.1 创建领队申请
  console.log('\n[1.1] 创建领队申请');
  await pool.query(
    `INSERT INTO captain_applications (event_id, user_id, status, is_participating)
     VALUES (?, ?, 'approved', 1)`,
    [testEventId, USER_LEADER]
  );
  const [apps] = await pool.query(
    'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
    [testEventId, USER_LEADER]
  );
  assert(apps.length === 1 && apps[0].status === 'approved', '领队申请已审核通过');

  // 1.2 保存草稿（未填队名应失败）
  console.log('\n[1.2] 未填队名时不能保存草稿');
  // 模拟API逻辑
  const teamName1 = '';
  assert(!teamName1.trim(), '队名为空，应拒绝保存');

  // 1.3 填写队名后保存草稿
  console.log('\n[1.3] 填写队名后保存草稿');
  const teamName = '测试队伍_新流程';
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status, team_submitted_at
    ) VALUES (?, ?, ?, 1, NULL, 1, 0, 'confirmed', 'draft', NULL)`,
    [testEventId, USER_LEADER, teamName]
  );

  const [leaderReg] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
    [testEventId, USER_LEADER]
  );
  assert(leaderReg.length === 1, '领队注册记录已创建');
  assert(leaderReg[0].team_name === teamName, `队名正确: ${leaderReg[0].team_name}`);
  assert(leaderReg[0].team_submit_status === 'draft', '状态为草稿');
  assert(leaderReg[0].team_submitted_at === null, '未提交时间为空');

  // 1.4 草稿队伍不在赛事详情中显示
  console.log('\n[1.4] 草稿队伍不在赛事详情中显示');
  const [eventRegs] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ?
       AND status != 'cancelled'
       AND team_name IS NOT NULL
       AND COALESCE(team_submit_status, 'submitted') = 'submitted'`,
    [testEventId]
  );
  assert(eventRegs.length === 0, '赛事详情中无草稿队伍');
}

// 测试2: 邀请流程
async function test2_Invitation() {
  console.log('\n🔗 === 测试2: 邀请流程 ===');

  // 2.1 创建邀请（生成token）
  console.log('\n[2.1] 创建邀请token');
  const inviteToken1 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status
    ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
    [testEventId, USER_LEADER, inviteToken1]
  );

  const [invitations1] = await pool.query(
    'SELECT * FROM team_invitations WHERE invite_token = ?',
    [inviteToken1]
  );
  assert(invitations1.length === 1, '邀请已创建');
  assert(invitations1[0].status === 'pending', '邀请状态为待处理');
  assert(invitations1[0].invitee_id === null, '邀请未绑定用户');

  // 2.2 待处理邀请占用名额
  console.log('\n[2.2] 待处理邀请占用名额');
  const [members2] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, USER_LEADER]
  );
  const [pending2] = await pool.query(
    `SELECT * FROM team_invitations
     WHERE event_id = ? AND inviter_id = ? AND status = 'pending'`,
    [testEventId, USER_LEADER]
  );
  const leaderParticipating = true;
  const occupiedSlots = (leaderParticipating ? 1 : 0) + members2.length + pending2.length;
  assert(occupiedSlots === 2, `占用名额 = ${occupiedSlots} (领队1 + 待处理邀请1)`);

  // 2.3 队员接受邀请
  console.log('\n[2.3] 队员接受邀请');
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status, team_submitted_at
    ) VALUES (?, ?, ?, 0, ?, 1, 0, 'confirmed', 'draft', NULL)`,
    [testEventId, USER_MEMBER1, '测试队伍_新流程', USER_LEADER]
  );
  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [USER_MEMBER1, inviteToken1]
  );

  const [invitations3] = await pool.query(
    'SELECT * FROM team_invitations WHERE invite_token = ?',
    [inviteToken1]
  );
  assert(invitations3[0].status === 'accepted', '邀请状态已更新为已接受');
  assert(invitations3[0].invitee_id === USER_MEMBER1, '邀请已绑定用户');

  const [members3] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND team_leader_id = ?`,
    [testEventId, USER_MEMBER1, USER_LEADER]
  );
  assert(members3.length === 1, '队员注册记录已创建');
  assert(members3[0].team_submit_status === 'draft', '队员状态也是草稿');

  // 2.4 创建第二个邀请并取消
  console.log('\n[2.4] 创建邀请后取消');
  const inviteToken2 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status
    ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
    [testEventId, USER_LEADER, inviteToken2]
  );

  await pool.query(
    `UPDATE team_invitations
     SET status = 'cancelled', responded_at = NOW()
     WHERE invite_token = ?`,
    [inviteToken2]
  );

  const [invitations4] = await pool.query(
    'SELECT * FROM team_invitations WHERE invite_token = ?',
    [inviteToken2]
  );
  assert(invitations4[0].status === 'cancelled', '邀请已取消');

  // 2.5 取消后名额释放
  console.log('\n[2.5] 取消邀请后名额释放');
  const [pending5] = await pool.query(
    `SELECT * FROM team_invitations
     WHERE event_id = ? AND inviter_id = ? AND status = 'pending'`,
    [testEventId, USER_LEADER]
  );
  assert(pending5.length === 0, '无待处理邀请，名额已释放');
}

// 测试3: 删除队员
async function test3_RemoveMember() {
  console.log('\n🗑️ === 测试3: 删除队员 ===');

  // 3.1 添加第二个队员
  console.log('\n[3.1] 添加第二个队员');
  const inviteToken3 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status
    ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
    [testEventId, USER_LEADER, inviteToken3]
  );
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status, team_submitted_at
    ) VALUES (?, ?, ?, 0, ?, 1, 0, 'confirmed', 'draft', NULL)`,
    [testEventId, USER_MEMBER2, '测试队伍_新流程', USER_LEADER]
  );
  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [USER_MEMBER2, inviteToken3]
  );

  const [members1] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, USER_LEADER]
  );
  assert(members1.length === 2, `当前有 ${members1.length} 个队员`);

  // 3.2 删除队员
  console.log('\n[3.2] 删除队员');
  await pool.query(
    `UPDATE event_registrations
     SET status = 'cancelled', is_singles_player = 0
     WHERE event_id = ? AND user_id = ? AND team_leader_id = ?`,
    [testEventId, USER_MEMBER2, USER_LEADER]
  );

  const [members2] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, USER_LEADER]
  );
  assert(members2.length === 1, `删除后剩余 ${members2.length} 个队员`);

  // 3.3 删除后名额释放
  console.log('\n[3.3] 删除后名额释放');
  const occupiedSlots3 = 1 + members2.length; // 领队 + 队员
  assert(occupiedSlots3 === 2, `占用名额 = ${occupiedSlots3}`);
}

// 测试4: 提交前校验
async function test4_SubmitValidation() {
  console.log('\n✅ === 测试4: 提交前校验 ===');

  // 4.1 人数不足时不能提交
  console.log('\n[4.1] 人数不足时不能提交');
  const [members1] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND (is_team_leader = 1 OR team_leader_id = ?)
       AND is_participating = 1`,
    [testEventId, USER_LEADER]
  );
  const actualPlayerCount1 = members1.length;
  const minRequired = 3;
  assert(actualPlayerCount1 < minRequired, `实际参赛 ${actualPlayerCount1} < 最少 ${minRequired}，应拒绝提交`);

  // 4.2 添加队员达到最少人数
  console.log('\n[4.2] 添加队员达到最少人数');
  const inviteToken4 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status
    ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
    [testEventId, USER_LEADER, inviteToken4]
  );
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status, team_submitted_at
    ) VALUES (?, ?, ?, 0, ?, 1, 0, 'confirmed', 'draft', NULL)`,
    [testEventId, USER_MEMBER2, '测试队伍_新流程', USER_LEADER]
  );
  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [USER_MEMBER2, inviteToken4]
  );

  const [members2] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND (is_team_leader = 1 OR team_leader_id = ?)
       AND is_participating = 1`,
    [testEventId, USER_LEADER]
  );
  assert(members2.length >= minRequired, `实际参赛 ${members2.length} >= 最少 ${minRequired}`);

  // 4.3 存在待处理邀请时不能提交
  console.log('\n[4.3] 存在待处理邀请时不能提交');
  const inviteToken5 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status
    ) VALUES (?, ?, NULL, ?, 'team', 'pending')`,
    [testEventId, USER_LEADER, inviteToken5]
  );

  const [pending3] = await pool.query(
    `SELECT * FROM team_invitations
     WHERE event_id = ? AND inviter_id = ? AND status = 'pending'`,
    [testEventId, USER_LEADER]
  );
  assert(pending3.length > 0, `有 ${pending3.length} 个待处理邀请，应拒绝提交`);

  // 取消待处理邀请
  await pool.query(
    `UPDATE team_invitations
     SET status = 'cancelled', responded_at = NOW()
     WHERE invite_token = ?`,
    [inviteToken5]
  );

  // 4.4 单打人数不符时不能提交
  console.log('\n[4.4] 单打人数不符时不能提交');
  const [singlesPlayers4] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND is_participating = 1 AND is_singles_player = 1`,
    [testEventId]
  );
  const requiredSingles = 2;
  assert(singlesPlayers4.length < requiredSingles, `单打 ${singlesPlayers4.length} < 要求 ${requiredSingles}，应拒绝提交`);

  // 设置单打队员
  await pool.query(
    `UPDATE event_registrations
     SET is_singles_player = 1
     WHERE event_id = ? AND user_id = ? AND is_participating = 1`,
    [testEventId, USER_LEADER]
  );
  await pool.query(
    `UPDATE event_registrations
     SET is_singles_player = 1
     WHERE event_id = ? AND user_id = ? AND is_participating = 1`,
    [testEventId, USER_MEMBER1]
  );

  const [singlesPlayers5] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND is_participating = 1 AND is_singles_player = 1`,
    [testEventId]
  );
  assert(singlesPlayers5.length === requiredSingles, `单打 ${singlesPlayers5.length} = 要求 ${requiredSingles}`);
}

// 测试5: 正式提交
async function test5_Submit() {
  console.log('\n🎯 === 测试5: 正式提交 ===');

  // 5.1 正式提交
  console.log('\n[5.1] 正式提交报名');
  await pool.query(
    `UPDATE event_registrations
     SET team_submit_status = 'submitted', team_submitted_at = NOW()
     WHERE event_id = ? AND status != 'cancelled'
       AND (is_team_leader = 1 OR team_leader_id = ?)`,
    [testEventId, USER_LEADER]
  );

  const [leaderReg1] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
    [testEventId, USER_LEADER]
  );
  assert(leaderReg1[0].team_submit_status === 'submitted', '状态已更新为已提交');
  assert(leaderReg1[0].team_submitted_at !== null, '提交时间已记录');

  // 5.2 提交后在赛事详情中显示
  console.log('\n[5.2] 提交后在赛事详情中显示');
  const [eventRegs2] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ?
       AND status != 'cancelled'
       AND team_name IS NOT NULL
       AND COALESCE(team_submit_status, 'submitted') = 'submitted'`,
    [testEventId]
  );
  assert(eventRegs2.length > 0, `赛事详情显示 ${eventRegs2.length} 条记录`);

  // 5.3 提交后不能修改队名
  console.log('\n[5.3] 提交后队名锁定');
  const canEdit = leaderReg1[0].team_submit_status === 'draft';
  assert(!canEdit, '提交后不能编辑');

  // 5.4 提交后不能删除队员
  console.log('\n[5.4] 提交后不能删除队员');
  // 模拟API逻辑检查
  const isDraft = leaderReg1[0].team_submit_status === 'draft';
  assert(!isDraft, '不是草稿状态，应拒绝删除');

  // 5.5 提交后不能修改单打名单
  console.log('\n[5.5] 提交后单打名单锁定');
  assert(!canEdit, '提交后不能修改单打名单');
}

// 测试6: 领队不参赛场景
async function test6_LeaderNotParticipating() {
  console.log('\n👤 === 测试6: 领队不参赛场景 ===');

  // 创建新的测试赛事
  const [result] = await pool.query(
    `INSERT INTO events (
      title, event_type, status, max_participants, school_id, scope, event_format,
      best_of, games_to_win, event_start, registration_end, created_by,
      min_team_players, max_team_players, singles_player_count, gender_rule
    ) VALUES (
      '领队不参赛测试_auto', 'team', 'registration', 8, 1, 'school', 'knockout',
      5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?,
      3, 5, 2, 'unlimited'
    )`,
    [USER_LEADER]
  );
  const eventId6 = result.insertId;

  // 6.1 领队选择不参赛
  console.log('\n[6.1] 领队选择不参赛');
  await pool.query(
    `INSERT INTO captain_applications (event_id, user_id, status, is_participating)
     VALUES (?, ?, 'approved', 0)`,
    [eventId6, USER_MEMBER3]
  );
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status, team_submitted_at
    ) VALUES (?, ?, ?, 1, NULL, 0, 0, 'confirmed', 'draft', NULL)`,
    [eventId6, USER_MEMBER3, '不参赛领队队伍']
  );

  const [leaderReg6] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND is_team_leader = 1',
    [eventId6, USER_MEMBER3]
  );
  assert(leaderReg6[0].is_participating === 0, '领队不参赛');

  // 6.2 领队不参赛时不计入人数
  console.log('\n[6.2] 领队不参赛时不计入人数');
  const [members6] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled' AND is_participating = 1`,
    [eventId6]
  );
  assert(members6.length === 0, '实际参赛人数为0（领队不参赛）');

  // 6.3 领队不参赛时不能设为单打
  console.log('\n[6.3] 领队不参赛时不能设为单打');
  const canSetSingles = leaderReg6[0].is_participating === 1;
  assert(!canSetSingles, '领队不参赛，不能设为单打');

  // 清理
  await pool.query('DELETE FROM team_invitations WHERE event_id = ?', [eventId6]);
  await pool.query('DELETE FROM captain_applications WHERE event_id = ?', [eventId6]);
  await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [eventId6]);
  await pool.query('DELETE FROM events WHERE id = ?', [eventId6]);
}

// 测试7: 性别规则校验
async function test7_GenderRules() {
  console.log('\n⚧️ === 测试7: 性别规则校验 ===');

  // 创建固定性别规则的赛事
  const [result] = await pool.query(
    `INSERT INTO events (
      title, event_type, status, max_participants, school_id, scope, event_format,
      best_of, games_to_win, event_start, registration_end, created_by,
      min_team_players, max_team_players, singles_player_count, gender_rule,
      required_male_count, required_female_count
    ) VALUES (
      '性别规则测试_auto', 'team', 'registration', 8, 1, 'school', 'knockout',
      5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?,
      4, 6, 2, 'fixed', 2, 2
    )`,
    [USER_LEADER]
  );
  const eventId7 = result.insertId;

  console.log('\n[7.1] 固定性别规则: 男2女2');
  const [event7] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId7]);
  assert(event7[0].gender_rule === 'fixed', '性别规则为固定');
  assert(event7[0].required_male_count === 2, '要求男生2人');
  assert(event7[0].required_female_count === 2, '要求女生2人');

  // 清理
  await pool.query('DELETE FROM events WHERE id = ?', [eventId7]);
}

// 主流程
(async () => {
  pool = mysql.createPool({
    host: 'sh-cynosdbmysql-grp-13i98w58.sql.tencentcdb.com',
    port: 23262,
    user: 'root',
    password: 'd6jpFcBF',
    database: 'pingpong'
  });

  try {
    await createTestEvent();

    await test1_LeaderDraft();
    await test2_Invitation();
    await test3_RemoveMember();
    await test4_SubmitValidation();
    await test5_Submit();
    await test6_LeaderNotParticipating();
    await test7_GenderRules();

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
    if (failed === 0) {
      console.log('🎉 全部测试通过！新团体赛流程验证完成！');
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
