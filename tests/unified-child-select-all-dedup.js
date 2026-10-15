"use strict";
// Browser-child UX integration guard: never duplicate an embedded PWA's
// native checkbox-aware Select All with a legacy text-area select button.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../app/unified-core.js"),"utf8");
const start=source.indexOf(";(function installUnifiedMobileUx(){");
// Delimit by the next installer, not a presentation comment: Da Vong's UI
// implementation evolved from tap buttons to checkbox rows.
const end=source.indexOf(";(function installDaVongCheckboxUx(){",start);
assert.ok(start>=0 && end>start,"Unified frame UX installer must exist");
const installer=source.slice(start,end);

function child({native=true,groups=true,ghost=false}={}){
  const nodes=Object.create(null);
  function widget(id){
    const e={
      id,children:[],events:{},parentNode:null,
      addEventListener(type,fn){this.events[type]=fn;},
      appendChild(x){x.parentNode=this;this.children.push(x);if(x.id)nodes[x.id]=x;},
      insertBefore(x,before){x.parentNode=this;const at=this.children.indexOf(before);this.children.splice(at>=0?at:0,0,x);if(x.id)nodes[x.id]=x;},
      remove(){if(this.parentNode){const a=this.parentNode.children;const i=a.indexOf(this);if(i>=0)a.splice(i,1);} delete nodes[this.id];},
      closest(){return{querySelector:()=>id==="input"?inputActions:outputActions}},
      focus(){},setSelectionRange(){}
    };
    if(id)nodes[id]=e;
    return e;
  }
  const inputActions=widget("input-actions"),outputActions=widget("output-actions");
  widget("input");widget("output");
  if(native){widget("selectAllInputBtn");widget("selectAllOutputBtn");}
  if(groups)widget("resultGroups");
  if(ghost){outputActions.appendChild(widget("ktsTachSelectAllOutput"));}
  const doc={readyState:"complete",activeElement:null,
    getElementById:id=>nodes[id]||null,
    createElement:()=>widget(),
  };
  return {doc,inputActions,outputActions,nodes};
}
function frame(doc){
  return {contentDocument:doc,contentWindow:{},events:{},
    addEventListener(type,fn){this.events[type]=fn;}};
}
function mount(tach,ngang){
  const t=frame(tach.doc),n=frame(ngang.doc);
  const parent={readyState:"complete",getElementById(id){return id==="tachFrame"?t:id==="ngangFrame"?n:null;},
    querySelector(){return null;},createElement(){throw Error("Unexpected parent DOM injection");}};
  vm.runInNewContext(installer,{document:parent,console});
  return {t,n};
}
{
  const tach=child({native:true,groups:true}),ngang=child({native:true,groups:true});
  const {t,n}=mount(tach,ngang);
  for(const [ui,frame] of [[tach,t],[ngang,n]]){
    assert.equal(ui.outputActions.children.length,0,"no extra legacy select-all next to native checkbox controls");
    assert.equal(ui.inputActions.children.length,0,"do not duplicate native input selection button");
    frame.events.load();frame.events.load();
    assert.equal(ui.outputActions.children.length,0,"idempotent on iframe reload");
  }
}
{
  const tach=child({native:false,groups:false}),ngang=child({native:false,groups:false});
  const {t,n}=mount(tach,ngang);
  assert.equal(tach.outputActions.children.length,1,"legacy output fallback inserted");
  assert.equal(tach.inputActions.children.length,1,"legacy input fallback inserted");
  assert.equal(ngang.outputActions.children.length,1,"legacy ngang output fallback inserted");
  t.events.load();n.events.load();
  assert.equal(tach.outputActions.children.length,1,"legacy fallback not duplicated on reload");
  assert.equal(ngang.outputActions.children.length,1,"legacy fallback not duplicated on reload");
}
{
  const tach=child({native:true,groups:true,ghost:true}),ngang=child({native:true,groups:true});
  mount(tach,ngang);
  assert.equal(tach.outputActions.children.length,0,"remove older injected duplicate when checkbox selector exists");
}
{
  const tach=child({native:false,groups:true}),ngang=child({native:true,groups:true});
  mount(tach,ngang);
  assert.equal(tach.outputActions.children.length,0,"do not install a text-selector on grouped-checkbox output even without a native button");
}
console.log("UNIFIED CHILD SELECT-ALL DEDUP: PASS");
