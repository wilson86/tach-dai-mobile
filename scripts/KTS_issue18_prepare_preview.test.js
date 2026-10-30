'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {CONFIG,EXPECTED,exportPreview}=require('./KTS_issue18_prepare_preview.js');
function fixture(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'issue18-preview-unit-'));
 const root=path.join(home,'source'),stage=path.join(home,'stage'),out=path.join(home,'preview');
 for(const p of [root,stage,path.join(root,'Mobile'),path.join(root,'Ngang')])fs.mkdirSync(p);
 for(const f of EXPECTED){const p=path.join(stage,...f.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});
   let v='fixture:'+f;
   if(f==='Mobile/app/index.html')v='<iframe id="ngangFrame" src="../../Ngang/"></iframe>';
   if(f==='Mobile/app/sw.js')v='const GUARD="/Mobile/app";';
   fs.writeFileSync(p,v);}
 const hashes=Object.fromEntries(EXPECTED.map(f=>[f,crypto.createHash('sha256')
   .update(fs.readFileSync(path.join(stage,...f.split('/')))).digest('hex')]));
 const manifest=JSON.stringify({staged_files_sha256:hashes},null,2)+'\n';
 fs.writeFileSync(path.join(stage,'ISSUE18_STAGE_MANIFEST.json'),manifest);
 const stageManifestSha=crypto.createHash('sha256').update(manifest).digest('hex');
 const params={...CONFIG,stageManifestSha,root,stage,out};
 const verified=()=>({status:'STAGE_SOURCE_BYTES_PASS',checked_assets:21,
  release_authorized:false,stage_manifest_sha256:stageManifestSha,
  source_commit_sha:{mobile:CONFIG.mobileSha,ngang:CONFIG.ngangSha}});
 return {home,root,stage,out,params,verified};
}
test('qualified 21-asset folder preserved; exported-only files, no upload or overwrites',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 const a=exportPreview(f.params,f.verified);assert.equal(a.status,'PREVIEW_FOLDER_READY_NOT_PUBLISHED');
 assert.equal(a.assets,21);
 assert.ok(JSON.parse(fs.readFileSync(path.join(f.stage,'ISSUE18_STAGE_MANIFEST.json'),'utf8')).staged_files_sha256);
 assert.equal(fs.existsSync(path.join(f.out,'ISSUE18_STAGE_MANIFEST.json')),false);
 assert.equal(fs.existsSync(path.join(f.out,'Mobile','app','index.html')),true);
 assert.equal(fs.existsSync(path.join(f.out,'Ngang','sw.js')),true);
 const manifest=JSON.parse(fs.readFileSync(path.join(f.out,'KTS_PREVIEW_MANIFEST.json')));
 assert.equal(manifest.release_authorized,false);
 assert.equal(Object.keys(manifest.assets).length,21);
 assert.match(fs.readFileSync(path.join(f.out,'index.html'),'utf8'),/BẢN THỬ NGHIỆM/);
});
test('source verifier refusal blocks before creating output',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 assert.throws(()=>exportPreview(f.params,()=>({...f.verified(),checked_assets:20})),/STAGE_NOT_QUALIFIED/);
 assert.equal(fs.existsSync(f.out),false);
});
test('forbid stage scope drift and source leak',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 fs.writeFileSync(path.join(f.stage,'Mobile/app/index.html'),'<iframe src="https://wilson86.github.io/tach-dai-ngang/"></iframe>');
 assert.throws(()=>exportPreview(f.params,f.verified),/STAGE_IFRAME_NOT_LOCAL/);
 assert.equal(fs.existsSync(f.out),false);
});
test('refuse extra stage files and overwrite of output',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 fs.writeFileSync(path.join(f.stage,'unknown.txt'),'x');
 assert.throws(()=>exportPreview(f.params,f.verified),/STAGE_FILE_INVENTORY_CHANGED/);
 assert.equal(fs.existsSync(f.out),false);
 fs.unlinkSync(path.join(f.stage,'unknown.txt'));
 fs.mkdirSync(f.out);
 assert.throws(()=>exportPreview(f.params,f.verified),/OUTPUT_ALREADY_EXISTS/);
});
test('never allow staging/source overlap',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 assert.throws(()=>exportPreview({...f.params,out:path.join(f.root,'Mobile','new')},f.verified),/OUTPUT_OVERLAPS_SOURCE/);
});

test('post-verifier stage asset mutation fails BEFORE creating upload folder',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 const stageAsset=path.join(f.stage,'Mobile','app','index.html');
 const tampered=()=>{fs.appendFileSync(stageAsset,'<!-- changed after verify -->');return f.verified()};
 assert.throws(()=>exportPreview(f.params,tampered),/STAGE_ASSET_DRIFT_AFTER_VERIFY/);
 assert.equal(fs.existsSync(f.out),false);
});
test('post-verifier stage manifest mutation fails BEFORE creating upload folder',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.home,{recursive:true,force:true}));
 const tampered=()=>{fs.appendFileSync(path.join(f.stage,'ISSUE18_STAGE_MANIFEST.json'),'x');return f.verified()};
 assert.throws(()=>exportPreview(f.params,tampered),/STAGE_MANIFEST_DRIFT_AFTER_VERIFY/);
 assert.equal(fs.existsSync(f.out),false);
});
