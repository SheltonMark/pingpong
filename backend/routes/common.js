const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 获取学校列表
router.get('/schools', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, short_name FROM schools WHERE is_active = 1'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取学校列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取学院列表
router.get('/colleges', async (req, res) => {
  try {
    const { school_id } = req.query;
    if (!school_id) {
      return res.status(400).json({ success: false, message: '缺少 school_id' });
    }
    const [rows] = await pool.query(
      'SELECT id, name FROM colleges WHERE school_id = ? AND is_active = 1',
      [school_id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取学院列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取下属单位列表
router.get('/departments', async (req, res) => {
  try {
    const { school_id } = req.query;
    if (!school_id) {
      return res.status(400).json({ success: false, message: '缺少 school_id' });
    }
    const [rows] = await pool.query(
      'SELECT id, name FROM departments WHERE school_id = ? AND is_active = 1',
      [school_id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取下属单位列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
