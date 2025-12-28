const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { getUserRoles } = require('../middleware/adminAuth');

// 登录
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.json({ success: false, message: '请输入手机号和密码' });
    }

    // 查找用户
    const [[user]] = await pool.execute(
      'SELECT id, name, phone, school_id, admin_password, password_changed FROM users WHERE phone = ?',
      [phone]
    );

    if (!user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    if (!user.admin_password) {
      return res.json({ success: false, message: '该账号未开通管理权限' });
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.admin_password);
    if (!isMatch) {
      return res.json({ success: false, message: '密码错误' });
    }

    // 获取角色
    const roles = await getUserRoles(user.id);
    const adminRoles = roles.filter(r =>
      ['super_admin', 'school_admin', 'event_manager'].includes(r.code)
    );

    if (adminRoles.length === 0) {
      return res.json({ success: false, message: '无管理权限' });
    }

    // 构建权限列表
    const permissions = getPermissions(adminRoles);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          school_id: user.school_id
        },
        roles: adminRoles,
        permissions,
        needChangePassword: !user.password_changed
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: '登录失败' });
  }
});

// 修改密码
router.post('/change-password', async (req, res) => {
  try {
    const { user_id, old_password, new_password } = req.body;

    if (!user_id || !old_password || !new_password) {
      return res.json({ success: false, message: '参数不完整' });
    }

    if (new_password.length < 6) {
      return res.json({ success: false, message: '新密码长度至少6位' });
    }

    // 查找用户
    const [[user]] = await pool.execute(
      'SELECT admin_password FROM users WHERE id = ?',
      [user_id]
    );

    if (!user || !user.admin_password) {
      return res.json({ success: false, message: '用户不存在' });
    }

    // 验证旧密码
    const isMatch = await bcrypt.compare(old_password, user.admin_password);
    if (!isMatch) {
      return res.json({ success: false, message: '原密码错误' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 更新密码
    await pool.execute(
      'UPDATE users SET admin_password = ?, password_changed = 1 WHERE id = ?',
      [hashedPassword, user_id]
    );

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Change password error:', error);
    res.json({ success: false, message: '密码修改失败' });
  }
});

// 检查登录状态
router.get('/check', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.json({ success: false, message: '未登录' });
    }

    // 查找用户
    const [[user]] = await pool.execute(
      'SELECT id, name, phone, school_id, admin_password, password_changed FROM users WHERE id = ?',
      [user_id]
    );

    if (!user || !user.admin_password) {
      return res.json({ success: false, message: '无管理权限' });
    }

    // 获取角色
    const roles = await getUserRoles(user.id);
    const adminRoles = roles.filter(r =>
      ['super_admin', 'school_admin', 'event_manager'].includes(r.code)
    );

    if (adminRoles.length === 0) {
      return res.json({ success: false, message: '无管理权限' });
    }

    // 构建权限列表
    const permissions = getPermissions(adminRoles);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          school_id: user.school_id
        },
        roles: adminRoles,
        permissions,
        needChangePassword: !user.password_changed
      }
    });
  } catch (error) {
    console.error('Check auth error:', error);
    res.json({ success: false, message: '验证失败' });
  }
});

// 根据角色获取权限列表
function getPermissions(roles) {
  const permissions = new Set();

  for (const role of roles) {
    switch (role.code) {
      case 'super_admin':
        // 超级管理员拥有所有权限
        permissions.add('events');
        permissions.add('users');
        permissions.add('scores');
        permissions.add('announcements');
        permissions.add('learning');
        permissions.add('checkin');
        permissions.add('admins');
        permissions.add('stats');
        break;
      case 'school_admin':
        // 学校管理员
        permissions.add('events');
        permissions.add('users_readonly');
        permissions.add('scores');
        permissions.add('announcements');
        permissions.add('learning');
        permissions.add('checkin');
        permissions.add('stats');
        break;
      case 'event_manager':
        // 赛事管理员
        permissions.add('events');
        permissions.add('scores');
        break;
    }
  }

  return Array.from(permissions);
}

module.exports = router;
