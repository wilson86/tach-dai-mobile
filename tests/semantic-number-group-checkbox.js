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
  assert.deepEqual(firstLines.concat(secondLines),baseline.split("\n"),"source-order and stake conservation");
  // Choosing the first group cannot accidentally select another group's rows.
  g1.children[0].children[0].checked=true;
  g1.children[0].children[0].events.change();
  assert.match(els.resultGroupsSummary.textContent,new RegExp(`Đã chọn ${firstLines.length}/${all.length}`));
  await rules.copyOutput();
  assert.equal(clipboard.text,firstLines.join("\n"),"copy only selected semantic clause");
  await rules.cutSelectedOutput();
  assert.equal(clipboard.text,firstLines.join("\n"),"cut clipboard scope");
  assert.equal(groups().length,1);
  assert.equal(rules.els.input.value,"2d 19 b15n","cut source deletes only completed number group");
  assert.equal(rules.els.output.value,secondLines.join("\n"));
  const afterCut=rules.els.output.value;
  rules.run();
  assert.equal(rules.els.output.value,afterCut,"rerunning remaining source cannot resurrect cut wagers");
  rules.undo();
  assert.equal(rules.els.input.value,original,"undo restores exact dotted source");
  assert.equal(rules.els.output.value,baseline,"undo restores all group outputs");
  assert.equal(groups().length,2);
  // A selected *single* row does not erase a group with other live output.
  const firstRow=groups()[0].children[1].children[0];
  firstRow.checked=true;firstRow.events.change();
  await rules.cutSelectedOutput();
  assert.equal(rules.els.input.value,original,"partial child wager retains all original source clauses");
  assert.equal(rules.els.output.value.split("\n").length,all.length-1);
  rules.undo();
  // Select all then full Cut clears both logical groups atomically.
  els.selectAllOutputBtn.events.click();
  assert.match(els.resultGroupsSummary.textContent,new RegExp(`Đã chọn ${all.length}/${all.length}`));
  await rules.cutSelectedOutput();
  assert.equal(rules.els.input.value,"");
  assert.equal(rules.els.output.value,"");
  assert.equal(groups().length,0);
  rules.undo();
  assert.equal(rules.els.input.value,original);
  assert.equal(rules.els.output.value,baseline);
  // Rejecting invalid source clears all checkbox groups, visibly shows raw error.
  rules.els.input.value="2d 52 dx5n";
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
