/**
 * 添加浙江工业职业技术学院及其学院和管理员账户
 * 使用方式: node scripts/seed-zjgyzyjsxy.js
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seed() {
  const conn = await pool.getConnection();
  try {
    // 1. 插入学校
    let schoolId;
    const [[existingSchool]] = await conn.execute(
      'SELECT id FROM schools WHERE name = ?',
      ['浙江工业职业技术学院']
    );
    if (existingSchool) {
      schoolId = existingSchool.id;
      console.log(`学校已存在, id=${schoolId}`);
    } else {
      const [result] = await conn.execute(
        "INSERT INTO schools (name, short_name, province, city) VALUES ('浙江工业职业技术学院', '浙工职院', '浙江省', '绍兴市')"
      );
      schoolId = result.insertId;
      console.log(`学校已创建, id=${schoolId}`);
    }

    // 2. 插入学院
    const colleges = [
      '机电工程学院', '建筑工程学院', '财经学院', '商贸学院',
      '交通学院', '信息与设计学院', '黄酒学院', '纺织工程学院',
      '新昌学院', '公共基础教学部', '马克思主义学院'
    ];
    for (const name of colleges) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM colleges WHERE school_id = ? AND name = ?',
        [schoolId, name]
      );
      if (!existing) {
        await conn.execute(
          'INSERT INTO colleges (school_id, name) VALUES (?, ?)',
          [schoolId, name]
        );
        console.log(`  学院已创建: ${name}`);
      } else {
        console.log(`  学院已存在: ${name}`);
      }
    }

    // 3. 创建管理员账户
    const username = 'zjgyzyjsxy';
    const [[existingUser]] = await conn.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existingUser) {
      console.log(`管理员账户已存在: ${username}, id=${existingUser.id}`);
    } else {
      const hashedPassword = await bcrypt.hash('123456', 10);
      const [userResult] = await conn.execute(
        `INSERT INTO users (openid, name, username, school_id, admin_password, password_changed, is_registered, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, NOW())`,
        [`admin_${username}`, '浙江工业职业技术学院管理员', username, schoolId, hashedPassword]
      );
      const userId = userResult.insertId;

      // 分配 school_admin 角色
      const [[role]] = await conn.execute("SELECT id FROM roles WHERE code = 'school_admin'");
      if (role) {
        await conn.execute(
          'INSERT INTO user_roles (user_id, role_id, school_id, granted_at) VALUES (?, ?, ?, NOW())',
          [userId, role.id, schoolId]
        );
      }
      console.log(`管理员已创建: ${username}, id=${userId}`);
    }

    console.log('完成!');
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    conn.release();
    process.exit(0);
  }
}

seed();