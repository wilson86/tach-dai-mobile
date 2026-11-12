'use strict';
// Offline PWA routing safety: never substitute the one-screen entry for a different requested page.
// Synthetic-only service-worker event harness. No networking, real messages, billing or deployment.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sw=fs.readFileSync(path.join(__dirname,'../quyt-pwa/sw.js'),'utf8');
const calendar=fs.readFileSync(path.join(__dirname,'../station_calendar.generated.js'));
const scopedCalendar=fs.readFileSync(path.join(__dirname,'../quyt-pwa/station_calendar.generated.js'));
const index=fs.readFileSync(path.join(__dirname,'../quyt-pwa/index.html'),'utf8');
test('same-scope calendar is BYTE IDENTICAL to canonical generated schedule',()=>{
 assert.deepEqual(scopedCalendar,calendar);
 assert.match(index,/<script src="\.\/station_calendar\.generated\.js"><\/script>/u);
 assert.match(index,/navigator\.serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/'\}\)/u);
 assert.doesNotMatch(index,/src="\.\.\/station_calendar\.generated\.js"/u);
 const scope=new URL('https://wilson86.github.io/tach-dai-mobile/quyt-pwa/');
 const cachePath=new URL('./station_calendar.generated.js',scope).pathname;
 assert.ok(cachePath.startsWith(scope.pathname));
});

function harness({online=false,hasCachedIndex=true}={}){
 const handlers={},lookups=[];
 const origin='https://example.invalid',scope=origin+'/tach-dai-mobile/quyt-pwa/';
 const cached={marker:'CACHED_ONE_SCREEN_INDEX'};
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
test('PWA caches pinned canonical station calendar atomically with one-screen HTML',async()=>{
 const installAssets=sw.match(/const ASSETS=([^;]+);/u);
 assert.ok(installAssets);
 const assets=vm.runInNewContext(installAssets[1]);
 assert.ok(assets.includes('./index.html'));
 assert.ok(assets.includes('./station_calendar.generated.js'));
 assert.equal(assets.filter(x=>x==='./station_calendar.generated.js').length,1);
});
test('offline app root can fall back to its exact cached one-screen entry',async()=>{
 const h=harness();
 const result=await h.request('');
 assert.equal(result.marker,'CACHED_ONE_SCREEN_INDEX');
 assert.deepEqual(h.lookups,['./index.html']);
});
test('offline index.html can fall back to its exact cached one-screen entry',async()=>{
 const h=harness();
 const result=await h.request('index.html');
 assert.equal(result.marker,'CACHED_ONE_SCREEN_INDEX');
 assert.deepEqual(h.lookups,['./index.html']);
});
test('offline one-screen market preview cannot silently become the one-screen entry',async()=>{
 const h=harness();
 const result=await h.request('gop-chung.html');
 assert.notEqual(result?.marker,'CACHED_ONE_SCREEN_INDEX');
 assert.equal(result?.status,503);
 assert.match(String(result.body),/HOLD_OFFLINE_ROUTE_UNAVAILABLE/);
 assert.deepEqual(h.lookups,[]);
});
test('offline unknown/typo routes cannot become cached wrong-route betting screen',async()=>{
 const h=harness();
 const result=await h.request('other.html');
 assert.equal(result?.status,503);
 assert.notEqual(result?.marker,'CACHED_ONE_SCREEN_INDEX');
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

test('offline explicit MN/MT or other query never becomes cached one-screen',async()=>{
 for(const route of ['index.html?market=mn','?region=mt','?mien=MN','index.html?v=7&market=mt','?unknown=1','index.html?v=not-a-version']){
  const h=harness(),result=await h.request(route);
  assert.equal(result?.status,503,route);
  assert.match(String(result.body),/HOLD_OFFLINE_ROUTE_UNAVAILABLE/u,route);
  assert.deepEqual(h.lookups,[],route);
 }
});
test('offline safe version and ordinary link tracking keep exact one-screen fallback',async()=>{
 for(const route of ['?v=7','index.html?v=8','?v=7&utm_source=chatgpt.com']){
  const h=harness(),result=await h.request(route);
  assert.equal(result?.marker,'CACHED_ONE_SCREEN_INDEX',route);
  assert.deepEqual(h.lookups,['./index.html'],route);
 }
});
test('online alternate route remains network-first even with query parameters',async()=>{
 const h=harness({online:true});
 const route='index.html?market=mn',result=await h.request(route);
 assert.equal(result?.marker,'ONLINE:'+h.scope+route);
 assert.deepEqual(h.lookups,[]);
});
