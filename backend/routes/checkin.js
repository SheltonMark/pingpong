const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

async function getTodayActiveCheckIn(userId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT ci.*,
            p.name as point_name,
            p.location,
            p.latitude as point_latitude,
            p.longitude as point_longitude,
            p.radius as point_radius,
            p.start_time,
            p.end_time
     FROM check_ins ci
     LEFT JOIN check_in_points p ON ci.point_id = p.id
     WHERE ci.user_id = ?
       AND DATE(ci.check_in_time) = CURDATE()
       AND ci.check_out_time IS NULL
     ORDER BY ci.check_in_time DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

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
      sql += ' AND (p.school_id = ? OR p.school_id IS NULL)';
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

    const [points] = await pool.query(
      'SELECT * FROM check_in_points WHERE id = ? AND status = "active"',
      [point_id]
    );

    if (points.length === 0) {
      return res.status(404).json({ success: false, message: '签到点不存在' });
    }

    const point = points[0];
    const now = new Date();
    if (point.start_time && now < new Date(point.start_time)) {
      return res.json({ success: false, message: '签到尚未开始' });
    }
    if (point.end_time && now > new Date(point.end_time)) {
      return res.json({ success: false, message: '签到已结束' });
    }

    const distance = calculateDistance(
      latitude,
      longitude,
      point.latitude,
      point.longitude
    );

    if (distance > point.radius) {
      return res.json({
        success: false,
        message: `距离签到点${Math.round(distance)}米，超出范围`
      });
    }

    const activeRecord = await getTodayActiveCheckIn(user_id);
    if (activeRecord) {
      return res.json({
        success: false,
        message: `您今天已在${activeRecord.point_name || '签到点'}签到，请先签退`
      });
    }

    const [existing] = await pool.query(
      `SELECT id
       FROM check_ins
       WHERE user_id = ? AND DATE(check_in_time) = CURDATE()
       LIMIT 1`,
      [user_id]
    );

    if (existing.length > 0) {
      return res.json({ success: false, message: '今日已完成签到，请明天再来' });
    }

    await pool.query(
      `INSERT INTO check_ins (user_id, point_id, latitude, longitude, distance, check_in_time)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [user_id, point_id, latitude, longitude, Math.round(distance)]
    );

    res.json({ success: true, message: '签到成功' });
  } catch (error) {
    console.error('签到失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 签退
router.post('/check-out', async (req, res) => {
  try {
    const { user_id, point_id, latitude, longitude } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }

    const activeRecord = await getTodayActiveCheckIn(user_id);
    if (!activeRecord) {
      return res.json({ success: false, message: '当前没有待签退记录' });
    }

    if (point_id && parseInt(point_id, 10) !== parseInt(activeRecord.point_id, 10)) {
      return res.json({ success: false, message: '请在原签到点完成签退' });
    }

    if (!activeRecord.point_latitude || !activeRecord.point_longitude || !activeRecord.point_radius) {
      return res.json({ success: false, message: '签到点信息不完整，无法签退' });
    }

    const distance = calculateDistance(
      latitude,
      longitude,
      activeRecord.point_latitude,
      activeRecord.point_longitude
    );

    if (distance > activeRecord.point_radius) {
      return res.json({
        success: false,
        message: `距离签退点${Math.round(distance)}米，超出范围`
      });
    }

    await pool.query(
      `UPDATE check_ins
       SET check_out_time = NOW(),
           check_out_latitude = ?,
           check_out_longitude = ?,
           check_out_distance = ?
       WHERE id = ?`,
      [latitude, longitude, Math.round(distance), activeRecord.id]
    );

    const [updatedRows] = await pool.query(
      `SELECT check_out_time,
              TIMESTAMPDIFF(MINUTE, check_in_time, check_out_time) as duration_minutes
       FROM check_ins
       WHERE id = ?`,
      [activeRecord.id]
    );

    res.json({
      success: true,
      message: '签退成功',
      data: updatedRows[0] || null
    });
  } catch (error) {
    console.error('签退失败:', error);
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
      SELECT c.*,
             p.name as point_name,
             p.location,
             p.latitude as point_latitude,
             p.longitude as point_longitude,
             p.radius as point_radius,
             p.start_time,
             p.end_time,
             CASE
               WHEN c.check_out_time IS NULL THEN NULL
               ELSE TIMESTAMPDIFF(MINUTE, c.check_in_time, c.check_out_time)
             END as duration_minutes
      FROM check_ins c
      LEFT JOIN check_in_points p ON c.point_id = p.id
      WHERE c.user_id = ?
    `;
    const params = [user_id];
    const statsMonth = month || new Date().toISOString().slice(0, 7);

    if (month) {
      sql += ' AND DATE_FORMAT(c.check_in_time, "%Y-%m") = ?';
      params.push(month);
    }

    sql += ' ORDER BY c.check_in_time DESC LIMIT 50';

    const [records] = await pool.query(sql, params);
    const activeRecord = await getTodayActiveCheckIn(user_id);

    const [stats] = await pool.query(
      `SELECT COUNT(*) as count
       FROM check_ins
       WHERE user_id = ? AND DATE_FORMAT(check_in_time, "%Y-%m") = ?`,
      [user_id, statsMonth]
    );

    res.json({
      success: true,
      data: {
        records,
        monthly_count: stats[0].count,
        active_record: activeRecord
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
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = router;
