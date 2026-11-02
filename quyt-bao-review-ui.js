/* KTS optional Quýt selector for outgoing review only.
 * Check Quýt in the chat box, inspect ceiling-adjusted result and use
 * dedicated copy. Never alter raw source, canonical parser, Cut ledger, or send.
 * A new page load resets Quýt to OFF; same-origin Unified iframes share tab state.
 */
(function(){
"use strict";
function install(){
 const input=document.getElementById("dvInput")||document.getElementById("input");
 const output=document.getElementById("dvOutput")||document.getElementById("output");
 const core=window.KTSQuytBaoReview;
 // This remains a review-only preview until Router supplies a once-only receipt.
 const ROUTER_ONCE_ONLY_RECEIPT_VERIFIED=false;
 if(!input||!output||!core||document.getElementById("ktsQuytCheckbox"))return;
 const ownTop=(()=>{try{return window.top?.location.origin===location.origin?window.top:window}catch(_){return window}})();
 const label=document.createElement("label");
 label.style.cssText="display:flex;align-items:center;gap:8px;padding:8px;background:#fff3d8;border:1px solid #e2a74f;border-radius:8px;margin:7px 0;color:#242020";
 const check=document.createElement("input");check.type="checkbox";check.id="ktsQuytCheckbox";
 const caption=document.createElement("span");caption.textContent="Quýt (dán tin trước rồi tích chọn) — chỉnh hệ số bao lô";
 label.append(check,caption);input.insertAdjacentElement("afterend",label);
 const rateWrap=document.createElement("label");rateWrap.style.cssText="display:flex;align-items:center;gap:8px;padding:7px;margin:4px 0;color:#182033";
 rateWrap.textContent="Hệ số bao ×";
 const rate=document.createElement("input");
 rate.id="ktsQuytRate";rate.type="text";rate.inputMode="decimal";rate.autocomplete="off";
 rate.value="1,067";rate.maxLength=6;
 rate.style.cssText="font:inherit;width:110px;max-width:45%;padding:7px;border:1px solid #c5a15b;border-radius:6px;color:#182033;background:white";
 rate.setAttribute("aria-label","Hệ số bao lô của Quýt, mặc định 1 phẩy 067");
 rateWrap.append(rate);label.insertAdjacentElement("afterend",rateWrap);
 const panel=document.createElement("section");panel.id="ktsQuytPreparedPanel";
 panel.style.cssText="border:1px solid #d4ac4a;border-radius:9px;background:#fff8e8;padding:9px;margin-top:8px";
 panel.hidden=true;
 const title=document.createElement("strong");title.textContent="KẾT QUẢ QUÝT CHUẨN BỊ CHUYỂN — CHỈ XEM TRƯỚC";
 const status=document.createElement("div");status.setAttribute("role","status");status.style.cssText="white-space:pre-wrap;font-size:12px;margin:7px 0";
 const review=document.createElement("textarea");review.readOnly=true;review.spellcheck=false;
 review.setAttribute("aria-label","Kết quả Quýt theo hệ số đã chọn để đối chiếu");
 review.style.cssText="width:100%;min-height:100px;box-sizing:border-box;color:#242020;background:white";
 const keep=document.createElement("button");keep.type="button";
 keep.textContent="Xác nhận khách đánh thêm — GIỮ ĐỦ các lượt";
 keep.hidden=true;keep.style.cssText="padding:9px;border:1px solid #ae871b;background:#fff7d2;margin:6px 0";
 const copy=document.createElement("button");copy.type="button";copy.textContent="Copy Quýt bị khóa — chờ xác minh Router";
 copy.disabled=true;
 copy.style.cssText="padding:9px;border-radius:6px;background:#d79c2a;color:#111;border:0;margin-top:6px";
 const note=document.createElement("div");note.style.cssText="font-size:12px";
 note.textContent="Hệ số mặc định 1,067; nhập dấu phẩy hoặc dấu chấm, tối đa 3 chữ số thập phân, lớn hơn 0 và không quá 3. Chỉ nhân B/LO/BAO; DD/Đầu/Đuôi/Đá giữ nguyên. Chưa xác minh Router nhân đúng một lần: khóa Copy/Cắt và tự gửi.";
 panel.append(title,status,keep,review,copy,note);
 output.insertAdjacentElement("afterend",panel);
 let confirmedRepeatSource=null;
 let checkedSource="";
 function reset(){
  review.value="";keep.hidden=true;
  status.textContent="Bấm Kiểm tra/Tách rồi xem kết quả Quýt.";copy.disabled=true;
 }
 function enabled(){return check.checked===true}
 function clearSelection(message){
  confirmedRepeatSource=null;checkedSource="";
  ownTop.__KTS_QUYT_SELECTED_V1__=false;
  ownTop.__KTS_QUYT_SOURCE_V1__="";
  ownTop.__KTS_QUYT_RATE_V1__="1,067";
  notifyAll();
  if(message)status.textContent=message;
 }
 function applyFromOwner(){
  const requested=ownTop.__KTS_QUYT_SELECTED_V1__===true;
  const source=String(ownTop.__KTS_QUYT_SOURCE_V1__||"");
  check.checked=requested&&source.length>0&&source===input.value;
  checkedSource=check.checked?source:"";
  const factor=ownTop.__KTS_QUYT_RATE_V1__;
  rate.value=typeof factor==="string"?factor:"1,067";
  rate.disabled=!enabled();rateWrap.hidden=!enabled();
  panel.hidden=!enabled();reset();
 }
 function notifyAll(){
  const fire=w=>{try{w.dispatchEvent(new Event("kts:quyt-selection-v1"))}catch(_){}};
  fire(ownTop);
  try{for(const f of ownTop.document.querySelectorAll("iframe"))if(f.contentWindow)fire(f.contentWindow)}catch(_){}
 }
 check.addEventListener("change",()=>{
  confirmedRepeatSource=null;
  ownTop.__KTS_QUYT_SELECTED_V1__=check.checked===true&&Boolean(input.value.trim());
  ownTop.__KTS_QUYT_SOURCE_V1__=ownTop.__KTS_QUYT_SELECTED_V1__?input.value:"";
  if(!ownTop.__KTS_QUYT_SELECTED_V1__||typeof ownTop.__KTS_QUYT_RATE_V1__!=="string")
   ownTop.__KTS_QUYT_RATE_V1__="1,067";
  notifyAll();
 });
 rate.addEventListener("input",()=>{
  confirmedRepeatSource=null;
  ownTop.__KTS_QUYT_RATE_V1__=rate.value;
  notifyAll(); // invalidates sibling tab previews, including when rate is incomplete
  reset();
  try{
   core.parseRate(rate.value);
   status.textContent="Hệ số đã đổi; bấm Kiểm tra/Tách để tính lại. Không dùng kết quả cũ.";
  }catch(e){status.textContent="HOLD: Hệ số không hợp lệ — "+String(e.message||e)}
 });
 window.addEventListener("kts:quyt-selection-v1",applyFromOwner);
 applyFromOwner();
 function refresh(){
  reset();if(!enabled())return;
  if(!checkedSource||checkedSource!==input.value){
    clearSelection("HOLD: nguồn đã đổi, Quýt và hệ số được đặt lại mặc định.");return;
  }
  const original=input.value,raw=output.value;
  if(!original.trim()||!raw.trim()){status.textContent="HOLD: không có tin hoặc kết quả để điều chỉnh.";return}
  if(original.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")){
   status.textContent="HOLD: nguồn hiện là Cut ledger; không điều chỉnh lại.";return;
  }
  try{
   const selectedRegion=document.getElementById("region")||document.getElementById("sharedRegion");
   const p=core.prepareGrouped(raw,{
    customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",alreadyTransformed:false,
    rate:rate.value,sourceText:original,region:selectedRegion?.value,
    cleanCore:window.KTSCleanAggregate,repeatDecision:confirmedRepeatSource===original?"keep_all":"ask_operator",
    omitRegion:true
   });
   review.value=p.preview;
   status.textContent="Quýt ✓ | hệ số ×"+p.rate.replace(".",",")+
    " | GỘP các lượt cùng số/cùng loại/cùng đài trước → nhân một lần → làm tròn lên. "+
    p.aggregatedExposures+" số/loại đã đối chiếu. Chưa cho gửi tự động, Router có thể nhân thêm.";
   copy.disabled=!ROUTER_ONCE_ONLY_RECEIPT_VERIFIED;
  }catch(e){
    if(String(e.message||e).includes("DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED")){
     keep.hidden=false;
     status.textContent="HOLD: đoạn cược giống nhau có thể là khách đánh thêm hoặc paste nhầm. Xác nhận khách đặt thêm để GIỮ ĐỦ và gộp tổng, không tự xóa.";
    }else status.textContent="HOLD: "+String(e.message||e);
  }
 }
 keep.addEventListener("click",()=>{
  if(!enabled()||!input.value.trim())return;
  confirmedRepeatSource=input.value;
  refresh();
 });
 // Existing run(), Clear/Cut/Undo sometimes update textarea.value without input.
 for(const id of ["runBtn","dvRun","clearBtn","dvClear","undoBtn","cutBtn",
                  "dvCutSelection","sourceCutBtn","dvSourceCut","ledgerWorkCut"]){
   const button=document.getElementById(id);
   if(button)button.addEventListener("click",()=>{reset();setTimeout(refresh,100)});
 }
 input.addEventListener("input",()=>{
  confirmedRepeatSource=null;
  if(enabled()&&checkedSource!==input.value){
    clearSelection("HOLD: tin đã đổi, Quýt và hệ số trở về mặc định.");return;
  }
  reset();
 });
 const region=document.getElementById("region")||document.getElementById("sharedRegion");
 if(region)region.addEventListener("change",()=>{
  if(enabled())clearSelection("HOLD: miền/đài đã đổi, Quýt và hệ số trở về mặc định.");
  else {confirmedRepeatSource=null;reset()}
 });
 // The prepared text must not enter the Router until transform-once authority exists.
 copy.addEventListener("click",event=>{
  event.preventDefault();
  status.textContent="HOLD: chưa có bằng chứng Router chỉ nhân một lần. Không Copy Quýt.";
 });
 for(const type of ["copy","cut"]){
  review.addEventListener(type,event=>{
   event.preventDefault();
   status.textContent="HOLD: chưa có receipt Router; không sao chép kết quả Quýt đã nhân.";
  });
 }
 // Prevent accidental raw result copy through the normal result button.
 // Quýt remains a REVIEW_ONLY transform until a one-time authoritative
 // Router/parent receipt can guarantee that the prepared amount is not
 // re-multiplied. Block all raw RESULT copy/cut surfaces while selected.
 const resultActions=["dvCopy","copyBtn","cutBtn","dvCutSelection",
                       "ledgerWorkCopy","ledgerWorkCut","sourceCutBtn","dvSourceCut"];
 for(const id of resultActions){
  const button=document.getElementById(id);
  if(!button)continue;
  button.addEventListener("click",event=>{
    if(!enabled())return;
    event.preventDefault();event.stopImmediatePropagation();
    status.textContent="HOLD Quýt: Cắt/Copy gốc bị khóa khi chọn Quýt. Dùng bản xem trước Quýt; chưa có quyền tự gửi hay Cắt bản đã nhân.";
    refresh();
  },true);
 }
 for(const type of ["copy","cut"]){
  output.addEventListener(type,event=>{
    if(!enabled())return;
    event.preventDefault();status.textContent="HOLD Quýt: không copy/cắt kết quả gốc. Dùng nút Copy kết quả Quýt đã kiểm tra.";
  });
 }
 // Never keep Quýt selection between page reloads; different customers may
 // occupy the next ticket. A per-page toggle is not a verified sender identity.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
else install();
})();
