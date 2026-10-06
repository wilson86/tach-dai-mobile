(function(global){
  'use strict';
  const FORMAT='kts-preproduction-audit-pack-v1';
  const MODE='READ_ONLY_PREPRODUCTION_ARCHIVE';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,handoff=global.KTS_SETTLEMENT_PREPRODUCTION_HANDOFF,offline=global.KTS_SETTLEMENT_PREPRODUCTION_OFFLINE_VERIFIER,candidate=global.KTS_SETTLEMENT_PREPRODUCTION_CANDIDATE,boundary=global.KTS_SETTLEMENT_PREPRODUCTION_BOUNDARY;if(!qualification||!handoff||!offline||!candidate||!boundary)throw new Error('PREPRODUCTION_AUDIT_PACK_DEPENDENCY_MISSING');return {qualification,handoff,offline,candidate,boundary};}
  function withoutIntegrity(v){const x=clone(v||{});delete x.integrity;return x;}
  function authorityValid(a){return Boolean(a&&a.read_only_archive===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.import_mutates_local_history===false);}
  async function buildAuditPack(handoffJson,candidateJson,boundaryJson){
    const d=deps();const off=await d.offline.verifyHandoff(handoffJson),on=await d.handoff.verifyHandoff(handoffJson),cv=await d.candidate.verifyCandidate(candidateJson,handoffJson),bv=await d.boundary.verifyBoundarySnapshot(boundaryJson,candidateJson,handoffJson);
    if(!off.valid||!on.valid||!cv.valid||!bv.valid)throw new Error('PREPRODUCTION_AUDIT_PACK_SOURCE_INVALID');
    const pack={format:FORMAT,mode:MODE,generated_at:new Date().toISOString(),authority:{read_only_archive:true,human_decision_required:true,production_authorized:false,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,import_mutates_local_history:false},content_policy:{contains_operational_store:false,contains_package_payload:false,contains_handoff:true,contains_candidate:true,contains_boundary_snapshot:true},manifest:{handoff_sha256:String(handoffJson.integrity.handoff_sha256),candidate_sha256:String(candidateJson.integrity.candidate_sha256),boundary_snapshot_sha256:String(boundaryJson.integrity.snapshot_sha256),bundle_sha256:String(handoffJson.manifest&&handoffJson.manifest.bundle_sha256||''),receipt_sha256:String(handoffJson.manifest&&handoffJson.manifest.receipt_sha256||''),chain_head_sha256:String(handoffJson.manifest&&handoffJson.manifest.chain_head_sha256||''),critical_build_identity_sha256:String(handoffJson.manifest&&handoffJson.manifest.exporter_build_identity_sha256||'')},artifacts:{handoff:clone(handoffJson),candidate:clone(candidateJson),boundary_snapshot:clone(boundaryJson)}};
    pack.integrity={algorithm:'sha256',audit_pack_sha256:await d.qualification.sha256Hex(withoutIntegrity(pack))};const checked=await verifyAuditPack(pack);if(!checked.valid)throw new Error('PREPRODUCTION_AUDIT_PACK_SELF_VERIFY_FAILED:'+checked.errors.join('|'));return pack;
  }
  async function verifyAuditPack(pack){
    const d=deps(),errors=[];if(!pack||typeof pack!=='object'||Array.isArray(pack))return {valid:false,errors:['PREPRODUCTION_AUDIT_PACK_REQUIRED']};
    if(pack.format!==FORMAT)errors.push('PREPRODUCTION_AUDIT_PACK_FORMAT_INVALID');if(pack.mode!==MODE)errors.push('PREPRODUCTION_AUDIT_PACK_MODE_INVALID');if(!authorityValid(pack.authority))errors.push('PREPRODUCTION_AUDIT_PACK_AUTHORITY_INVALID');
    const p=pack.content_policy||{};if(p.contains_operational_store!==false||p.contains_package_payload!==false||p.contains_handoff!==true||p.contains_candidate!==true||p.contains_boundary_snapshot!==true)errors.push('PREPRODUCTION_AUDIT_PACK_CONTENT_POLICY_INVALID');
    const expected=pack.integrity&&pack.integrity.audit_pack_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_AUDIT_PACK_SHA_INVALID');else if(!same(await d.qualification.sha256Hex(withoutIntegrity(pack)),expected))errors.push('PREPRODUCTION_AUDIT_PACK_SHA_MISMATCH');
    const h=pack.artifacts&&pack.artifacts.handoff,c=pack.artifacts&&pack.artifacts.candidate,b=pack.artifacts&&pack.artifacts.boundary_snapshot;
    const off=await d.offline.verifyHandoff(h).catch(()=>({valid:false})),on=await d.handoff.verifyHandoff(h).catch(()=>({valid:false})),cv=await d.candidate.verifyCandidate(c,h).catch(()=>({valid:false})),bv=await d.boundary.verifyBoundarySnapshot(b,c,h).catch(()=>({valid:false}));
    if(!off.valid)errors.push('PREPRODUCTION_AUDIT_PACK_OFFLINE_HANDOFF_INVALID');if(!on.valid)errors.push('PREPRODUCTION_AUDIT_PACK_RUNTIME_HANDOFF_INVALID');if(!cv.valid)errors.push('PREPRODUCTION_AUDIT_PACK_CANDIDATE_INVALID');if(!bv.valid)errors.push('PREPRODUCTION_AUDIT_PACK_BOUNDARY_INVALID');
    if(off.valid&&on.valid&&cv.valid&&bv.valid){const m=pack.manifest||{};if(!same(m.handoff_sha256,h.integrity.handoff_sha256)||!same(m.candidate_sha256,c.integrity.candidate_sha256)||!same(m.boundary_snapshot_sha256,b.integrity.snapshot_sha256)||!same(m.bundle_sha256,h.manifest.bundle_sha256)||!same(m.receipt_sha256,h.manifest.receipt_sha256)||!same(m.chain_head_sha256,h.manifest.chain_head_sha256)||!same(m.critical_build_identity_sha256,h.manifest.exporter_build_identity_sha256))errors.push('PREPRODUCTION_AUDIT_PACK_MANIFEST_MISMATCH');}
    return {valid:errors.length===0,errors,audit_pack_sha256:String(expected||'')};
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_AUDIT_PACK=Object.freeze({version:'settlement-preproduction-audit-pack-v1',FORMAT,MODE,withoutIntegrity,authorityValid,buildAuditPack,verifyAuditPack});
})(typeof window!=='undefined'?window:globalThis);
