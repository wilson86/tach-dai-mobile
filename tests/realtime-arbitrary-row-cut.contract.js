"use strict";
// Direct PWA DOM-level grouped-checkbox UX regression, offline Node VM only.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const calendar=fs.readFileSync(path.join(root,"station_calendar.generated.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const embedded=html.match(/<script>\s*([\s\S]*?)<\/script>/i);
assert.ok(embedded);
const script=embedded[1].slice(0,embedded[1].indexOf("loadSettings();"));
assert.ok(script.includes("function initGroupedResults"));
const els=Object.create(null), clipboard={text:""};
function element(tag="div"){
  const obj={
    tag,children:[],events:{},className:"",style:{},value:"",textContent:"",
    checked:false,selectionStart:0,selectionEnd:0,
    classList:{add(name){obj.className+=" "+name;}},
    addEventListener(name,handler){this.events[name]=handler;},
    appendChild(child){this.children.push(child);child.parentNode=this;},
    append(...children){for(const child of children)this.appendChild(child);},
    replaceChildren(...children){this.children=[];this.append(...children);},
    setAttribute(){},removeAttribute(){},focus(){},select(){},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
    remove(){}
  };
  return obj;
}
const ctx={
  console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
  navigator:{clipboard:{async writeText(text){clipboard.text=text;}}},
  document:{
    getElementById(id){return els[id]||(els[id]=element(id));},
    createElement:element,body:{appendChild(){}},execCommand(){return true;},
    addEventListener(){}
  }
};
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+script+
  "\nglobalThis.__rules={run,initGroupedResults,cutSelectedOutput,copyOutput,getRecords:()=>outputRecords.map(r=>({...r})),undo:()=>document.getElementById('undoBtn').events.click(),els:{input:inputEl,output:outputEl,region:regionEl,date:dateEl}};",
  ctx);
const rules=ctx.__rules;
const groups=()=>els.resultGroups.children;
const records=()=>rules.getRecords();


// RED CONTRACT — owner requires every checked result row to be cuttable;
// live working-source and result must reflect remaining wagers immediately.
// No business-money recomputation is allowed. Run directly with native Node.
async function main(){
  rules.initGroupedResults();
  rules.els.region.value="mn";
  rules.els.date.value="2026-10-15";
  const src="2d 89 98 b5n dx2,5n";
  rules.els.input.value=src;
  rules.run();
  assert.equal(groups().length,1);
  const baseline=rules.els.output.value;
  assert.ok(baseline.split("\n").length>=3);
  const all=Array.from(records()).filter(r=>r.alive).map(r=>r.text);
  const dxIndex=all.findIndex(line=>/ dx2,5n$/u.test(line));
  assert.ok(dxIndex>=0,"DX output available for one-row CUT");
  const dxCheckbox=groups()[0].children[dxIndex+1].children[0];
  dxCheckbox.checked=true;dxCheckbox.events.change();
  const before=rules.els.input.value;
  await rules.cutSelectedOutput();
  const remaining=all.filter((_,i)=>i!==dxIndex);
  assert.equal(clipboard.text,all[dxIndex],"copy selected-only DX wager before deletion");
  assert.notEqual(rules.els.input.value,before,"working source must change *in same Cut event*");
  assert.deepEqual(Array.from(rules.els.output.value.split("\n")),remaining,"all other stakes unchanged");
  rules.run();
  assert.deepEqual(Array.from(rules.els.output.value.split("\n")),remaining,"re-run must not resurrect single-row cut");
  rules.undo();
  assert.equal(rules.els.input.value,src,"undo restores original input");
  assert.equal(rules.els.output.value,baseline,"undo restores complete output");

  // Stronger case: horizontal B child row has no valid unexpanded old-grammar
  // representation; implementation needs authoritative lossless output ledger
  // or a verified exact-row mode, not a guessed replacement amount.
  rules.els.input.value="2d 219 b5n";
  rules.run();
  const bBaseline=rules.els.output.value;
  const first=groups()[0].children[1].children[0];
  first.checked=true;first.events.change();
  const firstBet=records()[0].text;
  const remainingBet=Array.from(records()).filter(r=>r.alive).slice(1).map(r=>r.text);
  assert.ok(remainingBet.length>=1);
  await rules.cutSelectedOutput();
  assert.equal(clipboard.text,firstBet,"first split row copied");
  assert.deepEqual(Array.from(rules.els.output.value.split("\n")),remainingBet,"partial B exposure cut, no sibling loss");
  assert.notEqual(rules.els.input.value,"2d 219 b5n","top shows actual remaining source representation instantly");
  const persisted=rules.els.output.value;
  rules.run();
  assert.equal(rules.els.output.value,persisted,"no re-splitting remaining horizontal allocation");
  rules.undo();
  assert.equal(rules.els.input.value,"2d 219 b5n");
  assert.equal(rules.els.output.value,bBaseline);
  console.log("REALTIME ARBITRARY ROW CUT: PASS");
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
