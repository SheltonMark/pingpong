const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');
const indexRoutes = require('./routes/index');
const commonRoutes = require('./routes/common');
const userRoutes = require('./routes/user');
const authRoutes = require('./routes/auth');
const eventsRouter = require('./routes/events');
const announcementsRouter = require('./routes/announcements');
const postsRouter = require('./routes/posts');
const invitationsRouter = require('./routes/invitations');
const checkinRouter = require('./routes/checkin');
const learningRouter = require('./routes/learning');
const rankingsRouter = require('./routes/rankings');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api', indexRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/user', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/learning', learningRouter);
app.use('/api/rankings', rankingsRouter);
app.use('/api/admin', adminRouter);

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
