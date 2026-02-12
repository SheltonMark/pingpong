/**
 * 模拟完整赛事流程（直接操作数据库 + API）
 *
 * 1. 选一个单打赛事
 * 2. 批量报名8个用户
 * 3. 生成淘汰赛对阵
 * 4. 模拟比分、确认、积分计算
 */

const { pool } = require('../config/database');
const fetch = globalThis.fetch || require('node-fetch');
const BASE_URL = process.env.BASE_URL || 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com';

const PLAYERS = [
  { id: 1007, name: '海中' },
  { id: 1008, name: '那图' },
  { id: 1013, name: '黄海' },
  { id: 1014, name: '孩睡' },
  { id: 1015, name: '发个' },
  { id: 1057, name: '肖老大' },
  { id: 1066, name: '董' },
  { id: 1012, name: '海中海' },
];

const EVENT_ID = 12; // 日日日 - 校际单打赛

const c = {
  g: (t) => `\x1b[32m${t}\x1b[0m`,
  r: (t) => `\x1b[31m${t}\x1b[0m`,
  y: (t) => `\x1b[33m${t}\x1b[0m`,
  b: (t) => `\x1b[34m${t}\x1b[0m`,
  n: (t) => `\x1b[36m${t}\x1b[0m`,
};

async function api(method, path, data = null) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (data && (method === 'POST' || method === 'PUT')) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  return res.json();
}

function generateScore(gamesToWin = 3) {
  const scores = [];
  let w1 = 0, w2 = 0, gn = 1;
  const p1WinsMatch = Math.random() < 0.5;

  while (w1 < gamesToWin && w2 < gamesToWin) {
    let s1, s2, p1g;
    if (p1WinsMatch) {
      p1g = w2 >= gamesToWin - 1 ? true : Math.random() < 0.65;
    } else {
      p1g = w1 >= gamesToWin - 1 ? false : Math.random() < 0.35;
    }
    if (p1g) {
      s2 = Math.floor(Math.random() * 10);
      s1 = s2 >= 10 ? 12 : 11;
      w1++;
    } else {
      s1 = Math.floor(Math.random() * 10);
      s2 = s1 >= 10 ? 12 : 11;
      w2++;
    }
    scores.push({ game_number: gn++, player1_score: s1, player2_score: s2 });
  }
  return { scores, p1Wins: w1, p2Wins: w2, winner: w1 > w2 ? 'p1' : 'p2' };
}

