const { pool } = require('../config/database');

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 找出每个学校下重复的学院，只保留 id 最小的
    const [duplicates] = await connection.query(`
      SELECT c1.id
      FROM colleges c1
      INNER JOIN (
        SELECT school_id, name, MIN(id) as min_id
        FROM colleges
        GROUP BY school_id, name
      ) c2 ON c1.school_id = c2.school_id AND c1.name = c2.name AND c1.id > c2.min_id
    `);

    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map(d => d.id);
      console.log(`Found ${duplicateIds.length} duplicate colleges to remove`);

      // 2. 更新 users 表中引用了重复学院的记录
      await connection.query(`
        UPDATE users u
        INNER JOIN colleges c ON u.college_id = c.id
        INNER JOIN (
          SELECT school_id, name, MIN(id) as min_id
          FROM colleges
          GROUP BY school_id, name
        ) c2 ON c.school_id = c2.school_id AND c.name = c2.name
        SET u.college_id = c2.min_id
        WHERE u.college_id IN (?)
      `, [duplicateIds]);

      // 3. 删除重复的学院
      await connection.query(`DELETE FROM colleges WHERE id IN (?)`, [duplicateIds]);
      console.log(`Deleted ${duplicateIds.length} duplicate colleges`);
    } else {
      console.log('No duplicate colleges found');
    }

    // 4. 同样处理 departments 表
    const [deptDuplicates] = await connection.query(`
      SELECT d1.id
      FROM departments d1
      INNER JOIN (
        SELECT school_id, name, MIN(id) as min_id
        FROM departments
        GROUP BY school_id, name
      ) d2 ON d1.school_id = d2.school_id AND d1.name = d2.name AND d1.id > d2.min_id
    `);

    if (deptDuplicates.length > 0) {
      const deptDuplicateIds = deptDuplicates.map(d => d.id);
      console.log(`Found ${deptDuplicateIds.length} duplicate departments to remove`);

      await connection.query(`
        UPDATE users u
        INNER JOIN departments d ON u.department_id = d.id
        INNER JOIN (
          SELECT school_id, name, MIN(id) as min_id
          FROM departments
          GROUP BY school_id, name
        ) d2 ON d.school_id = d2.school_id AND d.name = d2.name
        SET u.department_id = d2.min_id
        WHERE u.department_id IN (?)
      `, [deptDuplicateIds]);

      await connection.query(`DELETE FROM departments WHERE id IN (?)`, [deptDuplicateIds]);
      console.log(`Deleted ${deptDuplicateIds.length} duplicate departments`);
    }

    await connection.commit();
    console.log('Cleanup completed successfully');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function down() {
  console.log('Cannot undo cleanup - data has been deleted');
}

module.exports = { up, down };
