/**
 * 赛事功能自动化测试脚本
 *
 * 使用方法：
 * 1. 确保服务器正在运行
 * 2. 先运行 seed-test-data.js 创建测试数据
 * 3. 运行此脚本：node scripts/test-event-flow.js
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 测试用户ID
const USERS = {
  SUPER_ADMIN: 1001,      // 张三 - 超级管理员
  SCHOOL_ADMIN: 1005,     // 体育老师 - 学校管理员
  USER_1: 1002,           // 李四 - 普通用户（浙工大）
  USER_2: 1003,           // 王五 - 普通用户（浙工大）
  USER_3: 1004,           // 赵六 - 普通用户（杭电）
  USER_4: 1006            // 校队队长 - 普通用户（浙工大）
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
    console.error(`❌ 请求失败: ${method} ${path}`, error.message);
    return { success: false, message: error.message };
  }
}

// ============ 测试函数 ============

// 1. 测试赛事列表可见性
async function testEventVisibility() {
  console.log('\n📋 测试 1: 赛事可见性');
  console.log('─'.repeat(60));

  // 浙工大用户查看赛事列表
  const res1 = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=20');
  if (res1.success) {
    console.log(`✅ 浙工大用户可见赛事数量: ${res1.data.list?.length || 0}`);
    res1.data.list?.forEach(event => {
      console.log(`   - ${event.title} (${event.scope === 'school' ? '校内' : '校际'})`);
    });
  } else {
    console.log('❌ 获取赛事列表失败:', res1.message);
  }

  // 杭电用户查看赛事列表
  const res2 = await apiRequest('GET', '/api/events?school_id=2&page=1&limit=20');
  if (res2.success) {
    console.log(`✅ 杭电用户可见赛事数量: ${res2.data.list?.length || 0}`);
    res2.data.list?.forEach(event => {
      console.log(`   - ${event.title} (${event.scope === 'school' ? '校内' : '校际'})`);
    });
  } else {
    console.log('❌ 获取赛事列表失败:', res2.message);
  }
}

// 2. 测试管理员权限
async function testAdminPermissions() {
  console.log('\n🔐 测试 2: 管理员权限控制');
  console.log('─'.repeat(60));

  // 超级管理员查看赛事
  const res1 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SUPER_ADMIN}`);
  if (res1.success) {
    console.log(`✅ 超级管理员可见赛事数量: ${res1.data?.length || 0}`);
    res1.data?.forEach(event => {
      console.log(`   - ${event.title} [${event.school_name || '全局'}]`);
    });
  } else {
    console.log('❌ 超级管理员获取失败:', res1.message);
  }

  // 学校管理员查看赛事（应该只看到本校+校际赛）
  const res2 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.SCHOOL_ADMIN}`);
  if (res2.success) {
    console.log(`✅ 学校管理员可见赛事数量: ${res2.data?.length || 0}`);
    res2.data?.forEach(event => {
      console.log(`   - ${event.title} [${event.school_name || '全局'}] (${event.scope})`);
    });
  } else {
    console.log('❌ 学校管理员获取失败:', res2.message);
  }

  // 普通用户尝试访问管理后台（应该失败）
  const res3 = await apiRequest('GET', `/api/admin/events?user_id=${USERS.USER_1}`);
  if (!res3.success) {
    console.log('✅ 普通用户无法访问管理后台 (预期行为)');
  } else {
    console.log('❌ 安全问题：普通用户可以访问管理后台！');
  }
}

// 3. 测试报名功能
async function testRegistration() {
  console.log('\n📝 测试 3: 赛事报名');
  console.log('─'.repeat(60));

  // 获取第一个赛事ID
  const eventsRes = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=1');
  if (!eventsRes.success || !eventsRes.data.list?.length) {
    console.log('❌ 无法获取赛事列表');
    return;
  }

  const eventId = eventsRes.data.list[0].id;
  console.log(`测试赛事: ${eventsRes.data.list[0].title} (ID: ${eventId})`);

  // 用户2报名
  const res1 = await apiRequest('POST', `/api/events/${eventId}/register`, {
    user_id: USERS.USER_2
  });
  console.log(res1.success ? '✅ 用户报名成功' : `❌ 报名失败: ${res1.message}`);

  // 重复报名（应该失败）
  const res2 = await apiRequest('POST', `/api/events/${eventId}/register`, {
    user_id: USERS.USER_2
  });
  if (!res2.success) {
    console.log('✅ 重复报名被阻止 (预期行为)');
  } else {
    console.log('❌ 允许重复报名（逻辑错误）');
  }

  // 查看报名情况
  const res3 = await apiRequest('GET', `/api/events/${eventId}`);
  if (res3.success) {
    console.log(`✅ 当前报名人数: ${res3.data.event.participant_count || 0}/${res3.data.event.max_participants}`);
  }
}

// 4. 测试领队申请
async function testCaptainApplication() {
  console.log('\n👨‍✈️ 测试 4: 领队申请与审批');
  console.log('─'.repeat(60));

  // 查找团体赛
  const eventsRes = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=20');
  const teamEvent = eventsRes.data?.list?.find(e => e.event_type === 'team');

  if (!teamEvent) {
    console.log('⚠️  未找到团体赛事，跳过领队测试');
    return;
  }

  console.log(`测试赛事: ${teamEvent.title} (ID: ${teamEvent.id})`);

  // 用户4申请成为领队
  const res1 = await apiRequest('POST', `/api/events/${teamEvent.id}/apply-captain`, {
    user_id: USERS.USER_4,
    event_id: teamEvent.id
  });
  console.log(res1.success ? '✅ 领队申请提交成功' : `❌ 申请失败: ${res1.message}`);

  if (!res1.success) return;

  // 获取申请列表
  const res2 = await apiRequest('GET', `/api/admin/captain-applications?user_id=${USERS.SCHOOL_ADMIN}`);
  if (res2.success && res2.data?.length > 0) {
    const application = res2.data.find(app => app.user_id === USERS.USER_4);
    if (application) {
      console.log(`✅ 找到领队申请: ${application.user_name} (状态: ${application.status})`);

      // 管理员审批通过
      const res3 = await apiRequest('POST', `/api/admin/captain-applications/${application.id}/approve`, {
        user_id: USERS.SCHOOL_ADMIN
      });
      console.log(res3.success ? '✅ 领队申请审批通过' : `❌ 审批失败: ${res3.message}`);
    }
  } else {
    console.log('⚠️  未找到申请记录');
  }
}

// 5. 测试跨学校隔离
async function testSchoolIsolation() {
  console.log('\n🏫 测试 5: 学校数据隔离');
  console.log('─'.repeat(60));

  // 杭电用户查看赛事（不应该看到浙工大的校内赛）
  const res = await apiRequest('GET', '/api/events?school_id=2&page=1&limit=20');
  if (res.success) {
    const hasOtherSchoolEvents = res.data.list?.some(
      e => e.scope === 'school' && e.school_id === 1
    );
    if (hasOtherSchoolEvents) {
      console.log('❌ 学校隔离失败：杭电用户看到了浙工大的校内赛');
    } else {
      console.log('✅ 学校隔离正常：杭电用户只能看到校际赛和本校赛事');
      res.data.list?.forEach(event => {
        console.log(`   - ${event.title} (${event.scope})`);
      });
    }
  }
}

// 6. 测试赛事详情
async function testEventDetails() {
  console.log('\n🔍 测试 6: 赛事详情');
  console.log('─'.repeat(60));

  const eventsRes = await apiRequest('GET', '/api/events?school_id=1&page=1&limit=1');
  if (!eventsRes.success || !eventsRes.data.list?.length) {
    console.log('❌ 无法获取赛事列表');
    return;
  }

  const eventId = eventsRes.data.list[0].id;
  const res = await apiRequest('GET', `/api/events/${eventId}`);

  if (res.success) {
    console.log('✅ 成功获取赛事详情:');
    console.log(`   标题: ${res.data.event.title}`);
    console.log(`   类型: ${res.data.event.event_type}`);
    console.log(`   赛制: ${res.data.event.event_format}`);
    console.log(`   报名: ${res.data.event.participant_count}/${res.data.event.max_participants}`);
    console.log(`   报名者数量: ${res.data.registrations?.length || 0}`);
  } else {
    console.log('❌ 获取赛事详情失败:', res.message);
  }
}

// ============ 主测试流程 ============

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          🧪 乒乓球小程序 - 赛事功能自动化测试                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔗 测试服务器: ${BASE_URL}`);
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}\n`);

  try {
    await testEventVisibility();
    await testAdminPermissions();
    await testRegistration();
    await testCaptainApplication();
    await testSchoolIsolation();
    await testEventDetails();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                       ✅ 测试完成！                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`⏰ 结束时间: ${new Date().toLocaleString('zh-CN')}\n`);
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 检查是否安装了 node-fetch
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

module.exports = {
  testEventVisibility,
  testAdminPermissions,
  testRegistration,
  testCaptainApplication,
  testSchoolIsolation,
  testEventDetails
};
