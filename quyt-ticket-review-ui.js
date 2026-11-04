/* Issue18 Quýt merge presentation: source review/clipboard only, never Router/Telegram. */
(function(){
'use strict';
function install(){
 const input=document.getElementById('dvInput')||document.getElementById('input');
 const output=document.getElementById('dvOutput')||document.getElementById('output');
 const engine=window.KTSQuytTicketReview,clean=window.KTSCleanAggregate,rateCore=window.KTSQuytBaoReview;
 if(!input||!output||!engine||!clean||!rateCore||document.getElementById('ktsTicketMergePanel'))return;
 const panel=document.createElement('section');panel.id='ktsTicketMergePanel';
 panel.style.cssText='padding:10px;margin:8px 0;border:2px solid #32888a;border-radius:9px;background:#f3faf9;color:#123';
 const title=document.createElement('strong');title.textContent='GỘP CÁC TIN KHÁCH — TIỀN GỐC / QUÝT';
 const label=document.createElement('label');label.style.cssText='display:flex;gap:8px;align-items:center;margin:8px 0';
 const check=document.createElement('input');check.type='checkbox';check.id='ktsQuytTicketTick';check.checked=false;
 const caption=document.createElement('span');caption.textContent='Quýt — nhân BAO/LÔ khi tích';label.append(check,caption);
 const preview=document.createElement('textarea');preview.id='ktsQuytTicketResult';preview.readOnly=true;
 preview.setAttribute('aria-label','Tin khách đã gộp đúng tiền theo trạng thái Quýt');
 preview.style.cssText='width:100%;min-height:220px;box-sizing:border-box;white-space:pre-wrap;color:#123;background:#fff';
 const status=document.createElement('div');status.id='ktsQuytTicketStatus';status.setAttribute('role','status');
 status.style.cssText='white-space:pre-wrap;font-size:13px;margin:7px 0';
 const copy=document.createElement('button');copy.type='button';copy.id='ktsQuytTicketCopy';copy.textContent='COPY TIN GỘP (CHỈ VĂN BẢN)';
 copy.disabled=true;copy.style.cssText='padding:9px;border:1px solid #357;background:#d3f1ef;border-radius:6px';
 const help=document.createElement('div');help.style.cssText='font-size:12px;margin-top:5px';
 help.textContent='Mỗi tin độc lập đặt trên một dòng bắt đầu HN, hoặc dùng THÊM TIN GỐC có source_message_id. Bản này chỉ copy văn bản; KHÔNG xác nhận Router/Telegram hỗ trợ tiền thập phân, không tự gửi hoặc Cắt.';
 panel.append(title,label,preview,status,copy,help);output.insertAdjacentElement('afterend',panel);
 const scope=()=>({
  market:(document.getElementById('region')||document.getElementById('sharedRegion'))?.value||'',
  businessDate:(document.getElementById('date')||document.getElementById('sharedDate'))?.value||'',
  customerId:document.getElementById('ktsReviewCustomer')?.value||'',
  rate:document.getElementById('ktsQuytRate')?.value||'1.067',
  optIn:document.getElementById('ktsCustomerRateToggle')?.checked===true
 });
 let receipt=null;
 function signature(){const s=scope();return JSON.stringify([input.value,s.market,s.businessDate,s.customerId,s.rate,s.optIn,check.checked])}
 function sources(s){
  const raw=input.value;
  if(!raw.trim()||raw.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]'))throw Error('NO_OR_LEDGER_SOURCE_HOLD');
  const lines=raw.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean);
  if(lines.length>100)throw Error('MESSAGE_LIMIT_HOLD');
  if(lines.length>1&&!lines.every(x=>/^hn\s/iu.test(x)))throw Error('MULTILINE_SOURCE_IDS_REQUIRED_HOLD');
  // Local paste line IDs represent explicit one-line messages, never invented Telegram IDs.
  return lines.map((original_text,index)=>({
   source_message_id:'paste-line-'+(index+1),original_text,customer_id:s.customerId,market:s.market,business_date:s.businessDate
  }));
 }
 function render(){
  receipt=null;preview.value='';copy.disabled=true;
  const s=scope();
  if(!s.optIn||!s.customerId){check.checked=false;check.disabled=true;status.textContent='Chọn Khách & tỷ lệ và khách trong dropdown để gộp tin.';return}
  check.disabled=s.customerId!=='quyt';
  if(s.customerId!=='quyt'&&check.checked)check.checked=false;
  if(!input.value.trim()){status.textContent='Chưa có tin nguồn để gộp.';return}
  try{
   const result=engine.ticket(sources(s),{
    cleanCore:clean,rateParser:rateCore.parseRate,
    customerId:s.customerId,market:s.market,businessDate:s.businessDate,
    multiply:check.checked,rate:s.rate
   });
   const stamp=signature();
   receipt={stamp,formatted:result.formatted};
   preview.value=result.formatted;copy.disabled=false;
   status.textContent='GỘP '+result.sourceCount+' tin | tiền gốc '+result.totalOriginal+'n | tiền theo checkbox '+result.totalExact+
     'n | BAO/LÔ '+result.adjustedTotals.bao_lo+'n. REVIEW_ONLY; không tự chuyển chủ; số thập phân phải được tuyến nhận xác nhận.';
  }catch(e){status.textContent='HOLD: '+String(e?.message||e)}
 }
 async function copyText(){
  const current=receipt;
  if(!current||current.stamp!==signature()||preview.value!==current.formatted){
   receipt=null;copy.disabled=true;status.textContent='HOLD: nguồn, khách, miền, ngày hoặc hệ số đã đổi; không copy bản cũ.';return;
  }
  try{
   await window.navigator.clipboard.writeText(current.formatted);
   status.textContent='ĐÃ COPY VĂN BẢN đối chiếu theo checkbox; KHÔNG gửi Router/Telegram. Nếu tuyến nhận không hỗ trợ số thập phân, KHÔNG dùng bản này để chuyển cược.';
  }catch(e){status.textContent='HOLD: Clipboard không khả dụng — '+String(e?.message||e)}
 }
 check.addEventListener('change',render);copy.addEventListener('click',copyText);
 input.addEventListener('input',render);
 for(const id of ['ktsQuytRate','ktsReviewCustomer','ktsCustomerRateToggle','region','sharedRegion','date','sharedDate','today']){
  const e=document.getElementById(id);
  if(e)e.addEventListener(id==='ktsQuytRate'?'input':'change',()=>{if(id==='region'||id==='sharedRegion'||id==='date'||id==='sharedDate')check.checked=false;render()});
 }
 for(const id of ['undoBtn','clearBtn','cutBtn','sourceCutBtn','dvClear','dvCutSelection','dvSourceCut','runBtn','dvRun']){
  const button=document.getElementById(id);if(button)button.addEventListener('click',()=>setTimeout(render,0));
 }
 window.addEventListener('pageshow',render);
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
