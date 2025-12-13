const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/database');

const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;

// 微信登录
router.post('/wx-login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: '缺少 code' });
    }

    let openid, unionid;

    // 开发模式：如果没有配置 WX_SECRET，使用模拟 openid
    if (!WX_SECRET || WX_SECRET === 'your_app_secret_here') {
      console.log('⚠️ 开发模式：使用模拟 openid');
      openid = 'dev_' + code.substring(0, 16);
    } else {
      // 生产模式：调用微信接口获取 openid
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;

      const wxRes = await axios.get(wxUrl);
      const { errcode, errmsg } = wxRes.data;
      openid = wxRes.data.openid;
      unionid = wxRes.data.unionid;

      if (errcode) {
        console.error('微信登录失败:', errcode, errmsg);
        return res.status(400).json({
          success: false,
          message: `微信登录失败: ${errmsg}`
        });
      }
    }

    // 查找或创建用户
    const [existing] = await pool.query('SELECT * FROM users WHERE openid = ?', [openid]);

    let user;
    if (existing.length === 0) {
      // 新用户，只创建基本记录
      const [result] = await pool.execute(
        'INSERT INTO users (openid, union_id) VALUES (?, ?)',
        [openid, unionid || null]
      );
      user = {
        id: result.insertId,
        openid,
        is_registered: false,
        privacy_agreed: false
      };
    } else {
      user = existing[0];
    }

    // 返回用户状态
    res.json({
      success: true,
      data: {
        openid,
        user_id: user.id,
        is_registered: !!user.is_registered,
        privacy_agreed: !!user.privacy_agreed,
        name: user.name || null
      }
    });
  } catch (error) {
    console.error('微信登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户头像和昵称（从微信获取）
router.post('/update-wx-info', async (req, res) => {
  try {
    const { openid, avatar_url, nickname } = req.body;
    if (!openid) {
      return res.status(400).json({ success: false, message: '缺少 openid' });
    }

    await pool.execute(
      'UPDATE users SET avatar_url = ?, name = COALESCE(name, ?) WHERE openid = ?',
      [avatar_url, nickname, openid]
    );

    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新微信信息失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
