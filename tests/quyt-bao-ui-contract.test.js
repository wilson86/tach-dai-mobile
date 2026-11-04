"use strict";
// Pure static review. Real Chrome and Windows native Node must run separately.
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const root=read("index.html"),ui=read("quyt-bao-review-ui.js"),sw=read("sw.js");
test("Quyt identity off by default; versioned customer preferences persist separately",()=>{
 assert.ok(ui.includes('input.insertAdjacentElement("afterend",label)'));
 assert.ok(ui.includes('check.type="checkbox"'));
 assert.ok(ui.includes('const requested=customerId==="quyt"&&ownTop.__KTS_QUYT_SELECTED_V1__===true'));
 assert.ok(ui.includes("KTS_REVIEW_CUSTOMERS_V1"));
 assert.ok(read("customer-config-review.js").includes("storage.setItem"));
 assert.ok(!ui.includes("sessionStorage.setItem"));
 assert.ok(ui.includes("checkedSource!==input.value"));
 assert.ok(ui.includes("ownTop.__KTS_QUYT_SOURCE_V1__"));
 assert.ok(ui.includes('rate.id="ktsQuytRate"'));
 assert.ok(ui.includes('rate.type="text"'));
 assert.ok(ui.includes('rate.inputMode="decimal"'));
 assert.ok(ui.includes('rate.value="1,067"'));
 assert.ok(ui.includes('rate.addEventListener("input"'));
 assert.ok(ui.includes("ownTop.__KTS_QUYT_RATE_V1__"));

});
test("source and canonical ledger are never rewritten",()=>{
 assert.ok(!/input\.value\s*=\s*|output\.value\s*=\s*/u.test(ui));
 assert.ok(ui.includes('original.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")'));
 assert.ok(ui.includes('stage:"PREPARED_PREVIEW_ONLY"')||read("quyt-bao-review.js").includes('stage:"PREPARED_PREVIEW_ONLY"'));
});
test("normal copy intercepted only when Quyt selected",()=>{
 assert.ok(ui.includes("if(!enabled())return"));
 assert.ok(ui.includes("event.stopImmediatePropagation()"));
 assert.ok(ui.includes('const resultActions=["dvCopy","copyBtn","cutBtn","dvCutSelection"'));
 assert.ok(ui.includes('"ledgerWorkCopy","ledgerWorkCut","sourceCutBtn","dvSourceCut"]'));
 assert.ok(ui.includes('output.addEventListener(type,event=>'));
 assert.ok(ui.includes('event.stopImmediatePropagation()'));
 assert.ok(ui.includes('const ROUTER_ONCE_ONLY_RECEIPT_VERIFIED=false'));
 assert.ok(ui.includes('copy.disabled=!ROUTER_ONCE_ONLY_RECEIPT_VERIFIED'));
 assert.ok(ui.includes('review.addEventListener(type,event=>'));
 assert.ok(ui.includes('ownTop.__KTS_QUYT_RATE_V1__=profile()?.rate||"1,067";'));
 assert.ok(ui.includes('clearSelection("HOLD: miền/đài đã đổi'));
 assert.ok(!ui.includes('navigator.clipboard.writeText'));
 assert.ok(ui.includes('rate:rate.value'));
 assert.ok(ui.includes('kts:quyt-selection-v1'));
});
test("all same-origin Unified iframes get the one customer checkbox state",()=>{
 assert.ok(ui.includes("ownTop.__KTS_QUYT_SELECTED_V1__"));
 assert.ok(ui.includes("ownTop.document.querySelectorAll("));
 assert.ok(ui.includes("kts:quyt-selection-v1"));
});
test("Quyt now verifies per-number exposure then groups BEFORE factor",()=>{
 const pure=read("quyt-bao-review.js");
 assert.ok(ui.includes("core.prepareExactGrouped(raw"));
 assert.ok(ui.includes('direct.id="ktsQuytDirectMerge"'));
 assert.ok(ui.includes("cleaner.preview(original"));
 assert.ok(ui.includes("directMode=true;"));
 assert.ok(ui.includes("merged.status!==\"REVIEW_ONLY\""));

 assert.ok(ui.includes("sourceText:original,region:selectedRegion?.value"));
 assert.ok(ui.includes("cleanCore:window.KTSCleanAggregate"));
 assert.ok(pure.includes("SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD"));
 assert.ok(pure.includes("groupedBeforeFactor:true"));
 assert.ok(pure.includes("for(const e of src.map.values())"));
 assert.ok(ui.includes("DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED"));
 assert.ok(ui.includes("confirmedRepeatSource=input.value"));
 assert.ok(ui.includes("Xác nhận khách đánh thêm"));
});
test("browser caching and HTML include exact review-only JS",()=>{
 for(const n of ["quyt-bao-review.js","quyt-bao-review-ui.js"]){
  assert.ok(root.includes('src="./'+n+'"'));
  assert.ok(sw.includes('"./'+n+'"'));
 }
 assert.ok(sw.includes("clean-r2-quyt-r24f-station-required-hold"));
});
test("no auto dispatch, no paid CI, and no modified production source",()=>{
 for(const name of ["telegram.send","sendMessage(","fetch('/api/send","npm install","gh workflow run"]){
  assert.ok(!ui.includes(name),name);
 }
});

