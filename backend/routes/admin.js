const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const subscribeMessage = require('../utils/subscribeMessage');
// 格式化日期为 MySQL 格式
function formatDateForMySQL(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// 将相对URL转为完整URL
function toFullUrl(url, req) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('cloud://')) return cloudStorage.cloudIdToHttpUrl(url);

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

// 批量将 cloud:// fileID 转为 HTTP 临时URL
const cloudStorage = require('../utils/cloudStorage');
async function resolveCloudUrls(urls) {
  const cloudIds = urls.filter(u => u && u.startsWith('cloud://'));
  if (cloudIds.length === 0) return urls;

  if (!cloudStorage.isCloudStorageAvailable()) {
    return urls;
  }

  try {
    const result = await cloudStorage.getTempFileURL(cloudIds);
    const urlMap = {};
    result.forEach(item => {
      if (item.tempFileURL) {
        urlMap[item.fileID] = item.tempFileURL;
      }
    });
    return urls.map(u => (u && urlMap[u]) ? urlMap[u] : u);
  } catch (err) {
    console.error('resolveCloudUrls failed:', err);
    return urls;
  }
}


const { requireAdmin, requireSuperAdmin, getUserRoles, isSchoolAdmin } = require('../middleware/adminAuth');

// 初始化超级管理员（仅用于首次设置）
router.get('/init-super-admin', async (req, res) => {
  try {
    const { phone, secret } = req.query;

    if (secret !== 'pingpong2024init') {
      return res.json({ success: false, message: '无权访问' });
    }

    if (!phone) {
      return res.json({ success: false, message: '请提供手机号' });
    }

    const [[user]] = await pool.execute(
      'SELECT id, name, admin_password FROM users WHERE phone = ?',
      [phone]
    );

    if (!user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    let [[role]] = await pool.execute("SELECT id FROM roles WHERE code = 'super_admin'");

    if (!role) {
      const [result] = await pool.execute(
        "INSERT INTO roles (code, name, description, created_at) VALUES ('super_admin', '超级管理员', '系统最高权限', NOW())"
      );
      role = { id: result.insertId };
    }

    const [existing] = await pool.execute(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [user.id, role.id]
    );

    if (existing.length === 0) {
      await pool.execute(
        'INSERT INTO user_roles (user_id, role_id, granted_at) VALUES (?, ?, NOW())',
        [user.id, role.id]
      );
    }

    if (!user.admin_password) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await pool.execute(
        'UPDATE users SET admin_password = ?, password_changed = 0 WHERE id = ?',
        [hashedPassword, user.id]
      );
    }

    res.json({
      success: true,
      message: `已将 ${user.name}(${phone}) 设置为超级管理员`,
      data: { user_id: user.id, name: user.name }
    });
  } catch (error) {
    console.error('Init super admin error:', error);
    res.json({ success: false, message: '设置失败: ' + error.message });
  }
});

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
    const { adminContext } = req;

    let sql = `
      SELECT e.*, s.name as school_name, u.name as creator_name,
             (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registration_count,
             (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status != 'cancelled') as participant_count
      FROM events e
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users u ON e.created_by = u.id
    `;
    const params = [];
    const whereClauses = [];

    // 权限过滤：学校管理员只能看到校际赛事和自己学校的校内赛事
    if (!adminContext.isSuperAdmin) {
      if (adminContext.managedSchoolIds && adminContext.managedSchoolIds.length > 0) {
        whereClauses.push(`(e.scope = 'inter_school' OR e.school_id IS NULL OR e.school_id IN (${adminContext.managedSchoolIds.join(',')}))`);
      } else {
        whereClauses.push(`(e.scope = 'inter_school' OR e.school_id IS NULL)`);
      }
    }

    // 不在SQL层面过滤status，改为应用层过滤（status是动态计算的）

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY e.created_at DESC';

    const [events] = await pool.execute(sql, params);

    // 动态计算赛事状态
    const { computeEventStatus } = require('./events');
    let eventsWithStatus = events.map(e => ({
      ...e,
      status: computeEventStatus(e)
    }));

    // 应用层过滤状态
    if (status) {
      eventsWithStatus = eventsWithStatus.filter(e => e.status === status);
    }

    // 手动分页
    const total = eventsWithStatus.length;
    const paged = eventsWithStatus.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({ success: true, data: paged, total });
  } catch (error) {
    console.error('Get events error:', error);
    res.json({ success: false, message: '获取赛事列表失败' });
  }
});

// 创建赛事
router.post('/events', requireAdmin, async (req, res) => {
  try {
    const {
      title, description, description_images, event_type, event_format, scope,
      best_of, games_to_win, points_per_game, counts_for_ranking,
      registration_start, registration_end, event_start, event_end,
      location, max_participants, school_id, user_id, status
    } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO events (
        title, description, description_images, event_type, event_format, scope,
        best_of, games_to_win, points_per_game, counts_for_ranking,
        registration_start, registration_end, event_start, event_end,
        location, max_participants, school_id, created_by, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      title, description || null,
      description_images ? JSON.stringify(description_images) : null,
      event_type, event_format, scope || 'school',
      best_of || 5, games_to_win || 3, points_per_game || 11, counts_for_ranking ? 1 : 0,
      formatDateForMySQL(registration_start), formatDateForMySQL(registration_end), formatDateForMySQL(event_start), formatDateForMySQL(event_end),
      location || null, max_participants || 32, school_id || null, user_id, status || 'draft'
    ]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create event error:', error);
    res.json({ success: false, message: '创建赛事失败: ' + error.message });
  }
});

