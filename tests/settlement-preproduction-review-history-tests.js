'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');const crypto=require('crypto');
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
async function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');}
const COMPONENTS=['runtime','parser_backend'];
const componentFingerprints=async material=>({runtime:await sha(material.runtime),parser_backend:await sha(material.parser_backend)});
let currentMaterial={runtime:{build:'a'},parser_backend:{status:'available',identity:'p1'}};
let currentComponents;
const qEvent={id:'qualification_event_1',qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,input_fingerprint_sha256:'',component_fingerprints:{}};
const qualification={COMPONENTS,sha256Hex:sha,async componentFingerprints(m){return componentFingerprints(m);},async overallFingerprint(scope,c){return sha({scope,c});},async listEvents(){return [clone(qEvent)];},async collectMaterial(){return clone(currentMaterial);}};
const review={async inspectPackage(){return {valid:true,errors:[]};},async verifyHumanReviewRecord(record){return {valid:Boolean(record&&record.integrity&&record.integrity.record_sha256),errors:record&&record.integrity&&record.integrity.record_sha256?[]:['BAD_RECORD']};}};
const store={STORES:{metadata:'metadata'}};
const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store,KTS_SETTLEMENT_QUALIFICATION_HISTORY:qualification,KTS_SETTLEMENT_PREPRODUCTION_REVIEW:review,Date,JSON,Math,crypto:{randomUUID:()=> 'uuid'}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-preproduction-review-history.js','utf8'),ctx,{filename:'settlement-preproduction-review-history.js'});const H=ctx.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY;
(async()=>{
  assert.strictEqual(H.version,'settlement-preproduction-review-history-v1');
  currentComponents=await componentFingerprints(currentMaterial);const scope={from_date:'2026-10-01',to_date:'2026-10-07',regions:['mb']};const fp=await qualification.overallFingerprint(scope,currentComponents);qEvent.input_fingerprint_sha256=fp;qEvent.component_fingerprints=clone(currentComponents);
  const pkg={format:'kts-preproduction-dry-run-package-v1',scope,qualification_snapshot:{ready_for_production_review:true},source_ready_event:{id:qEvent.id,input_fingerprint_sha256:fp,component_fingerprints:clone(currentComponents)},manifest:{input_fingerprint_sha256:fp,component_fingerprints:clone(currentComponents)},integrity:{payload_sha256:'a'.repeat(64)}};
  const record={reviewed_at:'2026-10-07T00:00:00.000Z',package:{package_payload_sha256:'a'.repeat(64),source_ready_event_id:qEvent.id,input_fingerprint_sha256:fp},verification:{verdict:'CURRENT',packaged:{payload_sha256:'a'.repeat(64)},changed_components:[]},human:{reviewer:'tester'},integrity:{record_sha256:'b'.repeat(64)}};
  const link=await H.verifyPackageRecordLink(pkg,record);assert.strictEqual(link.valid,true);
  const qlink=await H.verifyQualificationLink(pkg);assert.strictEqual(qlink.status,'VERIFIED');
  const e1=await H.buildEvent(pkg,record,null,1,qlink);const e2=await H.buildEvent(pkg,record,e1,2,qlink);let chain=await H.verifyChain([e1,e2]);assert.strictEqual(chain.valid,true);assert.strictEqual(chain.count,2);assert.strictEqual(e2.previous_event_sha256,e1.integrity.event_sha256);
  let validity=await H.checkEventValidity(e1);assert.strictEqual(validity.status,'CURRENT');assert.strictEqual(validity.current,true);
  validity=await H.checkEventValidity(e2);assert.strictEqual(validity.status,'CURRENT');assert.strictEqual(validity.current,true);
  const tampered=clone(e2);tampered.package_link.package_payload_sha256='c'.repeat(64);chain=await H.verifyChain([e1,tampered]);assert.strictEqual(chain.valid,false);
  currentMaterial.runtime.build='changed';validity=await H.checkEventValidity(e1);assert.strictEqual(validity.status,'STALE');assert(validity.changed_components.includes('runtime'));
  currentMaterial={runtime:{build:'a'},parser_backend:{status:'unavailable',error:'OFFLINE'}};validity=await H.checkEventValidity(e1);assert.strictEqual(validity.status,'UNVERIFIABLE');
  const badRecord=clone(record);badRecord.package.package_payload_sha256='d'.repeat(64);const bad=await H.verifyPackageRecordLink(pkg,badRecord);assert.strictEqual(bad.valid,false);assert(bad.errors.includes('REVIEW_PACKAGE_SHA_MISMATCH'));
  console.log('settlement-preproduction-review-history-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
