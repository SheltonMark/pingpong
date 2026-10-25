// Keep in sync with mini-program utils/checkin-campus.js; backend is deployed alone.
const UNASSIGNED_CAMPUS = '__unassigned__';

function normalizeCampus(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 100 || value.trim() === UNASSIGNED_CAMPUS) {
    const error = new Error('校区名称须为100字以内的文本');
    error.statusCode = 400;
    throw error;
  }
  return value.trim() || null;
}

function campusFilter(value, alias = 'cp') {
  if (!['p', 'cp'].includes(alias)) throw new Error('Invalid point alias');
  if (value === UNASSIGNED_CAMPUS) {
    return { sql: ` AND (${alias}.campus IS NULL OR ${alias}.campus = '')`, params: [] };
  }
  const campus = normalizeCampus(value);
  return campus ? { sql: ` AND ${alias}.campus = ?`, params: [campus] } : { sql: '', params: [] };
}

function buildCheckinRecordFilter(query, context) {
  let sql = '';
  const params = [];
  if (!context.isSuperAdmin) {
    const ids = context.managedSchoolIds || [];
    sql += ids.length ? ` AND u.school_id IN (${ids.map(() => '?').join(',')})` : ' AND 1=0';
    params.push(...ids);
  }
  if (query.school_id) {
    sql += ' AND u.school_id = ?';
    params.push(query.school_id);
  }
  const campus = campusFilter(query.campus);
  sql += campus.sql;
  params.push(...campus.params);
  if (query.start_date) {
    sql += ' AND DATE(ci.check_in_time) >= ?';
    params.push(query.start_date);
  }
  if (query.end_date) {
    sql += ' AND DATE(ci.check_in_time) <= ?';
    params.push(query.end_date);
  }
  return { sql, params };
}

module.exports = { normalizeCampus, campusFilter, buildCheckinRecordFilter };
