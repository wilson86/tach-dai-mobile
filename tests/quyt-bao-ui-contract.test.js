"use strict";
// Pure static review. Real Chrome and Windows native Node must run separately.
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const root=read("index.html"),ui=read("quyt-bao-review-ui.js"),sw=read("sw.js");
test("Quyt checkbox is in chat input, off by default, not persisted",()=>{
 assert.ok(ui.includes('input.insertAdjacentElement("afterend",label)'));
 assert.ok(ui.includes('check.type="checkbox"'));
 assert.ok(ui.includes('const requested=ownTop.__KTS_QUYT_SELECTED_V1__===true'));
 assert.ok(!ui.includes("localStorage.setItem"));
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
 assert.ok(ui.includes('ownTop.__KTS_QUYT_RATE_V1__="1,067";'));
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
 assert.ok(ui.includes("core.prepareGrouped(raw"));
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
 assert.ok(sw.includes("clean-r2-quyt-r11"));
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
 const window={document,location:{origin:"http://127.0.0.1"},
  addEventListener(type,fn){(handlers[type]??=[]).push(fn)},
  dispatchEvent(evt){for(const fn of handlers[evt.type]??[])fn(evt)}};
 window.top=window;
 window.KTSQuytBaoReview={parseRate:()=>{},
  prepareGrouped:()=>({preview:"43 b107n",rate:"1.067",aggregatedExposures:1})};
 const dispatch=(node,type)=>{
  const evt={type,preventDefault(){this.prevented=true},
   stopImmediatePropagation(){this.stopped=true}};
  node.dispatchEvent(evt);return evt;
 };
 vm.runInNewContext(ui,{window,document,location:window.location,
  Event:function Event(type){this.type=type},
  setTimeout:fn=>fn(),navigator:{clipboard:{writeText:()=>{throw Error("UNSAFE_COPY")}}}},
  {filename:"quyt-bao-review-ui.js",timeout:1000});
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
