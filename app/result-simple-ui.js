(function(global){
  'use strict';
  const VIEW_MODE_KEY='kts_kqxs_view_mode_v1';

  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function regionName(v){return v==='mn'?'Miền Nam':v==='mt'?'Miền Trung':v==='mb'?'Miền Bắc':String(v||'').toUpperCase();}
  function validScope(s){return Boolean(s&&/^\d{4}-\d{2}-\d{2}$/.test(String(s.business_date||''))&&['mn','mt','mb'].includes(String(s.region||'').toLowerCase()));}

  function install(){
    const doc=global.document;
    const pane=doc&&doc.getElementById('pane-result');
    const resultDate=doc&&doc.getElementById('resultDate');
    const resultRegion=doc&&doc.getElementById('resultRegion');
    const messageDate=doc&&doc.getElementById('messageDate');
    const messageRegion=doc&&doc.getElementById('messageRegion');
    const resultTable=doc&&doc.getElementById('resultTable');
    if(!pane||!resultDate||!resultRegion||!messageDate||!messageRegion||!resultTable)return;
    if(doc.getElementById('kqxsSimpleSummary'))return;

    const style=doc.createElement('style');
    style.textContent=`
      #pane-result .kqxs-tech-hidden{display:none!important}
      #kqxsSimpleSummary{padding:2px 0 4px}
      #kqxsSimpleSummary .kqxs-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      #kqxsSimpleSummary .kqxs-scope{font-size:16px;font-weight:850}
      #resultTable h3{font-size:17px;margin:14px 0 6px;padding:8px 10px;background:#f8fafc;border-radius:9px}
      #resultTable table{font-size:14px}
      #resultTable th:first-child,#resultTable td:first-child{width:52px}
      #resultTable td:nth-child(2){font-size:17px;font-weight:800;letter-spacing:.25px;line-height:1.5;word-break:break-word}
      #resultTable td{padding:9px 6px}
      #kqxsTechToggle{margin-top:8px}
    `;
    doc.head.appendChild(style);

    const firstCard=pane.querySelector('.card');
    if(!firstCard)return;
    const title=firstCard.querySelector('.section-title');
    if(title)title.textContent='Kết quả xổ số';

    const summary=doc.createElement('div');
    summary.id='kqxsSimpleSummary';
    summary.innerHTML='<div class="kqxs-head"><span id="kqxsAutoBadge" class="tag ok">TỰ CẬP NHẬT</span><span id="kqxsAutoScope" class="kqxs-scope">—</span></div><div class="hint" style="margin-top:5px">Tự lấy KQXS theo đúng Ngày + Miền ở tab Tin. Không cần bấm bắt đầu hay dừng.</div><button id="kqxsTechToggle" class="btn soft">Xem ngày cũ / kỹ thuật</button>';
    if(title)title.insertAdjacentElement('afterend',summary);else firstCard.prepend(summary);

    const controls=firstCard.querySelector('.grid3');
    const start=doc.getElementById('startResults');
    const stop=doc.getElementById('stopResults');
    const actionRow=start&&start.closest('.row');
    if(controls)controls.classList.add('kqxs-tech-hidden');
    if(actionRow)actionRow.classList.add('kqxs-tech-hidden');

    const endpoint=doc.getElementById('resultEndpoint');
    const endpointCard=endpoint&&endpoint.closest('.card');
    if(endpointCard)endpointCard.classList.add('kqxs-tech-hidden');

    function auditCard(){
      const el=doc.getElementById('resultAudit');
      return el&&el.closest('.card');
    }
    function hideAudit(){const card=auditCard();if(card)card.classList.add('kqxs-tech-hidden');}
    hideAudit();
    const obs=new MutationObserver(hideAudit);
    obs.observe(pane,{childList:true});

    let tech=false;
    function applyTech(){
      if(controls)controls.classList.toggle('kqxs-tech-hidden',!tech);
      if(actionRow)actionRow.classList.toggle('kqxs-tech-hidden',!tech);
      if(endpointCard)endpointCard.classList.toggle('kqxs-tech-hidden',!tech);
      const card=auditCard();if(card)card.classList.toggle('kqxs-tech-hidden',!tech);
      const btn=doc.getElementById('kqxsTechToggle');if(btn)btn.textContent=tech?'Ẩn ngày cũ / kỹ thuật':'Xem ngày cũ / kỹ thuật';
    }
    doc.getElementById('kqxsTechToggle').addEventListener('click',()=>{tech=!tech;applyTech();});

    function messageScope(){
      return {business_date:String(messageDate.value||''),region:String(messageRegion.value||'').toLowerCase()};
    }
    function updateLabel(scope){
      const el=doc.getElementById('kqxsAutoScope');
      if(el)el.textContent=validScope(scope)?regionName(scope.region)+' · '+scope.business_date:'Chưa chọn ngày/miền';
    }
    function syncScope(){
      const scope=messageScope();
      if(!validScope(scope)){updateLabel(scope);return scope;}
      resultDate.value=scope.business_date;
      resultRegion.value=scope.region;
      updateLabel(scope);
      try{if(global.localStorage)global.localStorage.setItem(VIEW_MODE_KEY,'date');}catch(_){}
      const chooser=doc.getElementById('resultViewMode');
      if(chooser&&chooser.value!=='date')chooser.value='date';
      return scope;
    }
    async function ensureAuto(){
      const scope=syncScope();
      if(!validScope(scope))return;
      const manager=global.KTS_RESULT_AUTO_MANAGER;
      if(manager&&typeof manager.ensureScope==='function'){
        try{await manager.ensureScope(scope);}catch(_){}
      }
    }

    for(const btn of doc.querySelectorAll('.nav button[data-pane="result"]')){
      btn.addEventListener('click',()=>{ensureAuto();});
    }
    messageDate.addEventListener('change',syncScope);
    messageRegion.addEventListener('change',syncScope);
    const save=doc.getElementById('saveMessage');
    if(save)save.addEventListener('click',()=>{syncScope();});

    if(typeof global.addEventListener==='function'){
      global.addEventListener('kts:auto-result-status',event=>{
        const info=event.detail||{};
        const scope=info.scope||{};
        if(validScope(scope)&&scope.business_date===resultDate.value&&String(scope.region).toLowerCase()===resultRegion.value)updateLabel(scope);
        if(info.state==='error'&&/KQXS_HTTP_404/.test(String(info.error||''))&&/github\.io$/i.test(String(global.location&&global.location.hostname||''))){
          const msg='Bản test public chưa nối backend KQXS. Cơ chế tự cập nhật đã chạy; khi backend được nối hệ thống sẽ tự lấy xổ, không cần thao tác.';
          const status=doc.getElementById('resultStatus');if(status){status.textContent=msg;status.className='status warn';}
          const auto=doc.getElementById('autoResultStatus');if(auto){auto.textContent=msg;auto.className='status warn';}
        }
      });
      global.addEventListener('kts:auto-result-update',event=>{
        const s=event.detail&&event.detail.snapshot;if(s&&validScope(s))updateLabel(s);
      });
    }

    syncScope();
    applyTech();
  }

  global.KTS_RESULT_SIMPLE_UI=Object.freeze({version:'result-simple-ui-v1',regionName,validScope});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);
