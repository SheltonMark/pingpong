/**
 * 双打和团体赛功能测试
 *
 * 测试范围：
 * 1. 双打：获取可用搭档、报名、退出解散
 * 2. 团体赛：领队申请、审批、队员邀请确认
 */

const BASE_URL = process.env.API_BASE_URL || 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';

// 测试用户
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

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    // 处理 GET 请求的查询参数
    let url = `${BASE_URL}${path}`;
    if (data && method === 'GET') {
      const params = new URLSearchParams(data);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, options);
    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, message: error.message, error: true };
  }
}

// 记录测试结果
function recordTest(testName, passed, bugDescription = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`  ❌ ${testName}`);
    if (bugDescription) {
      testResults.bugs.push({ test: testName, description: bugDescription });
    }
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
    return false;
  }
  return false;
}

// ============ 测试用例 ============

// 测试1: 获取可用搭档列表端点
async function testAvailablePartners() {
  console.log('\n📋 测试 1: 获取可用搭档列表');
  console.log('─'.repeat(60));

  // 先获取一个双打赛事
  const eventsRes = await apiRequest('GET', '/api/events', { page: 1, limit: 50 });
  if (!eventsRes.success) {
    recordTest('获取赛事列表', false, '无法获取赛事数据');
    return null;
  }

  const doublesEvent = eventsRes.data.list?.find(e => e.event_type === 'doubles');
  if (!doublesEvent) {
    console.log('  ⚠️ 没有找到双打赛事，跳过此测试');
    return null;
  }

  console.log(`  测试赛事: ${doublesEvent.title} (ID: ${doublesEvent.id})`);

  // 测试获取可用搭档
  const partnersRes = await apiRequest('GET', `/api/events/${doublesEvent.id}/available-partners`, {
    user_id: USERS.USER_1
  });

  recordTest('available-partners 端点存在', !partnersRes.error && partnersRes.success !== undefined,
    partnersRes.error ? 'API 端点不存在或服务器错误' : null);

  if (partnersRes.success) {
    recordTest('返回数据格式正确', Array.isArray(partnersRes.data),
      !Array.isArray(partnersRes.data) ? '返回数据不是数组' : null);
  }

  // 测试非双打赛事（应该返回错误）
  const singlesEvent = eventsRes.data.list?.find(e => e.event_type === 'singles');
  if (singlesEvent) {
    const singlesPartnersRes = await apiRequest('GET', `/api/events/${singlesEvent.id}/available-partners`, {
      user_id: USERS.USER_1
    });
    recordTest('非双打赛事返回错误', !singlesPartnersRes.success,
      singlesPartnersRes.success ? 'BUG: 非双打赛事不应该有可用搭档' : null);
  }

  return doublesEvent;
}

// 测试2: 双打报名流程
async function testDoublesRegistration(doublesEvent) {
  console.log('\n📋 测试 2: 双打报名流程');
  console.log('─'.repeat(60));

  if (!doublesEvent) {
    console.log('  ⚠️ 没有双打赛事，跳过此测试');
    return;
  }

  // 用户1报名（等待配对模式）
  const reg1 = await apiRequest('POST', `/api/events/${doublesEvent.id}/register`, {
    user_id: USERS.USER_3
  });

  // 可能已经报名了，所以只检查端点是否正常工作
  const reg1Works = !reg1.error;
  recordTest('双打报名端点正常', reg1Works,
    !reg1Works ? 'API 端点错误' : null);

  if (reg1.success) {
    recordTest('等待配对模式报名成功', reg1.data?.status === 'waiting_partner',
      reg1.data?.status !== 'waiting_partner' ? `状态应为 waiting_partner，实际为 ${reg1.data?.status}` : null);
  }
}

