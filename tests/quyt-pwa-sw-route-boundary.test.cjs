'use strict';
// Offline PWA routing safety: never substitute the MB/index screen for a different requested page.
// Synthetic-only service-worker event harness. No networking, real messages, billing or deployment.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sw=fs.readFileSync(path.join(__dirname,'../quyt-pwa/sw.js'),'utf8');
function harness({online=false,hasCachedIndex=true}={}){
 const handlers={},lookups=[];
 const origin='https://example.invalid',scope=origin+'/tach-dai-mobile/quyt-pwa/';
 const cached={marker:'CACHED_MB_INDEX'};
 class FakeResponse{
  constructor(body,opts={}){this.body=body;this.status=opts.status??200;this.headers=opts.headers??{};}
 }
 const globals={
  self:{location:{origin},registration:{scope},addEventListener:(type,fn)=>{handlers[type]=fn},
    skipWaiting:()=>{},clients:{claim:()=>{}}},
  caches:{match:async key=>{lookups.push(String(key));return hasCachedIndex?cached:undefined},
    keys:async()=>[],open:async()=>({addAll:async()=>{}}),delete:async()=>{}},
  fetch:async req=>{if(!online)throw Error('SIMULATED_OFFLINE');return {marker:'ONLINE:'+req.url}},
  Response:FakeResponse,URL,Promise,
 };
 vm.runInNewContext(sw,globals,{timeout:3000});
 const request=async(url,mode='navigate',method='GET')=>{
  let response;
  handlers.fetch({request:{url:scope+url,mode,method},respondWith:p=>{response=p}});
  return response===undefined?null:await response;
 };
 return {request,lookups,scope};
}
test('offline app root can fall back to its exact cached MB entry',async()=>{
 const h=harness();
 const result=await h.request('');
 assert.equal(result.marker,'CACHED_MB_INDEX');
 assert.deepEqual(h.lookups,['./index.html']);
});
test('offline index.html can fall back to its exact cached MB entry',async()=>{
 const h=harness();
 const result=await h.request('index.html');
 assert.equal(result.marker,'CACHED_MB_INDEX');
 assert.deepEqual(h.lookups,['./index.html']);
});
test('offline one-screen market preview cannot silently become the MB-only entry',async()=>{
 const h=harness();
 const result=await h.request('gop-chung.html');
 assert.notEqual(result?.marker,'CACHED_MB_INDEX');
 assert.equal(result?.status,503);
 assert.match(String(result.body),/HOLD_OFFLINE_ROUTE_UNAVAILABLE/);
 assert.deepEqual(h.lookups,[]);
});
test('offline unknown/typo routes cannot become cached betting screen',async()=>{
 const h=harness();
 const result=await h.request('other.html');
 assert.equal(result?.status,503);
 assert.notEqual(result?.marker,'CACHED_MB_INDEX');
 assert.deepEqual(h.lookups,[]);
});
test('offline missing cached entry must explicitly HOLD rather than return undefined',async()=>{
 const h=harness({hasCachedIndex:false});
 const result=await h.request('index.html');
 assert.equal(result?.status,503);
 assert.match(String(result.body),/HOLD_OFFLINE_ROUTE_UNAVAILABLE/);
});
test('online navigation still serves the exact requested one-screen page',async()=>{
 const h=harness({online:true});
 const result=await h.request('gop-chung.html');
 assert.equal(result.marker,'ONLINE:'+h.scope+'gop-chung.html');
 assert.deepEqual(h.lookups,[]);
});
