'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {judge,required,cli}=require('./issue18-evidence-gate.js');
const mobile='a6cbffde732e022131d7c79349e1b8bffd6f1f56';
const ngang='6f47f7c6b073c5df25da55b2b8f3bcc61513da20';
const profile={KTS_PYTESTS:['router','desktop'],KTS_JS_TESTS:['n035','duplicate','undo'],KTS_LEDGER_TEST:'KTSRouter/tests/test_legacy_ledger_retention.js',MOBILE_TESTS:Array.from({length:27},(_,i)=>'m'+i),NGANG_TESTS:Array.from({length:15},(_,i)=>'n'+i)};
const marker=['ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS','ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS','ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS','ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS [ok]','ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS [ok]'];
function fixture(){
 const source={kts:'eec80f812ff0ab47109edcacc32f31eedaffca79',mobile,ngang};
 return {schema:'KTS_ISSUE18_LOCAL_EVIDENCE_V1',read_only_source:true,release:'NO_GO',cost_usd:0,source,
 preflight:{schema:'KTS_ISSUE18_LOCAL_ADMISSION_V1',source:{...source},status:'LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING',
  engine:'7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea',
  versions:{mobile:'2.0.38',ngang:'1.0.37',unified:'1.0.27'},release:'NO_GO',cost_usd:0,android:'NOT_RUN',production:'UNMODIFIED',
  checks:required(profile).map((name,i)=>i?{name,exitCode:0,error:null,signal:null}:{name,ok:true})},
 browser:{status:'NOT_RUN'}};
}
const assess=x=>judge(x,mobile,profile);
const blocked=(x,word)=>{const v=assess(x);assert.equal(v.status,'BLOCKED');assert.ok(v.errors.some(e=>e.includes(word)),JSON.stringify(v.errors));};
test('complete synthetic Gate A receipt requires exact 50 checks, still NO_GO',()=>{
 const v=assess(fixture());assert.equal(v.status,'GATE_A_EVIDENCE_PRESENT');assert.equal(v.checks_expected,50);
 assert.equal(v.release,'NO_GO');assert.equal(v.android,'NOT_RUN');
});
test('missing or reordered checks rejected; cannot skip generator, Desktop or Ngang',()=>{
 for(const i of [1,2,6,14,49]){let x=fixture();x.preflight.checks.splice(i,1);blocked(x,'MISSING_OR_REORDERED');}
 let x=fixture();x.preflight.checks.reverse();blocked(x,'MISSING_OR_REORDERED');
});
test('nonzero, terminated and error subcommands block',()=>{
 for(const bad of [{exitCode:2},{error:'EXCEPTION'},{signal:'SIGTERM'}]){
  const x=fixture();Object.assign(x.preflight.checks[10],bad);blocked(x,'FAILED_CHECK');
 }
});
test('source SHA, nested SHA, versions and engine may not drift',()=>{
 let x=fixture();x.source.mobile='0'.repeat(40);blocked(x,'PIN_DRIFT');
 x=fixture();x.preflight.source.kts='0'.repeat(40);blocked(x,'NESTED_SOURCE_DRIFT');
 x=fixture();x.preflight.versions.unified='1.0.29';blocked(x,'ENGINE_VERSION');
 x=fixture();x.preflight.engine='0'.repeat(64);blocked(x,'ENGINE_VERSION');
});
test('malformed safety flags or Android claim always block',()=>{
 let x=fixture();x.release='GO';blocked(x,'RECEIPT_SAFETY');
 x=fixture();x.preflight.android='PASS';blocked(x,'GATE_A');
 x=fixture();x.preflight.status='FAILED';blocked(x,'GATE_A');
});
test('Chrome must have stage SHA, 21 assets and all five markers',()=>{
 const x=fixture();x.browser={status:'LOCAL_CHROME_PASS_ANDROID_PENDING',
 stage_receipt:{status:'STAGE_SOURCE_BYTES_PASS',checked_assets:21,release_authorized:false,source_commit_sha:{mobile,ngang}},
 stdout:marker.join('\n')};
 assert.equal(judge(x,mobile,profile,true).status,'GATE_A_B_EVIDENCE_PRESENT');
 for(const change of [a=>a.browser.stdout=marker.slice(1).join('\n'),a=>a.browser.stage_receipt.checked_assets=20,a=>a.browser.stage_receipt.source_commit_sha.mobile='0'.repeat(40)]){
  const v=structuredClone(x);change(v);assert.equal(judge(v,mobile,profile,true).status,'BLOCKED');
 }
});
test('failed browser and abbreviated test allowlist always block',()=>{
 let x=fixture();x.browser.status='BLOCKED_CHROME';blocked(x,'CHROME_BLOCKED');
 assert.throws(()=>required({...profile,MOBILE_TESTS:[]}));
});
test('CLI refuses non-Windows environment, missing options and unsafe paths',()=>{
 assert.throws(()=>cli([]),/USAGE/);
 if(process.platform!=='win32')assert.throws(()=>cli(['--receipt','C:\\Temp\\f.json','--mobile-sha',mobile]),/WINDOWS_C_ONLY/);
});
