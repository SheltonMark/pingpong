/**
 * 修复帖子状态脚本
 *
 * 将所有非 active 状态的帖子改为 active
 *
 * 使用方法：
 *   cd backend
 *   node scripts/fix-post-status.js
 */

const { pool } = require('../config/database');

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
};

async function fixPostStatus() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.yellow('  帖子状态修复工具'));
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 检查当前状态
    console.log(colors.blue('[1/3]') + ' 检查当前帖子状态...');
    const [before] = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM posts
      GROUP BY status
    `);

    if (before.length === 0) {
      console.log(colors.yellow('  没有任何帖子，无需修复'));
      return;
    }

    console.log('  修复前状态分布:');
    before.forEach(row => {
      console.log(`    ${row.status}: ${row.count} 条`);
    });

    // 2. 修复非 active 的帖子（不包括 deleted）
    console.log('\n' + colors.blue('[2/3]') + ' 修复帖子状态...');
    const [result] = await pool.execute(`
      UPDATE posts
      SET status = 'active'
      WHERE status = 'hidden'
    `);

    console.log(colors.green(`  ✓ 已修复 ${result.affectedRows} 条帖子`));

    // 3. 验证修复结果
    console.log('\n' + colors.blue('[3/3]') + ' 验证修复结果...');
    const [after] = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM posts
      GROUP BY status
    `);

    console.log('  修复后状态分布:');
    after.forEach(row => {
      console.log(`    ${row.status}: ${row.count} 条`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(colors.green('修复完成！刷新广场页面查看效果'));
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error(colors.red('\n✗ 修复失败:'), error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixPostStatus();
