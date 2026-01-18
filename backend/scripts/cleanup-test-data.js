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
    // 1. 清理测试用户的赛事报名记录
    console.log(colors.blue('[1/5]') + ' 清理赛事报名记录...');
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

    // 2. 清理约球记录
    console.log(colors.blue('[2/5]') + ' 清理约球记录...');

    // 先获取测试用户创建的约球ID
    const [invitations] = await pool.query(
      'SELECT id FROM match_invitations WHERE creator_id IN (?)',
      [TEST_USER_IDS]
    );

    if (invitations.length > 0) {
      const invitationIds = invitations.map(i => i.id);

      // 删除约球参与者记录
      await pool.query(
        'DELETE FROM invitation_participants WHERE invitation_id IN (?)',
        [invitationIds]
      );

      // 删除约球记录
      await pool.query(
        'DELETE FROM match_invitations WHERE id IN (?)',
        [invitationIds]
      );

      console.log(colors.green(`  ✓ 已删除 ${invitations.length} 条约球记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 3. 清理比赛记录
    console.log(colors.blue('[3/5]') + ' 清理比赛记录...');

    // 获取测试用户参与的比赛ID
    const [matches] = await pool.query(
      'SELECT id FROM matches WHERE player1_id IN (?) OR player2_id IN (?)',
      [TEST_USER_IDS, TEST_USER_IDS]
    );

    if (matches.length > 0) {
      const matchIds = matches.map(m => m.id);

      // 删除比分记录
      await pool.query(
        'DELETE FROM match_scores WHERE match_id IN (?)',
        [matchIds]
      );

      // 删除比赛记录
      await pool.query(
        'DELETE FROM matches WHERE id IN (?)',
        [matchIds]
      );

      console.log(colors.green(`  ✓ 已删除 ${matches.length} 条比赛记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 4. 清理积分历史记录
    console.log(colors.blue('[4/5]') + ' 清理积分历史记录...');
    const [ratingHistory] = await pool.query(
      'SELECT COUNT(*) as count FROM rating_history WHERE user_id IN (?)',
      [TEST_USER_IDS]
    );

    if (ratingHistory[0].count > 0) {
      await pool.query(
        'DELETE FROM rating_history WHERE user_id IN (?)',
        [TEST_USER_IDS]
      );
      console.log(colors.green(`  ✓ 已删除 ${ratingHistory[0].count} 条积分历史记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    // 5. 清理领队申请记录
    console.log(colors.blue('[5/5]') + ' 清理领队申请记录...');
    const [captainApps] = await pool.query(
      'SELECT COUNT(*) as count FROM captain_applications WHERE user_id IN (?)',
      [TEST_USER_IDS]
    );

    if (captainApps[0].count > 0) {
      await pool.query(
        'DELETE FROM captain_applications WHERE user_id IN (?)',
        [TEST_USER_IDS]
      );
      console.log(colors.green(`  ✓ 已删除 ${captainApps[0].count} 条领队申请记录`));
    } else {
      console.log(colors.cyan('  - 无需清理'));
    }

    console.log('\n' + '='.repeat(60));
    console.log(colors.green('✓ 测试数据清理完成！'));
    console.log('='.repeat(60) + '\n');

    console.log(colors.yellow('提示: 现在可以重新运行测试脚本'));
    console.log('  node scripts/test-event-flow.js');
    console.log('  node scripts/test-invitation-flow.js\n');

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
