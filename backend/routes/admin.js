const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { requireAdmin, requireSuperAdmin, getUserRoles, isSchoolAdmin } = require('../middleware/adminAuth');

// 检查管理员权限
router.get('/check', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.json({ success: false, isAdmin: false });
    }

    const roles = await getUserRoles(user_id);
    const adminRoles = roles.filter(r =>
      ['super_admin', 'school_admin', 'event_manager', 'event_admin'].includes(r.code)
    );

    res.json({
      success: true,
      isAdmin: adminRoles.length > 0,
      roles: adminRoles
    });
  } catch (error) {
    console.error('Check admin error:', error);
    res.json({ success: false, isAdmin: false });
  }
});

// 获取统计概览
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [[userCount]] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE is_registered = 1');
    const [[eventCount]] = await pool.execute('SELECT COUNT(*) as count FROM events');
    const [[matchCount]] = await pool.execute("SELECT COUNT(*) as count FROM matches WHERE status = 'finished'");
    const [[postCount]] = await pool.execute('SELECT COUNT(*) as count FROM posts');

    // 本周新增用户
    const [[weekUsers]] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );

    // 进行中的赛事
    const [[ongoingEvents]] = await pool.execute(
      "SELECT COUNT(*) as count FROM events WHERE status IN ('registration', 'ongoing')"
    );

    res.json({
      success: true,
      data: {
        totalUsers: userCount.count,
        totalEvents: eventCount.count,
        totalMatches: matchCount.count,
        totalPosts: postCount.count,
        weekNewUsers: weekUsers.count,
        ongoingEvents: ongoingEvents.count
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.json({ success: false, message: '获取统计数据失败' });
  }
});

// ============ 赛事管理 ============

// 获取赛事列表（管理视角）
router.get('/events', requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT e.*, s.name as school_name, u.name as creator_name,
             (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registration_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE e.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [events] = await pool.execute(sql, params);

    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Get events error:', error);
    res.json({ success: false, message: '获取赛事列表失败' });
  }
});

// 创建赛事
router.post('/events', requireAdmin, async (req, res) => {
  try {
    const {
      title, description, event_type, event_format, scope,
      best_of, points_per_game, counts_for_ranking,
      registration_start, registration_end, event_start, event_end,
      location, max_participants, school_id, user_id
    } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO events (
        title, description, event_type, event_format, scope,
        best_of, points_per_game, counts_for_ranking,
        registration_start, registration_end, event_start, event_end,
        location, max_participants, school_id, created_by, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW())
    `, [
      title, description, event_type, event_format, scope,
      best_of || 5, points_per_game || 11, counts_for_ranking ? 1 : 0,
      registration_start || null, registration_end || null, event_start || null, event_end || null,
      location, max_participants, school_id, user_id
    ]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create event error:', error);
    res.json({ success: false, message: '创建赛事失败' });
  }
});

// 更新赛事
router.put('/events/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, event_type, event_format, scope,
      best_of, points_per_game, counts_for_ranking,
      registration_start, registration_end, event_start, event_end,
      location, max_participants, status
    } = req.body;

    await pool.execute(`
      UPDATE events SET
        title = ?, description = ?, event_type = ?, event_format = ?, scope = ?,
        best_of = ?, points_per_game = ?, counts_for_ranking = ?,
        registration_start = ?, registration_end = ?, event_start = ?, event_end = ?,
        location = ?, max_participants = ?, status = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      title, description, event_type, event_format, scope,
      best_of, points_per_game, counts_for_ranking ? 1 : 0,
      registration_start || null, registration_end || null, event_start || null, event_end || null,
      location, max_participants, status, id
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update event error:', error);
    res.json({ success: false, message: '更新赛事失败' });
  }
});

// 获取待审核比分
router.get('/matches/pending', requireAdmin, async (req, res) => {
  try {
    const [matches] = await pool.execute(`
      SELECT m.*,
             e.title as event_title,
             p1.name as player1_name, p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      LEFT JOIN events e ON m.event_id = e.id
      LEFT JOIN users p1 ON m.player1_id = p1.id
      LEFT JOIN users p2 ON m.player2_id = p2.id
      LEFT JOIN users w ON m.winner_id = w.id
      WHERE m.status = 'pending_confirm'
      AND m.player1_confirmed = 1 AND m.player2_confirmed = 1
      ORDER BY m.finished_at DESC
    `);

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('Get pending matches error:', error);
    res.json({ success: false, message: '获取待审核比分失败' });
  }
});

// 获取比赛列表（按状态筛选）
router.get('/matches', requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    let whereClause = '';
    if (status === 'pending') {
      whereClause = "WHERE m.status = 'pending_confirm'";
    } else if (status === 'confirmed') {
      whereClause = "WHERE m.status = 'finished'";
    } else if (status === 'disputed') {
      whereClause = "WHERE m.status = 'disputed'";
    }

    const [matches] = await pool.execute(`
      SELECT m.*,
             e.title as event_title,
             p1.name as player1_name, p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      LEFT JOIN events e ON m.event_id = e.id
      LEFT JOIN users p1 ON m.player1_id = p1.id
      LEFT JOIN users p2 ON m.player2_id = p2.id
      LEFT JOIN users w ON m.winner_id = w.id
      ${whereClause}
      ORDER BY m.updated_at DESC, m.id DESC
      LIMIT 100
    `);

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('Get matches error:', error);
    res.json({ success: false, message: '获取比赛列表失败' });
  }
});