// 更新赛事
router.put('/events/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, description_images, event_type, event_format, scope,
      best_of, games_to_win, points_per_game, counts_for_ranking,
      registration_start, registration_end, event_start, event_end,
      location, max_participants, status
    } = req.body;

    await pool.execute(`
      UPDATE events SET
        title = ?, description = ?, description_images = ?, event_type = ?, event_format = ?, scope = ?,
        best_of = ?, games_to_win = ?, points_per_game = ?, counts_for_ranking = ?,
        registration_start = ?, registration_end = ?, event_start = ?, event_end = ?,
        location = ?, max_participants = ?, status = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      title, description || null,
      description_images ? JSON.stringify(description_images) : null,
      event_type, event_format, scope || 'school',
      best_of || 5, games_to_win || 3, points_per_game || 11, counts_for_ranking ? 1 : 0,
      formatDateForMySQL(registration_start), formatDateForMySQL(registration_end), formatDateForMySQL(event_start), formatDateForMySQL(event_end),
      location || null, max_participants || 32, status || 'draft', id
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update event error:', error);
    res.json({ success: false, message: '更新赛事失败: ' + error.message });
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

    const [matches] = await pool.query(`
      SELECT m.*,
             CONCAT(m.player1_games, ':', m.player2_games) as score,
             e.title as event_title,
             p1.name as player1_name, p2.name as player2_name,
             w.name as winner_name
      FROM matches m
      LEFT JOIN events e ON m.event_id = e.id
      LEFT JOIN users p1 ON m.player1_id = p1.id
      LEFT JOIN users p2 ON m.player2_id = p2.id
      LEFT JOIN users w ON m.winner_id = w.id
      ${whereClause}
      ORDER BY m.finished_at DESC, m.id DESC
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
      SELECT u.id, u.name, u.phone, u.user_type, u.points as rating, u.wins, u.losses,
             u.is_registered, u.created_at,
             s.name as school_name,
             c.name as college_name,
             (SELECT r2.code FROM user_roles ur2
              JOIN roles r2 ON ur2.role_id = r2.id
              WHERE ur2.user_id = u.id
              AND r2.code IN ('super_admin', 'school_admin', 'event_manager')
              LIMIT 1) as role
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.is_registered = 1
    `;
    const params = [];

    if (keyword) {
      sql += ' AND (u.name LIKE ? OR u.phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [users] = await pool.execute(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM users WHERE is_registered = 1';
    let countParams = [];
    if (keyword) {
      countSql += ' AND (name LIKE ? OR phone LIKE ?)';
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

// 更新用户角色（简化版，用于前端单选角色）
router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // 先删除用户现有的管理角色
    const adminRoleCodes = ['super_admin', 'school_admin', 'event_manager'];
    await pool.execute(`
      DELETE ur FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ? AND r.code IN (?, ?, ?)
    `, [id, ...adminRoleCodes]);

    // 如果新角色不是普通用户，添加新角色
    if (role && role !== 'user') {
      const [[roleRecord]] = await pool.execute('SELECT id FROM roles WHERE code = ?', [role]);
      if (roleRecord) {
        await pool.execute(
          'INSERT INTO user_roles (user_id, role_id, granted_at) VALUES (?, ?, NOW())',
          [id, roleRecord.id]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update role error:', error);
    res.json({ success: false, message: '更新角色失败' });
  }
});

// 调整用户积分
router.post('/users/:id/adjust-rating', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment, remark } = req.body;

    if (!adjustment || adjustment === 0) {
      return res.json({ success: false, message: '调整值不能为0' });
    }

    // 更新用户积分 (字段名是 points)
    await pool.execute(
      'UPDATE users SET points = COALESCE(points, 0) + ? WHERE id = ?',
      [adjustment, id]
    );

    // 记录积分变动日志
    try {
      await pool.execute(`
        INSERT INTO rating_history (user_id, points_change, source_type, remark, created_at)
        VALUES (?, ?, 'admin_adjust', ?, NOW())
      `, [id, adjustment, remark || '管理员调整']);
    } catch (e) {
      // 如果没有日志表，忽略错误
      console.log('Rating history table may not exist:', e.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Adjust rating error:', error);
    res.json({ success: false, message: '调整积分失败: ' + error.message });
  }
});

// ============ 清理未注册用户 ============

// 获取未注册用户数量
router.get('/users/unregistered/count', requireSuperAdmin, async (req, res) => {
  try {
    const [[result]] = await pool.execute(`
      SELECT COUNT(*) as count FROM users
      WHERE phone IS NULL OR phone = ''
    `);

    res.json({ success: true, data: { count: result.count } });
  } catch (error) {
    console.error('Get unregistered count error:', error);
    res.json({ success: false, message: '获取未注册用户数量失败' });
  }
});

// 清理未注册用户（删除手机号为空的用户）
router.delete('/users/unregistered', requireSuperAdmin, async (req, res) => {
  try {
    // 先查询要删除的用户
    const [toDelete] = await pool.execute(`
      SELECT id, openid, created_at FROM users
      WHERE phone IS NULL OR phone = ''
    `);

    if (toDelete.length === 0) {
      return res.json({ success: true, message: '没有需要清理的未注册用户', data: { deleted: 0 } });
    }

    const userIds = toDelete.map(u => u.id);

    // 删除这些用户
    const [result] = await pool.execute(`
      DELETE FROM users
      WHERE phone IS NULL OR phone = ''
    `);

    console.log(`清理了 ${result.affectedRows} 个未注册用户:`, userIds);

    res.json({
      success: true,
      message: `成功清理 ${result.affectedRows} 个未注册用户`,
      data: { deleted: result.affectedRows, ids: userIds }
    });
  } catch (error) {
    console.error('Delete unregistered users error:', error);
    res.json({ success: false, message: '清理失败: ' + error.message });
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
      INSERT INTO announcements (title, content, link_type, link_id, school_id, created_by, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
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
    const { title, content, link_type, link_id, is_active } = req.body;

    await pool.execute(`
      UPDATE announcements SET title = ?, content = ?, link_type = ?, link_id = ?, is_active = ?
      WHERE id = ?
    `, [title, content, link_type || null, link_id || null, is_active !== undefined ? is_active : 1, id]);

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

    // 转换URL为完整路径
    const list = materials.map(m => ({
      ...m,
      url: toFullUrl(m.url, req),
      cover_url: toFullUrl(m.cover_url, req)
    }));

    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Get learning materials error:', error);
    res.json({ success: false, message: '获取学习资料失败' });
  }
});

// 创建学习资料
router.post('/learning', requireAdmin, async (req, res) => {
  try {
    const { title, type, url, original_name, description, school_id, cover_url } = req.body;

    const [result] = await pool.execute(`
      INSERT INTO learning_materials (title, type, url, original_name, description, school_id, cover_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW())
    `, [title, type, url, original_name || null, description || null, school_id || null, cover_url || null]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create learning material error:', error);
    res.json({ success: false, message: '创建学习资料失败' });
  }
});

// 更新学习资料
router.put('/learning/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, url, original_name, description, status, cover_url } = req.body;

    await pool.execute(`
      UPDATE learning_materials SET title = ?, type = ?, url = ?, original_name = ?, description = ?, status = ?, cover_url = ?
      WHERE id = ?
    `, [title, type, url, original_name || null, description || null, status || 'active', cover_url || null, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update learning material error:', error);
    res.json({ success: false, message: '更新学习资料失败' });
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

// 更新签到点
router.put('/checkin-points/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius, school_id, status } = req.body;

    await pool.execute(`
      UPDATE check_in_points SET name = ?, latitude = ?, longitude = ?, radius = ?, school_id = ?, status = ?
      WHERE id = ?
    `, [name, latitude, longitude, radius || 100, school_id || null, status || 'active', id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update checkin point error:', error);
    res.json({ success: false, message: '更新签到点失败' });
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

// 获取签到记录
router.get('/checkin-records', requireAdmin, async (req, res) => {
  try {
    const { school_id, start_date, end_date, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT ci.id, ci.check_in_time,
             u.id as user_id, u.name as user_name, u.phone,
             s.name as school_name,
             cp.name as point_name,
             (SELECT COUNT(*) FROM check_ins WHERE user_id = u.id) as checkin_count
      FROM check_ins ci
      JOIN users u ON ci.user_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN check_in_points cp ON ci.point_id = cp.id
      WHERE 1=1
    `;
    const params = [];

    if (school_id) {
      sql += ' AND u.school_id = ?';
      params.push(school_id);
    }
    if (start_date) {
      sql += ' AND DATE(ci.check_in_time) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND DATE(ci.check_in_time) <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY ci.check_in_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [records] = await pool.execute(sql, params);

    // 获取总数
    let countSql = `
      SELECT COUNT(*) as total
      FROM check_ins ci
      JOIN users u ON ci.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];
    if (school_id) {
      countSql += ' AND u.school_id = ?';
      countParams.push(school_id);
    }
    if (start_date) {
      countSql += ' AND DATE(ci.check_in_time) >= ?';
      countParams.push(start_date);
    }
    if (end_date) {
      countSql += ' AND DATE(ci.check_in_time) <= ?';
      countParams.push(end_date);
    }
    const [[{ total }]] = await pool.execute(countSql, countParams);

    res.json({ success: true, data: records, total });
  } catch (error) {
    console.error('Get checkin records error:', error);
    res.json({ success: false, message: '获取签到记录失败' });
  }
});

// 导出签到记录为CSV
router.get('/checkin-records/export', requireAdmin, async (req, res) => {
  try {
    const { school_id, start_date, end_date } = req.query;

    let sql = `
      SELECT u.name as 用户姓名, u.phone as 手机号,
             s.name as 学校,
             cp.name as 签到点,
             DATE_FORMAT(ci.check_in_time, '%Y-%m-%d %H:%i:%s') as 签到时间,
             (SELECT COUNT(*) FROM check_ins WHERE user_id = u.id) as 累计签到次数
      FROM check_ins ci
      JOIN users u ON ci.user_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN check_in_points cp ON ci.point_id = cp.id
      WHERE 1=1
    `;
    const params = [];

    if (school_id) {
      sql += ' AND u.school_id = ?';
      params.push(school_id);
    }
    if (start_date) {
      sql += ' AND DATE(ci.check_in_time) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND DATE(ci.check_in_time) <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY ci.check_in_time DESC';

    const [records] = await pool.execute(sql, params);

    // 生成CSV
    const BOM = '\uFEFF';
    const headers = ['用户姓名', '手机号', '学校', '签到点', '签到时间', '累计签到次数'];
    const csvContent = BOM + headers.join(',') + '\n' +
      records.map(row =>
        headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=checkin_records.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Export checkin records error:', error);
    res.status(500).json({ success: false, message: '导出失败' });
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

// ============ 管理员管理 ============

// 获取管理员列表
router.get('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const [admins] = await pool.execute(`
      SELECT u.id, u.name, u.phone, u.school_id, u.password_changed,
             s.name as school_name,
             GROUP_CONCAT(DISTINCT r.code) as role_codes,
             GROUP_CONCAT(DISTINCT r.name) as role_names
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN schools s ON u.school_id = s.id
      WHERE r.code IN ('super_admin', 'school_admin', 'event_manager')
      AND u.admin_password IS NOT NULL
      GROUP BY u.id
      ORDER BY u.id
    `);

    res.json({ success: true, data: admins });
  } catch (error) {
    console.error('Get admins error:', error);
    res.json({ success: false, message: '获取管理员列表失败' });
  }
});

// 创建管理员（设置初始密码）
router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const { user_id, role_code, school_id, event_id, initial_password, granted_by } = req.body;

    if (!user_id || !role_code || !initial_password) {
      return res.json({ success: false, message: '参数不完整' });
    }

    // 检查用户是否存在
    const [[user]] = await pool.execute('SELECT id, admin_password FROM users WHERE id = ?', [user_id]);
    if (!user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    // 获取角色ID
    const [[role]] = await pool.execute('SELECT id FROM roles WHERE code = ?', [role_code]);
    if (!role) {
      return res.json({ success: false, message: '角色不存在' });
    }

    // 检查是否已有该角色
    const [existing] = await pool.execute(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [user_id, role.id]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: '用户已有该角色' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(initial_password, 10);

    // 如果用户还没有管理密码，设置初始密码
    if (!user.admin_password) {
      await pool.execute(
        'UPDATE users SET admin_password = ?, password_changed = 0 WHERE id = ?',
        [hashedPassword, user_id]
      );
    }

    // 分配角色
    await pool.execute(`
      INSERT INTO user_roles (user_id, role_id, school_id, event_id, granted_by, granted_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [user_id, role.id, school_id || null, event_id || null, granted_by]);

    res.json({ success: true, message: '管理员创建成功' });
  } catch (error) {
    console.error('Create admin error:', error);
    res.json({ success: false, message: '创建管理员失败' });
  }
});

