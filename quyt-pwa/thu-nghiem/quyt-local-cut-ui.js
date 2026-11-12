'use strict';
// WILSON86 local CUT REVIEW only; no Telegram APIs, no sends, no direct source mutation.
(()=> {
 const $=id=>document.getElementById(id);
 const raw=$('raw'),items=$('cutAuditRows'),receipt=$('cutReceipt'),reconcile=$('sourceReconcile');
 const cutBtn=$('cutSelected'),undoBtn=$('undoLocalCut'),newBtn=$('startFreshCutBatch'),original=$('cutOriginalSnapshot');
 const copyIds=new Set(['copy','select','copyScaled','copyUnscaled']);
 let base=null,state=null,blocked=false,copyStarted=false;
 const scope=()=>QuytCutAudit.scope(raw.value,$('customer').value,$('market').value,$('businessDate').value,$('tick').checked,$('rate').value);
 const get=()=>{
  let txt;try{txt=sessionStorage.getItem(QuytCutAudit.storageKey)}catch(_){throw Error('HOLD_CUT_STORAGE_UNAVAILABLE')}
  if(!txt)return null;
  let rec;try{rec=JSON.parse(txt)}catch(_){throw Error('HOLD_CUT_STORAGE_CORRUPT')}
  if(!rec||typeof rec.scope!=='string'||!Array.isArray(rec.keys)||!Array.isArray(rec.undo)||
    rec.undo.length>30||rec.keys.length>5000||rec.everCut!==true||
    rec.undo.some(x=>!Array.isArray(x)||x.length>5000))
    throw Error('HOLD_CUT_STORAGE_CORRUPT');
  return rec;
 };
 const save=next=>{
  const blob=JSON.stringify(next);
  try{sessionStorage.setItem(QuytCutAudit.storageKey,blob);
   if(sessionStorage.getItem(QuytCutAudit.storageKey)!==blob)throw Error('MISMATCH');
  }catch(_){throw Error('HOLD_CUT_STORAGE_NOT_CONFIRMED')}
 };
 const stopCopies=()=>{
  for(const id of copyIds){const btn=$(id);if(btn)btn.disabled=true}
  document.querySelectorAll('.section-copy').forEach(btn=>btn.disabled=true);
  $('ackMoney').checked=false;$('ackMoney').disabled=true;$('moneyAcknowledgment').hidden=true;
 };
 const emptyOutput=why=>{
  stopCopies();
  for(const id of ['scaledTicket','unscaledTicket','result'])$(id).value='';
  for(const id of ['baoTotal','otherTotal'])$(id).textContent='—';
  for(const id of ['scaledItems','unscaledItems'])$(id).textContent='';
  $('factorReceipt').textContent=why;
  $('status').textContent=why;$('status').classList.add('hold');
 };
 const clearAudit=()=>{
  base=null;blocked=false;items.replaceChildren();
  cutBtn.disabled=true;undoBtn.disabled=true;newBtn.hidden=true;
  receipt.textContent='Chưa có dòng được Cắt.';
  reconcile.textContent='Đang đối chiếu nội dung ô nhập (không kết nối Telegram).';
  original.value=raw.value;
 };
 const showRemaining=view=>{
  const scaled=view.rows.filter(r=>r.factorApplied),plain=view.rows.filter(r=>!r.factorApplied);
  const sum=rows=>rows.reduce((n,r)=>n+BigInt(r.adjusted),0n);
  const item=r=>(r.station?r.station+' ':'')+r.number.replace('-',' ')+' '+r.kind+r.adjusted+'n.';
  const audit=r=>(r.station?r.station+' / ':'')+r.number+' '+r.kind.toUpperCase()+
   ' · '+r.raw+'n'+(r.factorApplied?' → ':' (không nhân) → ')+r.adjusted+'n';
  $('baoTotal').textContent=sum(scaled)+'n';$('otherTotal').textContent=sum(plain)+'n';
  $('scaledTicket').value=scaled.map(item).join('\n');
  $('unscaledTicket').value=plain.map(item).join('\n');
  $('scaledItems').textContent=scaled.map(audit).join('\n')||'Không có khoản đã nhân';
  $('unscaledItems').textContent=plain.map(audit).join('\n')||'Không có khoản giữ nguyên';
  stopCopies();$('result').value='';
  $('factorReceipt').textContent='ĐÃ CẮT TẠI CHỖ — xem kết quả còn lại, chưa được Copy/Gửi. Tin gốc và Telegram không thay đổi.';
  $('status').textContent='HOLD_CUT_LOCAL_REVIEW: sổ Cắt chỉ dùng đối chiếu. Không COPY/GỬI cược đã Cắt.';
  $('status').classList.add('hold');
 };
 function refresh(){
  clearAudit();
  let next;try{next=get()}catch(e){blocked=true;emptyOutput(String(e.message));return}
  state=next;
  if(next&&next.scope!==scope()){
   blocked=true;newBtn.hidden=false;
   emptyOutput('HOLD_CUT_REPLAY_SCOPE_MISMATCH: tin gốc, khách, miền, ngày hoặc hệ số đã đổi sau Cắt. Khôi phục nguyên trạng cũ hoặc xác nhận lượt đặt mới; không tự tái xuất.');
   receipt.textContent='Sổ Cắt cũ vẫn còn trong tab. Không tự xóa hoặc cắt lần hai.';
   return;
  }
  if(!raw.value.trim())return;
  try{
   const verified=OfflineKTS.merge(raw.value,{market:$('market').value,customer:$('customer').value,
    tick:$('tick').checked,rate:$('rate').value,businessDate:$('businessDate').value,
    duplicateConfirmed:false,confirmMissingDaN:false});
   const view=QuytCutAudit.derive(verified,next?.keys||[]);
   base=verified;
   const removed=new Set(next?.keys||[]);
   for(const row of verified.rows){
    const id=QuytCutAudit.key(row),gone=removed.has(id);
    const item=document.createElement('div');item.className='cut-audit-row'+(gone?' cut-done':'');
    const label=document.createElement('label'),input=document.createElement('input'),title=document.createElement('span');
    input.type='checkbox';input.className='cut-row-check';input.value=id;input.disabled=gone;
    input.addEventListener('change',()=>cutBtn.disabled=blocked||!base||copyStarted||
      !items.querySelector('.cut-row-check:checked'));
    title.textContent=(gone?'ĐÃ CẮT • ':'')+(row.station?row.station+' / ':'')+row.number.replace('-',' ')+
      ' '+row.kind.toUpperCase()+' '+row.adjusted+'n'+(row.factorApplied?' (đã nhân)':' (giữ nguyên)');
    label.append(input,title);item.append(label);
    for(const source of row.sources){
     const detail=document.createElement('div');detail.className='cut-source-line';
     detail.textContent='Dòng nguồn '+source.line+(source.time?' • giờ Telegram '+source.time:' • không có giờ Telegram')+
      ' • gốc '+source.money+'n\n'+source.text;
     item.append(detail);
    }
    items.append(item);
   }
   const orig=BigInt(view.baseTotal),remaining=BigInt(view.total),cut=BigInt(view.cutTotal);
   if(orig!==remaining+cut)throw Error('HOLD_CUT_RECONCILIATION_MISMATCH');
   receipt.textContent='Tổng đã gộp ban đầu '+view.baseTotal+'n • Đã Cắt '+view.cutCount+
    ' dòng ('+view.cutTotal+'n) • Còn '+view.total+'n. Nguồn không bị sửa.';
   reconcile.textContent='ĐỐI CHIẾU TỨC THỜI Ô NHẬP: '+verified.sourceCount+' dòng tin, '+
    verified.rows.length+' nhóm tiền; mỗi nhóm có dòng nguồn/giờ (nếu có). KHÔNG đồng bộ trực tiếp Telegram.';
   undoBtn.disabled=!next?.undo.length;
   if(next?.everCut)showRemaining(view);
  }catch(e){
   blocked=true;items.replaceChildren();cutBtn.disabled=true;
   receipt.textContent='HOLD_CUT_RECONCILE: '+String(e.message||e);
   if(next?.everCut)emptyOutput('HOLD_CUT_RECONCILE: '+String(e.message||e));
  }
 }
 const watch=['raw','customer','market','businessDate','rate','tick'];
 watch.forEach(id=>$(id).addEventListener(['customer','market','businessDate','tick'].includes(id)?'change':'input',refresh));
 $('checkMerge').addEventListener('click',refresh);
 $('confirmDuplicates').addEventListener('click',refresh);
 $('confirmMissingDaN').addEventListener('click',refresh);
 document.addEventListener('click',e=>{
  const target=e.target.closest?.('button');
  if(!target)return;
  if(copyIds.has(target.id)||target.classList.contains('section-copy')){
   if(state?.everCut){
    e.preventDefault();e.stopImmediatePropagation();stopCopies();
    receipt.textContent='HOLD_CUT_REPLAY: sổ đã Cắt, không COPY hoặc GỬI.';
    return;
   }
   if(!target.disabled)copyStarted=true;
  }
 },true);
 document.addEventListener('change',()=>{if(state?.everCut)stopCopies()});
 cutBtn.addEventListener('click',()=>{
  if(blocked||!base||copyStarted||state?.scope!==undefined&&state.scope!==scope()){
   receipt.textContent='HOLD_CUT_STALE_SOURCE_OR_PRIOR_COPY';cutBtn.disabled=true;return;
  }
  const chosen=[...items.querySelectorAll('.cut-row-check:checked')].map(x=>x.value);
  if(!chosen.length)return;
  if(!confirm('Cắt '+chosen.length+' dòng CHỈ KHỎI BẢN GỘP XEM TRƯỚC? Tin gốc và Telegram giữ nguyên, không gửi cược.'))return;
  try{
   const keys=[...(state?.keys||[]),...chosen],undo=[...(state?.undo||[]),[...(state?.keys||[])]];
   if(undo.length>30)throw Error('HOLD_CUT_UNDO_LIMIT');
   QuytCutAudit.derive(base,keys);
   const record={scope:scope(),keys,undo,everCut:true};
   save(record);state=record;refresh();
  }catch(e){blocked=true;emptyOutput('HOLD_CUT_SAVE: '+String(e.message||e))}
 });
 undoBtn.addEventListener('click',()=>{
  if(blocked||!base||!state?.undo.length||state.scope!==scope()){receipt.textContent='HOLD_CUT_UNDO_STALE';return}
  try{
   const undo=state.undo.slice(),keys=undo.pop();
   QuytCutAudit.derive(base,keys);
   const next={...state,keys,undo,everCut:true};
   save(next);state=next;refresh();
  }catch(e){blocked=true;emptyOutput('HOLD_CUT_UNDO: '+String(e.message||e))}
 });
 newBtn.addEventListener('click',()=>{
  if(!confirm('Lượt trước đã Cắt. Đã đối soát và chắc chắn đây là lượt MỚI không gửi trùng? Xóa sổ Cắt cũ của tab?'))return;
  try{sessionStorage.removeItem(QuytCutAudit.storageKey);
   if(sessionStorage.getItem(QuytCutAudit.storageKey)!==null)throw Error('UNCONFIRMED');
   state=null;copyStarted=false;refresh();
  }catch(_){blocked=true;emptyOutput('HOLD_CUT_RESET_FAILED')}
 });
 refresh();
})();
