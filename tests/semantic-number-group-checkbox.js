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
const original="2d.219.b5n.xc25n.19.b15n";
async function main(){
  rules.initGroupedResults();
  rules.els.region.value="mn";
  rules.els.date.value="2026-10-14";
  rules.els.input.value=original;
  rules.run();
  const baseline=rules.els.output.value;
  const all=records();
  // A single physical line can contain TWO independent number+selector groups.
  assert.equal(groups().length,2,"two logical bet clauses; not one chat line");
  assert.deepEqual(Array.from(new Set(all.map(r=>r.sourceLine))),[1]);
  assert.equal(all.length,baseline.split("\n").length,"no created or dropped money rows");
  assert.deepEqual(Array.from(new Set(all.map(r=>r.sourceGroupNo))),[1,2]);
  const g1=groups()[0],g2=groups()[1];
  assert.match(g1.children[0].children[1].textContent,/219 b5n xc25n/u);
  assert.match(g2.children[0].children[1].textContent,/19 b15n/u);
  const firstLines=all.filter(r=>r.sourceGroupNo===1).map(r=>r.text);
  const secondLines=all.filter(r=>r.sourceGroupNo===2).map(r=>r.text);
  assert.ok(firstLines.length>0&&secondLines.length>0);
  // Records originate in the VM; normalize to the host realm before strict comparison.
  assert.deepEqual(Array.from(firstLines.concat(secondLines)),baseline.split("\n"),"source-order and stake conservation");
  // Choosing the first group cannot accidentally select another group's rows.
  g1.children[0].children[0].checked=true;
  g1.children[0].children[0].events.change();
  assert.match(els.resultGroupsSummary.textContent,new RegExp(`Đã chọn ${firstLines.length}/${all.length}`));
  await rules.copyOutput();
  assert.equal(clipboard.text,firstLines.join("\n"),"copy only selected semantic clause");
  await rules.cutSelectedOutput();
  assert.equal(clipboard.text,firstLines.join("\n"),"cut clipboard scope");
  assert.equal(groups().length,1);
  assert.match(rules.els.input.value,/^\[\[KTS_EXACT_OUTPUT_LEDGER_V1\]\]/u,"partial cut keeps exact result ledger and original source");
  assert.equal(els.ledgerWorkOrigin.textContent,original,"original source remains auditable");
  assert.equal(els.ledgerSourceView.value,secondLines.join("\n"),"working view contains only surviving result rows");
  assert.equal(rules.els.output.value,secondLines.join("\n"));
  const afterCut=rules.els.output.value;
  rules.run();
  assert.equal(rules.els.output.value,afterCut,"rerunning remaining source cannot resurrect cut wagers");
  rules.undo();
  assert.equal(rules.els.input.value,original,"undo restores exact dotted source");
  assert.equal(rules.els.output.value,baseline,"undo restores all group outputs");
  assert.equal(groups().length,2);
  // A single child wager uses the explicit lossless ledger when the parent
  // source cannot reproduce just the surviving child rows.
  const firstRow=groups()[0].children[1].children[0];
  firstRow.checked=true;firstRow.events.change();
  await rules.copyOutput();
  assert.equal(clipboard.text,all[0].text);
  await rules.cutSelectedOutput();
  assert.match(rules.els.input.value,/^\[\[KTS_EXACT_OUTPUT_LEDGER_V1\]\]/u,"child Cut persists a labelled exact ledger");
  assert.equal(rules.els.output.value,all.slice(1).map(r=>r.text).join("\n"),"child Cut preserves every sibling exactly");
  rules.run();
  assert.equal(rules.els.output.value,all.slice(1).map(r=>r.text).join("\n"),"rerun from ledger cannot resurrect cut output");
  rules.undo();
  assert.equal(rules.els.input.value,original,"undo restores source before child Cut");
  assert.equal(rules.els.output.value,baseline,"undo restores source before child Cut");
  // Select all then full Cut clears both logical groups atomically.
  els.selectAllOutputBtn.events.click();
  assert.match(els.resultGroupsSummary.textContent,new RegExp(`Đã chọn ${all.length}/${all.length}`));
  await rules.cutSelectedOutput();
  assert.equal(JSON.parse(rules.els.input.value.split('\n').slice(1).join('\n')).origin,original);
  assert.equal(JSON.parse(rules.els.input.value.split('\n').slice(1).join('\n')).rows.length,0);
  assert.equal(rules.els.output.value,"");
  assert.equal(groups().length,0);
  rules.undo();
  assert.equal(rules.els.input.value,original);
  assert.equal(rules.els.output.value,baseline);
  // Rejecting invalid source clears all checkbox groups, visibly shows raw error.
  // Duplicate DX numbers are hard-rejected; singleton DX is NEEDS_ORACLE.
  rules.els.input.value="2d 52 52 dx5n";
  rules.run();
  assert.equal(groups().length,0);
  assert.match(rules.els.output.value,/PHÁT HIỆN TIN SAI:/u);
  assert.equal(rules.els.output.style.display,"");
  // Physical separators never become a wager group.
  rules.els.input.value=original+"\n--//-----//--\n3d 43 83 b10n";
  rules.run();
  assert.equal(groups().length,3,"2 source clauses + 1 other valid line");
  assert.deepEqual(Array.from(new Set(records().map(r=>r.sourceLine))),[1,3]);
  console.log("SEMANTIC NUMBER GROUP CHECKBOX: PASS");
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
