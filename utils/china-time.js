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

    const localMatch = value.match(
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
