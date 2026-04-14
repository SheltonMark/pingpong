const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

function parseDateTimeValue(dateLike) {
  if (!dateLike) {
    return null;
  }

  if (dateLike instanceof Date) {
    return Number.isNaN(dateLike.getTime()) ? null : dateLike;
  }

  if (typeof dateLike === 'number') {
    const date = new Date(dateLike);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof dateLike === 'string') {
    const value = dateLike.trim();
    if (!value) {
      return null;
    }

    // 明确带 Z 或数字时区偏移的 ISO 串：交给 Date，表示绝对时刻（与库/容器 TZ 无关）
    if (/[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // MySQL 等可能返回 "YYYY-MM-DD HH:mm:ss.ffffff"；去掉小数秒再走东八区墙钟解析，
    // 避免在 UTC 容器里落到 new Date(naive) 被当成 UTC 而整体偏 8 小时
    const withoutFrac = value.replace(/(\d{2}:\d{2}:\d{2})\.\d+/, '$1');

    const localMatch = withoutFrac.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (localMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = localMatch;
      const date = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour) - 8,
          Number(minute),
          Number(second)
        )
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getChinaDateParts(dateLike) {
  const date = parseDateTimeValue(dateLike);
  if (!date) {
    return null;
  }

  const chinaDate = new Date(date.getTime() + CHINA_TIME_OFFSET_MS);
  return {
    year: chinaDate.getUTCFullYear(),
    month: chinaDate.getUTCMonth() + 1,
    day: chinaDate.getUTCDate(),
    hour: chinaDate.getUTCHours(),
    minute: chinaDate.getUTCMinutes(),
    second: chinaDate.getUTCSeconds(),
    weekday: chinaDate.getUTCDay()
  };
}

function isSameChinaCalendarDay(leftDateLike, rightDateLike = new Date()) {
  const left = getChinaDateParts(leftDateLike);
  const right = getChinaDateParts(rightDateLike);

  return !!left
    && !!right
    && left.year === right.year
    && left.month === right.month
    && left.day === right.day;
}

module.exports = {
  getChinaDateParts,
  isSameChinaCalendarDay,
  parseDateTimeValue
};
