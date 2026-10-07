(function(global){
  'use strict';

  function hasDraft(value){ return Boolean(String(value || '').trim()); }

  function install(){
    const doc=global.document;
    if(!doc)return;
    const text=doc.getElementById('messageText');
    const partner=doc.getElementById('partnerSelect');
    const date=doc.getElementById('messageDate');
    const region=doc.getElementById('messageRegion');
    const context=doc.getElementById('workContext');
    if(!text)return;

    let badge=doc.getElementById('messageDraftBadge');
    if(!badge&&context){
      badge=doc.createElement('span');
      badge.id='messageDraftBadge';
      badge.className='tag warn hidden';
      badge.textContent='Tin chưa lưu';
      context.appendChild(badge);
    }

    function updateBadge(){ if(badge)badge.classList.toggle('hidden',!hasDraft(text.value)); }
    text.addEventListener('input',updateBadge);

    function guard(control,label){
      if(!control)return;
      let previous=String(control.value||'');
      control.addEventListener('focus',()=>{ previous=String(control.value||''); },true);
      control.addEventListener('change',event=>{
        const next=String(control.value||'');
        if(next===previous){updateBadge();return;}
        if(hasDraft(text.value)){
          const ok=!global.confirm||global.confirm(`Ô Tin gốc còn nội dung chưa lưu. Bạn có chắc muốn đổi ${label}?\n\nNếu tiếp tục, nội dung vẫn được giữ nhưng sẽ được tính cho phạm vi mới khi bấm “Lưu + tính”.`);
          if(!ok){
            control.value=previous;
            if(event&&typeof event.preventDefault==='function')event.preventDefault();
            if(event&&typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
            updateBadge();
            return;
          }
        }
        previous=next;
        updateBadge();
      },true);
    }

    guard(partner,'khách/chủ');
    guard(date,'ngày');
    guard(region,'miền');

    if(typeof global.addEventListener==='function')global.addEventListener('beforeunload',event=>{
      if(!hasDraft(text.value))return;
      event.preventDefault();
      event.returnValue='';
    });

    if(partner&&typeof global.MutationObserver==='function'){
      new global.MutationObserver(()=>{ if(!hasDraft(text.value)) updateBadge(); }).observe(partner,{childList:true,subtree:true});
    }
    updateBadge();
  }

  global.KTS_SETTLEMENT_MESSAGE_DRAFT_GUARD=Object.freeze({
    version:'settlement-message-draft-guard-v1',
    hasDraft
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
