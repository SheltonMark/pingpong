const { pool } = require('../config/database');

module.exports = {
  async up(db = pool) {
    const [columns] = await db.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'captain_applications'
        AND COLUMN_NAME IN ('status', 'cancelled_by', 'cancelled_at')`);
    const existing = new Map(columns.map(column => [column.COLUMN_NAME, column.COLUMN_TYPE]));
    if (!existing.get('status')?.includes("'cancelled'")) {
      await db.query("ALTER TABLE captain_applications MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending' COMMENT '申请状态'");
    }
    if (!existing.has('cancelled_by')) {
      await db.query('ALTER TABLE captain_applications ADD COLUMN cancelled_by INT NULL');
    }
    if (!existing.has('cancelled_at')) {
      await db.query('ALTER TABLE captain_applications ADD COLUMN cancelled_at DATETIME NULL');
    }
  }
};