// 移除管理员角色
router.delete('/admins/:userId/role/:roleCode', requireSuperAdmin, async (req, res) => {
  try {
    const { userId, roleCode } = req.params;

    // 获取角色ID
    const [[role]] = await pool.execute('SELECT id FROM roles WHERE code = ?', [roleCode]);
    if (!role) {
      return res.json({ success: false, message: '角色不存在' });
    }

    // 删除角色
    await pool.execute(
      'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
      [userId, role.id]
    );

    // 检查用户是否还有其他管理角色
    const [remainingRoles] = await pool.execute(`
      SELECT r.code FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ? AND r.code IN ('super_admin', 'school_admin', 'event_manager')
    `, [userId]);

    // 如果没有其他管理角色，清除管理密码
    if (remainingRoles.length === 0) {
      await pool.execute(
        'UPDATE users SET admin_password = NULL, password_changed = 0 WHERE id = ?',
        [userId]
      );
    }

    res.json({ success: true, message: '角色已移除' });
  } catch (error) {
    console.error('Remove admin role error:', error);
    res.json({ success: false, message: '移除角色失败' });
  }
});

// 重置管理员密码
router.post('/admins/:userId/reset-password', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { new_password } = req.body;

    if (!new_password) {
      return res.json({ success: false, message: '请提供新密码' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 更新密码，标记为未修改（强制下次登录修改）
    await pool.execute(
      'UPDATE users SET admin_password = ?, password_changed = 0 WHERE id = ?',
      [hashedPassword, userId]
    );

    res.json({ success: true, message: '密码已重置' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.json({ success: false, message: '重置密码失败' });
  }
});

// ============ 学校管理 ============

// 获取学校列表
router.get('/schools', requireAdmin, async (req, res) => {
  try {
    const { keyword, include_inactive } = req.query;

    let sql = `
      SELECT s.*,
        (SELECT COUNT(*) FROM users WHERE school_id = s.id) as user_count,
        (SELECT COUNT(*) FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.school_id = s.id AND r.code = 'school_admin') as admin_count
      FROM schools s
    `;
    const params = [];

    const conditions = [];
    if (!include_inactive) {
      conditions.push('s.is_active = 1');
    }
    if (keyword) {
      conditions.push('(s.name LIKE ? OR s.short_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY s.id';

    const [schools] = await pool.execute(sql, params);
    res.json({ success: true, data: schools });
  } catch (error) {
    console.error('Get schools error:', error);
    res.json({ success: false, message: '获取学校列表失败' });
  }
});

// 创建学校
router.post('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const { name, short_name, province, city } = req.body;

    if (!name) {
      return res.json({ success: false, message: '学校名称不能为空' });
    }

    // 检查是否已存在
    const [existing] = await pool.execute(
      'SELECT id FROM schools WHERE name = ?',
      [name]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: '学校已存在' });
    }

    const [result] = await pool.execute(`
      INSERT INTO schools (name, short_name, province, city, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, NOW())
    `, [name, short_name || null, province || null, city || null]);

    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create school error:', error);
    res.json({ success: false, message: '创建学校失败' });
  }
});

// 更新学校
router.put('/schools/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, short_name, province, city, is_active } = req.body;

    if (!name) {
      return res.json({ success: false, message: '学校名称不能为空' });
    }

    // 检查是否与其他学校重名
    const [existing] = await pool.execute(
      'SELECT id FROM schools WHERE name = ? AND id != ?',
      [name, id]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: '学校名称已被使用' });
    }

    await pool.execute(`
      UPDATE schools SET name = ?, short_name = ?, province = ?, city = ?, is_active = ?
      WHERE id = ?
    `, [name, short_name || null, province || null, city || null, is_active ? 1 : 0, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update school error:', error);
    res.json({ success: false, message: '更新学校失败' });
  }
});

