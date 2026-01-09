// 自动确认超时比分的定时任务
const { pool } = require('../config/database');

/**
 * 自动确认超过24小时未确认的比分
 * 规则：比分录入后24小时，如果一方已确认而另一方未确认，则自动确认
 */
async function autoConfirmScores() {
  try {
    console.log('[AutoConfirm] 开始检查超时比分...');

    // 查找超过24小时未完全确认的比赛
    const [matches] = await pool.query(`
      SELECT m.*,
        u1.name as player1_name, u2.name as player2_name
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      WHERE m.status = 'pending_confirm'
        AND m.updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND (m.player1_confirmed = 1 OR m.player2_confirmed = 1)
    `);

    if (matches.length === 0) {
      console.log('[AutoConfirm] 没有需要自动确认的比赛');
      return { confirmed: 0 };
    }

    console.log(`[AutoConfirm] 找到 ${matches.length} 场需要自动确认的比赛`);

    let confirmedCount = 0;

    for (const match of matches) {
      try {
        // 自动确认未确认的一方
        if (!match.player1_confirmed) {
          await pool.execute('UPDATE matches SET player1_confirmed = 1 WHERE id = ?', [match.id]);
        }
        if (!match.player2_confirmed) {
          await pool.execute('UPDATE matches SET player2_confirmed = 1 WHERE id = ?', [match.id]);
        }

        // 确定胜者
        const winnerId = match.player1_games > match.player2_games ? match.player1_id : match.player2_id;

        // 更新比赛状态为已完成
        await pool.execute(
          `UPDATE matches SET status = 'finished', winner_id = ?, finished_at = NOW() WHERE id = ?`,
          [winnerId, match.id]
        );

        // 如果是赛事比赛且计入积分，更新积分（约球不计积分）
        if (match.event_id) {
          const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [match.event_id]);
          if (events.length > 0 && events[0].event_type === 'singles' && events[0].counts_for_ranking) {
            // 这里可以调用积分计算函数
            console.log(`[AutoConfirm] 比赛 ${match.id} 需要计算积分`);
          }
        }

        confirmedCount++;
        console.log(`[AutoConfirm] 已自动确认比赛 ${match.id}: ${match.player1_name} vs ${match.player2_name}`);
      } catch (error) {
        console.error(`[AutoConfirm] 确认比赛 ${match.id} 失败:`, error.message);
      }
    }

    console.log(`[AutoConfirm] 完成，共自动确认 ${confirmedCount} 场比赛`);
    return { confirmed: confirmedCount };
  } catch (error) {
    console.error('[AutoConfirm] 任务执行失败:', error);
    throw error;
  }
}

module.exports = { autoConfirmScores };
