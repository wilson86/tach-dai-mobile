(function(global){
  'use strict';
  const FORMAT='kts-preproduction-release-candidate-v1';
  const MODE='TECHNICAL_RELEASE_CANDIDATE_ONLY';
  const CURRENT='PREPRODUCTION_CANDIDATE_CURRENT';
  const BLOCKED='PREPRODUCTION_CANDIDATE_BLOCKED';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
    const reviewHistory=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY;
    const bundleApi=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE;
    const handoffApi=global.KTS_SETTLEMENT_PREPRODUCTION_HANDOFF;
    const offline=global.KTS_SETTLEMENT_PREPRODUCTION_OFFLINE_VERIFIER;
    if(!qualification||!reviewHistory||!bundleApi||!handoffApi||!offline||typeof qualification.sha256Hex!=='function'||typeof qualification.checkLastReadyValidity!=='function'||typeof reviewHistory.checkLatestValidity!=='function'||typeof bundleApi.compareWithLocalHistory!=='function'||typeof handoffApi.verifyHandoff!=='function'||typeof offline.verifyHandoff!=='function')throw new Error('PREPRODUCTION_CANDIDATE_DEPENDENCY_MISSING');
    return {qualification,reviewHistory,bundleApi,handoffApi,offline};
  }
  function candidateWithoutIntegrity(candidate){const copy=clone(candidate||{});delete copy.integrity;return copy;}
  function authorityValid(a){return Boolean(a&&a.technical_release_candidate_only===true&&a.human_decision_required===true&&a.production_authorized===false&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.production_approval_recorded===false);}
  function pushCheck(checks,blockers,id,met,detail){const row={id,met:Boolean(met),detail:String(detail||'')};checks.push(row);if(!row.met)blockers.push(id+':'+row.detail);}
  async function evaluateCandidate(handoff){
    const {qualification,reviewHistory,bundleApi,handoffApi,offline}=deps(),checks=[],blockers=[];
    const offlineCheck=await offline.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));
    pushCheck(checks,blockers,'offline_handoff_integrity',offlineCheck.valid,offlineCheck.valid?'verified':(offlineCheck.errors||[]).join('|'));
    const onlineCheck=await handoffApi.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));
    pushCheck(checks,blockers,'runtime_handoff_integrity',onlineCheck.valid,onlineCheck.valid?'verified':(onlineCheck.errors||[]).join('|'));
    const bundle=handoff&&handoff.artifacts&&handoff.artifacts.bundle;
    let local={status:'UNVERIFIABLE'},latest={status:'UNVERIFIABLE',current:false},ready={status:'UNVERIFIABLE',current:false,ready_event:null};
    if(offlineCheck.valid&&onlineCheck.valid){
      local=await bundleApi.compareWithLocalHistory(bundle).catch(e=>({status:'UNVERIFIABLE',errors:[String(e&&e.message||e)]}));
      pushCheck(checks,blockers,'local_review_chain_exact',local.status==='LOCAL_CHAIN_MATCH',local.status);
      latest=await reviewHistory.checkLatestValidity().catch(e=>({status:'UNVERIFIABLE',current:false,errors:[String(e&&e.message||e)]}));
      pushCheck(checks,blockers,'latest_review_current',latest.status==='CURRENT'&&latest.current===true,latest.status);
      ready=await qualification.checkLastReadyValidity().catch(e=>({status:'UNVERIFIABLE',current:false,ready_event:null,errors:[String(e&&e.message||e)]}));
      pushCheck(checks,blockers,'qualification_ready_current',ready.status==='READY_EVIDENCE_CURRENT'&&ready.current===true,ready.status);
      const reviewEvents=bundle&&bundle.review_events||[],last=reviewEvents.length?reviewEvents[reviewEvents.length-1]:null;
      const sourceId=String(last&&last.qualification_link&&last.qualification_link.source_event_id||''),readyId=String(ready&&ready.ready_event&&ready.ready_event.id||'');
      pushCheck(checks,blockers,'latest_review_links_latest_ready',Boolean(sourceId)&&same(sourceId,readyId),sourceId+' vs '+readyId);
      const currentBuildSha=await qualification.sha256Hex(global.KTS_SETTLEMENT_BUILD_IDENTITY||null),handoffBuildSha=String(handoff&&handoff.manifest&&handoff.manifest.exporter_build_identity_sha256||'');
      pushCheck(checks,blockers,'critical_build_identity_exact',same(currentBuildSha,handoffBuildSha),currentBuildSha+' vs '+handoffBuildSha);
    }
    return {status:blockers.length?BLOCKED:CURRENT,current:blockers.length===0,ready_for_boundary_review:blockers.length===0,human_decision_required:true,production_authorized:false,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,checks,blockers,handoff_sha256:String(handoff&&handoff.integrity&&handoff.integrity.handoff_sha256||''),bundle_sha256:String(bundle&&bundle.integrity&&bundle.integrity.bundle_sha256||''),chain_head_sha256:String(bundle&&bundle.chain&&bundle.chain.head_event_sha256||''),latest_review_status:String(latest.status||''),latest_ready_status:String(ready.status||'')};
  }
  async function buildCandidate(handoff){
    const {qualification}=deps(),evaluation=await evaluateCandidate(handoff);if(evaluation.status!==CURRENT)throw new Error('PREPRODUCTION_CANDIDATE_NOT_CURRENT:'+evaluation.blockers.join('|'));
    const bundle=handoff.artifacts.bundle,receipt=handoff.artifacts.receipt,last=bundle.review_events[bundle.review_events.length-1],candidate={
      format:FORMAT,mode:MODE,generated_at:new Date().toISOString(),status:CURRENT,
      authority:{technical_release_candidate_only:true,human_decision_required:true,production_authorized:false,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,production_approval_recorded:false},
      evidence:{handoff_sha256:String(handoff.integrity.handoff_sha256),bundle_sha256:String(bundle.integrity.bundle_sha256),receipt_sha256:String(receipt.integrity.receipt_sha256),chain_head_sha256:String(bundle.chain.head_event_sha256),latest_review_event_id:String(last&&last.id||''),latest_qualification_event_id:String(last&&last.qualification_link&&last.qualification_link.source_event_id||''),critical_build_identity_sha256:String(receipt.exporter_build_identity_sha256||'')},
      checks:clone(evaluation.checks)
    };
    candidate.integrity={algorithm:'sha256',candidate_sha256:await qualification.sha256Hex(candidateWithoutIntegrity(candidate))};
    const verified=await verifyCandidate(candidate,handoff);if(!verified.valid)throw new Error('PREPRODUCTION_CANDIDATE_SELF_VERIFY_FAILED:'+verified.errors.join('|'));return candidate;
  }
  async function verifyCandidate(candidate,handoff){
    const {qualification,handoffApi,offline}=deps(),errors=[];
    if(!candidate||String(candidate.format)!==FORMAT)errors.push('PREPRODUCTION_CANDIDATE_FORMAT_INVALID');
    if(String(candidate&&candidate.mode||'')!==MODE)errors.push('PREPRODUCTION_CANDIDATE_MODE_INVALID');
    if(String(candidate&&candidate.status||'')!==CURRENT)errors.push('PREPRODUCTION_CANDIDATE_STATUS_INVALID');
    if(!authorityValid(candidate&&candidate.authority))errors.push('PREPRODUCTION_CANDIDATE_AUTHORITY_INVALID');
    const expected=candidate&&candidate.integrity&&candidate.integrity.candidate_sha256;
    if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_CANDIDATE_SHA_INVALID');else if(!same(await qualification.sha256Hex(candidateWithoutIntegrity(candidate)),expected))errors.push('PREPRODUCTION_CANDIDATE_SHA_MISMATCH');
    const off=await offline.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));if(!off.valid)errors.push('PREPRODUCTION_CANDIDATE_OFFLINE_HANDOFF_INVALID:'+String((off.errors||[]).join('|')));
    const on=await handoffApi.verifyHandoff(handoff).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));if(!on.valid)errors.push('PREPRODUCTION_CANDIDATE_RUNTIME_HANDOFF_INVALID:'+String((on.errors||[]).join('|')));
    if(off.valid&&on.valid){const bundle=handoff.artifacts.bundle,receipt=handoff.artifacts.receipt,last=bundle.review_events[bundle.review_events.length-1],e=candidate.evidence||{};if(!same(e.handoff_sha256,handoff.integrity.handoff_sha256)||!same(e.bundle_sha256,bundle.integrity.bundle_sha256)||!same(e.receipt_sha256,receipt.integrity.receipt_sha256)||!same(e.chain_head_sha256,bundle.chain.head_event_sha256)||!same(e.latest_review_event_id,last&&last.id)||!same(e.latest_qualification_event_id,last&&last.qualification_link&&last.qualification_link.source_event_id)||!same(e.critical_build_identity_sha256,receipt.exporter_build_identity_sha256))errors.push('PREPRODUCTION_CANDIDATE_EVIDENCE_LINK_MISMATCH');}
    if(!errors.length){const current=await evaluateCandidate(handoff);if(current.status!==CURRENT)errors.push('PREPRODUCTION_CANDIDATE_CURRENT_STATE_BLOCKED:'+current.blockers.join('|'));}
    return {valid:errors.length===0,errors,candidate_sha256:String(expected||'')};
  }
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionCandidatePanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionCandidatePanel';card.innerHTML=`<div class="section-title">Technical release-candidate evidence</div><div class="hint">Candidate chỉ được sinh khi offline + runtime verifier cùng PASS, local evidence chain khớp tuyệt đối, review/READY còn CURRENT và critical build identity không đổi. Candidate không cấp quyền production.</div><div style="margin-top:8px"><label>Handoff JSON</label><input id="preproductionCandidateHandoff" type="file" accept=".json,application/json"></div><div class="row" style="margin-top:8px"><button id="preproductionCandidateRun" class="btn primary">Đánh giá candidate</button><button id="preproductionCandidateExport" class="btn soft" disabled>Xuất candidate</button></div><div id="preproductionCandidateStatus" class="status"></div><div id="preproductionCandidateOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionHandoffPanel')||doc.getElementById('preproductionReceiptPanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    const status=(t,k)=>{const e=doc.getElementById('preproductionCandidateStatus');e.textContent=t||'';e.className='status '+(k||'');};let loaded=null,last=null;
    async function read(){const f=doc.getElementById('preproductionCandidateHandoff').files&&doc.getElementById('preproductionCandidateHandoff').files[0];if(!f)throw new Error('PREPRODUCTION_CANDIDATE_HANDOFF_REQUIRED');return JSON.parse(await f.text());}
    doc.getElementById('preproductionCandidateRun').addEventListener('click',async()=>{try{loaded=await read();last=await evaluateCandidate(loaded);doc.getElementById('preproductionCandidateExport').disabled=last.status!==CURRENT;doc.getElementById('preproductionCandidateOutput').innerHTML=(last.checks||[]).map(x=>`<div class="report-message"><b>${x.met?'PASS':'FAIL'}</b> · ${esc(x.id)}<div class="hint">${esc(x.detail)}</div></div>`).join('');status(last.status+(last.status===CURRENT?' · kỹ thuật sạch, production vẫn OFF.':''),last.status===CURRENT?'ok':'err');}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preproductionCandidateExport').addEventListener('click',async()=>{try{if(!loaded||!last||last.status!==CURRENT)throw new Error('PREPRODUCTION_CANDIDATE_NOT_CURRENT');const candidate=await buildCandidate(loaded),blob=new Blob([JSON.stringify(candidate,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='kts-preproduction-candidate-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Candidate đã xuất · production_authorized=false · human decision required.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_CANDIDATE=Object.freeze({version:'settlement-preproduction-candidate-v1',FORMAT,MODE,CURRENT,BLOCKED,candidateWithoutIntegrity,authorityValid,evaluateCandidate,buildCandidate,verifyCandidate});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
