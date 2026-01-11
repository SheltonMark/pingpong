const { pool } = require('../config/database');

async function createTestUsers() {
  console.log('📝 创建测试学校...');
  await pool.execute(`
    INSERT IGNORE INTO schools (id, name, created_at) VALUES
    (1, '浙江工业大学', NOW()),
    (2, '杭州电子科技大学', NOW())
  `);

  console.log('👥 创建测试用户...');
  // 创建测试用户（模拟多个微信用户）
  await pool.execute(`
    INSERT IGNORE INTO users (id, openid, name, phone, school_id, user_type, gender, created_at) VALUES
    (1001, 'test_openid_1001', '张三', '13800001001', 1, 'student', 'male', NOW()),
    (1002, 'test_openid_1002', '李四', '13800001002', 1, 'student', 'male', NOW()),
    (1003, 'test_openid_1003', '王五', '13800001003', 1, 'student', 'female', NOW()),
    (1004, 'test_openid_1004', '赵六', '13800001004', 2, 'student', 'male', NOW()),
    (1005, 'test_openid_1005', '体育老师', '13800001005', 1, 'teacher', 'male', NOW()),
    (1006, 'test_openid_1006', '校队队长', '13800001006', 1, 'student', 'male', NOW())
  `);

  console.log('🔑 分配管理员权限...');
  // 获取角色ID
  const [[superAdminRole]] = await pool.execute(`SELECT id FROM roles WHERE code = 'super_admin'`);
  const [[schoolAdminRole]] = await pool.execute(`SELECT id FROM roles WHERE code = 'school_admin'`);

  if (superAdminRole) {
    // 创建超级管理员
    await pool.execute(`
      INSERT IGNORE INTO user_roles (user_id, role_id, created_at)
      VALUES (1001, ?, NOW())
    `, [superAdminRole.id]);
  }

  if (schoolAdminRole) {
    // 创建学校管理员
    await pool.execute(`
      INSERT IGNORE INTO user_roles (user_id, role_id, school_id, created_at)
      VALUES (1005, ?, 1, NOW())
    `, [schoolAdminRole.id]);
  }

  console.log('✅ 测试用户创建完成');
}

async function createTestEvents() {
  console.log('\n🏓 创建测试赛事...');

  // 1. 校内单打赛
  const [result1] = await pool.execute(`
    INSERT INTO events (
      title, description, event_type, event_format, scope,
      best_of, games_to_win, points_per_game, counts_for_ranking,
      event_start, event_end, registration_end,
      location, max_participants, school_id, created_by, status, created_at
    ) VALUES (
      '新生杯单打赛', '欢迎新生参加的单打比赛', 'singles', 'knockout', 'school',
      5, 3, 11, 1,
      DATE_ADD(NOW(), INTERVAL 7 DAY),
      DATE_ADD(NOW(), INTERVAL 8 DAY),
      DATE_ADD(NOW(), INTERVAL 6 DAY),
      '体育馆一楼', 16, 1, 1005, 'registration', NOW()
    )
  `);
  console.log(`  ✅ 校内单打赛 (ID: ${result1.insertId})`);

  // 2. 校内团体赛
  const [result2] = await pool.execute(`
    INSERT INTO events (
      title, description, event_type, event_format, scope,
      best_of, games_to_win, points_per_game, counts_for_ranking,
      event_start, event_end, registration_end,
      location, max_participants, school_id, created_by, status, created_at
    ) VALUES (
      '院系杯团体赛', '各学院代表队参加的团体赛', 'team', 'knockout', 'school',
      5, 3, 11, 0,
      DATE_ADD(NOW(), INTERVAL 10 DAY),
      DATE_ADD(NOW(), INTERVAL 11 DAY),
      DATE_ADD(NOW(), INTERVAL 8 DAY),
      '体育馆二楼', 8, 1, 1005, 'registration', NOW()
    )
  `);
  console.log(`  ✅ 校内团体赛 (ID: ${result2.insertId})`);

  // 3. 校际赛
  const [result3] = await pool.execute(`
    INSERT INTO events (
      title, description, event_type, event_format, scope,
      best_of, games_to_win, points_per_game, counts_for_ranking,
      event_start, event_end, registration_end,
      location, max_participants, created_by, status, created_at
    ) VALUES (
      '浙江省高校联赛', '全省高校乒乓球联赛', 'singles', 'round_robin', 'inter_school',
      7, 4, 11, 1,
      DATE_ADD(NOW(), INTERVAL 14 DAY),
      DATE_ADD(NOW(), INTERVAL 15 DAY),
      DATE_ADD(NOW(), INTERVAL 12 DAY),
      '省体育馆', 32, 1001, 'registration', NOW()
    )
  `);
  console.log(`  ✅ 校际单打赛 (ID: ${result3.insertId})`);

  return {
    schoolSinglesEventId: result1.insertId,
    schoolTeamEventId: result2.insertId,
    interSchoolEventId: result3.insertId
  };
}

