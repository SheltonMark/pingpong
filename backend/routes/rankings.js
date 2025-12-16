const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 获取排行榜
router.get('/', async (req, res) => {
  try {
    const { school_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT
        u.id, u.name, u.avatar_url, u.points, u.wins, u.losses,
        s.name as school_name, s.short_name as school_short_name,
        c.name as college_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.is_registered = 1
    `;
    const params = [];

    if (school_id) {
      sql += ' AND u.school_id = ?';
      params.push(school_id);
    }

    sql += ' ORDER BY u.points DESC, u.wins DESC, u.losses ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users] = await pool.query(sql, params);

    // 添加排名
    const rankings = users.map((user, index) => ({
      ...user,
      rank: offset + index + 1,
      win_rate: (user.wins + user.losses) > 0
        ? Math.round(user.wins / (user.wins + user.losses) * 100)
        : 0
    }));

    res.json({ success: true, data: { list: rankings } });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取学校排行
router.get('/schools', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const [schools] = await pool.query(`
      SELECT
        s.id, s.name, s.short_name,
        COUNT(DISTINCT u.id) as player_count,
        SUM(u.points) as total_points,
        SUM(u.wins) as total_wins
      FROM schools s
      LEFT JOIN users u ON s.id = u.school_id AND u.is_registered = 1
      GROUP BY s.id
      ORDER BY total_points DESC
      LIMIT ?
    `, [parseInt(limit)]);

    const rankings = schools.map((school, index) => ({
      ...school,
      rank: index + 1
    }));

    res.json({ success: true, data: { list: rankings } });
  } catch (error) {
    console.error('获取学校排行失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
