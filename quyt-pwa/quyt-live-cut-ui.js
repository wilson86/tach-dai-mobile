'use strict';
// WILSON86 Quyt V4 source Cut/Undo UI. Synthetic-review only; never sends/copies.
// Reuses canonical OfflineKTS.merge and the source-bound QuytSourceCutLedger.
const QuytLiveCutUI=(()=>{
 const KEY='KTS_QUYT_MAIN_V4_SOURCE_CUT_V1';
 const $=id=>document.getElementById(id);
 let rerender=null,base=null,view=null,currentOptions=null,currentScope=null;
 const vi=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/gu,'.')+'n';
 function scope(raw,o){return JSON.stringify([raw,o.customer,o.market,o.businessDate,o.tick,o.rate,o.duplicateConfirmed,o.confirmMissingDaN])}
 function actualScope(){const o=currentOptions;if(!o)return '';
  return scope($('raw').value,{...o,customer:$('customer').value,market:$('market').value,
   businessDate:$('businessDate').value,tick:$('tick').checked,rate:$('rate').value})}
 function load(){
  let text;
  try{text=sessionStorage.getItem(KEY)}catch(_){throw Error('HOLD_CUT_STORAGE_UNAVAILABLE')}
  if(!text)return {scope:null,keys:[],undo:[]};
  let r;
  try{r=JSON.parse(text)}catch(_){throw Error('HOLD_CUT_STORAGE_CORRUPT')}
  if(!r||typeof r.scope!=='string'||!Array.isArray(r.keys)||r.keys.length>1000||
     new Set(r.keys).size!==r.keys.length||!Array.isArray(r.undo)||r.undo.length>30||
     r.undo.some(x=>!Array.isArray(x)||x.length>1000||new Set(x).size!==x.length))
   throw Error('HOLD_CUT_STORAGE_CORRUPT');
  return r;
 }
 function save(r){
  try{
   if(r.keys.length){const text=JSON.stringify(r);sessionStorage.setItem(KEY,text);
    if(sessionStorage.getItem(KEY)!==text)throw Error('WRITE_FAILED');
   }else{sessionStorage.removeItem(KEY);
    if(sessionStorage.getItem(KEY)!==null)throw Error('REMOVE_FAILED');
   }
  }catch(_){throw Error('HOLD_CUT_STORAGE_WRITE_FAILED')}
 }
 function reset(){
  base=null;view=null;currentOptions=null;currentScope=null;
  $('sourceCutCard').hidden=true;$('startNewQuytBatch').hidden=true;
  $('undoQuytCut').disabled=true;
  for(const id of ['cutBefore','cutRemoved','cutAfter','cutOriginalBefore','cutOriginalRemoved','cutOriginalAfter'])$(id).textContent='—';
  $('cutSourceList').replaceChildren();$('cutBetList').replaceChildren();
  $('cutRemovedList').textContent='';$('cutStatus').textContent='Chưa cắt.';
  $('cutConservation').textContent='Chưa đối chiếu.';
 }
 function problem(error){
  $('sourceCutCard').hidden=false;$('startNewQuytBatch').hidden=false;
  $('cutStatus').textContent=String(error);
  $('cutConservation').textContent='HOLD: hai khung bị xóa, không được dùng tiền cũ. Khôi phục đúng nguồn hoặc xác nhận lượt mới.';
 }
 function row(parent,label,description,actionText,disabled,callback,removed){
  const el=document.createElement('div');el.className='cut-row'+(removed?' cut-done':'');
  const strong=document.createElement('strong');strong.textContent=label;
  const p=document.createElement('p');p.textContent=description;
  const button=document.createElement('button');button.type='button';
  button.textContent=actionText;button.disabled=disabled;
  button.addEventListener('click',callback);
  el.append(strong,p,button);parent.append(el);
 }
 function draw(v,record){
  const removed=new Set(v.removed);
  $('sourceCutCard').hidden=false;
  for(const [id,value] of Object.entries({
   cutBefore:v.before,cutRemoved:v.cutOutput,cutAfter:v.after,
   cutOriginalBefore:v.originalBefore,cutOriginalRemoved:v.cutOriginal,cutOriginalAfter:v.originalAfter
  }))$(id).textContent=vi(value);
  $('cutConservation').textContent='BẢO TOÀN TIỀN: '+v.before+' = '+v.cutOutput+' + '+v.after+
   ' (tiền xuất); '+v.originalBefore+' = '+v.cutOriginal+' + '+v.originalAfter+' (tiền gốc). Chênh lệch 0n.';
  $('cutStatus').textContent='Đã CẮT '+removed.size+'/'+v.base.sourceEntries.length+' khoản nguồn. CẮT chỉ sửa bản xem trước, không Copy hoặc gửi.';
  $('undoQuytCut').disabled=!record.undo.length;
  const lines=new Map();
  for(const x of v.base.sourceEntries){if(!lines.has(x.line))lines.set(x.line,[]);lines.get(x.line).push(x)}
  for(const [line,entries] of lines){
   const allowed=entries.filter(x=>!removed.has(x.id)).map(x=>x.id);
   row($('cutSourceList'),'TIN NGUỒN — DÒNG '+line,entries[0].text,
    allowed.length?'CẮT TIN DÒNG '+line:'ĐÃ CẮT CẢ DÒNG',!allowed.length,()=>cut(allowed),!allowed.length);
  }
  for(const x of v.base.sourceEntries){
   const gone=removed.has(x.id);
   row($('cutBetList'),'CƯỢC DÒNG '+x.line,
    x.number.replace('-',' ')+' '+x.kind+' '+x.stake+'n · đài '+(x.stations.filter(Boolean).join(', ')||'MB'),
    gone?'ĐÃ CẮT':'CẮT CƯỢC NÀY',gone,()=>cut([x.id]),gone);
  }
  $('cutRemovedList').textContent=v.base.sourceEntries.filter(x=>removed.has(x.id))
   .map(x=>'Dòng '+x.line+': '+x.number.replace('-',' ')+' '+x.kind+' '+x.stake+'n').join('\n')||'Chưa cắt cược.';
 }
 function review(engine,raw,opts){
  const b=engine.merge(raw,opts),r=load(),scoped=scope(raw,opts);
  if(r.scope&&r.scope!==scoped){problem('HOLD_CUT_SOURCE_CHANGED: nguồn/khách/miền/ngày/hệ số đã đổi.');throw Error('HOLD_CUT_SOURCE_CHANGED')}
  let v;
  try{v=QuytSourceCutLedger.calculate(b,raw,opts,r.keys)}
  catch(e){problem('HOLD: '+String(e.message||e));throw e}
  base=b;view=v;currentOptions={...opts};currentScope=scoped;draw(v,r);
  return v.remaining;
 }
 function cut(ids){
  try{
   if(!base||!view||currentScope!==actualScope())throw Error('HOLD_CUT_STALE_SOURCE');
   const r=load();if(r.scope&&r.scope!==currentScope)throw Error('HOLD_CUT_SCOPE_CHANGED');
   const keys=new Set(r.keys);
   if(!ids.length||ids.some(id=>keys.has(id)))throw Error('HOLD_CUT_DUPLICATE');
   ids.forEach(id=>keys.add(id));
   QuytSourceCutLedger.calculate(base,$('raw').value,currentOptions,keys);
   save({scope:currentScope,keys:[...keys],undo:[...r.undo,r.keys.slice()].slice(-30)});
   rerender();
  }catch(e){$('cutStatus').textContent='HOLD: '+String(e.message||e)+' — chưa cắt thêm.'}
 }
 function undo(){
  try{
   if(!base||!view||currentScope!==actualScope())throw Error('HOLD_CUT_STALE_SOURCE');
   const r=load();if(r.scope!==currentScope||!r.undo.length)throw Error('HOLD_CUT_NO_UNDO');
   const history=r.undo.slice(),prior=history.pop();
   QuytSourceCutLedger.calculate(base,$('raw').value,currentOptions,prior);
   save({scope:currentScope,keys:prior,undo:history});rerender();
  }catch(e){$('cutStatus').textContent='HOLD: hoàn tác không thành công: '+String(e.message||e)}
 }
 function init(callback){
  rerender=callback;
  $('undoQuytCut').addEventListener('click',undo);
  $('startNewQuytBatch').addEventListener('click',()=>{
   if(!confirm('Đã đối chiếu sổ CẮT cũ và xác nhận BẮT ĐẦU LƯỢT MỚI? Cược chưa tự gửi.'))return;
   try{save({keys:[],undo:[]});rerender()}
   catch(e){$('cutStatus').textContent='HOLD: '+String(e.message||e)}
  });
 }
 return Object.freeze({init,reset,review,problem});
})();