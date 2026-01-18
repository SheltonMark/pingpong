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
    if (host) {
      baseUrl = `${protocol}://${host}`;
    } else {
      baseUrl = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
    }
  }
  return baseUrl + url;
}

// 处理description中的图片URL，转换为小程序rich-text支持的格式
function processDescription(description, req) {
  if (!description) return description;

  // 获取 baseUrl，优先使用环境变量
  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    // 尝试从请求头获取
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      baseUrl = `${protocol}://${host}`;
    } else {
      // 默认值（腾讯云函数部署地址）
      baseUrl = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';
    }
  }

  let processed = description;

  // 1. 处理已有的img标签，简化并转换相对路径为绝对路径
  // 匹配所有 <img ...> 标签
  processed = processed.replace(/<img\s+([^>]*)>/gi, (match, attrs) => {
    // 提取 src 属性
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      let src = srcMatch[1];
      // 如果是相对路径，转为绝对路径
      if (src.startsWith('/uploads/')) {
        src = baseUrl + src;
      }
      // 返回简化的img标签，小程序rich-text只支持基本属性
      return `<img src="${src}">`;
    }
    return match;
  });

  // 2. 处理纯文本形式的完整图片URL
  // 匹配独立的 https://xxx.jpg 格式（不在引号或标签内）
  processed = processed.replace(/(^|>|\s)(https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp))(\s|<|$)/gim, (match, before, url, ext, after) => {
    return `${before}<img src="${url}">${after}`;
  });

  // 3. 处理纯文本形式的相对路径
  processed = processed.replace(/(^|>|\s)(\/uploads\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp))(\s|<|$)/gim, (match, before, path, ext, after) => {
    return `${before}<img src="${baseUrl}${path}">${after}`;
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
      // 校际赛、school_id为null的赛事、以及本校校内赛对用户可见
      sql += " AND (e.scope = 'inter_school' OR e.school_id IS NULL OR (e.scope = 'school' AND e.school_id = ?))";
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
      countSql += " AND (scope = 'inter_school' OR school_id IS NULL OR (scope = 'school' AND school_id = ?))";
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

// ========== 比赛详情相关路由（必须在 /:id 之前定义） ==========

// 获取比赛详情
router.get('/matches/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    const [matches] = await pool.query(
      `SELECT m.*,
        u1.name as player1_name,
        u2.name as player2_name,
        e.title as event_title
       FROM matches m
       LEFT JOIN users u1 ON m.player1_id = u1.id
       LEFT JOIN users u2 ON m.player2_id = u2.id
       LEFT JOIN events e ON m.event_id = e.id
       WHERE m.id = ?`,
      [matchId]
    );

    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: '比赛不存在' });
    }

    const match = matches[0];

    // 获取比分详情
    const [scores] = await pool.query(
      `SELECT game_number, player1_score, player2_score
       FROM match_scores
       WHERE match_id = ?
       ORDER BY game_number`,
      [matchId]
    );

    match.scores = scores;

    res.json({ success: true, data: match });
  } catch (error) {
    console.error('获取比赛详情失败:', error);
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

// ========== 赛事详情相关路由 ==========

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

    // 如果是双打且有搭档，创建组队邀请记录
    if (event.event_type === 'doubles' && partner_id) {
      await pool.execute(
        `INSERT INTO team_invitations (event_id, inviter_id, invitee_id, type, status)
         VALUES (?, ?, ?, 'doubles', 'pending')`,
        [id, user_id, partner_id]
      );
    }

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

// ============ 团体赛报名 ============

// 团体赛报名（领队组建队伍）
router.post('/:id/register-team', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, team_name, member_ids } = req.body;
    // member_ids: 队员用户ID数组（不包含领队自己）

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    if (!team_name) {
      return res.status(400).json({ success: false, message: '请输入队伍名称' });
    }
    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return res.status(400).json({ success: false, message: '请选择队员' });
    }

    // 检查赛事是否存在且是团体赛
    const [events] = await pool.query(
      'SELECT e.*, (SELECT COUNT(DISTINCT team_name) FROM event_registrations WHERE event_id = e.id AND status != "cancelled" AND team_name IS NOT NULL) as team_count FROM events e WHERE e.id = ?',
      [id]
    );

    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    if (event.event_type !== 'team') {
      return res.status(400).json({ success: false, message: '该赛事不是团体赛' });
    }

    // 检查赛事状态
    const status = computeEventStatus(event);
    if (status !== 'registration') {
      return res.status(400).json({ success: false, message: '赛事不在报名阶段' });
    }

    // 检查用户是否是已批准的领队
    const [captainApps] = await pool.query(
      'SELECT * FROM captain_applications WHERE event_id = ? AND user_id = ? AND status = "approved"',
      [id, user_id]
    );
    if (captainApps.length === 0) {
      return res.status(403).json({ success: false, message: '您不是该赛事的领队，无法组建队伍' });
    }

    // 检查队伍数量限制
    if (event.max_participants && event.team_count >= event.max_participants) {
      return res.status(400).json({ success: false, message: '队伍数量已满' });
    }

    // 检查队伍名称是否重复
    const [existingTeam] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND team_name = ? AND status != "cancelled"',
      [id, team_name]
    );
    if (existingTeam.length > 0) {
      return res.status(400).json({ success: false, message: '队伍名称已存在' });
    }

    // 检查领队是否已报名
    const [leaderReg] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ? AND status != "cancelled"',
      [id, user_id]
    );
    if (leaderReg.length > 0) {
      return res.status(400).json({ success: false, message: '您已报名该赛事' });
    }

    // 检查队员是否已报名其他队伍
    const [memberRegs] = await pool.query(
      'SELECT er.*, u.name FROM event_registrations er JOIN users u ON er.user_id = u.id WHERE er.event_id = ? AND er.user_id IN (?) AND er.status != "cancelled"',
      [id, member_ids]
    );
    if (memberRegs.length > 0) {
      const names = memberRegs.map(r => r.name).join('、');
      return res.status(400).json({ success: false, message: `以下队员已报名其他队伍：${names}` });
    }

    // 开启事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 插入领队报名记录
      await connection.execute(
        `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, status)
         VALUES (?, ?, ?, 1, 'confirmed')`,
        [id, user_id, team_name]
      );

      // 插入队员报名记录
      for (const memberId of member_ids) {
        await connection.execute(
          `INSERT INTO event_registrations (event_id, user_id, team_name, is_team_leader, team_leader_id, status)
           VALUES (?, ?, ?, 0, ?, 'confirmed')`,
          [id, memberId, team_name, user_id]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: '队伍报名成功',
        data: {
          team_name,
          leader_id: user_id,
          member_count: member_ids.length + 1
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('团体赛报名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取赛事队伍列表（团体赛）
router.get('/:id/teams', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取所有队伍
    const [teams] = await pool.query(`
      SELECT
        er.team_name,
        COUNT(*) as member_count,
        MAX(CASE WHEN er.is_team_leader = 1 THEN er.user_id END) as leader_id,
        MAX(CASE WHEN er.is_team_leader = 1 THEN u.name END) as leader_name,
        MAX(CASE WHEN er.is_team_leader = 1 THEN u.avatar_url END) as leader_avatar
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = ? AND er.status != 'cancelled' AND er.team_name IS NOT NULL
      GROUP BY er.team_name
      ORDER BY MIN(er.registered_at)
    `, [id]);

    // 获取每个队伍的成员
    for (const team of teams) {
      const [members] = await pool.query(`
        SELECT er.user_id, u.name, u.avatar_url, er.is_team_leader
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        WHERE er.event_id = ? AND er.team_name = ? AND er.status != 'cancelled'
        ORDER BY er.is_team_leader DESC, er.registered_at
      `, [id, team.team_name]);
      team.members = members;
    }

    res.json({ success: true, data: teams });
  } catch (error) {
    console.error('获取队伍列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============ 赛事排名 ============

// 获取赛事排名（循环赛/淘汰赛）
router.get('/:id/standings', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取赛事信息
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    if (events.length === 0) {
      return res.status(404).json({ success: false, message: '赛事不存在' });
    }

    const event = events[0];
    let standings = [];

    if (event.format === 'round_robin') {
      // 循环赛排名
      standings = await calculateRoundRobinStandings(id);
    } else if (event.format === 'knockout') {
      // 淘汰赛排名
      standings = await calculateKnockoutStandings(id);
    } else if (event.format === 'group_knockout') {
      // 小组赛+淘汰赛
      standings = await calculateGroupKnockoutStandings(id);
    }

    res.json({ success: true, data: standings });
  } catch (error) {
    console.error('获取赛事排名失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 计算循环赛排名
 * 排名规则：胜场数 > 净胜局 > 净胜分 > 相互战绩
 */
async function calculateRoundRobinStandings(eventId) {
  // 获取所有参赛者
  const [registrations] = await pool.query(`
    SELECT er.user_id, u.name, u.avatar_url
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    WHERE er.event_id = ? AND er.status = 'confirmed'
  `, [eventId]);

  // 获取所有已完成的比赛
  const [matches] = await pool.query(`
    SELECT m.*,
      (SELECT SUM(player1_score) FROM match_scores WHERE match_id = m.id) as player1_total_points,
      (SELECT SUM(player2_score) FROM match_scores WHERE match_id = m.id) as player2_total_points
    FROM matches m
    WHERE m.event_id = ? AND m.status = 'finished'
  `, [eventId]);

  // 初始化统计数据
  const stats = {};
  for (const reg of registrations) {
    stats[reg.user_id] = {
      user_id: reg.user_id,
      name: reg.name,
      avatar_url: reg.avatar_url,
      matches_played: 0,
      wins: 0,
      losses: 0,
      games_won: 0,
      games_lost: 0,
      points_won: 0,
      points_lost: 0,
      head_to_head: {} // 相互战绩
    };
  }

  // 统计比赛数据
  for (const match of matches) {
    const p1 = match.player1_id;
    const p2 = match.player2_id;

    if (!stats[p1] || !stats[p2]) continue;

    stats[p1].matches_played++;
    stats[p2].matches_played++;

    stats[p1].games_won += match.player1_games || 0;
    stats[p1].games_lost += match.player2_games || 0;
    stats[p2].games_won += match.player2_games || 0;
    stats[p2].games_lost += match.player1_games || 0;

    stats[p1].points_won += match.player1_total_points || 0;
    stats[p1].points_lost += match.player2_total_points || 0;
    stats[p2].points_won += match.player2_total_points || 0;
    stats[p2].points_lost += match.player1_total_points || 0;

    if (match.winner_id === p1) {
      stats[p1].wins++;
      stats[p2].losses++;
      stats[p1].head_to_head[p2] = (stats[p1].head_to_head[p2] || 0) + 1;
      stats[p2].head_to_head[p1] = (stats[p2].head_to_head[p1] || 0) - 1;
    } else {
      stats[p2].wins++;
      stats[p1].losses++;
      stats[p2].head_to_head[p1] = (stats[p2].head_to_head[p1] || 0) + 1;
      stats[p1].head_to_head[p2] = (stats[p1].head_to_head[p2] || 0) - 1;
    }
  }

  // 转换为数组并排序
  const standings = Object.values(stats);
  standings.sort((a, b) => {
    // 1. 胜场数
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 2. 净胜局
    const aNetGames = a.games_won - a.games_lost;
    const bNetGames = b.games_won - b.games_lost;
    if (bNetGames !== aNetGames) return bNetGames - aNetGames;
    // 3. 净胜分
    const aNetPoints = a.points_won - a.points_lost;
    const bNetPoints = b.points_won - b.points_lost;
    if (bNetPoints !== aNetPoints) return bNetPoints - aNetPoints;
    // 4. 相互战绩
    const h2h = a.head_to_head[b.user_id] || 0;
    return -h2h; // 正数表示a赢b，应该排前面
  });

  // 添加排名
  standings.forEach((s, index) => {
    s.rank = index + 1;
    s.net_games = s.games_won - s.games_lost;
    s.net_points = s.points_won - s.points_lost;
    delete s.head_to_head; // 不返回相互战绩详情
  });

  return standings;
}

/**
 * 计算淘汰赛排名
 * 排名规则：根据淘汰轮次确定名次
 */
async function calculateKnockoutStandings(eventId) {
  // 获取所有比赛，按轮次排序
  const [matches] = await pool.query(`
    SELECT m.*,
      u1.name as player1_name, u1.avatar_url as player1_avatar,
      u2.name as player2_name, u2.avatar_url as player2_avatar
    FROM matches m
    LEFT JOIN users u1 ON m.player1_id = u1.id
    LEFT JOIN users u2 ON m.player2_id = u2.id
    WHERE m.event_id = ?
    ORDER BY m.round DESC, m.match_order
  `, [eventId]);

  if (matches.length === 0) {
    return [];
  }

  // 找出最大轮次（决赛）
  const maxRound = Math.max(...matches.map(m => m.round || 1));

  const standings = [];
  const rankedPlayers = new Set();

  // 从决赛开始往前推
  for (let round = maxRound; round >= 1; round--) {
    const roundMatches = matches.filter(m => m.round === round);

    for (const match of roundMatches) {
      // 处理胜者
      if (match.winner_id && !rankedPlayers.has(match.winner_id)) {
        let rank;
        if (round === maxRound) {
          rank = 1; // 冠军
        } else if (round === maxRound - 1) {
          // 半决赛胜者进决赛，这里不处理
          continue;
        }

        const isPlayer1Winner = match.winner_id === match.player1_id;
        standings.push({
          rank,
          user_id: match.winner_id,
          name: isPlayer1Winner ? match.player1_name : match.player2_name,
          avatar_url: isPlayer1Winner ? match.player1_avatar : match.player2_avatar,
          eliminated_round: null,
          final_round: round
        });
        rankedPlayers.add(match.winner_id);
      }

      // 处理败者
      const loserId = match.winner_id === match.player1_id ? match.player2_id : match.player1_id;
      if (loserId && !rankedPlayers.has(loserId)) {
        let rank;
        if (round === maxRound) {
          rank = 2; // 亚军
        } else if (round === maxRound - 1) {
          rank = 3; // 4强（半决赛败者）
        } else if (round === maxRound - 2) {
          rank = 5; // 8强（1/4决赛败者）
        } else if (round === maxRound - 3) {
          rank = 9; // 16强
        } else {
          rank = Math.pow(2, maxRound - round) + 1;
        }

        const isPlayer1Loser = loserId === match.player1_id;
        standings.push({
          rank,
          user_id: loserId,
          name: isPlayer1Loser ? match.player1_name : match.player2_name,
          avatar_url: isPlayer1Loser ? match.player1_avatar : match.player2_avatar,
          eliminated_round: round,
          final_round: round
        });
        rankedPlayers.add(loserId);
      }
    }
  }

  // 按排名排序
  standings.sort((a, b) => a.rank - b.rank);

  // 添加轮次名称
  const roundNames = {
    [maxRound]: '决赛',
    [maxRound - 1]: '半决赛',
    [maxRound - 2]: '1/4决赛',
    [maxRound - 3]: '1/8决赛'
  };

  standings.forEach(s => {
    if (s.eliminated_round) {
      s.eliminated_at = roundNames[s.eliminated_round] || `第${s.eliminated_round}轮`;
    } else {
      s.eliminated_at = null;
    }
  });

  return standings;
}

/**
 * 计算小组赛+淘汰赛排名
 */
async function calculateGroupKnockoutStandings(eventId) {
  // 先获取淘汰赛阶段的排名
  const knockoutStandings = await calculateKnockoutStandings(eventId);

  // 获取未进入淘汰赛的选手（小组赛被淘汰）
  const [registrations] = await pool.query(`
    SELECT er.user_id, u.name, u.avatar_url
    FROM event_registrations er
    JOIN users u ON er.user_id = u.id
    WHERE er.event_id = ? AND er.status = 'confirmed'
  `, [eventId]);

  const rankedIds = new Set(knockoutStandings.map(s => s.user_id));
  const unrankedPlayers = registrations.filter(r => !rankedIds.has(r.user_id));

  // 小组赛被淘汰的选手排在淘汰赛选手之后
  const maxKnockoutRank = knockoutStandings.length > 0
    ? Math.max(...knockoutStandings.map(s => s.rank))
    : 0;

  unrankedPlayers.forEach((p, index) => {
    knockoutStandings.push({
      rank: maxKnockoutRank + index + 1,
      user_id: p.user_id,
      name: p.name,
      avatar_url: p.avatar_url,
      eliminated_at: '小组赛'
    });
  });

  return knockoutStandings;
}

module.exports = router;
