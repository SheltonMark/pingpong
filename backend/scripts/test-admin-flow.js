/**
 * 管理后台自动化测试
 *
 * 使用方法：
 *   cd backend
 *   node scripts/test-admin-flow.js
 *
 * 测试内容：
 *   1. 管理员认证
 *   2. 用户管理
 *   3. 赛事管理
 *   4. 公告管理
 *   5. 学校管理
 */

// Node.js 18+ 有原生 fetch，低版本用 node-fetch
let fetch;
try {
  fetch = globalThis.fetch;
  if (!fetch) {
    fetch = require('node-fetch');
  }
} catch {
  fetch = require('node-fetch');
}

const BASE_URL = process.env.API_BASE_URL || 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';

// 测试用户ID（需要在数据库中存在）
const USERS = {
  SUPER_ADMIN: 1001,
  SCHOOL_ADMIN: 1005,
  NORMAL_USER: 1002
};

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  bugs: []
};

// API 请求封装
async function apiRequest(method, path, data = null) {
  try {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      const text = await response.text();
      return { success: false, message: '返回非JSON', html: text.substring(0, 100), error: true };
    }
  } catch (error) {
    return { success: false, message: error.message, error: true };
  }
}

// 记录测试结果
function recordTest(testName, passed, bugDescription = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`  ${colors.green('✅')} ${testName}`);
  } else {
    testResults.failed++;
    console.log(`  ${colors.red('❌')} ${testName}`);
    if (bugDescription) {
      console.log(`     ${colors.yellow('→')} ${bugDescription}`);
      testResults.bugs.push({ test: testName, description: bugDescription });
    }
  }
}

// 测试1: 管理员权限检查
async function testAdminCheck() {
  console.log(`\n${colors.cyan('━'.repeat(60))}`);
  console.log(colors.cyan('🔐 测试 1: 管理员认证'));
  console.log(colors.cyan('━'.repeat(60)));

  // 超级管理员权限检查
  const res1 = await apiRequest('GET', `/api/admin/check?user_id=${USERS.SUPER_ADMIN}`);
  if (res1.error) {
    recordTest('检查超级管理员权限', false, `请求失败: ${res1.message}`);
  } else {
    recordTest('检查超级管理员权限', res1.success && res1.isAdmin,
      res1.success ? null : res1.message);

    if (res1.success && res1.roles) {
      const isSuperAdmin = res1.roles?.some(r => r.code === 'super_admin');
      recordTest('超级管理员角色正确', isSuperAdmin,
        isSuperAdmin ? null : '未找到 super_admin 角色');
    }
  }

  // 学校管理员权限检查
  const res2 = await apiRequest('GET', `/api/admin/check?user_id=${USERS.SCHOOL_ADMIN}`);
  if (!res2.error && res2.success) {
    recordTest('检查学校管理员权限', res2.isAdmin);
    const isSchoolAdmin = res2.roles?.some(r => r.code === 'school_admin');
    recordTest('学校管理员角色正确', isSchoolAdmin,
      isSchoolAdmin ? null : '未找到 school_admin 角色');
  } else {
    recordTest('检查学校管理员权限', false, res2.message);
  }

  // 普通用户应该没有管理权限
  const res3 = await apiRequest('GET', `/api/admin/check?user_id=${USERS.NORMAL_USER}`);
  if (!res3.error) {
    const noAdminAccess = !res3.success || !res3.isAdmin;
    recordTest('普通用户无管理权限', noAdminAccess,
      noAdminAccess ? null : 'BUG: 普通用户有管理权限');
  }
}

// 测试2: 用户管理
async function testUserManagement() {
  console.log(`\n${colors.cyan('━'.repeat(60))}`);
  console.log(colors.cyan('👥 测试 2: 用户管理'));
  console.log(colors.cyan('━'.repeat(60)));

  // 获取用户列表
  const res1 = await apiRequest('GET', `/api/admin/users?user_id=${USERS.SUPER_ADMIN}&page=1&limit=10`);
  if (res1.error) {
    recordTest('获取用户列表', false, `请求失败: ${res1.message}`);
    return;
  }

  recordTest('获取用户列表', res1.success,
    res1.success ? null : res1.message);

  if (res1.success && res1.data) {
    // API returns data as array directly, not { list: [], total: N }
    const users = Array.isArray(res1.data) ? res1.data : (res1.data.list || []);
    const hasUsers = users.length > 0;
    recordTest('用户列表有数据', hasUsers,
      hasUsers ? null : '用户列表为空');

    if (hasUsers) {
      console.log(`     ${colors.blue('→')} 共 ${users.length} 个用户`);
    }
  }

  // 搜索用户
  const res2 = await apiRequest('GET', `/api/admin/users?user_id=${USERS.SUPER_ADMIN}&keyword=张&page=1&limit=10`);
  recordTest('搜索用户功能', res2.success,
    res2.success ? null : res2.message);
}

// 测试3: 赛事管理
async function testEventManagement() {
  console.log(`\n${colors.cyan('━'.repeat(60))}`);
  console.log(colors.cyan('🏓 测试 3: 赛事管理'));
  console.log(colors.cyan('━'.repeat(60)));

  // 获取赛事列表
  const res1 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SUPER_ADMIN}`);
  if (res1.error) {
    recordTest('获取赛事列表', false, `请求失败: ${res1.message}`);
    return;
  }

  recordTest('获取赛事列表', res1.success,
    res1.success ? null : res1.message);

  if (res1.success && res1.data) {
    const events = Array.isArray(res1.data) ? res1.data : res1.data.list;
    const hasEvents = events && events.length > 0;
    recordTest('赛事列表有数据', hasEvents,
      hasEvents ? null : '赛事列表为空');

    if (hasEvents) {
      console.log(`     ${colors.blue('→')} 共 ${events.length} 个赛事`);
    }
  }

  // 学校管理员应该也能看到赛事
  const res4 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SCHOOL_ADMIN}`);
  recordTest('学校管理员获取赛事', res4.success,
    res4.success ? null : res4.message);

  // 测试待审核比赛列表
  const res5 = await apiRequest('GET', `/api/admin/matches/pending?user_id=${USERS.SUPER_ADMIN}`);
  recordTest('获取待审核比赛列表', res5.success,
    res5.success ? null : res5.message);

  // 测试所有比赛列表
  const res6 = await apiRequest('GET', `/api/admin/matches?user_id=${USERS.SUPER_ADMIN}`);
  // Note: This may fail if there are no matches in database, which is acceptable
  if (res6.success) {
    const matches = Array.isArray(res6.data) ? res6.data : [];
    console.log(`     ${colors.blue('→')} 共 ${matches.length} 个比赛`);
    recordTest('获取比赛列表', true);
  } else {
    // Check if it's a data issue vs API issue
    recordTest('获取比赛列表', false, res6.message || '可能是数据库无数据');
  }
}

// 测试4: 公告管理
async function testAnnouncementManagement() {
  console.log(`\n${colors.cyan('━'.repeat(60))}`);
  console.log(colors.cyan('📢 测试 4: 公告管理'));
  console.log(colors.cyan('━'.repeat(60)));

  // 获取公告列表
  const res1 = await apiRequest('GET', `/api/admin/announcements?user_id=${USERS.SUPER_ADMIN}`);
  if (res1.error) {
    recordTest('获取公告列表', false, `请求失败: ${res1.message}`);
    return;
  }

  recordTest('获取公告列表', res1.success,
    res1.success ? null : res1.message);

  if (res1.success && res1.data) {
    const announcements = Array.isArray(res1.data) ? res1.data : res1.data.list;
    const hasAnnouncements = announcements && announcements.length > 0;
    if (hasAnnouncements) {
      console.log(`     ${colors.blue('→')} 共 ${announcements.length} 条公告`);
    }
    recordTest('公告列表查询成功', true);
  }
}

// 测试5: 学校管理
async function testSchoolManagement() {
  console.log(`\n${colors.cyan('━'.repeat(60))}`);
  console.log(colors.cyan('🏫 测试 5: 学校管理'));
  console.log(colors.cyan('━'.repeat(60)));

  // 获取学校列表
  const res1 = await apiRequest('GET', `/api/admin/schools?user_id=${USERS.SUPER_ADMIN}`);
  if (res1.error) {
    recordTest('获取学校列表', false, `请求失败: ${res1.message}`);
    return;
  }

  recordTest('获取学校列表', res1.success,
    res1.success ? null : res1.message);

  if (res1.success && res1.data) {
    const schools = Array.isArray(res1.data) ? res1.data : res1.data.list;
    const hasSchools = schools && schools.length > 0;
    recordTest('学校列表有数据', hasSchools,
      hasSchools ? null : '学校列表为空');

    if (hasSchools) {
      console.log(`     ${colors.blue('→')} 共 ${schools.length} 所学校`);
    }
  }
}

// 生成测试报告
function generateReport() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(colors.yellow('                    📊 测试报告'));
  console.log('═'.repeat(60));
  console.log(`\n总计测试: ${testResults.total}`);
  console.log(`${colors.green('✅ 通过:')} ${testResults.passed}`);
  console.log(`${colors.red('❌ 失败:')} ${testResults.failed}`);
  console.log(`通过率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.bugs.length > 0) {
    console.log(`\n${colors.red('🐛 发现的Bug:')}`);
    console.log('─'.repeat(60));
    testResults.bugs.forEach((bug, index) => {
      console.log(`${index + 1}. ${bug.test}`);
      console.log(`   ${colors.yellow('→')} ${bug.description}`);
    });
    console.log('');
    return false;
  } else {
    console.log(`\n${colors.green('🎉 所有测试通过！没有发现bug。')}\n`);
    return true;
  }
}

// 主测试流程
async function main() {
  console.log('═'.repeat(60));
  console.log(colors.yellow('          🧪 管理后台自动化测试'));
  console.log('═'.repeat(60));
  console.log(`\n🔗 测试服务器: ${BASE_URL}`);
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}`);

  // 检查服务器
  console.log('\n🔍 检查服务器状态...');
  try {
    const response = await fetch(`${BASE_URL}/api/events?page=1&limit=1`);
    if (response.status === 200) {
      console.log(colors.green('✅ 服务器正在运行'));
    } else {
      console.log(colors.red(`❌ 服务器响应异常 (${response.status})`));
      process.exit(1);
    }
  } catch (error) {
    console.log(colors.red('❌ 服务器未运行！'));
    console.log(`   错误: ${error.message}`);
    process.exit(1);
  }

  try {
    await testAdminCheck();
    await testUserManagement();
    await testEventManagement();
    await testAnnouncementManagement();
    await testSchoolManagement();

    console.log(`\n⏰ 结束时间: ${new Date().toLocaleString('zh-CN')}`);

    const allPassed = generateReport();
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error(`\n${colors.red('❌ 测试过程中发生错误:')} ${error.message}`);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { main };
