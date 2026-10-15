"use strict";
// Same-origin ledger isolation regression; use actual PWA parser on a mocked
// DOM. No network, user data, Telegram or production localStorage.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const cal=fs.readFileSync(path.join(root,"station_calendar.generated.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const fragment=html.match(/<script>\s*([\s\S]*?)<\/script>/iu);
assert.ok(fragment && fragment[1].includes("loadSettings();"));
const source=fragment[1].slice(0,fragment[1].indexOf("loadSettings();"));
const map=new Map(),dom=new Map();
const store={
  getItem(key){return map.has(key)?map.get(key):null},
  setItem(key,value){map.set(key,String(value))},
  removeItem(key){map.delete(key)}
};
const el=()=>({value:"",textContent:"",style:{},events:{},checked:false,
  addEventListener(key,fn){this.events[key]=fn},
  focus(){},select(){},setSelectionRange(){},remove(){},replaceChildren(){},appendChild(){},append(){},
  setAttribute(){},removeAttribute(){}});
const ctx={
  console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
  localStorage:store,
  document:{getElementById(id){if(!dom.has(id))dom.set(id,el());return dom.get(id);},
    createElement:el,body:{appendChild(){}},execCommand(){return true}},
  navigator:{clipboard:{async writeText(){}}}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(cal+"\n"+engine+"\n"+source+
  "\nglobalThis.__ledger={id:EXACT_OUTPUT_LEDGER_APP_ID,key:EXACT_OUTPUT_LEDGER_STORAGE_KEY,serialize:serializeExactOutputLedger,parse:parseExactOutputLedger,restore:restorePersistedExactOutputLedger,persist:persistExactOutputLedger,input:inputEl,region:regionEl,date:dateEl};",ctx);
const api=ctx.__ledger;
assert.equal(api.id,"tach-dai-mobile");
assert.equal(api.key,"tachDaiMobileExactOutputLedgerV1");
api.region.value="mn";
api.date.value="2026-10-15";
api.input.value="2d 89 98 b5n dx2,5n";
const raw=api.serialize();
const marker="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n";
assert.ok(raw.startsWith(marker));
const mine=JSON.parse(raw.slice(marker.length));
assert.equal(mine.app,"tach-dai-mobile");
assert.ok(api.parse(raw),"own tagged ledger is accepted");
const other={...mine,app:"tach-dai-ngang"};
assert.equal(api.parse(marker+JSON.stringify(other)),false,"foreign-app ledger fails closed");
const legacy={...mine};delete legacy.app;
assert.equal(api.parse(marker+JSON.stringify(legacy)),false,"old untagged cross-app ledger cannot be restored");
map.set("tachDaiNgangExactOutputLedgerV1",marker+JSON.stringify(other));
map.set("tachDaiMobileExactOutputLedgerV1",marker+JSON.stringify(other));
api.input.value="";
api.restore();
assert.equal(api.input.value,"","must never restore a foreign ledger into the app");
assert.equal(map.has("tachDaiMobileExactOutputLedgerV1"),false,"invalid own storage must be cleared");
assert.equal(map.has("tachDaiNgangExactOutputLedgerV1"),true,"other app storage never mutated");
map.set("tachDaiMobileExactOutputLedgerV1",raw);
api.restore();
assert.equal(api.input.value,raw,"own tagged ledger can restore");
console.log("LEDGER APP IDENTITY ISOLATION: PASS");
