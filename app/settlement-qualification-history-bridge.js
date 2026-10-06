(function(global){
  'use strict';
  if(typeof global.addEventListener!=='function')return;
  global.addEventListener('kts:qualification-completed',event=>{
    const history=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
    const detail=event&&event.detail||{};
    if(!history||typeof history.recordQualification!=='function'){
      if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('kts:qualification-evidence-error',{detail:{error:'QUALIFICATION_HISTORY_UNAVAILABLE'}}));
      return;
    }
    history.recordQualification(detail.qualification,detail.options||{}).then(saved=>{
      if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('kts:qualification-evidence-saved',{detail:{event:saved}}));
    }).catch(error=>{
      if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('kts:qualification-evidence-error',{detail:{error:String(error&&error.message||error)}}));
    });
  });
})(typeof window!=='undefined'?window:globalThis);