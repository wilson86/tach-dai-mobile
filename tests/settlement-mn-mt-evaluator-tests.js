'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of ['app/settlement-engine.js', 'app/settlement-mb-rules.js', 'app/settlement-evaluator.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const E = ctx.KTS_SETTLEMENT_EVALUATOR;
const engine = ctx.KTS_SETTLEMENT_ENGINE;
const approx = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

function station(code, overrides) {
  const base = {
    G8:['00'], G7:['000'], G6:['1000','2000','3000'], G5:['4000'],
    G4:['50000','60000','70000','80000','90000','11000','12000'],
    G3:['13000','14000'], G2:['15000'], G1:['16000'], DB:['170000']
  };
  return { code, name: code.toUpperCase(), prizes: Object.assign(base, overrides || {}) };
}

const mnResult = {
  business_date:'2026-10-04', region:'mn', complete:true,
  stations:[
    station('tg',{ G8:['75'], G7:['175'], G6:['1032','2001','3002'], DB:['998674'] }),
    station('kg',{ G8:['42'], G7:['142'], DB:['999999'] }),
    station('dl',{})
  ]
};

const p = (commission, win) => ({ commission:String(commission), win:String(win) });
const mnConfig = {
  commission_type:'ratio', total_percent:'100', refund_percent:'0', dat_hit_mode:'ky_ruoi', dax_hit_mode:'multi_pair', tinh_ui:false,
  region_terms:{ mn:{dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'}, mt:{dat_hit_mode:'one_time',dax_hit_mode:'one_time'} },
  region_pricing:{ mn:{ '2CB':p(.76,75), '2CD':p(.76,75), '2CB7':p(.76,75), DAT:p(.76,750), DAX:p(.76,550), '3CB':p(.76,650), '3CB7':p(.76,650), '3CDD':p(.76,650), '4C':p(.76,5500), UI:p(0,0) } }
};
const canonical = { region:'mn', legs:[
  {code:'2CB',values:['75'],stake:'1',station_codes:['tg']},
  {code:'DAX',values:['75','42'],stake:'1',station_codes:['tg','kg']},
  {code:'DAT',values:['75','32'],stake:'1',station_codes:['tg']},
  {code:'2CD',values:['75','74'],stake:'1',station_codes:['tg']},
  {code:'4C',values:['8674'],stake:'1',station_codes:['tg']}
]};
const evaluated = E.evaluateCanonicalMessage({ canonical_payload:canonical, config_snapshot:mnConfig, result_snapshot:mnResult });
const settled = engine.settle(evaluated.category_inputs,{partner_role:'customer',total_percent:100,refund_percent:0});
assert.strictEqual(settled.total_xac,146);
approx(settled.total_qua_co,110.96);
approx(settled.total_payout,8025);
approx(settled.final_net,-7914.04);
const byCode=Object.fromEntries(settled.rows.map(r=>[r.code,r]));
assert.strictEqual(byCode['2CB'].hit_units,2);
assert.strictEqual(byCode['2CD'].hit_units,2);
assert.strictEqual(byCode['DAT'].hit_units,1.5);
assert.strictEqual(byCode['DAX'].hit_units,2);
assert.strictEqual(byCode['4C'].hit_units,1);

const daxResult = {
  business_date:'2026-09-22',region:'mn',complete:true,
  stations:[
    station('bt',{G8:['09'],G7:['109']}),
    station('vt',{G8:['19']}),
    station('bli',{G8:['19'],G7:['119'],G6:['2019','2000','3000']})
  ]
};
const daxConfig = JSON.parse(JSON.stringify(mnConfig));
const daxEval = E.evaluateCanonicalMessage({ canonical_payload:{region:'mn',legs:[{code:'DAX',values:['09','19'],stake:'1',station_codes:['bt','vt','bli']}]}, config_snapshot:daxConfig, result_snapshot:daxResult });
assert.strictEqual(daxEval.category_inputs[0].xac,216);
assert.strictEqual(daxEval.category_inputs[0].hit_units,3);
const pairUnits=Object.fromEntries(daxEval.detail_rows.map(r=>[r.station,r.hit_units]));
assert.strictEqual(pairUnits['bt-vt'],1);
assert.strictEqual(pairUnits['bt-bli'],2);
assert.strictEqual(pairUnits['vt-bli'],0);

const mtConfig = JSON.parse(JSON.stringify(mnConfig)); mtConfig.region_pricing.mt = mtConfig.region_pricing.mn;
const mtResult = {business_date:'2026-10-04',region:'mt',complete:true,stations:[station('kh'),station('kt'),station('hue')]};
const mtEval = E.evaluateCanonicalMessage({canonical_payload:{region:'mt',legs:[{code:'DAT',values:['00','01'],stake:'0.5',station_codes:['kh']}]},config_snapshot:mtConfig,result_snapshot:mtResult});
assert.strictEqual(mtEval.category_inputs[0].xac,18);
assert.strictEqual(mtEval.detail_rows[0].selector,'one_time');
assert.strictEqual(E.regionTerms(mnConfig,'mn').dat_hit_mode,'ky_ruoi');
assert.strictEqual(E.regionTerms(mnConfig,'mt').dat_hit_mode,'one_time');
console.log('settlement MN/MT evaluator tests PASS');

{
  const strictCfg = JSON.parse(JSON.stringify(mnConfig));
  delete strictCfg.region_pricing.mt;
  assert.throws(() => E.evaluateCanonicalMessage({
    canonical_payload:{region:'mt',legs:[{code:'2CB',values:['12'],stake:'1',station_codes:['dl']}]},
    config_snapshot:strictCfg,
    result_snapshot:makeMnMtResult('mt'),
    region:'mt'
  }), /PRICE_MISSING:mt:2CB/);
}
