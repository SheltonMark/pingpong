/**
 * 测试数据清理脚本
 *
 * 使用方法：
 *   cd backend
 *   node scripts/cleanup-test-data.js
 *
 * 功能：
 *   删除所有帖子和约球相关的测试数据
 */

const { pool } = require('../config/database');

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
    // 1. 清理约球参与者
    console.log(colors.blue('[1/6]') + ' 清理约球参与者...');
    const [participants] = await pool.query('SELECT COUNT(*) as count FROM invitation_participants');
    if (participants[0].count > 0) {
      await pool.query('DELETE FROM invitation_participants');
      console.log(colors.green(`  ✓ 已删除 ${participants[0].count} 条参与记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 2. 清理约球记录
    console.log(colors.blue('[2/6]') + ' 清理约球记录...');
    const [invitations] = await pool.query('SELECT COUNT(*) as count FROM match_invitations');
    if (invitations[0].count > 0) {
      await pool.query('DELETE FROM match_invitations');
      console.log(colors.green(`  ✓ 已删除 ${invitations[0].count} 条约球记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 3. 清理帖子评论
    console.log(colors.blue('[3/6]') + ' 清理帖子评论...');
    const [comments] = await pool.query('SELECT COUNT(*) as count FROM comments');
    if (comments[0].count > 0) {
      await pool.query('DELETE FROM comments');
      console.log(colors.green(`  ✓ 已删除 ${comments[0].count} 条评论`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 4. 清理帖子点赞
    console.log(colors.blue('[4/6]') + ' 清理帖子点赞...');
    const [likes] = await pool.query('SELECT COUNT(*) as count FROM likes');
    if (likes[0].count > 0) {
      await pool.query('DELETE FROM likes');
      console.log(colors.green(`  ✓ 已删除 ${likes[0].count} 条点赞`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 5. 清理帖子图片
    console.log(colors.blue('[5/6]') + ' 清理帖子图片...');
    const [images] = await pool.query('SELECT COUNT(*) as count FROM post_images');
    if (images[0].count > 0) {
      await pool.query('DELETE FROM post_images');
      console.log(colors.green(`  ✓ 已删除 ${images[0].count} 张图片记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 6. 清理帖子
    console.log(colors.blue('[6/6]') + ' 清理帖子...');
    const [posts] = await pool.query('SELECT COUNT(*) as count FROM posts');
    if (posts[0].count > 0) {
      await pool.query('DELETE FROM posts');
      console.log(colors.green(`  ✓ 已删除 ${posts[0].count} 条帖子`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log('\n' + '='.repeat(60));
    console.log(colors.green('✓ 测试数据清理完成！'));
    console.log('='.repeat(60) + '\n');

    console.log(colors.yellow('提示: 广场页面现在是干净的'));
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
