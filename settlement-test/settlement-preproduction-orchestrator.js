(function(global){
  'use strict';
  const VERSION='settlement-preproduction-orchestrator-v2-session-resume';
  const STAGES=Object.freeze({NO_READY:'NO_READY',READY_NOT_CURRENT:'READY_NOT_CURRENT',READY_NEEDS_REVIEW:'READY_NEEDS_REVIEW',REVIEW_CURRENT:'REVIEW_CURRENT',TECHNICAL_CHAIN_COMPLETE:'TECHNICAL_CHAIN_COMPLETE'});
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,pkg=global.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE,review=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW,history=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY,bundle=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE,receipt=global.KTS_SETTLEMENT_PREPRODUCTION_RECEIPT,handoff=global.KTS_SETTLEMENT_PREPRODUCTION_HANDOFF,candidate=global.KTS_SETTLEMENT_PREPRODUCTION_CANDIDATE,boundary=global.KTS_SETTLEMENT_PREPRODUCTION_BOUNDARY,audit=global.KTS_SETTLEMENT_PREPRODUCTION_AUDIT_PACK,session=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_SESSION;
    if(!qualification||!pkg||!review||!history||!bundle||!receipt||!handoff||!candidate||!boundary||!audit||!session)throw new Error('PREPRODUCTION_ORCHESTRATOR_DEPENDENCY_MISSING');
    return {qualification,pkg,review,history,bundle,receipt,handoff,candidate,boundary,audit,session};
  }
  async function inspectState(){
    const d=deps(),ready=await d.qualification.checkLastReadyValidity();
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
    const reviewSession=await d.session.buildSession(packageJson,reviewResult);
    return {package:packageJson,review:reviewResult,session:reviewSession,state};
  }
  async function resumeTechnicalReview(reviewSession){const d=deps(),resumed=await d.session.resumeSession(reviewSession);return {package:resumed.package,review:resumed.review,session:resumed.session,state:await inspectState(),resumed:true};}
  async function pinHumanTechnicalReview(packageJson,human){
    const d=deps(),h=human||{};
    if(h.acknowledged!==true)throw new Error('PREPRODUCTION_ORCHESTRATOR_HUMAN_ACK_REQUIRED');
    if(!String(h.reviewer||'').trim())throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEWER_REQUIRED');
    const reviewResult=await d.review.reviewPackage(packageJson);
    if(String(reviewResult&&reviewResult.verdict)!=='CURRENT')throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_NOT_CURRENT:'+String(reviewResult&&reviewResult.verdict||''));
    const record=await d.review.buildHumanReviewRecord(packageJson,reviewResult,{reviewer:String(h.reviewer).trim(),note:String(h.note||'').trim()});
    const checked=await d.review.verifyHumanReviewRecord(record);if(!checked.valid)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_RECORD_INVALID:'+checked.errors.join('|'));
    const event=await d.history.appendReview(packageJson,record);return {record,event,already_pinned:false};
  }
  function reviewMatchesPackage(state,packageJson){
    const event=state&&state.review&&state.review.event,pkgSha=String(packageJson&&packageJson.integrity&&packageJson.integrity.payload_sha256||''),readyId=String(packageJson&&packageJson.source_ready_event&&packageJson.source_ready_event.id||'');
    return Boolean(state&&state.stage===STAGES.REVIEW_CURRENT&&event&&pkgSha&&readyId&&String(event.package_link&&event.package_link.package_payload_sha256||'')===pkgSha&&String(event.qualification_link&&event.qualification_link.source_event_id||'')===readyId);
  }
  async function ensureReviewPinned(packageJson,human){const state=await inspectState();if(reviewMatchesPackage(state,packageJson))return {record:clone(state.review.event&&state.review.event.record||null),event:clone(state.review.event),already_pinned:true};return pinHumanTechnicalReview(packageJson,human);}
  async function buildTechnicalChain(){
    const d=deps(),state=await inspectState();if(state.stage!==STAGES.REVIEW_CURRENT)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_NOT_CURRENT:'+state.stage);
    const bundleJson=await d.bundle.buildBundle(),receiptJson=await d.receipt.buildReceipt(bundleJson),handoffJson=await d.handoff.buildHandoff(bundleJson,receiptJson),candidateJson=await d.candidate.buildCandidate(handoffJson),boundaryJson=await d.boundary.buildBoundarySnapshot(candidateJson,handoffJson),auditPack=await d.audit.buildAuditPack(handoffJson,candidateJson,boundaryJson);
    const auditCheck=await d.audit.verifyAuditPack(auditPack);if(!auditCheck.valid)throw new Error('PREPRODUCTION_ORCHESTRATOR_AUDIT_PACK_INVALID:'+auditCheck.errors.join('|'));
    return {stage:STAGES.TECHNICAL_CHAIN_COMPLETE,bundle:bundleJson,receipt:receiptJson,handoff:handoffJson,candidate:candidateJson,boundary:boundaryJson,audit_pack:auditPack,production_authorized:false,merge_authorized:false,deploy_authorized:false,production_enabled:false};
  }
  async function completeFromSession(reviewSession,human){const prepared=await resumeTechnicalReview(reviewSession),pinned=await ensureReviewPinned(prepared.package,human||{}),chain=await buildTechnicalChain();return {prepared,pinned,chain,idempotent_review_reuse:pinned.already_pinned===true};}
  function downloadJson(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionOrchestratorPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionOrchestratorPanel';card.innerHTML=`<div class="section-title">Pre-production evidence orchestrator · resumable</div><div class="hint">Chuẩn bị review có thể xuất thành review-session JSON và nạp lại sau reload. Sau human acknowledgement, hệ thống tự pin evidence và dựng bundle/receipt/handoff/candidate/boundary/audit pack. Retry cùng package không append review trùng.</div><div class="row" style="margin-top:8px"><button id="preprodOrchInspect" class="btn soft">Kiểm trạng thái</button><button id="preprodOrchPrepare" class="btn soft">Chuẩn bị review session</button><button id="preprodOrchExportSession" class="btn soft" disabled>Xuất review session</button></div><div style="margin-top:8px"><label>Nạp review session sau reload</label><input id="preprodOrchSessionFile" type="file" accept=".json,application/json"></div><div class="row" style="margin-top:8px"><button id="preprodOrchResume" class="btn soft">Verify + resume session</button></div><div class="grid" style="margin-top:8px"><div><label>Reviewer</label><input id="preprodOrchReviewer" placeholder="Tên người review"></div><div><label>Ghi chú</label><input id="preprodOrchNote" placeholder="Tuỳ chọn"></div></div><label style="display:block;margin-top:8px"><input id="preprodOrchAck" type="checkbox"> Tôi đã xem technical review và xác nhận pin evidence read-only</label><div class="row" style="margin-top:8px"><button id="preprodOrchComplete" class="btn primary" disabled>Xác nhận + hoàn tất technical chain</button></div><div id="preprodOrchStatus" class="status"></div><div id="preprodOrchOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionBoundaryPanel')||doc.getElementById('preproductionCandidatePanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    let prepared=null;const status=(t,k)=>{const e=doc.getElementById('preprodOrchStatus');e.textContent=t||'';e.className='status '+(k||'');};
    const renderReview=p=>{doc.getElementById('preprodOrchOutput').innerHTML=(p.review&&p.review.checklist||[]).map(x=>`<div class="report-message"><b>${esc(x.status)}</b> · ${esc(x.label)}<div class="hint">${esc(x.detail)}</div></div>`).join('');doc.getElementById('preprodOrchExportSession').disabled=false;doc.getElementById('preprodOrchComplete').disabled=false;};
    doc.getElementById('preprodOrchInspect').addEventListener('click',async()=>{try{const s=await inspectState();status(s.stage,s.stage===STAGES.REVIEW_CURRENT?'ok':'warn');doc.getElementById('preprodOrchOutput').innerHTML=`<div class="hint">READY: ${esc(s.ready&&s.ready.status||'—')} · review: ${esc(s.review&&s.review.status||'—')}</div>`;}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchPrepare').addEventListener('click',async()=>{try{prepared=await prepareTechnicalReview();renderReview(prepared);status('Review session CURRENT. Có thể xuất file để resume sau reload, hoặc xác nhận để hoàn tất technical chain.','warn');}catch(e){prepared=null;doc.getElementById('preprodOrchExportSession').disabled=true;doc.getElementById('preprodOrchComplete').disabled=true;status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchExportSession').addEventListener('click',()=>{try{if(!prepared||!prepared.session)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_SESSION_REQUIRED');downloadJson('kts-preproduction-review-session-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',prepared.session);status('Đã xuất review session có SHA. File chứa package/evidence để resume; không cấp quyền production.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchResume').addEventListener('click',async()=>{try{const input=doc.getElementById('preprodOrchSessionFile'),file=input.files&&input.files[0];if(!file)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_SESSION_FILE_REQUIRED');prepared=await resumeTechnicalReview(JSON.parse(await file.text()));renderReview(prepared);status('Review session verify CURRENT và đã resume. Không ghi local history khi import.','ok');}catch(e){prepared=null;doc.getElementById('preprodOrchExportSession').disabled=true;doc.getElementById('preprodOrchComplete').disabled=true;status(String(e&&e.message||e),'err');}});
    doc.getElementById('preprodOrchComplete').addEventListener('click',async()=>{try{if(!prepared||!prepared.session)throw new Error('PREPRODUCTION_ORCHESTRATOR_REVIEW_SESSION_REQUIRED');status('Đang re-verify session → pin/reuse human review → dựng technical chain…','warn');const human={reviewer:doc.getElementById('preprodOrchReviewer').value,note:doc.getElementById('preprodOrchNote').value,acknowledged:doc.getElementById('preprodOrchAck').checked},done=await completeFromSession(prepared.session,human);downloadJson('kts-preproduction-audit-pack-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',done.chain.audit_pack);status('TECHNICAL_CHAIN_COMPLETE'+(done.idempotent_review_reuse?' · review evidence đã có nên không append trùng':'')+' · dừng tại human production decision boundary.','ok');doc.getElementById('preprodOrchOutput').innerHTML=`<div class="status ok">${esc(done.chain.boundary.status)}</div><div class="hint">candidate ${esc(String(done.chain.candidate.integrity.candidate_sha256).slice(0,16))}… · production_authorized=false</div>`;}catch(e){status(String(e&&e.message||e),'err');}});
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_ORCHESTRATOR=Object.freeze({version:VERSION,STAGES,inspectState,prepareTechnicalReview,resumeTechnicalReview,pinHumanTechnicalReview,reviewMatchesPackage,ensureReviewPinned,buildTechnicalChain,completeFromSession});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
