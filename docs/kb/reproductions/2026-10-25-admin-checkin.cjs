// Diagnostic regression: real project functions, synthetic data and API responses.
// No .env, real DB, HTTP request, or application startup is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const chinaTime = require(path.join(root, 'utils/china-time'));
const campus = require(path.join(root, 'utils/checkin-campus'));
const filters = require(path.join(root, 'backend/utils/checkinFilters'));

function loadIsolated(relativePath, dependencies, globals = {}) {
  const filename = path.join(root, relativePath);
  const module = { exports: {} };
  const isolatedRequire = (name) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: isolatedRequire,
    __dirname: path.dirname(filename), __filename: filename,
    console, Buffer, URL, process: { env: {} }, ...globals
  }, { filename });
  return module.exports;
}

function routeRegistry() {
  const handlers = new Map();
  const router = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (url, ...callbacks) => handlers.set(`${method} ${url}`, callbacks.at(-1));
  }
  return { express: { Router: () => router }, handlers };
}

async function invoke(handler, req) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler(req, res);
  assert.ok(res.body, 'Route must send a response');
  return res;
}

async function reproduceModeration() {
  const payloads = [];
  let inserts = 0;
  const db = {
    async query(sql, params) {
      assert.ok(sql.startsWith('SELECT openid FROM users'));
      return [[{ openid: params[0] === 10 ? 'admin_zjgydx' : 'synthetic-wechat-user' }]];
    },
    async execute(sql) {
      assert.ok(sql.includes('INSERT INTO events'));
      inserts += 1;
      return [{ insertId: inserts }];
    }
  };
  const unavailable = () => { throw new Error('External operation prohibited'); };
  const contentSecurity = loadIsolated('backend/utils/contentSecurity.js', {
    fs, path, buffer: require('node:buffer'), http: {}, https: {},
    '../config/database': { pool: db },
    './cloudStorage': { getAccessToken: unavailable }
  });
  const registry = routeRegistry();
  loadIsolated('backend/routes/admin.js', {
    express: registry.express, bcryptjs: {}, crypto: require('node:crypto'),
    '../config/database': { pool: db },
    '../utils/subscribeMessage': {}, '../utils/cloudStorage': {},
    '../middleware/adminAuth': {},
    '../utils/captainApplications': {}, '../utils/checkinFilters': filters,
    '../utils/contentSecurity': {
      handleContentSecurityError: contentSecurity.handleContentSecurityError,
      assertSafeSubmission: options => contentSecurity.assertSafeSubmission({
        ...options,
        textChecker: async payload => {
          payloads.push(payload);
          // Synthetic upstream response: this is not an observed WeChat errcode.
          return payload.openid?.startsWith('admin_')
            ? { errcode: 40003, errmsg: 'synthetic invalid openid' }
            : { errcode: 0, result: { suggest: 'pass' } };
        }
      })
    }
  });
  const handler = registry.handlers.get('post /events');
  const request = id => ({ adminUserId: id, body: { user_id: id, title: 'same safe fixture', event_type: 'singles' } });
  const school = await invoke(handler, request(10));
  assert.equal(payloads[0].version, 1);
  assert.equal(payloads[0].openid, undefined);
  assert.equal(school.body.success, true);
  assert.equal(inserts, 1, 'Safe fixture must be checked before INSERT');
  const control = await invoke(handler, request(2));
  assert.equal(control.body.success, true);
  assert.equal(payloads[1].version, 2);
  assert.equal(inserts, 2);
  assert.equal(contentSecurity.buildTextCheckPayload('fixture', {}).version, 1);
  console.log('PASS: placeholder identity uses audited v1; real identity uses v2; both safe controls proceed');
}

async function reproduceCheckin() {
  const points = [
    { id: 101, school_id: 3, name: 'campus A fixture', latitude: 30.290941, longitude: 120.163444, radius: 150, status: 'active' },
    { id: 102, school_id: 3, name: 'campus B fixture', latitude: 30.225226, longitude: 120.039492, radius: 150, status: 'active' }
  ];
  const records = [];
  const db = {
    async query(sql, params) {
      if (sql.startsWith('SELECT * FROM check_in_points')) return [points.filter(p => p.id === params[0])];
      if (sql.includes('FROM check_ins ci')) {
        return [records.filter(r => r.user_id === params[0] && !r.check_out_time)];
      }
      if (sql.includes('SELECT id') && sql.includes('FROM check_ins')) {
        return [records.filter(r => r.user_id === params[0])];
      }
      if (sql.includes('INSERT INTO check_ins')) {
        const point = points.find(p => p.id === params[1]);
        records.push({ id: records.length + 1, user_id: params[0], point_id: params[1], point_name: point.name });
        return [{ insertId: records.length }];
      }
      throw new Error(`Unexpected simulated SQL: ${sql}`);
    }
  };
  const registry = routeRegistry();
  loadIsolated('backend/routes/checkin.js', {
    express: registry.express,
    '../config/database': { pool: db },
    '../utils/china-time': chinaTime, '../utils/checkinFilters': filters
  });
  const handler = registry.handlers.get('post /check-in');
  const request = (id, point) => ({ body: { user_id: id, point_id: point.id, latitude: point.latitude, longitude: point.longitude } });
  const results = await Promise.all([
    invoke(handler, request(201, points[0])),
    invoke(handler, request(202, points[1]))
  ]);
  assert.ok(results.every(res => res.body.success));
  assert.equal(records.length, 2);
  console.log('PASS: two different users check into two active points of the same school concurrently');
  const active = await invoke(handler, request(201, points[1]));
  assert.equal(active.body.success, false);
  assert.ok(active.body.message.includes('请先签退'));
  records.find(r => r.user_id === 201).check_out_time = 'synthetic completed checkout';
  const completed = await invoke(handler, request(201, points[1]));
  assert.equal(completed.body.success, false);
  assert.equal(completed.body.message, '今日已完成签到，请明天再来');
  console.log('PASS: same user is blocked across points before and after checkout by existing daily rule');
}

function reproducePointSelection() {
  const checkinPage = loadIsolated('pages/check-in/check-in.js', {
    '../../utils/china-time': chinaTime, '../../utils/checkin-campus': campus
  }, { getApp: () => ({ globalData: {} }), Page() {} });
  const now = new Date('2026-10-25T15:55:00+08:00');
  const validPoints = [
    { id: 101, distance: 10, radius: 150, start_time: '2026-10-25 13:30:00', end_time: '2026-10-25 17:05:00' },
    { id: 102, distance: 14000, radius: 150, start_time: '2026-10-25 13:30:00', end_time: '2026-10-25 17:05:00' }
  ];
  assert.equal(checkinPage.selectDisplayPoint({ points: validPoints, now }).id, 101);
  assert.equal(checkinPage.selectDisplayPoint({ points: validPoints.map(p => ({ ...p, distance: p.id === 102 ? 10 : 14000 })), now }).id, 102);
  console.log('PASS: with equal valid windows, each campus selects its nearby point');
  // Relevant values from the read-only public API snapshot; no live request here.
  const snapshot = [
    { id: 43, distance: 0, radius: 470, start_time: '2026-10-13 00:00:00', end_time: '2026-10-14 00:00:00' },
    { id: 11, distance: 13969, radius: 150, start_time: null, end_time: null },
    { id: 46, distance: 13990, radius: 100, start_time: '2026-10-25 13:30:00', end_time: '2026-10-25 17:05:00' }
  ];
  const selected = checkinPage.selectDisplayPoint({ points: snapshot, now });
  assert.equal(selected.id, 11);
  const state = checkinPage.deriveCheckInActionState({ withinRange: selected.distance <= selected.radius, timeStatus: 'ok', now });
  assert.equal(state.canSubmit, false);
  assert.equal(state.actionButtonText, '距离过远');
  console.log('PASS: current Pingfeng snapshot selects valid but distant old Zhaohui point and disables check-in');
}

(async () => {
  await reproduceModeration();
  await reproduceCheckin();
  reproducePointSelection();
  console.log('All isolated diagnostic assertions passed; no real writes or external calls');
})().catch(error => { console.error(error); process.exitCode = 1; });
