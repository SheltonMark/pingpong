const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json());

// Hello World 路由
app.get('/api/hello', (req, res) => {
  res.json({
    success: true,
    message: 'Hello World',
    data: {
      text: '欢迎使用浙工大乒协小程序！',
      timestamp: new Date().toISOString()
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
