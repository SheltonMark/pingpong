const { pool } = require('../config/database');

async function test() {
  console.log('\n========== 模块3：排行榜同步测试 ==========\n');

  // 步骤3.1 - 查看全部排行
  console.log('--- 步骤3.1: 查看全部排行 ---');
  const [allRankings] = await pool.query(`
    SELECT
      u.id, u.name, u.points, u.wins, u.losses,
      s.name as school_name,
      ROUND(CASE WHEN (u.wins + u.losses) > 0
        THEN u.wins * 100.0 / (u.wins + u.losses)
        ELSE 0 END, 1) as win_rate
    FROM users u
    LEFT JOIN schools s ON u.school_id = s.id
    WHERE u.points > 0 OR u.wins > 0 OR u.losses > 0
    ORDER BY u.points DESC
    LIMIT 10
  `);
  console.log('全部排行榜 (前10名):');
  console.table(allRankings);

  // 步骤3.2 - 查看学校排行
  console.log('\n--- 步骤3.2: 查看浙大排行 (school_id=2) ---');
  const [schoolRankings] = await pool.query(`
    SELECT
      u.id, u.name, u.points, u.wins, u.losses,
      ROUND(CASE WHEN (u.wins + u.losses) > 0
        THEN u.wins * 100.0 / (u.wins + u.losses)
        ELSE 0 END, 1) as win_rate
    FROM users u
    WHERE u.school_id = 2
    AND (u.points > 0 OR u.wins > 0 OR u.losses > 0)
    ORDER BY u.points DESC
    LIMIT 10
  `);
  if (schoolRankings.length > 0) {
    console.log('浙大排行榜:');
    console.table(schoolRankings);
  } else {
    console.log('浙大暂无排名用户');
  }

  // 步骤3.3 - 验证胜率计算
  console.log('\n--- 步骤3.3: 验证胜率计算 ---');
  const testUsers = [1007, 1008];
  const [users] = await pool.query(`
    SELECT id, name, wins, losses,
      ROUND(CASE WHEN (wins + losses) > 0
        THEN wins * 100.0 / (wins + losses)
        ELSE 0 END, 1) as calculated_win_rate
    FROM users
    WHERE id IN (?, ?)
  `, testUsers);

  console.log('胜率验证:');
  for (const user of users) {
    const expectedWinRate = (user.wins + user.losses) > 0
      ? Math.round(user.wins * 1000 / (user.wins + user.losses)) / 10
      : 0;
    const match = user.calculated_win_rate == expectedWinRate;
    console.log(`  ${user.name}: ${user.wins}胜${user.losses}负 -> 胜率 ${user.calculated_win_rate}% ${match ? '✅' : '❌'}`);
    console.log(`    计算公式: ${user.wins}/(${user.wins}+${user.losses})*100 = ${expectedWinRate}%`);
  }

  // 验证排名顺序
  console.log('\n--- 验证排名顺序 ---');
  let isOrdered = true;
  for (let i = 0; i < allRankings.length - 1; i++) {
    if (allRankings[i].points < allRankings[i + 1].points) {
      isOrdered = false;
      console.log(`❌ 排名错误: ${allRankings[i].name}(${allRankings[i].points}) 排在 ${allRankings[i + 1].name}(${allRankings[i + 1].points}) 前面`);
    }
  }
  if (isOrdered) {
    console.log('✅ 排名顺序正确（按积分降序）');
  }

  console.log('\n✅ 模块3测试完成！');
  await pool.end();
}

test().catch(e => { console.error(e); process.exit(1); });
