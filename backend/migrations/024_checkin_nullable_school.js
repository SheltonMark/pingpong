const { pool } = require('../config/database');

async function up() {
  const connection = await pool.getConnection();
  try {
    // 允许 check_in_points.school_id 为 NULL（NULL 表示所有学校通用签到点）
    await connection.query('ALTER TABLE check_in_points MODIFY school_id INT NULL');
    console.log('  check_in_points.school_id now allows NULL');
  } catch (e) {
    // 可能已经是 NULL 了
    console.log('  check_in_points.school_id modify skipped:', e.message);
  } finally {
    connection.release();
  }
}

module.exports = { up };
