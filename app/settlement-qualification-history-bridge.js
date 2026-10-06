(function(global){
  'use strict';
  function show(text,kind){
    const doc=global.document;
    const historyEl=doc&&doc.getElementById('qualificationHistoryStatus');
    if(historyEl){historyEl.textContent=text||'';historyEl.className='status '+(kind||'');}
  }
  function fail(error){
    const message=String(error&&error.message||error||'QUALIFICATION_EVIDENCE_SAVE_FAILED');
    show('KHÔNG LƯU ĐƯỢC qualification evidence: '+message+'. READY vừa tính không được coi là evidence bền vững.','err');
    const doc=global.document,finalEl=doc&&doc.getElementById('finalQualificationStatus');
    if(finalEl){finalEl.textContent='Gate đã chạy nhưng KHÔNG LƯU được evidence SHA-256: '+message+'. Chưa dùng kết quả này làm bằng chứng qualification.';finalEl.className='status err';}
    if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('kts:qualification-evidence-error',{detail:{error:message}}));
  }
  function appendScript(src,attr,onload){
    const doc=global.document;if(!doc||doc.querySelector('script['+attr+']'))return;
    const script=doc.createElement('script');script.src=src;script.async=false;script.setAttribute(attr,'1');if(onload)script.addEventListener('load',onload,{once:true});(doc.body||doc.head||doc.documentElement).appendChild(script);
  }
  function loadPreproductionReviewBundle(){
    if(global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE)return;
    appendScript('./settlement-preproduction-review-bundle.js','data-kts-preproduction-review-bundle');
  }
  function loadPreproductionReviewHistory(){
    if(global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY){loadPreproductionReviewBundle();return;}
    appendScript('./settlement-preproduction-review-history.js','data-kts-preproduction-review-history',loadPreproductionReviewBundle);
  }
  function loadPreproductionReview(){
    if(global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW){loadPreproductionReviewHistory();return;}
    appendScript('./settlement-preproduction-review.js','data-kts-preproduction-review',loadPreproductionReviewHistory);
  }
  function loadPreproductionPackage(){
    if(global.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE){loadPreproductionReview();return;}
    appendScript('./settlement-preproduction-package.js','data-kts-preproduction-package',loadPreproductionReview);
  }
  if(typeof global.addEventListener==='function'){
    global.addEventListener('kts:qualification-completed',event=>{
      const history=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
      const detail=event&&event.detail||{};
      if(!history||typeof history.recordQualification!=='function'){fail('QUALIFICATION_HISTORY_UNAVAILABLE');return;}
      show('Đang lưu qualification evidence SHA-256…','warn');
      history.recordQualification(detail.qualification,detail.options||{}).then(saved=>{
        show('Đã lưu qualification evidence · SHA '+String(saved&&saved.input_fingerprint_sha256||'').slice(0,16)+'…','ok');
        if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('kts:qualification-evidence-saved',{detail:{event:saved}}));
      }).catch(fail);
    });
  }
  loadPreproductionPackage();
})(typeof window!=='undefined'?window:globalThis);
