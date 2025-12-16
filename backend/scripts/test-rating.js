/**
 * 积分计算器测试脚本
 * 运行: node scripts/test-rating.js
 */

const {
  calculateMatchRating,
  calculateInitialRating,
  getRatingChange
} = require('../utils/ratingCalculator');

console.log('========================================');
console.log('积分计算器测试');
console.log('参考: 浙江省等级积分联赛个人积分计算方法');
console.log('========================================\n');

// 测试1: 文档中的示例
console.log('【测试1】文档示例: A(2089分) vs B(2022分), B获胜');
console.log('积分差: 2089 - 2022 = 67分 (在63-87分段)');
console.log('预期: 低分者获胜, A-16, B+16');

const test1 = calculateMatchRating(2022, 2089); // B赢了A, B是胜者
console.log('实际结果:', {
  胜者B变化: test1.winnerChange,
  败者A变化: test1.loserChange,
  B新积分: test1.newWinnerPoints,
  A新积分: test1.newLoserPoints,
  是否爆冷: test1.isUpset
});
console.log('验证:', test1.winnerChange === 16 && test1.loserChange === -16 ? '✅ 通过' : '❌ 失败');
console.log();

// 测试2: 高分者获胜
console.log('【测试2】高分者获胜: A(2089分) vs B(2022分), A获胜');
const test2 = calculateMatchRating(2089, 2022); // A赢了B
console.log('积分差: 67分, 高分者获胜');
console.log('预期: A+5, B-5');
console.log('实际结果:', {
  胜者A变化: test2.winnerChange,
  败者B变化: test2.loserChange,
  是否爆冷: test2.isUpset
});
console.log('验证:', test2.winnerChange === 5 && test2.loserChange === -5 ? '✅ 通过' : '❌ 失败');
console.log();

// 测试3: 积分相近
console.log('【测试3】积分相近: A(1800分) vs B(1805分), A获胜');
const test3 = calculateMatchRating(1800, 1805);
console.log('积分差: 5分 (在0-12分段)');
console.log('预期: ±8分');
console.log('实际结果:', {
  胜者变化: test3.winnerChange,
  败者变化: test3.loserChange
});
console.log('验证:', test3.winnerChange === 8 && test3.loserChange === -8 ? '✅ 通过' : '❌ 失败');
console.log();

// 测试4: 大爆冷
console.log('【测试4】大爆冷: A(1500分) vs B(1800分), A获胜');
const test4 = calculateMatchRating(1500, 1800);
console.log('积分差: 300分 (在238+分段)');
console.log('预期: A+50, B-50');
console.log('实际结果:', {
  胜者变化: test4.winnerChange,
  败者变化: test4.loserChange,
  是否爆冷: test4.isUpset
});
console.log('验证:', test4.winnerChange === 50 && test4.loserChange === -50 ? '✅ 通过' : '❌ 失败');
console.log();

// 测试5: 初始积分计算
console.log('【测试5】首次参赛初始积分');
console.log('报名1800分段，小组第1名，跨度100以内');
console.log('预期: 1800 + 60 = 1860');
const init1 = calculateInitialRating(1800, 1, false);
console.log('实际结果:', init1);
console.log('验证:', init1 === 1860 ? '✅ 通过' : '❌ 失败');
console.log();

console.log('报名1800分段，小组第2名，跨度100以内');
console.log('预期: 1800 + 55 = 1855');
const init2 = calculateInitialRating(1800, 2, false);
console.log('实际结果:', init2);
console.log('验证:', init2 === 1855 ? '✅ 通过' : '❌ 失败');
console.log();

console.log('报名1800分段，小组第1名，跨度超过100');
console.log('预期: 1800 + 150 = 1950');
const init3 = calculateInitialRating(1800, 1, true);
console.log('实际结果:', init3);
console.log('验证:', init3 === 1950 ? '✅ 通过' : '❌ 失败');
console.log();

// 测试6: 各积分段的加减分
console.log('【测试6】各积分段加减分验证');
const testCases = [
  { diff: 0, expected: { highWin: 8, lowWin: 8 } },
  { diff: 12, expected: { highWin: 8, lowWin: 8 } },
  { diff: 13, expected: { highWin: 7, lowWin: 10 } },
  { diff: 37, expected: { highWin: 7, lowWin: 10 } },
  { diff: 50, expected: { highWin: 6, lowWin: 13 } },
  { diff: 100, expected: { highWin: 4, lowWin: 20 } },
  { diff: 150, expected: { highWin: 2, lowWin: 30 } },
  { diff: 200, expected: { highWin: 1, lowWin: 40 } },
  { diff: 250, expected: { highWin: 0, lowWin: 50 } },
];

let allPassed = true;
for (const tc of testCases) {
  const result = getRatingChange(tc.diff);
  const passed = result.highWin === tc.expected.highWin && result.lowWin === tc.expected.lowWin;
  if (!passed) {
    console.log(`❌ 积分差${tc.diff}: 预期 highWin=${tc.expected.highWin}, lowWin=${tc.expected.lowWin}, 实际 highWin=${result.highWin}, lowWin=${result.lowWin}`);
    allPassed = false;
  }
}
console.log(allPassed ? '✅ 所有积分段测试通过' : '❌ 部分测试失败');
console.log();

console.log('========================================');
console.log('测试完成');
console.log('========================================');
