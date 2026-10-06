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
  function loadPreproductionPackage(){
    const doc=global.document;
    if(!doc||global.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE||doc.querySelector('script[data-kts-preproduction-package]'))return;
    const script=doc.createElement('script');
    script.src='./settlement-preproduction-package.js';
    script.async=false;
    script.setAttribute('data-kts-preproduction-package','1');
    (doc.body||doc.head||doc.documentElement).appendChild(script);
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