test("synthetic DOM: switching source or region clears Quyt and resets default rate",()=>{
 const vm=require("node:vm");
 const elements=[],byId={},handlers={};
 const create=tag=>{
  const node={tag,style:{},listeners:{},attrs:{},value:"",hidden:false,disabled:false,
   checked:false,textContent:"",
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
   dispatchEvent(evt){for(const fn of this.listeners[evt.type]??[])fn(evt)},
   insertAdjacentElement(){},append(){},setAttribute(k,v){this.attrs[k]=v}};
  elements.push(node);return node;
 };
 for(const id of ["input","output","region","runBtn"]){
  byId[id]=create(id);byId[id].id=id;
 }
 const document={readyState:"complete",createElement:create,
  getElementById:id=>byId[id]||elements.find(e=>e.id===id),
  querySelectorAll:()=>[]};
 const window={document,localStorage:{getItem:()=>null,setItem:()=>{}},location:{origin:"http://127.0.0.1"},
  addEventListener(type,fn){(handlers[type]??=[]).push(fn)},
  dispatchEvent(evt){for(const fn of handlers[evt.type]??[])fn(evt)}};
 window.top=window;window.KTSCustomerConfig=require("../customer-config-review.js");
 window.KTSQuytBaoReview={parseRate:()=>{},
  prepareExactGrouped:()=>({preview:"43 b107n",rate:"1.067",aggregatedExposures:1})};
 const dispatch=(node,type)=>{
  const evt={type,preventDefault(){this.prevented=true},
   stopImmediatePropagation(){this.stopped=true}};
  node.dispatchEvent(evt);return evt;
 };
 vm.runInNewContext(ui,{window,document,location:window.location,
  Event:function Event(type){this.type=type},
  setTimeout:fn=>fn(),navigator:{clipboard:{writeText:()=>{throw Error("UNSAFE_COPY")}}}},
  {filename:"quyt-bao-review-ui.js",timeout:1000});
 const toggle=document.getElementById("ktsCustomerRateToggle");
 toggle.checked=true;dispatch(toggle,"change");
 const choose=document.getElementById("ktsReviewCustomer");choose.value="quyt";dispatch(choose,"change");
 const input=byId.input,output=byId.output,region=byId.region,
  run=byId.runBtn,check=document.getElementById("ktsQuytCheckbox"),
  rate=document.getElementById("ktsQuytRate"),
  copy=elements.find(x=>x.tag==="button"&&x.textContent?.includes("Copy Quýt")),
  review=elements.find(x=>x.tag==="textarea"&&x.readOnly===true),
  status=elements.find(x=>x.attrs.role==="status");
 input.value=output.value="43 b100n";region.value="mb";
 check.checked=true;dispatch(check,"change");
 rate.value="1,10";dispatch(rate,"input");
 input.value="44 b100n";dispatch(input,"input");
 assert.equal(check.checked,false);assert.equal(rate.value,"1,067");
 assert.equal(window.__KTS_QUYT_RATE_V1__,"1,067");
 check.checked=true;dispatch(check,"change");
 region.value="mn";dispatch(region,"change");
 assert.equal(check.checked,false);assert.equal(rate.value,"1,067");
 region.value="mb";check.checked=true;dispatch(check,"change");
 dispatch(run,"click");assert.equal(copy.disabled,true);
 const evt=dispatch(review,"copy");
 assert.equal(evt.prevented,true);assert.match(status.textContent,/HOLD/);
});

