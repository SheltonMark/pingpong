const { pool } = require('../config/database');

async function test() {
  console.log('\n========== 模块2：约球流程测试 ==========\n');

  // 记录测试前的积分
  console.log('=== 测试前用户积分 ===');
  const [before] = await pool.query('SELECT id, name, points, wins, losses FROM users WHERE id IN (1007, 1008)');
  console.table(before);

  // 步骤2.1 - 用户1007发起约球
  console.log('\n--- 步骤2.1: 用户1007(海中)发起约球 ---');
  const [invResult] = await pool.execute(`
    INSERT INTO match_invitations (
      creator_id, school_id, title, description,
      scheduled_time, location, max_participants, status, created_at
    ) VALUES (1007, 2, '周末约球', '来一场友谊赛',
      DATE_ADD(NOW(), INTERVAL 1 DAY), '体育馆', 2, 'open', NOW())
  `);
  const invitationId = invResult.insertId;
  console.log('约球创建成功，ID:', invitationId);

  // 步骤2.2 - 用户1008加入约球
  console.log('\n--- 步骤2.2: 用户1008(那图)加入约球 ---');
  await pool.execute(`
    INSERT INTO invitation_participants (invitation_id, user_id, status, joined_at)
    VALUES (?, 1008, 'confirmed', NOW())
  `, [invitationId]);
  console.log('用户1008加入成功');

  // 查看约球状态
  const [inv] = await pool.query('SELECT * FROM match_invitations WHERE id = ?', [invitationId]);
  console.log('约球状态:', inv[0].status);

  // 步骤2.3 - 开始比赛（创建match记录，但不关联event）
  console.log('\n--- 步骤2.3: 开始约球比赛 ---');
  const [matchResult] = await pool.execute(`
    INSERT INTO matches (
      invitation_id, player1_id, player2_id, status, created_at
    ) VALUES (?, 1007, 1008, 'scheduled', NOW())
  `, [invitationId]);
  const matchId = matchResult.insertId;
  console.log('约球比赛创建成功，ID:', matchId);

  // 更新约球状态
  await pool.execute('UPDATE match_invitations SET status = "ongoing" WHERE id = ?', [invitationId]);

  // 步骤2.4 - 录入比分
  console.log('\n--- 步骤2.4: 录入约球比分 (那图 3:1 海中) ---');
  await pool.execute(`
    UPDATE matches SET
      player1_games = 1,
      player2_games = 3,
      winner_id = 1008,
      status = 'pending_confirm'
    WHERE id = ?
  `, [matchId]);
  console.log('比分录入成功: 那图(1008) 3:1 海中(1007)');

  // 步骤2.5 - 双方确认
  console.log('\n--- 步骤2.5: 双方确认比分 ---');
  await pool.execute('UPDATE matches SET player1_confirmed = 1, player2_confirmed = 1 WHERE id = ?', [matchId]);
  console.log('双方确认成功');

  // 获取比赛信息
  const [match] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
  const m = match[0];

  // 检查是否关联赛事
  console.log('\n比赛信息:');
  console.log('  event_id:', m.event_id, '(null表示约球，不计入排名)');
  console.log('  invitation_id:', m.invitation_id);
  console.log('  winner_id:', m.winner_id, '(那图)');

  // 更新比赛状态为完成
  await pool.execute('UPDATE matches SET status = "finished", finished_at = NOW() WHERE id = ?', [matchId]);
  await pool.execute('UPDATE match_invitations SET status = "finished" WHERE id = ?', [invitationId]);

  // 步骤2.6 - 验证积分不变
  console.log('\n=== 步骤2.6: 验证积分不变 ===');
  const [after] = await pool.query('SELECT id, name, points, wins, losses FROM users WHERE id IN (1007, 1008)');
  console.table(after);

  // 检查积分变化
  console.log('\n=== 积分验证 ===');
  let pointsChanged = false;
  for (let user of after) {
    const beforeUser = before.find(b => b.id === user.id);
    if (user.points !== beforeUser.points) {
      pointsChanged = true;
      console.log(`❌ ${user.name}: 积分从 ${beforeUser.points} 变为 ${user.points}（不应变化！）`);
    } else {
      console.log(`✅ ${user.name}: 积分保持 ${user.points} 不变`);
    }
  }

  if (pointsChanged) {
    console.log('\n❌ 测试失败：约球不应影响积分！');
  } else {
    console.log('\n✅ 模块2测试通过：约球不计入排名积分！');
  }

  await pool.end();
}

test().catch(e => { console.error(e); process.exit(1); });
