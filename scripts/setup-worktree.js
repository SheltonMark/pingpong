// scripts/setup-worktree.js
// 在新建 worktree 后运行此脚本来配置环境
// 用法: node scripts/setup-worktree.js <worktree-path>

const fs = require('fs');
const path = require('path');

const ENV_CONTENT = `DB_HOST=sh-cynosdbmysql-grp-13i98w58.sql.tencentcdb.com
DB_PORT=23262
DB_USER=root
DB_PASSWORD=d6jpFcBF
DB_NAME=pingpong
`;

function setupWorktree(worktreePath) {
  const backendEnvPath = path.join(worktreePath, 'backend', '.env');

  // 确保 backend 目录存在
  const backendDir = path.dirname(backendEnvPath);
  if (!fs.existsSync(backendDir)) {
    console.error(`❌ Backend directory not found: ${backendDir}`);
    process.exit(1);
  }

  // 创建 .env 文件
  if (fs.existsSync(backendEnvPath)) {
    console.log(`⚠️ .env already exists at ${backendEnvPath}`);
  } else {
    fs.writeFileSync(backendEnvPath, ENV_CONTENT);
    console.log(`✅ Created .env at ${backendEnvPath}`);
  }

  // 安装依赖
  console.log(`\n📦 To install dependencies, run:`);
  console.log(`   cd ${path.join(worktreePath, 'backend')} && npm install`);
}

// 获取 worktree 路径
const worktreePath = process.argv[2] || process.cwd();
console.log(`🔧 Setting up worktree: ${worktreePath}\n`);
setupWorktree(worktreePath);
