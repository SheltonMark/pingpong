const express = require('express');
const router = express.Router();

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Hello World（保留用于测试）
router.get('/hello', (req, res) => {
  res.json({
    success: true,
    message: 'Hello World',
    data: {
      text: '欢迎使用浙工大乒协小程序！',
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
