/* Review-only Clean & Aggregate panel: no source/ledger or parser mutation. */
(function(){
"use strict";
function mount(){
 const input=document.getElementById("dvInput")||document.getElementById("input");
 const region=document.getElementById("sharedRegion")||document.getElementById("region");
 const date=document.getElementById("sharedDate")||document.getElementById("date");
 const core=window.KTSCleanAggregate;
 if(!input||!region||!core||document.getElementById("ktsCleanReviewPanel"))return;
 const box=document.createElement("section");box.id="ktsCleanReviewPanel";
 box.setAttribute("aria-label","Làm sạch và gộp điểm xem trước");
 box.style.cssText="border:1px solid #7b9cba;border-radius:10px;background:#eef6ff;padding:12px;margin-top:10px;display:block;color:#17243a";
 const title=document.createElement("div");title.textContent="Làm sạch & gộp điểm — CHỈ XEM TRƯỚC";
 title.style.cssText="font-weight:750;margin-bottom:8px";
 const btn=document.createElement("button");btn.type="button";btn.textContent="Kiểm tra làm sạch & gộp";btn.style.cssText="padding:9px;background:#1155bb;color:white;border:0;border-radius:7px";
 const status=document.createElement("div");status.setAttribute("role","status");status.style.cssText="white-space:pre-wrap;margin:8px 0;font-size:13px";
 const actions=document.createElement("div");actions.style.cssText="display:none;gap:8px;flex-wrap:wrap;margin-bottom:8px";
 const keep=document.createElement("button");keep.type="button";keep.textContent="Khách đánh thêm: GIỮ ĐỦ";
 const remove=document.createElement("button");remove.type="button";remove.textContent="Lỗi paste: XÉT LOẠI BẢN TRÙNG";
 for(const b of [keep,remove]){b.style.cssText="padding:8px;border-radius:8px;border:1px solid #bbc7d8;background:white;color:#153451"}
 actions.append(keep,remove);
 const output=document.createElement("textarea");output.setAttribute("aria-label","Kết quả làm sạch chỉ đọc");
 output.readOnly=true;output.spellcheck=false;output.style.cssText="width:100%;min-height:150px;box-sizing:border-box;font:13px monospace;background:white;color:#17243a";
 const note=document.createElement("small");note.textContent="Kết quả chỉ để đối chiếu. Không tự gửi tuyến trên, không thay thế Tách/Cắt/Undo hoặc phép tính tiền KTS.";
 const sep=document.createElement("hr");
 box.append(title,btn,status,actions,output,sep,note);
 input.insertAdjacentElement("afterend",box);
 let snapshot=null;
 const reset=()=>{snapshot=null;output.value="";actions.style.display="none";status.textContent="Tin thay đổi: bấm kiểm tra lại trước khi gộp.";};
 input.addEventListener("input",reset);
 region.addEventListener("change",reset);
 if(date)date.addEventListener("change",reset);
 // Existing KTS Cut, Undo, Clear and Da Vong actions sometimes assign
 // textarea.value programmatically without firing an input event.
 // Invalidating is deliberately conservative: no stale copyable preview.
 for(const id of ["clearBtn","sourceCutBtn","undoBtn","cutBtn",
                  "dvClear","dvSourceCut","dvCutSelection"]){
  const action=document.getElementById(id);
  if(action)action.addEventListener("click",reset);
 }
 // Parent Unified sync may also update an iframe input without an input event.
 // On focus or attempted copy, recheck the exact source/region snapshot.
 output.addEventListener("focus",()=>{
  if(snapshot&&(snapshot.raw!==input.value||snapshot.region!==region.value||snapshot.date!==date?.value))reset();
 });
 output.addEventListener("copy",event=>{
  if(!snapshot||snapshot.raw!==input.value||snapshot.region!==region.value||snapshot.date!==date?.value){
   event.preventDefault();reset();
  }
 });
 function blocked(){
  if(input.readOnly||input.disabled||/^\[\[KTS_EXACT_OUTPUT_LEDGER_V1\]\]/u.test(input.value))return true;
  const work=document.getElementById("ledgerWork");
  return Boolean(work&&work.style.display!=="none"&&work.getAttribute("hidden")===null);
 }
 function display(p,reviewed){
  status.textContent=(p.status==="HOLD_REVIEW"?"HOLD: Tin có đoạn lặp, cần xác nhận trước khi hiển thị kết quả gộp.\n":"")+
   "Cụm: "+p.rawClauses+" | Giữ: "+p.keptClauses+" | Loại: "+p.removedClauses+
   "\nB="+p.totals.b+"; LO="+p.totals.lo+"; DD="+p.totals.dd+"; Đầu="+p.totals.dau+"; Đuôi="+p.totals.duoi+
   " | Tổng điểm theo số="+p.total+
   (reviewed?"\nĐã chọn cách xử lý trùng; chưa có quyền tự gửi.":"");
  output.value=reviewed?p.normalized:"";
 }
 btn.addEventListener("click",()=>{
  actions.style.display="none";output.value="";snapshot=null;
  if(blocked()){status.textContent="HOLD: đang có tin gốc/ledger đã Cắt. Không gộp trên trạng thái đang Cắt.";return}
  try{
   const raw=input.value,selected=region.value;
   const p=core.preview(raw,{region:selected,businessDate:date?.value,
     repeatDecision:"ask_operator",omitRegion:selected==="mb"});
   snapshot={raw,region:selected,date:date?.value,base:p};
   if(p.missingRegion){status.textContent="HOLD: chưa xác định đài/miền.";snapshot=null;return}
   if(p.requiresConfirmation){
    actions.style.display="flex";display(p,false);
    status.textContent+="\nPhát hiện "+p.repeated.length+" đoạn lặp. Bạn xác nhận khách đánh thêm hay chỉ paste nhầm?";
   }else display(p,true);
  }catch(e){status.textContent="HOLD: "+String(e?.message||e);snapshot=null}
 });
 function confirmSelection(decision){
  if(!snapshot||input.value!==snapshot.raw||region.value!==snapshot.region||date?.value!==snapshot.date){reset();return}
  let ref;
  if(decision==="remove_copies"){
   const yes=window.confirm("Chỉ loại bản trùng nếu đã xác nhận đây là lỗi paste, KHÔNG phải khách đánh lần hai. Tiếp tục xem trước?");
   if(!yes)return;
   ref=window.prompt("Nhập mã/bằng chứng xác nhận lỗi paste của người vận hành:","");
   if(!ref?.trim()){status.textContent="HOLD: thiếu xác nhận và dấu vết; chưa loại cược.";return}
  }
  try{
   const p=core.preview(snapshot.raw,{region:snapshot.region,businessDate:snapshot.date,
      repeatDecision:decision,decisionReference:ref,omitRegion:snapshot.region==="mb"});
   // Strict per-number conservation whenever intentional repeats are kept.
   if(decision==="keep_all"&&p.rawTotal!==p.total)throw Error("MONEY_CONSERVATION_FAILED");
   actions.style.display="none";display(p,true);
   if(decision==="remove_copies")
    status.textContent+="\nCẢNH BÁO: tổng điểm gốc="+p.rawTotal+" → sau giả định bỏ paste="+p.total+
      ". Cần người vận hành kiểm tra từng cược trước khi sử dụng.";
  }catch(e){output.value="";status.textContent="HOLD: "+String(e.message||e)}
 }
 keep.addEventListener("click",()=>confirmSelection("keep_all"));
 remove.addEventListener("click",()=>confirmSelection("remove_copies"));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
else mount();
})();
