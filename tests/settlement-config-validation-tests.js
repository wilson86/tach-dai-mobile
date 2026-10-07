'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('app/settlement-config-validation.js','utf8');
const ctx={globalThis:{}};vm.createContext(ctx);vm.runInContext(code,ctx);
const V=ctx.globalThis.KTS_SETTLEMENT_CONFIG_VALIDATION;
assert(V);assert.strictEqual(V.version,'settlement-config-validation-v1');
assert.strictEqual(V.decimalText('0,76','x'),'0.76');
assert.strictEqual(V.percent('100','x'),'100');
assert.throws(()=>V.percent('100.01','Tổng MN'),/0 đến 100/);
assert.throws(()=>V.decimalText('-1','x'),/không hợp lệ/);
assert.throws(()=>V.decimalText('abc','x'),/không hợp lệ/);

const base={
 commission_type:'ratio',
 region_terms:{
   mn:{total_percent:'90',refund_percent:'2',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'},
   mt:{total_percent:'85,5',refund_percent:'0',dat_hit_mode:'one_time',dax_hit_mode:'ky_ruoi'},
   mb:{total_percent:'80',refund_percent:'1',dat_hit_mode:'multi_pair'}
 },
 region_pricing:{
   mn:{'2CB':{commission:'0,76',win:'75'}},
   mt:{'2CB':{commission:'0.74',win:'74'}},
   mb:{'2CB':{commission:'0.8',win:'80'}}
 }
};
const out=V.validate(base);
assert.strictEqual(out.region_terms.mt.total_percent,'85.5');
assert.strictEqual(out.region_pricing.mn['2CB'].commission,'0.76');
assert.strictEqual(out.region_pricing.mn['2CB'].win,'75');
assert.strictEqual(out.region_terms.mb.dat_hit_mode,'multi_pair');
assert.throws(()=>V.validate({...base,region_pricing:{...base.region_pricing,mn:{'2CB':{commission:'1.01',win:'75'}}}}),/tỉ lệ phải từ 0 đến 1/);
const direct=V.validate({...base,commission_type:'amount',region_pricing:{...base.region_pricing,mn:{'2CB':{commission:'76',win:'75'}}}});
assert.strictEqual(direct.region_pricing.mn['2CB'].commission,'76');
console.log('settlement-config-validation-tests: PASS');
