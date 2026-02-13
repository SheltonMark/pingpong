const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { calculateInitialRating } = require('../utils/ratingCalculator');
const { computeEventStatus } = require('./events');

// 检查用户是否存在
router.get('/check', async (req, res) => {
  try {
    const { openid } = req.query;
    if (!openid) {
      return res.status(400).json({ success: false, message: '缺少 openid' });
    }

    const [users] = await pool.query(
      'SELECT id, name, is_registered, privacy_agreed FROM users WHERE openid = ?',
      [openid]
    );

    if (users.length === 0) {
      return res.json({
        success: true,
        data: { exists: false, is_registered: false, privacy_agreed: false }
      });
    }

    const user = users[0];
    res.json({
      success: true,
      data: {
        exists: true,
        user_id: user.id,
        name: user.name,
        is_registered: !!user.is_registered,
        privacy_agreed: !!user.privacy_agreed
      }
    });
  } catch (error) {
    console.error('检查用户失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 同意隐私政策
router.post('/agree-privacy', async (req, res) => {
  try {
    const { openid } = req.body;
    if (!openid) {
      return res.status(400).json({ success: false, message: '缺少 openid' });
    }

    // 查找或创建用户
    const [existing] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);

    if (existing.length === 0) {
      // 用户不存在，不创建记录，仅返回成功（注册时再创建）
    } else {
      // 更新现有用户
      await pool.execute(
        'UPDATE users SET privacy_agreed = 1, privacy_agreed_at = NOW() WHERE openid = ?',
        [openid]
      );
    }

    res.json({ success: true, message: '已同意隐私政策' });
  } catch (error) {
    console.error('同意隐私政策失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const {
      openid,
      name,
      gender,
      phone,
      user_type,
      school_id,
      college_id,
      department_id,
      class_name,
      enrollment_year,
      avatar_url
    } = req.body;

    // 验证必填字段
    if (!openid || !name || !gender || !phone || !user_type || !school_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段'
      });
    }

    // 验证用户类型
    const validTypes = ['student', 'graduate', 'teacher', 'staff'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: '无效的用户类型'
      });
    }

    // 根据用户类型验证特定字段
    if (user_type === 'student' && (!college_id || !class_name || !enrollment_year)) {
      return res.status(400).json({
        success: false,
        message: '在校生必须填写学院、班级和入学年份'
      });
    }
    if (user_type === 'graduate' && (!college_id || !enrollment_year)) {
      return res.status(400).json({
        success: false,
        message: '毕业生必须填写学院和入学年份'
      });
    }
    if (user_type === 'teacher' && !college_id) {
      return res.status(400).json({
        success: false,
        message: '老师必须填写学院'
      });
    }
    if (user_type === 'staff' && !department_id) {
      return res.status(400).json({
        success: false,
        message: '教职工必须填写下属单位'
      });
    }

    // 检查用户是否存在，不存在则创建
    const [existing] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);

    let userId;
    if (existing.length === 0) {
      // 新用户，直接创建完整记录
      const [result] = await pool.execute(`
        INSERT INTO users (
          openid, name, gender, phone, user_type, school_id,
          college_id, department_id, class_name, enrollment_year,
          avatar_url, is_registered, privacy_agreed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW())
      `, [
        openid, name, gender, phone, user_type, school_id,
        college_id || null, department_id || null, class_name || null,
        enrollment_year || null, avatar_url || null
      ]);
      userId = result.insertId;
    } else {
      // 已存在，更新信息
      userId = existing[0].id;
      await pool.execute(`
        UPDATE users SET
          name = ?, gender = ?, phone = ?, user_type = ?, school_id = ?,
          college_id = ?, department_id = ?, class_name = ?, enrollment_year = ?,
          avatar_url = ?, is_registered = 1, updated_at = NOW()
        WHERE openid = ?
      `, [
        name, gender, phone, user_type, school_id,
        college_id || null, department_id || null, class_name || null,
        enrollment_year || null, avatar_url || null, openid
      ]);
    }

    // 为用户分配普通用户角色
    const [roles] = await pool.query('SELECT id FROM roles WHERE code = ?', ['user']);

    if (roles.length > 0) {
      await pool.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roles[0].id]
      );
    }

    // 获取注册后的完整用户信息
    const [users] = await pool.query(`
      SELECT
        u.id, u.id as user_id, u.openid, u.name, u.gender, u.phone, u.avatar_url,
        u.user_type, u.school_id, u.college_id, u.department_id,
        u.class_name, u.enrollment_year,
        u.points, u.wins, u.losses,
        u.is_registered, u.privacy_agreed,
        s.name as school_name,
        c.name as college_name,
        d.name as department_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `, [userId]);

    res.json({ success: true, message: '注册成功', data: users[0] });
  } catch (error) {
    console.error('用户注册失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户信息
router.post('/update', async (req, res) => {
  try {
    const {
      user_id,
      openid,
      name,
      gender,
      phone,
      user_type,
      school_id,
      college_id,
      department_id,
      class_name,
      enrollment_year,
      avatar_url
    } = req.body;

    // 验证必填字段
    if (!user_id || !name || !gender || !phone || !user_type || !school_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段'
      });
    }

    // 验证用户类型
    const validTypes = ['student', 'graduate', 'teacher', 'staff'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: '无效的用户类型'
      });
    }

    // 检查用户是否存在
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [user_id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 更新用户信息
    await pool.execute(`
      UPDATE users SET
        name = ?,
        gender = ?,
        phone = ?,
        user_type = ?,
        school_id = ?,
        college_id = ?,
        department_id = ?,
        class_name = ?,
        enrollment_year = ?,
        avatar_url = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      name,
      gender,
      phone,
      user_type,
      school_id,
      college_id || null,
      department_id || null,
      class_name || null,
      enrollment_year || null,
      avatar_url || null,
      user_id
    ]);

    // 获取更新后的用户信息
    const [users] = await pool.query(`
      SELECT
        u.id, u.name, u.gender, u.phone, u.avatar_url,
        u.user_type, u.school_id, u.college_id, u.department_id,
        u.class_name, u.enrollment_year,
        u.points, u.wins, u.losses,
        u.is_registered, u.privacy_agreed,
        s.name as school_name,
        c.name as college_name,
        d.name as department_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `, [user_id]);

    res.json({ success: true, message: '更新成功', data: users[0] });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户信息
router.get('/profile', async (req, res) => {
  try {
    const { openid } = req.query;
    if (!openid) {
      return res.status(400).json({ success: false, message: '缺少 openid' });
    }

    const [users] = await pool.query(`
      SELECT
        u.id, u.name, u.gender, u.phone, u.avatar_url,
        u.user_type, u.school_id, u.college_id, u.department_id,
        u.class_name, u.enrollment_year,
        u.points, u.wins, u.losses,
        u.is_registered, u.privacy_agreed,
        s.name as school_name,
        c.name as college_name,
        d.name as department_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.openid = ?
    `, [openid]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const user = users[0];
    // 计算胜率
    const totalGames = user.wins + user.losses;
    user.win_rate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取交手记录
router.get('/:id/match-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // 获取比赛记录（包括赛事比赛和约球比赛）
    const [matches] = await pool.query(`
      SELECT
        m.id, m.event_id, m.invitation_id, m.status, m.created_at,
        m.player1_id, m.player2_id, m.player1_games, m.player2_games,
        u1.name as player1_name, u1.avatar_url as player1_avatar,
        u2.name as player2_name, u2.avatar_url as player2_avatar,
        e.title as event_name,
        CASE WHEN m.invitation_id IS NOT NULL THEN 'invitation' ELSE 'event' END as match_type
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      LEFT JOIN events e ON m.event_id = e.id
      WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status IN ('confirmed', 'finished')
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [id, id, parseInt(limit), offset]);

    // 统计胜负（包括赛事和约球）
    const [stats] = await pool.query(`
      SELECT
        SUM(CASE WHEN (player1_id = ? AND player1_games > player2_games) OR (player2_id = ? AND player2_games > player1_games) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN (player1_id = ? AND player1_games < player2_games) OR (player2_id = ? AND player2_games < player1_games) THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE (player1_id = ? OR player2_id = ?) AND status IN ('confirmed', 'finished')
    `, [id, id, id, id, id, id]);

    const wins = stats[0].wins || 0;
    const losses = stats[0].losses || 0;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round(wins / total * 100) : 0;

    res.json({
      success: true,
      data: {
        matches,
        stats: { wins, losses, win_rate: winRate }
      }
    });
  } catch (error) {
    console.error('获取交手记录失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取我的赛事
router.get('/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let sql = `
      SELECT e.*, r.status as reg_status,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as participant_count,
        (SELECT COUNT(*) FROM matches m WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.event_id = e.id AND m.status IN ('confirmed','finished') AND ((m.player1_id = ? AND m.player1_games > m.player2_games) OR (m.player2_id = ? AND m.player2_games > m.player1_games))) as my_wins,
        (SELECT COUNT(*) FROM matches m WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.event_id = e.id AND m.status IN ('confirmed','finished') AND ((m.player1_id = ? AND m.player1_games < m.player2_games) OR (m.player2_id = ? AND m.player2_games < m.player1_games))) as my_losses
      FROM events e
      INNER JOIN event_registrations r ON e.id = r.event_id
      WHERE r.user_id = ?
    `;
    const params = [id, id, id, id, id, id, id, id, id];

    sql += ' ORDER BY e.event_start DESC';

    const [events] = await pool.query(sql, params);

    // 动态计算状态并过滤
    const result = events.map(e => ({
      ...e,
      status: computeEventStatus(e)
    })).filter(e => {
      if (!status) return true;
      return e.status === status;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('获取我的赛事失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取邀请列表
router.get('/:id/invitations', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let sql = `
      SELECT i.*,
        e.title as event_name, e.event_type as event_type,
        u.name as inviter_name, u.avatar_url as inviter_avatar
      FROM team_invitations i
      LEFT JOIN events e ON i.event_id = e.id
      LEFT JOIN users u ON i.inviter_id = u.id
      WHERE i.invitee_id = ?
    `;
    const params = [id];

    if (status === 'pending') {
      sql += " AND i.status = 'pending'";
    } else if (status === 'processed') {
      sql += " AND i.status IN ('accepted', 'rejected')";
    }

    sql += ' ORDER BY i.created_at DESC';

    const [invitations] = await pool.query(sql, params);
    res.json({ success: true, data: invitations });
  } catch (error) {
    console.error('获取邀请列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 响应邀请
router.post('/invitations/:invitationId/respond', async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { user_id, action } = req.body;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效操作' });
    }

    // 验证邀请存在且属于该用户
    const [invitations] = await pool.query(
      'SELECT * FROM team_invitations WHERE id = ? AND invitee_id = ? AND status = "pending"',
      [invitationId, user_id]
    );

    if (invitations.length === 0) {
      return res.status(404).json({ success: false, message: '邀请不存在或已处理' });
    }

    const invitation = invitations[0];
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    await pool.query(
      'UPDATE team_invitations SET status = ?, responded_at = NOW() WHERE id = ?',
      [newStatus, invitationId]
    );

    // 更新报名状态
    if (invitation.type === 'doubles') {
      if (action === 'accept') {
        // 接受邀请：双方报名状态都变为 confirmed
        await pool.query(
          `UPDATE event_registrations
           SET status = 'confirmed', partner_status = 'confirmed'
           WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
          [invitation.event_id, invitation.inviter_id, user_id]
        );
        // 更新被邀请者的报名记录
        await pool.execute(
          `UPDATE event_registrations
           SET status = 'confirmed', partner_status = 'confirmed'
           WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
          [invitation.event_id, user_id, invitation.inviter_id]
        );
      } else {
        // 拒绝邀请：邀请者报名状态变为 waiting_partner
        await pool.query(
          `UPDATE event_registrations
           SET status = 'waiting_partner', partner_id = NULL, partner_status = NULL
           WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
          [invitation.event_id, invitation.inviter_id, user_id]
        );
        // 删除被邀请者的报名记录（恢复到未报名状态）
        await pool.query(
          `UPDATE event_registrations
           SET status = 'cancelled'
           WHERE event_id = ? AND user_id = ? AND partner_id = ?`,
          [invitation.event_id, user_id, invitation.inviter_id]
        );
      }
    } else if (invitation.type === 'team') {
      if (action === 'accept') {
        // 接受团体赛邀请：队员状态变为 confirmed
        await pool.query(
          `UPDATE event_registrations
           SET status = 'confirmed'
           WHERE event_id = ? AND user_id = ? AND team_leader_id = ? AND status = 'pending'`,
          [invitation.event_id, user_id, invitation.inviter_id]
        );
      } else {
        // 拒绝团体赛邀请：删除队员的报名记录
        await pool.query(
          `UPDATE event_registrations
           SET status = 'cancelled'
           WHERE event_id = ? AND user_id = ? AND team_leader_id = ? AND status = 'pending'`,
          [invitation.event_id, user_id, invitation.inviter_id]
        );
      }
    }

    res.json({ success: true, message: action === 'accept' ? '已同意' : '已拒绝' });
  } catch (error) {
    console.error('响应邀请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户主页信息（他人主页）
router.get('/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;

    // 用户基本信息
    const [users] = await pool.query(`
      SELECT u.id, u.name, u.avatar_url, u.points, u.wins, u.losses,
        s.name as school_name, c.name as college_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.id = ?
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const user = users[0];

    // 计算排名（处理 points 为 null 的情况）
    const userPoints = user.points || 0;
    let rank = 1;
    try {
      const [ranking] = await pool.query(
        'SELECT COUNT(*) + 1 as user_rank FROM users WHERE points > ? AND school_id = (SELECT school_id FROM users WHERE id = ?)',
        [userPoints, id]
      );
      rank = ranking[0].user_rank;
    } catch (e) {
      console.error('计算排名失败:', e);
    }

    // 最近3场比赛
    const [recentMatches] = await pool.query(`
      SELECT
        m.id, m.player1_id, m.player2_id, m.player1_games, m.player2_games, m.created_at,
        u1.name as player1_name, u2.name as player2_name,
        e.title as event_name
      FROM matches m
      LEFT JOIN users u1 ON m.player1_id = u1.id
      LEFT JOIN users u2 ON m.player2_id = u2.id
      LEFT JOIN events e ON m.event_id = e.id
      WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status IN ('confirmed', 'finished')
      ORDER BY m.created_at DESC
      LIMIT 3
    `, [id, id]);

    res.json({
      success: true,
      data: {
        ...user,
        rank: rank,
        recent_matches: recentMatches
      }
    });
  } catch (error) {
    console.error('获取用户主页失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 积分相关 API ====================

// 获取用户积分历史
router.get('/:userId/rating-history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [history] = await pool.query(`
      SELECT rh.*,
        u.name as opponent_name,
        e.title as event_title,
        m.player1_games, m.player2_games
      FROM rating_history rh
      LEFT JOIN users u ON rh.opponent_id = u.id
      LEFT JOIN events e ON rh.event_id = e.id
      LEFT JOIN matches m ON rh.match_id = m.id
      WHERE rh.user_id = ?
      ORDER BY rh.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), parseInt(offset)]);

    // 获取总数
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM rating_history WHERE user_id = ?',
      [userId]
    );

    res.json({
      success: true,
      data: {
        list: history,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取积分历史失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置用户初始积分（首次参赛）
router.post('/:userId/initial-rating', async (req, res) => {
  try {
    const { userId } = req.params;
    const { base_tier, group_rank, wide_range = false, event_id } = req.body;

    if (!base_tier || !group_rank) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：base_tier（报名积分段）和 group_rank（小组名次）'
      });
    }

    // 检查用户是否已有积分
    const [users] = await pool.query('SELECT points FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    if (users[0].points > 0) {
      return res.status(400).json({
        success: false,
        message: '用户已有积分，不能设置初始积分'
      });
    }

    // 计算初始积分
    const initialPoints = calculateInitialRating(base_tier, group_rank, wide_range);

    // 更新用户积分
    await pool.execute('UPDATE users SET points = ? WHERE id = ?', [initialPoints, userId]);

    // 记录积分历史
    await pool.execute(
      `INSERT INTO rating_history
        (user_id, points_before, points_after, points_change, source_type, event_id, remark)
       VALUES (?, 0, ?, ?, 'initial', ?, ?)`,
      [
        userId, initialPoints, initialPoints, event_id || null,
        `首次参赛初始积分：报名${base_tier}分段，小组第${group_rank}名`
      ]
    );

    res.json({
      success: true,
      data: {
        initial_points: initialPoints,
        base_tier,
        group_rank,
        wide_range
      },
      message: `初始积分已设置为 ${initialPoints}`
    });
  } catch (error) {
    console.error('设置初始积分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理员调整积分
router.post('/:userId/adjust-rating', async (req, res) => {
  try {
    const { userId } = req.params;
    const { adjustment, reason, admin_id } = req.body;

    if (adjustment === undefined || !reason) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：adjustment（调整值）和 reason（原因）'
      });
    }

    // 获取当前积分
    const [users] = await pool.query('SELECT points FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const currentPoints = users[0].points || 0;
    const newPoints = Math.max(0, currentPoints + adjustment);

    // 更新积分
    await pool.execute('UPDATE users SET points = ? WHERE id = ?', [newPoints, userId]);

    // 记录历史
    await pool.execute(
      `INSERT INTO rating_history
        (user_id, points_before, points_after, points_change, source_type, remark)
       VALUES (?, ?, ?, ?, 'admin_adjust', ?)`,
      [userId, currentPoints, newPoints, adjustment, `管理员调整：${reason}`]
    );

    res.json({
      success: true,
      data: {
        points_before: currentPoints,
        points_after: newPoints,
        adjustment
      },
      message: '积分已调整'
    });
  } catch (error) {
    console.error('调整积分失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
