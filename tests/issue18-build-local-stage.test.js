'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {stage, isolatedUnifiedHtml, parseArgs} = require('../scripts/issue18-build-local-stage.js');
const HASH = '7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
const html = '<iframe id="tachFrame" src="../"></iframe>\n<iframe id="ngangFrame" src="https://wilson86.github.io/tach-dai-ngang/"></iframe>';
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'issue18-stage-test-'));
  const mobile = path.join(base, 'srcMobile'), ngang = path.join(base, 'srcNgang'), out = path.join(base, 'fresh-stage');
  const MOBILE_FILES = ['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png','app/index.html','app/sw.js','app/version.json','app/unified-core.js','app/manifest.webmanifest'];
  const NGANG_FILES = ['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png'];
  for (const [repo,paths] of [[mobile,MOBILE_FILES],[ngang,NGANG_FILES]]) for (const f of paths) {
    const target = path.join(repo,f); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,'test asset');
  }
  fs.writeFileSync(path.join(mobile,'app/index.html'),html);
  for (const f of [path.join(mobile,'version.json'),path.join(mobile,'app/version.json'),path.join(ngang,'version.json')])
    fs.writeFileSync(f, JSON.stringify({version:'WIP',business_engine_sha256:HASH}));
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
test('fresh stage copies exact assets and does not change original source',t=>{
  const f=fixture(); t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  const manifest=stage(f);
  assert.equal(manifest.engine_sha256,HASH);
  assert.equal(manifest.release_authorized,false);
  assert.equal(fs.readFileSync(path.join(f.mobile,'app/index.html'),'utf8'),html);
  assert.match(fs.readFileSync(path.join(f.out,'Mobile/app/index.html'),'utf8'),/src="\.\.\/\.\.\/Ngang\/"/);
  assert.equal(fs.existsSync(path.join(f.out,'Ngang/icon-192.png')),true);
  assert.equal(fs.existsSync(path.join(f.out,'Ngang/icon-512.png')),true);
  assert.throws(()=>stage(f),/STAGING_BLOCKED: stage already exists/);
});
test('engine mismatch fails closed before creating stage',t=>{
  const f=fixture();t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  fs.writeFileSync(path.join(f.ngang,'version.json'),JSON.stringify({business_engine_sha256:'0'.repeat(64)}));
  assert.throws(()=>stage(f),/engine SHA mismatch/); assert.equal(fs.existsSync(f.out),false);
});
test('rejects overlap and malformed args',t=>{
  const f=fixture(); t.after(()=>fs.rmSync(f.base,{recursive:true,force:true}));
  assert.throws(()=>stage({...f,out:path.join(f.mobile,'stage')}),/overlap/);
  assert.throws(()=>parseArgs(['--mobile']),/usage/);
});
