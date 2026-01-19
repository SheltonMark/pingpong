/**
 * 测试数据清理脚本
 *
 * 使用方法：
 *   cd backend
 *   node scripts/cleanup-test-data.js
 *
 * 功能：
 *   1. 清理测试用户的报名记录
 *   2. 清理测试创建的约球记录
 *   3. 清理测试比赛数据
 *   4. 清理帖子和评论数据（用于审核前清理）
 */

const { pool } = require('../config/database');

// 测试用户ID列表
const TEST_USER_IDS = [1001, 1002, 1003, 1004, 1005, 1006, 4, 5];

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

async function cleanupTestData() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.yellow('  测试数据清理工具'));
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 清理帖子相关数据（用于审核前清理）
    console.log(colors.blue('[1/7]') + ' 清理帖子评论...');
    const [comments] = await pool.query('SELECT COUNT(*) as count FROM post_comments');
    if (comments[0].count > 0) {
      await pool.query('DELETE FROM post_comments');
      console.log(colors.green(`  ✓ 已删除 ${comments[0].count} 条评论`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log(colors.blue('[2/7]') + ' 清理帖子点赞...');
    const [likes] = await pool.query('SELECT COUNT(*) as count FROM post_likes');
    if (likes[0].count > 0) {
      await pool.query('DELETE FROM post_likes');
      console.log(colors.green(`  ✓ 已删除 ${likes[0].count} 条点赞`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log(colors.blue('[3/7]') + ' 清理帖子图片...');
    const [images] = await pool.query('SELECT COUNT(*) as count FROM post_images');
    if (images[0].count > 0) {
      await pool.query('DELETE FROM post_images');
      console.log(colors.green(`  ✓ 已删除 ${images[0].count} 张图片记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log(colors.blue('[4/7]') + ' 清理帖子...');
    const [posts] = await pool.query('SELECT COUNT(*) as count FROM posts');
    if (posts[0].count > 0) {
      await pool.query('DELETE FROM posts');
      console.log(colors.green(`  ✓ 已删除 ${posts[0].count} 条帖子`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 2. 清理约球相关数据
    console.log(colors.blue('[5/7]') + ' 清理约球参与者...');
    const [participants] = await pool.query('SELECT COUNT(*) as count FROM invitation_participants');
    if (participants[0].count > 0) {
      await pool.query('DELETE FROM invitation_participants');
      console.log(colors.green(`  ✓ 已删除 ${participants[0].count} 条参与记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log(colors.blue('[6/7]') + ' 清理约球记录...');
    const [invitations] = await pool.query('SELECT COUNT(*) as count FROM match_invitations');
    if (invitations[0].count > 0) {
      await pool.query('DELETE FROM match_invitations');
      console.log(colors.green(`  ✓ 已删除 ${invitations[0].count} 条约球记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 3. 清理测试用户的其他数据
    console.log(colors.blue('[7/7]') + ' 清理测试用户报名记录...');
    const [registrations] = await pool.query(
      'SELECT COUNT(*) as count FROM event_registrations WHERE user_id IN (?)',
      [TEST_USER_IDS]
    );

    if (registrations[0].count > 0) {
      await pool.query(
        'DELETE FROM event_registrations WHERE user_id IN (?)',
        [TEST_USER_IDS]
      );
      console.log(colors.green(`  ✓ 已删除 ${registrations[0].count} 条报名记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log('\n' + '='.repeat(60));
    console.log(colors.green('✓ 测试数据清理完成！'));
    console.log('='.repeat(60) + '\n');

    console.log(colors.yellow('提示: 广场页面现在是干净的，可以提交审核了'));
    console.log('');

  } catch (error) {
    console.error(colors.red('\n✗ 清理失败:'), error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 运行清理
cleanupTestData();
