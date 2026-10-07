'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'result-auto.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const A = sandbox.globalThis.KTS_RESULT_AUTO;

function fixture() {
  const created = [];
  const recalcs = [];
  const resultService = {
    createPoller(options) {
      const state = { running: false, complete_confirmations_required: options.completeConfirmations };
      const poller = {
        async start(scope) { state.running = true; state.scope = scope; },
        stop() { state.running = false; },
        getState() { return Object.assign({}, state); }
      };
      created.push({ options, poller });
      return poller;
    }
  };
  const provider = { fetchSnapshot: async () => ({}) };
  const store = { saveResultSnapshot: async x => x };
  const pipeline = { recalculateDateRegion: async x => { recalcs.push(x); return []; } };
  return { created, recalcs, resultService, provider, store, pipeline };
}

(async () => {
  {
    const f = fixture();
    const manager = A.createManager(Object.assign({}, f, { today: () => '2026-10-06', intervalMs: 90000 }));
    const state = await manager.ensureScope({ business_date: '2026-10-06', region: 'mn' });
    assert.strictEqual(f.created.length, 1);
    assert.strictEqual(f.created[0].options.completeConfirmations, 3);
    assert.strictEqual(f.created[0].options.intervalMs, 90000);
    assert.strictEqual(state.running, true);
    await manager.ensureScope({ business_date: '2026-10-06', region: 'mn' });
    assert.strictEqual(f.created.length, 1, 'same running scope must not duplicate poller');
    assert.strictEqual(manager.states().length, 1);
    manager.stopAll();
    assert.strictEqual(manager.states().length, 0);
  }

  {
    const f = fixture();
    const manager = A.createManager(Object.assign({}, f, { today: () => '2026-10-06' }));
    await manager.ensureScope({ business_date: '2026-09-22', region: 'mb' });
    assert.strictEqual(f.created[0].options.completeConfirmations, 1, 'historical result only needs one complete fetch');
    assert.strictEqual(manager.stopScope({ business_date: '2026-09-22', region: 'mb' }), true);
  }

  assert.strictEqual(A.validScope({ business_date: '2026-10-06', region: 'mt' }), true);
  assert.strictEqual(A.validScope({ business_date: 'bad', region: 'mt' }), false);
  assert.strictEqual(A.normalizeViewMode('date'), 'date');
  assert.strictEqual(A.normalizeViewMode('realtime'), 'realtime');
  assert.strictEqual(A.normalizeViewMode('anything-else'), 'realtime');
  assert.strictEqual(A.VIEW_MODE_KEY, 'kts_kqxs_view_mode_v1');
  assert.strictEqual(A.regionLabel('mn'), 'Miền Nam');
  assert.strictEqual(A.sourceLabel('https://www.xosominhngoc.com'), 'Xổ Số Minh Ngọc');
  assert.strictEqual(A.sourceLabel('xskt.com.vn'), 'XSKT');
  assert.strictEqual(A.dateLabel('2026-10-07'), '07/10/2026');
  assert.strictEqual(A.userResultState({verified:true}).label, 'ĐÃ ĐỐI CHIẾU 2 NGUỒN');
  assert.strictEqual(A.userResultState({complete:true,verified:false}).label, 'ĐÃ ĐỦ KẾT QUẢ · ĐANG ĐỐI CHIẾU');
  assert.strictEqual(A.userResultState({verification_status:'conflict'}).label, 'CÓ LỆCH NGUỒN');
  assert.strictEqual(A.version, 'result-auto-v6-consumer-result-view');

  const conflict = {
    verification_status: 'conflict',
    verification_sources: ['primary', 'secondary'],
    verification_reason: 'KQXS_SOURCE_CONFLICT',
    verification_conflicts: ['mb:G7']
  };
  assert.strictEqual(A.verificationConflict(conflict), true);
  assert.strictEqual(A.verificationConflict({ verification_status: 'unverified' }), false);
  const details = A.verificationDetails(conflict);
  assert.deepStrictEqual(Array.from(details.sources), ['primary', 'secondary']);
  assert.deepStrictEqual(Array.from(details.conflicts), ['mb:G7']);
  assert.strictEqual(details.reason, 'KQXS_SOURCE_CONFLICT');

  console.log('result-auto-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });