"use strict";
// Explicit candidate/NEEDS_ORACLE source fixture; business money engine unchanged.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const calendar=fs.readFileSync(path.join(root,"station_calendar.generated.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const script=(html.match(/<script>\s*([\s\S]*?)<\/script>/i)||[])[1];
assert.ok(script);
const code=script.slice(0,script.indexOf("loadSettings();"));
const dom=new Map();
const element=()=>({value:"",textContent:"",style:{},events:{},addEventListener(n,f){this.events[n]=f},
  focus(){},select(){},setSelectionRange(){},remove(){}});
const doc={getElementById(id){if(!dom.has(id))dom.set(id,element());return dom.get(id)},
  createElement:element,body:{appendChild(){}},execCommand(){return true}};
const ctx={console,Date,Set,Map,Math,RegExp,Error,String,JSON,
  navigator:{clipboard:{async writeText(){}}},document:doc};
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+code+
 "\nglobalThis.rules={normalizeInput,preprocessChatText,validateCheckOnlyLine,processLine,getSchedule,findForbiddenRawBetPrefix};",ctx);
const rules=ctx.rules,region="mb",stations=rules.getSchedule(region,new Date("2026-10-16T12:00:00"));
const original="[10/16/2026 5:37 PM] Thiên: . 32. B20n\n"+
 "[10/16/2026 5:42 PM] Thiên: 52.79.b50n.da10n";
const cleaned=rules.preprocessChatText(original);
assert.equal(cleaned,"32 b20n\n52 79 b50n da10n","only leading single dot and chat envelope are removed");
const lines=cleaned.split("\n");
for(const line of lines)assert.doesNotThrow(()=>rules.validateCheckOnlyLine(line,region,stations));
assert.deepEqual(Array.from(rules.processLine(lines[0],region,stations)),["32 b20n"]);
assert.deepEqual(Array.from(rules.processLine(lines[1],region,stations)),["52 79 b50n da10n"]);
assert.equal(rules.normalizeInput(". 32 b20n"),"32 b20n");
assert.equal(rules.normalizeInput("52.79.b50n.da10n"),"52 79 b50n da10n");
assert.equal(rules.normalizeInput("32 b10.50n"),"32 b10.50n","money decimal never split");
for(const invalid of [".. 32 b20n","? 32 b20n",". 32 ? b20n",". 32","random . 32 b20n"]){
  const normalized=rules.normalizeInput(invalid);
  if(invalid.startsWith(".."))assert.ok(normalized.startsWith(".."));
  if(invalid.startsWith("?"))assert.ok(normalized.startsWith("?"));
  assert.throws(()=>rules.validateCheckOnlyLine(normalized,region,stations),undefined,invalid);
}
assert.throws(()=>rules.validateCheckOnlyLine(rules.normalizeInput(". 32 b20n"),"mn",
  rules.getSchedule("mn",new Date("2026-10-16T12:00:00"))),
  undefined,"MN without station remains invalid");
const malformed=[
 "32 b20n\n| 52.79.b50n.da10n",
 "32 b20n\n|52.79.b50n.da10n",
 "32 b20n\n||52.79.b50n.da10n",
 "32 b20n\n|.52.79.b50n.da10n",
 "32 b20n\n.. 52.79.b50n.da10n",
 "[10/16/2026 5:37 PM] Thiên: 32 b20n\n"+
   "[10/16/2026 5:42 PM] Thiên: | 52.79.b50n.da10n"
];
for(const raw of malformed){
 const error=rules.findForbiddenRawBetPrefix(raw);
 assert.ok(error,"raw-prefix must be rejected before UI normalization");
 assert.equal(error.line,2,"physical source line must be preserved");
 assert.ok(error.source.startsWith("|")||error.source.startsWith(".."));
}
assert.equal(rules.findForbiddenRawBetPrefix(original),null,
 "operator approved single solitary dot must remain valid");
assert.equal(rules.findForbiddenRawBetPrefix("32 b20n\n--//-----//--\n52 79 b50n da10n"),null,
 "standalone approved divider must remain metadata");
console.log("MB LEADING DOT CHAT — offline candidate PASS (still NEEDS_ORACLE for deployment)");
