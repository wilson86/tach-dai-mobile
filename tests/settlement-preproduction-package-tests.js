'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');const crypto=require('crypto');
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
async function sha256Hex(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');}
const COMPONENTS=['runtime','parser_backend','messages','settlements','results','configs','regression_cases','candidates','qualification'];
async function componentFingerprints(material){const out={};for(const n of COMPONENTS)out[n]=await sha256Hex(material[n]);return out;}
async function overallFingerprint(options,components){return sha256Hex({format:'kts-qualification-input-v2-live-parser',options:{from_date:String(options&&options.from_date||''),to_date:String(options&&options.to_date||''),required_observation_days:String(options&&options.required_observation_days||''),partner_id:String(options&&options.partner_id||''),regions:Array.isArray(options&&options.regions)?options.regions.slice().sort():[]},components});}
async function makeCtx(status='READY_EVIDENCE_CURRENT'){
  const scope={from_date:'2026-09-22',to_date:'2026-09-25',required_observation_days:'4',partner_id:'',regions:[]};
  const q={qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,production_enabled:false,merge_authorized:false,blockers:[],parser_backend:{met:true}};
  const material={
    runtime:{build_identity:{version:'settlement-build-identity-v1',algorithm:'git-blob-sha1',critical_git_blobs:{'app/a.js':'1'.repeat(40)}},modules:{engine:'e1'}},
    parser_backend:{status:'available',identity:{identity_contract:'kts-parser-identity-v1',identities:{mb:{identity_sha256:'a'.repeat(64)},mn_mt:{identity_sha256:'b'.repeat(64)}}}},
    messages:[{id:'m1',raw_text:'92 b 1n'}],settlements:[{id:'s1'}],results:[{id:'r1'}],configs:[{id:'c1'}],regression_cases:[{id:'g1'}],candidates:[],qualification:clone(q)
  };
  const components=await componentFingerprints(material);const fp=await overallFingerprint(scope,components);
  const ready={id:'qualification_event_1',observed_at:'2026-10-07T00:00:00.000Z',qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,input_fingerprint_sha256:fp,component_fingerprints:clone(components),blockers:[],qualification_snapshot:clone(q),...scope};
  const history={COMPONENTS,sha256Hex,componentFingerprints,overallFingerprint,async collectMaterial(){return clone(material);},async checkLastReadyValidity(){if(status==='NO_READY_EVIDENCE')return{status,current:false,changed_components:[],ready_event:null};if(status==='READY_EVIDENCE_UNVERIFIABLE')return{status,current:false,changed_components:['parser_backend'],parser_backend_error:'OFFLINE',ready_event:clone(ready)};if(status==='READY_EVIDENCE_STALE')return{status,current:false,changed_components:['runtime'],ready_event:clone(ready)};return{status,current:true,changed_components:[],ready_event:clone(ready)};}};
  const ctx={console,globalThis:null,KTS_SETTLEMENT_QUALIFICATION_HISTORY:history,Date,JSON};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-preproduction-package.js','utf8'),ctx,{filename:'settlement-preproduction-package.js'});return ctx.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE;
}
(async()=>{
  const P=await makeCtx();assert.strictEqual(P.version,'settlement-preproduction-package-v1');
  const pkg=await P.buildPackage();assert.strictEqual(pkg.format,'kts-preproduction-dry-run-package-v1');assert.strictEqual(pkg.mode,'DRY_RUN_ONLY');assert.strictEqual(pkg.authority.production_enabled,false);assert.strictEqual(pkg.authority.merge_authorized,false);assert.strictEqual(pkg.authority.deploy_authorized,false);assert.strictEqual(pkg.authority.mutates_settlement,false);assert.strictEqual(pkg.manifest.current_at_generation,true);assert.strictEqual(pkg.manifest.evidence_counts.messages,1);assert(/^[0-9a-f]{64}$/.test(pkg.integrity.payload_sha256));
  let verified=await P.verifyPackage(pkg);assert.strictEqual(verified.valid,true);assert.deepStrictEqual(Array.from(verified.errors),[]);
  const tampered=clone(pkg);tampered.evidence_material.messages[0].raw_text='CHANGED';verified=await P.verifyPackage(tampered);assert.strictEqual(verified.valid,false);assert(verified.errors.includes('PREPRODUCTION_PAYLOAD_SHA256_MISMATCH'));assert(verified.errors.includes('PREPRODUCTION_COMPONENT_MISMATCH:messages'));
  const authority=clone(pkg);authority.authority.production_enabled=true;verified=await P.verifyPackage(authority);assert.strictEqual(verified.valid,false);assert(verified.errors.includes('PREPRODUCTION_AUTHORITY_INVALID'));
  await assert.rejects(()=>makeCtx('READY_EVIDENCE_STALE').then(x=>x.buildPackage()),/PREPRODUCTION_READY_EVIDENCE_STALE/);
  await assert.rejects(()=>makeCtx('READY_EVIDENCE_UNVERIFIABLE').then(x=>x.buildPackage()),/PREPRODUCTION_READY_EVIDENCE_UNVERIFIABLE:OFFLINE/);
  await assert.rejects(()=>makeCtx('NO_READY_EVIDENCE').then(x=>x.buildPackage()),/PREPRODUCTION_READY_EVIDENCE_REQUIRED/);
  console.log('settlement-preproduction-package-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
