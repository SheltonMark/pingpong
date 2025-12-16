const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 获取签到点列表
router.get('/points', async (req, res) => {
  try {
    const { school_id, lat, lng } = req.query;

    let sql = `
      SELECT p.*, s.name as school_name,
        (6371000 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
      FROM check_in_points p
      LEFT JOIN schools s ON p.school_id = s.id
      WHERE p.status = 'active'
    `;
    const params = [lat || 0, lng || 0, lat || 0];

    if (school_id) {
      sql += ' AND p.school_id = ?';
      params.push(school_id);
    }

    sql += ' ORDER BY distance ASC';

    const [points] = await pool.query(sql, params);
    res.json({ success: true, data: points });
  } catch (error) {
    console.error('获取签到点失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 签到
router.post('/check-in', async (req, res) => {
  try {
    const { user_id, point_id, latitude, longitude } = req.body;

    if (!user_id || !point_id) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    // 获取签到点信息
    const [points] = await pool.query(
      'SELECT * FROM check_in_points WHERE id = ? AND status = "active"',
      [point_id]
    );

    if (points.length === 0) {
      return res.status(404).json({ success: false, message: '签到点不存在' });
    }

    const point = points[0];

    // 计算距离
    const distance = calculateDistance(
      latitude, longitude,
      point.latitude, point.longitude
    );

    // 检查是否在范围内
    if (distance > point.radius) {
      return res.json({
        success: false,
        message: `距离签到点${Math.round(distance)}米，超出范围`
      });
    }

    // 检查今日是否已签到
    const [existing] = await pool.query(
      `SELECT id FROM check_ins
       WHERE user_id = ? AND point_id = ? AND DATE(check_in_time) = CURDATE()`,
      [user_id, point_id]
    );

    if (existing.length > 0) {
      return res.json({ success: false, message: '今日已签到' });
    }

    // 插入签到记录
    await pool.query(
      `INSERT INTO check_ins (user_id, point_id, latitude, longitude, distance)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, point_id, latitude, longitude, Math.round(distance)]
    );

    res.json({ success: true, message: '签到成功' });
  } catch (error) {
    console.error('签到失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取签到记录
router.get('/records', async (req, res) => {
  try {
    const { user_id, month } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    let sql = `
      SELECT c.*, p.name as point_name, p.location
      FROM check_ins c
      LEFT JOIN check_in_points p ON c.point_id = p.id
      WHERE c.user_id = ?
    `;
    const params = [user_id];

    if (month) {
      sql += ' AND DATE_FORMAT(c.check_in_time, "%Y-%m") = ?';
      params.push(month);
    }

    sql += ' ORDER BY c.check_in_time DESC LIMIT 50';

    const [records] = await pool.query(sql, params);

    // 统计本月签到次数
    const [stats] = await pool.query(
      `SELECT COUNT(*) as count FROM check_ins
       WHERE user_id = ? AND DATE_FORMAT(check_in_time, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")`,
      [user_id]
    );

    res.json({
      success: true,
      data: {
        records,
        monthly_count: stats[0].count
      }
    });
  } catch (error) {
    console.error('获取签到记录失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 计算两点距离（米）
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = router;
