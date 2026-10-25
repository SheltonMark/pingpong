const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { root, loadIsolated, createRouterHarness, invoke } = require('./helpers/isolated-modules');
assert.ok(fs.existsSync(path.join(root, 'utils/checkin-campus.js')), 'Check-in campus selection must be implemented');
const campus = require('../../utils/checkin-campus');
const filters = loadIsolated('backend/utils/checkinFilters.js', { '../../utils/checkin-campus': campus });
const fixture = [
  { id: 1, school_id: 3, campus: '朝晖校区', distance: 10, radius: 150 },
  { id: 2, school_id: 3, campus: '屏峰校区', distance: 14000, radius: 150 },
  { id: 3, school_id: null, campus: '屏峰校区', distance: 15, radius: 100 },
  { id: 4, school_id: 3, campus: null, distance: 1, radius: 150 }
];

function testCampusSemantics() {
  const backendTime = require('../utils/china-time');
  const miniTime = require('../../utils/china-time');
  for (const input of ['2026-10-25 13:30:00', '2026-10-25 13:30:00.000000', '2026-10-25T05:30:00Z', 'invalid', null]) {
    assert.equal(backendTime.parseDateTimeValue(input)?.getTime(), miniTime.parseDateTimeValue(input)?.getTime());
  }
  assert.deepEqual(campus.filterPointsByCampus(fixture, '屏峰校区').map(p => p.id), [2, 3]);
  assert.deepEqual(campus.filterPointsByCampus(fixture, campus.UNASSIGNED_CAMPUS).map(p => p.id), [4]);
  assert.equal(campus.filterPointsByCampus(fixture, '').length, 4);
  const options = campus.getCampusOptions(fixture);
  assert.equal(options[0].label, '全部校区');
  assert.equal(options.filter(option => option.value === '屏峰校区').length, 1);
  assert.ok(options.some(option => option.value === campus.UNASSIGNED_CAMPUS));
  assert.equal(filters.normalizeCampus(' 朝晖校区 '), '朝晖校区');
  assert.throws(() => filters.normalizeCampus('x'.repeat(101)), error => error.statusCode === 400);
  assert.throws(() => filters.normalizeCampus(campus.UNASSIGNED_CAMPUS), error => error.statusCode === 400);
  assert.ok(filters.campusFilter(campus.UNASSIGNED_CAMPUS, 'cp').sql.includes('IS NULL'));
}

function adminRoutes(db) {
  const harness = createRouterHarness();
  loadIsolated('backend/routes/admin.js', {
    express: harness.express, bcryptjs: {}, crypto: require('crypto'),
    '../config/database': { pool: db }, '../utils/subscribeMessage': {},
    '../utils/contentSecurity': {}, '../utils/cloudStorage': {}, '../middleware/adminAuth': {},
    '../utils/captainApplications': {}, '../utils/checkinFilters': filters
  });
  return harness.handlers;
}

async function testRecordAndExportFilters() {
  const queries = [];
  const handlers = adminRoutes({
    async execute(sql, params) {
      queries.push({ sql, params: [...params] });
      return sql.includes('COUNT(*) as total') ? [[{ total: 1 }]] : [[{ campus: '屏峰校区', user_name: 'fixture' }]];
    }
  });
  const req = { query: { campus: '屏峰校区', school_id: '3', start_date: '2026-10-25', end_date: '2026-10-25' },
    adminContext: { isSchoolAdmin: true, managedSchoolIds: [3] } };
  const records = await invoke(handlers.get('get /checkin-records'), req);
  assert.equal(records.body.success, true);
  assert.equal(queries.length, 2);
  const [list, count] = queries;
  assert.ok(list.sql.includes('cp.campus = ?') && count.sql.includes('cp.campus = ?'));
  assert.ok(count.sql.includes('JOIN check_in_points cp'), 'Count query must join point metadata too');
  assert.deepEqual(list.params.slice(0, -2), count.params, 'List and total must use identical filter parameters');
  const exported = await invoke(handlers.get('get /checkin-records/export'), req);
  assert.deepEqual(queries[2].params, count.params, 'Export must use the same school, campus and date scope');
  assert.ok(exported.body.includes('校区'));
  assert.ok(exported.body.includes('屏峰校区'));
  assert.ok(list.sql.includes('u.school_id IN'), 'School admin record scope must be enforced');
}

async function testPublicPointFilter() {
  let captured;
  const harness = createRouterHarness();
  loadIsolated('backend/routes/checkin.js', {
    express: harness.express,
    '../config/database': { pool: { query: async (sql, params) => { captured = { sql, params }; return [[]]; } } },
    '../utils/china-time': require('../utils/china-time'), '../utils/checkinFilters': filters
  });
  await invoke(harness.handlers.get('get /points'), { query: { school_id: 3, campus: '屏峰校区', lat: 30, lng: 120 } });
  assert.ok(captured.sql.includes('p.school_id IS NULL'));
  assert.ok(captured.sql.includes('p.campus = ?'));
  assert.equal(captured.params.at(-1), '屏峰校区');
}

