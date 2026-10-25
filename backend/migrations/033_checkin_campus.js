const { pool } = require('../config/database');

module.exports = {
  async up(db = pool) {
    const [columns] = await db.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'check_in_points' AND COLUMN_NAME = 'campus'`);
    if (columns.length === 0) {
      await db.query("ALTER TABLE check_in_points ADD COLUMN campus VARCHAR(100) NULL DEFAULT NULL COMMENT '所属校区'");
      // Only classify explicit, unambiguous names for this known school.
      // Coordinates, unnamed points and cross-school common points are not guessed.
      await db.query(`
        UPDATE check_in_points p JOIN schools s ON s.id = p.school_id
        SET p.campus = CASE
          WHEN p.name LIKE '%朝晖%' THEN '朝晖校区'
          WHEN p.name LIKE '%屏峰%' THEN '屏峰校区'
          WHEN p.name LIKE '%莫干山%' THEN '莫干山校区'
        END
        WHERE s.name = '浙江工业大学' AND p.campus IS NULL
          AND ((p.name LIKE '%朝晖%') + (p.name LIKE '%屏峰%') + (p.name LIKE '%莫干山%')) = 1`);
    }
    const [indexes] = await db.query(`
      SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'check_in_points'
        AND INDEX_NAME = 'idx_checkin_school_campus'`);
    if (indexes.length === 0) {
      await db.query('ALTER TABLE check_in_points ADD INDEX idx_checkin_school_campus (school_id, campus)');
    }
  }
};
