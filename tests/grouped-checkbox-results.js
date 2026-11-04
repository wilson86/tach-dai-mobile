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
  localStorage:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})(),
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
const original="2d 52 25 dx5n\n--//-----//--\n3d 43 83 b10n";
async function main(){
  rules.initGroupedResults();
  rules.els.region.value="mn";rules.els.date.value="2026-10-13";
  rules.els.input.value=original;rules.run();
  assert.equal(groups().length,2,"group by original source line, never by station or multiplier");
  assert.deepEqual(Array.from(new Set(records().map(r=>r.sourceLine))),[1,3]);
  const baseline=rules.els.output.value;
  assert.equal(baseline.split("\n").length,records().length);
  assert.equal(rules.els.output.style.display,"none","checkbox UI replaces selectable textarea, but leaves audited output intact");
  // Group 1 checkbox copies/cuts only group-1 rows; other group remains.
  const firstGroupNode=groups()[0];
  const first=firstGroupNode.children[0].children[0];
  first.checked=true;first.events.change();
  assert.equal(groups()[0],firstGroupNode,"checking group does not replace/scroller-jump DOM");
  assert.equal(groups()[0].children[0].children[0],first,"focused checkbox stays attached");
  assert.equal(first.checked,true,"selection is reflected on same checkbox");
  const selected=records()[0].text;
  await rules.copyOutput();assert.equal(clipboard.text,selected);
  await rules.cutSelectedOutput();assert.equal(clipboard.text,selected);
  assert.ok(!rules.els.output.value.includes(selected));
  assert.equal(groups().length,1);
  assert.equal(records().filter(r=>r.alive).length,baseline.split("\n").length-1);
  assert.ok(rules.els.input.value.includes("3d 43 83 b10n"));
  rules.undo();assert.equal(rules.els.input.value,original);
  assert.equal(rules.els.output.value,baseline);
  assert.equal(groups().length,2);
  // Select all checkbox toggling does not transform source, ordering, stakes.
  els.selectAllOutputBtn.events.click();
  assert.match(els.resultGroupsSummary.textContent,/Đã chọn \d+\/\d+/u);
  await rules.copyOutput();assert.equal(clipboard.text,baseline);
  els.selectAllOutputBtn.events.click();
  assert.match(els.resultGroupsSummary.textContent,/Đã chọn 0\//u);
  // Full CUT clears all source and clipboard contains only wager lines.
  els.selectAllOutputBtn.events.click();
  await rules.cutSelectedOutput();
  assert.equal(rules.els.output.value,"");
  assert.equal(JSON.parse(rules.els.input.value.split('\n').slice(1).join('\n')).origin,original);
  assert.equal(JSON.parse(rules.els.input.value.split('\n').slice(1).join('\n')).rows.length,0);
  assert.equal(groups().length,0);
  rules.undo();assert.equal(rules.els.input.value,original);
  // Fail closed must still reveal textual errors, never display stale checkbox rows.
  // Duplicate DX numbers are an owner-approved hard rejection; N035 singleton
  // DX remains NEEDS_ORACLE and cannot serve as an unconditional negative.
  rules.els.input.value="2d 52 52 dx5n";rules.run();
  assert.equal(groups().length,0);
  assert.match(rules.els.output.value,/PHÁT HIỆN TIN SAI:/u);
  assert.equal(rules.els.output.style.display,"");
  // Real Telegram exported chat: show stripped sender/time, preserve all wager
  // lines and original input via Undo even if region validation rejects it.
  const sourceChat="[10/16/2026 5:36 PM] Hiền: 92 82 da 10n\n"+
    "[10/16/2026 5:37 PM] Hiền: 68 86 39 da 5n\n"+
    "[10/16/2026 5:37 PM] Hiền: 26 68 da 3n\n26 86 da 3n";
  rules.els.input.value=sourceChat;
  rules.run();
  assert.equal(rules.els.input.value,
    "92 82 da 10n\n68 86 39 da 5n\n26 68 da 3n\n26 86 da 3n",
    "sender/time removed, continuation and money unchanged");
  rules.undo();
  assert.equal(rules.els.input.value,sourceChat,"Undo restores exact exported chat");

  console.log("GROUPED CHECKBOX RESULTS: PASS");
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
