'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const event = {
  id: 'ev1',
  scope_id: 'scope:p1:2026-09-22:mn',
  partner_id: 'p1', business_date: '2026-09-22', region: 'mn',
  observed_at: '2026-10-06T10:00:00Z', trigger: 'BATCH_COMPARE', reason: 'operator:shadow-batch', comparison_status: 'MISMATCH',
  comparison: {
    status: 'MISMATCH',
    totals: {
      total_xac: { status: 'MATCH_EXACT', local: 288, reference: 288, delta: 0 },
      total_qua_co: { status: 'MISMATCH', local: 219.88, reference: 218.88, delta: 1 },
      final_net: { status: 'MISMATCH', local: -4430.12, reference: -4431.12, delta: 1 }
    },
    categories: [{
      code: 'DAT', status: 'MISMATCH', fields: {
        xac: { status: 'MATCH_EXACT', local: 72, reference: 72, delta: 0 },
        qua_co: { status: 'MISMATCH', local: 55.72, reference: 54.72, delta: 1 },
        payout: { status: 'MATCH_EXACT', local: 3000, reference: 3000, delta: 0 }
      }
    }]
  },
  local_snapshot: {
    engine_version: 'settlement-test',
    settlement_result: { final_net: -4430.12 },
    category_rows: [{ code: 'DAT', xac: 72, qua_co: 55.72, payout: 3000 }],
    messages: [
      { id: 'm-dat', raw_text: '75 32 da 1n', canonical_payload: { region: 'mn', legs: [{ code: 'DAT', values: ['75','32'], station_codes: ['tg'], stake: '1' }] } },
      { id: 'm-b', raw_text: '88 b 1n', canonical_payload: { region: 'mn', legs: [{ code: '2CB', values: ['88'], station_codes: ['tg'], stake: '1' }] } }
    ],
    config_snapshot: {
      version: 4, effective_from_date: '2026-09-01', commission_type: 'ratio', total_percent: '100', refund_percent: '0',
      dat_hit_mode: 'ky_ruoi', dax_hit_mode: 'multi_pair', mb_xien_234: false, tinh_ui: false,
      region_pricing: { mn: { DAT: { commission: '0.76', win: '750' }, '2CB': { commission: '0.76', win: '75' } } }
    },
    lottery_result_snapshot: {
      business_date: '2026-09-22', region: 'mn', source: 'providerA', fingerprint: 'fp1', complete: true, coverage_complete: true,
      verification_status: 'verified', verification_sources: ['providerA','providerB'], expected_station_codes: ['tg'],
      stations: [{ code: 'tg', prizes: { DB: ['123456'] } }]
    }
  },
  reference_snapshot: { source: 'HIOSKT_BATCH', totals: { xac: '288', qua_co: '218.88', payout: '4650', final: '-4431.12' } }
};

const candidate = {
  id: 'candidate:ev1', source_event_id: 'ev1', state: 'pending',
  case: { partner_role: 'customer', scope: { partner_id: 'p1', business_date: '2026-09-22', region: 'mn' } }
};
const state = { candidates: [candidate] };
const candidatesApi = {
  STATES: { PENDING: 'pending' },
  async listCandidates() { return JSON.parse(JSON.stringify(state.candidates)); }
};
const runtime = {
  async getHistory(scope) {
    assert.strictEqual(scope.partner_id, 'p1');
    return [JSON.parse(JSON.stringify(event))];
  }
};
const store = {
  STORES: { partners: 'partners' },
  async get(name, id) { return name === 'partners' && id === 'p1' ? { id: 'p1', name: 'Hiền', role: 'customer' } : null; }
};

const ctx = { console, globalThis: null, KTS_SETTLEMENT_REGRESSION_CANDIDATES: candidatesApi, KTS_SETTLEMENT_SHADOW_RUNTIME: runtime, KTS_SETTLEMENT_STORE: store };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-repair-workflow.js', 'utf8'), ctx, { filename: 'settlement-repair-workflow.js' });
const W = ctx.KTS_SETTLEMENT_REPAIR_WORKFLOW;

(async () => {
  assert.strictEqual(W.version, 'settlement-repair-workflow-v1');
  const issues = W.issueRowsFromEvent(event);
  assert.strictEqual(issues.length, 3);
  assert(issues.some(x => x.kind === 'category' && x.code === 'DAT' && x.field === 'qua_co'));
  assert(issues.some(x => x.kind === 'total' && x.field === 'final_net'));

  const messages = W.relevantMessages(event, issues);
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].id, 'm-dat');

  const pricing = W.relevantPricing(event.local_snapshot.config_snapshot, 'mn', issues);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pricing)), { DAT: { commission: '0.76', win: '750' } });

  const hints = W.diagnosticHints(issues);
  assert(hints.some(x => x.includes('commission_type')));

  const packet = W.buildRepairPacket(candidate, event, { id: 'p1', name: 'Hiền', role: 'customer' });
  assert.strictEqual(packet.format, 'kts-shadow-repair-packet-v1');
  assert.strictEqual(packet.partner.name, 'Hiền');
  assert.strictEqual(packet.config_summary.version, 4);
  assert.strictEqual(packet.config_summary.relevant_pricing.DAT.win, '750');
  assert.strictEqual(packet.result_summary.verification_status, 'verified');
  assert.deepStrictEqual(Array.from(packet.issue_codes), ['DAT']);
  assert.strictEqual(packet.messages.length, 1);

  const loaded = await W.loadCandidatePacket(candidate);
  assert.strictEqual(loaded.source_event_id, 'ev1');
  const group = await W.loadGroup(['candidate:ev1']);
  assert.strictEqual(group.total, 1);
  assert.strictEqual(group.loaded, 1);
  assert.strictEqual(group.errors.length, 0);

  await assert.rejects(() => W.loadGroup(['missing']), /REPAIR_GROUP_EMPTY/);
  const missingEvent = JSON.parse(JSON.stringify(candidate));
  missingEvent.id = 'candidate:nope'; missingEvent.source_event_id = 'nope';
  await assert.rejects(() => W.loadCandidatePacket(missingEvent), /REPAIR_EVIDENCE_NOT_FOUND/);

  console.log('settlement-repair-workflow-tests: PASS');
})().catch(error => { console.error(error); process.exit(1); });