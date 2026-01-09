// backend/routes/events.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { calculateMatchRating } = require('../utils/ratingCalculator');

// 将相对URL转为完整URL
function toFullUrl(url, req) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    baseUrl = `${protocol}://${host}`;
  }
  return baseUrl + url;
}

// 处理description中的图片URL
function processDescription(description, req) {
  if (!description) return description;

  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    baseUrl = `${protocol}://${host}`;
  }

  // 替换 src="/uploads/..." 为完整URL
  let processed = description.replace(/src="(\/uploads\/[^"]+)"/g, `src="${baseUrl}$1"`);

  // 处理纯文本形式的图片路径（之前错误存储的数据）
  // 将 /uploads/xxx.jpg 转换为 <img src="...">
  processed = processed.replace(/(?<![">])(\/uploads\/[\w\-\.]+\.(jpg|jpeg|png|gif|webp))/gi, (match) => {
    return `<img src="${baseUrl}${match}" style="max-width:100%">`;
  });

  return processed;
}

// 动态计算赛事状态
function computeEventStatus(event) {
  const now = new Date();
  const regEnd = event.registration_end ? new Date(event.registration_end) : null;
  const eventEnd = event.event_end ? new Date(event.event_end) : null;
  const eventStart = event.event_start ? new Date(event.event_start) : null;
  
  // 草稿和取消状态不变
  if (event.status === 'draft' || event.status === 'cancelled') {
    return event.status;
  }
  
  // 已手动设为已结束的不变
  if (event.status === 'finished') {
    return 'finished';
  }
  
  // 动态判断
  if (eventEnd && now >= eventEnd) {
    return 'finished';
  }
  if (regEnd && now >= regEnd) {
    return 'ongoing';
  }
  if (event.participant_count >= event.max_participants) {
    return 'ongoing'; // 人满也变进行中
  }
  
  return 'registration';
}

