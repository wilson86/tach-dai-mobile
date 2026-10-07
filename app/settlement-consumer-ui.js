(function(global){
  'use strict';

  function regionName(value){
    const v=String(value||'').toLowerCase();
    return v==='mn'?'Miền Nam':v==='mt'?'Miền Trung':v==='mb'?'Miền Bắc':'—';
  }
  function formatDate(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    return m?`${m[3]}/${m[2]}/${m[1]}`:'—';
  }
  function partnerLabel(select){
    if(!select||!select.value)return 'Chưa chọn';
    const option=select.options&&select.options[select.selectedIndex];
    return option&&option.textContent?String(option.textContent).trim():'Đã chọn';
  }

  function install(){
    const doc=global.document;
    if(!doc)return;
    const partner=doc.getElementById('partnerSelect');
    const date=doc.getElementById('messageDate');
    const region=doc.getElementById('messageRegion');
    const partnerOut=doc.getElementById('contextPartner');
    const scopeOut=doc.getElementById('contextScope');

    function update(){
      if(partnerOut)partnerOut.textContent=partnerLabel(partner);
      if(scopeOut)scopeOut.textContent=`${regionName(region&&region.value)} · ${formatDate(date&&date.value)}`;
    }
    if(partner)partner.addEventListener('change',update);
    if(date)date.addEventListener('change',update);
    if(region)region.addEventListener('change',update);
    if(partner&&typeof global.MutationObserver==='function'){
      new global.MutationObserver(update).observe(partner,{childList:true,subtree:true});
    }

    for(const btn of doc.querySelectorAll('.nav button')){
      btn.setAttribute('role','tab');
      btn.addEventListener('click',()=>{
        for(const item of doc.querySelectorAll('.nav button'))item.setAttribute('aria-selected',item===btn?'true':'false');
      });
      btn.setAttribute('aria-selected',btn.classList.contains('active')?'true':'false');
    }

    const textarea=doc.getElementById('messageText');
    if(textarea)textarea.setAttribute('aria-label','Tin gốc cần tính');
    update();
  }

  global.KTS_SETTLEMENT_CONSUMER_UI=Object.freeze({
    version:'settlement-consumer-ui-v1',
    regionName,
    formatDate,
    partnerLabel
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
