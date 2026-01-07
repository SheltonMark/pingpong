// 添加赛事表新字段
module.exports = {
  async up(pool) {
    // 检查并添加 games_to_win 列
    const [cols1] = await pool.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'events'
      AND COLUMN_NAME = 'games_to_win'
    `);

    if (cols1.length === 0) {
      await pool.execute(`
        ALTER TABLE events
        ADD COLUMN games_to_win INT DEFAULT 3 COMMENT '几局几胜的胜数' AFTER best_of
      `);
      console.log('Added games_to_win column to events');
    } else {
      console.log('games_to_win column already exists');
    }

    // 检查并添加 description_image 列
    const [cols2] = await pool.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'events'
      AND COLUMN_NAME = 'description_image'
    `);

    if (cols2.length === 0) {
      await pool.execute(`
        ALTER TABLE events
        ADD COLUMN description_image VARCHAR(500) NULL COMMENT '赛事说明图片' AFTER description
      `);
      console.log('Added description_image column to events');
    } else {
      console.log('description_image column already exists');
    }
  }
};
