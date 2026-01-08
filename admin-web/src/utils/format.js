// 格式化日期时间
export function formatDateTime(dateStr) {
  if (!dateStr) return '-'

  // MySQL 返回的日期格式是 "2024-12-20T09:00:00.000Z" 或 "2024-12-20 09:00:00"
  // 如果是 ISO 格式带 Z，说明是 UTC 时间，需要转换为本地时间
  // 如果不带 Z，应该直接作为本地时间解析
  let date

  if (typeof dateStr === 'string') {
    // 检查是否是 ISO 格式 (带 T 和 Z)
    if (dateStr.includes('T') && dateStr.includes('Z')) {
      // UTC 时间，让 Date 自动转换为本地时间
      date = new Date(dateStr)
    } else if (dateStr.includes('T')) {
      // ISO 格式但不带 Z，可能被当作本地时间
      date = new Date(dateStr)
    } else {
      // MySQL 格式 "2024-12-20 09:00:00"
      // 直接替换空格为 T，不加 Z，让它被当作本地时间
      date = new Date(dateStr.replace(' ', 'T'))
    }
  } else {
    date = new Date(dateStr)
  }

  if (isNaN(date.getTime())) return dateStr

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

// 格式化日期
export function formatDate(dateStr) {
  if (!dateStr) return '-'

  let date
  if (typeof dateStr === 'string') {
    if (dateStr.includes('T') && dateStr.includes('Z')) {
      date = new Date(dateStr)
    } else if (dateStr.includes('T')) {
      date = new Date(dateStr)
    } else {
      date = new Date(dateStr.replace(' ', 'T'))
    }
  } else {
    date = new Date(dateStr)
  }

  if (isNaN(date.getTime())) return dateStr

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
