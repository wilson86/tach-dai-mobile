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
 const direct=document.createElement("button");direct.type="button";
 direct.id="ktsQuytDirectMerge";
 direct.textContent="GỘP TIN QUÝT TỪ NGUỒN — XEM TRƯỚC";
 direct.style.cssText="display:block;padding:9px;border-radius:6px;background:#f7d88a;border:1px solid #a6751e;margin:6px 0;color:#211b11";
 const copy=document.createElement("button");copy.type="button";copy.textContent="Copy Quýt bị khóa — chờ xác minh Router";
 copy.disabled=true;
 copy.style.cssText="padding:9px;border-radius:6px;background:#d79c2a;color:#111;border:0;margin-top:6px";
 const note=document.createElement("div");note.style.cssText="font-size:12px";
 note.textContent="Hệ số mặc định 1,067; nhập dấu phẩy hoặc dấu chấm, tối đa 3 chữ số thập phân, lớn hơn 0 và không quá 3. Chỉ nhân B/LO/BAO; DD/Đầu/Đuôi/Đá giữ nguyên. Chưa xác minh Router nhân đúng một lần: khóa Copy/Cắt và tự gửi.";
 panel.append(title,status,keep,direct,review,copy,note);
 output.insertAdjacentElement("afterend",panel);
 let confirmedRepeatSource=null;
 let checkedSource="";
 let directMode=false;

 // Customer profile metadata only: no wager, message ID or ledger is persisted.
 const CUSTOMER_STORAGE_KEY="KTS_REVIEW_CUSTOMERS_V1";
 const defaults=()=>[{id:"hien",name:"Hiền",rate:"1,000",active:true,history:[]},
                    {id:"quyt",name:"Quýt",rate:"1,067",active:true,history:[]}];
 function loadCustomers(){
  try{
   const data=JSON.parse(window.localStorage?.getItem(CUSTOMER_STORAGE_KEY)||"null");
   if(data?.version!==1||!Array.isArray(data.customers))return defaults();
   const list=[],ids=new Set();
   for(const p of data.customers.slice(0,40)){
    if(typeof p?.id!=="string"||!/^(hien|quyt|customer-[a-z0-9-]+)$/u.test(p.id)||
       ids.has(p.id)||typeof p.name!=="string"||!p.name.trim()||p.name.length>50||
       typeof p.rate!=="string")continue;
    try{core.parseRate(p.rate)}catch(_){continue}
    ids.add(p.id);
    list.push({id:p.id,name:p.name,rate:p.rate,active:p.active!==false,
      history:Array.isArray(p.history)?p.history.filter(h=>h&&typeof h.rate==="string"&&
      typeof h.at==="string").slice(-20):[]});
   }
   for(const p of defaults())if(!ids.has(p.id))list.push(p);
   return list;
  }catch(_){return defaults()}
 }
 let profiles=loadCustomers(),customerId="";
 const profile=()=>profiles.find(p=>p.id===customerId&&p.active);
 const bar=document.createElement("div");bar.id="ktsReviewCustomerControls";
 bar.style.cssText="padding:8px;border:1px solid #9bb2c9;border-radius:8px;margin:8px 0;display:flex;flex-wrap:wrap;gap:6px";
 const selector=document.createElement("select");selector.id="ktsReviewCustomer";
 selector.setAttribute("aria-label","Chọn khách");
 const name=document.createElement("input");name.id="ktsReviewCustomerName";
 name.type="text";name.maxLength=50;name.placeholder="Tên khách mới / tên đổi";
 const add=document.createElement("button");add.type="button";add.id="ktsReviewAddCustomer";add.textContent="Thêm khách";
 const rename=document.createElement("button");rename.type="button";rename.id="ktsReviewRenameCustomer";rename.textContent="Đổi tên";
 const retire=document.createElement("button");retire.type="button";retire.id="ktsReviewRetireCustomer";retire.textContent="Ngừng sử dụng";
 const save=document.createElement("button");save.type="button";save.id="ktsReviewSaveRate";save.textContent="Lưu hệ số";
 const hint=document.createElement("div");hint.id="ktsReviewCustomerStatus";hint.style.cssText="width:100%;font-size:12px";
 const history=document.createElement("div");history.id="ktsReviewRateHistory";history.style.cssText="width:100%;font-size:12px";
 bar.append(selector,name,add,rename,retire,save,hint,history);
 label.insertAdjacentElement("afterend",bar);label.hidden=true;
 function drawCustomers(){
  selector.innerHTML="";
  const blank=document.createElement("option");blank.value="";blank.textContent="KHÁCH: — chọn —";selector.append(blank);
  for(const p of profiles.filter(p=>p.active)){
   const o=document.createElement("option");o.value=p.id;o.textContent=p.name;selector.append(o);
  }
  const more=document.createElement("option");more.value="__add__";more.textContent="+ Thêm khách mới…";selector.append(more);
  selector.value=profile()?customerId:"";
  const p=profile();
  history.textContent=p?"Đã lưu ×"+p.rate+" | Lịch sử hệ số: "+
    (p.history.length?p.history.map(h=>h.at+" "+h.rate).join("; "):"chưa thay đổi"):"";
 }
 function storeCustomers(){
  try{
   if(!window.localStorage)throw Error("STORAGE_UNAVAILABLE");
   window.localStorage.setItem(CUSTOMER_STORAGE_KEY,JSON.stringify({version:1,customers:profiles}));
   return true;
  }catch(_){hint.textContent="HOLD: trình duyệt không lưu được; hệ số chưa được xác nhận.";return false}
 }
 function chosenName(){
  const v=name.value.trim().replace(/\\s+/gu," ");
  if(!v||v.length>50||/[<>\\x00-\\x1f]/u.test(v))throw Error("CUSTOMER_NAME_INVALID");
  if(profiles.some(p=>p.active&&p.id!==customerId&&p.name.toLocaleLowerCase("vi")===v.toLocaleLowerCase("vi")))
   throw Error("CUSTOMER_NAME_DUPLICATE");
  return v;
 }
 function chooseCustomer(id){
  customerId=profiles.some(p=>p.id===id&&p.active)?id:"";
  confirmedRepeatSource=null;directMode=false;
  ownTop.__KTS_QUYT_CUSTOMER_ID_V1__=customerId;
  ownTop.__KTS_QUYT_SELECTED_V1__=customerId==="quyt"&&Boolean(input.value.trim());
  ownTop.__KTS_QUYT_SOURCE_V1__=ownTop.__KTS_QUYT_SELECTED_V1__?input.value:"";
  ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";
  drawCustomers();notifyAll();
  hint.textContent=profile()?"Đã chọn "+profile().name+". Chỉ Quýt được xem trước tiền; khách khác HOLD cho đến khi duyệt authority.":"Chưa chọn khách.";
 }
 selector.addEventListener("change",()=>{
  if(selector.value==="__add__"){name.focus?.();hint.textContent="Nhập tên và bấm Thêm khách.";selector.value=customerId;return}
  chooseCustomer(selector.value);
 });
 add.addEventListener("click",()=>{
  try{
   const v=chosenName();
   if(profiles.length>=40)throw Error("CUSTOMER_LIMIT");
   const id="customer-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e9).toString(36);
   profiles.push({id,name:v,rate:"1,000",active:true,history:[]});
   if(!storeCustomers()){profiles.pop();return}
   name.value="";chooseCustomer(id);
  }catch(e){hint.textContent="HOLD: "+String(e.message||e)}
 });
 rename.addEventListener("click",()=>{
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  try{
   const v=chosenName(),old=p.name;p.name=v;
   if(!storeCustomers()){p.name=old;return}
   name.value="";drawCustomers();notifyAll();hint.textContent="Đã đổi tên; customer_id không thay đổi.";
  }catch(e){hint.textContent="HOLD: "+String(e.message||e)}
 });
 retire.addEventListener("click",()=>{
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  if(p.id==="quyt"||p.id==="hien"){hint.textContent="HOLD: không tắt khách mặc định ở bản review.";return}
  p.active=false;if(!storeCustomers()){p.active=true;return}
  chooseCustomer("");hint.textContent="Đã ngừng sử dụng; không xóa lịch sử hệ số.";
 });
 save.addEventListener("click",()=>{
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  try{
   core.parseRate(rate.value);
   const old=p.rate,oldHist=p.history.slice();
   if(old!==rate.value){
    p.rate=rate.value;p.history.push({at:new Date().toISOString(),rate:rate.value});
    p.history=p.history.slice(-20);
   }
   if(!storeCustomers()){p.rate=old;p.history=oldHist;return}
   drawCustomers();hint.textContent="Đã lưu hệ số riêng; giao dịch lịch sử không được sửa.";
   notifyAll();
  }catch(e){hint.textContent="HOLD: "+String(e.message||e)}
 });
 drawCustomers();
 function reset(){
  review.value="";keep.hidden=true;
  status.textContent="Bấm Kiểm tra/Tách rồi xem kết quả Quýt.";copy.disabled=true;
 }
 function enabled(){return check.checked===true}
 function clearSelection(message){
  confirmedRepeatSource=null;checkedSource="";directMode=false;
  ownTop.__KTS_QUYT_SELECTED_V1__=false;
  ownTop.__KTS_QUYT_SOURCE_V1__="";
  ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";
  notifyAll();
  if(message)status.textContent=message;
 }
 function applyFromOwner(){
  profiles=loadCustomers();
  customerId=profiles.some(p=>p.id===ownTop.__KTS_QUYT_CUSTOMER_ID_V1__&&p.active)?
    ownTop.__KTS_QUYT_CUSTOMER_ID_V1__:"";
  drawCustomers();
  const requested=customerId==="quyt"&&ownTop.__KTS_QUYT_SELECTED_V1__===true;
  const source=String(ownTop.__KTS_QUYT_SOURCE_V1__||"");
  check.checked=requested&&source.length>0&&source===input.value;
  checkedSource=check.checked?source:"";
  const factor=ownTop.__KTS_QUYT_RATE_V1__;
  rate.value=typeof factor==="string"&&customerId?factor:(profile()?.rate||"1,067");
  rate.disabled=!customerId;rateWrap.hidden=!customerId;
  panel.hidden=!customerId;reset();
  if(customerId!=="quyt"&&customerId)status.textContent="HOLD: chưa duyệt công thức tiền cho khách này.";
 }
 function notifyAll(){
  const fire=w=>{try{w.dispatchEvent(new Event("kts:quyt-selection-v1"))}catch(_){}};
  fire(ownTop);
  try{for(const f of ownTop.document.querySelectorAll("iframe"))if(f.contentWindow)fire(f.contentWindow)}catch(_){}
 }
 check.addEventListener("change",()=>{
  confirmedRepeatSource=null;directMode=false;
  if(check.checked&&!customerId){customerId="quyt";ownTop.__KTS_QUYT_CUSTOMER_ID_V1__="quyt"}
  ownTop.__KTS_QUYT_SELECTED_V1__=check.checked===true&&customerId==="quyt"&&Boolean(input.value.trim());
  ownTop.__KTS_QUYT_SOURCE_V1__=ownTop.__KTS_QUYT_SELECTED_V1__?input.value:"";
  if(!ownTop.__KTS_QUYT_SELECTED_V1__||typeof ownTop.__KTS_QUYT_RATE_V1__!=="string")
   ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";
  notifyAll();
 });
 rate.addEventListener("input",()=>{
  confirmedRepeatSource=null;
  ownTop.__KTS_QUYT_RATE_V1__=rate.value;
  notifyAll(); // invalidates sibling tab previews, including when rate is incomplete
  reset();
  try{
   core.parseRate(rate.value);
   if(customerId!=="quyt"){status.textContent="Hệ số nháp; chỉ lưu cấu hình, chưa tính tiền cho khách này.";return}
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
  const original=input.value;
  if(original.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")){
   status.textContent="HOLD: nguồn hiện là Cut ledger; không điều chỉnh lại.";return;
  }
  try{
   const selectedRegion=document.getElementById("region")||document.getElementById("sharedRegion");
   // Direct review is independent of Tách output. Validate the COMPLETE raw
   // source through the existing parser; never infer, drop or rewrite a wager.
   let raw=output.value;
   if(directMode){
    const cleaner=window.KTSCleanAggregate;
    if(!cleaner||typeof cleaner.preview!=="function")throw Error("CLEAN_CORE_REQUIRED");
    const merged=cleaner.preview(original,{
     region:selectedRegion?.value,omitRegion:true,
     repeatDecision:confirmedRepeatSource===original?"keep_all":"ask_operator"
    });
    if(merged.status!=="REVIEW_ONLY"){
     if(merged.requiresConfirmation){
      keep.hidden=false;
      status.textContent="HOLD: có lượt lặp. Xác nhận GIỮ TẤT CẢ trước khi xem gộp; không tự xóa tin.";
     }else status.textContent="HOLD: nguồn chưa đủ điều kiện xem gộp.";
     return;
    }
    raw=merged.normalized;
   }
   if(!original.trim()||!raw.trim())throw Error("MISSING_SOURCE_OR_RESULT");
   const p=core.prepareGrouped(raw,{
    customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",alreadyTransformed:false,
    rate:rate.value,sourceText:original,region:selectedRegion?.value,
    cleanCore:window.KTSCleanAggregate,repeatDecision:confirmedRepeatSource===original?"keep_all":"ask_operator",
    omitRegion:true
   });
   review.value=p.preview;
   status.textContent=(directMode?"GỘP TỪ TIN GỐC ✓":"Quýt ✓")+
    " | hệ số ×"+p.rate.replace(".",",")+
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
 direct.addEventListener("click",()=>{
  if(!enabled()&&customerId==="quyt"&&input.value.trim()){
   ownTop.__KTS_QUYT_SELECTED_V1__=true;
   ownTop.__KTS_QUYT_SOURCE_V1__=input.value;notifyAll();
  }
  if(!enabled()){status.textContent="HOLD: chỉ Quýt được xem trước tiền; hãy chọn Quýt và dán tin.";return;}
  directMode=true;
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
    clearSelection("HOLD: nguồn thay đổi; kết quả cũ vô hiệu, hệ số nháp trả về hệ số đã lưu.");return;
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