test("Quyt direct review groups pasted source without Tách output and never authorizes sending",()=>{
 const vm=require("node:vm");
 const nodes=[],byId={},handlers={};
 function create(tag){
  const node={tag,style:{},listeners:{},attrs:{},value:"",hidden:false,disabled:false,
   checked:false,textContent:"",
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
   dispatchEvent(evt){for(const fn of this.listeners[evt.type]??[])fn(evt)},
   insertAdjacentElement(){},append(){},setAttribute(k,v){this.attrs[k]=v}};
  nodes.push(node);return node;
 }
 for(const id of ["input","output","region"]){byId[id]=create(id);byId[id].id=id}
 const document={readyState:"complete",createElement:create,
  getElementById:id=>byId[id]||nodes.find(x=>x.id===id),
  querySelectorAll:()=>[]};
 const window={document,localStorage:{getItem:()=>null,setItem:()=>{}},location:{origin:"http://127.0.0.1"},
  addEventListener(type,fn){(handlers[type]??=[]).push(fn)},
  dispatchEvent(evt){for(const fn of handlers[evt.type]??[])fn(evt)}};
 window.top=window;window.KTSCustomerConfig=require("../customer-config-review.js");
 window.KTSCleanAggregate=require("../clean-aggregate-review.js");
 window.KTSQuytBaoReview=require("../quyt-bao-review.js");
 const dispatch=(node,type)=>{
  const event={type,preventDefault(){this.prevented=true},
   stopImmediatePropagation(){this.stopped=true}};
  node.dispatchEvent(event);return event;
 };
 vm.runInNewContext(ui,{window,document,location:window.location,
  Event:function Event(type){this.type=type},
  setTimeout:fn=>fn(),navigator:{clipboard:{writeText(){throw Error("SEND_FORBIDDEN")}}}},
  {filename:"quyt-bao-review-ui.js",timeout:1000});
 const toggle=document.getElementById("ktsCustomerRateToggle");
 toggle.checked=true;dispatch(toggle,"change");
 const choose=document.getElementById("ktsReviewCustomer");choose.value="quyt";dispatch(choose,"change");
 const input=byId.input,output=byId.output,region=byId.region,
  check=document.getElementById("ktsQuytCheckbox"),
  direct=document.getElementById("ktsQuytDirectMerge"),
  review=nodes.find(x=>x.tag==="textarea"&&x.readOnly),
  keep=nodes.find(x=>x.tag==="button"&&x.textContent?.includes("GIỮ ĐỦ")),
  copy=nodes.find(x=>x.tag==="button"&&x.textContent?.includes("Copy Quýt")),
  status=nodes.find(x=>x.attrs.role==="status");
 assert.ok(direct);
 input.value="43 b100n 43 b50n 34 lo2n";
 region.value="mb";output.value="";
 check.checked=true;dispatch(check,"change");dispatch(direct,"click");
 assert.match(review.value,/43 b 150n → 160\.05n/);
 assert.match(review.value,/34 lo 2n → 2\.134n/);
 assert.equal(input.value,"43 b100n 43 b50n 34 lo2n");
 assert.equal(output.value,"");
 assert.equal(copy.disabled,true);
 assert.match(status.textContent,/GỘP TỪ TIN GỐC/);
 // Source edits reset customer identity and hold the old preview.
 input.value="43 b1n 43 b1n";dispatch(input,"input");
 assert.equal(check.checked,false);
 check.checked=true;dispatch(check,"change");dispatch(direct,"click");
 assert.equal(review.value,"");
 assert.equal(keep.hidden,false);
 assert.match(status.textContent,/HOLD/);
 dispatch(keep,"click");
 assert.match(review.value,/43 b 2n → 2\.134n/);
 assert.equal(copy.disabled,true);
 const copyEvt=dispatch(review,"copy");
 assert.equal(copyEvt.prevented,true);
 input.value="43 b1n unknown";dispatch(input,"input");
 check.checked=true;dispatch(check,"change");dispatch(direct,"click");
 assert.equal(review.value,"");
 assert.match(status.textContent,/HOLD/);
});


