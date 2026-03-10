/**
 * 清空测试数据并导入学校/学院数据
 * 用法: node scripts/reset-and-import.js
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

// 从 table.md 解析学校和学院数据
function parseTableMd() {
  const content = fs.readFileSync(
    path.join(__dirname, '../../docs/table.md'),
    'utf-8'
  );

  const lines = content.split('\n').filter(line => line.startsWith('|'));
  // 跳过表头和分隔行
  const dataLines = lines.slice(2);

  return dataLines.map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    // cols: [序号, 高校名称, 简称, 省份, 城市, 用户名, 密码, 下设分院]
    const collegesStr = (cols[7] || '').replace(/。$/, '');
    const colleges = collegesStr
      .split('、')
      .map(c => c.trim())
      .filter(Boolean);

    return {
      name: cols[1],
      short_name: cols[2],
      province: cols[3],
      city: cols[4],
      admin_username: cols[5],
      admin_password: cols[6],
      colleges
    };
  });
}

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log('=== 开始清空数据 ===');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'subscription_logs', 'user_subscriptions',
      'invitation_participants', 'team_invitations',
      'match_scores', 'rating_history', 'rating_logs',
      'matches', 'event_registrations', 'captain_applications',
      'match_invitations',
      'announcements', 'events',
      'check_ins', 'check_in_points',
      'likes', 'comments', 'post_images', 'posts',
      'learning_materials',
      'user_roles', 'roles', 'users',
      'departments', 'colleges', 'schools'
    ];

    for (const table of tables) {
      try {
        const [result] = await connection.query(`DELETE FROM ${table}`);
        if (result.affectedRows > 0) {
          console.log(`  清空 ${table}: ${result.affectedRows} 行`);
        }
        // 重置自增ID
        await connection.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
      } catch (err) {
        // 表可能不存在，跳过
        console.log(`  跳过 ${table}: ${err.message}`);
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('=== 数据清空完成 ===\n');

    // 解析 table.md
    const schools = parseTableMd();
    console.log(`=== 开始导入 ${schools.length} 所学校 ===`);

    let totalColleges = 0;

    for (const school of schools) {
      // 插入学校
      const [result] = await connection.execute(
        `INSERT INTO schools (name, short_name, province, city) VALUES (?, ?, ?, ?)`,
        [school.name, school.short_name, school.province, school.city]
      );
      const schoolId = result.insertId;

      // 插入学院
      for (const college of school.colleges) {
        await connection.execute(
          `INSERT INTO colleges (school_id, name) VALUES (?, ?)`,
          [schoolId, college]
        );
        totalColleges++;
      }
    }

    console.log(`=== 导入完成: ${schools.length} 所学校, ${totalColleges} 个学院 ===`);
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
