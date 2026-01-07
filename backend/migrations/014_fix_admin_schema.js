const { pool } = require('../config/database');

async function up() {
  const connection = await pool.getConnection();
  try {
    // Helper to check if column exists
    async function columnExists(table, column) {
      const [rows] = await connection.query(`
        SELECT COUNT(*) as count FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      `, [table, column]);
      return rows[0].count > 0;
    }

    // Helper to check if table exists
    async function tableExists(table) {
      const [rows] = await connection.query(`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?
      `, [table]);
      return rows[0].count > 0;
    }

    // 1. 学校表添加省份城市
    if (!await columnExists('schools', 'province')) {
      await connection.query('ALTER TABLE schools ADD COLUMN province VARCHAR(50) COMMENT "省份" AFTER short_name');
      console.log('  Added schools.province');
    }
    if (!await columnExists('schools', 'city')) {
      await connection.query('ALTER TABLE schools ADD COLUMN city VARCHAR(50) COMMENT "城市" AFTER province');
      console.log('  Added schools.city');
    }

    // 2. 学习资料表添加缺失字段
    if (!await columnExists('learning_materials', 'original_name')) {
      await connection.query('ALTER TABLE learning_materials ADD COLUMN original_name VARCHAR(200) COMMENT "原始文件名" AFTER url');
      console.log('  Added learning_materials.original_name');
    }
    if (!await columnExists('learning_materials', 'description')) {
      await connection.query('ALTER TABLE learning_materials ADD COLUMN description TEXT COMMENT "描述" AFTER original_name');
      console.log('  Added learning_materials.description');
    }

    // 3. 公告表添加兼容字段
    if (!await columnExists('announcements', 'status')) {
      await connection.query('ALTER TABLE announcements ADD COLUMN status VARCHAR(20) DEFAULT "active" COMMENT "状态" AFTER is_active');
      console.log('  Added announcements.status');
    }
    if (!await columnExists('announcements', 'link_id')) {
      await connection.query('ALTER TABLE announcements ADD COLUMN link_id INT COMMENT "关联ID" AFTER link_type');
      console.log('  Added announcements.link_id');
    }

    // 4. 创建 rating_logs 表
    if (!await tableExists('rating_logs')) {
      await connection.query(`
        CREATE TABLE rating_logs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          change_amount INT NOT NULL COMMENT '变动值',
          reason VARCHAR(200) COMMENT '原因',
          admin_id INT COMMENT '操作管理员',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分调整日志'
      `);
      console.log('  Created rating_logs table');
    }

    console.log('Admin schema fixes completed');
  } finally {
    connection.release();
  }
}

async function down() {
  console.log('Cannot undo schema changes');
}

module.exports = { up, down };
