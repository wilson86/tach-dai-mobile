'use strict';
// Isolated synthetic service-worker contract; no browser control or external network.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sw=fs.readFileSync(path.join(root,'quyt-pwa/sw.js'),'utf8');
const mb=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const mnmt=fs.readFileSync(path.join(root,'quyt-pwa/mn-mt-review.html'),'utf8');
const origin='http://localhost';
const base=origin+'/quyt-pwa/';
const assets=new Map();
const buckets=new Map();
const listeners={};
let waiting=false,claimed=false;
const store={
 async addAll(list){
  for(const a of list){
   const url=new URL(a,base).href;
   assets.set(url,a==='./'||a==='./index.html'?'MB':
    a==='./mn-mt-review.html'?'MNMT':a==='../station_calendar.generated.js'?'CALENDAR':a);
  }
 },
};
const caches={
 async open(key){if(!buckets.has(key))buckets.set(key,store);return store;},
 async keys(){return [...buckets.keys()];},
 async delete(key){return buckets.delete(key);},
 async match(request,{ignoreSearch=false}={}){
  const url=typeof request==='string'?new URL(request,base):new URL(request.url);
  if(ignoreSearch)url.search='';
  const matched=assets.get(url.href);
  if(matched==null)return undefined;
  return new Response(matched,{status:200});
 }
};
const self={
 location:new URL(base+'sw.js'),
 clients:{claim:()=>{claimed=true;return Promise.resolve()}},
 skipWaiting:()=>{waiting=true;return Promise.resolve()},
 addEventListener(type,fn){listeners[type]=fn}
};
const sandbox={self,caches,URL,Response,Promise,fetch:()=>Promise.reject(Error('OFFLINE'))};
vm.runInNewContext(sw,sandbox,{filename:'quyt-pwa/sw.js',timeout:1000});
async function lifecycle(type){
 let promise;
 listeners[type]({waitUntil(p){promise=Promise.resolve(p)}});
 if(!promise)throw Error(type+' missing waitUntil');
 await promise;
}
async function request(url,mode='navigate'){
 let promise;
 listeners.fetch({request:{method:'GET',mode,url:new URL(url,base).href},
  respondWith(p){promise=Promise.resolve(p)}});
 return promise?promise:undefined;
}
test('SW identity includes MB+MNMT money and stale Copy update',()=>{
 assert.match(sw,/v10-hide-empty-groups/u);
 assert.match(mb,/HOLD_CHENH_LECH_LAM_TRON/u);
 assert.match(mb,/CLIPBOARD CÓ THỂ CHỨA TIN CŨ/u);
 assert.match(mnmt,/HOLD_CHENH_LECH_LAM_TRON/u);
 assert.match(sw,/\.\.\/station_calendar\.generated\.js/u);
});
test('install precaches exact MB and MNMT pages plus calendar and icons',async()=>{
 await lifecycle('install');
 assert.equal(waiting,true);
 assert.equal((await caches.match(base+'index.html')).status,200);
 assert.equal(await (await caches.match(base+'index.html')).text(),'MB');
 assert.equal(await (await caches.match(base+'mn-mt-review.html')).text(),'MNMT');
 assert.equal(await (await caches.match(origin+'/station_calendar.generated.js')).text(),'CALENDAR');
 for(const asset of ['icon-192.png','icon-512.png','manifest.webmanifest']){
  assert.ok(assets.has(base+asset));
  assert.ok(fs.existsSync(path.join(root,'quyt-pwa',asset)));
 }
});
test('old Quyt SW versions are invalidated while unrelated caches preserved',async()=>{
 buckets.set('kts-quyt-standalone-pwa-20261104-v5-grouped-frames',store);
 buckets.set('unrelated-other-app',store);
 await lifecycle('activate');
 assert.equal(claimed,true);
 assert.ok(!(await caches.keys()).includes('kts-quyt-standalone-pwa-20261104-v5-grouped-frames'));
 assert.ok((await caches.keys()).includes('unrelated-other-app'));
});
test('offline navigation is route-specific: MB cannot replace MNMT',async()=>{
 const mbResult=await request(base+'index.html');
 const mnResult=await request(base+'mn-mt-review.html');
 const query=await request(base+'mn-mt-review.html?x=123');
 assert.equal(await mbResult.text(),'MB');
 assert.equal(await mnResult.text(),'MNMT');
 assert.equal(await query.text(),'MNMT');
});
test('unknown offline route fails closed with HTTP 503 HOLD, never MB',async()=>{
 const res=await request(base+'unknown.html');
 assert.equal(res.status,503);
 assert.match(await res.text(),/HOLD/u);
});
test('cached generated calendar is available offline to controlled app',async()=>{
 const res=await request(origin+'/station_calendar.generated.js','cors');
 assert.equal(res.status,200);
 assert.equal(await res.text(),'CALENDAR');
});
test('cross-origin requests are not intercepted by this standalone worker',async()=>{
 const result=await request('https://example.invalid/not-ours.js','cors');
 assert.equal(result,undefined);
});
