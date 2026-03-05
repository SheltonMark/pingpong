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
      return res.json({ success: false, message: '请输入账号和密码' });
    }

    // 查找用户（支持手机号或用户名登录）
    const [[user]] = await pool.execute(
      'SELECT id, name, phone, username, school_id, admin_password, password_changed FROM users WHERE phone = ? OR username = ?',
      [phone, phone]
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

// 初始化超级管理员（仅用于首次设置，生产环境应删除此接口）
router.get('/init-super-admin', async (req, res) => {
  try {
    const { phone, secret } = req.query;

    // 简单的安全验证
    if (secret !== 'pingpong2024init') {
      return res.json({ success: false, message: '无权访问' });
    }

    if (!phone) {
      return res.json({ success: false, message: '请提供手机号' });
    }

    // 查找用户
    const [[user]] = await pool.execute(
      'SELECT id, name, admin_password FROM users WHERE phone = ?',
      [phone]
    );

    if (!user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    // 查找 super_admin 角色
    let [[role]] = await pool.execute(
      "SELECT id FROM roles WHERE code = 'super_admin'"
    );

    if (!role) {
      // 如果角色不存在，创建它
      const [result] = await pool.execute(
        "INSERT INTO roles (code, name, description, created_at) VALUES ('super_admin', '超级管理员', '系统最高权限', NOW())"
      );
      role = { id: result.insertId };
    }

    // 检查是否已有该角色
    const [existing] = await pool.execute(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [user.id, role.id]
    );

    if (existing.length === 0) {
      // 分配角色
      await pool.execute(
        'INSERT INTO user_roles (user_id, role_id, granted_at) VALUES (?, ?, NOW())',
        [user.id, role.id]
      );
    }

    // 如果没有管理密码，设置默认密码 123456
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
      data: {
        user_id: user.id,
        name: user.name,
        default_password: user.admin_password ? '(已有密码)' : '123456'
      }
    });
  } catch (error) {
    console.error('Init super admin error:', error);
    res.json({ success: false, message: '设置失败: ' + error.message });
  }
});

