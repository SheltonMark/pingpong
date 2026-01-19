/**
 * 诊断脚本 - 检查帖子和用户相关问题
 *
 * 使用方法：
 *   cd backend
 *   node scripts/diagnose-issues.js
 */

const { pool } = require('../config/database');

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

async function diagnose() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.yellow('  问题诊断工具'));
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 检查帖子状态分布
    console.log(colors.blue('[1/5]') + ' 检查帖子状态分布...');
    const [postStats] = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM posts
      GROUP BY status
    `);

    if (postStats.length === 0) {
      console.log(colors.yellow('  ! 没有任何帖子'));
    } else {
      console.log('  帖子状态分布:');
      postStats.forEach(row => {
        const statusText = row.status === 'active' ? colors.green(row.status) : colors.red(row.status);
        console.log(`    ${statusText}: ${row.count} 条`);
      });

      // 如果有非 active 的帖子，提示修复
      const nonActive = postStats.filter(r => r.status !== 'active');
      if (nonActive.length > 0) {
        console.log(colors.yellow('  ⚠ 发现非 active 状态的帖子！'));
        console.log(colors.cyan('  运行以下命令修复: node scripts/fix-post-status.js'));
      }
    }

    // 2. 检查帖子用户关联
    console.log('\n' + colors.blue('[2/5]') + ' 检查帖子用户关联...');
    const [orphanPosts] = await pool.query(`
      SELECT p.id, p.user_id, p.content, p.status
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE u.id IS NULL
    `);

    if (orphanPosts.length > 0) {
      console.log(colors.red(`  ✗ 发现 ${orphanPosts.length} 条孤立帖子（用户不存在）`));
      orphanPosts.slice(0, 5).forEach(p => {
        console.log(`    帖子 #${p.id}: user_id=${p.user_id}, status=${p.status}`);
      });
      if (orphanPosts.length > 5) {
        console.log(`    ... 还有 ${orphanPosts.length - 5} 条`);
      }
    } else {
      console.log(colors.green('  ✓ 所有帖子的用户都存在'));
    }

    // 3. 检查用户注册状态
    console.log('\n' + colors.blue('[3/5]') + ' 检查用户注册状态...');
    const [userStats] = await pool.query(`
      SELECT
        SUM(CASE WHEN is_registered = 1 THEN 1 ELSE 0 END) as registered,
        SUM(CASE WHEN is_registered = 0 OR is_registered IS NULL THEN 1 ELSE 0 END) as not_registered,
        COUNT(*) as total
      FROM users
    `);

    console.log(`  已注册用户: ${userStats[0].registered}`);
    console.log(`  未注册用户: ${userStats[0].not_registered}`);
    console.log(`  总用户数: ${userStats[0].total}`);

    // 4. 检查约球帖子关联
    console.log('\n' + colors.blue('[4/5]') + ' 检查约球帖子关联...');
    const [invitationStats] = await pool.query(`
      SELECT
        COUNT(*) as total_invitations,
        SUM(CASE WHEN post_id IS NOT NULL THEN 1 ELSE 0 END) as with_post,
        SUM(CASE WHEN post_id IS NULL THEN 1 ELSE 0 END) as standalone
      FROM match_invitations
    `);

    console.log(`  总约球数: ${invitationStats[0].total_invitations}`);
    console.log(`  关联帖子的约球: ${invitationStats[0].with_post}`);
    console.log(`  独立约球: ${invitationStats[0].standalone}`);

    // 5. 检查最近的帖子
    console.log('\n' + colors.blue('[5/5]') + ' 最近的帖子...');
    const [recentPosts] = await pool.query(`
      SELECT p.id, p.content, p.status, p.created_at, u.name as author_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 5
    `);

    if (recentPosts.length === 0) {
      console.log(colors.yellow('  没有帖子'));
    } else {
      console.log('  最近5条帖子:');
      recentPosts.forEach(p => {
        const statusText = p.status === 'active' ? colors.green(p.status) : colors.red(p.status);
        const authorText = p.author_name || colors.red('用户不存在');
        console.log(`    #${p.id} [${statusText}] ${authorText}: ${p.content.substring(0, 30)}...`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(colors.green('诊断完成'));
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error(colors.red('\n✗ 诊断失败:'), error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

diagnose();
