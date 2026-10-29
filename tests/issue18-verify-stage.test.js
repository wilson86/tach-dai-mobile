'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {stage}=require('../scripts/issue18-build-local-stage.js');
const {verify,parseArgs}=require('../scripts/issue18-verify-stage.js');
const HASH='7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
const HTML='<iframe id="tachFrame" src="../"></iframe>\n'+
  '<iframe id="ngangFrame" src="https://wilson86.github.io/tach-dai-ngang/"></iframe>';
const SW="const N='/tach-dai-mobile/app', A='/tach-dai-mobile/app/', "+
  "I='/tach-dai-mobile/icon-192.png', J='/tach-dai-mobile/icon-512.png';";
const MOBILE=[
  'index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js',
  'icon-192.png','icon-512.png','app/index.html','app/sw.js',
  'app/version.json','app/unified-core.js','app/manifest.webmanifest'
];
const NGANG=[
  'index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js',
  'icon-192.png','icon-512.png'
];
function fixture(t){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'issue18-verify-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const mobile=path.join(base,'mobile'),ngang=path.join(base,'ngang'),
    out=path.join(base,'stage');
  for(const [root,files]of [[mobile,MOBILE],[ngang,NGANG]]){
    for(const file of files){
      const target=path.join(root,file);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,'SYNTHETIC_ASSET_'+file);
    }
  }
  fs.writeFileSync(path.join(mobile,'app/index.html'),HTML);
  fs.writeFileSync(path.join(mobile,'app/sw.js'),SW);
  for(const [p,version]of [
    [path.join(mobile,'version.json'),'2.0.36'],
    [path.join(mobile,'app/version.json'),'1.0.25'],
    [path.join(ngang,'version.json'),'1.0.35']
  ])fs.writeFileSync(p,JSON.stringify({version,business_engine_sha256:HASH}));
  stage({mobile,ngang,out});
  return {mobile,ngang,out};
}
test('manifest binds 21 copied assets and both staged rewrites without touching source',t=>{
  const f=fixture(t);
  const result=verify(f);
  assert.equal(result.status,'STAGE_SOURCE_BYTES_PASS');
  assert.equal(result.checked_assets,21);
  const manifest=JSON.parse(fs.readFileSync(path.join(f.out,'ISSUE18_STAGE_MANIFEST.json'),'utf8'));
  assert.equal(Object.keys(manifest.source_files_sha256).length,21);
  assert.equal(Object.keys(manifest.staged_files_sha256).length,21);
  assert.equal(result.engine_sha256,HASH);
  assert.equal(result.release_authorized,false);
  assert.equal(result.chrome,'NOT_RUN');
  assert.equal(fs.readFileSync(path.join(f.mobile,'app/index.html'),'utf8'),HTML);
  assert.equal(fs.readFileSync(path.join(f.mobile,'app/sw.js'),'utf8'),SW);
});
test('tampered staged iframe or SW is blocked even with old manifest',t=>{
  const f=fixture(t);
  fs.appendFileSync(path.join(f.out,'Mobile/app/index.html'),'\nTAMPER');
  assert.throws(()=>verify(f),/ASSET_BYTES_DRIFT/);
  fs.copyFileSync(path.join(f.mobile,'app/index.html'),
    path.join(f.out,'Mobile/app/index.html'));
  assert.throws(()=>verify(f),/ASSET_BYTES_DRIFT/);
});
test('a different root app asset or extra staged file is blocked',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.out,'Ngang/sw.js'),'STAGE_MODIFIED');
  assert.throws(()=>verify(f),/ASSET_BYTES_DRIFT/);
  fs.writeFileSync(path.join(f.out,'UNEXPECTED.js'),'UNAPPROVED');
  assert.throws(()=>verify(f),/EXTRA_OR_MISSING_ASSET/);
});
test('source editing after stage construction invalidates exact-byte certificate',t=>{
  const f=fixture(t);
  fs.appendFileSync(path.join(f.ngang,'business_engine.generated.js'),'\nSOURCE_CHANGED');
  assert.throws(()=>verify(f),/SOURCE_DRIFT/);
});
test('modifying unrelated source shell file after stage build is blocked',t=>{
  const f=fixture(t);
  fs.appendFileSync(path.join(f.mobile,'index.html'),'\nSOURCE_EDITED');
  assert.throws(()=>verify(f),/SOURCE_DRIFT/);
});
test('manifest source and staged asset digest removal or tampering is blocked',t=>{
  const f=fixture(t);
  const p=path.join(f.out,'ISSUE18_STAGE_MANIFEST.json');
  const manifest=JSON.parse(fs.readFileSync(p,'utf8'));
  delete manifest.source_files_sha256['Ngang/icon-512.png'];
  fs.writeFileSync(p,JSON.stringify(manifest));
  assert.throws(()=>verify(f),/INCOMPLETE_ASSET_HASHES/);
  manifest.source_files_sha256['Ngang/icon-512.png']='0'.repeat(64);
  fs.writeFileSync(p,JSON.stringify(manifest));
  assert.throws(()=>verify(f),/SOURCE_DRIFT/);
});
test('treat edited release-authorization flag as stage tampering',t=>{
  const f=fixture(t);
  const p=path.join(f.out,'ISSUE18_STAGE_MANIFEST.json');
  const manifest=JSON.parse(fs.readFileSync(p,'utf8'));
  manifest.release_authorized=true;
  fs.writeFileSync(p,JSON.stringify(manifest));
  assert.throws(()=>verify(f),/BAD_MANIFEST/);
});
test('structured failures include stable code in message and Error.code',()=>{
  assert.throws(()=>verify({mobile:'relative',ngang:'relative',out:'relative'}),
    {code:'INVALID_ROOT',message:/STAGE_INTEGRITY_BLOCKED \[INVALID_ROOT\]/});
  assert.throws(()=>parseArgs(['--unknown','x','--ngang','y','--out','z']),
    {code:'USAGE',message:/STAGE_INTEGRITY_BLOCKED \[USAGE\]/});
});
test('CLI requires three unique absolute sources and stage paths',()=>{
  const a='a'.repeat(40),b='b'.repeat(40);
  assert.deepEqual(parseArgs(['--mobile','/a','--ngang','/b','--out','/c',
    '--mobile-sha',a,'--ngang-sha',b]),
    {mobile:'/a',ngang:'/b',out:'/c',mobileSha:a,ngangSha:b});
  assert.throws(()=>parseArgs(['--mobile','/a','--mobile','/b','--out','/c']),/USAGE/);
  assert.throws(()=>parseArgs(['--mobile','/a']),/USAGE/);
});
