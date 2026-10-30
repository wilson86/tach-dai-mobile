"use strict";
// Source-bound 2026-10-16 Thiên MB chat; operator confirmed single isolated
// leading dot is punctuation, not a lottery bet or decimal money.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const U=require("../app/unified-core.js");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=read("index.html"),calendar=read("station_calendar.generated.js");
const engine=read("business_engine.generated.js");
const code=(html.match(/<script>\s*([\s\S]*?)<\/script>/i)||[])[1];
assert.ok(code);
const source=code.slice(0,code.indexOf("loadSettings();"));
const elements=new Map();
const make=()=>({events:{},value:"",textContent:"",className:"",style:{},
 addEventListener(k,f){this.events[k]=f},focus(){},select(){},setSelectionRange(){},remove(){}});
const ctx={console,Date,Set,Map,Math,String,RegExp,JSON,Error,Promise,
 navigator:{clipboard:{async writeText(){}}},document:{
 getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id)},
 createElement:make,body:{appendChild(){}},execCommand(){return true}}};
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+source+
 "\nglobalThis.r={normalizeInput,preprocessChatText,validateCheckOnlyLine,processLine,splitBetChunks,getSchedule,KTS_BUSINESS_ENGINE};",ctx);
const r=ctx.r,day=new Date("2026-10-16T12:00:00");
const st=r.getSchedule("mb",day);
const raw="[10/16/2026 5:37 PM] Thiên: . 32. B20n\n"+
 "[10/16/2026 5:42 PM] Thiên: 52.79.b50n.da10n";
const clean=r.preprocessChatText(raw);
assert.equal(clean,"32 b20n\n52 79 b50n da10n");
for(const line of clean.split("\n"))assert.doesNotThrow(()=>r.validateCheckOnlyLine(line,"mb",st));
const bridge={normalizeInput:r.normalizeInput,validateCheckOnlyLine:r.validateCheckOnlyLine,
 processLine:r.processLine,splitBetChunks:r.splitBetChunks};
const result=U.transformDaVongText(clean,bridge,"mb",st);
assert.equal(result.ok,true,result.error);
assert.deepEqual(Array.from(result.outputs),[
 "32 b20n","52 79 b50n","52 79 da 10n"
],"MB Đá Vòng keeps exactly the approved original amounts and one DA pair");
const bad=U.transformDaVongText(clean+"\n? 38 b20n",bridge,"mb",st);
assert.equal(bad.ok,false);
assert.deepEqual(Array.from(bad.outputs),[],"later bad wager forbids any partial render");
const multi=U.transformDaVongText(".. 32 b20n\n"+clean.split("\n")[1],bridge,"mb",st);
assert.equal(multi.ok,false);
assert.deepEqual(Array.from(multi.outputs),[],"double prefix dot remains invalid");
assert.equal(r.normalizeInput("32 b10.50n"),"32 b10.50n","money decimals stay intact");
const candidateVersion=JSON.parse(read("version.json"));
assert.equal(r.KTS_BUSINESS_ENGINE.ENGINE_SHA256,
 candidateVersion.business_engine_sha256,
 "MB dot parity test must use the candidate engine identity, never an old pinned release");
console.log("MB DOT TELEGRAM ĐÁ VÒNG PARITY: PASS");
