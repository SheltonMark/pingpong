const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 获取学习资料列表
router.get('/', async (req, res) => {
  try {
    const { type, school_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT m.*, u.name as author_name
      FROM learning_materials m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.status = 'active'
    `;
    const params = [];

    if (type) {
      sql += ' AND m.type = ?';
      params.push(type);
    }

    if (school_id) {
      sql += ' AND (m.school_id = ? OR m.school_id IS NULL)';
      params.push(school_id);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [materials] = await pool.query(sql, params);

    res.json({ success: true, data: { list: materials } });
  } catch (error) {
    console.error('获取学习资料失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取资料详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [materials] = await pool.query(
      `SELECT m.*, u.name as author_name
       FROM learning_materials m
       LEFT JOIN users u ON m.created_by = u.id
       WHERE m.id = ?`,
      [id]
    );

    if (materials.length === 0) {
      return res.status(404).json({ success: false, message: '资料不存在' });
    }

    // 增加浏览次数
    await pool.query(
      'UPDATE learning_materials SET view_count = view_count + 1 WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: materials[0] });
  } catch (error) {
    console.error('获取资料详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