// 删除学校（软删除）
router.delete('/schools/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有关联用户
    const [[userCount]] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE school_id = ?',
      [id]
    );

    if (userCount.count > 0) {
      // 有用户，只能禁用不能删除
      await pool.execute('UPDATE schools SET is_active = 0 WHERE id = ?', [id]);
      res.json({ success: true, message: '学校已禁用（有关联用户无法删除）' });
    } else {
      // 无用户，可以删除
      await pool.execute('DELETE FROM schools WHERE id = ?', [id]);
      res.json({ success: true, message: '学校已删除' });
    }
  } catch (error) {
    console.error('Delete school error:', error);
    res.json({ success: false, message: '删除学校失败' });
  }
});

// ============ 学院管理 ============

// 获取某学校的学院列表
router.get('/schools/:schoolId/colleges', requireAdmin, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { include_inactive } = req.query;

    let sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM users WHERE college_id = c.id) as user_count
      FROM colleges c
      WHERE c.school_id = ?
    `;
    const params = [schoolId];

    if (!include_inactive) {
      sql += ' AND c.is_active = 1';
    }

    sql += ' ORDER BY c.id ASC';

    const [colleges] = await pool.execute(sql, params);
    res.json({ success: true, data: colleges });
  } catch (error) {
    console.error('Get colleges error:', error);
    res.json({ success: false, message: '获取学院列表失败' });
  }
});

// 添加学院
router.post('/schools/:schoolId/colleges', requireAdmin, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { name } = req.body;
    const adminContext = req.adminContext;

    // 权限检查：学校管理员只能管理自己的学校
    if (adminContext.role === 'school_admin' && !adminContext.managedSchoolIds.includes(parseInt(schoolId))) {
      return res.status(403).json({ success: false, message: '无权管理该学校的学院' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '学院名称不能为空' });
    }

    // 检查重复
    const [existing] = await pool.execute(
      'SELECT id FROM colleges WHERE school_id = ? AND name = ?',
      [schoolId, name.trim()]
    );

    if (existing.length > 0) {
      return res.json({ success: false, message: '该学院已存在' });
    }

    const [result] = await pool.execute(
      'INSERT INTO colleges (school_id, name, is_active, created_at) VALUES (?, ?, 1, NOW())',
      [schoolId, name.trim()]
    );

    res.json({ success: true, data: { id: result.insertId, name: name.trim() } });
  } catch (error) {
    console.error('Add college error:', error);
    res.json({ success: false, message: '添加学院失败' });
  }
});

// 更新学院
router.put('/colleges/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    const adminContext = req.adminContext;

    // 获取学院信息以检查权限
    const [[college]] = await pool.execute('SELECT school_id FROM colleges WHERE id = ?', [id]);
    if (!college) {
      return res.status(404).json({ success: false, message: '学院不存在' });
    }

    // 权限检查
    if (adminContext.role === 'school_admin' && !adminContext.managedSchoolIds.includes(college.school_id)) {
      return res.status(403).json({ success: false, message: '无权管理该学院' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '学院名称不能为空' });
    }

    // 检查名称是否与同校其他学院重复
    const [duplicate] = await pool.execute(
      'SELECT id FROM colleges WHERE school_id = ? AND name = ? AND id != ?',
      [college.school_id, name.trim(), id]
    );

    if (duplicate.length > 0) {
      return res.json({ success: false, message: '该学院名称已存在' });
    }

    await pool.execute(
      'UPDATE colleges SET name = ?, is_active = ? WHERE id = ?',
      [name.trim(), is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
    );

    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('Update college error:', error);
    res.json({ success: false, message: '更新学院失败' });
  }
});

// 删除学院
router.delete('/colleges/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminContext = req.adminContext;

    // 获取学院信息
    const [[college]] = await pool.execute('SELECT school_id FROM colleges WHERE id = ?', [id]);
    if (!college) {
      return res.status(404).json({ success: false, message: '学院不存在' });
    }

    // 权限检查
    if (adminContext.role === 'school_admin' && !adminContext.managedSchoolIds.includes(college.school_id)) {
      return res.status(403).json({ success: false, message: '无权管理该学院' });
    }

    // 检查是否有关联用户
    const [[userCount]] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE college_id = ?',
      [id]
    );

    if (userCount.count > 0) {
      // 有用户，只能禁用
      await pool.execute('UPDATE colleges SET is_active = 0 WHERE id = ?', [id]);
      res.json({ success: true, message: '学院已禁用（有关联用户无法删除）' });
    } else {
      // 无用户，可以删除
      await pool.execute('DELETE FROM colleges WHERE id = ?', [id]);
      res.json({ success: true, message: '学院已删除' });
    }
  } catch (error) {
    console.error('Delete college error:', error);
    res.json({ success: false, message: '删除学院失败' });
  }
});

// 删除赛事
router.delete('/events/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查是否有报名记录
    const [regs] = await pool.execute(
      'SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?',
      [id]
    );
    
    if (regs[0].count > 0) {
      return res.json({ success: false, message: '该赛事已有报名记录，无法删除' });
    }
    
    await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.json({ success: false, message: '删除赛事失败: ' + error.message });
  }
});

// ============ 领队申请管理 ============

// 获取领队申请列表
router.get('/captain-applications', requireAdmin, async (req, res) => {
  try {
    const { status, school_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT ca.*,
             e.title as event_title, e.event_type, e.event_start, e.school_id as event_school_id,
             u.name as applicant_name, u.phone as applicant_phone, u.avatar_url as applicant_avatar,
             s.name as school_name,
             r.name as reviewer_name
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      JOIN users u ON ca.user_id = u.id
      LEFT JOIN schools s ON e.school_id = s.id
      LEFT JOIN users r ON ca.reviewed_by = r.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND ca.status = ?';
      params.push(status);
    }
    if (school_id) {
      sql += ' AND e.school_id = ?';
      params.push(school_id);
    }

    sql += ' ORDER BY ca.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [applications] = await pool.execute(sql, params);

    // 获取总数
    let countSql = `
      SELECT COUNT(*) as total
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      WHERE 1=1
    `;
    const countParams = [];
    if (status) {
      countSql += ' AND ca.status = ?';
      countParams.push(status);
    }
    if (school_id) {
      countSql += ' AND e.school_id = ?';
      countParams.push(school_id);
    }
    const [[{ total }]] = await pool.execute(countSql, countParams);

    res.json({ success: true, data: applications, total });
  } catch (error) {
    console.error('Get captain applications error:', error);
    res.json({ success: false, message: '获取领队申请列表失败' });
  }
});

// 审批通过领队申请
router.post('/captain-applications/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // 获取申请信息以验证权限
    const [[app]] = await pool.execute(`
      SELECT ca.*, e.school_id as event_school_id
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      WHERE ca.id = ?
    `, [id]);

    if (!app) {
      return res.json({ success: false, message: '申请不存在' });
    }

    // 检查权限：只有超级管理员或该赛事所属学校的学校管理员可以审批
    const context = req.adminContext;
    if (!context.isSuperAdmin) {
      if (!context.isSchoolAdmin) {
        return res.json({ success: false, message: '只有学校管理员可以审批领队申请' });
      }
      // 检查是否是该赛事所属学校的管理员
      if (context.managedSchoolIds && !context.managedSchoolIds.includes(app.event_school_id)) {
        return res.json({ success: false, message: '您只能审批本校赛事的领队申请' });
      }
    }

    // 更新申请状态
    await pool.execute(
      'UPDATE captain_applications SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      ['approved', user_id, id]
    );

    // 检查是否已报名，如果已报名则更新为领队
    const [regs] = await pool.execute(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?',
      [app.event_id, app.user_id]
    );
    if (regs.length > 0) {
      await pool.execute(
        'UPDATE event_registrations SET is_team_leader = 1 WHERE event_id = ? AND user_id = ?',
        [app.event_id, app.user_id]
      );
    }

    // 发送订阅消息通知申请人
    try {
      const [userInfo] = await pool.query(
        'SELECT openid FROM users WHERE id = ?',
        [app.user_id]
      );
      const [eventInfo] = await pool.query(
        'SELECT name FROM events WHERE id = ?',
        [app.event_id]
      );

      if (userInfo.length > 0 && userInfo[0].openid) {
        await subscribeMessage.sendApprovalResultNotice(userInfo[0].openid, {
          content: `领队申请-${eventInfo.length > 0 ? eventInfo[0].name : '赛事'}`,
          result: '已通过',
          remark: '您的领队申请已通过审核',
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/event-detail/event-detail?id=${app.event_id}`
        });
      }
    } catch (notifyError) {
      console.error('发送领队审批通知失败:', notifyError);
      // 通知失败不影响主流程
    }

    res.json({ success: true, message: '已批准' });
  } catch (error) {
    console.error('Approve captain application error:', error);
    res.json({ success: false, message: '审批失败' });
  }
});