async function createMatch(eventId, p1Id, p2Id, round, order) {
  const [result] = await pool.execute(
    `INSERT INTO matches (event_id, player1_id, player2_id, round, match_order, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'scheduled', NOW())`,
    [eventId, p1Id, p2Id, round, order]
  );
  return result.insertId;
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log(c.y('  模拟完整淘汰赛流程'));
  console.log('='.repeat(60) + '\n');

  // Step 1: 报名
  console.log(c.n('【第1步】批量报名'));
  console.log('-'.repeat(60));
  for (const p of PLAYERS) {
    const res = await api('POST', `/api/events/${EVENT_ID}/register`, { user_id: p.id });
    console.log(res.success ? c.g(`  ✓ ${p.name} 报名成功`) : c.y(`  - ${p.name}: ${res.message}`));
  }

  // Step 2: 生成对阵
  console.log('\n' + c.n('【第2步】生成淘汰赛对阵（8人3轮）'));
  console.log('-'.repeat(60));

  const shuffled = [...PLAYERS].sort(() => Math.random() - 0.5);
  console.log('  抽签顺序:', shuffled.map(p => p.name).join(' → '));

  // 第1轮: 4场
  console.log('\n' + c.n('【第3步】第1轮（1/4决赛）'));
  console.log('-'.repeat(60));

  const r1Winners = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i], p2 = shuffled[i + 1];
    const matchId = await createMatch(EVENT_ID, p1.id, p2.id, 1, Math.floor(i / 2) + 1);
    const result = generateScore(3);

    await api('POST', `/api/events/matches/${matchId}/score`, {
      scores: result.scores, recorded_by: p1.id
    });
    await api('POST', `/api/events/matches/${matchId}/confirm`, { user_id: p1.id });
    await api('POST', `/api/events/matches/${matchId}/confirm`, { user_id: p2.id });

    const winner = result.winner === 'p1' ? p1 : p2;
    const scoreStr = result.scores.map(s => `${s.player1_score}-${s.player2_score}`).join(', ');
    console.log(`  第${Math.floor(i / 2) + 1}场: ${p1.name} vs ${p2.name}  [${scoreStr}]  ${c.g('胜: ' + winner.name)}`);
    r1Winners.push(winner);
  }

  // 第2轮: 半决赛
  console.log('\n' + c.n('【第4步】第2轮（半决赛）'));
  console.log('-'.repeat(60));

  const r2Winners = [];
  for (let i = 0; i < r1Winners.length; i += 2) {
    const p1 = r1Winners[i], p2 = r1Winners[i + 1];
    const matchId = await createMatch(EVENT_ID, p1.id, p2.id, 2, Math.floor(i / 2) + 1);
    const result = generateScore(3);

    await api('POST', `/api/events/matches/${matchId}/score`, {
      scores: result.scores, recorded_by: p1.id
    });
    await api('POST', `/api/events/matches/${matchId}/confirm`, { user_id: p1.id });
    await api('POST', `/api/events/matches/${matchId}/confirm`, { user_id: p2.id });

    const winner = result.winner === 'p1' ? p1 : p2;
    const scoreStr = result.scores.map(s => `${s.player1_score}-${s.player2_score}`).join(', ');
    console.log(`  第${Math.floor(i / 2) + 1}场: ${p1.name} vs ${p2.name}  [${scoreStr}]  ${c.g('胜: ' + winner.name)}`);
    r2Winners.push(winner);
  }

  // 第3轮: 决赛
  console.log('\n' + c.n('【第5步】决赛'));
  console.log('-'.repeat(60));

  const p1 = r2Winners[0], p2 = r2Winners[1];
  const finalId = await createMatch(EVENT_ID, p1.id, p2.id, 3, 1);
  const finalResult = generateScore(3);

  await api('POST', `/api/events/matches/${finalId}/score`, {
    scores: finalResult.scores, recorded_by: p1.id
  });
  await api('POST', `/api/events/matches/${finalId}/confirm`, { user_id: p1.id });
  await api('POST', `/api/events/matches/${finalId}/confirm`, { user_id: p2.id });

  const champion = finalResult.winner === 'p1' ? p1 : p2;
  const runnerUp = finalResult.winner === 'p1' ? p2 : p1;
  const scoreStr = finalResult.scores.map(s => `${s.player1_score}-${s.player2_score}`).join(', ');
  console.log(`  ${p1.name} vs ${p2.name}  [${scoreStr}]`);

  console.log('\n' + '='.repeat(60));
  console.log(c.y(`  🏆 冠军: ${champion.name}`));
  console.log(c.y(`  🥈 亚军: ${runnerUp.name}`));
  console.log('='.repeat(60));

  // 最终积分
  console.log('\n' + c.n('【最终积分排名】'));
  console.log('-'.repeat(60));

  const [rankings] = await pool.query(
    'SELECT id, name, points, wins, losses FROM users WHERE is_registered = 1 AND (wins > 0 OR losses > 0 OR points > 0) ORDER BY points DESC LIMIT 15'
  );
  rankings.forEach((u, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${u.name.padEnd(6)} ${String(u.points).padStart(5)}分  ${u.wins}胜${u.losses}负`);
  });

  console.log('\n' + c.g('模拟完成！') + '\n');
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error(c.r('错误:'), err);
  process.exit(1);
});
