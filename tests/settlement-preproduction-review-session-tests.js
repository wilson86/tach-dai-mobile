'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
(async()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const sha=async v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const pkg={format:'kts-preproduction-dry-run-package-v1',source_ready_event:{id:'q1'},manifest:{input_fingerprint_sha256:'a'.repeat(64),build_identity:{rev:'b1'}},integrity:{}};
  const p0=clone(pkg);delete p0.integrity;pkg.integrity.payload_sha256=await sha(p0);
  let currentVerdict='CURRENT';
  const review={
    async inspectPackage(p){const x=clone(p),expected=x.integrity&&x.integrity.payload_sha256;delete x.integrity;const actual=await sha(x);return {valid:expected===actual,errors:expected===actual?[]:['PACKAGE_SHA_MISMATCH']};},
    async reviewPackage(p){const inspected=await this.inspectPackage(p);return {verdict:inspected.valid?currentVerdict:'TAMPERED',package_valid:inspected.valid,changed_components:[],errors:[],checklist:[{id:'x',status:'PASS'}],packaged:{payload_sha256:p.integrity.payload_sha256},current:{input_fingerprint_sha256:p.manifest.input_fingerprint_sha256}};}
  };
  const ctx={console,Date,JSON,KTS_SETTLEMENT_QUALIFICATION_HISTORY:{sha256Hex:sha},KTS_SETTLEMENT_PREPRODUCTION_REVIEW:review,globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-preproduction-review-session.js','utf8'),ctx);
  const S=ctx.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_SESSION;assert(S);assert.strictEqual(S.version,'settlement-preproduction-review-session-v1');
  const session=await S.buildSession(pkg,{verdict:'CURRENT'});assert.strictEqual(session.mode,'PORTABLE_REVIEW_SESSION_ONLY');assert.strictEqual(session.authority.production_authorized,false);assert.strictEqual(session.authority.import_mutates_local_history,false);assert.strictEqual(session.content_policy.contains_package_payload,true);assert(/^[0-9a-f]{64}$/.test(session.integrity.session_sha256));
  let v=await S.verifySession(session,{require_current:true});assert.strictEqual(v.valid,true);assert.strictEqual(v.current,true);const resumed=await S.resumeSession(session);assert.strictEqual(resumed.package.source_ready_event.id,'q1');
  const outer=clone(session);outer.source.source_ready_event_id='q2';v=await S.verifySession(outer,{require_current:true});assert.strictEqual(v.valid,false);assert(v.errors.includes('PREPRODUCTION_REVIEW_SESSION_SHA_MISMATCH'));
  const inner=clone(session);inner.artifacts.package.manifest.input_fingerprint_sha256='b'.repeat(64);const wi=clone(inner);delete wi.integrity;inner.integrity={algorithm:'sha256',session_sha256:await sha(wi)};v=await S.verifySession(inner,{require_current:true});assert.strictEqual(v.valid,false);assert(v.errors.some(x=>x.includes('PACKAGE_INVALID')||x.includes('SOURCE_LINK_MISMATCH')));
  currentVerdict='STALE';v=await S.verifySession(session,{require_current:true});assert.strictEqual(v.valid,false);assert(v.errors.some(x=>x.includes('CURRENT_REVIEW_NOT_CURRENT:STALE')));await assert.rejects(()=>S.resumeSession(session),/RESUME_BLOCKED/);
  console.log('settlement-preproduction-review-session-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