async function testPointCampusPersistence() {
  const writes = [];
  const handlers = adminRoutes({ async execute(sql, params) {
    writes.push({ sql, params });
    return [{ insertId: 51, affectedRows: 1 }];
  } });
  const context = { isSuperAdmin: true };
  const body = { name: 'fixture', latitude: 30, longitude: 120, school_id: 3, campus: ' 屏峰校区 ' };
  const created = await invoke(handlers.get('post /checkin-points'), { body, adminContext: context });
  assert.equal(created.body.success, true);
  assert.ok(writes[0].params.includes('屏峰校区'));
  await invoke(handlers.get('put /checkin-points/:id'), { params: { id: 51 }, body, adminContext: context });
  assert.ok(writes[1].params.includes('屏峰校区'));
  const { campus: ignored, ...legacyBody } = body;
  await invoke(handlers.get('put /checkin-points/:id'), { params: { id: 51 }, body: legacyBody, adminContext: context });
  assert.ok(writes[2].sql.includes('campus = IF('), 'Legacy clients must preserve the campus when omitted');
  assert.equal(writes[2].params.at(-3), false);
  await invoke(handlers.get('put /checkin-points/:id'), { params: { id: 51 }, body: { ...body, campus: null }, adminContext: context });
  assert.equal(writes[3].params.at(-3), true);
  assert.equal(writes[3].params.at(-2), null, 'Explicit null must allow clearing campus');
}

function createPage(request) {
  let config;
  loadIsolated('pages/check-in/check-in.js', {
    '../../utils/china-time': require('../../utils/china-time'), '../../utils/checkin-campus': campus
  }, { getApp: () => ({ globalData: { userInfo: { school_id: 3 } }, request }), Page(value) { config = value; } });
  return { ...config, data: { ...JSON.parse(JSON.stringify(config.data)), location: { lat: 30, lng: 120 } },
    setData(data) { Object.assign(this.data, data); } };
}

async function testPageSelectionAndRaces() {
  const page = createPage(async () => ({ success: true, data: fixture }));
  await page.loadNearestPoint();
  const allOptions = page.data.campusOptions.map(option => option.value);
  const targetIndex = page.data.campusOptions.findIndex(option => option.value === '屏峰校区');
  await page.onCampusChange({ detail: { value: targetIndex } });
  assert.equal(page.data.nearestPoint.id, 3, 'Campus selection must exclude a nearer point from another campus');
  assert.deepEqual(page.data.campusOptions.map(option => option.value), allOptions, 'Other campuses must remain selectable');
  page.data.selectedCampus = '不存在的校区';
  await page.loadNearestPoint();
  assert.equal(page.data.nearestPoint, null);
  assert.equal(page.data.canSubmit, false);
  page.data.activeRecord = { point_id: 1, point_latitude: 30, point_longitude: 120, point_radius: 150, campus: '朝晖校区' };
  await page.loadNearestPoint();
  assert.equal(page.data.nearestPoint.id, 1, 'Active checkout point must take precedence over campus selection');
  await page.onCampusChange({ detail: { value: targetIndex } });
  assert.equal(page.data.nearestPoint.id, 1, 'Campus picker must stay locked until checkout');

  const pending = [];
  const racing = createPage(() => new Promise(resolve => pending.push(resolve)));
  const first = racing.loadNearestPoint();
  racing.data.selectedCampus = '屏峰校区';
  const second = racing.loadNearestPoint();
  pending[1]({ success: true, data: fixture });
  await second;
  pending[0]({ success: true, data: [fixture[0]] });
  await first;
  assert.equal(racing.data.nearestPoint.id, 3, 'Late response must not overwrite the newer campus selection');
}

async function testMigrationsAreIncremental() {
  for (const file of ['032_captain_application_cancellation.js', '033_checkin_campus.js']) {
    assert.ok(fs.existsSync(path.join(root, 'backend/migrations', file)), `${file} must exist`);
    const columns = new Map(file.startsWith('032') ? [['status', "enum('pending','approved','rejected')"]] : []);
    let hasIndex = false;
    const writes = [];
    const db = { async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[...columns].map(([COLUMN_NAME, COLUMN_TYPE]) => ({ COLUMN_NAME, COLUMN_TYPE }))];
      if (sql.includes('information_schema.STATISTICS')) return [hasIndex ? [{}] : []];
      assert.ok(!/\b(DROP|DELETE|TRUNCATE)\b/i.test(sql));
      writes.push(sql);
      for (const name of ['campus', 'cancelled_by', 'cancelled_at']) if (sql.includes(`ADD COLUMN ${name} `)) columns.set(name, 'fixture');
      if (sql.includes('MODIFY COLUMN status')) columns.set('status', "enum('pending','approved','rejected','cancelled')");
      if (sql.includes('ADD INDEX')) hasIndex = true;
      return [{}];
    } };
    const migration = loadIsolated(`backend/migrations/${file}`, { '../config/database': { pool: db } });
    await migration.up(db);
    const initialWrites = writes.length;
    assert.ok(initialWrites > 0);
    await migration.up(db);
    assert.equal(writes.length, initialWrites, `${file} must not repeat schema changes or the initial backfill`);
  }
}

(async () => {
  testCampusSemantics();
  await testRecordAndExportFilters();
  await testPublicPointFilter();
  await testPointCampusPersistence();
  await testPageSelectionAndRaces();
  await testMigrationsAreIncremental();
  console.log('Campus check-in: school scope, points, records/count/export, picker, checkout, races and migrations passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
