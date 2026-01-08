const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 将相对URL转为完整URL
function toFullUrl(url, req) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // 优先使用环境变量
  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    baseUrl = `${protocol}://${host}`;
  }
  return baseUrl + url;
}

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

    // 转换URL为完整路径
    const list = materials.map(m => ({
      ...m,
      url: toFullUrl(m.url, req),
      cover_url: toFullUrl(m.cover_url, req)
    }));

    res.json({ success: true, data: { list } });
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

    // 转换URL为完整路径
    const material = {
      ...materials[0],
      url: toFullUrl(materials[0].url, req),
      cover_url: toFullUrl(materials[0].cover_url, req)
    };

    res.json({ success: true, data: material });
  } catch (error) {
    console.error('获取资料详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
