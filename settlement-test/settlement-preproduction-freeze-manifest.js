(function(global){
  'use strict';
  const VERSION='settlement-preproduction-freeze-manifest-v1';
  const FORMAT='kts-preproduction-code-freeze-manifest-v1';
  const STATUS='PREPRODUCTION_CODE_FREEZE_MANIFEST_CURRENT';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;if(!qualification||typeof qualification.sha256Hex!=='function'||!global.KTS_SETTLEMENT_BUILD_IDENTITY)throw new Error('PREPRODUCTION_FREEZE_DEPENDENCY_MISSING');return {qualification,build:global.KTS_SETTLEMENT_BUILD_IDENTITY};}
  function withoutIntegrity(v){const x=clone(v||{});delete x.integrity;return x;}
  function authorityValid(a){return Boolean(a&&a.code_freeze_evidence_only===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false);}
  async function buildFreezeManifest(){
    const {qualification,build}=deps(),files=Object.entries(build.critical_git_blobs||{}).sort((a,b)=>a[0].localeCompare(b[0])).map(([path,git_blob_sha1])=>({path,git_blob_sha1}));
    const manifest={format:FORMAT,status:STATUS,generated_at:new Date().toISOString(),authority:{code_freeze_evidence_only:true,human_decision_required:true,production_authorized:false,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false},policy:{freeze_scope:'critical_git_blobs',critical_change_invalidates_existing_evidence:true,evidence_rebuild_required_after_any_critical_change:true,freeze_is_not_production_approval:true},build:{identity_version:String(build.version||''),identity_algorithm:String(build.algorithm||''),business_engine_sha256:String(build.business_engine_sha256||''),critical_file_count:files.length,critical_files:files,build_identity_sha256:await qualification.sha256Hex(build)}};
    manifest.integrity={algorithm:'sha256',freeze_manifest_sha256:await qualification.sha256Hex(withoutIntegrity(manifest))};const v=await verifyFreezeManifest(manifest,{require_current:true});if(!v.valid)throw new Error('PREPRODUCTION_FREEZE_SELF_VERIFY_FAILED:'+v.errors.join('|'));return manifest;
  }
  async function verifyFreezeManifest(manifest,options){
    const {qualification,build}=deps(),errors=[],opts=options||{};
    if(!manifest||manifest.format!==FORMAT||manifest.status!==STATUS)errors.push('PREPRODUCTION_FREEZE_FORMAT_OR_STATUS_INVALID');if(!authorityValid(manifest&&manifest.authority))errors.push('PREPRODUCTION_FREEZE_AUTHORITY_INVALID');
    const p=manifest&&manifest.policy||{};if(p.freeze_scope!=='critical_git_blobs'||p.critical_change_invalidates_existing_evidence!==true||p.evidence_rebuild_required_after_any_critical_change!==true||p.freeze_is_not_production_approval!==true)errors.push('PREPRODUCTION_FREEZE_POLICY_INVALID');
    const expected=manifest&&manifest.integrity&&manifest.integrity.freeze_manifest_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_FREEZE_SHA_INVALID');else if(!same(await qualification.sha256Hex(withoutIntegrity(manifest)),expected))errors.push('PREPRODUCTION_FREEZE_SHA_MISMATCH');
    const files=Object.entries(build.critical_git_blobs||{}).sort((a,b)=>a[0].localeCompare(b[0])).map(([path,git_blob_sha1])=>({path,git_blob_sha1})),b=manifest&&manifest.build||{};
    if(Number(b.critical_file_count)!==files.length||!same(await qualification.sha256Hex(b.critical_files||[]),await qualification.sha256Hex(files)))errors.push('PREPRODUCTION_FREEZE_CRITICAL_FILES_MISMATCH');if(!same(b.business_engine_sha256,build.business_engine_sha256))errors.push('PREPRODUCTION_FREEZE_BUSINESS_ENGINE_MISMATCH');
    const currentSha=await qualification.sha256Hex(build);if(!same(b.build_identity_sha256,currentSha))errors.push('PREPRODUCTION_FREEZE_BUILD_IDENTITY_MISMATCH');if(opts.require_current===false)errors.splice(0,0);
    return {valid:errors.length===0,errors,freeze_manifest_sha256:String(expected||''),build_identity_sha256:currentSha,production_authorized:false};
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_FREEZE_MANIFEST=Object.freeze({version:VERSION,FORMAT,STATUS,withoutIntegrity,authorityValid,buildFreezeManifest,verifyFreezeManifest});
})(typeof window!=='undefined'?window:globalThis);