// 确认比赛成绩
router.post('/matches/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(`
      UPDATE matches SET status = 'finished', admin_confirmed = 1, updated_at = NOW() WHERE id = ?
    `, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Confirm match error:', error);
    res.json({ success: false, message: '确认失败' });
  }
});

// 标记比赛有争议
router.post('/matches/:id/dispute', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await pool.execute(`
      UPDATE matches SET status = 'disputed', dispute_reason = ?, updated_at = NOW() WHERE id = ?
    `, [reason || '', id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Dispute match error:', error);
    res.json({ success: false, message: '标记失败' });
  }
});

// 更新比赛比分
router.put('/matches/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { score, winner_id } = req.body;

    await pool.execute(`
      UPDATE matches SET score = ?, winner_id = ?, updated_at = NOW() WHERE id = ?
    `, [score, winner_id, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update match error:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// 审核比分
router.post('/matches/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;

    if (approved) {
      await pool.execute(`
        UPDATE matches SET status = 'finished', admin_confirmed = 1 WHERE id = ?
      `, [id]);
    } else {
      // 驳回，重置确认状态
      await pool.execute(`
        UPDATE matches SET player1_confirmed = 0, player2_confirmed = 0 WHERE id = ?
      `, [id]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Approve match error:', error);
    res.json({ success: false, message: '审核失败' });
  }
});

// ============ 用户管理 ============

// 获取用户列表
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { keyword, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT u.id, u.name, u.phone, u.user_type, u.points, u.wins, u.losses,
             u.is_registered, u.created_at,
             s.name as school_name,
             GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
    `;
    const params = [];

    if (keyword) {
      sql += ' WHERE u.name LIKE ? OR u.phone LIKE ?';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [users] = await pool.execute(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM users';
    let countParams = [];
    if (keyword) {
      countSql += ' WHERE name LIKE ? OR phone LIKE ?';
      countParams = [`%${keyword}%`, `%${keyword}%`];
    }
    const [[{ total }]] = await pool.execute(countSql, countParams);

    res.json({ success: true, data: users, total });
  } catch (error) {
    console.error('Get users error:', error);
    res.json({ success: false, message: '获取用户列表失败' });
  }
});

// 获取所有角色
router.get('/roles', requireAdmin, async (req, res) => {
  try {
    const [roles] = await pool.execute('SELECT * FROM roles ORDER BY id');
    res.json({ success: true, data: roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.json({ success: false, message: '获取角色列表失败' });
  }
});

// 分配角色
router.post('/users/:id/role', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role_code, school_id, granted_by } = req.body;

    // 获取角色ID
    const [[role]] = await pool.execute('SELECT id FROM roles WHERE code = ?', [role_code]);
    if (!role) {
      return res.json({ success: false, message: '角色不存在' });
    }

    // 检查是否已有该角色
    const [existing] = await pool.execute(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [id, role.id]
    );

    if (existing.length > 0) {
      return res.json({ success: false, message: '用户已有该角色' });
    }

    await pool.execute(`
      INSERT INTO user_roles (user_id, role_id, school_id, granted_by, granted_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [id, role.id, school_id || null, granted_by]);

    res.json({ success: true });
  } catch (error) {
    console.error('Assign role error:', error);
    res.json({ success: false, message: '分配角色失败' });
  }
});

// 移除角色
router.delete('/users/:id/role/:roleId', requireSuperAdmin, async (req, res) => {
  try {
    const { id, roleId } = req.params;

    await pool.execute('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [id, roleId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Remove role error:', error);
    res.json({ success: false, message: '移除角色失败' });
  }
});

// ============ 内容管理 ============

// 获取公告列表
router.get('/announcements', requireAdmin, async (req, res) => {
  try {
    const [announcements] = await pool.execute(`
      SELECT a.*, s.name as school_name
      FROM announcements a
      LEFT JOIN schools s ON a.school_id = s.id
      ORDER BY a.created_at DESC
    `);

    res.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.json({ success: false, message: '获取公告列表失败' });
  }
});

// 创建公告
router.post('/announcements', requireAdmin, async (req, res) => {
  try {
    const { title, content, link_type, link_id, school_id, user_id } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO announcements (title, content, link_type, link_id, school_id, created_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
    `, [title, content, link_type || null, link_id || null, school_id || null, user_id]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.json({ success: false, message: '创建公告失败' });
  }
});

