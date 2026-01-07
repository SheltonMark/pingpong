// 添加学习资料封面URL字段
module.exports = async function(pool) {
  // 检查 cover_url 列是否存在
  const [columns] = await pool.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'learning_materials'
    AND COLUMN_NAME = 'cover_url'
  `);

  if (columns.length === 0) {
    await pool.execute(`
      ALTER TABLE learning_materials
      ADD COLUMN cover_url VARCHAR(500) NULL COMMENT '视频封面URL' AFTER url
    `);
    console.log('Added cover_url column to learning_materials');
  } else {
    console.log('cover_url column already exists');
  }
};
