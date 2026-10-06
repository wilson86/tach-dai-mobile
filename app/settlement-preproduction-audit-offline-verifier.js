(function(global){
  'use strict';
  const VERSION='settlement-preproduction-audit-offline-verifier-v1';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){const offline=global.KTS_SETTLEMENT_PREPRODUCTION_OFFLINE_VERIFIER;if(!offline||typeof offline.sha256Hex!=='function'||typeof offline.verifyHandoff!=='function')throw new Error('PREPRODUCTION_AUDIT_OFFLINE_DEPENDENCY_MISSING');return {offline};}
  function withoutIntegrity(v){const x=clone(v||{});delete x.integrity;return x;}
  function auditAuthority(a){return Boolean(a&&a.read_only_archive===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.import_mutates_local_history===false);}
  function candidateAuthority(a){return Boolean(a&&a.technical_release_candidate_only===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.production_approval_recorded===false);}
  function boundaryAuthority(a){return Boolean(a&&a.technical_evidence_only===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false);}
  function checksAllMet(rows){return Array.isArray(rows)&&rows.length>0&&rows.every(x=>x&&x.met===true);}
  async function verifyCandidateSnapshot(candidate,handoff){
    const {offline}=deps(),errors=[];
    if(!candidate||candidate.format!=='kts-preproduction-release-candidate-v1')errors.push('OFFLINE_AUDIT_CANDIDATE_FORMAT_INVALID');
    if(String(candidate&&candidate.mode||'')!=='TECHNICAL_RELEASE_CANDIDATE_ONLY')errors.push('OFFLINE_AUDIT_CANDIDATE_MODE_INVALID');
    if(String(candidate&&candidate.status||'')!=='PREPRODUCTION_CANDIDATE_CURRENT')errors.push('OFFLINE_AUDIT_CANDIDATE_STATUS_INVALID');
    if(!candidateAuthority(candidate&&candidate.authority))errors.push('OFFLINE_AUDIT_CANDIDATE_AUTHORITY_INVALID');
    if(!checksAllMet(candidate&&candidate.checks))errors.push('OFFLINE_AUDIT_CANDIDATE_CHECKS_NOT_ALL_MET');
    const expected=candidate&&candidate.integrity&&candidate.integrity.candidate_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('OFFLINE_AUDIT_CANDIDATE_SHA_INVALID');else if(!same(await offline.sha256Hex(withoutIntegrity(candidate)),expected))errors.push('OFFLINE_AUDIT_CANDIDATE_SHA_MISMATCH');
    const hv=await offline.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));if(!hv.valid)errors.push('OFFLINE_AUDIT_HANDOFF_INVALID:'+String((hv.errors||[]).join('|')));
    if(hv.valid){const bundle=handoff.artifacts&&handoff.artifacts.bundle,receipt=handoff.artifacts&&handoff.artifacts.receipt,events=bundle&&bundle.review_events||[],last=events.length?events[events.length-1]:null,e=candidate&&candidate.evidence||{};if(!same(e.handoff_sha256,handoff.integrity&&handoff.integrity.handoff_sha256)||!same(e.bundle_sha256,bundle&&bundle.integrity&&bundle.integrity.bundle_sha256)||!same(e.receipt_sha256,receipt&&receipt.integrity&&receipt.integrity.receipt_sha256)||!same(e.chain_head_sha256,bundle&&bundle.chain&&bundle.chain.head_event_sha256)||!same(e.latest_review_event_id,last&&last.id)||!same(e.latest_qualification_event_id,last&&last.qualification_link&&last.qualification_link.source_event_id)||!same(e.critical_build_identity_sha256,receipt&&receipt.exporter_build_identity_sha256))errors.push('OFFLINE_AUDIT_CANDIDATE_EVIDENCE_LINK_MISMATCH');}
    return {valid:errors.length===0,errors,candidate_sha256:String(expected||''),current_state_verified:false};
  }
  async function verifyBoundarySnapshot(boundary,candidate,handoff){
    const {offline}=deps(),errors=[];
    if(!boundary||boundary.format!=='kts-preproduction-boundary-snapshot-v2-candidate'||String(boundary.status||'')!=='PREPRODUCTION_EVIDENCE_COMPLETE')errors.push('OFFLINE_AUDIT_BOUNDARY_FORMAT_OR_STATUS_INVALID');
    if(!boundaryAuthority(boundary&&boundary.authority))errors.push('OFFLINE_AUDIT_BOUNDARY_AUTHORITY_INVALID');
    if(!checksAllMet(boundary&&boundary.checks))errors.push('OFFLINE_AUDIT_BOUNDARY_CHECKS_NOT_ALL_MET');
    const expected=boundary&&boundary.integrity&&boundary.integrity.snapshot_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('OFFLINE_AUDIT_BOUNDARY_SHA_INVALID');else if(!same(await offline.sha256Hex(withoutIntegrity(boundary)),expected))errors.push('OFFLINE_AUDIT_BOUNDARY_SHA_MISMATCH');
    const cv=await verifyCandidateSnapshot(candidate,handoff);if(!cv.valid)errors.push(...cv.errors.map(x=>'CANDIDATE:'+x));
    const hv=await offline.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));if(!hv.valid)errors.push('OFFLINE_AUDIT_BOUNDARY_HANDOFF_INVALID');
    if(cv.valid&&hv.valid){const bundle=handoff.artifacts.bundle,receipt=handoff.artifacts.receipt,events=bundle.review_events||[],last=events[events.length-1],e=boundary.evidence||{};if(!same(e.candidate_sha256,candidate.integrity.candidate_sha256)||!same(e.handoff_sha256,handoff.integrity.handoff_sha256)||!same(e.bundle_sha256,bundle.integrity.bundle_sha256)||!same(e.receipt_sha256,receipt.integrity.receipt_sha256)||!same(e.chain_head_sha256,bundle.chain.head_event_sha256)||!same(e.latest_review_event_id,last&&last.id)||!same(e.latest_qualification_event_id,last&&last.qualification_link&&last.qualification_link.source_event_id)||!same(e.critical_build_identity_sha256,receipt.exporter_build_identity_sha256))errors.push('OFFLINE_AUDIT_BOUNDARY_EVIDENCE_LINK_MISMATCH');}
    return {valid:errors.length===0,errors,snapshot_sha256:String(expected||''),current_state_verified:false};
  }
  async function verifyAuditPack(pack){
    const {offline}=deps(),errors=[];
    if(!pack||pack.format!=='kts-preproduction-audit-pack-v1')errors.push('OFFLINE_AUDIT_PACK_FORMAT_INVALID');if(String(pack&&pack.mode||'')!=='READ_ONLY_PREPRODUCTION_ARCHIVE')errors.push('OFFLINE_AUDIT_PACK_MODE_INVALID');if(!auditAuthority(pack&&pack.authority))errors.push('OFFLINE_AUDIT_PACK_AUTHORITY_INVALID');
    const policy=pack&&pack.content_policy||{};if(policy.contains_operational_store!==false||policy.contains_package_payload!==false||policy.contains_handoff!==true||policy.contains_candidate!==true||policy.contains_boundary_snapshot!==true)errors.push('OFFLINE_AUDIT_PACK_CONTENT_POLICY_INVALID');
    const expected=pack&&pack.integrity&&pack.integrity.audit_pack_sha256;if(!SHA256_RE.test(String(expected||'')))errors.push('OFFLINE_AUDIT_PACK_SHA_INVALID');else if(!same(await offline.sha256Hex(withoutIntegrity(pack)),expected))errors.push('OFFLINE_AUDIT_PACK_SHA_MISMATCH');
    const h=pack&&pack.artifacts&&pack.artifacts.handoff,c=pack&&pack.artifacts&&pack.artifacts.candidate,b=pack&&pack.artifacts&&pack.artifacts.boundary_snapshot;
    const hv=await offline.verifyHandoff(h).catch(e=>({valid:false,errors:[String(e&&e.message||e)]})),cv=await verifyCandidateSnapshot(c,h),bv=await verifyBoundarySnapshot(b,c,h);
    if(!hv.valid)errors.push(...(hv.errors||[]).map(x=>'HANDOFF:'+x));if(!cv.valid)errors.push(...cv.errors.map(x=>'CANDIDATE:'+x));if(!bv.valid)errors.push(...bv.errors.map(x=>'BOUNDARY:'+x));
    if(hv.valid&&cv.valid&&bv.valid){const m=pack.manifest||{};if(!same(m.handoff_sha256,h.integrity.handoff_sha256)||!same(m.candidate_sha256,c.integrity.candidate_sha256)||!same(m.boundary_snapshot_sha256,b.integrity.snapshot_sha256)||!same(m.bundle_sha256,h.manifest.bundle_sha256)||!same(m.receipt_sha256,h.manifest.receipt_sha256)||!same(m.chain_head_sha256,h.manifest.chain_head_sha256)||!same(m.critical_build_identity_sha256,h.manifest.exporter_build_identity_sha256))errors.push('OFFLINE_AUDIT_PACK_MANIFEST_MISMATCH');}
    return {valid:errors.length===0,errors,audit_pack_sha256:String(expected||''),snapshot_integrity_verified:errors.length===0,current_state_verified:false,current_state_reverification_required:true,production_authorized:false};
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_AUDIT_OFFLINE_VERIFIER=Object.freeze({version:VERSION,withoutIntegrity,auditAuthority,candidateAuthority,boundaryAuthority,checksAllMet,verifyCandidateSnapshot,verifyBoundarySnapshot,verifyAuditPack});
})(typeof window!=='undefined'?window:globalThis);
