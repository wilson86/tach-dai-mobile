'use strict';
// Quýt money preview: one Cut action per whole result bucket, no duplicated raw input.
// All amounts are derived from canonical OfflineKTS.merge source IDs + rounded rows.
const QuytLiveCutUI=(()=>{
 const KEY='KTS_QUYT_MAIN_V4_SOURCE_CUT_V1';
 const emptyArchive=()=>({text:'',ids:[]});
 const emptyArchives=()=>({scaled:emptyArchive(),unscaled:emptyArchive()});
 const $=id=>document.getElementById(id);
 const vi=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/gu,'.')+'n';
 let rerender=null,base=null,view=null,currentOptions=null,currentScope=null,available=null;
 function scope(raw,o){return JSON.stringify([raw,o.customer,o.market,o.businessDate,o.tick,o.rate,o.duplicateConfirmed,o.confirmMissingDaN])}
 function actualScope(){
  const o=currentOptions;if(!o)return '';
  return scope($('raw').value,{...o,customer:$('customer').value,market:$('market').value,
   businessDate:$('businessDate').value,tick:$('tick').checked,rate:$('rate').value});
 }
 function load(){
  let t;try{t=sessionStorage.getItem(KEY)}catch(_){throw Error('HOLD_CUT_STORAGE_UNAVAILABLE')}
  if(!t)return {scope:null,keys:[],undo:[],archives:emptyArchives()};
  let r;try{r=JSON.parse(t)}catch(_){throw Error('HOLD_CUT_STORAGE_CORRUPT')}
  if(!r||typeof r.scope!=='string'||!Array.isArray(r.keys)||r.keys.length>1000||
    new Set(r.keys).size!==r.keys.length||!Array.isArray(r.undo)||r.undo.length>30||
    r.undo.some(x=>!Array.isArray(x)||x.length>1000||new Set(x).size!==x.length))
   throw Error('HOLD_CUT_STORAGE_CORRUPT');
  if(!r.archives)r.archives=emptyArchives(); // compatible with earlier Cut ledgers
  for(const name of ['scaled','unscaled']){
   const a=r.archives[name];
   if(!a||typeof a.text!=='string'||a.text.length>60000||!Array.isArray(a.ids)||
      a.ids.length>1000||new Set(a.ids).size!==a.ids.length||
      a.ids.some(id=>typeof id!=='string')||(a.text&&!a.ids.length))
    throw Error('HOLD_CUT_ARCHIVE_CORRUPT');
  }
  return r;
 }
 function save(r){
  try{
   if(r.keys.length){
    const t=JSON.stringify(r);sessionStorage.setItem(KEY,t);
    if(sessionStorage.getItem(KEY)!==t)throw Error('WRITE_FAILED');
   }else{
    sessionStorage.removeItem(KEY);
    if(sessionStorage.getItem(KEY)!==null)throw Error('REMOVE_FAILED');
   }
  }catch(_){throw Error('HOLD_CUT_STORAGE_WRITE_FAILED')}
 }
 function reset(){
  base=null;view=null;currentOptions=null;currentScope=null;available=null;
  $('undoQuytCut').disabled=true;$('startNewQuytBatch').hidden=true;
  $('cutStatus').textContent='CẮT TOÀN BỘ từng khung sau khi gộp. Tin nguồn phía trên không bị sửa.';
  $('cutConservation').textContent='Chưa có kết quả đối chiếu.';
  for(const name of ['Scaled','Unscaled']){
   $('cutSelected'+name).disabled=true;
   $('cutArchive'+name).hidden=true;$('cutSaved'+name).value='';$('copySaved'+name).disabled=true;
   const bucket=name.toLowerCase();
   for(const part of ['Before','Removed','After'])$(bucket+'Cut'+part).textContent='—';
  }
 }
 function problem(error){
  available=null;
  $('cutSelectedScaled').disabled=true;$('cutSelectedUnscaled').disabled=true;
  $('undoQuytCut').disabled=true;$('startNewQuytBatch').hidden=false;
  for(const name of ['Scaled','Unscaled']){
   $('cutArchive'+name).hidden=true;$('cutSaved'+name).value='';$('copySaved'+name).disabled=true;
  }
  $('cutStatus').textContent=String(error);
  $('cutConservation').textContent='HOLD: hai khung bị xóa. Khôi phục nguồn cũ hoặc xác nhận lượt mới.';
 }
 function byBucket(rows,sourceIds){
  const linked=new Map(),totals={scaled:0n,unscaled:0n};
  for(const row of rows){
   if(!row||typeof row.factorApplied!=='boolean'||typeof row.adjusted!=='string'||
     !/^\d+$/u.test(row.adjusted)||!Array.isArray(row.sourceIds)||!row.sourceIds.length)
    throw Error('HOLD_CUT_BUCKET_INVALID_ROW');
   const k=row.factorApplied?'scaled':'unscaled';
   totals[k]+=BigInt(row.adjusted);
   for(const id of row.sourceIds){
    if(!sourceIds.has(id))throw Error('HOLD_CUT_BUCKET_UNKNOWN_SOURCE');
    const prior=linked.get(id);
    if(prior&&prior!==k)throw Error('HOLD_CUT_BUCKET_AMBIGUOUS_SOURCE');
    linked.set(id,k);
   }
  }
  return {linked,totals};
 }
 function drawBuckets(v,removed){
  const known=new Set(v.base.sourceEntries.map(x=>x.id));
  const before=byBucket(v.base.rows,known),after=byBucket(v.remaining.rows,known);
  if(before.linked.size!==known.size||
    before.totals.scaled+before.totals.unscaled!==BigInt(v.before)||
    after.totals.scaled+after.totals.unscaled!==BigInt(v.after))
    throw Error('HOLD_CUT_BUCKET_CONSERVATION');
  const eligible={scaled:[],unscaled:[]};
  for(const entry of v.base.sourceEntries){
   const group=before.linked.get(entry.id);
   if(!group)throw Error('HOLD_CUT_BUCKET_MISSING_SOURCE');
   if(removed.has(entry.id)){
    if(after.linked.has(entry.id))throw Error('HOLD_CUT_BUCKET_STALE');
   }else{
    if(after.linked.get(entry.id)!==group)throw Error('HOLD_CUT_BUCKET_CHANGED');
    eligible[group].push(entry.id);
   }
  }
  for(const group of ['scaled','unscaled']){
   const name=group==='scaled'?'Scaled':'Unscaled';
   const start=before.totals[group],end=after.totals[group],taken=start-end;
   if(taken<0n||end+taken!==start)throw Error('HOLD_CUT_BUCKET_NEGATIVE');
   $(group+'CutBefore').textContent=vi(start);
   $(group+'CutRemoved').textContent=vi(taken);
   $(group+'CutAfter').textContent=vi(end);
   $('cutSelected'+name).disabled=!eligible[group].length;
  }
  return eligible;
 }

 function ticketFromRows(rows,group){
  return rows.filter(x=>Boolean(x.factorApplied)===(group==='scaled'))
   .map(x=>(x.station?x.station+' ':'')+x.number.replace('-',' ')+' '+x.kind+x.adjusted+'n.').join('\n');
 }
 function renderArchive(record){
  for(const group of ['scaled','unscaled']){
   const name=group==='scaled'?'Scaled':'Unscaled';
   const a=record.archives[group],present=Boolean(a.text);
   $('cutArchive'+name).hidden=!present;
   $('cutSaved'+name).value=present?a.text:'';
   // Only archived, source-verified Cut tickets may be copied; ordinary factorized output remains HOLD.
   $('copySaved'+name).disabled=!present;
  }
 }
 function writeClipboard(text,selectField){
  if(!text)return Promise.reject(Error('HOLD_CUT_COPY_EMPTY'));
  const fallback=()=>{
   const el=$(selectField);el.focus();el.select();
   let ok=false;try{ok=Boolean(document.execCommand('copy'))}catch(_){}
   if(!ok)throw Error('HOLD_CLIPBOARD_UNAVAILABLE');
  };
  if(navigator.clipboard&&typeof navigator.clipboard.writeText==='function')
   return navigator.clipboard.writeText(text).catch(()=>fallback());
  try{fallback();return Promise.resolve()}catch(e){return Promise.reject(e)}
 }
 function copyArchive(group){
  const originalView=view,scoped=currentScope,field=group==='scaled'?'cutSavedScaled':'cutSavedUnscaled';
  try{
   if(!['scaled','unscaled'].includes(group))throw Error('HOLD_CUT_COPY_INVALID_BUCKET');
   if(!originalView||!base||!scoped||scoped!==actualScope())throw Error('HOLD_CUT_COPY_STALE_SOURCE');
   const r=load(),archive=r.archives[group];
   if(r.scope!==scoped||!archive.text||!archive.ids.length||
      !archive.ids.every(id=>r.keys.includes(id))||
      $(field).value!==archive.text)
    throw Error('HOLD_CUT_COPY_INVALID_ARCHIVE');
   // Recreate the exact PRE-CUT bucket using the immutable source before
   // allowing clipboard export. Never trust a stale/tampered saved text alone.
   const restoredIds=r.keys.filter(id=>!archive.ids.includes(id));
   const prior=QuytSourceCutLedger.calculate(base,$('raw').value,currentOptions,restoredIds);
   if(ticketFromRows(prior.remaining.rows,group)!==archive.text)
    throw Error('HOLD_CUT_COPY_ARCHIVE_MONEY_MISMATCH');
   return writeClipboard(archive.text,field).then(()=>{
    if(view!==originalView||currentScope!==scoped||actualScope()!==scoped)
     throw Error('HOLD_CUT_COPY_STALE_AFTER_ASYNC');
    $('cutStatus').textContent=group==='scaled'
     ?'ĐÃ SAO CHÉP bản CẮT ×1.067 vào bộ nhớ tạm — CHƯA NGHIỆM THU ROUTER, không tự gửi.'
     :'ĐÃ SAO CHÉP bản CẮT giữ nguyên vào bộ nhớ tạm. Không tự gửi.';
   }).catch(e=>{
    $('cutStatus').textContent='HOLD_CLIPBOARD: '+String(e.message||e)+'. Tin CẮT vẫn được lưu trong ô để chọn/sao chép thủ công.';
   });
  }catch(e){
   $('cutStatus').textContent='HOLD_CLIPBOARD: '+String(e.message||e)+'. Không sao chép tin chưa đối soát.';
   return Promise.resolve();
  }
 }
 function draw(v,record){
  const removed=new Set(v.removed);
  available=drawBuckets(v,removed);
  renderArchive(record);
  $('cutConservation').textContent='BẢO TOÀN TIỀN: '+v.before+' = '+v.cutOutput+' + '+v.after+
   ' (tiền sau nhân); '+v.originalBefore+' = '+v.cutOriginal+' + '+v.originalAfter+
   ' (tiền gốc). Chênh lệch 0n.';
  $('cutStatus').textContent='Đã CẮT '+removed.size+'/'+v.base.sourceEntries.length+
   ' cược nguồn. Mỗi nút CẮT xóa toàn bộ cược còn lại trong đúng khung đó. Tin gốc không đổi.';
  $('undoQuytCut').disabled=!record.undo.length;
 }
 function review(engine,raw,opts){
  const baseline=engine.merge(raw,opts),record=load(),scoped=scope(raw,opts);
  if(record.scope&&record.scope!==scoped){
   problem('HOLD_CUT_SOURCE_CHANGED: nguồn/khách/miền/ngày/hệ số đã đổi.');
   throw Error('HOLD_CUT_SOURCE_CHANGED');
  }
  let result;
  try{result=QuytSourceCutLedger.calculate(baseline,raw,opts,record.keys)}
  catch(e){problem('HOLD: '+String(e.message||e));throw e}
  base=baseline;view=result;currentOptions={...opts};currentScope=scoped;
  try{draw(result,record)}catch(e){problem('HOLD: '+String(e.message||e));throw e}
  return result.remaining;
 }
 function cut(ids,archive){
  try{
   if(!base||!view||currentScope!==actualScope())throw Error('HOLD_CUT_STALE_SOURCE');
   const record=load();
   if(record.scope&&record.scope!==currentScope)throw Error('HOLD_CUT_SCOPE_CHANGED');
   const keys=new Set(record.keys);
   if(!ids.length||ids.some(id=>keys.has(id)))throw Error('HOLD_CUT_DUPLICATE');
   ids.forEach(id=>keys.add(id));
   QuytSourceCutLedger.calculate(base,$('raw').value,currentOptions,keys);
   const archives={...record.archives};
   if(archive){
    if(!['scaled','unscaled'].includes(archive.group)||typeof archive.text!=='string'||
       !archive.text||archive.text.length>60000||!archive.ids.length||
       archive.ids.some(x=>!ids.includes(x)))throw Error('HOLD_CUT_ARCHIVE_INVALID');
    archives[archive.group]={text:archive.text,ids:archive.ids.slice()};
   }
   save({scope:currentScope,keys:[...keys],undo:[...record.undo,record.keys.slice()].slice(-30),archives});
   rerender();
   return true;
  }catch(e){
   $('cutStatus').textContent='HOLD: '+String(e.message||e)+' — không CẮT thêm.';
   return false;
  }
 }
 function cutWholeBucket(name){
  const group=name==='Scaled'?'scaled':'unscaled';
  if(!available||!Array.isArray(available[group])){problem('HOLD_CUT_BUCKET_NOT_READY');return}
  const ids=available[group].slice(),text=ticketFromRows(view.remaining.rows,group);
  const field=group==='scaled'?'scaledTicket':'unscaledTicket';
  if(!ids.length||!text||$(field).value!==text){$('cutStatus').textContent='HOLD_CUT_TICKET_MISMATCH: không cắt vì tin xuất chưa khớp cược nguồn.';return}
  const successful=cut(ids,{group,text,ids});
  // Owner-requested clipboard export is only for the CUT archive, not the ordinary result or automatic send.
  if(successful)copyArchive(group);
 }
 function undo(){
  try{
   if(!base||!view||currentScope!==actualScope())throw Error('HOLD_CUT_STALE_SOURCE');
   const r=load();
   if(r.scope!==currentScope||!r.undo.length)throw Error('HOLD_CUT_NO_UNDO');
   const undo=r.undo.slice(),prior=undo.pop();
   QuytSourceCutLedger.calculate(base,$('raw').value,currentOptions,prior);
   const archives={...r.archives};
   for(const group of ['scaled','unscaled']){
    if(!archives[group].ids.every(id=>prior.includes(id)))archives[group]=emptyArchive();
   }
   save({scope:currentScope,keys:prior,undo,archives});rerender();
  }catch(e){$('cutStatus').textContent='HOLD: hoàn tác không thành công: '+String(e.message||e)}
 }
 function init(callback){
  rerender=callback;
  $('cutSelectedScaled').addEventListener('click',()=>cutWholeBucket('Scaled'));
  $('cutSelectedUnscaled').addEventListener('click',()=>cutWholeBucket('Unscaled'));
  $('undoQuytCut').addEventListener('click',undo);
  $('copySavedUnscaled').addEventListener('click',()=>copyArchive('unscaled'));
  $('copySavedScaled').addEventListener('click',()=>copyArchive('scaled'));
  $('startNewQuytBatch').addEventListener('click',()=>{
   if(!confirm('Đã đối chiếu sổ CẮT cũ và xác nhận BẮT ĐẦU LƯỢT MỚI? Không gửi cược.'))return;
   try{save({keys:[],undo:[]});rerender()}
   catch(e){$('cutStatus').textContent='HOLD: '+String(e.message||e)}
  });
 }
 return Object.freeze({version:'QUYT_CUT_FULLBOX_20261113_03',init,reset,review,problem});
})();
