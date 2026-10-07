'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const code=fs.readFileSync('app/settlement-pricing-copy.js','utf8');
const ctx={globalThis:{}};vm.createContext(ctx);vm.runInContext(code,ctx);
const C=ctx.globalThis.KTS_SETTLEMENT_PRICING_COPY;
assert(C);assert.strictEqual(C.version,'settlement-pricing-copy-v1');

const pricing={
  mn:{
    '2CB':{commission:'0.76',win:'75'},
    '2CD':{commission:'0.72',win:'70'},
    '2CB7':{commission:'0.71',win:'69'},
    'DAT':{commission:'0.8',win:'600'},
    'DAX':{commission:'0.79',win:'580'},
    '3CB':{commission:'0.7',win:'650'},
    '3CB7':{commission:'0.68',win:'620'},
    '3CDD':{commission:'0.65',win:'600'},
    '4C':{commission:'0.6',win:'550'}
  },
  mb:{
    '2CB':{commission:'0.9',win:'80'},
    '2CD':{commission:'0.8',win:'75'},
    '2CB8':{commission:'0.7',win:'70'},
    'DAT':{commission:'0.6',win:'60'},
    '3CB':{commission:'0.5',win:'50'},
    '3CB7':{commission:'0.4',win:'40'},
    '3CDD':{commission:'0.3',win:'30'},
    '4C':{commission:'0.2',win:'20'},
    'MB_XIEN2':{commission:'0.1',win:'10'},
    'MB_XIEN3':{commission:'0.1',win:'10'},
    'MB_XIEN4':{commission:'0.1',win:'10'},
    'UI':{commission:'0.1',win:'10'}
  }
};

const mnToMt=C.copyRates({source_region:'mn',target_region:'mt',pricing});
assert.deepStrictEqual(JSON.parse(JSON.stringify(mnToMt.target_pricing)),pricing.mn);
assert.strictEqual(mnToMt.zeroed_codes,0);

const mnToMb=C.copyRates({source_region:'mn',target_region:'mb',pricing});
assert.strictEqual(mnToMb.target_pricing['2CB'].commission,'0.76');
assert.strictEqual(mnToMb.target_pricing['DAT'].win,'600');
for(const code of ['2CB8','MB_XIEN2','MB_XIEN3','MB_XIEN4','UI']){
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mnToMb.target_pricing[code])),{commission:'0',win:'0'});
}
assert.strictEqual(mnToMb.zeroed_codes,5);

const mbToMn=C.copyRates({source_region:'mb',target_region:'mn',pricing});
assert.strictEqual(mbToMn.target_pricing['2CB'].win,'80');
for(const code of ['2CB7','DAX']) assert.deepStrictEqual(JSON.parse(JSON.stringify(mbToMn.target_pricing[code])),{commission:'0',win:'0'});
assert.strictEqual(mbToMn.zeroed_codes,2);

assert.throws(()=>C.copyRates({source_region:'mn',target_region:'mn',pricing}),/COPY_RATE_SAME_REGION/);
assert.throws(()=>C.copyRates({source_region:'xx',target_region:'mn',pricing}),/INVALID_COPY_RATE_REGION/);
console.log('settlement-pricing-copy-tests: PASS');
