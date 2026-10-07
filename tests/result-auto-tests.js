'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'result-auto.js'), 'utf8');
const pendingMem = new Map();
const sandbox = { globalThis: { localStorage: {
  getItem:k => pendingMem.has(k) ? pendingMem.get(k) : null,
  setItem:(k,v) => pendingMem.set(k,String(v))
} } };
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

  {
    const f = fixture();
    const manager = A.createManager(Object.assign({}, f, { today: () => '2026-10-06' }));
    await manager.ensureScope({ business_date: '2026-10-06', region: 'mn' });
    const snapshot = { business_date:'2026-10-06', region:'mn', complete:true, fingerprint:'changed-kqxs' };
    f.created[0].options.onUpdate(snapshot, { changed:true, previous:{ fingerprint:'old-kqxs' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(f.recalcs.length, 1, 'changed KQXS update must recalculate');
    assert.strictEqual(f.recalcs[0].business_date, '2026-10-06');
    assert.strictEqual(f.recalcs[0].region, 'mn');
    assert.strictEqual(f.recalcs[0].result_snapshot, snapshot);
    manager.stopAll();
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
  assert.strictEqual(A.version, 'result-auto-v9-stability-resume-safe');
  assert.strictEqual(A.PENDING_SCOPES_KEY, 'kts_settlement_pending_result_scopes_v1');
  assert.strictEqual(A.pendingScopeNeedsResume({business_date:'2026-10-07',region:'mn'},{verified:true,verification_status:'verified'},'2026-10-07'),true,'verified current-day scope still pending must resume stability confirmations');
  assert.strictEqual(A.pendingScopeNeedsResume({business_date:'2026-10-06',region:'mn'},{verified:true,verification_status:'verified'},'2026-10-07'),false,'verified historical scope may stay stopped');
  assert.strictEqual(A.pendingScopeNeedsResume({business_date:'2026-10-06',region:'mn'},{verified:false,verification_status:'unverified'},'2026-10-07'),true);
  A.rememberPendingScope({business_date:'2026-10-06',region:'mn'});
  A.rememberPendingScope({business_date:'2026-10-06',region:'mn'});
  assert.strictEqual(A.readPendingScopes().length,1,'pending scope persistence must dedupe');
  A.forgetPendingScope({business_date:'2026-10-06',region:'mn'});
  assert.strictEqual(A.readPendingScopes().length,0);

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

  const source=fs.readFileSync(path.join(__dirname,'..','app','result-auto.js'),'utf8');
  const uiSource=fs.readFileSync(path.join(__dirname,'..','app','settlement-ui.js'),'utf8');
  assert(source.includes("global.addEventListener('kts:settlement-message-saved'"));
  assert(!source.includes("save.addEventListener('click'"), 'KQXS polling must not start on raw save click');
  const parserErrorPos=uiSource.indexOf("if (outcome.status === 'parser_error')");
  const acceptedEventPos=uiSource.indexOf("new global.CustomEvent('kts:settlement-message-saved'");
  assert(parserErrorPos>=0 && acceptedEventPos>parserErrorPos, 'accepted-message event must be after parser-error fail-closed branch');
  assert(uiSource.includes("Missing config / parser errors never create a background polling job."));
  assert(source.includes('resumePendingScopes'));
  assert(source.includes("String(m.status || '').toLowerCase() !== 'cancelled'"));
  assert(source.includes("kts:settlement-message-activity-changed"));
  console.log('result-auto-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });