// Run Vue SFC setup logic against offline API fixtures; no browser or live API.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const vue = require('../../admin-web/node_modules/vue');
const compiler = require('../../admin-web/node_modules/@vue/compiler-sfc');

function mountSetup(view, fetch, { confirm = async () => {} } = {}) {
  const filename = path.resolve(__dirname, `../../admin-web/src/views/${view}.vue`);
  const { descriptor, errors } = compiler.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(errors.length, 0);
  const compiled = compiler.compileScript(descriptor, { id: view });
  const template = compiler.compileTemplate({ source: descriptor.template.content, filename, id: view,
    compilerOptions: { bindingMetadata: compiled.bindings } });
  assert.equal(template.errors.length, 0);
  const code = compiled.content.replace(/^import .+ from .+$/gm, '').replace('export default', 'module.exports =');
  const module = { exports: {} };
  const messages = [];
  const links = [];
  const globals = { ...vue, onMounted() {}, module, console, URLSearchParams, fetch,
    formatDateTime: value => value || '',
    localStorage: { getItem(key) {
      return JSON.stringify(key === 'adminUser' ? { id: 10, school_id: 3 }
        : [{ code: 'school_admin', school_id: 3 }]);
    } },
    ElMessage: Object.fromEntries(['success', 'warning', 'error'].map(type => [type, message => messages.push({ type, message })])),
    ElMessageBox: { confirm },
    window: { URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} } },
    document: { createElement: () => ({ click() { links.push(this); } }), body: { appendChild() {}, removeChild() {} } }
  };
  vm.runInNewContext(code, globals, { filename });
  const scope = vue.effectScope();
  const state = scope.run(() => module.exports.setup({}, { expose() {} }));
  return { state, messages, links, stop: () => scope.stop() };
}

async function checkinUi() {
  const requests = [];
  const points = [
    { id: 1, name: 'A', school_id: 3, campus: '朝晖校区' },
    { id: 2, name: 'B', school_id: 3, campus: '屏峰校区' },
    { id: 3, name: 'common', school_id: null, campus: '屏峰校区' },
    { id: 4, name: 'legacy', school_id: 3, campus: null }
  ];
  const ui = mountSetup('Checkin', async (url, options) => {
    requests.push({ url, options });
    return { ok: true, blob: async () => 'fixture', json: async () => ({ success: true,
      data: url.includes('checkin-points?') ? points : [], total: 0 }) };
  });
  const s = ui.state;
  await s.loadPoints();
  s.pointFilter.value.campus = '屏峰校区';
  assert.deepEqual(Array.from(s.filteredPoints.value, point => point.id), [2, 3]);
  assert.ok(s.pointCampusOptions.value.some(option => option.value === '朝晖校区'));
  s.pointFilter.value.campus = '__unassigned__';
  assert.deepEqual(Array.from(s.filteredPoints.value, point => point.id), [4]);
  s.showCreateDialog();
  Object.assign(s.form.value, { name: 'fixture', latitude: 30, longitude: 120, campus: ' 屏峰校区 ' });
  await s.submitForm();
  const created = requests.find(request => request.options?.method === 'POST');
  assert.equal(JSON.parse(created.options.body).campus, '屏峰校区');
  assert.equal(JSON.parse(created.options.body).school_id, 3);
  s.editPoint({ ...points[1], latitude: 30, longitude: 120 });
  assert.equal(s.form.value.campus, '屏峰校区');
  s.recordFilter.value.campus = '屏峰校区';
  s.recordFilter.value.dateRange = ['2026-10-25', '2026-10-25'];
  await s.loadRecords();
  await s.exportRecords();
  const records = requests.find(request => request.url.startsWith('/api/admin/checkin-records?'));
  const exported = requests.find(request => request.url.startsWith('/api/admin/checkin-records/export?'));
  for (const request of [records, exported]) {
    const params = new URLSearchParams(request.url.split('?')[1]);
    assert.equal(params.get('campus'), '屏峰校区');
    assert.equal(params.get('start_date'), '2026-10-25');
    assert.equal(params.get('end_date'), '2026-10-25');
  }
  assert.equal(ui.links.length, 1);
  s.recordFilter.value.school_id = 4;
  await vue.nextTick();
  assert.equal(s.recordFilter.value.campus, '');
  ui.stop();
}

async function captainUi() {
  const requests = [];
  let confirmation = 'accept';
  const ui = mountSetup('CaptainApprovals', async (url, options) => {
    requests.push({ url, options });
    return { json: async () => ({ success: true, data: [], total: 0 }) };
  }, { confirm: async () => { if (confirmation === 'cancel') throw 'cancel'; } });
  const s = ui.state;
  await s.cancelApplication({ id: 21, applicant_name: 'fixture' });
  assert.equal(requests[0].url, '/api/admin/captain-applications/21/cancel');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(s.cancellingId.value, null);
  assert.ok(ui.messages.some(message => message.type === 'success'));
  confirmation = 'cancel';
  const count = requests.length;
  await s.cancelApplication({ id: 22, applicant_name: 'fixture' });
  assert.equal(requests.length, count, 'Dismissed confirmation must not send cancellation');
  s.page.value = 5;
  s.activeTab.value = 'cancelled';
  s.changeTab();
  assert.equal(s.page.value, 1);
  assert.ok(requests.at(-1).url.includes('status=cancelled&page=1'));
  ui.stop();
}

(async () => {
  await checkinUi();
  await captainUi();
  console.log('Admin UI: Vue compilation, campus filters/save/export and captain cancel/confirm/tab flows passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
