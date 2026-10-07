(function(global){
  'use strict';

  const CODE_LABELS=Object.freeze({
    '2CB':'2C lô','2CD':'2C ĐĐ','2CB7':'2C 7 lô','2CB8':'2C 8 lô',
    DAT:'Đá thẳng',DAX:'Đá xuyên','3CB':'3C lô','3CB7':'3C 7 lô',
    '3CDD':'3C ĐĐ','3CXC':'3C xỉu chủ','4C':'4C',MB_XIEN2:'Xiên 2',MB_XIEN3:'Xiên 3',MB_XIEN4:'Xiên 4',UI:'Ủi'
  });

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
  function canonicalSummary(canonical){
    const legs=canonical&&Array.isArray(canonical.legs)?canonical.legs:[];
    return legs.map(leg=>{
      const stations=Array.isArray(leg.station_codes)&&leg.station_codes.length?leg.station_codes.map(x=>String(x).toUpperCase()).join('+')+' · ':'';
      const code=String(leg.code||'').toUpperCase();
      const label=CODE_LABELS[code]||code;
      const values=Array.isArray(leg.values)?leg.values.map(String).join(' '):'';
      const position=leg.position?' '+String(leg.position).toUpperCase():'';
      const stake=leg.stake==null?'':' · '+String(leg.stake)+'n';
      return (stations+values+' '+label+position+stake).trim();
    }).filter(Boolean).join(' | ');
  }
  function friendlyParserError(error){
    const text=String(error&&error.message||error||'');
    const maps=[
      ['SETTLEMENT_DUPLICATE_NUMBER','Có số bị lặp trong cùng một nhóm. Hãy kiểm tra lại tin.'],
      ['SETTLEMENT_STATION_REQUIRED','Không nhận ra đài trong tin. Hãy kiểm tra tên hoặc viết tắt đài.'],
      ['SETTLEMENT_ACTION_REQUIRED','Thiếu cách đánh sau nhóm số.'],
      ['SETTLEMENT_STAKE_REQUIRED','Thiếu tiền cược hoặc đơn vị tiền.'],
      ['INVALID_SETTLEMENT_STAKE','Tiền cược không hợp lệ.'],
      ['UNVERIFIED_SETTLEMENT_ACTION','Cách đánh này chưa được xác nhận nên chưa tính.'],
      ['SETTLEMENT_VALUE_REQUIRED','Thiếu số hoặc nhóm số không hợp lệ.'],
      ['SETTLEMENT_MESSAGE_HAS_NO_LEGS','Không đọc được cách đánh nào trong tin.'],
      ['PARSER_REGION_MISMATCH','Miền của tin không khớp miền đang chọn.'],
      ['PARSER_MESSAGE_REQUIRED','Tin đang trống.']
    ];
    const hit=maps.find(([code])=>text.includes(code));
    return hit?hit[1]:'Không đọc được cú pháp tin. Hãy kiểm tra lại trước khi lưu.';
  }
  function cleanUserText(value){
    return String(value||'')
      .replace(/chờ đối chiếu HIOSKT/gi,'đang đối chiếu')
      .replace(/HIOSKT/g,'nguồn đối chiếu')
      .replace(/FAIL-CLOSED/g,'CHƯA THỂ CHỐT')
      .replace(/fail-closed/gi,'chưa đủ điều kiện tính')
      .replace(/\bBLOCKED\b/g,'CHƯA TÍNH')
      .replace(/shadow đối chiếu/gi,'đối chiếu')
      .replace(/SHADOW/g,'đối soát')
      .replace(/lỗi parser/gi,'lỗi cú pháp')
      .replace(/canonical parser/gi,'bộ đọc cú pháp')
      .replace(/Ngày này chưa có settlement\./g,'Ngày này chưa có dữ liệu tính tiền.')
      .replace(/settlement chỉ TẠM TÍNH/gi,'tiền hiện chỉ TẠM TÍNH')
      .replace(/settlement được tính lại/gi,'tiền được tính lại')
      .replace(/settlement/gi,'kết quả tính tiền')
      .replace(/dừng polling/gi,'ngừng cập nhật')
      .replace(/KQXS có dữ liệu nhưng tính lại lỗi:/g,'Có kết quả xổ số nhưng chưa tính lại được:')
      .replace(/(^|[·\s])BU(?=\s*:)/g,'$1BÙ');
  }
  function hasUnsavedConfig(doc){
    const el=doc&&doc.getElementById?doc.getElementById('configDirtyStatus'):null;
    return Boolean(el&&/Chưa lưu thay đổi/i.test(String(el.textContent||'')));
  }
  function hasMessageDraft(value){ return Boolean(String(value||'').trim()); }
  function messageScope(partner,date,region){
    return Object.freeze({
      partner_id:String(partner&&partner.value||''),
      business_date:String(date&&date.value||''),
      region:String(region&&region.value||'')
    });
  }
  function sameMessageScope(a,b){
    return Boolean(a&&b&&a.partner_id===b.partner_id&&a.business_date===b.business_date&&a.region===b.region);
  }

  function installSaveGuard(doc){
    const save=doc.getElementById('saveMessage');
    const textarea=doc.getElementById('messageText');
    const status=doc.getElementById('messageStatus');
    if(!save||!textarea)return;
    let busy=false,sawDisabled=false;
    function claim(event){
      if(busy){
        if(event){event.preventDefault();event.stopImmediatePropagation();}
        return false;
      }
      busy=true;sawDisabled=Boolean(save.disabled);return true;
    }
    function release(){busy=false;sawDisabled=false;}
    save.addEventListener('click',event=>{claim(event);},true);
    textarea.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key==='Enter')claim(event);
    },true);
    if(typeof global.MutationObserver==='function'){
      new global.MutationObserver(()=>{
        if(save.disabled)sawDisabled=true;
        else if(busy&&sawDisabled)release();
      }).observe(save,{attributes:true,attributeFilter:['disabled']});
      if(status)new global.MutationObserver(()=>{
        if(busy&&!sawDisabled&&!save.disabled&&String(status.textContent||'').trim())release();
      }).observe(status,{childList:true,characterData:true,subtree:true});
    }
    if(typeof global.addEventListener==='function')global.addEventListener('pageshow',()=>{if(!save.disabled)release();});
  }

  function installSyntaxReview(doc){
    const parser=global.KTS_SETTLEMENT_PARSER_PROVIDER;
    const save=doc.getElementById('saveMessage');
    const clear=doc.getElementById('clearMessage');
    const textarea=doc.getElementById('messageText');
    const date=doc.getElementById('messageDate');
    const region=doc.getElementById('messageRegion');
    if(!parser||typeof parser.fetchCanonical!=='function'||!save||!textarea||!date||!region)return;
    const row=save.parentElement;
    if(!row)return;
    let button=doc.getElementById('checkMessageSyntax');
    if(!button){
      button=doc.createElement('button');button.id='checkMessageSyntax';button.type='button';button.className='btn soft';button.textContent='Kiểm tra cú pháp';
      row.insertBefore(button,clear||save.nextSibling);
    }
    let preview=doc.getElementById('messageParsePreview');
    if(!preview){
      preview=doc.createElement('div');preview.id='messageParsePreview';preview.className='status';preview.setAttribute('aria-live','polite');row.insertAdjacentElement('afterend',preview);
    }
    let reviewEpoch=0;
    function reset(){reviewEpoch+=1;preview.textContent='';preview.className='status';}
    button.addEventListener('click',async()=>{
      const epoch=++reviewEpoch;
      const raw=String(textarea.value||'').trim();
      const reviewDate=String(date.value||'');
      const reviewRegion=String(region.value||'');
      const stillCurrent=()=>epoch===reviewEpoch&&String(textarea.value||'').trim()===raw&&String(date.value||'')===reviewDate&&String(region.value||'')===reviewRegion;
      if(!raw){preview.textContent='Chưa có tin để kiểm tra.';preview.className='status warn';return;}
      button.disabled=true;const label=button.textContent;button.textContent='Đang kiểm tra…';
      try{
        const canonical=await parser.fetchCanonical(raw,reviewRegion,reviewDate);
        if(!stillCurrent())return;
        const summary=canonicalSummary(canonical);
        preview.textContent=summary?'Hệ thống đọc: '+summary:'Không đọc được nội dung tin.';
        preview.className='status '+(summary?'ok':'warn');
      }catch(error){
        if(stillCurrent()){preview.textContent=friendlyParserError(error);preview.className='status err';}
      }finally{
        if(stillCurrent()){button.disabled=false;button.textContent=label||'Kiểm tra cú pháp';}
        else if(button.disabled){button.disabled=false;button.textContent=label||'Kiểm tra cú pháp';}
      }
    });
    textarea.addEventListener('input',reset);
    date.addEventListener('change',reset);
    region.addEventListener('change',reset);
  }

  function cleanTree(doc,root){
    if(!root||!doc.createTreeWalker)return;
    const walker=doc.createTreeWalker(root,(global.NodeFilter&&global.NodeFilter.SHOW_TEXT)||4);
    const nodes=[];let node;
    while((node=walker.nextNode()))nodes.push(node);
    for(const textNode of nodes){
      const next=cleanUserText(textNode.nodeValue);
      if(next!==textNode.nodeValue)textNode.nodeValue=next;
    }
  }
  function installLanguageCleanup(doc){
    if(typeof global.MutationObserver!=='function')return;
    const ids=['pane-message','resultStatus','reportOutput','attentionList','attentionStatus'];
    for(const id of ids){
      const root=doc.getElementById(id);
      if(!root)continue;
      let running=false;
      function clean(){
        if(running)return;running=true;
        try{cleanTree(doc,root);}finally{running=false;}
      }
      clean();
      new global.MutationObserver(clean).observe(root,{childList:true,characterData:true,subtree:true});
    }
  }

  function installMessageScopeGuard(doc){
    const textarea=doc.getElementById('messageText');
    const partner=doc.getElementById('partnerSelect');
    const date=doc.getElementById('messageDate');
    const region=doc.getElementById('messageRegion');
    const context=doc.getElementById('workContext');
    if(!textarea)return;
    let draftOrigin=null;

    let badge=doc.getElementById('messageDraftBadge');
    if(!badge&&context){
      badge=doc.createElement('span');
      badge.id='messageDraftBadge';
      badge.className='tag warn hidden';
      badge.textContent='Tin chưa lưu';
      context.appendChild(badge);
    }
    function current(){ return messageScope(partner,date,region); }
    function updateBadge(){
      const draft=hasMessageDraft(textarea.value);
      if(badge)badge.classList.toggle('hidden',!draft);
      if(draft&&!draftOrigin)draftOrigin=current();
      if(!draft)draftOrigin=null;
    }
    textarea.addEventListener('input',updateBadge);

    function guard(control,label){
      if(!control)return;
      let previous=String(control.value||'');
      control.addEventListener('focus',()=>{ previous=String(control.value||''); },true);
      control.addEventListener('change',event=>{
        const next=String(control.value||'');
        if(next===previous){updateBadge();return;}
        if(hasMessageDraft(textarea.value)){
          const ok=!global.confirm||global.confirm(`Ô Tin gốc còn nội dung chưa lưu. Bạn có chắc muốn đổi ${label}?\n\nNếu tiếp tục, nội dung vẫn được giữ nhưng sẽ được tính cho phạm vi mới khi bấm “Lưu + tính”.`);
          if(!ok){
            control.value=previous;
            if(event&&typeof event.preventDefault==='function')event.preventDefault();
            if(event&&typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
            updateBadge();
            return;
          }
          const finalizeScope=()=>{
            previous=String(control.value||'');
            draftOrigin=current();
            updateBadge();
          };
          if(typeof global.setTimeout==='function')global.setTimeout(finalizeScope,0);
          else finalizeScope();
          updateBadge();
          return;
        }
        previous=next;
        updateBadge();
      },true);
    }
    guard(partner,'khách/chủ');
    guard(date,'ngày');
    guard(region,'miền');

    const messageNav=doc.querySelector('.nav button[data-pane="message"]');
    if(messageNav)messageNav.addEventListener('click',event=>{
      if(!hasMessageDraft(textarea.value)||!draftOrigin)return;
      const now=current();
      if(sameMessageScope(now,draftOrigin))return;
      const ok=!global.confirm||global.confirm('Tin gốc chưa lưu đang thuộc phạm vi trước đó, nhưng app sắp mở một phạm vi khác.\n\nOK = chuyển tin nháp sang phạm vi mới. Hủy = giữ khách/ngày/miền cũ của tin nháp.');
      if(ok){ draftOrigin=now; updateBadge(); return; }
      if(partner)partner.value=draftOrigin.partner_id;
      if(date)date.value=draftOrigin.business_date;
      if(region)region.value=draftOrigin.region;
      if(event&&typeof event.preventDefault==='function')event.preventDefault();
      if(event&&typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
      updateBadge();
    },true);
    updateBadge();
  }

  function installUnsavedGuard(doc){
    if(typeof global.addEventListener!=='function')return;
    global.addEventListener('beforeunload',event=>{
      const text=doc.getElementById('messageText');
      if(!hasUnsavedConfig(doc)&&!hasMessageDraft(text&&text.value))return;
      event.preventDefault();
      event.returnValue='';
    });
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
    installSaveGuard(doc);
    installSyntaxReview(doc);
    installLanguageCleanup(doc);
    installMessageScopeGuard(doc);
    installUnsavedGuard(doc);
    update();
  }

  global.KTS_SETTLEMENT_CONSUMER_UI=Object.freeze({
    version:'settlement-consumer-ui-v7-stale-safe-syntax-review',
    compatibility:Object.freeze({version:'settlement-consumer-ui-v1'}),
    CODE_LABELS,
    regionName,
    formatDate,
    partnerLabel,
    canonicalSummary,
    friendlyParserError,
    cleanUserText,
    hasUnsavedConfig,
    hasMessageDraft,
    messageScope,
    sameMessageScope
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
