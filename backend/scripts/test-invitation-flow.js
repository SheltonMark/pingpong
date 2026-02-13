/**
 * 约球功能端到端自动化测试
 *
 * 使用方法：
 *   cd backend
 *   node scripts/test-invitation-flow.js
 *
 * 测试流程：
 *   1. 用户A发起约球
 *   2. 用户B加入约球
 *   3. 用户A开始比赛
 *   4. 录入比分
 *   5. 双方确认比分
 *   6. 结束约球
 */

// Node.js 18+ 原生支持fetch，低版本需要node-fetch
const fetch = globalThis.fetch || require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';

// 测试用户（需要在数据库中存在）
const USER_A = { id: 1007, name: '海中' };  // 创建者
const USER_B = { id: 1008, name: '那图' };  // 参与者

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

function log(step, message, type = 'info') {
  const prefix = {
    info: colors.blue('[INFO]'),
    success: colors.green('[PASS]'),
    error: colors.red('[FAIL]'),
    step: colors.cyan(`[STEP ${step}]`),
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

async function request(method, path, data = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  } else if (data && method === 'GET') {
    const params = new URLSearchParams(data);
    url += '?' + params.toString();
  }

  const response = await fetch(url, options);
  return response.json();
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.yellow('  约球功能端到端自动化测试'));
  console.log('='.repeat(60) + '\n');
  console.log(`API Base URL: ${BASE_URL}`);
  console.log(`用户A (创建者): ${USER_A.name} (ID: ${USER_A.id})`);
  console.log(`用户B (参与者): ${USER_B.name} (ID: ${USER_B.id})`);
  console.log('\n' + '-'.repeat(60) + '\n');

  let invitationId = null;
  let matchId = null;
  let passed = 0;
  let failed = 0;

  try {
    // Step 1: 用户A发起约球
    log(1, '用户A发起约球...', 'step');
    const scheduledTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const createRes = await request('POST', '/api/invitations', {
      user_id: USER_A.id,
      title: `自动化测试约球 ${Date.now()}`,
      description: '这是自动化测试创建的约球',
      location: '体育馆3号台',
      scheduled_time: scheduledTime,
      max_participants: 2,
      school_id: 1
    });

    if (createRes.success && createRes.data?.invitation_id) {
      invitationId = createRes.data.invitation_id;
      log(1, `约球创建成功，ID: ${invitationId}`, 'success');
      passed++;
    } else {
      log(1, `创建失败: ${createRes.message || JSON.stringify(createRes)}`, 'error');
      failed++;
      throw new Error('创建约球失败，无法继续测试');
    }

    // Step 2: 用户B加入约球
    log(2, '用户B加入约球...', 'step');
    const joinRes = await request('POST', `/api/invitations/${invitationId}/join`, {
      user_id: USER_B.id
    });

    if (joinRes.success) {
      log(2, '用户B加入成功', 'success');
      passed++;
    } else {
      log(2, `加入失败: ${joinRes.message}`, 'error');
      failed++;
    }

    // 验证约球状态
    const checkRes = await request('GET', `/api/invitations/${invitationId}`);
    if (checkRes.success) {
      const participantCount = checkRes.data.participants?.length || 0;
      log(2, `当前参与人数: ${participantCount}, 状态: ${checkRes.data.status}`, 'info');
      if (checkRes.data.status === 'full') {
        log(2, '约球已满员', 'success');
      }
    }

    // Step 3: 用户A开始比赛
    log(3, '用户A开始比赛...', 'step');
    const startRes = await request('POST', `/api/invitations/${invitationId}/start`, {
      user_id: USER_A.id
    });

    if (startRes.success) {
      matchId = startRes.data?.match_id;
      log(3, `比赛开始成功，Match ID: ${matchId}`, 'success');
      passed++;
    } else {
      log(3, `开始比赛失败: ${startRes.message}`, 'error');
      failed++;
    }

    // Step 4: 录入比分
    if (matchId) {
      log(4, '录入比分 (3:1)...', 'step');
      const scoreRes = await request('POST', `/api/events/matches/${matchId}/score`, {
        scores: [
          { game_number: 1, player1_score: 11, player2_score: 9 },
          { game_number: 2, player1_score: 11, player2_score: 7 },
          { game_number: 3, player1_score: 9, player2_score: 11 },
          { game_number: 4, player1_score: 11, player2_score: 8 }
        ],
        recorded_by: USER_A.id
      });

      if (scoreRes.success) {
        log(4, '比分录入成功', 'success');
        passed++;
      } else {
        log(4, `比分录入失败: ${scoreRes.message}`, 'error');
        failed++;
      }

      // Step 5: 双方确认比分
      log(5, '用户A确认比分...', 'step');
      const confirmARes = await request('POST', `/api/events/matches/${matchId}/confirm`, {
        user_id: USER_A.id
      });

      if (confirmARes.success) {
        log(5, '用户A确认成功', 'success');
        passed++;
      } else {
        log(5, `用户A确认失败: ${confirmARes.message}`, 'error');
        failed++;
      }

      log(5, '用户B确认比分...', 'step');
      const confirmBRes = await request('POST', `/api/events/matches/${matchId}/confirm`, {
        user_id: USER_B.id
      });

      if (confirmBRes.success) {
        log(5, '用户B确认成功', 'success');
        passed++;
      } else {
        log(5, `用户B确认失败: ${confirmBRes.message}`, 'error');
        failed++;
      }

      // 验证比赛状态
      const matchCheckRes = await request('GET', `/api/events/matches/${matchId}`);
      if (matchCheckRes.success) {
        const match = matchCheckRes.data;
        log(5, `比赛状态: ${match.status}, 胜者ID: ${match.winner_id}`, 'info');
        if (match.status === 'finished') {
          log(5, '比赛已完成', 'success');
          passed++;
        }
      }
    }

    // Step 6: 结束约球
    log(6, '用户A结束约球...', 'step');
    const finishRes = await request('POST', `/api/invitations/${invitationId}/finish`, {
      user_id: USER_A.id
    });

    if (finishRes.success) {
      log(6, '约球结束成功', 'success');
      passed++;
    } else {
      log(6, `结束约球失败: ${finishRes.message}`, 'error');
      failed++;
    }

    // 最终验证
    const finalCheckRes = await request('GET', `/api/invitations/${invitationId}`);
    if (finalCheckRes.success && finalCheckRes.data.status === 'finished') {
      log(6, '约球状态验证通过: finished', 'success');
      passed++;
    }

  } catch (error) {
    console.error(colors.red(`\n测试异常: ${error.message}`));
    failed++;
  }

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log(colors.yellow('  测试结果汇总'));
  console.log('='.repeat(60));
  console.log(`${colors.green('通过:')} ${passed}`);
  console.log(`${colors.red('失败:')} ${failed}`);
  console.log(`${colors.blue('总计:')} ${passed + failed}`);

  if (invitationId) {
    console.log(`\n${colors.cyan('测试数据:')}`);
    console.log(`  约球ID: ${invitationId}`);
    if (matchId) console.log(`  比赛ID: ${matchId}`);
  }

  console.log('='.repeat(60) + '\n');

  // 清理提示
  if (invitationId) {
    console.log(colors.yellow('提示: 如需清理测试数据，执行以下SQL:'));
    console.log(`  DELETE FROM match_scores WHERE match_id = ${matchId};`);
    console.log(`  DELETE FROM matches WHERE id = ${matchId};`);
    console.log(`  DELETE FROM invitation_participants WHERE invitation_id = ${invitationId};`);
    console.log(`  DELETE FROM match_invitations WHERE id = ${invitationId};`);
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(console.error);
