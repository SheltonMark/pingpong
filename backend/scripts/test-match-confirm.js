const { pool } = require('../config/database');
const { calculateMatchRating } = require('../utils/ratingCalculator');

async function updatePlayerRatings(eventId, matchId, winnerId, loserId) {
  // 获取双方当前积分
  const [players] = await pool.query(
    'SELECT id, points FROM users WHERE id IN (?, ?)',
    [winnerId, loserId]
  );

  if (players.length !== 2) {
    console.error('无法找到比赛双方选手');
    return;
  }

  const winnerData = players.find(p => p.id === winnerId);
  const loserData = players.find(p => p.id === loserId);

  const winnerPoints = winnerData.points || 0;
  const loserPoints = loserData.points || 0;

  // 计算积分变化
  const result = calculateMatchRating(winnerPoints, loserPoints);
  console.log('积分计算结果:', result);

  // 更新胜者积分和战绩
  await pool.execute(
    'UPDATE users SET points = points + ?, wins = wins + 1 WHERE id = ?',
    [result.winnerChange, winnerId]
  );

  // 更新败者积分和战绩
  await pool.execute(
    'UPDATE users SET points = points + ?, losses = losses + 1 WHERE id = ?',
    [result.loserChange, loserId]
  );

  console.log(`胜者(${winnerId}): +${result.winnerChange} 分`);
  console.log(`败者(${loserId}): ${result.loserChange} 分`);
}

async function test() {
  console.log('\n========== 模块1：赛事比赛积分测试（完整流程） ==========\n');

  // 记录测试前的积分
  console.log('=== 测试前用户积分 ===');
  const [before] = await pool.query('SELECT id, name, points, wins, losses FROM users WHERE id IN (1007, 1008)');
  console.table(before);

  // 创建新比赛
  console.log('\n--- 步骤1.4: 创建新比赛 (海中 vs 那图) ---');
  const [result] = await pool.execute(`
    INSERT INTO matches (event_id, player1_id, player2_id, round, match_order, status, created_at)
    VALUES (11, 1007, 1008, 2, 1, 'scheduled', NOW())
  `);
  const matchId = result.insertId;
  console.log('创建比赛成功，ID:', matchId);

  // 录入比分
  console.log('\n--- 步骤1.5: 录入比分 (海中 3:2 那图) ---');
  await pool.execute(`
    UPDATE matches SET
      player1_games = 3,
      player2_games = 2,
      status = 'pending_confirm'
    WHERE id = ?
  `, [matchId]);
  console.log('比分录入成功: 海中(1007) 3:2 那图(1008)');

  // 用户1007确认
  console.log('\n--- 步骤1.6: 用户1007(海中)确认 ---');
  await pool.execute('UPDATE matches SET player1_confirmed = 1 WHERE id = ?', [matchId]);
  console.log('用户1007确认成功');

  // 用户1008确认
  console.log('\n--- 步骤1.7: 用户1008(那图)确认 ---');
  await pool.execute('UPDATE matches SET player2_confirmed = 1 WHERE id = ?', [matchId]);
  console.log('用户1008确认成功');

  // 双方确认后处理
  const [match] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
  const m = match[0];
  console.log('\n比赛状态:', m.status, '| player1_confirmed:', m.player1_confirmed, '| player2_confirmed:', m.player2_confirmed);

  console.log('\n双方已确认，开始计算积分...');

  // 确定胜者和败者
  const winnerId = m.player1_games > m.player2_games ? m.player1_id : m.player2_id;
  const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id;
  console.log('胜者:', winnerId, '(海中) | 败者:', loserId, '(那图)');

  // 更新比赛状态
  await pool.execute('UPDATE matches SET status = "finished", winner_id = ?, finished_at = NOW() WHERE id = ?', [winnerId, matchId]);

  // 检查赛事是否计入排名
  const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [m.event_id]);
  const event = events[0];
  console.log('赛事:', event.title, '| 类型:', event.event_type, '| 计入排名:', event.counts_for_ranking);

  if (event.event_type === 'singles' && event.counts_for_ranking) {
    console.log('\n调用积分计算...');
    await updatePlayerRatings(m.event_id, matchId, winnerId, loserId);
    console.log('积分计算完成!');
  }

  // 验证积分变化
  console.log('\n=== 步骤1.8: 确认后用户积分 ===');
  const [after] = await pool.query('SELECT id, name, points, wins, losses FROM users WHERE id IN (1007, 1008)');
  console.table(after);

  // 计算变化
  console.log('\n=== 积分变化汇总 ===');
  for (let user of after) {
    const beforeUser = before.find(b => b.id === user.id);
    const pointsDiff = user.points - beforeUser.points;
    const sign = pointsDiff >= 0 ? '+' : '';
    console.log(`${user.name}: ${beforeUser.points} -> ${user.points} (${sign}${pointsDiff})`);
    console.log(`  战绩: ${beforeUser.wins}胜${beforeUser.losses}负 -> ${user.wins}胜${user.losses}负`);
  }

  console.log('\n✅ 模块1测试完成!');
  await pool.end();
}

test().catch(e => { console.error(e); process.exit(1); });