// 拒绝领队申请
router.post('/captain-applications/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, reject_reason } = req.body;

    // 获取申请信息以验证权限
    const [[app]] = await pool.execute(`
      SELECT ca.*, e.school_id as event_school_id
      FROM captain_applications ca
      JOIN events e ON ca.event_id = e.id
      WHERE ca.id = ?
    `, [id]);

    if (!app) {
      return res.json({ success: false, message: '申请不存在' });
    }

    // 检查权限：只有超级管理员或该赛事所属学校的学校管理员可以审批
    const context = req.adminContext;
    if (!context.isSuperAdmin) {
      if (!context.isSchoolAdmin) {
        return res.json({ success: false, message: '只有学校管理员可以审批领队申请' });
      }
      // 检查是否是该赛事所属学校的管理员
      if (context.managedSchoolIds && !context.managedSchoolIds.includes(app.event_school_id)) {
        return res.json({ success: false, message: '您只能审批本校赛事的领队申请' });
      }
    }

    await pool.execute(
      'UPDATE captain_applications SET status = ?, reviewed_by = ?, reviewed_at = NOW(), reject_reason = ? WHERE id = ?',
      ['rejected', user_id, reject_reason || null, id]
    );

    // 发送订阅消息通知申请人
    try {
      const [userInfo] = await pool.query(
        'SELECT openid FROM users WHERE id = ?',
        [app.user_id]
      );
      const [eventInfo] = await pool.query(
        'SELECT name FROM events WHERE id = ?',
        [app.event_id]
      );

      if (userInfo.length > 0 && userInfo[0].openid) {
        await subscribeMessage.sendApprovalResultNotice(userInfo[0].openid, {
          content: `领队申请-${eventInfo.length > 0 ? eventInfo[0].name : '赛事'}`,
          result: '未通过',
          remark: reject_reason || '您的领队申请未通过审核',
          time: subscribeMessage.formatTime(new Date()),
          page: `pages/event-detail/event-detail?id=${app.event_id}`
        });
      }
    } catch (notifyError) {
      console.error('发送领队审批通知失败:', notifyError);
      // 通知失败不影响主流程
    }

    res.json({ success: true, message: '已拒绝' });
  } catch (error) {
    console.error('Reject captain application error:', error);
    res.json({ success: false, message: '审批失败' });
  }
});

