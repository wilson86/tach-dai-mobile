'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');const crypto=require('crypto');
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
async function sha256Hex(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');}
const COMPONENTS=['runtime','parser_backend','messages','settlements','results','configs','regression_cases','candidates','qualification'];
async function componentFingerprints(material){const out={};for(const n of COMPONENTS)out[n]=await sha256Hex(material[n]);return out;}
async function overallFingerprint(options,components){return sha256Hex({format:'kts-qualification-input-v2-live-parser',options:{from_date:String(options&&options.from_date||''),to_date:String(options&&options.to_date||''),required_observation_days:String(options&&options.required_observation_days||''),partner_id:String(options&&options.partner_id||''),regions:Array.isArray(options&&options.regions)?options.regions.slice().sort():[]},components});}
function validateBuildIdentity(identity){if(!identity||identity.version!=='settlement-build-identity-v1')throw new Error('BAD_BUILD');return identity;}
function payloadWithoutIntegrity(pkg){const x=clone(pkg);delete x.integrity;return x;}

(async()=>{
  const scope={from_date:'2026-09-22',to_date:'2026-09-25',required_observation_days:'4',partner_id:'',regions:['mb','mn']};
  const q={qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,production_enabled:false,merge_authorized:false,blockers:[],parser_backend:{met:true}};
  const buildIdentity={version:'settlement-build-identity-v1',algorithm:'git-blob-sha1',critical_git_blobs:Object.fromEntries(Array.from({length:15},(_,i)=>['app/x'+i+'.js',(i%10).toString().repeat(40)]))};
  const material={
    runtime:{build_identity:clone(buildIdentity),modules:{engine:'e1',qualification:'q1'}},
    parser_backend:{status:'available',identity:{identity_contract:'kts-parser-identity-v1',identities:{mb:{identity_sha256:'a'.repeat(64)},mn_mt:{identity_sha256:'b'.repeat(64)}}}},
    messages:[{id:'m1',raw_text:'92 b 1n'}],settlements:[{id:'s1'}],results:[{id:'r1'}],configs:[{id:'c1'}],regression_cases:[{id:'g1'}],candidates:[],qualification:clone(q)
  };
  const components=await componentFingerprints(material),fp=await overallFingerprint(scope,components);
  const pkg={
    format:'kts-preproduction-dry-run-package-v1',mode:'DRY_RUN_ONLY',generated_at:'2026-10-07T00:00:00.000Z',
    authority:{dry_run_only:true,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false},
    scope:clone(scope),
    source_ready_event:{id:'qualification_event_1',qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,input_fingerprint_sha256:fp,component_fingerprints:clone(components),blockers:[]},
    manifest:{input_fingerprint_sha256:fp,component_fingerprints:clone(components),build_identity:clone(buildIdentity),parser_backend:clone(material.parser_backend),runtime_modules:clone(material.runtime.modules),evidence_counts:{messages:1,settlements:1,results:1,configs:1,regression_cases:1,candidates:0},ready_validity_status:'READY_EVIDENCE_CURRENT',current_at_generation:true},
    qualification_snapshot:clone(q),evidence_material:clone(material)
  };
  pkg.integrity={algorithm:'sha256',payload_sha256:await sha256Hex(payloadWithoutIntegrity(pkg))};
  let currentMaterial=clone(material);
  const history={COMPONENTS,sha256Hex,componentFingerprints,overallFingerprint,validateBuildIdentity,async collectMaterial(){return clone(currentMaterial);}};
  const ctx={console,globalThis:null,KTS_SETTLEMENT_QUALIFICATION_HISTORY:history,Date,JSON,Object};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('app/settlement-preproduction-review.js','utf8'),ctx,{filename:'settlement-preproduction-review.js'});
  const R=ctx.KTS_SETTLEMENT_PREPRODUCTION_REVIEW;assert(R);assert.strictEqual(R.version,'settlement-preproduction-review-v1');

  let review=await R.reviewPackage(clone(pkg));
  assert.strictEqual(review.verdict,'CURRENT');assert.strictEqual(review.package_valid,true);assert.deepStrictEqual(Array.from(review.changed_components),[]);

  currentMaterial=clone(material);currentMaterial.messages[0].raw_text='92 b 2n';
  review=await R.reviewPackage(clone(pkg));
  assert.strictEqual(review.verdict,'STALE');assert(Array.from(review.changed_components).includes('messages'));

  currentMaterial=clone(material);currentMaterial.parser_backend={status:'unavailable',error:'OFFLINE'};
  review=await R.reviewPackage(clone(pkg));
  assert.strictEqual(review.verdict,'UNVERIFIABLE');assert.strictEqual(review.package_valid,true);

  currentMaterial=clone(material);
  const tampered=clone(pkg);tampered.evidence_material.messages[0].raw_text='CHANGED';
  review=await R.reviewPackage(tampered);
  assert.strictEqual(review.verdict,'TAMPERED');assert.strictEqual(review.package_valid,false);assert(review.errors.some(x=>String(x).includes('PAYLOAD_SHA_MISMATCH')));

  const badAuthority=clone(pkg);badAuthority.authority.production_enabled=true;
  review=await R.reviewPackage(badAuthority);
  assert.strictEqual(review.verdict,'TAMPERED');assert(review.errors.some(x=>String(x).includes('AUTHORITY_INVALID')));

  review=await R.reviewPackage(clone(pkg));
  const record=await R.buildHumanReviewRecord(pkg,review,{reviewer:'Operator A',note:'technical review only'});
  assert.strictEqual(record.format,'kts-preproduction-human-review-record-v1');
  assert.strictEqual(record.mode,'READ_ONLY_HUMAN_REVIEW');
  assert.strictEqual(record.authority.production_enabled,false);
  assert.strictEqual(record.authority.merge_authorized,false);
  assert.strictEqual(record.authority.deploy_authorized,false);
  assert.strictEqual(record.authority.mutates_settlement,false);
  assert.strictEqual(record.authority.production_approval_recorded,false);
  assert.strictEqual(record.human.authorization_effect,'NONE');
  assert(/^[0-9a-f]{64}$/.test(record.integrity.record_sha256));
  let vr=await R.verifyHumanReviewRecord(record);assert.strictEqual(vr.valid,true);
  const badRecord=clone(record);badRecord.authority.deploy_authorized=true;vr=await R.verifyHumanReviewRecord(badRecord);assert.strictEqual(vr.valid,false);

  const source=fs.readFileSync('app/settlement-preproduction-review.js','utf8');
  assert(!source.includes('KTS_SETTLEMENT_PREPRODUCTION_PACKAGE'));
  assert(!source.includes('.verifyPackage('));
  assert(!source.includes('saveSettlement('));
  assert(!source.includes('saveConfig('));
  assert(!source.includes('confirmAndPin('));
  console.log('settlement-preproduction-review-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