// 更新公告
router.put('/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, link_type, link_id, status } = req.body;

    await pool.execute(`
      UPDATE announcements SET title = ?, content = ?, link_type = ?, link_id = ?, status = ?
      WHERE id = ?
    `, [title, content, link_type || null, link_id || null, status, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.json({ success: false, message: '更新公告失败' });
  }
});

// 删除公告
router.delete('/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.json({ success: false, message: '删除公告失败' });
  }
});

// 获取学习资料列表
router.get('/learning', requireAdmin, async (req, res) => {
  try {
    const [materials] = await pool.execute(`
      SELECT * FROM learning_materials ORDER BY created_at DESC
    `);

    res.json({ success: true, data: materials });
  } catch (error) {
    console.error('Get learning materials error:', error);
    res.json({ success: false, message: '获取学习资料失败' });
  }
});

// 创建学习资料
router.post('/learning', requireAdmin, async (req, res) => {
  try {
    const { title, type, url, description, school_id } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO learning_materials (title, type, url, description, school_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', NOW())
    `, [title, type, url, description || null, school_id || null]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create learning material error:', error);
    res.json({ success: false, message: '创建学习资料失败' });
  }
});

// 删除学习资料
router.delete('/learning/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM learning_materials WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete learning material error:', error);
    res.json({ success: false, message: '删除学习资料失败' });
  }
});

// 获取签到点列表
router.get('/checkin-points', requireAdmin, async (req, res) => {
  try {
    const [points] = await pool.execute(`
      SELECT cp.*, s.name as school_name
      FROM check_in_points cp
      LEFT JOIN schools s ON cp.school_id = s.id
      ORDER BY cp.created_at DESC
    `);

    res.json({ success: true, data: points });
  } catch (error) {
    console.error('Get checkin points error:', error);
    res.json({ success: false, message: '获取签到点失败' });
  }
});

// 创建签到点
router.post('/checkin-points', requireAdmin, async (req, res) => {
  try {
    const { name, latitude, longitude, radius, school_id } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO check_in_points (name, latitude, longitude, radius, school_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', NOW())
    `, [name, latitude, longitude, radius || 100, school_id]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create checkin point error:', error);
    res.json({ success: false, message: '创建签到点失败' });
  }
});

// 删除签到点
router.delete('/checkin-points/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM check_in_points WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete checkin point error:', error);
    res.json({ success: false, message: '删除签到点失败' });
  }
});

// ============ 数据统计 ============

// 用户统计
router.get('/stats/users', requireAdmin, async (req, res) => {
  try {
    // 按用户类型统计
    const [byType] = await pool.execute(`
      SELECT user_type, COUNT(*) as count FROM users
      WHERE is_registered = 1 GROUP BY user_type
    `);

    // 按学校统计
    const [bySchool] = await pool.execute(`
      SELECT s.name as school_name, COUNT(*) as count
      FROM users u
      JOIN schools s ON u.school_id = s.id
      WHERE u.is_registered = 1
      GROUP BY u.school_id
      ORDER BY count DESC
      LIMIT 10
    `);

    // 近30天注册趋势
    const [trend] = await pool.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({ success: true, data: { byType, bySchool, trend } });
  } catch (error) {
    console.error('User stats error:', error);
    res.json({ success: false, message: '获取用户统计失败' });
  }
});

// 赛事统计
router.get('/stats/events', requireAdmin, async (req, res) => {
  try {
    // 按状态统计
    const [byStatus] = await pool.execute(`
      SELECT status, COUNT(*) as count FROM events GROUP BY status
    `);

    // 按类型统计
    const [byType] = await pool.execute(`
      SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type
    `);

    // 近期赛事
    const [recent] = await pool.execute(`
      SELECT e.id, e.title, e.status, e.event_start,
             (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registrations
      FROM events e
      ORDER BY e.created_at DESC
      LIMIT 10
    `);

    res.json({ success: true, data: { byStatus, byType, recent } });
  } catch (error) {
    console.error('Event stats error:', error);
    res.json({ success: false, message: '获取赛事统计失败' });
  }
});

// 活跃度统计
router.get('/stats/activity', requireAdmin, async (req, res) => {
  try {
    // 今日活跃
    const [[todayPosts]] = await pool.execute(
      'SELECT COUNT(*) as count FROM posts WHERE DATE(created_at) = CURDATE()'
    );
    const [[todayCheckins]] = await pool.execute(
      'SELECT COUNT(*) as count FROM check_ins WHERE DATE(check_in_time) = CURDATE()'
    );
    const [[todayMatches]] = await pool.execute(
      'SELECT COUNT(*) as count FROM matches WHERE DATE(finished_at) = CURDATE()'
    );

    // 近7天活跃趋势
    const [postTrend] = await pool.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM posts
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      success: true,
      data: {
        today: {
          posts: todayPosts.count,
          checkins: todayCheckins.count,
          matches: todayMatches.count
        },
        postTrend
      }
    });
  } catch (error) {
    console.error('Activity stats error:', error);
    res.json({ success: false, message: '获取活跃度统计失败' });
  }
});

module.exports = router;