// 批量创建学校管理员（临时接口，用完应删除）
router.get('/seed-school-admins', async (req, res) => {
  try {
    const { secret } = req.query;
    if (secret !== 'pingpong2024init') {
      return res.json({ success: false, message: '无权访问' });
    }

    const schoolAdmins = [
      ['浙江大学', 'zjdx'], ['中国美术学院', 'zgmsxy'], ['浙江工业大学', 'zjgydx'],
      ['浙江理工大学', 'zjlgdx'], ['杭州电子科技大学', 'hzdzkjdx'], ['浙江工商大学', 'zjgsdx'],
      ['浙江财经大学', 'zjcjdx'], ['中国计量大学', 'zgjldx'], ['浙江中医药大学', 'zjzyydx'],
      ['浙江农林大学', 'zjnldx'], ['杭州师范大学', 'hzsfdx'], ['浙江科技大学', 'zjkjdx'],
      ['浙江传媒学院', 'zjcmxy'], ['浙江水利水电学院', 'zjslsdxy'], ['浙江外国语学院', 'zjwgyxy'],
      ['浙江警察学院', 'zjjcxy'], ['浙江音乐学院', 'zjylxy'], ['杭州医学院', 'hzyxy'],
      ['浙大城市学院', 'zdcsxy'], ['西湖大学', 'xhdx'], ['浙江树人学院', 'zjsrxy'],
      ['杭州电子科技大学信息工程学院', 'hzdzkjdxxxgcxy'], ['浙江中医药大学滨江学院', 'zjzyydxbjxy'],
      ['杭州师范大学钱江学院', 'hzsfdxqjxy'], ['浙江机电职业技术大学', 'zjjdzyjsdx'],
      ['浙江金融职业学院', 'zjjrzyxy'], ['浙江经济职业技术学院', 'zjjjzyjsxy'],
      ['浙江交通职业技术学院', 'zjjtzyjsxy'], ['浙江商业职业技术学院', 'zjsyzyjsxy'],
      ['浙江建设职业技术学院', 'zjjszyjsxy'], ['浙江艺术职业学院', 'zjyszyxy'],
      ['浙江经贸职业技术学院', 'zjjmzyjsxy'], ['浙江旅游职业学院', 'zjlyzyxy'],
      ['浙江警官职业学院', 'zjjgzyxy'], ['浙江体育职业技术学院', 'zjtyzyjsxy'],
      ['浙江电力职业技术学院', 'zjdlzyjsxy'], ['浙江同济科技职业学院', 'zjtjkjzyxy'],
      ['浙江特殊教育职业学院', 'zjtsjyzyxy'], ['杭州职业技术学院', 'hzzyjsxy'],
      ['杭州科技职业技术学院', 'hzkjzyjsxy'], ['杭州万向职业技术学院', 'hzwxzyjsxy'],
      ['浙江育英职业技术学院', 'zjyyzyjsxy'], ['浙江长征职业技术学院', 'zjczzyjsxy'],
      ['浙江工商大学杭州商学院', 'zjgsdxhzsxy'], ['宁波大学', 'nbdx'],
      ['浙大宁波理工学院', 'zdnblgxy'], ['宁波工程学院', 'nbgcxy'],
      ['宁波诺丁汉大学', 'nbndhdx'], ['宁波财经学院', 'nbcjxy'],
      ['宁波大学科学技术学院', 'nbdxkxjsxy'], ['浙江药科职业大学', 'zjykzydx'],
      ['宁波职业技术学院', 'nbzyjsxy'], ['宁波城市职业技术学院', 'nbcszyjsxy'],
      ['宁波卫生职业技术学院', 'nbwszyjsxy'], ['浙江纺织服装职业技术学院', 'zjfzfzzyjsxy'],
      ['浙江工商职业技术学院', 'zjgszyjsxy'], ['宁波幼儿师范高等专科学校', 'nbyesfgdzkxx'],
      ['浙江万里学院', 'zjwlxy'], ['温州医科大学', 'wzykdx'], ['温州大学', 'wzdx'],
      ['温州理工学院', 'wzlgxy'], ['温州肯恩大学', 'wzkedx'], ['温州商学院', 'wzsxy'],
      ['温州医科大学仁济学院', 'wzykdxrjxy'], ['温州职业技术学院', 'wzzyjsxy'],
      ['浙江工贸职业技术学院', 'zjgmzyjsxy'], ['浙江安防职业技术学院', 'zjafzyjsxy'],
      ['浙江东方职业技术学院', 'zjdfzyjsxy'], ['温州科技职业学院', 'wzkjzyxy'],
      ['绍兴文理学院', 'sxwlxy'], ['浙江越秀外国语学院', 'zjyxwgyxy'],
      ['绍兴文理学院元培学院', 'sxwlxyypxy'], ['浙江工业大学之江学院', 'zjgydxzjxy'],
      ['浙江理工大学科技与艺术学院', 'zjlgdxkjyysxy'], ['浙江农林大学暨阳学院', 'zjnldxjyxy'],
      ['绍兴职业技术学院', 'sxzyjsxy'], ['浙江农业商贸职业学院', 'zjnysmzyxy'],
      ['浙江邮电职业技术学院', 'zjydzyjsxy'], ['湖州师范学院', 'hzsfxy'],
      ['湖州学院', 'hzxy'], ['湖州职业技术学院', 'huzyzyjsxy'],
      ['浙江宇翔职业技术学院', 'zjyxzyjsxy'], ['嘉兴大学', 'jxdx'],
      ['嘉兴南湖学院', 'jxnhxy'], ['浙江财经大学东方学院', 'zjcjdxdfxy'],
      ['嘉兴职业技术学院', 'jxzyjsxy'], ['嘉兴南洋职业技术学院', 'jxnyzyjsxy'],
      ['同济大学浙江学院', 'tjdxzjxy'], ['浙江师范大学', 'zjsfdx'],
      ['浙江师范大学行知学院', 'zjsfdxxzxy'], ['中国计量大学现代科技学院', 'zgjldxxdkjxy'],
      ['金华职业技术大学', 'jhzyjsdx'], ['浙江广厦建设职业技术大学', 'zjgsjszyjsdx'],
      ['义乌工商职业技术学院', 'ywgszyjsxy'], ['浙江横店影视职业学院', 'zjhdyszyxy'],
      ['浙江金华科贸职业技术学院', 'zjjhkmzyjsxy'], ['上海财经大学浙江学院', 'shcjdxzjxy'],
      ['衢州学院', 'qzxy'], ['衢州职业技术学院', 'qzzyjsxy'],
      ['台州学院', 'tzxy'], ['台州职业技术学院', 'tzzyjsxy'],
      ['台州科技职业学院', 'tzkjzyxy'], ['浙江汽车职业技术学院', 'zjqczyjsxy'],
      ['丽水学院', 'lsxy'], ['丽水职业技术学院', 'lszyjsxy'],
      ['浙江海洋大学', 'zjhydx'], ['浙江海洋大学东海科学技术学院', 'zjhydxdhkxjsxy'],
      ['舟山群岛新区旅游与健康职业学院', 'zsqdxqlyyjkzyxy'],
      ['浙江国际海运职业技术学院', 'zjgjhyzyjsxy'],
    ];

    // 获取 school_admin 角色 ID
    let [[role]] = await pool.execute("SELECT id FROM roles WHERE code = 'school_admin'");
    if (!role) {
      return res.json({ success: false, message: 'school_admin 角色不存在' });
    }

    const hashedPassword = await bcrypt.hash('123456', 10);
    const results = { created: [], skipped: [], schoolNotFound: [] };

    for (const [schoolName, username] of schoolAdmins) {
      const [[school]] = await pool.execute('SELECT id FROM schools WHERE name = ?', [schoolName]);
      if (!school) {
        results.schoolNotFound.push(schoolName);
        continue;
      }

      const [[existing]] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (existing) {
        results.skipped.push(`${username}(${schoolName})`);
        continue;
      }

      const [insertResult] = await pool.execute(
        `INSERT INTO users (openid, name, username, school_id, admin_password, password_changed, is_registered, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, NOW())`,
        [`admin_${username}`, `${schoolName}管理员`, username, school.id, hashedPassword]
      );

      await pool.execute(
        'INSERT INTO user_roles (user_id, role_id, school_id, granted_at) VALUES (?, ?, ?, NOW())',
        [insertResult.insertId, role.id, school.id]
      );

      results.created.push(`${username}(${schoolName})`);
    }

    res.json({
      success: true,
      message: `创建: ${results.created.length}, 跳过: ${results.skipped.length}, 学校未找到: ${results.schoolNotFound.length}`,
      data: results
    });
  } catch (error) {
    console.error('Seed school admins error:', error);
    res.json({ success: false, message: '执行失败: ' + error.message });
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
        permissions.add('schools');
        permissions.add('stats');
        permissions.add('posts');
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
        permissions.add('posts');
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
