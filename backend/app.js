const express = require('express');
const cors = require('cors');
const path = require('path');
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
const adminAuthRouter = require('./routes/adminAuth');
const uploadRouter = require('./routes/upload');
const subscriptionRouter = require('./routes/subscription');
const { autoConfirmScores } = require('./tasks/autoConfirmScores');

const app = express();
const PORT = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - Web 管理后台
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// 静态文件服务 - 上传文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

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
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/subscription', subscriptionRouter);

// 定时任务API（可由云函数定时触发）
app.post('/api/tasks/auto-confirm', async (req, res) => {
  try {
    const result = await autoConfirmScores();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Auto confirm task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 运行数据库迁移
async function runMigrations() {
  const fs = require('fs');
  const { pool } = require('./config/database');
  const migrationsDir = path.join(__dirname, 'migrations');

  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
      .sort();

    console.log(`📦 Running ${files.length} migrations...`);

    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const migration = require(path.join(migrationsDir, file));
          if (typeof migration.up === 'function') {
            await migration.up();
            console.log(`✅ ${file}`);
          }
        } catch (error) {
          // JS migrations handle their own errors
          console.log(`⚠️ ${file}: ${error.message.substring(0, 50)}`);
        }
      } else {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

        for (const statement of statements) {
          try {
            await pool.execute(statement);
          } catch (error) {
            // Ignore non-fatal errors like "table exists"
            const ignorable = ['ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY', 'ER_DUP_KEY', 'ER_DUP_KEYNAME'];
            if (!ignorable.includes(error.code)) {
              console.log(`⚠️ ${file}: ${error.message.substring(0, 50)}`);
            }
          }
        }
        console.log(`✅ ${file}`);
      }
    }
    console.log('🎉 Migrations complete');
  } catch (error) {
    console.error('Migration error:', error.message);
  }
}

// 启动服务器
async function startServer() {
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('⚠️ 数据库未连接，部分功能可能不可用');
  } else {
    // 运行迁移
    await runMigrations();

    // 启动定时任务：每小时检查一次超时比分
    setInterval(async () => {
      try {
        await autoConfirmScores();
      } catch (error) {
        console.error('定时任务执行失败:', error.message);
      }
    }, 60 * 60 * 1000); // 每小时执行一次

    console.log('⏰ 定时任务已启动（每小时检查超时比分）');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
}

startServer();