test("review customer dropdown has stable IDs and versioned save-only configuration",()=>{
 const s=read("quyt-bao-review-ui.js");
 for(const id of ["ktsReviewCustomer","ktsReviewCustomerName","ktsReviewAddCustomer",
 "ktsReviewRenameCustomer","ktsReviewRetireCustomer","ktsReviewSaveRate","ktsReviewRateHistory"])
  assert.ok(s.includes(id),id);
 assert.ok(s.includes("KTS_REVIEW_CUSTOMERS_V1"));
 assert.ok(read("customer-config-review.js").includes("id:'hien',name:'Hiền',rate:'1,000'"));
 assert.ok(read("customer-config-review.js").includes("id:'quyt',name:'Quýt',rate:'1,067'"));
 assert.ok(s.includes("customerId==="+"\"quyt\""));
 assert.ok(s.includes("core.parseRate(rate.value)"));
 assert.ok(read("customer-config-review.js").includes("storage.setItem"));
 assert.ok(s.includes("p.history.push"));
 assert.ok(s.includes("customer_id không thay đổi"));
 assert.ok(s.includes("chưa được chuyển chủ"));
 assert.ok(s.includes("customerStorageInvalid||!profile()"));
 assert.ok(!s.includes("fetch('/api/"));
});

test("opt-in UI and canonical alias are explicit and reversible",()=>{
 assert.ok(ui.includes('optIn.id="ktsCustomerRateToggle"'));
 assert.ok(ui.includes('ownTop.__KTS_CUSTOMER_RATE_OPT_IN_V1__'));
 assert.ok(ui.includes('bar.style.display=opted?"flex":"none"'));
 assert.ok(ui.includes('panel.style.display=opted&&customerId?"block":"none"'));
 assert.ok(ui.includes('cleanPanel.style.display=opted?"block":"none"'));
 assert.ok(root.includes('(?:dui|đui)'));
 assert.ok(ui.includes('if(!enabled())return'));
});

test("only Khách & tỷ lệ is visible; legacy Quýt checkbox stays private and inaccessible",()=>{
 assert.ok(ui.includes('optIn.id="ktsCustomerRateToggle"'));
 assert.ok(ui.includes('optInLabel.append(optIn,optInText)'));
 assert.ok(ui.includes('label.hidden=true;label.style.display="none"'));
 assert.ok(ui.includes('label.setAttribute("aria-hidden","true")'));
 assert.ok(ui.includes('check.tabIndex=-1'));
 // The Quýt checkbox remains internal source-binding state, not a second user toggle.
 assert.ok(ui.includes('customerId==="quyt"&&Boolean(input.value.trim())'));
 assert.ok(ui.includes('if(!enabled())return'));
 assert.ok(ui.includes('bar.style.display=opted?"flex":"none"'));
 assert.ok(ui.includes('panel.style.display=opted&&customerId?"block":"none"'));
});
