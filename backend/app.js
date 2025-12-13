const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');
const indexRoutes = require('./routes/index');
const commonRoutes = require('./routes/common');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api', indexRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/user', userRoutes);

// 启动服务器
async function startServer() {
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('⚠️ 数据库未连接，部分功能可能不可用');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
}

startServer();
