(function(global){
  'use strict';
  const VERSION='settlement-preproduction-orchestrator-v1';
  const STAGES=Object.freeze({NO_READY:'NO_READY',READY_NOT_CURRENT:'READY_NOT_CURRENT',READY_NEEDS_REVIEW:'READY_NEEDS_REVIEW',REVIEW_CURRENT:'REVIEW_CURRENT',TECHNICAL_CHAIN_COMPLETE:'TECHNICAL_CHAIN_COMPLETE'});
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,pkg=global.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE,review=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW,history=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY,bundle=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE,receipt=global.KTS_SETTLEMENT_PREPRODUCTION_RECEIPT,handoff=global.KTS_SETTLEMENT_PREPRODUCTION_HANDOFF,candidate=global.KTS_SETTLEMENT_PREPRODUCTION_CANDIDATE,boundary=global.KTS_SETTLEMENT_PREPRODUCTION_BOUNDARY,audit=global.KTS_SETTLEMENT_PREPRODUCTION_AUDIT_PACK;
    if(!qualification||!pkg||!review||!history||!bundle||!receipt||!handoff||!candidate||!boundary||!audit)throw new Error('PREPRODUCTION_ORCHESTRATOR_DEPENDENCY_MISSING');
    return {qualification,pkg,review,history,bundle,receipt,handoff,candidate,boundary,audit};
  }
  async function inspectState(){
    const d=deps();
    const ready=await d.qualification.checkLastReadyValidity();
    if(String(ready&&ready.status)==='NO_READY_EVIDENCE')return {stage:STAGES.NO_READY,ready,review:null};
    if(!(ready&&ready.status==='READY_EVIDENCE_CURRENT'&&ready.current===true))return {stage:STAGES.READY_NOT_CURRENT,ready,review:null};
    const review=await d.history.checkLatestValidity();
    if(!(review&&review.status==='CURRENT'&&review.current===true))return {stage:STAGES.READY_NEEDS_REVIEW,ready,review};
    const reviewReadyId=String(review.event&&review.event.qualification_link&&review.event.qualification_link.source_event_id||''),readyId=String(ready.ready_event&&ready.ready_event.id||'');
    if(!reviewReadyId||reviewReadyId!==readyId)return {stage:STAGES.READY_NEEDS_REVIEW,ready,review,reason:'LATEST_REVIEW_NOT_FOR_LATEST_READY'};
    return {stage:STAGES.REVIEW_CURRENT,ready,review};
  }
  async function prepareTechnicalReview(){
    const d=deps(),state=await inspectState();
    if(state.stage!==STAGES.READY_NEEDS_REVIEW&&state.stage!==STAGES.REVIEW_CURRENT)throw new Error('PREPRODUCTION_ORCHESTRATOR_READY_NOT_CURRENT:'+state.stage);
    const packageJson=await d.pkg.buildPackage(),reviewResult=await d.review.reviewPackage(packageJson);
    if(String(reviewResult&&reviewResult.verdict)!=='CURRENT')throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_NOT_CURRENT:'+String(reviewResult&&reviewResult.verdict||''));
    return {package:packageJson,review:reviewResult,state};
  }
  async function pinHumanTechnicalReview(packageJson,human){
    const d=deps(),h=human||{};
    if(h.acknowledged!==true)throw new Error('PREPRODUCTION_ORCHESTRATOR_HUMAN_ACK_REQUIRED');
    if(!String(h.reviewer||'').trim())throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEWER_REQUIRED');
    const reviewResult=await d.review.reviewPackage(packageJson);
    if(String(reviewResult&&reviewResult.verdict)!=='CURRENT')throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_NOT_CURRENT:'+String(reviewResult&&reviewResult.verdict||''));
    const record=await d.review.buildHumanReviewRecord(packageJson,reviewResult,{reviewer:String(h.reviewer).trim(),note:String(h.note||'').trim()});
    const checked=await d.review.verifyHumanReviewRecord(record);if(!checked.valid)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_RECORD_INVALID:'+checked.errors.join('|'));
    const event=await d.history.appendReview(packageJson,record);
    return {record,event};
  }
  async function buildTechnicalChain(){
    const d=deps(),state=await inspectState();if(state.stage!==STAGES.REVIEW_CURRENT)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_NOT_CURRENT:'+state.stage);
    const bundleJson=await d.bundle.buildBundle();
    const receiptJson=await d.receipt.buildReceipt(bundleJson);
    const handoffJson=await d.handoff.buildHandoff(bundleJson,receiptJson);
    const candidateJson=await d.candidate.buildCandidate(handoffJson);
    const boundaryJson=await d.boundary.buildBoundarySnapshot(candidateJson,handoffJson);
    const auditPack=await d.audit.buildAuditPack(handoffJson,candidateJson,boundaryJson);
    const auditCheck=await d.audit.verifyAuditPack(auditPack);if(!auditCheck.valid)throw new Error('PREPRODUCTION_ORCHESTRATOR_AUDIT_PACK_INVALID:'+auditCheck.errors.join('|'));
    return {stage:STAGES.TECHNICAL_CHAIN_COMPLETE,bundle:bundleJson,receipt:receiptJson,handoff:handoffJson,candidate:candidateJson,boundary:boundaryJson,audit_pack:auditPack,production_authorized:false,merge_authorized:false,deploy_authorized:false,production_enabled:false};
  }
  function downloadJson(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionOrchestratorPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionOrchestratorPanel';card.innerHTML=`<div class="section-title">Pre-production evidence orchestrator</div><div class="hint">Luồng rút gọn: kiểm READY → chuẩn bị review → người review xác nhận → tự dựng bundle/receipt/handoff/candidate/boundary/audit pack. Không có API merge/deploy/bật production.</div><div class="row" style="margin-top:8px"><button id="preprodOrchInspect" class="btn soft">Kiểm trạng thái</button><button id="preprodOrchPrepare" class="btn soft">Chuẩn bị technical review</button></div><div class="grid" style="margin-top:8px"><div><label>Reviewer</label><input id="preprodOrchReviewer" placeholder="Tên người review"></div><div><label>Ghi chú</label><input id="preprodOrchNote" placeholder="Tuỳ chọn"></div></div><label style="display:block;margin-top:8px"><input id="preprodOrchAck" type="checkbox"> Tôi đã xem technical review và xác nhận pin evidence read-only</label><div class="row" style="margin-top:8px"><button id="preprodOrchPin" class="btn primary" disabled>Pin human review</button><button id="preprodOrchBuild" class="btn primary">Dựng phần tự động còn lại</button></div><div id="preprodOrchStatus" class="status"></div><div id="preprodOrchOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionBoundaryPanel')||doc.getElementById('preproductionCandidatePanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    let prepared=null;const status=(t,k)=>{const e=doc.getElementById('preprodOrchStatus');e.textContent=t||'';e.className='status '+(k||'');};
    doc.getElementById('preprodOrchInspect').addEventListener('click',async()=>{try{const s=await inspectState();status(s.stage,s.stage===STAGES.REVIEW_CURRENT?'ok':'warn');doc.getElementById('preprodOrchOutput').innerHTML=`<div class="hint">READY: ${esc(s.ready&&s.ready.status||'—')} · review: ${esc(s.review&&s.review.status||'—')}</div>`;}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchPrepare').addEventListener('click',async()=>{try{prepared=await prepareTechnicalReview();doc.getElementById('preprodOrchPin').disabled=false;status('Technical review CURRENT. Hãy xem checklist, nhập reviewer và tick xác nhận trước khi pin.','warn');doc.getElementById('preprodOrchOutput').innerHTML=(prepared.review.checklist||[]).map(x=>`<div class="report-message"><b>${esc(x.status)}</b> · ${esc(x.label)}<div class="hint">${esc(x.detail)}</div></div>`).join('');}catch(e){prepared=null;doc.getElementById('preprodOrchPin').disabled=true;status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchPin').addEventListener('click',async()=>{try{if(!prepared)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_PREP_REQUIRED');const human={reviewer:doc.getElementById('preprodOrchReviewer').value,note:doc.getElementById('preprodOrchNote').value,acknowledged:doc.getElementById('preprodOrchAck').checked};const pinned=await pinHumanTechnicalReview(prepared.package,human);status('Đã pin technical review evidence #'+String(pinned.event.sequence||'')+'. Không cấp quyền production.','ok');doc.getElementById('preprodOrchPin').disabled=true;}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchBuild').addEventListener('click',async()=>{try{status('Đang dựng bundle → receipt → handoff → candidate → boundary → audit pack…','warn');const chain=await buildTechnicalChain();downloadJson('kts-preproduction-audit-pack-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',chain.audit_pack);status('TECHNICAL_CHAIN_COMPLETE · audit pack đã xuất. Dừng tại human production decision boundary.','ok');doc.getElementById('preprodOrchOutput').innerHTML=`<div class="status ok">${esc(chain.boundary.status)}</div><div class="hint">candidate ${esc(String(chain.candidate.integrity.candidate_sha256).slice(0,16))}… · production_authorized=false</div>`;}catch(e){status(String(e&&e.message||e),'err');}});
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_ORCHESTRATOR=Object.freeze({version:VERSION,STAGES,inspectState,prepareTechnicalReview,pinHumanTechnicalReview,buildTechnicalChain});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
