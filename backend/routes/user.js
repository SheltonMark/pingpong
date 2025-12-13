const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

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
      // 创建新用户
      await pool.execute(
        'INSERT INTO users (openid, privacy_agreed, privacy_agreed_at) VALUES (?, 1, NOW())',
        [openid]
      );
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
      enrollment_year
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

    // 检查用户是否存在
    const [existing] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);

    if (existing.length === 0) {
      return res.status(400).json({
        success: false,
        message: '用户不存在，请先同意隐私政策'
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
        is_registered = 1,
        updated_at = NOW()
      WHERE openid = ?
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
      openid
    ]);

    // 为新用户分配普通用户角色
    const [roles] = await pool.query('SELECT id FROM roles WHERE code = ?', ['user']);
    if (roles.length > 0) {
      const [userRows] = await pool.query('SELECT id FROM users WHERE openid = ?', [openid]);
      await pool.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userRows[0].id, roles[0].id]
      );
    }

    res.json({ success: true, message: '注册成功' });
  } catch (error) {
    console.error('用户注册失败:', error);
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
        u.user_type, u.class_name, u.enrollment_year,
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

module.exports = router;
