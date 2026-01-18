/**
 * 自动化测试运行器
 *
 * 功能：
 * 1. 检查服务器是否运行
 * 2. 运行所有测试
 * 3. 生成bug报告
 * 4. 返回测试结论
 */

const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';

// 测试用户ID
const USERS = {
  SUPER_ADMIN: 1001,
  SCHOOL_ADMIN: 1005,
  USER_1: 1002,
  USER_2: 1003,
  USER_3: 1004,
  USER_4: 1006
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
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, message: error.message, error: true };
  }
}

// 检查服务器是否运行
async function checkServer() {
  console.log('🔍 检查服务器状态...');
  try {
    const response = await fetch(`${BASE_URL}/api/events?page=1&limit=1`);
    if (response.ok) {
      console.log('✅ 服务器正在运行\n');
      return true;
    }
  } catch (error) {
    console.log('❌ 服务器未运行！');
    console.log('\n请先启动服务器：');
    console.log('  cd backend && npm start\n');
    return false;
  }
  return false;
}

// 记录测试结果
function recordTest(testName, passed, bugDescription = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}`);
    if (bugDescription) {
      testResults.bugs.push({ test: testName, description: bugDescription });
    }
  }
}

// 测试1: 赛事可见性
async function testEventVisibility() {
  console.log('\n📋 测试 1: 赛事可见性');
  console.log('─'.repeat(60));

  // 浙工大用户查看赛事
  const res1 = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=20');
  if (res1.error) {
    recordTest('浙工大用户查看赛事列表', false, '服务器连接失败');
    return;
  }

  if (!res1.success) {
    recordTest('浙工大用户查看赛事列表', false, `API返回失败: ${res1.message}`);
    return;
  }

  const zjutEvents = res1.data.list || [];
  recordTest(`浙工大用户可见 ${zjutEvents.length} 个赛事`, zjutEvents.length > 0);

  // 检查是否有校际赛
  const hasInterSchool = zjutEvents.some(e => e.scope === 'inter_school');
  recordTest('浙工大用户能看到校际赛', hasInterSchool,
    hasInterSchool ? null : '没有校际赛数据或过滤错误');

  // 检查是否有本校校内赛
  const hasSchoolEvents = zjutEvents.some(e => e.scope === 'school' && e.school_id === 1);
  recordTest('浙工大用户能看到本校校内赛', hasSchoolEvents,
    hasSchoolEvents ? null : '没有校内赛数据或过滤错误');

  // 杭电用户查看赛事
  const res2 = await apiRequest('GET', '/api/events?school_id=2&page=1&limit=20');
  if (res2.success) {
    const hduEvents = res2.data.list || [];
    recordTest(`杭电用户可见 ${hduEvents.length} 个赛事`, true);

    // 确保杭电用户看不到浙工大的校内赛
    const hasOtherSchoolEvents = hduEvents.some(e => e.scope === 'school' && e.school_id === 1);
    recordTest('杭电用户看不到浙工大校内赛', !hasOtherSchoolEvents,
      hasOtherSchoolEvents ? 'BUG: 学校隔离失败，杭电用户能看到浙工大校内赛' : null);
  }
}

// 测试2: 管理员权限
async function testAdminPermissions() {
  console.log('\n🔐 测试 2: 管理员权限控制');
  console.log('─'.repeat(60));

  // 超级管理员
  const res1 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SUPER_ADMIN}`);
  if (!res1.error && res1.success) {
    const superAdminEvents = res1.data || [];
    recordTest(`超级管理员可见 ${superAdminEvents.length} 个赛事`, superAdminEvents.length > 0);

    // 超管应该能看到所有学校的赛事
    const hasMultipleSchools = new Set(superAdminEvents.map(e => e.school_id)).size > 1;
    recordTest('超管能看到多个学校的赛事', hasMultipleSchools,
      hasMultipleSchools ? null : '超管可能只看到单个学校赛事');
  } else {
    recordTest('超级管理员权限', false, res1.message || '无法获取赛事列表');
  }

  // 学校管理员
  const res2 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SCHOOL_ADMIN}`);
  if (!res2.error && res2.success) {
    const schoolAdminEvents = res2.data || [];
    recordTest(`学校管理员可见 ${schoolAdminEvents.length} 个赛事`, schoolAdminEvents.length > 0);

    // 学校管理员不应该看到其他学校的校内赛
    const hasOtherSchoolInternalEvents = schoolAdminEvents.some(
      e => e.scope === 'school' && e.school_id !== 1 && e.school_id !== null
    );
    recordTest('学校管理员权限过滤正确', !hasOtherSchoolInternalEvents,
      hasOtherSchoolInternalEvents ? 'BUG: 学校管理员能看到其他学校的校内赛' : null);

    // 应该能看到校际赛
    const hasInterSchool = schoolAdminEvents.some(e => e.scope === 'inter_school');
    recordTest('学校管理员能看到校际赛', hasInterSchool);
  } else {
    recordTest('学校管理员权限', false, res2.message || '无法获取赛事列表');
  }

  // 普通用户尝试访问管理后台（应该失败）
  const res3 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.USER_1}`);
  recordTest('普通用户无法访问管理后台', !res3.success,
    res3.success ? 'BUG: 普通用户可以访问管理后台！' : null);
}

// 测试3: 赛事报名
async function testRegistration() {
  console.log('\n📝 测试 3: 赛事报名');
  console.log('─'.repeat(60));

  const eventsRes = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=1');
  if (!eventsRes.success || !eventsRes.data.list?.length) {
    recordTest('获取赛事列表用于测试报名', false, '无法获取赛事数据');
    return;
  }

  const eventId = eventsRes.data.list[0].id;
  const eventTitle = eventsRes.data.list[0].title;
  console.log(`  测试赛事: ${eventTitle} (ID: ${eventId})`);

  // 用户报名
  const res1 = await apiRequest('POST', `/api/events/${eventId}/register`, {
    user_id: USERS.USER_2
  });
  recordTest('用户报名赛事', res1.success, res1.success ? null : res1.message);

  // 重复报名（应该失败或返回已报名）
  if (res1.success) {
    const res2 = await apiRequest('POST', `/api/events/${eventId}/register`, {
      user_id: USERS.USER_2
    });
    const isDuplicate = !res2.success || res2.message?.includes('已报名');
    recordTest('重复报名被正确处理', isDuplicate,
      isDuplicate ? null : 'BUG: 允许重复报名');
  }
}

// 生成测试报告
function generateReport() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      📊 测试报告                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n总计测试: ${testResults.total}`);
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`通过率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.bugs.length > 0) {
    console.log('\n🐛 发现的Bug:');
    console.log('═'.repeat(60));
    testResults.bugs.forEach((bug, index) => {
      console.log(`\n${index + 1}. ${bug.test}`);
      console.log(`   ${bug.description}`);
    });
    console.log('\n');
    return false; // 有bug
  } else {
    console.log('\n🎉 所有测试通过！没有发现bug。\n');
    return true; // 无bug
  }
}

// 主测试流程
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          🧪 赛事功能自动化测试                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔗 测试服务器: ${BASE_URL}`);
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}\n`);

  // 检查服务器
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('\n⚠️  测试终止：服务器未运行\n');
    process.exit(1);
  }

  try {
    await testEventVisibility();
    await testAdminPermissions();
    await testRegistration();

    console.log(`\n⏰ 结束时间: ${new Date().toLocaleString('zh-CN')}`);

    const allPassed = generateReport();
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 安装依赖检查
try {
  global.fetch = require('node-fetch');
} catch (error) {
  console.error('❌ 请先安装 node-fetch: npm install node-fetch@2');
  process.exit(1);
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { main, testEventVisibility, testAdminPermissions, testRegistration };
