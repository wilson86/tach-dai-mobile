'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-report.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const R = sandbox.globalThis.KTS_SETTLEMENT_REPORT;

const report = R.buildDailyPartnerReport({
  partner: { id: 'hien', name: 'Hiền', role: 'customer' },
  business_date: '2026-10-04',
  messages_by_id: {
    m1: { raw_text: 'tg 75 b 1n tg 75 74 dd 1n' },
    m2: { raw_text: 'tg 75 32 da 1n' }
  },
  settlements: [
    {
      id: 's1', partner_id: 'hien', message_id: 'm1', business_date: '2026-10-04', region: 'mn',
      category_rows: [
        { code: '2CB', xac: 18, qua_co: 13.68, hit_units: 2, payout: 150 },
        { code: '2CD', xac: 4, qua_co: 3.04, hit_units: 2, payout: 150 }
      ],
      detail_rows: [
        { station: 'tg', numbers: '75', selector: 'lo', points: 2 },
        { station: 'tg', numbers: '75', selector: 'dau', points: 1 },
        { station: 'tg', numbers: '74', selector: 'duoi', points: 1 }
      ],
      result_snapshot: { total_xac: 22, total_qua_co: 16.72, total_payout: 300, refund_amount: 0, final_net: -283.28 },
      comparison_status: 'MATCH_EXACT'
    },
    {
      id: 's2', partner_id: 'hien', message_id: 'm2', business_date: '2026-10-04', region: 'mn',
      category_rows: [
        { code: 'DAT', xac: 36, qua_co: 27.36, hit_units: 1.5, payout: 1125 }
      ],
      detail_rows: [
        { station: 'tg', numbers: '32-75', selector: 'dat', points: 1.5 }
      ],
      result_snapshot: { total_xac: 36, total_qua_co: 27.36, total_payout: 1125, refund_amount: 0, final_net: -1097.64 },
      comparison_status: 'MATCH_EXACT'
    }
  ]
});

assert.strictEqual(report.partner.name, 'Hiền');
assert.strictEqual(report.regions.length, 1);
assert.strictEqual(report.regions[0].region, 'mn');
assert.deepStrictEqual(Array.from(report.categories, x => x.code), ['2CB', '2CD', 'DAT']);
assert.strictEqual(report.categories[0].label, '2C lô');
assert.strictEqual(report.messages.length, 2);
assert.strictEqual(report.messages[0].detail_rows.length, 3);
assert.strictEqual(report.totals.xac, 58);
assert(Math.abs(report.totals.qua_co - 44.08) < 1e-9);
assert.strictEqual(report.totals.payout, 1425);
assert(Math.abs(report.totals.final_net - (-1380.92)) < 1e-9);
assert.strictEqual(report.totals.direction, 'BU');
assert.strictEqual(report.shadow_status, 'MATCH_EXACT');
assert.strictEqual(report.regions[0].shadow_status, 'MATCH_EXACT');

const ops = R.buildDailyOperationsReport({
  business_date: '2026-10-04',
  partners: [
    { id: 'hien', name: 'Hiền', role: 'customer' },
    { id: 'truc', name: 'Trúc', role: 'owner' },
    { id: 'thai', name: 'Thái', role: 'owner' }
  ],
  messages: [
    { id: 'h1', partner_id: 'hien', business_date: '2026-10-04', region: 'mn', raw_text: 'tg 75 b 1n' },
    { id: 't1', partner_id: 'truc', business_date: '2026-10-04', region: 'mb', raw_text: '92 b 1n' },
    { id: 'a1', partner_id: 'thai', business_date: '2026-10-04', region: 'mb', raw_text: '61 b 1n' }
  ],
  settlements: [
    {
      id:'scope:hien', partner_id:'hien', business_date:'2026-10-04', region:'mn', message_ids:['h1'],
      scope_status:'complete_unverified', comparison_status:'MATCH_EXACT', category_rows:[{code:'2CB',xac:18,qua_co:13.68,hit_units:1,payout:75}],
      result_snapshot:{total_xac:18,total_qua_co:13.68,total_payout:75,refund_amount:0,final_net:-61.32}
    },
    {
      id:'scope:truc', partner_id:'truc', business_date:'2026-10-04', region:'mb', message_ids:['t1'],
      scope_status:'complete_unverified', comparison_status:'MISMATCH', category_rows:[{code:'2CB',xac:27,qua_co:20.52,hit_units:1,payout:70}],
      result_snapshot:{total_xac:27,total_qua_co:20.52,total_payout:70,refund_amount:0,final_net:49.48}
    },
    {
      id:'scope:thai', partner_id:'thai', business_date:'2026-10-04', region:'mb', message_ids:['a1'],
      scope_status:'blocked', comparison_status:'blocked', blocked_reasons:['PENDING_PARSER:a1'], category_rows:[],
      result_snapshot:{total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0}
    }
  ]
});

assert.strictEqual(ops.status, 'BLOCKED', 'blocked outranks mismatch in daily operator status');
assert.strictEqual(ops.counts.partners, 3);
assert.strictEqual(ops.counts.exact, 1);
assert.strictEqual(ops.counts.mismatch, 1);
assert.strictEqual(ops.counts.blocked, 1);
assert.strictEqual(ops.totals.xac, 45);
assert(Math.abs(ops.totals.final_net - (-11.84)) < 1e-9);
assert.strictEqual(ops.exact_totals.xac, 18, 'exact totals must exclude mismatch/blocked scopes');
assert(Math.abs(ops.exact_totals.final_net - (-61.32)) < 1e-9);
assert.deepStrictEqual(Array.from(ops.partners, x => x.partner.name), ['Hiền','Thái','Trúc']);
assert.strictEqual(R.categoryLabel('MB_XIEN3'), 'Xiên 3');