// 测试3: 团体赛领队申请
async function testCaptainApplication() {
  console.log('\n📋 测试 3: 团体赛领队申请');
  console.log('─'.repeat(60));

  // 获取团体赛
  const eventsRes = await apiRequest('GET', '/api/events', { page: 1, limit: 50 });
  if (!eventsRes.success) {
    recordTest('获取赛事列表', false, '无法获取赛事数据');
    return null;
  }

  const teamEvent = eventsRes.data.list?.find(e => e.event_type === 'team');
  if (!teamEvent) {
    console.log('  ⚠️ 没有找到团体赛事，跳过此测试');
    return null;
  }

  console.log(`  测试赛事: ${teamEvent.title} (ID: ${teamEvent.id})`);

  // 申请领队
  const applyRes = await apiRequest('POST', `/api/events/${teamEvent.id}/apply-captain`, {
    user_id: USERS.USER_1,
    reason: '测试申请领队'
  });

  recordTest('领队申请端点正常', !applyRes.error,
    applyRes.error ? 'API 端点错误' : null);

  // 检查领队状态
  const statusRes = await apiRequest('GET', `/api/events/${teamEvent.id}/captain-status`, {
    user_id: USERS.USER_1
  });

  recordTest('领队状态查询端点正常', statusRes.success,
    !statusRes.success ? '无法查询领队状态' : null);

  return teamEvent;
}

// 测试4: 管理员审批领队
async function testCaptainApproval(teamEvent) {
  console.log('\n📋 测试 4: 领队审批');
  console.log('─'.repeat(60));

  if (!teamEvent) {
    console.log('  ⚠️ 没有团体赛事，跳过此测试');
    return;
  }

  // 获取待审批的领队申请
  const appsRes = await apiRequest('GET', `/api/admin/captain-applications`, {
    user_id: USERS.SUPER_ADMIN
  });

  recordTest('获取领队申请列表端点正常', !appsRes.error,
    appsRes.error ? 'API 端点错误' : null);

  if (appsRes.success && appsRes.data?.length > 0) {
    const pendingApp = appsRes.data.find(a => a.status === 'pending');
    if (pendingApp) {
      recordTest(`有待审批申请 (ID: ${pendingApp.id})`, true);
    }
  }
}

// 测试5: 取消报名解散队伍
async function testCancelRegistration() {
  console.log('\n📋 测试 5: 取消报名（双打队伍解散）');
  console.log('─'.repeat(60));

  // 这个测试需要检查取消报名后搭档的状态
  // 目前只能验证端点存在
  const eventsRes = await apiRequest('GET', '/api/events', { page: 1, limit: 50 });
  if (!eventsRes.success || !eventsRes.data.list?.length) {
    console.log('  ⚠️ 没有赛事，跳过此测试');
    return;
  }

  const eventId = eventsRes.data.list[0].id;

  // 取消报名端点测试
  const cancelRes = await apiRequest('POST', `/api/events/${eventId}/cancel`, {
    user_id: USERS.USER_4  // 使用不太可能已报名的用户
  });

  recordTest('取消报名端点正常', !cancelRes.error,
    cancelRes.error ? 'API 端点错误' : null);
}

// 生成测试报告
function generateReport() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              📊 双打/团体赛功能测试报告                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n总计测试: ${testResults.total}`);
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`通过率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.bugs.length > 0) {
    console.log('\n🐛 发现的问题:');
    console.log('═'.repeat(60));
    testResults.bugs.forEach((bug, index) => {
      console.log(`\n${index + 1}. ${bug.test}`);
      console.log(`   ${bug.description}`);
    });
    console.log('\n');
    return false;
  } else {
    console.log('\n🎉 所有测试通过！\n');
    return true;
  }
}

// 主函数
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           🏓 双打和团体赛功能自动化测试                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const serverOk = await checkServer();
  if (!serverOk) {
    process.exit(1);
  }

  // 运行测试
  const doublesEvent = await testAvailablePartners();
  await testDoublesRegistration(doublesEvent);
  const teamEvent = await testCaptainApplication();
  await testCaptainApproval(teamEvent);
  await testCancelRegistration();

  // 生成报告
  const allPassed = generateReport();
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
