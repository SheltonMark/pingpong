const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { root, loadIsolated, createRouterHarness, invoke } = require('./helpers/isolated-modules');
assert.ok(fs.existsSync(path.join(root, 'backend/utils/captainApplications.js')),
  'Captain application cancellation service must be implemented');
const captainUtils = loadIsolated('backend/utils/captainApplications.js', {
  './china-time': require('../utils/china-time')
});
const { cancelCaptainApplication, canCancelCaptainApplication, withApprovedCaptain } = captainUtils;

const now = new Date('2026-10-25T12:00:00+08:00');
const schoolAdmin = { isSchoolAdmin: true, isSuperAdmin: false, managedSchoolIds: [3] };
const base = { id: 1, event_id: 20, user_id: 30, status: 'pending', event_school_id: 3,
  event_status: 'registration', event_start: '2026-10-25 13:00:00', event_end: '2026-10-25 18:00:00' };

function database(application, { matches = [], failUpdate = false, updateCount = 1 } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM captain_applications')) return [[application].filter(Boolean)];
      if (sql.includes('FROM matches')) return [matches];
      if (sql.includes('UPDATE captain_applications')) {
        if (failUpdate) throw new Error('synthetic write failure');
        return [{ affectedRows: updateCount }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return { calls, getConnection: async () => connection };
}

async function runCancellationCases() {
  for (const status of ['pending', 'approved', 'rejected']) {
    const db = database({ ...base, status });
    await cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: schoolAdmin, now }, db);
    assert.ok(db.calls.includes('commit'));
    assert.equal(db.calls.at(-1), 'release');
    const queries = db.calls.filter(item => typeof item === 'object');
    assert.ok(queries[0].sql.includes('FOR UPDATE'), 'Application and event must be locked');
    assert.ok(queries.find(item => item.sql.includes('FROM matches')).sql.includes('FOR UPDATE'), 'Matches must be locked before checking start');
    const update = queries.find(item => item.sql.includes('UPDATE captain_applications'));
    assert.ok(update.sql.includes('cancelled_by'));
    assert.ok(update.sql.includes('NOW()'), 'Final write must also guard the event start boundary');
    assert.ok(!queries.some(item => /DELETE|UPDATE event_registrations/i.test(item.sql)), 'Cancellation must preserve team registrations');
  }
  for (const [patch, context, expected] of [
    [{}, { isSchoolAdmin: true, managedSchoolIds: [4] }, 403],
    [{}, { isEventManager: true, managedSchoolIds: [3] }, 403],
    [{ event_status: 'ongoing' }, schoolAdmin, 400],
    [{ event_status: 'finished' }, schoolAdmin, 400],
    [{ event_start: '2026-10-25 12:00:00' }, schoolAdmin, 400],
    [{ event_end: '2026-10-25 11:00:00' }, schoolAdmin, 400],
    [{ event_start: 'invalid' }, schoolAdmin, 400]
  ]) {
    const db = database({ ...base, ...patch });
    await assert.rejects(() => cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: context, now }, db),
      error => error.statusCode === expected);
    assert.ok(!db.calls.some(item => /^\s*UPDATE\b/i.test(item?.sql || '')));
    assert.ok(db.calls.includes('rollback'));
    assert.equal(db.calls.at(-1), 'release');
  }
  for (const status of ['ongoing', 'pending_confirm', 'finished']) {
    const db = database(base, { matches: [{ id: 5, status }] });
    await assert.rejects(() => cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: schoolAdmin, now }, db),
      error => error.statusCode === 400);
    assert.ok(!db.calls.some(item => /^\s*UPDATE\b/i.test(item?.sql || '')));
  }
  for (const options of [{ failUpdate: true }, { updateCount: 0 }]) {
    const db = database(base, options);
    await assert.rejects(() => cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: schoolAdmin, now }, db));
    assert.ok(db.calls.includes('rollback'));
    assert.ok(!db.calls.includes('commit'));
    assert.equal(db.calls.at(-1), 'release');
  }
  const missing = database(null);
  await assert.rejects(() => cancelCaptainApplication({ applicationId: 9, adminUserId: 7, adminContext: schoolAdmin, now }, missing),
    error => error.statusCode === 404);
  const repeated = database({ ...base, status: 'cancelled' });
  await cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: schoolAdmin, now }, repeated);
  assert.ok(!repeated.calls.some(item => /^\s*UPDATE\b/i.test(item?.sql || '')));
  const superDb = database({ ...base, event_school_id: 4 });
  await cancelCaptainApplication({ applicationId: 1, adminUserId: 7, adminContext: { isSuperAdmin: true }, now }, superDb);
  assert.equal(canCancelCaptainApplication(base, now), true);
  assert.equal(canCancelCaptainApplication({ ...base, has_started_match: 1 }, now), false);
}

function eventRouter(db) {
  const harness = createRouterHarness();
  loadIsolated('backend/routes/events.js', {
    express: harness.express, '../config/database': { pool: db },
    '../utils/ratingCalculator': {}, '../utils/subscribeMessage': {}, '../utils/teamEvent': {},
    '../utils/captainApplications': captainUtils
  }, { console: { ...console, error(...args) { if (!args[1]?.statusCode) console.error(...args); } } });
  return harness;
}

async function testRevokedCaptainAndReapplication() {
  const db = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async getConnection() { return this; },
    async query(sql) {
      if (sql.includes('FROM captain_applications')) return [[{ ...base, status: 'cancelled' }]];
      if (sql.includes('FROM events')) return [[{ id: 20, event_type: 'team', status: 'registration', event_start: '2099-01-01 12:00:00' }]];
      if (sql.includes('FROM matches')) return [[]];
      throw new Error(`Revoked captain reached a team mutation: ${sql}`);
    },
    async execute(sql) {
      assert.ok(sql.includes('UPDATE captain_applications'));
      assert.ok(sql.includes('cancelled_by = NULL') && sql.includes('cancelled_at = NULL'), 'Reapplication must clear current cancellation fields');
      return [{ affectedRows: 1 }];
    }
  };
  const { handlers } = eventRouter(db);
  for (const endpoint of ['post /:id/team-invitations/:invitationId/cancel', 'post /:id/team-members/:memberId/remove', 'post /:id/cancel-team', 'put /:id/team-singles']) {
    const res = await invoke(handlers.get(endpoint), { params: { id: 20, invitationId: 5, memberId: 9 }, body: { user_id: 30, singles_player_ids: [] } });
    assert.equal(res.statusCode, 403, `${endpoint} must require an approved captain application`);
  }
  const reapplied = await invoke(handlers.get('post /:id/apply-captain'), { params: { id: 20 }, body: { user_id: 30 } });
  assert.equal(reapplied.body.success, true);
}

async function testInvitationCannotRestoreRevokedAuthority() {
  const { handlers } = eventRouter({
    async query(sql) {
      if (sql.includes('FROM team_invitations')) return [[{ id: 5, event_id: 20, inviter_id: 30, status: 'pending' }]];
      if (sql.includes('FROM captain_applications')) return [[{ status: 'cancelled' }]];
      throw new Error('Invitation acceptance continued after captain was revoked');
    }
  });
  const res = await invoke(handlers.get('post /team-invitations/:token/respond'), {
    params: { token: 'fixture' }, body: { user_id: 31, action: 'accept' }
  });
  assert.equal(res.statusCode, 403);
}

async function testInFlightMutationRechecksAuthority() {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql) { calls.push(sql); return [[{ status: 'cancelled' }]]; },
    async execute() { throw new Error('Revoked in-flight request performed a write'); }
  };
  const { handlers } = eventRouter({ getConnection: async () => connection, async query(sql) {
    if (sql.includes('FROM captain_applications')) return [[{ status: 'approved' }]];
    if (sql.includes('FROM event_registrations')) return [[{ team_name: 'preserved' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } });
  const res = await invoke(handlers.get('post /:id/cancel-team'), { params: { id: 20 }, body: { user_id: 30 } });
  assert.equal(res.statusCode, 403);
  assert.ok(calls.some(sql => typeof sql === 'string' && sql.includes('FOR UPDATE')));
  assert.ok(calls.includes('rollback') && calls.includes('release'));
  let workCalled = false;
  await assert.rejects(() => withApprovedCaptain({ getConnection: async () => connection }, 20, 30, async () => { workCalled = true; }),
    error => error.statusCode === 403);
  assert.equal(workCalled, false);
  connection.query = async sql => { calls.push(sql); return [[{ status: 'approved' }]]; };
  calls.length = 0;
  const result = await withApprovedCaptain({ getConnection: async () => connection }, 20, 30, async current => {
    assert.equal(current, connection);
    assert.ok(calls.some(sql => typeof sql === 'string' && sql.includes('FOR UPDATE')));
    calls.push('work');
    return 'saved';
  });
  assert.equal(result, 'saved');
  assert.deepEqual(calls.slice(-3), ['work', 'commit', 'release']);
  calls.length = 0;
  await assert.rejects(() => withApprovedCaptain({ getConnection: async () => connection }, 20, 30, async () => {
    throw new Error('synthetic mutation failure');
  }));
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
}

async function testReapplicationOnlyBeforeStart() {
  for (const event of [
    { status: 'ongoing' }, { status: 'finished' }, { status: 'cancelled' },
    { status: 'registration', event_start: '2020-01-01 10:00:00' }
  ]) {
    const db = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
      async getConnection() { return this; }, async query(sql) {
      if (sql.includes('FROM captain_applications')) return [[{ id: 1, status: 'cancelled' }]];
      if (sql.includes('FROM events')) return [[{ id: 20, event_type: 'team', ...event }]];
      if (sql.includes('FROM matches')) return [[]];
      throw new Error('Invalid event continued to reapplication');
    }, async execute() { throw new Error('Started event modified captain application'); } };
    const { handlers } = eventRouter(db);
    const res = await invoke(handlers.get('post /:id/apply-captain'), { params: { id: 20 }, body: { user_id: 30 } });
    assert.equal(res.statusCode, 400);
  }
}

async function testLegacyInvitationChecksCaptainInTransaction() {
  const harness = createRouterHarness();
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes('FROM captain_applications')) return [[{ status: 'cancelled' }]];
      return [{ affectedRows: 1 }];
    }
  };
  const db = { getConnection: async () => connection, async query(sql) {
    if (sql.includes('FROM team_invitations')) return [[{ id: 5, event_id: 20, inviter_id: 30, type: 'team' }]];
    if (sql.includes('FROM users')) return [[{ id: 31, name: 'fixture' }]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  loadIsolated('backend/routes/user.js', { express: harness.express, '../config/database': { pool: db },
    '../utils/ratingCalculator': {}, '../utils/subscribeMessage': {}, './events': {}, '../utils/contentSecurity': {} });
  const res = await invoke(harness.handlers.get('post /invitations/:invitationId/respond'), {
    params: { invitationId: 5 }, body: { user_id: 31, action: 'accept' }
  });
  assert.equal(res.statusCode, 403, 'Legacy user invitation endpoint must also reject revoked captains');
  assert.ok(calls.some(sql => typeof sql === 'string' && sql.includes('captain_applications') && sql.includes('FOR UPDATE')));
  assert.ok(!calls.some(sql => /^\s*UPDATE\b/i.test(sql)), 'No invitation or registration may change after revocation');
  assert.ok(calls.includes('rollback') && calls.includes('release'));
}

async function testAdminScopeAndCancellationRoute() {
  const harness = createRouterHarness();
  const queries = [];
  const db = database({ ...base, status: 'approved', event_start: '2099-01-01 12:00:00', event_end: null });
  db.execute = async (sql, params) => {
    queries.push({ sql, params });
    return sql.includes('COUNT(*)') ? [[{ total: 1 }]]
      : [[{ ...base, event_start: '2099-01-01 12:00:00', event_end: null }]];
  };
  loadIsolated('backend/routes/admin.js', { express: harness.express, bcryptjs: {}, crypto: require('crypto'),
    '../config/database': { pool: db }, '../utils/subscribeMessage': {}, '../utils/contentSecurity': {},
    '../utils/cloudStorage': {}, '../middleware/adminAuth': {}, '../utils/captainApplications': captainUtils,
    '../utils/checkinFilters': {} });
  const list = await invoke(harness.handlers.get('get /captain-applications'), {
    query: { status: 'pending' }, adminContext: schoolAdmin
  });
  assert.equal(list.body.data[0].can_cancel, true);
  assert.ok(queries[0].sql.includes('e.school_id IN') && queries[1].sql.includes('e.school_id IN'));
  assert.deepEqual(queries[0].params.slice(0, -2), queries[1].params);
  const cancelled = await invoke(harness.handlers.get('post /captain-applications/:id/cancel'), {
    params: { id: 1 }, body: { user_id: 999 }, adminUserId: 7, adminContext: schoolAdmin
  });
  assert.equal(cancelled.body.success, true);
  assert.equal(db.calls.find(item => item?.sql?.includes('UPDATE captain_applications')).params[0], 7);
  db.execute = async sql => {
    assert.ok(sql.includes('SELECT ca.*'), 'Stale approval must never reach a write');
    return [[{ ...base, status: 'cancelled' }]];
  };
  for (const action of ['approve', 'reject']) {
    const res = await invoke(harness.handlers.get(`post /captain-applications/:id/${action}`), {
      params: { id: 1 }, body: { user_id: 7 }, adminContext: { isSuperAdmin: true }
    });
    assert.equal(res.body.success, false);
  }
}

(async () => {
  await runCancellationCases();
  await testRevokedCaptainAndReapplication();
  await testInvitationCannotRestoreRevokedAuthority();
  await testLegacyInvitationChecksCaptainInTransaction();
  await testInFlightMutationRechecksAuthority();
  await testReapplicationOnlyBeforeStart();
  await testAdminScopeAndCancellationRoute();
  console.log('Captain cancellation: lifecycle, pre-start guard, school scope, locks, rollback and revoked permissions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
