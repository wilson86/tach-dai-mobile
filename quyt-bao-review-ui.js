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
 if(!input||!output||!core||document.getElementById("ktsQuytCheckbox"))return;
 const ownTop=(()=>{try{return window.top?.location.origin===location.origin?window.top:window}catch(_){return window}})();
 const label=document.createElement("label");
 label.style.cssText="display:flex;align-items:center;gap:8px;padding:8px;background:#fff3d8;border:1px solid #e2a74f;border-radius:8px;margin:7px 0;color:#242020";
 const check=document.createElement("input");check.type="checkbox";check.id="ktsQuytCheckbox";
 const caption=document.createElement("span");caption.textContent="Quýt — bao lô ×1,067 (làm tròn lên mỗi khoản)";
 label.append(check,caption);input.insertAdjacentElement("afterend",label);
 const panel=document.createElement("section");panel.id="ktsQuytPreparedPanel";
 panel.style.cssText="border:1px solid #d4ac4a;border-radius:9px;background:#fff8e8;padding:9px;margin-top:8px";
 panel.hidden=true;
 const title=document.createElement("strong");title.textContent="KẾT QUẢ QUÝT CHUẨN BỊ CHUYỂN — CHỈ XEM TRƯỚC";
 const status=document.createElement("div");status.setAttribute("role","status");status.style.cssText="white-space:pre-wrap;font-size:12px;margin:7px 0";
 const review=document.createElement("textarea");review.readOnly=true;review.spellcheck=false;
 review.setAttribute("aria-label","Kết quả Quýt 1,067 để đối chiếu");
 review.style.cssText="width:100%;min-height:100px;box-sizing:border-box;color:#242020;background:white";
 const copy=document.createElement("button");copy.type="button";copy.textContent="Copy kết quả Quýt đã kiểm tra";
 copy.style.cssText="padding:9px;border-radius:6px;background:#d79c2a;color:#111;border:0;margin-top:6px";
 const note=document.createElement("div");note.style.cssText="font-size:12px";
 note.textContent="Bản thử nghiệm: chưa tự gửi. Chỉ nhân B/LO/BAO, không nhân DD/Đầu/Đuôi/Đá. Không nhân lại đầu ra đã điều chỉnh.";
 panel.append(title,status,review,copy,note);
 output.insertAdjacentElement("afterend",panel);
 let approved=null;
 function reset(){
  approved=null;review.value="";status.textContent="Bấm Kiểm tra/Tách rồi xem kết quả Quýt.";copy.disabled=true;
 }
 function enabled(){return check.checked===true}
 function applyFromOwner(){
  check.checked=ownTop.__KTS_QUYT_SELECTED_V1__===true;
  panel.hidden=!enabled();reset();
 }
 function notifyAll(){
  const fire=w=>{try{w.dispatchEvent(new Event("kts:quyt-selection-v1"))}catch(_){}};
  fire(ownTop);
  try{for(const f of ownTop.document.querySelectorAll("iframe"))if(f.contentWindow)fire(f.contentWindow)}catch(_){}
 }
 check.addEventListener("change",()=>{
  ownTop.__KTS_QUYT_SELECTED_V1__=check.checked===true;
  notifyAll();
 });
 window.addEventListener("kts:quyt-selection-v1",applyFromOwner);
 applyFromOwner();
 function refresh(){
  reset();if(!enabled())return;
  const original=input.value,raw=output.value;
  if(!original.trim()||!raw.trim()){status.textContent="HOLD: không có tin hoặc kết quả để điều chỉnh.";return}
  if(original.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")){
   status.textContent="HOLD: nguồn hiện là Cut ledger; không điều chỉnh lại.";return;
  }
  try{
   const p=core.prepare(raw,{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",alreadyTransformed:false});
   approved={input:original,result:raw,preview:p.preview};
   review.value=p.preview;
   status.textContent="Quýt ✓ | "+p.alteredOccurrences+" khoản bao được làm tròn lên từng khoản. Cần xác nhận không đã xử lý ×1,067 ở Router.";
   copy.disabled=false;
  }catch(e){status.textContent="HOLD: "+String(e.message||e)}
 }
 // Existing run(), Clear/Cut/Undo sometimes update textarea.value without input.
 for(const id of ["runBtn","dvRun","clearBtn","dvClear","undoBtn","cutBtn",
                  "dvCutSelection","sourceCutBtn","dvSourceCut","ledgerWorkCut"]){
   const button=document.getElementById(id);
   if(button)button.addEventListener("click",()=>{reset();setTimeout(refresh,100)});
 }
 input.addEventListener("input",reset);
 const region=document.getElementById("region")||document.getElementById("sharedRegion");
 if(region)region.addEventListener("change",reset);
 async function doCopy(){
  if(!enabled()||!approved||approved.input!==input.value||approved.result!==output.value||
     approved.preview!==review.value){reset();status.textContent="HOLD: kết quả đã thay đổi, phải kiểm tra lại.";return}
  if(!navigator.clipboard?.writeText){status.textContent="HOLD: Clipboard không khả dụng. Không copy tin gốc.";return}
  try{
   await navigator.clipboard.writeText(approved.preview);
   status.textContent="Đã copy kết quả Quýt để xem xét; chưa gửi tự động. Đầu ra gốc không đổi.";
  }catch(e){status.textContent="HOLD: Copy không thành công: "+String(e.message||e)}
 }
 copy.addEventListener("click",()=>{refresh();void doCopy()});
 // Prevent accidental raw result copy through the normal result button.
 const originalCopy=document.getElementById("dvCopy")||document.getElementById("copyBtn");
 if(originalCopy)originalCopy.addEventListener("click",event=>{
  if(!enabled())return;
  event.preventDefault();event.stopImmediatePropagation();
  status.textContent="Đã chọn Quýt: hãy sử dụng nút Copy kết quả Quýt đã kiểm tra; không copy bản gốc.";
  refresh();
 },true);
 // Never keep Quýt selection between page reloads; different customers may
 // occupy the next ticket. A per-page toggle is not a verified sender identity.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
else install();
})();
