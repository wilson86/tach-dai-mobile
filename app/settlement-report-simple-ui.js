(function(global){
  'use strict';
  const TECHNICAL_IDS = Object.freeze([
    'resultAuditPanel','shadowPanel','shadowHistoryPanel','shadowBatchPanel',
    'regressionCandidatePanel','regressionReviewPanel','parserReplayPanel','repairReadinessPanel',
    'observationPanel','finalQualificationPanel','qualificationHistoryPanel',
    'preproductionPackagePanel','preproductionReviewPanel','preproductionReviewHistoryPanel',
    'preproductionReviewBundlePanel','preproductionReceiptPanel','preproductionHandoffPanel',
    'preproductionCandidatePanel','preproductionBoundaryPanel','preproductionAuditPackPanel',
    'preproductionDecisionDossierPanel','preproductionDecisionRecheckPanel',
    'preproductionOrchestratorPanel','settlementBackupPanel'
  ]);
  function install(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');
    if(!pane||doc.getElementById('reportSimpleTools'))return;
    const style=doc.createElement('style');style.textContent='.kts-technical-hidden{display:none!important}.simple-note{background:#eef6ff;border:1px solid #cfe0ff;border-radius:10px;padding:9px 10px}';doc.head.appendChild(style);
    const tools=doc.createElement('div');tools.className='card';tools.id='reportSimpleTools';tools.innerHTML='<div class="section-title">Báo cáo dễ dùng</div><div class="simple-note hint">Bình thường chỉ cần xem <b>Tiền theo từng miền</b>, <b>Việc cần xử lý</b> và <b>Báo cáo theo đối tác</b>. MN và MT là hai miền độc lập.</div><div class="row" style="margin-top:8px"><button id="toggleTechnicalReport" class="btn soft">Hiện kiểm định kỹ thuật</button><button id="openBackupReport" class="btn soft">Backup dữ liệu</button></div><div id="simpleReportStatus" class="status"></div>';
    pane.insertBefore(tools,pane.firstChild);
    let technicalVisible=false;
    function apply(){
      for(const id of TECHNICAL_IDS){const el=doc.getElementById(id);if(!el)continue;const backup=id==='settlementBackupPanel';el.classList.toggle('kts-technical-hidden',!technicalVisible||backup);}
      const btn=doc.getElementById('toggleTechnicalReport');if(btn)btn.textContent=technicalVisible?'Ẩn kiểm định kỹ thuật':'Hiện kiểm định kỹ thuật';
    }
    doc.getElementById('toggleTechnicalReport').addEventListener('click',()=>{technicalVisible=!technicalVisible;apply();});
    doc.getElementById('openBackupReport').addEventListener('click',()=>{const el=doc.getElementById('settlementBackupPanel');if(!el)return;el.classList.remove('kts-technical-hidden');if(typeof el.scrollIntoView==='function')el.scrollIntoView({behavior:'smooth',block:'start'});});
    const observer=new MutationObserver(()=>apply());observer.observe(pane,{childList:true,subtree:false});setTimeout(apply,0);
  }
  global.KTS_SETTLEMENT_REPORT_SIMPLE_UI=Object.freeze({version:'settlement-report-simple-ui-v1',TECHNICAL_IDS});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);
