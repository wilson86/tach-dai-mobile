'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('app/settlement-store.js','utf8');
const ctx={console,globalThis:null,Date,Math,JSON};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'settlement-store.js'});
const S=ctx.KTS_SETTLEMENT_STORE;
const empty=()=>Object.fromEntries(Object.values(S.STORES).map(name=>[name,[]]));
function partner(id){return {id,name:id.toUpperCase(),role:'customer',active:true};}
function cfg(id,p){return {id,partner_id:p,version:Number(id.split(':v')[1]||1),effective_from_date:'2026-10-01',region_terms:{mn:{},mt:{},mb:{}},region_pricing:{}};}
function msg(id,p='a'){return {id,partner_id:p,business_date:'2026-10-06',region:'mn',raw_text:'tg 75 b 1n',config_snapshot:cfg(p+':v1',p),canonical_payload:{region:'mn',legs:[]}};}
function payload(stores){const base=empty();Object.assign(base,stores||{});return {format:'kts-settlement-export',version:5,stores:base};}
assert.strictEqual(typeof S.validateImportPayload,'function');
{
  const p=payload({partners:[partner('a')],configs:[cfg('a:v1','a')],messages:[msg('m1')],settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['m1'],config_snapshot:cfg('a:v1','a')}]});
  const out=S.validateImportPayload(p,empty(),{replace:false});
  assert.strictEqual(out.valid,true);assert.strictEqual(out.counts.messages,1);
}
{
  const p=payload({partners:[partner('a'),partner('b')],messages:[{...msg('m1','a'),config_snapshot:cfg('b:v1','b')}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/CONFIG_PARTNER_MISMATCH/);
}
{
  const p=payload({partners:[partner('a')],messages:[msg('same'),msg('same')]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/DUPLICATE_KTS_EXPORT_KEY:messages:same/);
}
{
  const ex=empty();ex.partners=[partner('a'),partner('b')];ex.messages=[msg('collision','a')];
  const p=payload({messages:[msg('collision','b')]});
  assert.throws(()=>S.validateImportPayload(p,ex,{}),/IMPORT_ID_SCOPE_COLLISION:messages:collision/);
}
{
  const p=payload({partners:[partner('a'),partner('b')],messages:[msg('m-b','b')],settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['m-b'],config_snapshot:cfg('a:v1','a')}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SETTLEMENT_MESSAGE_SCOPE_MISMATCH/);
}
{
  const p=payload({partners:[partner('a')],configs:[{...cfg('a:v1','a'),id:'b:v1'}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_CONFIG_ID_SCOPE_MISMATCH/);
}
{
  const p=payload();p.stores.messages={bad:true};
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/INVALID_KTS_EXPORT_STORE:messages/);
}
const source=fs.readFileSync('app/settlement-store.js','utf8');
const importPos=source.indexOf('async function importAll');
assert(source.indexOf('validateImportPayload(payload, existing',importPos)>importPos);
assert(source.indexOf('validateImportPayload(payload, existing',importPos)<source.indexOf('const db = await openDb();',importPos),'backup must validate before write transaction');


{
  const p=payload({partners:[partner('a')],settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['missing'],config_snapshot:cfg('a:v1','a')}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SETTLEMENT_MESSAGE_MISSING/);
}
{
  const p=payload({partners:[partner('a')],settlements:[{id:'wrong-scope',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:[],config_snapshot:cfg('a:v1','a')}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SETTLEMENT_ID_SCOPE_MISMATCH/);
}
{
  const p=payload({results:[{id:'wrong',business_date:'2026-10-06',region:'mn',complete:false,stations:[]}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_RESULT_ID_SCOPE_MISMATCH/);
}
{
  const p=payload({partners:[partner('a')],shadow_events:[{id:'se1',scope_id:'scope:b:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn'}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SHADOW_SCOPE_ID_MISMATCH/);
}
{
  const ex=empty(); ex.partners=[partner('a')]; ex.messages=[msg('same','a')];
  const p=payload({partners:[partner('a')],messages:[msg('same','a')]});
  const out=S.validateImportPayload(p,ex,{replace:false});
  assert.strictEqual(out.inserted_counts.messages,0,'merge must not overwrite existing message id');
  assert.strictEqual(out.skipped_existing_counts.messages,1);
}


{
  const ex=empty(); ex.partners=[partner('a')];
  const p=payload({partners:[{...partner('a'),role:'owner'}]});
  assert.throws(()=>S.validateImportPayload(p,ex,{replace:false}),/IMPORT_PARTNER_ROLE_COLLISION/);
}
{
  const ex=empty(); ex.partners=[partner('a')]; ex.configs=[cfg('a:v1','a')];
  const p=payload({partners:[partner('a')],configs:[{...cfg('a:v1','a'),region_pricing:{mn:{'2CB':{commission:'999',win:'1'}}}}]});
  assert.throws(()=>S.validateImportPayload(p,ex,{replace:false}),/IMPORT_CONFIG_CONTENT_COLLISION/);
}
{
  const ex=empty(); ex.partners=[partner('a')]; ex.messages=[msg('same','a')];
  const p=payload({partners:[partner('a')],messages:[{...msg('same','a'),raw_text:'different immutable source'}]});
  assert.throws(()=>S.validateImportPayload(p,ex,{replace:false}),/IMPORT_MESSAGE_CONTENT_COLLISION/);
}


{
  const p=payload({
    partners:[partner('a')],
    messages:[msg('m1','a'),msg('m2','a')],
    settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['m1'],scope_status:'blocked',config_snapshot:cfg('a:v1','a'),result_snapshot:{total_xac:0}}]
  });
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SETTLEMENT_ACTIVE_MESSAGE_SET_MISMATCH/);
}
{
  const cancelled={...msg('m1','a'),status:'cancelled'};
  const p=payload({
    partners:[partner('a')],messages:[cancelled],
    settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['m1'],scope_status:'complete_unverified',config_snapshot:cfg('a:v1','a'),result_snapshot:{total_xac:10}}]
  });
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/(IMPORT_STALE_SETTLEMENT_WITHOUT_ACTIVE_MESSAGES|IMPORT_SETTLEMENT_REFERENCES_CANCELLED_MESSAGE)/);
}
{
  const p=payload({
    partners:[partner('a')],
    settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:[],scope_status:'empty',config_snapshot:null,result_snapshot:{total_xac:1,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0}}]
  });
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_EMPTY_SETTLEMENT_NONZERO/);
}
{
  const p=payload({
    partners:[partner('a')],messages:[msg('m1','a')],
    settlements:[{id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',message_ids:['m1','m1'],scope_status:'blocked',config_snapshot:cfg('a:v1','a'),result_snapshot:{total_xac:0}}]
  });
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SETTLEMENT_MESSAGE_DUPLICATE/);
}


{
  const baseResult={id:'2026-10-06:mn',business_date:'2026-10-06',region:'mn',status:'partial',complete:false,expected_station_codes:['bt'],stations:[{code:'bt',prizes:{}}]};
  const p=payload({results:[{...baseResult,fingerprint:'tampered'}]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_RESULT_FINGERPRINT_MISMATCH/);
}
{
  const baseResult={id:'2026-10-06:mn',business_date:'2026-10-06',region:'mn',status:'partial',complete:false,expected_station_codes:['bt'],stations:[{code:'bt',prizes:{}}]};
  const normalized=S.normalizeResultSnapshot(baseResult);
  const event={...normalized,id:'result_event_1',result_id:'2026-10-06:mn',observed_at:'2026-10-06T10:00:00Z',fingerprint:'tampered'};
  const p=payload({results:[normalized],result_events:[event]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_RESULT_EVENT_FINGERPRINT_MISMATCH/);
}
{
  const core={id:'se-fp',scope_id:'scope:a:2026-10-06:mn',partner_id:'a',business_date:'2026-10-06',region:'mn',trigger:'TEST',local_snapshot:{a:1},reference_snapshot:{b:2},comparison:{status:'MATCH_EXACT'},evidence_fingerprint:'tampered'};
  const p=payload({partners:[partner('a')],shadow_events:[core]});
  assert.throws(()=>S.validateImportPayload(p,empty(),{}),/IMPORT_SHADOW_FINGERPRINT_MISMATCH/);
}
console.log('settlement-backup-validation-tests: PASS');
