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
  console.log('result-auto-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });