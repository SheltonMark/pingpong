// backend/routes/announcements.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 获取公告列表(轮播图)
router.get('/', async (req, res) => {
  try {
    const { school_id, limit = 5 } = req.query;

    let sql = `
      SELECT a.*, e.title as event_title
      FROM announcements a
      LEFT JOIN events e ON a.link_event_id = e.id
      WHERE a.is_active = 1
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
    `;
    const params = [];

    if (school_id) {
      sql += ' AND (a.school_id = ? OR a.school_id IS NULL)';
      params.push(school_id);
    }

    sql += ' ORDER BY a.sort_order DESC, a.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [rows] = await pool.query(sql, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取公告失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取公告详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [announcements] = await pool.query(`
      SELECT a.*, e.title as event_title, e.id as event_id
      FROM announcements a
      LEFT JOIN events e ON a.link_event_id = e.id
      WHERE a.id = ?
    `, [id]);

    if (announcements.length === 0) {
      return res.status(404).json({ success: false, message: '公告不存在' });
    }

    res.json({ success: true, data: announcements[0] });
  } catch (error) {
    console.error('获取公告详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
