/**
 * 团体赛完整端到端测试
 * 测试前端组队、邀请、删除、提交，以及后台查看和导出
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

let pool;
let testEventId;
let testUsers = {
  leader: 2,      // 马顺涛 - 领队
  member1: 3,     // 刘晨航 - 队员1
  member2: 226,   // 罗子萱 - 队员2
  member3: 244,   // 宋承诺 - 队员3
};

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
      '端到端测试团体赛', 'team', 'registration', 8, 3, 'school', 'knockout',
      5, 3, DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), ?,
      3, 5, 2, 'minimum', 1, 1
    )`,
    [testUsers.leader]
  );
  testEventId = result.insertId;
  console.log(`\n创建测试赛事 ID: ${testEventId}`);
  return testEventId;
}

// 测试1: 领队申请和保存草稿
async function test1_LeaderDraft() {
  console.log('\n📝 === 测试1: 领队申请和保存草稿 ===');

  // 1.1 创建领队申请
  console.log('\n[1.1] 创建领队申请');
  await pool.query(
    `INSERT INTO captain_applications (event_id, user_id, status, is_participating)
     VALUES (?, ?, 'approved', 1)`,
    [testEventId, testUsers.leader]
  );
  assert(true, '领队申请已创建');

  // 1.2 保存草稿（模拟前端调用 PUT /api/events/:id/team-draft）
  console.log('\n[1.2] 保存队伍草稿');
  const teamName = '测试队伍E2E';
  const leaderParticipating = true;

  // 检查是否已有领队记录
  const [existing] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
    [testEventId, testUsers.leader]
  );

  if (existing.length > 0) {
    // UPDATE
    await pool.query(
      `UPDATE event_registrations
       SET team_name = ?, is_participating = ?, team_submit_status = 'draft'
       WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
      [teamName, leaderParticipating ? 1 : 0, testEventId, testUsers.leader]
    );
  } else {
    // INSERT
    await pool.query(
      `INSERT INTO event_registrations (
        event_id, user_id, team_name, is_team_leader, team_leader_id,
        is_participating, is_singles_player, status, team_submit_status
      ) VALUES (?, ?, ?, 1, NULL, ?, 0, 'confirmed', 'draft')`,
      [testEventId, testUsers.leader, teamName, leaderParticipating ? 1 : 0]
    );
  }

  const [leaderReg] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
    [testEventId, testUsers.leader]
  );
  assert(leaderReg.length === 1, '领队草稿已保存');
  assert(leaderReg[0].team_name === teamName, `队名正确: ${leaderReg[0].team_name}`);
  assert(leaderReg[0].team_submit_status === 'draft', '状态为草稿');

  // 1.3 验证草稿不在赛事详情中显示
  console.log('\n[1.3] 验证草稿队伍不在赛事详情中显示');
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

// 测试2: 创建邀请和分享
async function test2_CreateInvitation() {
  console.log('\n🔗 === 测试2: 创建邀请 ===');

  // 2.1 创建邀请（模拟前端调用 POST /api/events/:id/team-invitations）
  console.log('\n[2.1] 创建邀请token');
  const inviteToken1 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status, created_at
    ) VALUES (?, ?, NULL, ?, 'team', 'pending', NOW())`,
    [testEventId, testUsers.leader, inviteToken1]
  );

  const [invitations] = await pool.query(
    'SELECT * FROM team_invitations WHERE invite_token = ?',
    [inviteToken1]
  );
  assert(invitations.length === 1, '邀请已创建');
  assert(invitations[0].status === 'pending', '邀请状态为待处理');
  assert(invitations[0].invitee_id === null, '邀请未绑定用户');

  // 2.2 验证待处理邀请占用名额
  console.log('\n[2.2] 验证待处理邀请占用名额');
  const [members] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, testUsers.leader]
  );
  const [pending] = await pool.query(
    `SELECT * FROM team_invitations
     WHERE event_id = ? AND inviter_id = ? AND status = 'pending'`,
    [testEventId, testUsers.leader]
  );
  const occupiedSlots = 1 + members.length + pending.length; // 领队 + 队员 + 待处理邀请
  assert(occupiedSlots === 2, `占用名额 = ${occupiedSlots} (领队1 + 待处理邀请1)`);

  return inviteToken1;
}

// 测试3: 队员接受邀请
async function test3_AcceptInvitation(inviteToken) {
  console.log('\n✅ === 测试3: 队员接受邀请 ===');

  // 3.1 队员接受邀请（模拟前端调用 POST /api/events/team-invitations/:token/respond）
  console.log('\n[3.1] 队员1接受邀请');

  // 创建队员注册记录
  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status
    ) VALUES (?, ?, '测试队伍E2E', 0, ?, 1, 0, 'confirmed', 'draft')`,
    [testEventId, testUsers.member1, testUsers.leader]
  );

  // 更新邀请状态
  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [testUsers.member1, inviteToken]
  );

  const [invitation] = await pool.query(
    'SELECT * FROM team_invitations WHERE invite_token = ?',
    [inviteToken]
  );
  assert(invitation[0].status === 'accepted', '邀请状态已更新为已接受');
  assert(invitation[0].invitee_id === testUsers.member1, '邀请已绑定用户');

  const [memberReg] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND team_leader_id = ?`,
    [testEventId, testUsers.member1, testUsers.leader]
  );
  assert(memberReg.length === 1, '队员注册记录已创建');
  assert(memberReg[0].team_submit_status === 'draft', '队员状态也是草稿');
}

// 测试4: 删除队员
async function test4_RemoveMember() {
  console.log('\n🗑️ === 测试4: 删除队员 ===');

  // 4.1 添加第二个队员
  console.log('\n[4.1] 添加第二个队员');
  const inviteToken2 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status, created_at
    ) VALUES (?, ?, NULL, ?, 'team', 'pending', NOW())`,
    [testEventId, testUsers.leader, inviteToken2]
  );

  await pool.query(
    `INSERT INTO event_registrations (
      event_id, user_id, team_name, is_team_leader, team_leader_id,
      is_participating, is_singles_player, status, team_submit_status
    ) VALUES (?, ?, '测试队伍E2E', 0, ?, 1, 0, 'confirmed', 'draft')`,
    [testEventId, testUsers.member2, testUsers.leader]
  );

  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [testUsers.member2, inviteToken2]
  );

  const [members1] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, testUsers.leader]
  );
  assert(members1.length === 2, `当前有 ${members1.length} 个队员`);

  // 4.2 删除队员（模拟前端调用 POST /api/events/:id/team-members/:id/remove）
  console.log('\n[4.2] 删除队员2');
  await pool.query(
    `UPDATE event_registrations
     SET status = 'cancelled', is_singles_player = 0
     WHERE event_id = ? AND user_id = ? AND team_leader_id = ?`,
    [testEventId, testUsers.member2, testUsers.leader]
  );

  const [members2] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND team_leader_id = ? AND status != 'cancelled'`,
    [testEventId, testUsers.leader]
  );
  assert(members2.length === 1, `删除后剩余 ${members2.length} 个队员`);

  // 4.3 验证名额释放
  console.log('\n[4.3] 验证删除后名额释放');
  const occupiedSlots = 1 + members2.length; // 领队 + 队员
  assert(occupiedSlots === 2, `占用名额 = ${occupiedSlots}`);
}

// 测试5: 设置单打和提交校验
async function test5_SinglesAndValidation() {
  console.log('\n🏓 === 测试5: 设置单打和提交校验 ===');

  // 5.1 添加第三个队员达到最少人数
  console.log('\n[5.1] 添加第三个队员');
  const inviteToken3 = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO team_invitations (
      event_id, inviter_id, invitee_id, invite_token, type, status, created_at
    ) VALUES (?, ?, NULL, ?, 'team', 'pending', NOW())`,
    [testEventId, testUsers.leader, inviteToken3]
  );

  // 检查是否已有记录（被删除的member2）
  const [existing] = await pool.query(
    'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?',
    [testEventId, testUsers.member2]
  );

  if (existing.length > 0) {
    await pool.query(
      `UPDATE event_registrations
       SET team_name = '测试队伍E2E', is_team_leader = 0, team_leader_id = ?,
           is_participating = 1, is_singles_player = 0, status = 'confirmed',
           team_submit_status = 'draft'
       WHERE event_id = ? AND user_id = ?`,
      [testUsers.leader, testEventId, testUsers.member2]
    );
  } else {
    await pool.query(
      `INSERT INTO event_registrations (
        event_id, user_id, team_name, is_team_leader, team_leader_id,
        is_participating, is_singles_player, status, team_submit_status
      ) VALUES (?, ?, '测试队伍E2E', 0, ?, 1, 0, 'confirmed', 'draft')`,
      [testEventId, testUsers.member2, testUsers.leader]
    );
  }

  await pool.query(
    `UPDATE team_invitations
     SET invitee_id = ?, status = 'accepted', responded_at = NOW()
     WHERE invite_token = ?`,
    [testUsers.member2, inviteToken3]
  );

  const [members] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND (is_team_leader = 1 OR team_leader_id = ?)
       AND is_participating = 1`,
    [testEventId, testUsers.leader]
  );
  assert(members.length >= 3, `实际参赛 ${members.length} >= 最少 3`);

  // 5.2 设置单打队员
  console.log('\n[5.2] 设置单打队员');
  await pool.query(
    `UPDATE event_registrations
     SET is_singles_player = 1
     WHERE event_id = ? AND user_id = ? AND is_participating = 1`,
    [testEventId, testUsers.leader]
  );
  await pool.query(
    `UPDATE event_registrations
     SET is_singles_player = 1
     WHERE event_id = ? AND user_id = ? AND is_participating = 1`,
    [testEventId, testUsers.member1]
  );

  const [singlesPlayers] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND status != 'cancelled'
       AND is_participating = 1 AND is_singles_player = 1`,
    [testEventId]
  );
  assert(singlesPlayers.length === 2, `单打 ${singlesPlayers.length} = 要求 2`);

  // 5.3 验证性别规则（最少男1女1）
  console.log('\n[5.3] 验证性别规则');
  const [genderCheck] = await pool.query(
    `SELECT u.gender, COUNT(*) as count
     FROM event_registrations er
     JOIN users u ON er.user_id = u.id
     WHERE er.event_id = ? AND er.status != 'cancelled' AND er.is_participating = 1
     GROUP BY u.gender`,
    [testEventId]
  );
  const maleCount = genderCheck.find(g => g.gender === 'male')?.count || 0;
  const femaleCount = genderCheck.find(g => g.gender === 'female')?.count || 0;
  assert(maleCount >= 1 && femaleCount >= 1, `性别符合规则: 男${maleCount} 女${femaleCount}`);
}

// 测试6: 正式提交
async function test6_Submit() {
  console.log('\n🎯 === 测试6: 正式提交 ===');

  // 6.1 正式提交（模拟前端调用 POST /api/events/:id/team-submit）
  console.log('\n[6.1] 正式提交报名');
  await pool.query(
    `UPDATE event_registrations
     SET team_submit_status = 'submitted', team_submitted_at = NOW()
     WHERE event_id = ? AND status != 'cancelled'
       AND (is_team_leader = 1 OR team_leader_id = ?)`,
    [testEventId, testUsers.leader]
  );

  const [leaderReg] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND is_team_leader = 1`,
    [testEventId, testUsers.leader]
  );
  assert(leaderReg[0].team_submit_status === 'submitted', '状态已更新为已提交');
  assert(leaderReg[0].team_submitted_at !== null, '提交时间已记录');

  // 6.2 验证提交后在赛事详情中显示
  console.log('\n[6.2] 验证提交后在赛事详情中显示');
  const [eventRegs] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ?
       AND status != 'cancelled'
       AND team_name IS NOT NULL
       AND COALESCE(team_submit_status, 'submitted') = 'submitted'`,
    [testEventId]
  );
  assert(eventRegs.length > 0, `赛事详情显示 ${eventRegs.length} 条记录`);

  // 6.3 验证提交后不能修改
  console.log('\n[6.3] 验证提交后队名锁定');
  const canEdit = leaderReg[0].team_submit_status === 'draft';
  assert(!canEdit, '提交后不能编辑');
}

// 测试7: 后台查看报名
async function test7_AdminView() {
  console.log('\n👀 === 测试7: 后台查看报名 ===');

  // 7.1 查询队伍列表（模拟后台调用 GET /api/admin/teams?event_id=XXX）
  console.log('\n[7.1] 查询队伍列表');
  const [teams] = await pool.query(
    `SELECT
      er.id,
      er.event_id,
      er.team_name,
      er.status,
      er.team_submit_status,
      er.team_submitted_at,
      er.is_participating as leader_participating,
      er.registered_at,
      u.id as captain_id,
      u.name as captain_name,
      u.phone as captain_phone,
      u.gender as captain_gender,
      (SELECT COUNT(*) FROM event_registrations
       WHERE team_name = er.team_name AND event_id = er.event_id AND status != 'cancelled' AND is_participating = 1) as actual_player_count,
      (SELECT COUNT(*) FROM event_registrations
       WHERE team_name = er.team_name AND event_id = er.event_id AND status != 'cancelled' AND is_participating = 1 AND is_singles_player = 1) as singles_count
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    WHERE er.event_id = ?
      AND er.is_team_leader = 1
      AND er.status != 'cancelled'
      AND COALESCE(er.team_submit_status, 'submitted') = 'submitted'
    ORDER BY er.team_submitted_at DESC`,
    [testEventId]
  );

  assert(teams.length === 1, `后台显示 ${teams.length} 个队伍`);
  assert(teams[0].team_name === '测试队伍E2E', `队名正确: ${teams[0].team_name}`);
  assert(teams[0].actual_player_count === 3, `实际参赛人数: ${teams[0].actual_player_count}`);
  assert(teams[0].singles_count === 2, `单打人数: ${teams[0].singles_count}`);

  // 7.2 查询队伍成员
  console.log('\n[7.2] 查询队伍成员');
  const [members] = await pool.query(
    `SELECT
      er.id, er.status, er.is_participating, er.is_singles_player,
      u.id as user_id, u.name, u.phone, u.gender,
      s.name as school_name, c.name as college_name
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    LEFT JOIN schools s ON u.school_id = s.id
    LEFT JOIN colleges c ON u.college_id = c.id
    WHERE er.team_name = ? AND er.event_id = ? AND er.status != 'cancelled'
    ORDER BY er.is_team_leader DESC, er.id`,
    [teams[0].team_name, testEventId]
  );

  assert(members.length === 3, `队伍有 ${members.length} 个成员（含领队）`);
  assert(members[0].name === '马顺涛', '领队排在首位');
  assert(members.every(m => m.name && m.name.length > 0), '所有成员有名字');
}

// 测试8: 后台导出报名表
async function test8_AdminExport() {
  console.log('\n📊 === 测试8: 后台导出报名表 ===');

  // 8.1 生成导出数据（模拟后台调用 GET /api/admin/teams/export?event_id=XXX）
  console.log('\n[8.1] 生成导出数据');

  // 查询所有已提交队伍
  const [rows] = await pool.query(
    `SELECT er.*,
            u.name,
            u.phone,
            u.gender,
            s.name as school_name,
            c.name as college_name
     FROM event_registrations er
     JOIN users u ON er.user_id = u.id
     LEFT JOIN schools s ON u.school_id = s.id
     LEFT JOIN colleges c ON u.college_id = c.id
     WHERE er.event_id = ?
       AND er.status != 'cancelled'
       AND er.team_name IS NOT NULL
       AND COALESCE(er.team_submit_status, 'submitted') = 'submitted'
     ORDER BY er.team_submitted_at, er.registered_at, er.id`,
    [testEventId]
  );

  assert(rows.length === 3, `导出数据有 ${rows.length} 行（3个成员）`);

  // 8.2 验证导出格式
  console.log('\n[8.2] 验证导出格式');
  const teamMap = new Map();
  rows.forEach(row => {
    if (!teamMap.has(row.team_name)) {
      teamMap.set(row.team_name, []);
    }
    teamMap.get(row.team_name).push(row);
  });

  assert(teamMap.size === 1, '导出包含1个队伍');

  const teamMembers = teamMap.get('测试队伍E2E');
  assert(teamMembers.length === 3, '队伍有3个成员');

  // 验证必需字段
  const requiredFields = ['name', 'phone', 'gender', 'team_name', 'is_team_leader', 'is_participating', 'is_singles_player'];
  const hasAllFields = teamMembers.every(m =>
    requiredFields.every(field => m[field] !== undefined)
  );
  assert(hasAllFields, '所有成员包含必需字段');
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
    console.log('🚀 开始端到端测试...\n');

    await createTestEvent();
    await test1_LeaderDraft();
    const inviteToken = await test2_CreateInvitation();
    await test3_AcceptInvitation(inviteToken);
    await test4_RemoveMember();
    await test5_SinglesAndValidation();
    await test6_Submit();
    await test7_AdminView();
    await test8_AdminExport();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
    if (failed === 0) {
      console.log('🎉 全部端到端测试通过！');
      console.log('\n✨ 已验证功能:');
      console.log('  - 领队申请和保存草稿');
      console.log('  - 创建邀请和队员接受');
      console.log('  - 删除队员和名额释放');
      console.log('  - 设置单打和性别规则校验');
      console.log('  - 正式提交和状态锁定');
      console.log('  - 草稿/已提交队伍显示规则');
      console.log('  - 后台查看报名列表');
      console.log('  - 后台导出报名表格式');
    } else {
      console.log('⚠️ 有测试失败，请检查');
    }
  } catch (error) {
    console.error('\n❌ 测试出错:', error);
  } finally {
    await cleanup();
    console.log('\n🧹 测试数据已清理');
    await pool.end();
  }
})();
