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
 // Explicit opt-in: the ordinary KTS Tách/Cắt/Undo UI remains untouched when OFF.
 const optInLabel=document.createElement("label");
 optInLabel.style.cssText="display:flex;align-items:center;gap:8px;padding:8px;background:#fff3d8;border:1px solid #e2a74f;border-radius:8px;margin:7px 0;color:#242020";
 const optIn=document.createElement("input");optIn.type="checkbox";optIn.id="ktsCustomerRateToggle";
 optIn.setAttribute("aria-label","Bật chế độ khách và tỷ lệ");
 const optInText=document.createElement("span");optInText.textContent="Khách & tỷ lệ (tích để mở phần điều chỉnh)";
 optInLabel.append(optIn,optInText);input.insertAdjacentElement("afterend",optInLabel);
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
 const title=document.createElement("strong");title.textContent="GỘP TIN KHÁCH — CHỈ XEM TRƯỚC";
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
 let confirmedRepeatScope=null;
 let checkedSource="";
 // Repeat approval is valid for one exact customer, region, day, rate and source.
 function repeatScope(){
  const market=(document.getElementById("region")||document.getElementById("sharedRegion"))?.value||"";
  const date=(document.getElementById("date")||document.getElementById("sharedDate"))?.value||"";
  return JSON.stringify([customerId,market,date,rate.value,input.value]);
 }
 let directMode=false;
 // Allow one initial complete pasted ticket when Quýt was selected on an empty form.
 // Never silently re-arm after source edits, Cut/Undo, or a rejected fragment.
 let initialSourceBindAllowed=false;

 // Customer profile metadata only: no wager, message ID or ledger is persisted.
 const CUSTOMER_STORAGE_KEY="KTS_REVIEW_CUSTOMERS_V1";
 let customerStorageInvalid=false,customerStore=null;
 function loadCustomers(){
  try{
   if(!customerStore)customerStore=window.KTSCustomerConfig.createStore(window.localStorage,core.parseRate);
   return customerStore.read();
  }catch(_){customerStorageInvalid=true;return []}
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
 label.insertAdjacentElement("afterend",bar);
// The customer/rate opt-in is the ONE visible checkbox. Keep the old Quýt
// checkbox as a private compatibility state for source-binding/QA only.
// "hidden" alone loses to the author inline display:flex in real Chrome.
label.hidden=true;label.style.display="none";label.setAttribute("aria-hidden","true");
check.tabIndex=-1;bar.style.display="none";
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
 async function storeCustomers(){
  if(customerStorageInvalid){hint.textContent="HOLD: dữ liệu khách không đọc được; không ghi đè.";return false}
  try{
   if(!customerStore||window.KTSCustomerConfig.KEY!==CUSTOMER_STORAGE_KEY)throw Error("STORAGE_UNAVAILABLE");
   await customerStore.writeLocked(profiles,window.navigator?.locks);
   return true;
  }catch(e){hint.textContent=String(e.message||e).includes("CUSTOMER_STALE_HOLD")?"HOLD: cấu hình đã đổi ở cửa sổ khác; tải lại trước khi sửa. Tin gốc không bị xóa.":"HOLD: trình duyệt không lưu được; hệ số chưa được xác nhận.";return false}
 }
 function chosenName(allowSelectedCustomer=false){
  const v=name.value.trim().replace(/\s+/gu," ");
  if(!v)throw Error("CUSTOMER_NAME_REQUIRED");
  if(v.length>50||(/[<>]/u.test(v)||[...v].some(c=>c.charCodeAt(0)<32)))throw Error("CUSTOMER_NAME_INVALID");
  if(profiles.some(p=>p.active&&(!allowSelectedCustomer||p.id!==customerId)&&p.name.toLocaleLowerCase("vi")===v.toLocaleLowerCase("vi")))
   throw Error("CUSTOMER_NAME_DUPLICATE");
  return v;
 }
 function customerNameFeedback(error){
  const code=String(error?.message||error);
  if(code==="CUSTOMER_NAME_REQUIRED")return "Nhập tên khách trước khi bấm Thêm khách hoặc Đổi tên. Khách đang chọn không thay đổi.";
  if(code==="CUSTOMER_NAME_INVALID")return "Tên khách không hợp lệ. Không dùng ký tự điều khiển hoặc dấu < >.";
  if(code==="CUSTOMER_NAME_DUPLICATE")return "Tên khách đã tồn tại. Hãy chọn khách trong danh sách hoặc nhập tên khác.";
  return "HOLD: "+code;
 }
 function chooseCustomer(id){
  if(!optIn.checked){hint.textContent="HOLD: tích Khách & tỷ lệ trước khi chọn khách.";return}
  customerId=profiles.some(p=>p.id===id&&p.active)?id:"";
  initialSourceBindAllowed=customerId==="quyt"&&!input.value.trim();
  confirmedRepeatSource=null;directMode=false;
  ownTop.__KTS_QUYT_CUSTOMER_ID_V1__=customerId;
  ownTop.__KTS_QUYT_SELECTED_V1__=customerId==="quyt"&&Boolean(input.value.trim());
  ownTop.__KTS_QUYT_SOURCE_V1__=ownTop.__KTS_QUYT_SELECTED_V1__?input.value:"";
  ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";
  drawCustomers();notifyAll();
  hint.textContent=customerStorageInvalid?"HOLD: dữ liệu khách không đọc được; không ghi đè.":profile()?"Đã chọn "+profile().name+". Gộp tin gốc chỉ để đối chiếu; chưa được chuyển chủ.":"Chưa chọn khách.";
 }
 selector.addEventListener("change",()=>{
  if(!optIn.checked)return;
  if(selector.value==="__add__"){name.focus?.();hint.textContent="Nhập tên và bấm Thêm khách.";selector.value=customerId;return}
  chooseCustomer(selector.value);
 });
 add.addEventListener("click",async()=>{
  if(!optIn.checked){hint.textContent="Chưa bật Khách & tỷ lệ; không thay đổi khách.";return}
  try{
   const v=chosenName();
   if(profiles.length>=40)throw Error("CUSTOMER_LIMIT");
   const selectedRate=window.prompt("Nhập hệ số đã xác nhận cho khách mới:","1,000");
   if(selectedRate===null){hint.textContent="HOLD: chưa xác nhận hệ số.";return}
   core.parseRate(selectedRate);
   if(!window.confirm("Tạo khách "+v+" với hệ số "+selectedRate+"?")){hint.textContent="HOLD: chưa xác nhận tạo khách.";return}
   const id="customer-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e9).toString(36);
   if(profiles.some(p=>p.id===id))throw Error("CUSTOMER_ID_COLLISION");
   const at=new Date().toISOString();
   profiles.push({id,name:v,rate:selectedRate,active:true,created_at:at,updated_at:at,history:[{version:1,at,rate:selectedRate}]});
   if(!await storeCustomers()){profiles.pop();return}
   name.value="";chooseCustomer(id);
  }catch(e){hint.textContent=customerNameFeedback(e)}
 });
 rename.addEventListener("click",async()=>{
  if(!optIn.checked){hint.textContent="Chưa bật Khách & tỷ lệ; không đổi tên.";return}
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  try{
   const v=chosenName(true),old=p.name;
   if(!window.confirm("Đổi tên khách "+old+" thành "+v+"?")){hint.textContent="HOLD: chưa xác nhận đổi tên.";return}
   p.name=v;
   if(!await storeCustomers()){p.name=old;return}
   name.value="";drawCustomers();notifyAll();hint.textContent="Đã đổi tên; customer_id không thay đổi.";
  }catch(e){hint.textContent=customerNameFeedback(e)}
 });
 retire.addEventListener("click",async()=>{
  if(!optIn.checked){hint.textContent="Chưa bật Khách & tỷ lệ; không ngừng khách.";return}
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  if(p.id==="quyt"||p.id==="hien"){hint.textContent="HOLD: không tắt khách mặc định ở bản review.";return}
  if(!window.confirm("Ngừng sử dụng khách "+p.name+"?")){hint.textContent="HOLD: chưa xác nhận.";return}
  p.active=false;if(!await storeCustomers()){p.active=true;return}
  chooseCustomer("");hint.textContent="Đã ngừng sử dụng; không xóa lịch sử hệ số.";
 });
 save.addEventListener("click",async()=>{
  if(!optIn.checked){hint.textContent="Chưa bật Khách & tỷ lệ; không lưu hệ số.";return}
  const p=profile();if(!p){hint.textContent="HOLD: chọn khách.";return}
  try{
   core.parseRate(rate.value);
   if(!window.confirm("Lưu hệ số "+rate.value+" cho "+p.name+"?")){hint.textContent="HOLD: chưa xác nhận hệ số.";return}
   const old=p.rate,oldHist=p.history.slice();
   if(old!==rate.value){
    p.rate=rate.value;p.history.push({version:p.history.length+1,at:new Date().toISOString(),rate:rate.value});
    // Preserve all prior coefficient history; never discard old revisions.
   }
   if(!await storeCustomers()){p.rate=old;p.history=oldHist;return}
   drawCustomers();hint.textContent="Đã lưu hệ số riêng; giao dịch lịch sử không được sửa.";
   notifyAll();
  }catch(e){hint.textContent="HOLD: "+String(e.message||e)}
 });
 drawCustomers();
 function reset(){
  review.value="";keep.hidden=true;
  status.textContent="Bấm Kiểm tra/Tách rồi xem kết quả Quýt.";copy.disabled=true;
 }
 function enabled(){return optIn.checked===true&&check.checked===true}
 function clearSelection(message){
  initialSourceBindAllowed=false;
  confirmedRepeatSource=null;checkedSource="";directMode=false;
  ownTop.__KTS_QUYT_SELECTED_V1__=false;
  ownTop.__KTS_QUYT_SOURCE_V1__="";
  ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";
  notifyAll();
  if(message)status.textContent=message;
 }
 function applyFromOwner(){
  profiles=loadCustomers();
  const opted=ownTop.__KTS_CUSTOMER_RATE_OPT_IN_V1__===true;
  optIn.checked=opted;
  customerId=opted&&profiles.some(p=>p.id===ownTop.__KTS_QUYT_CUSTOMER_ID_V1__&&p.active)?
    ownTop.__KTS_QUYT_CUSTOMER_ID_V1__:"";
  drawCustomers();
  const requested=customerId==="quyt"&&ownTop.__KTS_QUYT_SELECTED_V1__===true;
  const source=String(ownTop.__KTS_QUYT_SOURCE_V1__||"");
  check.checked=opted&&requested&&source.length>0&&source===input.value;
  checkedSource=check.checked?source:"";
  const factor=ownTop.__KTS_QUYT_RATE_V1__;
  rate.value=typeof factor==="string"&&customerId?factor:(profile()?.rate||"1,067");
  rate.disabled=!opted||!customerId;
  bar.style.display=opted?"flex":"none";
  rateWrap.hidden=!opted||!customerId;
  rateWrap.style.display=opted&&customerId?"flex":"none";
  panel.hidden=!opted||!customerId;
  panel.style.display=opted&&customerId?"block":"none";
  const cleanPanel=document.getElementById("ktsCleanReviewPanel");
  if(cleanPanel)cleanPanel.style.display=opted?"block":"none";
  reset();
  if(customerId!=="quyt"&&customerId)status.textContent="Dùng THÊM TIN GỐC và GỘP CÁC TIN để xem thử hệ số của khách này; chưa được chuyển chủ.";
 }
 function notifyAll(){
  const fire=w=>{try{w.dispatchEvent(new Event("kts:quyt-selection-v1"))}catch(_){}};
  fire(ownTop);
  try{for(const f of ownTop.document.querySelectorAll("iframe"))if(f.contentWindow)fire(f.contentWindow)}catch(_){}
 }
 optIn.addEventListener("change",()=>{
  ownTop.__KTS_CUSTOMER_RATE_OPT_IN_V1__=optIn.checked===true;
  if(!optIn.checked){
   ownTop.__KTS_QUYT_CUSTOMER_ID_V1__="";
   ownTop.__KTS_QUYT_SELECTED_V1__=false;
   ownTop.__KTS_QUYT_SOURCE_V1__="";
   ownTop.__KTS_QUYT_RATE_V1__="1,067";
   confirmedRepeatSource=null;directMode=false;initialSourceBindAllowed=false;
   selectedMessageIds.clear();messageReviewActive=false;
   review.value="";copy.disabled=true;
  }
  notifyAll();
 });
 check.addEventListener("change",()=>{
  if(!optIn.checked){check.checked=false;return}
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
   if(customerId!=="quyt"){status.textContent="Hệ số nháp; bản gộp xem thử tính lại từ tin gốc; chưa được chuyển chủ.";return}
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
     region:selectedRegion?.value,
     businessDate:(document.getElementById("date")||document.getElementById("sharedDate"))?.value,
     omitRegion:selectedRegion?.value==="mb",
     repeatDecision:confirmedRepeatSource===original&&confirmedRepeatScope===repeatScope()?"keep_all":"ask_operator"
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
   const p=core.prepareExactGrouped(raw,{
    customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",alreadyTransformed:false,
    rate:rate.value,sourceText:original,region:selectedRegion?.value,
    businessDate:(document.getElementById("date")||document.getElementById("sharedDate"))?.value,
    cleanCore:window.KTSCleanAggregate,repeatDecision:confirmedRepeatSource===original&&confirmedRepeatScope===repeatScope()?"keep_all":"ask_operator",
    omitRegion:selectedRegion?.value==="mb"
   });
   review.value=p.preview;
   status.textContent=(directMode?"GỘP TỪ TIN GỐC ✓":"Quýt ✓")+
    " | hệ số ×"+p.rate.replace(".",",")+
    " | GỘP từ tiền gốc → nhân một lần → hiển thị chính xác; HOLD chuyển chủ vì chưa duyệt làm tròn. "+
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
  confirmedRepeatScope=repeatScope();
  refresh();
 });
 direct.addEventListener("click",()=>{
  if(optIn.checked&&!enabled()&&customerId==="quyt"&&input.value.trim()){
   ownTop.__KTS_QUYT_SELECTED_V1__=true;
   ownTop.__KTS_QUYT_SOURCE_V1__=input.value;notifyAll();
  }
  if(!enabled()){status.textContent="HOLD: chỉ Quýt được xem trước tiền; hãy chọn Quýt và dán tin.";return;}
  // One explicit confirmation in this path; blue clean-review is optional.
  const original=input.value;
  const selectedRegion=document.getElementById("region")||document.getElementById("sharedRegion");
  const selectedDate=document.getElementById("date")||document.getElementById("sharedDate");
  try{
   const cleaner=window.KTSCleanAggregate;
   if(!cleaner||typeof cleaner.preview!=="function")throw Error("CLEAN_CORE_REQUIRED");
   const p=cleaner.preview(original,{
    region:selectedRegion?.value,businessDate:selectedDate?.value,
    omitRegion:selectedRegion?.value==="mb",repeatDecision:"ask_operator"
   });
   if(p.requiresConfirmation&&
      !(confirmedRepeatSource===original&&confirmedRepeatScope===repeatScope())){
    const yes=window.confirm(
     "Phát hiện "+p.repeated.length+" đoạn cược lặp. Xác nhận TẤT CẢ đều là lượt khách đặt thật (không phải dán nhầm)? "+
     "Giữ "+p.rawClauses+" lượt, tiền gốc "+p.rawTotal+
     "n; chỉ xem trước sau khi nhân hệ số một lần. Không chuyển/gửi tiền."
    );
    if(!yes){
     review.value="";copy.disabled=true;
     status.textContent="HOLD: các lượt trùng chưa được xác nhận. Tin gốc không đổi.";
     return;
    }
    confirmedRepeatSource=original;confirmedRepeatScope=repeatScope();
   }
  }catch(e){
   review.value="";copy.disabled=true;
   status.textContent="HOLD: "+String(e?.message||e);
   return;
  }
  directMode=true;
  refresh();
 });

 // Independent manually entered messages retain their own persistent identity.
 // This path remains review-only and never writes to the normal wager ledger.
 const sourceTools=document.createElement("div");sourceTools.style.cssText="padding:8px;border:1px solid #bbb;margin:6px 0";
 const addMessage=document.createElement("button");addMessage.type="button";addMessage.id="ktsReviewAddMessage";addMessage.textContent="THÊM TIN GỐC";
 const mergeMessages=document.createElement("button");mergeMessages.type="button";mergeMessages.id="ktsReviewMergeMessages";mergeMessages.textContent="GỘP CÁC TIN ĐÃ THÊM — CHỈ XEM";
 const sourceStatus=document.createElement("div");sourceStatus.id="ktsReviewMessageStatus";sourceStatus.setAttribute("role","status");
 const sourceList=document.createElement("div");sourceList.id="ktsReviewMessageList";sourceList.style.cssText="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px";
 sourceTools.append(addMessage,mergeMessages,sourceStatus,sourceList);panel.append(sourceTools);
 let messageReviewActive=false;
 const selectedMessageIds=new Set();
 function messageScope(){
  const market=(document.getElementById("region")||document.getElementById("sharedRegion"))?.value;
  const date=(document.getElementById("date")||document.getElementById("sharedDate"))?.value;
  if(!optIn.checked||customerStorageInvalid||!profile())throw Error("cần tích Khách & tỷ lệ và chọn khách hợp lệ; không tự suy đoán khách.");
  if(!market||!date)throw Error("HOLD: cần chọn miền và ngày trước khi thêm/gộp tin.");
  if(!window.KTSReviewSourceMessages)throw Error("HOLD: thiếu mô-đun lưu tin.");
  return {market,date,store:window.KTSReviewSourceMessages.createStore(window.localStorage)};
 }
 function scopedMessages(scope){return scope.store.read().filter(m=>m.customer_id===customerId&&m.market===scope.market&&m.business_date===scope.date)}
 function renderMessages(){
  review.value="";copy.disabled=true;sourceList.textContent="";
  try{
   const scope=messageScope(),all=scopedMessages(scope);
   for(const message of all){
    const label=document.createElement("label");label.style.cssText="display:block;white-space:pre-wrap;margin:6px 0";
    const box=document.createElement("input");box.type="checkbox";box.checked=selectedMessageIds.has(message.source_message_id);
    box.setAttribute("aria-label","Chọn tin "+message.source_message_id);
    box.addEventListener("change",()=>{if(box.checked)selectedMessageIds.add(message.source_message_id);else selectedMessageIds.delete(message.source_message_id);renderMessages()});
    const text=document.createElement("span");text.textContent=" ["+message.source_message_id+"]\n"+message.original_text;
    label.append(box,text);sourceList.append(label);
   }
   const messages=all.filter(m=>selectedMessageIds.has(m.source_message_id));
   if(!messageReviewActive){sourceStatus.textContent="Đã chọn "+messages.length+" / "+all.length+" tin gốc cho khách/ngày/miền.";return}
   if(!messages.length)throw Error("hãy chọn ít nhất một tin gốc để gộp.");
   const result=window.KTSReviewSourceMessages.aggregate(messages,{core,cleanCore:window.KTSCleanAggregate,customerId,market:scope.market,businessDate:scope.date,rate:rate.value});
   review.value=result.entries.map(e=>e.station.toUpperCase()+" "+e.number+" "+e.kind+" "+e.original+"n → "+e.exact+"n (chưa duyệt làm tròn)").join("\n");
   sourceStatus.textContent="REVIEW: "+messages.length+" tin gốc, "+result.entries.length+" số/loại; hệ số ×"+result.rate+". HOLD chuyển chủ và Copy/Cắt.";
  }catch(e){sourceStatus.textContent="HOLD: "+String(e.message||e);status.textContent=sourceStatus.textContent}
 }
 addMessage.addEventListener("click",async()=>{
  try{
   const scope=messageScope();if(!input.value.trim())throw Error("chưa có tin gốc");
   if(!window.confirm("Xác nhận đây là MỘT LƯỢT TIN ĐỘC LẬP của khách "+profile().name+" cho ngày "+scope.date+", miền "+scope.market+"? Mỗi lần thêm sẽ được tính là một lượt riêng.")){
    messageReviewActive=false;review.value="";sourceStatus.textContent="HOLD: chưa xác nhận khách và lượt tin; không lưu.";return;
   }
   if(!window.crypto||typeof window.crypto.randomUUID!=="function")throw Error("không tạo được ID tin an toàn");
   const now=new Date().toISOString();
   const id="manual-"+window.crypto.randomUUID();
   await scope.store.addLocked({source_message_id:id,customer_id:customerId,original_text:input.value,source_system:"manual",received_at:now,source_timestamp:now,market:scope.market,business_date:scope.date},window.navigator?.locks);
   selectedMessageIds.add(id);messageReviewActive=false;renderMessages();sourceStatus.textContent="Đã lưu một tin gốc riêng. "+sourceStatus.textContent;
  }catch(e){review.value="";sourceStatus.textContent="HOLD: "+String(e.message||e)}
 });
 mergeMessages.addEventListener("click",()=>{messageReviewActive=true;renderMessages()});
 selector.addEventListener("change",()=>{messageReviewActive=false;renderMessages()});
 rate.addEventListener("input",()=>{if(messageReviewActive)renderMessages()});
 for(const id of ["region","sharedRegion","date","sharedDate"]){const node=document.getElementById(id);if(node)node.addEventListener("change",()=>{messageReviewActive=false;renderMessages()})}

 // Existing run(), Clear/Cut/Undo sometimes update textarea.value without input.
 for(const id of ["runBtn","dvRun","clearBtn","dvClear","undoBtn","cutBtn",
                  "dvCutSelection","sourceCutBtn","dvSourceCut","ledgerWorkCut"]){
   const button=document.getElementById(id);
   if(button)button.addEventListener("click",()=>{reset();setTimeout(refresh,100)});
 }
 input.addEventListener("input",()=>{
  confirmedRepeatSource=null;
  if(initialSourceBindAllowed && optIn.checked && customerId==="quyt" &&
     !checkedSource && input.value.trim() &&
     !input.value.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")){
   // Only bind a fully parsed initial source, never partial typing. Do not
   // compute/copy/dispatch any amount or change the immutable source itself.
   try{
    const selectedRegion=document.getElementById("region")||document.getElementById("sharedRegion");
    const cleaner=window.KTSCleanAggregate;
    if(!cleaner||typeof cleaner.parse!=="function")throw Error("CLEAN_CORE_REQUIRED");
    cleaner.parse(input.value,{region:selectedRegion?.value,
     businessDate:(document.getElementById("date")||document.getElementById("sharedDate"))?.value});
    core.parseRate(rate.value);
    initialSourceBindAllowed=false;
    ownTop.__KTS_QUYT_SELECTED_V1__=true;
    ownTop.__KTS_QUYT_SOURCE_V1__=input.value;
    notifyAll();
    reset();
    return;
   }catch(_){reset();return}
  }
  if(enabled()&&checkedSource!==input.value){
    clearSelection("HOLD: nguồn thay đổi; kết quả cũ vô hiệu, hệ số nháp trả về hệ số đã lưu.");return;
  }
  reset();
 });
 const region=document.getElementById("region")||document.getElementById("sharedRegion");
 if(region)region.addEventListener("change",()=>{
  confirmedRepeatScope=null;
  if(enabled())clearSelection("HOLD: miền/đài đã đổi, Quýt và hệ số trở về mặc định.");
  else {confirmedRepeatSource=null;reset()}
 });
 for(const id of ["date","sharedDate"]){
  const node=document.getElementById(id);
  if(node)node.addEventListener("change",()=>{
   confirmedRepeatSource=null;confirmedRepeatScope=null;
   directMode=false;review.value="";copy.disabled=true;
   status.textContent="HOLD: ngày đã đổi, cần kiểm tra lại nguồn và xác nhận trùng.";
  });
 }
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
    // The isolated ticket-review panel owns its validated Copy/Cut routing.
    // This older listener is registered first and previously stopped its
    // newer capture listener before it could copy the correctly merged ticket.
    const mergedPanel=document.getElementById("ktsTicketMergePanel");
    if(mergedPanel&&customerId==="quyt"&&typeof window.KTSQuytTicketReview?.ticket==="function")return;
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
