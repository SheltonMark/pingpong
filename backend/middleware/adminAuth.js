const { pool } = require('../config/database');

// 检查用户是否有管理员权限
async function isAdmin(userId, schoolId = null) {
  const [roles] = await pool.execute(`
    SELECT r.code FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
    AND r.code IN ('super_admin', 'school_admin', 'event_manager')
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  `, [userId]);

  return roles.length > 0;
}

// 检查是否是超级管理员
async function isSuperAdmin(userId) {
  const [roles] = await pool.execute(`
    SELECT r.code FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ? AND r.code = 'super_admin'
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  `, [userId]);

  return roles.length > 0;
}

// 检查是否是学校管理员
async function isSchoolAdmin(userId, schoolId) {
  const [roles] = await pool.execute(`
    SELECT r.code FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
    AND r.code IN ('super_admin', 'school_admin')
    AND (ur.school_id = ? OR r.code = 'super_admin')
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  `, [userId, schoolId]);

  return roles.length > 0;
}

// 获取用户角色列表
async function getUserRoles(userId) {
  const [roles] = await pool.execute(`
    SELECT r.code, r.name, ur.school_id, ur.event_id
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  `, [userId]);

  return roles;
}

// Express 中间件：验证管理员权限
function requireAdmin(req, res, next) {
  const userId = req.query.user_id || req.body.user_id;

  if (!userId) {
    return res.json({ success: false, message: '未登录' });
  }

  isAdmin(userId).then(result => {
    if (!result) {
      return res.json({ success: false, message: '无管理权限' });
    }
    req.adminUserId = userId;
    next();
  }).catch(err => {
    console.error('Admin auth error:', err);
    res.json({ success: false, message: '权限验证失败' });
  });
}

// Express 中间件：验证超级管理员权限
function requireSuperAdmin(req, res, next) {
  const userId = req.query.user_id || req.body.user_id;

  if (!userId) {
    return res.json({ success: false, message: '未登录' });
  }

  isSuperAdmin(userId).then(result => {
    if (!result) {
      return res.json({ success: false, message: '需要超级管理员权限' });
    }
    req.adminUserId = userId;
    next();
  }).catch(err => {
    console.error('Super admin auth error:', err);
    res.json({ success: false, message: '权限验证失败' });
  });
}

module.exports = {
  isAdmin,
  isSuperAdmin,
  isSchoolAdmin,
  getUserRoles,
  requireAdmin,
  requireSuperAdmin
};
