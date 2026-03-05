/**
 * 批量创建各学校初始管理员账号
 * 用户名为学校名称拼音首字母，密码统一 123456
 *
 * 使用方式: node scripts/seed-school-admins.js
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

// 学校管理员数据：[学校名称, 用户名]
const schoolAdmins = [
  ['浙江大学', 'zjdx'],
  ['中国美术学院', 'zgmsxy'],
  ['浙江工业大学', 'zjgydx'],
  ['浙江理工大学', 'zjlgdx'],
  ['杭州电子科技大学', 'hzdzkjdx'],
  ['浙江工商大学', 'zjgsdx'],
  ['浙江财经大学', 'zjcjdx'],
  ['中国计量大学', 'zgjldx'],
  ['浙江中医药大学', 'zjzyydx'],
  ['浙江农林大学', 'zjnldx'],
  ['杭州师范大学', 'hzsfdx'],
  ['浙江科技大学', 'zjkjdx'],
  ['浙江传媒学院', 'zjcmxy'],
  ['浙江水利水电学院', 'zjslsdxy'],
  ['浙江外国语学院', 'zjwgyxy'],
  ['浙江警察学院', 'zjjcxy'],
  ['浙江音乐学院', 'zjylxy'],
  ['杭州医学院', 'hzyxy'],
  ['浙大城市学院', 'zdcsxy'],
  ['西湖大学', 'xhdx'],
  ['浙江树人学院', 'zjsrxy'],
  ['杭州电子科技大学信息工程学院', 'hzdzkjdxxxgcxy'],
  ['浙江中医药大学滨江学院', 'zjzyydxbjxy'],
  ['杭州师范大学钱江学院', 'hzsfdxqjxy'],
  ['浙江机电职业技术大学', 'zjjdzyjsdx'],
  ['浙江金融职业学院', 'zjjrzyxy'],
  ['浙江经济职业技术学院', 'zjjjzyjsxy'],
  ['浙江交通职业技术学院', 'zjjtzyjsxy'],
  ['浙江商业职业技术学院', 'zjsyzyjsxy'],
  ['浙江建设职业技术学院', 'zjjszyjsxy'],
  ['浙江艺术职业学院', 'zjyszyxy'],
  ['浙江经贸职业技术学院', 'zjjmzyjsxy'],
  ['浙江旅游职业学院', 'zjlyzyxy'],
  ['浙江警官职业学院', 'zjjgzyxy'],
  ['浙江体育职业技术学院', 'zjtyzyjsxy'],
  ['浙江电力职业技术学院', 'zjdlzyjsxy'],
  ['浙江同济科技职业学院', 'zjtjkjzyxy'],
  ['浙江特殊教育职业学院', 'zjtsjyzyxy'],
  ['杭州职业技术学院', 'hzzyjsxy'],
  ['杭州科技职业技术学院', 'hzkjzyjsxy'],
  ['杭州万向职业技术学院', 'hzwxzyjsxy'],
  ['浙江育英职业技术学院', 'zjyyzyjsxy'],
  ['浙江长征职业技术学院', 'zjczzyjsxy'],
  ['浙江工商大学杭州商学院', 'zjgsdxhzsxy'],
  ['宁波大学', 'nbdx'],
  ['浙大宁波理工学院', 'zdnblgxy'],
  ['宁波工程学院', 'nbgcxy'],
  ['宁波诺丁汉大学', 'nbndhdx'],
  ['宁波财经学院', 'nbcjxy'],
  ['宁波大学科学技术学院', 'nbdxkxjsxy'],
  ['浙江药科职业大学', 'zjykzydx'],
  ['宁波职业技术学院', 'nbzyjsxy'],
  ['宁波城市职业技术学院', 'nbcszyjsxy'],
  ['宁波卫生职业技术学院', 'nbwszyjsxy'],
  ['浙江纺织服装职业技术学院', 'zjfzfzzyjsxy'],
  ['浙江工商职业技术学院', 'zjgszyjsxy'],
  ['宁波幼儿师范高等专科学校', 'nbyesfgdzkxx'],
  ['浙江万里学院', 'zjwlxy'],
  ['温州医科大学', 'wzykdx'],
  ['温州大学', 'wzdx'],
  ['温州理工学院', 'wzlgxy'],
  ['温州肯恩大学', 'wzkedx'],
  ['温州商学院', 'wzsxy'],
  ['温州医科大学仁济学院', 'wzykdxrjxy'],
  ['温州职业技术学院', 'wzzyjsxy'],
  ['浙江工贸职业技术学院', 'zjgmzyjsxy'],
  ['浙江安防职业技术学院', 'zjafzyjsxy'],
  ['浙江东方职业技术学院', 'zjdfzyjsxy'],
  ['温州科技职业学院', 'wzkjzyxy'],
  ['绍兴文理学院', 'sxwlxy'],
  ['浙江越秀外国语学院', 'zjyxwgyxy'],
  ['绍兴文理学院元培学院', 'sxwlxyypxy'],
  ['浙江工业大学之江学院', 'zjgydxzjxy'],
  ['浙江理工大学科技与艺术学院', 'zjlgdxkjyysxy'],
  ['浙江农林大学暨阳学院', 'zjnldxjyxy'],
  ['绍兴职业技术学院', 'sxzyjsxy'],
  ['浙江农业商贸职业学院', 'zjnysmzyxy'],
  ['浙江邮电职业技术学院', 'zjydzyjsxy'],
  ['湖州师范学院', 'hzsfxy'],
  ['湖州学院', 'hzxy'],
  ['湖州职业技术学院', 'huzyzyjsxy'],
  ['浙江宇翔职业技术学院', 'zjyxzyjsxy'],
  ['嘉兴大学', 'jxdx'],
  ['嘉兴南湖学院', 'jxnhxy'],
  ['浙江财经大学东方学院', 'zjcjdxdfxy'],
  ['嘉兴职业技术学院', 'jxzyjsxy'],
  ['嘉兴南洋职业技术学院', 'jxnyzyjsxy'],
  ['同济大学浙江学院', 'tjdxzjxy'],
  ['浙江师范大学', 'zjsfdx'],
  ['浙江师范大学行知学院', 'zjsfdxxzxy'],
  ['中国计量大学现代科技学院', 'zgjldxxdkjxy'],
  ['金华职业技术大学', 'jhzyjsdx'],
  ['浙江广厦建设职业技术大学', 'zjgsjszyjsdx'],
  ['义乌工商职业技术学院', 'ywgszyjsxy'],
  ['浙江横店影视职业学院', 'zjhdyszyxy'],
  ['浙江金华科贸职业技术学院', 'zjjhkmzyjsxy'],
  ['上海财经大学浙江学院', 'shcjdxzjxy'],
  ['衢州学院', 'qzxy'],
  ['衢州职业技术学院', 'qzzyjsxy'],
  ['台州学院', 'tzxy'],
  ['台州职业技术学院', 'tzzyjsxy'],
  ['台州科技职业学院', 'tzkjzyxy'],
  ['浙江汽车职业技术学院', 'zjqczyjsxy'],
  ['丽水学院', 'lsxy'],
  ['丽水职业技术学院', 'lszyjsxy'],
  ['浙江海洋大学', 'zjhydx'],
  ['浙江海洋大学东海科学技术学院', 'zjhydxdhkxjsxy'],
  ['舟山群岛新区旅游与健康职业学院', 'zsqdxqlyyjkzyxy'],
  ['浙江国际海运职业技术学院', 'zjgjhyzyjsxy'],
];

const DEFAULT_PASSWORD = '123456';

async function seedSchoolAdmins() {
  const conn = await pool.getConnection();
  try {
    // 获取 school_admin 角色 ID
    let [[role]] = await conn.execute("SELECT id FROM roles WHERE code = 'school_admin'");
    if (!role) {
      console.error('school_admin 角色不存在，请先运行 migration');
      return;
    }
    const roleId = role.id;

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    let created = 0;
    let skipped = 0;
    let schoolNotFound = 0;

    for (const [schoolName, username] of schoolAdmins) {
      // 查找学校
      const [[school]] = await conn.execute(
        'SELECT id FROM schools WHERE name = ?',
        [schoolName]
      );
      if (!school) {
        console.log(`[跳过] 学校不存在: ${schoolName}`);
        schoolNotFound++;
        continue;
      }

      // 检查用户名是否已存在
      const [[existingUser]] = await conn.execute(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );
      if (existingUser) {
        console.log(`[跳过] 用户名已存在: ${username} (${schoolName})`);
        skipped++;
        continue;
      }

      // 创建用户
      const [insertResult] = await conn.execute(
        `INSERT INTO users (openid, name, username, school_id, admin_password, password_changed, is_registered, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, NOW())`,
        [`admin_${username}`, `${schoolName}管理员`, username, school.id, hashedPassword]
      );
      const userId = insertResult.insertId;

      // 分配 school_admin 角色
      await conn.execute(
        'INSERT INTO user_roles (user_id, role_id, school_id, granted_at) VALUES (?, ?, ?, NOW())',
        [userId, roleId, school.id]
      );

      console.log(`[创建] ${schoolName} -> 用户名: ${username}, user_id: ${userId}`);
      created++;
    }

    console.log(`\n完成! 创建: ${created}, 跳过: ${skipped}, 学校未找到: ${schoolNotFound}`);
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    conn.release();
    process.exit(0);
  }
}

seedSchoolAdmins();
];

