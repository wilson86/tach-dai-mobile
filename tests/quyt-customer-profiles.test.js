"use strict";
// Node synthetic DOM contract. Chrome/Android acceptance is a separate gate.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","quyt-bao-review-ui.js"),"utf8");
const core=require("../quyt-bao-review.js");
function mount(store){
 const nodes=[],byId={},handlers={};
 function make(tag){
  const n={tag,style:{},value:"",textContent:"",hidden:false,disabled:false,
   checked:false,attrs:{},children:[],listeners:{},
   setAttribute(k,v){this.attrs[k]=v},
   addEventListener(k,f){(this.listeners[k]??=[]).push(f)},
   dispatchEvent(evt){for(const f of this.listeners[evt.type]??[])f(evt)},
   append(...xs){this.children.push(...xs)},
   insertAdjacentElement(){},focus(){}};
  nodes.push(n);return n;
 }
 for(const id of ["input","output","region"]){byId[id]=make(id);byId[id].id=id}
 const document={readyState:"complete",createElement:make,
  getElementById:id=>byId[id]||nodes.find(n=>n.id===id),querySelectorAll:()=>[]};
 const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const window={document,localStorage,location:{origin:"http://localhost"},
  addEventListener(k,f){(handlers[k]??=[]).push(f)},
  dispatchEvent(evt){for(const f of handlers[evt.type]??[])f(evt)}};
 window.top=window;window.KTSQuytBaoReview=core;
 const Event=function(type){this.type=type};
 vm.runInNewContext(source,{window,document,location:window.location,Event,
  setTimeout:fn=>fn()},{filename:"quyt-bao-review-ui.js",timeout:1000});
 return {get:id=>document.getElementById(id),byId,window,
  dispatch(id,type){document.getElementById(id).dispatchEvent({
   type,preventDefault(){this.prevented=true},
   stopImmediatePropagation(){this.stopped=true}})}};
}
test("customer dropdown changes only review state, not source or real routing",()=>{
 const store=new Map(),m=mount(store);
 assert.equal(m.get("ktsReviewCustomer").value,"");
 m.byId.input.value="43 b100n";
 m.get("ktsReviewCustomer").value="quyt";m.dispatch("ktsReviewCustomer","change");
 assert.equal(m.get("ktsQuytCheckbox").checked,true);
 assert.equal(m.get("ktsQuytRate").value,"1,067");
 m.get("ktsReviewCustomer").value="hien";m.dispatch("ktsReviewCustomer","change");
 assert.equal(m.get("ktsQuytCheckbox").checked,false);
 assert.equal(m.get("ktsQuytRate").value,"1,000");
 m.dispatch("ktsQuytDirectMerge","click");
 assert.match(m.get("ktsQuytPreparedPanel").textContent||m.get("ktsReviewCustomerStatus").textContent,/khách|HOLD/i);
 assert.equal(m.byId.input.value,"43 b100n");assert.equal(m.byId.output.value,"");
});
test("named customer has stable customer_id, independent rate and version history after reload",()=>{
 const store=new Map(),m=mount(store);
 m.get("ktsReviewCustomerName").value="Khách A";
 m.dispatch("ktsReviewAddCustomer","click");
 const saved=()=>JSON.parse(store.get("KTS_REVIEW_CUSTOMERS_V1"));
 const id=saved().customers.find(p=>p.name==="Khách A").id;
 assert.match(id,/^customer-[a-z0-9-]+$/);
 m.get("ktsQuytRate").value="1,05";m.dispatch("ktsQuytRate","input");
 m.dispatch("ktsReviewSaveRate","click");
 assert.equal(saved().customers.find(p=>p.id===id).rate,"1,05");
 assert.equal(saved().customers.find(p=>p.id===id).history.length,1);
 m.get("ktsReviewCustomerName").value="Khách B";m.dispatch("ktsReviewRenameCustomer","click");
 assert.equal(saved().customers.find(p=>p.id===id).name,"Khách B");
 const reload=mount(store);
 assert.equal(reload.get("ktsReviewCustomer").value,""); // no implied sender on F5
 reload.get("ktsReviewCustomer").value=id;reload.dispatch("ktsReviewCustomer","change");
 assert.equal(reload.get("ktsQuytRate").value,"1,05");
 assert.equal(reload.get("ktsQuytCheckbox").checked,false); // no authority to forward
 reload.dispatch("ktsReviewRetireCustomer","click");
 assert.equal(saved().customers.find(p=>p.id===id).active,false);
 assert.equal(saved().customers.find(p=>p.id===id).history.length,1);
});
test("invalid draft cannot replace saved coefficient, raw content unchanged",()=>{
 const store=new Map(),m=mount(store);
 m.get("ktsReviewCustomer").value="quyt";m.dispatch("ktsReviewCustomer","change");
 m.get("ktsQuytRate").value="NaN";m.dispatch("ktsQuytRate","input");
 m.dispatch("ktsReviewSaveRate","click");
 const saved=store.get("KTS_REVIEW_CUSTOMERS_V1");
 assert.ok(!saved || JSON.parse(saved).customers.find(p=>p.id==="quyt").rate==="1,067");
 assert.match(m.get("ktsReviewCustomerStatus").textContent,/HOLD/);
 assert.equal(m.byId.input.value,"");
});