async function simulateRegistrations(eventIds) {
  console.log('\n📝 模拟用户报名...');

  const { schoolSinglesEventId, interSchoolEventId } = eventIds;

  // 校内单打赛报名
  const users = [1001, 1002, 1003, 1006];
  for (const userId of users) {
    await pool.execute(`
      INSERT IGNORE INTO event_registrations (event_id, user_id, status, created_at)
      VALUES (?, ?, 'confirmed', NOW())
    `, [schoolSinglesEventId, userId]);
  }
  console.log(`  ✅ 校内单打赛：${users.length} 人报名`);

  // 校际赛报名
  const interSchoolUsers = [1001, 1002, 1004]; // 包含其他学校的学生
  for (const userId of interSchoolUsers) {
    await pool.execute(`
      INSERT IGNORE INTO event_registrations (event_id, user_id, status, created_at)
      VALUES (?, ?, 'confirmed', NOW())
    `, [interSchoolEventId, userId]);
  }
  console.log(`  ✅ 校际赛：${interSchoolUsers.length} 人报名`);
}

async function main() {
  try {
    console.log('🚀 开始生成测试数据...\n');

    await createTestUsers();
    const eventIds = await createTestEvents();
    await simulateRegistrations(eventIds);

    console.log('\n✅ 测试数据生成完成！');
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                      📋 测试账号信息                            ║
╠════════════════════════════════════════════════════════════════╣
║  👑 超级管理员                                                  ║
║     - 张三 (ID: 1001, 手机: 13800001001)                       ║
║                                                                ║
║  🏫 学校管理员（浙江工业大学）                                   ║
║     - 体育老师 (ID: 1005, 手机: 13800001005)                   ║
║                                                                ║
║  👥 普通用户（浙江工业大学）                                     ║
║     - 李四 (ID: 1002, 手机: 13800001002)                       ║
║     - 王五 (ID: 1003, 手机: 13800001003)                       ║
║     - 校队队长 (ID: 1006, 手机: 13800001006)                   ║
║                                                                ║
║  👥 普通用户（杭州电子科技大学）                                  ║
║     - 赵六 (ID: 1004, 手机: 13800001004)                       ║
╠════════════════════════════════════════════════════════════════╣
║                      🏓 测试赛事                                ║
╠════════════════════════════════════════════════════════════════╣
║  📍 校内赛事（浙江工业大学）                                     ║
║     1. 新生杯单打赛 (ID: ${eventIds.schoolSinglesEventId}) - 4人已报名                 ║
║     2. 院系杯团体赛 (ID: ${eventIds.schoolTeamEventId})                             ║
║                                                                ║
║  🌐 校际赛事                                                    ║
║     3. 浙江省高校联赛 (ID: ${eventIds.interSchoolEventId}) - 3人已报名              ║
╠════════════════════════════════════════════════════════════════╣
║                      🧪 测试场景                                ║
╠════════════════════════════════════════════════════════════════╣
║  ✅ 可以测试的功能：                                            ║
║     - 权限控制（超管、校管、普通用户）                           ║
║     - 赛事可见性（校内赛、校际赛）                              ║
║     - 报名功能（单打、团体赛）                                  ║
║     - 领队申请审批                                              ║
║     - 跨学校交互                                                ║
╚════════════════════════════════════════════════════════════════╝

📖 接下来可以：
  1. 使用 Postman 测试 API：导入 docs/testing/postman-collection.json
  2. 运行测试脚本：node scripts/test-event-flow.js
  3. 在小程序中启用调试模式，切换用户身份测试
  4. 访问后台管理：
     - 超管登录：user_id=1001（可以看到所有赛事）
     - 校管登录：user_id=1005（只能看到本校+校际赛事）
    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { createTestUsers, createTestEvents, simulateRegistrations };