const allRegions = R.buildDailyPartnerReport({
  partner:{id:'all3',name:'All 3',role:'customer'},business_date:'2026-10-06',messages_by_id:{},
  settlements:[
    {id:'mn',partner_id:'all3',business_date:'2026-10-06',region:'mn',message_ids:[],scope_status:'complete_unverified',comparison_status:'MATCH_EXACT',result_snapshot:{total_xac:10,total_qua_co:8,total_payout:1,refund_amount:0,final_net:7}},
    {id:'mt',partner_id:'all3',business_date:'2026-10-06',region:'mt',message_ids:[],scope_status:'complete_unverified',comparison_status:'MATCH_EXACT',result_snapshot:{total_xac:20,total_qua_co:16,total_payout:2,refund_amount:1,final_net:13}},
    {id:'mb',partner_id:'all3',business_date:'2026-10-06',region:'mb',message_ids:[],scope_status:'complete_unverified',comparison_status:'MATCH_EXACT',result_snapshot:{total_xac:30,total_qua_co:24,total_payout:3,refund_amount:2,final_net:19}}
  ]
});
assert.deepStrictEqual(Array.from(allRegions.regions,x=>x.region),['mn','mt','mb'],'daily report must keep MN/MT/MB separate in canonical order');
assert.deepStrictEqual(Array.from(allRegions.regions,x=>x.total_xac),[10,20,30]);
assert.strictEqual(allRegions.totals.xac,60);
assert.strictEqual(allRegions.totals.qua_co,48);
assert.strictEqual(allRegions.totals.payout,6);
assert.strictEqual(allRegions.totals.refund_amount,3);
assert.strictEqual(allRegions.totals.final_net,39);



const kqxsGateReport = R.buildDailyPartnerReport({
  partner:{id:'kg',name:'KQXS Gate',role:'customer'},business_date:'2026-10-06',messages_by_id:{},
  settlements:[
    {id:'kg-mn',partner_id:'kg',business_date:'2026-10-06',region:'mn',message_ids:[],scope_status:'complete_unverified',comparison_status:'MATCH_EXACT',
     lottery_result_snapshot:{complete:true,verification_status:'verified',verified:true},
     result_snapshot:{total_xac:10,total_qua_co:8,total_payout:0,refund_amount:0,final_net:8}},
    {id:'kg-mb',partner_id:'kg',business_date:'2026-10-06',region:'mb',message_ids:[],scope_status:'complete_unverified',comparison_status:'MATCH_EXACT',
     lottery_result_snapshot:{complete:true,verification_status:'unverified',verified:false},
     result_snapshot:{total_xac:20,total_qua_co:16,total_payout:0,refund_amount:0,final_net:16}}
  ]
});
assert.strictEqual(kqxsGateReport.kqxs_verified,false,'one unverified KQXS region must keep partner unverified');
assert.strictEqual(kqxsGateReport.kqxs_conflict,false);
assert.strictEqual(kqxsGateReport.regions.find(x=>x.region==='mn').kqxs_verified,true);
assert.strictEqual(kqxsGateReport.regions.find(x=>x.region==='mb').kqxs_verified,false);
assert.strictEqual(R.kqxsVerificationStatus({lottery_result_snapshot:{verification_status:'conflict'}}),'conflict');


const ghostPartnerReport = R.buildDailyPartnerReport({
  partner:{id:'ghost',name:'Đã hủy hết',role:'customer'},business_date:'2026-10-06',messages_by_id:{},
  settlements:[{
    id:'scope:ghost:2026-10-06:mn',partner_id:'ghost',business_date:'2026-10-06',region:'mn',
    message_ids:[],scope_status:'empty',comparison_status:'empty',
    result_snapshot:{total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0}
  }]
});
assert.strictEqual(ghostPartnerReport.regions.length,0,'empty cancelled scope must not create a report region');
assert.strictEqual(ghostPartnerReport.messages.length,0);
const ghostOps = R.buildDailyOperationsReport({
  business_date:'2026-10-06',
  partners:[{id:'ghost',name:'Đã hủy hết',role:'customer'}],
  messages:[{id:'old',partner_id:'ghost',business_date:'2026-10-06',region:'mn',status:'cancelled'}],
  settlements:[{
    id:'scope:ghost:2026-10-06:mn',partner_id:'ghost',business_date:'2026-10-06',region:'mn',
    message_ids:[],scope_status:'empty',comparison_status:'empty',
    result_snapshot:{total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0}
  }]
});
assert.strictEqual(ghostOps.status,'EMPTY');
assert.strictEqual(ghostOps.counts.partners,0,'cancelled-only partner must not affect close gate');
assert.strictEqual(ghostOps.partners.length,0);


const legacyWeakVerified={
  lottery_result_snapshot:{complete:true,verified:true,verification_status:'verified',verification_sources:['primary'],verification_conflicts:[]}
};
assert.strictEqual(R.kqxsVerificationStatus(legacyWeakVerified),'unverified','legacy one-source verified flag must not pass close gate');
const legacyStrongVerified={
  lottery_result_snapshot:{complete:true,verified:true,verification_status:'verified',verification_sources:['primary','secondary'],verification_conflicts:[]}
};
assert.strictEqual(R.kqxsVerificationStatus(legacyStrongVerified),'verified');
console.log('settlement-report-tests: PASS');