// ============ 双打配对管理 ============

// 获取双打配对列表
router.get('/doubles-pairs', requireAdmin, async (req, res) => {
  try {
    const { event_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!event_id) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const sql = `
      SELECT
        er.id,
        er.event_id,
        er.user_id as player1_id,
        er.partner_id as player2_id,
        er.team_name,
        er.status,
        er.created_at,
        u1.name as player1_name,
        u1.phone as player1_phone,
        u1.avatar_url as player1_avatar,
        u2.name as player2_name,
        u2.phone as player2_phone,
        u2.avatar_url as player2_avatar
      FROM event_registrations er
      JOIN users u1 ON er.user_id = u1.id
      LEFT JOIN users u2 ON er.partner_id = u2.id
      WHERE er.event_id = ? AND er.partner_id IS NOT NULL
      ORDER BY er.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [pairs] = await pool.execute(sql, [event_id, parseInt(limit), parseInt(offset)]);

    // 获取总数
    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) as total FROM event_registrations WHERE event_id = ? AND partner_id IS NOT NULL',
      [event_id]
    );

    res.json({ success: true, data: pairs, total });
  } catch (error) {
    console.error('Get doubles pairs error:', error);
    res.json({ success: false, message: '获取双打配对列表失败' });
  }
});

// 取消双打配对
router.post('/doubles-pairs/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 更新报名状态为已取消
    await pool.execute(
      "UPDATE event_registrations SET status = 'cancelled', partner_id = NULL WHERE id = ?",
      [id]
    );

    res.json({ success: true, message: '配对已取消' });
  } catch (error) {
    console.error('Cancel doubles pair error:', error);
    res.json({ success: false, message: '取消配对失败' });
  }
});

// ============ 团体赛队伍管理 ============

// 获取团体赛队伍列表
router.get('/teams', requireAdmin, async (req, res) => {
  try {
    const { event_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!event_id) {
      return res.json({ success: true, data: [], total: 0 });
    }

    // 获取队伍列表（通过 is_team_leader 标识队长/领队）
    const sql = `
      SELECT
        er.id,
        er.event_id,
        er.team_name,
        er.status,
        er.created_at,
        u.id as captain_id,
        u.name as captain_name,
        u.phone as captain_phone,
        u.avatar_url as captain_avatar,
        (SELECT COUNT(*) FROM event_registrations
         WHERE team_name = er.team_name AND event_id = er.event_id AND status = 'confirmed') as confirmed_count,
        (SELECT COUNT(*) FROM event_registrations
         WHERE team_name = er.team_name AND event_id = er.event_id) as total_slots
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = ? AND er.is_team_leader = 1
      ORDER BY er.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [teams] = await pool.execute(sql, [event_id, parseInt(limit), parseInt(offset)]);

    // 获取每个队伍的成员
    for (const team of teams) {
      const [members] = await pool.execute(`
        SELECT
          er.id, er.status,
          u.id as user_id, u.name, u.phone, u.avatar_url
        FROM event_registrations er
        JOIN users u ON er.user_id = u.id
        WHERE er.team_name = ? AND er.event_id = ? AND er.is_team_leader = 0
      `, [team.team_name, team.event_id]);
      team.members = members;
    }

    // 获取总数
    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) as total FROM event_registrations WHERE event_id = ? AND is_team_leader = 1',
      [event_id]
    );

    res.json({ success: true, data: teams, total });
  } catch (error) {
    console.error('Get teams error:', error);
    res.json({ success: false, message: '获取队伍列表失败' });
  }
});

// 获取队伍详情
router.get('/teams/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取队伍信息（通过领队报名记录）
    const [[team]] = await pool.execute(`
      SELECT
        er.id,
        er.event_id,
        er.team_name,
        er.status,
        er.created_at,
        u.id as captain_id,
        u.name as captain_name,
        u.phone as captain_phone,
        u.avatar_url as captain_avatar
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      WHERE er.id = ?
    `, [id]);

    if (!team) {
      return res.json({ success: false, message: '队伍不存在' });
    }

    // 获取队员列表
    const [members] = await pool.execute(`
      SELECT
        er.id, er.status,
        u.id as user_id, u.name, u.phone, u.avatar_url
      FROM event_registrations er
      JOIN users u ON er.user_id = u.id
      WHERE er.team_name = ? AND er.event_id = ?
    `, [team.team_name, team.event_id]);

    team.members = members;

    res.json({ success: true, data: team });
  } catch (error) {
    console.error('Get team detail error:', error);
    res.json({ success: false, message: '获取队伍详情失败' });
  }
});

// 解散队伍
router.post('/teams/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取队伍信息
    const [[team]] = await pool.execute(
      'SELECT team_name, event_id FROM event_registrations WHERE id = ?',
      [id]
    );

    if (!team) {
      return res.json({ success: false, message: '队伍不存在' });
    }

    // 取消该队伍所有成员的报名
    await pool.execute(
      "UPDATE event_registrations SET status = 'cancelled' WHERE team_name = ? AND event_id = ?",
      [team.team_name, team.event_id]
    );

    res.json({ success: true, message: '队伍已解散' });
  } catch (error) {
    console.error('Cancel team error:', error);
    res.json({ success: false, message: '解散队伍失败' });
  }
});

// ============ 帖子管理 ============

// 获取帖子列表
router.get('/posts', requireAdmin, async (req, res) => {
  try {
    const { status, school_id, post_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { adminContext } = req;

    let sql = `
      SELECT p.*,
             u.name as author_name, u.avatar_url as author_avatar,
             s.name as school_name,
             (SELECT COUNT(*) FROM match_invitations mi WHERE mi.post_id = p.id) > 0 as is_invitation
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN schools s ON p.school_id = s.id
      WHERE 1=1
    `;
    const params = [];

    // 权限过滤：学校管理员只能看到自己学校的帖子（或发帖用户属于自己学校的帖子）
    if (!adminContext.isSuperAdmin) {
      if (adminContext.managedSchoolIds && adminContext.managedSchoolIds.length > 0) {
        sql += ` AND (p.school_id IN (${adminContext.managedSchoolIds.join(',')}) OR u.school_id IN (${adminContext.managedSchoolIds.join(',')}) OR p.school_id IS NULL)`;
      } else {
        // 没有管理任何学校，返回空列表
        return res.json({ success: true, data: { list: [], total: 0, page: parseInt(page), limit: parseInt(limit) } });
      }
    }

    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (school_id) {
      sql += ' AND p.school_id = ?';
      params.push(school_id);
    }
    if (post_type === 'invitation') {
      sql += ' AND EXISTS (SELECT 1 FROM match_invitations mi WHERE mi.post_id = p.id)';
    } else if (post_type === 'post') {
      sql += ' AND NOT EXISTS (SELECT 1 FROM match_invitations mi WHERE mi.post_id = p.id)';
    }

    // 获取总数
    let countSql = sql.replace(/SELECT p\.\*,[\s\S]*?FROM posts p/, 'SELECT COUNT(*) as total FROM posts p');
    const [[{ total }]] = await pool.execute(countSql, params);

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [posts] = await pool.execute(sql, params);

    // 转换头像URL
    const list = posts.map(p => ({
      ...p,
      author_avatar: toFullUrl(p.author_avatar, req)
    }));

    res.json({
      success: true,
      data: {
        list,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.json({ success: false, message: '获取帖子列表失败' });
  }
});

// 更新帖子状态
router.put('/posts/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { adminContext } = req;

    // 验证状态值
    if (!['active', 'hidden', 'deleted'].includes(status)) {
      return res.json({ success: false, message: '无效的状态值' });
    }

    // 获取帖子信息以检查权限
    const [[post]] = await pool.execute(`
      SELECT p.school_id as post_school_id, u.school_id as user_school_id
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `, [id]);
    if (!post) {
      return res.json({ success: false, message: '帖子不存在' });
    }

    // 权限检查：学校管理员只能管理自己学校的帖子（或发帖用户属于自己学校的帖子）
    if (!adminContext.isSuperAdmin) {
      const canManage = adminContext.managedSchoolIds && (
        adminContext.managedSchoolIds.includes(post.post_school_id) ||
        adminContext.managedSchoolIds.includes(post.user_school_id) ||
        post.post_school_id === null
      );
      if (!canManage) {
        return res.status(403).json({ success: false, message: '无权管理该帖子' });
      }
    }

    await pool.execute(
      'UPDATE posts SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    // 如果帖子有关联的约球，同步更新约球状态
    if (status === 'deleted' || status === 'hidden') {
      // 将关联的约球设为取消状态
      await pool.execute(
        'UPDATE match_invitations SET status = ?, updated_at = NOW() WHERE post_id = ?',
        ['cancelled', id]
      );
    } else if (status === 'active') {
      // 恢复关联的约球为开放状态（如果之前被取消了）
      await pool.execute(
        'UPDATE match_invitations SET status = ?, updated_at = NOW() WHERE post_id = ? AND status = ?',
        ['open', id, 'cancelled']
      );
    }

    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('Update post status error:', error);
    res.json({ success: false, message: '更新状态失败' });
  }
});

// ============ 约球管理 ============

// 获取约球列表（包括独立约球和关联帖子的约球）
router.get('/match-invitations', requireAdmin, async (req, res) => {
  try {
    const { status, school_id, standalone, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { adminContext } = req;

    let sql = `
      SELECT mi.*,
             u.name as creator_name, u.avatar_url as creator_avatar,
             s.name as school_name,
             p.content as post_content, p.status as post_status,
             (SELECT COUNT(*) FROM invitation_participants ip WHERE ip.invitation_id = mi.id AND ip.status = 'confirmed') as participant_count
      FROM match_invitations mi
      LEFT JOIN users u ON mi.creator_id = u.id
      LEFT JOIN schools s ON mi.school_id = s.id
      LEFT JOIN posts p ON mi.post_id = p.id
      WHERE 1=1
    `;
    const params = [];

    // 权限过滤：学校管理员只能看到自己学校的约球
    if (!adminContext.isSuperAdmin) {
      if (adminContext.managedSchoolIds && adminContext.managedSchoolIds.length > 0) {
        sql += ` AND mi.school_id IN (${adminContext.managedSchoolIds.join(',')})`;
      } else {
        return res.json({ success: true, data: { list: [], total: 0, page: parseInt(page), limit: parseInt(limit) } });
      }
    }

    if (status) {
      sql += ' AND mi.status = ?';
      params.push(status);
    }
    if (school_id) {
      sql += ' AND mi.school_id = ?';
      params.push(school_id);
    }
    if (standalone === 'true') {
      sql += ' AND mi.post_id IS NULL';
    } else if (standalone === 'false') {
      sql += ' AND mi.post_id IS NOT NULL';
    }

    // 获取总数
    let countSql = sql.replace(/SELECT mi\.\*,[\s\S]*?FROM match_invitations mi/, 'SELECT COUNT(*) as total FROM match_invitations mi');
    const [[{ total }]] = await pool.execute(countSql, params);

    sql += ' ORDER BY mi.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [invitations] = await pool.execute(sql, params);

    // 转换头像URL
    const list = invitations.map(inv => ({
      ...inv,
      creator_avatar: toFullUrl(inv.creator_avatar, req)
    }));

    res.json({
      success: true,
      data: {
        list,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get match invitations error:', error);
    res.json({ success: false, message: '获取约球列表失败' });
  }
});

// 更新约球状态
router.put('/match-invitations/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { adminContext } = req;

    // 验证状态值
    if (!['open', 'full', 'ongoing', 'finished', 'cancelled'].includes(status)) {
      return res.json({ success: false, message: '无效的状态值' });
    }

    // 获取约球信息以检查权限
    const [[invitation]] = await pool.execute('SELECT school_id, post_id FROM match_invitations WHERE id = ?', [id]);
    if (!invitation) {
      return res.json({ success: false, message: '约球不存在' });
    }

    // 权限检查：学校管理员只能管理自己学校的约球
    if (!adminContext.isSuperAdmin) {
      if (!adminContext.managedSchoolIds || !adminContext.managedSchoolIds.includes(invitation.school_id)) {
        return res.status(403).json({ success: false, message: '无权管理该约球' });
      }
    }

    await pool.execute(
      'UPDATE match_invitations SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    // 如果约球有关联的帖子，且状态变为取消，同时隐藏帖子
    if (invitation.post_id && status === 'cancelled') {
      await pool.execute(
        'UPDATE posts SET status = ?, updated_at = NOW() WHERE id = ?',
        ['hidden', invitation.post_id]
      );
    }

    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('Update match invitation status error:', error);
    res.json({ success: false, message: '更新状态失败' });
  }
});

// ============ 邀请管理 ============

// 获取邀请列表
router.get('/invitations', requireAdmin, async (req, res) => {
  try {
    const { event_id, type, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT
        i.id,
        i.event_id,
        i.type,
        i.status,
        i.message,
        i.created_at,
        i.responded_at,
        e.title as event_title,
        u1.id as inviter_id,
        u1.name as inviter_name,
        u1.phone as inviter_phone,
        u1.avatar_url as inviter_avatar,
        u2.id as invitee_id,
        u2.name as invitee_name,
        u2.phone as invitee_phone,
        u2.avatar_url as invitee_avatar
      FROM team_invitations i
      JOIN events e ON i.event_id = e.id
      JOIN users u1 ON i.inviter_id = u1.id
      JOIN users u2 ON i.invitee_id = u2.id
      WHERE 1=1
    `;
    const params = [];

    if (event_id) {
      sql += ' AND i.event_id = ?';
      params.push(event_id);
    }
    if (type) {
      sql += ' AND i.type = ?';
      params.push(type);
    }
    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [invitations] = await pool.execute(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM team_invitations i WHERE 1=1';
    const countParams = [];
    if (event_id) {
      countSql += ' AND i.event_id = ?';
      countParams.push(event_id);
    }
    if (type) {
      countSql += ' AND i.type = ?';
      countParams.push(type);
    }
    if (status) {
      countSql += ' AND i.status = ?';
      countParams.push(status);
    }
    const [[{ total }]] = await pool.execute(countSql, countParams);

    res.json({ success: true, data: invitations, total });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.json({ success: false, message: '获取邀请列表失败' });
  }
});

// 代为接受邀请
router.post('/invitations/:id/accept', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取邀请信息
    const [[invitation]] = await pool.execute(
      'SELECT * FROM team_invitations WHERE id = ?',
      [id]
    );

    if (!invitation) {
      return res.json({ success: false, message: '邀请不存在' });
    }

    if (invitation.status !== 'pending') {
      return res.json({ success: false, message: '该邀请已被处理' });
    }

    // 更新邀请状态
    await pool.execute(
      "UPDATE team_invitations SET status = 'accepted', responded_at = NOW() WHERE id = ?",
      [id]
    );

    // 如果是双打邀请，更新报名记录
    if (invitation.type === 'doubles') {
      // 检查邀请人是否已报名
      const [inviterReg] = await pool.execute(
        'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?',
        [invitation.event_id, invitation.inviter_id]
      );

      if (inviterReg.length > 0) {
        // 更新邀请人的报名记录，添加搭档
        await pool.execute(
          "UPDATE event_registrations SET partner_id = ?, status = 'confirmed' WHERE event_id = ? AND user_id = ?",
          [invitation.invitee_id, invitation.event_id, invitation.inviter_id]
        );
      }
    }

    res.json({ success: true, message: '已接受邀请' });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.json({ success: false, message: '接受邀请失败' });
  }
});

// 代为拒绝邀请
router.post('/invitations/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取邀请信息
    const [[invitation]] = await pool.execute(
      'SELECT * FROM team_invitations WHERE id = ?',
      [id]
    );

    if (!invitation) {
      return res.json({ success: false, message: '邀请不存在' });
    }

    if (invitation.status !== 'pending') {
      return res.json({ success: false, message: '该邀请已被处理' });
    }

    // 更新邀请状态
    await pool.execute(
      "UPDATE team_invitations SET status = 'rejected', responded_at = NOW() WHERE id = ?",
      [id]
    );

    res.json({ success: true, message: '已拒绝邀请' });
  } catch (error) {
    console.error('Reject invitation error:', error);
    res.json({ success: false, message: '拒绝邀请失败' });
  }
});

module.exports = router;
