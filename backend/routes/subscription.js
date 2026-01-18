/**
 * 订阅消息路由
 * 处理用户订阅记录和模板配置
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const subscribeMessage = require('../utils/subscribeMessage');

/**
 * 记录用户订阅
 * POST /api/subscription/record
 * body: { user_id, template_types: ['INVITATION_RESULT', ...], counts: [1, ...] }
 */
router.post('/record', async (req, res) => {
  try {
    const { user_id, template_types, counts } = req.body;

    if (!user_id || !template_types || !Array.isArray(template_types)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 记录每个模板的订阅
    for (let i = 0; i < template_types.length; i++) {
      const templateType = template_types[i];
      const count = counts && counts[i] ? counts[i] : 1;

      await subscribeMessage.recordSubscription(user_id, templateType, count);
    }

    res.json({ success: true, message: '订阅记录成功' });
  } catch (error) {
    console.error('记录订阅失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 获取用户的订阅配额
 * GET /api/subscription/quota?user_id=xxx
 */
router.get('/quota', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const [subscriptions] = await pool.query(
      'SELECT template_type, remaining_count FROM user_subscriptions WHERE user_id = ?',
      [user_id]
    );

    const quota = {};
    for (const sub of subscriptions) {
      quota[sub.template_type] = sub.remaining_count;
    }

    res.json({ success: true, data: quota });
  } catch (error) {
    console.error('获取订阅配额失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 获取模板配置（管理用）
 * GET /api/subscription/templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = subscribeMessage.getTemplateConfig();
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('获取模板配置失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 更新模板ID（管理用）
 * POST /api/subscription/update-template
 * body: { template_type, template_id }
 */
router.post('/update-template', async (req, res) => {
  try {
    const { template_type, template_id, user_id } = req.body;

    // 简单的权限检查 - 只有超级管理员可以更新
    const [users] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [user_id]
    );

    if (users.length === 0 || users[0].role !== 'super_admin') {
      return res.status(403).json({ success: false, message: '无权限' });
    }

    if (!template_type || !template_id) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    subscribeMessage.updateTemplateId(template_type, template_id);

    res.json({ success: true, message: '模板ID已更新' });
  } catch (error) {
    console.error('更新模板ID失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 获取订阅消息发送日志（管理用）
 * GET /api/subscription/logs?page=1&limit=20
 */
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, user_id, template_type, status } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT sl.*, u.name as user_name
      FROM subscription_logs sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      sql += ' AND sl.user_id = ?';
      params.push(user_id);
    }
    if (template_type) {
      sql += ' AND sl.template_type = ?';
      params.push(template_type);
    }
    if (status) {
      sql += ' AND sl.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY sl.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [logs] = await pool.query(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM subscription_logs WHERE 1=1';
    const countParams = [];
    if (user_id) {
      countSql += ' AND user_id = ?';
      countParams.push(user_id);
    }
    if (template_type) {
      countSql += ' AND template_type = ?';
      countParams.push(template_type);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }

    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      success: true,
      data: {
        list: logs,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取发送日志失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
