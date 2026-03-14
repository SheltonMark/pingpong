// 测试团体赛项目分配功能
const { pool } = require('../config/database');

async function testProjectAssignment() {
  console.log('=== 开始测试团体赛项目分配功能 ===\n');

  try {
    // 1. 创建测试创建者
    console.log('1. 创建测试创建者...');
    const [creatorResult] = await pool.query(`
      INSERT INTO users (openid, name, gender, phone, created_at)
      VALUES (?, '测试管理员', 'male', '13800000000', NOW())
    `, [`test_creator_${Date.now()}`]);
    const creatorId = creatorResult.insertId;
    console.log(`✓ 创建者创建成功，ID: ${creatorId}\n`);

    // 2. 创建测试赛事
    console.log('2. 创建测试赛事...');
    const [eventResult] = await pool.query(`
      INSERT INTO events (
        title, event_type, event_format, scope, status,
        registration_start, registration_end, event_start, event_end,
        min_team_players, max_team_players, singles_player_count,
        team_event_config,
        created_by, created_at
      ) VALUES (
        '测试团体赛-项目分配', 'team', 'knockout', 'school', 'registration',
        NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), DATE_ADD(NOW(), INTERVAL 14 DAY), DATE_ADD(NOW(), INTERVAL 21 DAY),
        5, 8, 3,
        JSON_OBJECT(
          'projects', JSON_OBJECT(
            'men_singles', JSON_OBJECT('enabled', true, 'count', 2),
            'women_singles', JSON_OBJECT('enabled', true, 'count', 2),
            'men_doubles', JSON_OBJECT('enabled', true, 'count', 1),
            'women_doubles', JSON_OBJECT('enabled', false, 'count', 0),
            'mixed_doubles', JSON_OBJECT('enabled', true, 'count', 1)
          )
        ),
        ?, NOW()
      )
    `, [creatorId]);
    const eventId = eventResult.insertId;
    console.log(`✓ 赛事创建成功，ID: ${eventId}\n`);

    // 3. 创建测试用户
    console.log('3. 创建测试用户...');
    const users = [];
    for (let i = 1; i <= 6; i++) {
      const gender = i <= 3 ? 'male' : 'female';
      const [userResult] = await pool.query(`
        INSERT INTO users (openid, name, gender, phone, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [`test_openid_${Date.now()}_${i}`, `测试队员${i}`, gender, `1380000000${i}`]);
      users.push({ id: userResult.insertId, name: `测试队员${i}`, gender });
    }
    console.log(`✓ 创建了 ${users.length} 个测试用户\n`);

    // 4. 添加队员报名（包括队长）
    console.log('4. 添加队员报名...');
    const captainId = users[0].id;
    for (const user of users) {
      const isLeader = user.id === captainId;
      await pool.query(`
        INSERT INTO event_registrations (
          event_id, user_id, team_name, is_team_leader, is_participating,
          status, team_submit_status, registered_at
        ) VALUES (?, ?, '测试队伍', ?, 1, 'confirmed', 'submitted', NOW())
      `, [eventId, user.id, isLeader ? 1 : 0]);
    }
    console.log(`✓ ${users.length} 名队员报名成功\n`);

    // 5. 测试项目分配
    console.log('5. 测试项目分配...');
    const assignments = [
      { project: 'men_singles', position: 1, player_a: users[0].id },
      { project: 'men_singles', position: 2, player_a: users[1].id },
      { project: 'women_singles', position: 1, player_a: users[3].id },
      { project: 'women_singles', position: 2, player_a: users[4].id },
      { project: 'men_doubles', position: 1, player_a: users[0].id, player_b: users[2].id },
      { project: 'mixed_doubles', position: 1, player_a: users[1].id, player_b: users[5].id }
    ];

    for (const assignment of assignments) {
      await pool.query(`
        INSERT INTO team_project_assignments (
          event_id, team_name, project_type, position, player_a_id, player_b_id
        ) VALUES (?, '测试队伍', ?, ?, ?, ?)
      `, [
        eventId,
        assignment.project,
        assignment.position,
        assignment.player_a,
        assignment.player_b || null
      ]);
    }
    console.log(`✓ 项目分配保存成功\n`);

    // 6. 验证项目分配
    console.log('6. 验证项目分配...');
    const [savedAssignments] = await pool.query(`
      SELECT
        tpa.*,
        u1.name as player_a_name,
        u2.name as player_b_name
      FROM team_project_assignments tpa
      LEFT JOIN users u1 ON tpa.player_a_id = u1.id
      LEFT JOIN users u2 ON tpa.player_b_id = u2.id
      WHERE tpa.event_id = ? AND tpa.team_name = '测试队伍'
      ORDER BY tpa.project_type, tpa.position
    `, [eventId]);

    console.log('项目分配详情:');
    savedAssignments.forEach(a => {
      const playerB = a.player_b_name ? ` + ${a.player_b_name}` : '';
      console.log(`  ${getProjectLabel(a.project_type)} ${a.position}号位: ${a.player_a_name}${playerB}`);
    });
    console.log();

    // 7. 测试导出功能
    console.log('7. 测试导出功能...');
    const [exportData] = await pool.query(`
      SELECT er.*,
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
      ORDER BY er.team_submitted_at, er.registered_at, er.id
    `, [eventId]);

    // 构建导出数据
    const memberProjects = {};
    savedAssignments.forEach(a => {
      const label = a.project_type.includes('singles') ? a.position.toString() : `双${a.position}`;

      if (!memberProjects[a.player_a_id]) {
        memberProjects[a.player_a_id] = {};
      }
      memberProjects[a.player_a_id][a.project_type] = label;

      if (a.player_b_id) {
        if (!memberProjects[a.player_b_id]) {
          memberProjects[a.player_b_id] = {};
        }
        memberProjects[a.player_b_id][a.project_type] = label;
      }
    });

    console.log('导出数据预览:');
    console.log('姓名\t性别\t男单\t女单\t男双\t混双');
    exportData.forEach(row => {
      const projects = memberProjects[row.user_id] || {};
      console.log(`${row.name}\t${row.gender === 'male' ? '男' : '女'}\t${projects.men_singles || ''}\t${projects.women_singles || ''}\t${projects.men_doubles || ''}\t${projects.mixed_doubles || ''}`);
    });
    console.log();

    // 8. 清理测试数据
    console.log('8. 清理测试数据...');
    await pool.query('DELETE FROM team_project_assignments WHERE event_id = ?', [eventId]);
    await pool.query('DELETE FROM event_registrations WHERE event_id = ?', [eventId]);
    await pool.query('DELETE FROM events WHERE id = ?', [eventId]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[creatorId, ...users.map(u => u.id)]]);
    console.log('✓ 测试数据清理完成\n');

    console.log('=== 所有测试通过！ ===');
  } catch (error) {
    console.error('测试失败:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

function getProjectLabel(projectType) {
  const labels = {
    men_singles: '男单',
    women_singles: '女单',
    men_doubles: '男双',
    women_doubles: '女双',
    mixed_doubles: '混双'
  };
  return labels[projectType] || projectType;
}

testProjectAssignment().catch(console.error);
