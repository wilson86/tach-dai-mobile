'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sha256 = value=>crypto.createHash('sha256').update(value).digest('hex');
const path = require('node:path');
const {stage, isolatedUnifiedHtml, isolatedUnifiedServiceWorker, parseArgs} = require('../scripts/issue18-build-local-stage.js');
const HASH = '7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
const html = '<iframe id="tachFrame" src="../"></iframe>\n<iframe id="ngangFrame" src="https://wilson86.github.io/tach-dai-ngang/"></iframe>';
const sw = `const NAV='/tach-dai-mobile/app', N='/tach-dai-mobile/app/',
ICON_1='/tach-dai-mobile/icon-192.png', ICON_2='/tach-dai-mobile/icon-512.png';`;
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'issue18-stage-test-'));
  const mobile = path.join(base, 'srcMobile'), ngang = path.join(base, 'srcNgang'), out = path.join(base, 'fresh-stage');
  const MOBILE_FILES = ['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png','app/index.html','app/sw.js','app/version.json','app/unified-core.js','app/manifest.webmanifest'];
  const NGANG_FILES = ['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png'];
  for (const [repo,paths] of [[mobile,MOBILE_FILES],[ngang,NGANG_FILES]]) for (const f of paths) {
    const target = path.join(repo,f); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,'test asset');
  }
  fs.writeFileSync(path.join(mobile,'app/index.html'),html);
  fs.writeFileSync(path.join(mobile,'app/sw.js'),sw);
  for (const [f,version] of [[path.join(mobile,'version.json'),'2.0.36'],[path.join(mobile,'app/version.json'),'1.0.25'],[path.join(ngang,'version.json'),'1.0.35']])
    fs.writeFileSync(f, JSON.stringify({version,business_engine_sha256:HASH}));
  return {base,mobile,ngang,out};
}
test('isolates both real iframes without changing unrelated markup',()=>{
  const result=isolatedUnifiedHtml(html);
  assert.match(result,/id="ngangFrame" src="\.\.\/\.\.\/Ngang\/"/);
  assert.doesNotMatch(result,/github\.io/);
  assert.match(result,/id="tachFrame" src="\.\.\/"/);
});
test('rejects changed production iframe and unexpected offsite iframe',()=>{
  assert.throws(()=>isolatedUnifiedHtml(html.replace('tach-dai-ngang/','evil/')),/STAGING_BLOCKED/);
  assert.throws(()=>isolatedUnifiedHtml(html + '<iframe id="evilFrame" src="https://example.com"></iframe>'),/STAGING_BLOCKED/);
});
test('local Unified SW uses local navigation and offline icon routes only',()=>{
  const staged=isolatedUnifiedServiceWorker(sw);
  assert.ok(staged.includes('/Mobile/app'));
  assert.ok(staged.includes('/Mobile/icon-192.png'));
  assert.ok(staged.includes('/Mobile/icon-512.png'));
  assert.ok(!staged.includes('/tach-dai-mobile/'));
  assert.ok(sw.includes('/tach-dai-mobile/'), 'release SW must remain unchanged');
  assert.throws(()=>isolatedUnifiedServiceWorker(sw.replace(
    '/tach-dai-mobile/icon-512.png','/unknown/icon-512.png')),/STAGING_BLOCKED/);
});
test('staged Unified SW handles loopback offline navigation and icons',async()=>{
  const published=fs.readFileSync(path.join(__dirname,'..','app','sw.js'),'utf8');
  const staged=isolatedUnifiedServiceWorker(published);
  const handlers={};
  const caches={
    match:async key=>typeof key==='string'?'OFFLINE_UNIFIED_HTML':
      key?.url?.endsWith('/Mobile/icon-192.png')?'OFFLINE_UNIFIED_ICON':null,
    open:async()=>({put:async()=>{}}),keys:async()=>[]
  };
  const self={
    addEventListener(name,fn){handlers[name]=fn},
    skipWaiting(){},clients:{claim(){}}
  };
  vm.runInNewContext(staged,{self,caches,URL,
    fetch:async()=>{throw Error('synthetic offline');},Response});
  const request=async(route,mode)=>{
    let reply=null,registered=false;
    handlers.fetch({request:{method:'GET',mode,url:'http://127.0.0.1:62545'+route},
      respondWith(value){registered=true;reply=Promise.resolve(value);}});
    return {registered,body:registered?await reply:null};
  };
  const nav=await request('/Mobile/app/','navigate');
  assert.equal(nav.registered,true);
  assert.equal(nav.body,'OFFLINE_UNIFIED_HTML');
  const icon=await request('/Mobile/icon-192.png','no-cors');
  assert.equal(icon.registered,true);
  assert.equal(icon.body,'OFFLINE_UNIFIED_ICON');
  const unrelated=await request('/tach-dai-mobile/app/','navigate');
  assert.equal(unrelated.registered,false,'stage must not intercept production routes');
});
test('fresh stage copies exact assets and does not change original source',t=>{
  const f=fixture(); t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  const manifest=stage(f);
  assert.equal(manifest.engine_sha256,HASH);
  assert.equal(manifest.release_authorized,false);
  assert.equal(manifest.source_sha256.unified_html,sha256(html));
  assert.equal(manifest.source_sha256.unified_sw,sha256(sw));
  assert.equal(manifest.staged_sha256.unified_html,
    sha256(fs.readFileSync(path.join(f.out,'Mobile/app/index.html'))));
  assert.equal(manifest.staged_sha256.unified_sw,
    sha256(fs.readFileSync(path.join(f.out,'Mobile/app/sw.js'))));
  assert.notEqual(manifest.source_sha256.unified_html,manifest.staged_sha256.unified_html);
  assert.notEqual(manifest.source_sha256.unified_sw,manifest.staged_sha256.unified_sw);
  assert.equal(fs.readFileSync(path.join(f.mobile,'app/index.html'),'utf8'),html);
  assert.match(fs.readFileSync(path.join(f.out,'Mobile/app/index.html'),'utf8'),/src="\.\.\/\.\.\/Ngang\/"/);
  assert.ok(fs.readFileSync(path.join(f.out,'Mobile/app/sw.js'),'utf8').includes('/Mobile/app'));
  assert.equal(fs.readFileSync(path.join(f.mobile,'app/sw.js'),'utf8'),sw);
  assert.equal(fs.existsSync(path.join(f.out,'Ngang/icon-192.png')),true);
  assert.equal(fs.existsSync(path.join(f.out,'Ngang/icon-512.png')),true);
  assert.throws(()=>stage(f),/STAGING_BLOCKED: stage already exists/);
});
test('engine mismatch fails closed before creating stage',t=>{
  const f=fixture();t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  fs.writeFileSync(path.join(f.ngang,'version.json'),JSON.stringify({business_engine_sha256:'0'.repeat(64)}));
  assert.throws(()=>stage(f),/engine SHA mismatch/); assert.equal(fs.existsSync(f.out),false);
});
test('mixed candidate versions fail closed before staging',t=>{
  const f=fixture();t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  fs.writeFileSync(path.join(f.ngang,'version.json'),JSON.stringify({version:'1.0.34',business_engine_sha256:HASH}));
  assert.throws(()=>stage(f),/mixed or stale Issue18 candidate versions/);
  assert.equal(fs.existsSync(f.out),false);
});
test('rejects overlap and malformed args',t=>{
  const f=fixture(); t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  assert.throws(()=>stage({...f,out:path.join(f.mobile,'stage')}),/overlap/);
  assert.throws(()=>parseArgs(['--mobile']),/usage/);
});
