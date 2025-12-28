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

// 获取用户完整信息（用于权限过滤）
async function getAdminContext(userId) {
  // 获取用户基本信息
  const [[user]] = await pool.execute(
    'SELECT id, name, phone, school_id FROM users WHERE id = ?',
    [userId]
  );

  if (!user) return null;

  // 获取角色
  const roles = await getUserRoles(userId);
  const adminRoles = roles.filter(r =>
    ['super_admin', 'school_admin', 'event_manager'].includes(r.code)
  );

  if (adminRoles.length === 0) return null;

  // 确定权限范围
  const isSuperAdminRole = adminRoles.some(r => r.code === 'super_admin');
  const schoolAdminRoles = adminRoles.filter(r => r.code === 'school_admin');
  const eventManagerRoles = adminRoles.filter(r => r.code === 'event_manager');

  // 获取可管理的学校ID列表
  let managedSchoolIds = [];
  if (isSuperAdminRole) {
    managedSchoolIds = null; // null 表示可以管理所有学校
  } else {
    managedSchoolIds = [
      ...schoolAdminRoles.map(r => r.school_id).filter(Boolean),
      user.school_id
    ].filter(Boolean);
    managedSchoolIds = [...new Set(managedSchoolIds)];
  }

  // 获取可管理的赛事ID列表
  let managedEventIds = [];
  if (isSuperAdminRole || schoolAdminRoles.length > 0) {
    managedEventIds = null; // null 表示可以管理所有赛事（或本校赛事）
  } else {
    managedEventIds = eventManagerRoles.map(r => r.event_id).filter(Boolean);
  }

  return {
    user,
    roles: adminRoles,
    isSuperAdmin: isSuperAdminRole,
    isSchoolAdmin: schoolAdminRoles.length > 0,
    isEventManager: eventManagerRoles.length > 0,
    managedSchoolIds,
    managedEventIds
  };
}

// Express 中间件：验证管理员权限（包含权限上下文）
function requireAdmin(req, res, next) {
  const userId = req.query.user_id || req.body.user_id;

  if (!userId) {
    return res.json({ success: false, message: '未登录' });
  }

  getAdminContext(userId).then(context => {
    if (!context) {
      return res.json({ success: false, message: '无管理权限' });
    }
    req.adminUserId = userId;
    req.adminContext = context;
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

// 辅助函数：根据权限过滤学校ID
function filterBySchool(context, schoolId) {
  if (context.isSuperAdmin) return true;
  if (!context.managedSchoolIds) return true;
  return context.managedSchoolIds.includes(parseInt(schoolId));
}

// 辅助函数：根据权限过滤赛事ID
function filterByEvent(context, eventId) {
  if (context.isSuperAdmin) return true;
  if (context.isSchoolAdmin) return true;
  if (!context.managedEventIds) return true;
  return context.managedEventIds.includes(parseInt(eventId));
}

module.exports = {
  isAdmin,
  isSuperAdmin,
  isSchoolAdmin,
  getUserRoles,
  getAdminContext,
  requireAdmin,
  requireSuperAdmin,
  filterBySchool,
  filterByEvent
};
