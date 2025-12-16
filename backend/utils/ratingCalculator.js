/**
 * 积分计算器
 * 参考：浙江省等级积分联赛个人积分计算方法
 * 文档位置：docs/plans/浙江省等级积分联赛个人积分计算方法.md
 */

/**
 * 竞赛积分计算表（表2）
 * 根据积分差和比赛结果计算加减分
 */
const RATING_TABLE = [
  { min: 0, max: 12, highWin: 8, lowWin: 8 },
  { min: 13, max: 37, highWin: 7, lowWin: 10 },
  { min: 38, max: 62, highWin: 6, lowWin: 13 },
  { min: 63, max: 87, highWin: 5, lowWin: 16 },
  { min: 88, max: 112, highWin: 4, lowWin: 20 },
  { min: 113, max: 137, highWin: 3, lowWin: 25 },
  { min: 138, max: 162, highWin: 2, lowWin: 30 },
  { min: 163, max: 187, highWin: 2, lowWin: 35 },
  { min: 188, max: 212, highWin: 1, lowWin: 40 },
  { min: 213, max: 237, highWin: 1, lowWin: 45 },
  { min: 238, max: Infinity, highWin: 0, lowWin: 50 }
];

/**
 * 首次参赛初始积分赋分表（表1）
 * 根据小组循环赛名次确定初始积分
 */
const INITIAL_RATING_TABLE = {
  // 积分跨度100以内
  normal: [
    { rank: 1, points: 60 },
    { rank: 2, points: 55 },
    { rank: 3, points: 50 },
    { rank: 4, points: 45 },
    { rank: 5, points: 40 },
    { rank: 6, points: 35 },
    { rank: 7, points: 30 },
    { rank: 8, points: 25 }
  ],
  // 积分跨度超过100
  wide: [
    { rank: 1, points: 150 },
    { rank: 2, points: 135 },
    { rank: 3, points: 120 },
    { rank: 4, points: 105 },
    { rank: 5, points: 90 },
    { rank: 6, points: 75 },
    { rank: 7, points: 60 },
    { rank: 8, points: 45 }
  ]
};

/**
 * 根据积分差查找对应的加减分规则
 * @param {number} diff - 两位选手的积分差（绝对值）
 * @returns {Object} - 返回 { highWin, lowWin }
 */
function getRatingChange(diff) {
  const absDiff = Math.abs(diff);
  for (const row of RATING_TABLE) {
    if (absDiff >= row.min && absDiff <= row.max) {
      return { highWin: row.highWin, lowWin: row.lowWin };
    }
  }
  // 默认返回最后一档
  return { highWin: 0, lowWin: 50 };
}

/**
 * 计算比赛后双方的积分变化
 * @param {number} winnerPoints - 胜者当前积分
 * @param {number} loserPoints - 败者当前积分
 * @returns {Object} - { winnerChange, loserChange, newWinnerPoints, newLoserPoints }
 */
function calculateMatchRating(winnerPoints, loserPoints) {
  const diff = winnerPoints - loserPoints;
  const { highWin, lowWin } = getRatingChange(diff);

  let winnerChange, loserChange;

  if (diff >= 0) {
    // 高分者获胜
    winnerChange = highWin;
    loserChange = -highWin;
  } else {
    // 低分者获胜（爆冷）
    winnerChange = lowWin;
    loserChange = -lowWin;
  }

  return {
    winnerChange,
    loserChange,
    newWinnerPoints: winnerPoints + winnerChange,
    newLoserPoints: Math.max(0, loserPoints + loserChange), // 积分不能为负
    ratingDiff: Math.abs(diff),
    isUpset: diff < 0 // 是否爆冷
  };
}

/**
 * 计算首次参赛选手的初始积分
 * @param {number} baseTier - 报名积分段（如 1800）
 * @param {number} groupRank - 小组循环赛名次（1-8）
 * @param {boolean} wideRange - 该级别积分跨度是否超过100
 * @returns {number} - 初始积分
 */
function calculateInitialRating(baseTier, groupRank, wideRange = false) {
  const table = wideRange ? INITIAL_RATING_TABLE.wide : INITIAL_RATING_TABLE.normal;

  // 查找对应名次的赋分
  const entry = table.find(e => e.rank === groupRank);
  if (entry) {
    return baseTier + entry.points;
  }

  // 名次超出表格范围，按公式递减
  // 跨度100以内：每名次递减5分，从第8名的25分开始
  // 跨度超100：每名次递减15分，从第8名的45分开始
  if (wideRange) {
    const extraRanks = groupRank - 8;
    const points = Math.max(0, 45 - extraRanks * 15);
    return baseTier + points;
  } else {
    const extraRanks = groupRank - 8;
    const points = Math.max(0, 25 - extraRanks * 5);
    return baseTier + points;
  }
}

/**
 * 批量计算小组赛后的积分
 * 遍历所有比赛结果，逐场计算积分变化
 * @param {Array} matches - 比赛记录数组 [{ winnerId, loserId, winnerPoints, loserPoints }, ...]
 * @param {Object} initialPoints - 初始积分映射 { oderId: points, ... }
 * @returns {Object} - 最终积分映射和详细变化记录
 */
function calculateGroupStageRatings(matches, initialPoints) {
  // 复制初始积分
  const currentPoints = { ...initialPoints };
  const changes = [];

  for (const match of matches) {
    const { winnerId, loserId } = match;
    const winnerPts = currentPoints[winnerId] || 0;
    const loserPts = currentPoints[loserId] || 0;

    const result = calculateMatchRating(winnerPts, loserPts);

    // 更新积分
    currentPoints[winnerId] = result.newWinnerPoints;
    currentPoints[loserId] = result.newLoserPoints;

    // 记录变化
    changes.push({
      matchId: match.id,
      winnerId,
      loserId,
      winnerPointsBefore: winnerPts,
      loserPointsBefore: loserPts,
      winnerChange: result.winnerChange,
      loserChange: result.loserChange,
      winnerPointsAfter: result.newWinnerPoints,
      loserPointsAfter: result.newLoserPoints,
      ratingDiff: result.ratingDiff,
      isUpset: result.isUpset
    });
  }

  return {
    finalPoints: currentPoints,
    changes
  };
}

module.exports = {
  RATING_TABLE,
  INITIAL_RATING_TABLE,
  getRatingChange,
  calculateMatchRating,
  calculateInitialRating,
  calculateGroupStageRatings
};
