(function(global){
  'use strict';
  const VERSION='settlement-preproduction-review-session-v1';
  const FORMAT='kts-preproduction-review-session-v1';
  const MODE='PORTABLE_REVIEW_SESSION_ONLY';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,review=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW;
    if(!qualification||typeof qualification.sha256Hex!=='function'||!review||typeof review.inspectPackage!=='function'||typeof review.reviewPackage!=='function')throw new Error('PREPRODUCTION_REVIEW_SESSION_DEPENDENCY_MISSING');
    return {qualification,review};
  }
  function withoutIntegrity(v){const x=clone(v||{});delete x.integrity;return x;}
  function authorityValid(a){return Boolean(a&&a.read_only_review_session===true&&a.human_ack_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.import_mutates_local_history===false);}
  function reviewSnapshot(reviewResult){return {verdict:String(reviewResult&&reviewResult.verdict||''),package_valid:reviewResult&&reviewResult.package_valid!==false,changed_components:clone(reviewResult&&reviewResult.changed_components||[]),errors:clone(reviewResult&&reviewResult.errors||[]),checklist:clone(reviewResult&&reviewResult.checklist||[]),packaged:clone(reviewResult&&reviewResult.packaged||null),current:clone(reviewResult&&reviewResult.current||null)};}
  async function buildSession(packageJson,reviewResult){
    const {qualification,review}=deps();
    const inspected=await review.inspectPackage(packageJson);if(!inspected.valid)throw new Error('PREPRODUCTION_REVIEW_SESSION_PACKAGE_INVALID:'+inspected.errors.join('|'));
    const current=await review.reviewPackage(packageJson);if(String(current&&current.verdict)!=='CURRENT')throw new Error('PREPRODUCTION_REVIEW_SESSION_NOT_CURRENT:'+String(current&&current.verdict||''));
    if(reviewResult&&String(reviewResult.verdict||'')!=='CURRENT')throw new Error('PREPRODUCTION_REVIEW_SESSION_INPUT_REVIEW_NOT_CURRENT');
    const snapshot=reviewSnapshot(current),packageSha=String(packageJson&&packageJson.integrity&&packageJson.integrity.payload_sha256||''),sourceId=String(packageJson&&packageJson.source_ready_event&&packageJson.source_ready_event.id||''),inputSha=String(packageJson&&packageJson.manifest&&packageJson.manifest.input_fingerprint_sha256||'');
    if(!SHA256_RE.test(packageSha)||!sourceId||!SHA256_RE.test(inputSha))throw new Error('PREPRODUCTION_REVIEW_SESSION_SOURCE_INVALID');
    const session={format:FORMAT,mode:MODE,created_at:new Date().toISOString(),authority:{read_only_review_session:true,human_ack_required:true,production_authorized:false,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,import_mutates_local_history:false},content_policy:{contains_package_payload:true,contains_operational_evidence:true,portable_review_session:true,contains_human_authorization:false},source:{source_ready_event_id:sourceId,package_payload_sha256:packageSha,input_fingerprint_sha256:inputSha,critical_build_identity_sha256:await qualification.sha256Hex(packageJson&&packageJson.manifest&&packageJson.manifest.build_identity||null)},artifacts:{package:clone(packageJson),review_snapshot:snapshot}};
    session.integrity={algorithm:'sha256',session_sha256:await qualification.sha256Hex(withoutIntegrity(session))};
    const checked=await verifySession(session,{require_current:true});if(!checked.valid)throw new Error('PREPRODUCTION_REVIEW_SESSION_SELF_VERIFY_FAILED:'+checked.errors.join('|'));return session;
  }
  async function verifySession(session,options){
    const {qualification,review}=deps(),errors=[],opts=options||{};
    if(!session||typeof session!=='object'||Array.isArray(session))return {valid:false,current:false,errors:['PREPRODUCTION_REVIEW_SESSION_REQUIRED']};
    if(session.format!==FORMAT)errors.push('PREPRODUCTION_REVIEW_SESSION_FORMAT_INVALID');if(session.mode!==MODE)errors.push('PREPRODUCTION_REVIEW_SESSION_MODE_INVALID');if(!authorityValid(session.authority))errors.push('PREPRODUCTION_REVIEW_SESSION_AUTHORITY_INVALID');
    const p=session.content_policy||{};if(p.contains_package_payload!==true||p.contains_operational_evidence!==true||p.portable_review_session!==true||p.contains_human_authorization!==false)errors.push('PREPRODUCTION_REVIEW_SESSION_CONTENT_POLICY_INVALID');
    const expected=session.integrity&&session.integrity.session_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_REVIEW_SESSION_SHA_INVALID');else if(!same(await qualification.sha256Hex(withoutIntegrity(session)),expected))errors.push('PREPRODUCTION_REVIEW_SESSION_SHA_MISMATCH');
    const pkg=session.artifacts&&session.artifacts.package,snapshot=session.artifacts&&session.artifacts.review_snapshot,source=session.source||{};
    const inspected=await review.inspectPackage(pkg).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));if(!inspected.valid)errors.push('PREPRODUCTION_REVIEW_SESSION_PACKAGE_INVALID:'+String((inspected.errors||[]).join('|')));
    if(!same(source.package_payload_sha256,pkg&&pkg.integrity&&pkg.integrity.payload_sha256)||!same(source.source_ready_event_id,pkg&&pkg.source_ready_event&&pkg.source_ready_event.id)||!same(source.input_fingerprint_sha256,pkg&&pkg.manifest&&pkg.manifest.input_fingerprint_sha256))errors.push('PREPRODUCTION_REVIEW_SESSION_SOURCE_LINK_MISMATCH');
    const buildSha=await qualification.sha256Hex(pkg&&pkg.manifest&&pkg.manifest.build_identity||null);if(!same(source.critical_build_identity_sha256,buildSha))errors.push('PREPRODUCTION_REVIEW_SESSION_BUILD_IDENTITY_MISMATCH');
    if(String(snapshot&&snapshot.verdict||'')!=='CURRENT'||snapshot&&snapshot.package_valid===false)errors.push('PREPRODUCTION_REVIEW_SESSION_SNAPSHOT_NOT_CURRENT');
    let current=false,currentReview=null;
    if(opts.require_current!==false&&errors.length===0){currentReview=await review.reviewPackage(pkg).catch(e=>({verdict:'UNVERIFIABLE',errors:[String(e&&e.message||e)]}));current=String(currentReview&&currentReview.verdict)==='CURRENT';if(!current)errors.push('PREPRODUCTION_REVIEW_SESSION_CURRENT_REVIEW_NOT_CURRENT:'+String(currentReview&&currentReview.verdict||''));}
    return {valid:errors.length===0,current:opts.require_current===false?null:current,errors,session_sha256:String(expected||''),package:clone(pkg),review:clone(currentReview||snapshot)};
  }
  async function resumeSession(session){const checked=await verifySession(session,{require_current:true});if(!checked.valid)throw new Error('PREPRODUCTION_REVIEW_SESSION_RESUME_BLOCKED:'+checked.errors.join('|'));return {session:clone(session),package:checked.package,review:checked.review};}
  global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_SESSION=Object.freeze({version:VERSION,FORMAT,MODE,withoutIntegrity,authorityValid,reviewSnapshot,buildSession,verifySession,resumeSession});
})(typeof window!=='undefined'?window:globalThis);
