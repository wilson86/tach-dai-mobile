"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),config=require("../customer-config-review.js"),core=require("../quyt-bao-review.js");
test("existing review key remains sole authority and metadata survives",()=>{let value=null;const storage={getItem:k=>{assert.equal(k,config.KEY);return value},setItem:(k,v)=>{assert.equal(k,config.KEY);value=v}};const c=config.createStore(storage,core.parseRate),rows=c.read();rows[1].history.push({at:"t",rate:"1,067",version:7});rows[1].future_field="preserve";c.writeLocked(rows,{request:(n,o,fn)=>fn()});const got=c.read();assert.equal(got[1].future_field,"preserve");assert.equal(got[1].history[0].version,7);assert.equal(config.KEY,"KTS_REVIEW_CUSTOMERS_V1")});
test("malformed record and blocked writes fail closed",()=>{let value=JSON.stringify({version:1,customers:[{id:"quyt",name:"Q",rate:"1,067",history:[]}]});const c=config.createStore({getItem:()=>value,setItem:()=>{throw Error("quota")}},core.parseRate);assert.throws(()=>c.read(),/STORAGE_INVALID/);value=null;assert.throws(()=>c.writeLocked(c.read(),{request:(n,o,fn)=>fn()}),/STORAGE_WRITE_FAILED/)});

test('stale second window cannot overwrite newer coefficient or history',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(k,v)=>value=v},locks={request:(n,o,fn)=>fn()};
 const a=config.createStore(storage,core.parseRate),b=config.createStore(storage,core.parseRate),first=a.read(),stale=b.read();
 first[1].rate='1,05';first[1].history.push({rate:'1,05',at:'t',version:1});a.writeLocked(first,locks);
 stale[0].name='Hiền khác';assert.throws(()=>b.writeLocked(stale,locks),/CUSTOMER_STALE_HOLD/);
 assert.equal(JSON.parse(value).customers[1].rate,'1,05');assert.equal(JSON.parse(value).customers[1].history.length,1);
 assert.throws(()=>a.writeLocked(first,null),/CUSTOMER_LOCK_UNAVAILABLE/);
});
