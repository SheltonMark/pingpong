const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'sh-cynosdbmysql-grp-13i98w58.sql.tencentcdb.com',
    port: 23262,
    user: 'root',
    password: 'd6jpFcBF',
    database: 'pingpong'
  });

  try {
    console.log('=== 检查学校权限问题 ===\n');

    // 1. 检查学校列表
    const [schools] = await pool.query('SELECT id, name FROM schools ORDER BY id');
    console.log('学校列表:');
    schools.forEach(s => console.log(`  ${s.id}: ${s.name}`));

    // 2. 检查你的用户信息（假设你是用户ID 2或其他）
    console.log('\n请输入你的用户ID或手机号来检查:');
    console.log('（如果不知道，可以查询最近登录的用户）\n');

    // 查询最近的几个用户
    const [recentUsers] = await pool.query(
      'SELECT id, name, phone, school_id FROM users ORDER BY id DESC LIMIT 10'
    );
    console.log('最近的用户:');
    recentUsers.forEach(u => console.log(`  ID ${u.id}: ${u.name} (${u.phone}) - school_id: ${u.school_id}`));

    // 3. 检查校内赛事
    console.log('\n校内赛事列表:');
    const [events] = await pool.query(`
      SELECT e.id, e.title, e.scope, e.school_id, s.name as school_name
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      WHERE e.scope = 'school' AND e.status != 'draft'
      ORDER BY e.id DESC
      LIMIT 10
    `);
    events.forEach(e => console.log(`  赛事${e.id}: ${e.title} - ${e.school_name || '无学校'} (school_id: ${e.school_id})`));

    // 4. 模拟查询逻辑
    console.log('\n=== 模拟查询逻辑 ===');
    const testSchoolId = 1; // 假设浙大是school_id=1
    console.log(`\n假设用户school_id=${testSchoolId}，查询结果:`);

    const [filtered] = await pool.query(`
      SELECT e.id, e.title, e.scope, e.school_id, s.name as school_name
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      WHERE e.status != 'draft'
        AND (e.scope = 'inter_school' OR e.school_id IS NULL OR (e.scope = 'school' AND e.school_id = ?))
      ORDER BY e.id DESC
      LIMIT 10
    `, [testSchoolId]);

    filtered.forEach(e => console.log(`  赛事${e.id}: ${e.title} - ${e.school_name || '无学校'} (scope: ${e.scope})`));

  } catch (error) {
    console.error('查询失败:', error.message);
  } finally {
    await pool.end();
  }
})();