// 获取赛事列表
router.get('/', async (req, res) => {
  try {
    const { school_id, status, event_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT e.*, s.name as school_name, u.name as creator_name,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != 'cancelled') as participant_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.status != 'draft'
    `;
    const params = [];

    if (school_id) {
      // 校际赛对所有人可见，校内赛只对本校用户可见
      sql += " AND (e.scope = 'inter_school' OR (e.scope = 'school' AND e.school_id = ?))";
      params.push(school_id);
    }
    if (status) {
      sql += ' AND e.status = ?';
      params.push(status);
    }
    if (event_type) {
      sql += ' AND e.event_type = ?';
      params.push(event_type);
    }

    sql += ' ORDER BY e.event_start DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(sql, params);

    // 获取总数
    let countSql = "SELECT COUNT(*) as total FROM events WHERE status != 'draft'";
    const countParams = [];
    if (school_id) {
      countSql += " AND (scope = 'inter_school' OR (scope = 'school' AND school_id = ?))";
      countParams.push(school_id);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (event_type) {
      countSql += ' AND event_type = ?';
      countParams.push(event_type);
    }
    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      success: true,
      data: {
        list: rows.map(e => ({ ...e, status: computeEventStatus(e) })),
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取赛事列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取赛事详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [events] = await pool.query(`
      SELECT e.*, s.name as school_name, u.name as creator_name,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != 'cancelled') as participant_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `, [id]);

    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    // 动态计算状态
    const event = events[0];
    event.status = computeEventStatus(event);
    // 处理description中的图片URL
    event.description = processDescription(event.description, req);

    // 获取报名列表
    const [registrations] = await pool.query(`
      SELECT er.*, u.name, u.avatar_url, u.college_id, c.name as college_name
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE er.event_id = ? AND er.status != 'cancelled'
      ORDER BY er.registered_at
    `, [id]);

    res.json({
      success: true,
      data: {
        event,
        registrations
      }
    });
  } catch (error) {
    console.error('获取赛事详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 报名赛事
router.post('/:id/register', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, partner_id, team_name } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查赛事是否存在
    const [events] = await pool.query(
      'SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != "cancelled") as participant_count FROM events e WHERE e.id = ?',
      [id]
    );

    if (events.length === 0) {
      return res.status(400).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    
    // 检查赛事状态
    if (event.status === 'draft') {
      return res.status(400).json({ success: false, message: '赛事尚未发布' });
    }
    if (event.status === 'cancelled') {
      return res.status(400).json({ success: false, message: '赛事已取消' });
    }
    if (event.status === 'finished') {
      return res.status(400).json({ success: false, message: '赛事已结束' });
    }
    
    // 检查报名截止时间
    if (event.registration_end && new Date() > new Date(event.registration_end)) {
      return res.status(400).json({ success: false, message: '报名已截止' });
    }
    
    // 检查人数限制
    if (event.max_participants && event.participant_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '报名人数已满' });
    }

    // 检查是否已报名
    const [existing] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '已报名该赛事' });
    }

    // 根据赛事类型处理报名
    let status = 'confirmed';
    let partnerStatus = null;

    if (event.event_type === 'doubles') {
      if (partner_id) {
        status = 'pending';
        partnerStatus = 'pending';
      } else {
        status = 'waiting_partner';
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO event_registrations
        (event_id, user_id, partner_id, partner_status, team_name, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, user_id, partner_id || null, partnerStatus, team_name || null, status]
    );

    res.json({
      success: true,
      data: {
        registration_id: result.insertId,
        status
      }
    });
  } catch (error) {
    console.error('报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 取消报名
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    await pool.execute(
      'UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );

    res.json({ success: true, message: '已取消报名' });
  } catch (error) {
    console.error('取消报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取对阵列表
router.get('/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;

    const [matches] = await pool.query(`
      SELECT m.*,
        u1.name as player1_name, u1.avatar_url as player1_avatar,
        u2.name as player2_name, u2.avatar_url as player2_avatar
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      WHERE m.event_id = ?
      ORDER BY m.round, m.match_order
    `, [id]);

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('获取对阵列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 录入比分
router.post('/matches/:matchId/score', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { scores, recorded_by } = req.body;
    // scores: [{ game_number: 1, player1_score: 11, player2_score: 9 }, ...]

    if (!scores || !Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: '比分数据格式错误' });
    }

    // 删除旧比分，插入新比分
    await pool.execute('DELETE FROM match_scores WHERE match_id = ?', [matchId]);

    for (const score of scores) {
      await pool.execute(
        `INSERT INTO match_scores (match_id, game_number, player1_score, player2_score, recorded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [matchId, score.game_number, score.player1_score, score.player2_score, recorded_by]
      );
    }

    // 计算局数
    let player1Games = 0, player2Games = 0;
    for (const score of scores) {
      if (score.player1_score > score.player2_score) player1Games++;
      else if (score.player2_score > score.player1_score) player2Games++;
    }

    // 更新比赛状态
    await pool.execute(
      `UPDATE matches SET
        player1_games = ?, player2_games = ?,
        status = 'pending_confirm'
       WHERE id = ?`,
      [player1Games, player2Games, matchId]
    );

    res.json({ success: true, message: '比分已录入' });
  } catch (error) {
    console.error('录入比分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 确认比分
router.post('/matches/:matchId/confirm', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { user_id, is_admin } = req.body;

    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: '比赛不存在' });
    }

    const match = matches[0];
    let updateField = '';

    if (is_admin) {
      updateField = 'admin_confirmed = 1';
    } else if (user_id === match.player1_id) {
      updateField = 'player1_confirmed = 1';
    } else if (user_id === match.player2_id) {
      updateField = 'player2_confirmed = 1';
    } else {
      return res.status(403).json({ success: false, message: '无权确认此比赛' });
    }

    await pool.execute(`UPDATE matches SET ${updateField} WHERE id = ?`, [matchId]);

    // 检查是否双方都确认了
    const [updated] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    const m = updated[0];

    if ((m.player1_confirmed && m.player2_confirmed) || m.admin_confirmed) {
      // 确定胜者和败者
      const winnerId = m.player1_games > m.player2_games ? m.player1_id : m.player2_id;
      const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id;

      // 更新比赛状态
      await pool.execute(
        `UPDATE matches SET status = 'finished', winner_id = ?, finished_at = NOW() WHERE id = ?`,
        [winnerId, matchId]
      );

      // 计算积分变化（仅单打赛事且计入排名时）
      const [events] = await pool.query(
        'SELECT * FROM events WHERE id = ?',
        [m.event_id]
      );

      if (events.length > 0) {
        const event = events[0];
        // 只有单打赛事且 counts_for_ranking = 1 时才计算积分
        if (event.event_type === 'singles' && event.counts_for_ranking) {
          await updatePlayerRatings(m.event_id, matchId, winnerId, loserId);
        }
      }
    }

    res.json({ success: true, message: '已确认' });
  } catch (error) {
    console.error('确认比分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 更新选手积分
 * @param {number} eventId - 赛事ID
 * @param {number} matchId - 比赛ID
 * @param {number} winnerId - 胜者ID
 * @param {number} loserId - 败者ID
 */
async function updatePlayerRatings(eventId, matchId, winnerId, loserId) {
  try {
    // 获取双方当前积分
    const [players] = await pool.query(
      'SELECT id, points FROM users WHERE id IN (?, ?)',
      [winnerId, loserId]
    );

    if (players.length !== 2) {
      console.error('无法找到比赛双方选手');
      return;
    }

    const winnerData = players.find(p => p.id === winnerId);
    const loserData = players.find(p => p.id === loserId);

    const winnerPoints = winnerData.points || 0;
    const loserPoints = loserData.points || 0;

    // 计算积分变化
    const result = calculateMatchRating(winnerPoints, loserPoints);

    // 开启事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 更新胜者积分
      await connection.execute(
        'UPDATE users SET points = ?, wins = wins + 1 WHERE id = ?',
        [result.newWinnerPoints, winnerId]
      );

      // 更新败者积分
      await connection.execute(
        'UPDATE users SET points = ?, losses = losses + 1 WHERE id = ?',
        [result.newLoserPoints, loserId]
      );

      // 记录胜者积分历史
      await connection.execute(
        `INSERT INTO rating_history
          (user_id, points_before, points_after, points_change, source_type, match_id, event_id, opponent_id, opponent_points, is_winner, remark)
         VALUES (?, ?, ?, ?, 'match', ?, ?, ?, ?, 1, ?)`,
        [
          winnerId, winnerPoints, result.newWinnerPoints, result.winnerChange,
          matchId, eventId, loserId, loserPoints,
          result.isUpset ? '爆冷获胜' : '正常获胜'
        ]
      );

      // 记录败者积分历史
      await connection.execute(
        `INSERT INTO rating_history
          (user_id, points_before, points_after, points_change, source_type, match_id, event_id, opponent_id, opponent_points, is_winner, remark)
         VALUES (?, ?, ?, ?, 'match', ?, ?, ?, ?, 0, ?)`,
        [
          loserId, loserPoints, result.newLoserPoints, result.loserChange,
          matchId, eventId, winnerId, winnerPoints,
          result.isUpset ? '爆冷失利' : '正常失利'
        ]
      );

      await connection.commit();
      console.log(`积分已更新: 胜者${winnerId}(${winnerPoints}→${result.newWinnerPoints}), 败者${loserId}(${loserPoints}→${result.newLoserPoints})`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('更新积分失败:', error);
    // 积分更新失败不影响比赛确认结果
  }
}

// ============ 领队申请 ============

// 申请成为领队
router.post('/:id/apply-captain', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, reason } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    // 检查赛事是否存在且是团体赛
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '只有团体赛需要领队' });
    }

    // 检查是否已申请过
    const [existing] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );
    if (existing.length > 0) {
      const app = existing[0];
      if (app.status === 'pending') {
        return res.status(400).json({ success: false, message: '已提交申请，请等待审批' });
      }
      if (app.status === 'approved') {
        return res.status(400).json({ success: false, message: '您已是该赛事的领队' });
      }
      // 如果之前被拒绝，可以重新申请
      await pool.execute(
        'UPDATE captain_applications SET status = ?, reason = ?, reject_reason = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?',
        ['pending', reason || null, app.id]
      );
    } else {
      await pool.execute(
        'INSERT INTO captain_applications (event_id, user_id, reason) VALUES (?, ?, ?)',
        [id, user_id, reason || null]
      );
    }

    res.json({ success: true, message: '申请已提交，请等待审批' });
  } catch (error) {
    console.error('申请领队失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取我的领队申请
router.get('/captain-applications/my', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const [applications] = await pool.query(`
      SELECT ca.*, e.title as event_title, e.event_type, e.event_start, e.location
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      WHERE ca.user_id = ?
      ORDER BY ca.created_at DESC
    `, [user_id]);

    res.json({ success: true, data: applications });
  } catch (error) {
    console.error('获取领队申请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 检查用户是否是某赛事的领队
router.get('/:id/captain-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.json({ success: true, data: { isCaptain: false, application: null } });
    }

    const [applications] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ?',
      [id, user_id]
    );

    if (applications.length === 0) {
      return res.json({ success: true, data: { isCaptain: false, application: null } });
    }

    const app = applications[0];
    res.json({
      success: true,
      data: {
        isCaptain: app.status === 'approved',
        application: app
      }
    });
  } catch (error) {
    console.error('获取领队状态失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
