'use strict';
// KTS Issue #18: prepare a SHA-pinned STATIC preview folder. NEVER uploads/deploys.
// Windows C: only on the actual operator entrypoint. No Git/CI/API writes.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CONFIG=Object.freeze({
  root:'C:\\KTS-QA\\issue18-calendar-review',
  stage:'C:\\KTS-QA\\issue18-calendar-evidence\\issue18-stage-2026-10-30T19-49-35-266Z-26104',
  out:'C:\\KTS-QA\\issue18-preview-upload-20261031',
  mobileSha:'f882330841a0e84d0f2ee29a75eed1cc1ae14b5b',
  ngangSha:'afc777d01ba2346b7eb3a322afe9bbebc6068fc0',
  stageManifestSha:'7b224b1d40a0d5f1c76402f5df858bb14976062f972e3d8c8a59d58c4b9cfb53',
});
const MOBILE=Object.freeze(['index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png',
  'app/index.html','app/sw.js','app/version.json','app/unified-core.js','app/manifest.webmanifest']);
const NGANG=Object.freeze(['index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js','icon-192.png','icon-512.png']);
const EXPECTED=[...MOBILE.map(f=>'Mobile/'+f),...NGANG.map(f=>'Ngang/'+f)].sort();
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function stop(code){throw Error('PREVIEW_EXPORT_BLOCKED:'+code)}
function ownedDir(p){
  if(!fs.existsSync(p))stop('MISSING_DIR:'+p);
  const st=fs.lstatSync(p);
  if(!st.isDirectory()||st.isSymbolicLink())stop('UNSAFE_DIR:'+p);
  const resolve=path.resolve(p),actual=fs.realpathSync.native(p);
  if(process.platform==='win32' ? resolve.toLowerCase()!==actual.toLowerCase() : resolve!==actual)
    stop('REDIRECTED_DIR:'+p);
}
function list(stage){
  const arr=[];
  const walk=(p,base)=>{
    for(const e of fs.readdirSync(p,{withFileTypes:true})){
      if(e.isSymbolicLink()||(!e.isDirectory()&&!e.isFile()))stop('UNSAFE_STAGE_ENTRY');
      const rel=base?base+'/'+e.name:e.name;
      if(e.isDirectory())walk(path.join(p,e.name),rel);
      else arr.push(rel);
    }
  };walk(stage,'');return arr.sort();
}
function previewRoot(){return `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>KTS Issue #18 - PREVIEW ONLY</title></head><body><main><h1>KTS Issue #18 — BẢN THỬ NGHIỆM</h1><p>Chỉ thử với dữ liệu giả. Không sử dụng để nhận tin cược, xử lý tiền hoặc gửi Telegram. Bản này không phải production.</p><p><a href="./Mobile/app/">Mở KTS Unified (Tách Đài / Tách Ngang / Đá Vòng)</a></p><p>Ứng viên: Mobile 2.0.38 · Ngang 1.0.37 · Unified 1.0.27</p></main></body></html>\n`}
function exportPreview({root,stage,out,mobileSha,ngangSha,stageManifestSha},verifyFn){
  for(const p of [root,stage,out])if(typeof p!=='string'||!path.isAbsolute(p))stop('REQUIRES_ABSOLUTE_PATHS');
  const m=path.join(root,'Mobile'),n=path.join(root,'Ngang');
  for(const p of [root,m,n,stage,path.dirname(out)])ownedDir(p);
  if(fs.existsSync(out))stop('OUTPUT_ALREADY_EXISTS');
  const norm=v=>process.platform==='win32'?path.resolve(v).toLowerCase():path.resolve(v);
  if([root,m,n,stage].some(p=>norm(out)===norm(p)||norm(out).startsWith(norm(p)+path.sep)||norm(p).startsWith(norm(out)+path.sep)))
    stop('OUTPUT_OVERLAPS_SOURCE');
  // REQUIRED: the ORIGINAL SHA-bound stage verifier; tests may inject a fake to
  // prove control-flow, but this production entrypoint never does so.
  const receipt=verifyFn({mobile:m,ngang:n,out:stage,mobileSha,ngangSha});
  if(receipt.status!=='STAGE_SOURCE_BYTES_PASS'||receipt.checked_assets!==21||
     receipt.release_authorized!==false||receipt.stage_manifest_sha256!==stageManifestSha||
     receipt.source_commit_sha?.mobile!==mobileSha||receipt.source_commit_sha?.ngang!==ngangSha)
    stop('STAGE_NOT_QUALIFIED');
  const expected=[...EXPECTED,'ISSUE18_STAGE_MANIFEST.json'].sort();
  if(JSON.stringify(list(stage))!==JSON.stringify(expected))stop('STAGE_FILE_INVENTORY_CHANGED');
  const unified=fs.readFileSync(path.join(stage,'Mobile/app/index.html'),'utf8');
  const sw=fs.readFileSync(path.join(stage,'Mobile/app/sw.js'),'utf8');
  if(!unified.includes('src="../../Ngang/"')||unified.includes('src="https://wilson86.github.io/tach-dai-ngang/"'))
    stop('STAGE_IFRAME_NOT_LOCAL');
  if(!sw.includes('/Mobile/app')||sw.includes('/tach-dai-mobile/app'))stop('SW_NOT_PREVIEW_SCOPED');
  // Rebind the exact bytes we are about to export to the original verifier's
  // approved stage manifest. A staged file may change AFTER verifyFn returned;
  // do not ever publish that unverified replacement through the preview folder.
  const rawManifest=fs.readFileSync(path.join(stage,'ISSUE18_STAGE_MANIFEST.json'));
  if(sha256(rawManifest)!==stageManifestSha)stop('STAGE_MANIFEST_DRIFT_AFTER_VERIFY');
  let sourceManifest;
  try{sourceManifest=JSON.parse(rawManifest.toString('utf8'))}
  catch(_){stop('INVALID_STAGE_MANIFEST')}
  if(!sourceManifest.staged_files_sha256||
     Object.keys(sourceManifest.staged_files_sha256).length!==21)stop('STAGE_MANIFEST_INCOMPLETE');
  const bytes=new Map();
  for(const f of EXPECTED){
    const buf=fs.readFileSync(path.join(stage,...f.split('/')));
    if(sha256(buf)!==sourceManifest.staged_files_sha256[f])
      stop('STAGE_ASSET_DRIFT_AFTER_VERIFY:'+f);
    bytes.set(f,buf);
  }
  // Once validated, the only mutable destination is ONE NEW, dedicated folder.
  fs.mkdirSync(out);
  const hashes={};
  for(const [rel,buf] of bytes){
    const p=path.join(out,...rel.split('/'));
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,buf,{flag:'wx'});
    if(sha256(fs.readFileSync(p))!==sha256(buf))stop('COPY_CORRUPTION:'+rel);
    hashes[rel]=sha256(buf);
  }
  const welcome=previewRoot();
  fs.writeFileSync(path.join(out,'index.html'),welcome,{encoding:'utf8',flag:'wx'});
  fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n',{encoding:'utf8',flag:'wx'});
  const manifest={schema:'KTS_ISSUE18_PREVIEW_EXPORT_V1',public_preview_only:true,release_authorized:false,
    forbidden_host:'wilson86.github.io',target_origin_policy:'SEPARATE_ORIGIN_REQUIRED',
    mobile_sha:mobileSha,ngang_sha:ngangSha,stage_manifest_sha256:stageManifestSha,
    assets:hashes,preview_url_suffix:'/Mobile/app/',cost_usd:0};
  fs.writeFileSync(path.join(out,'KTS_PREVIEW_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  return {status:'PREVIEW_FOLDER_READY_NOT_PUBLISHED',out,assets:EXPECTED.length,
    stage_manifest_sha256:stageManifestSha,release:'NO_GO',cost_usd:0};
}
if(require.main===module){
  try{
    if(process.platform!=='win32'||Object.values(CONFIG).filter(x=>typeof x==='string'&&x.startsWith('C:\\')).length!==3)
      stop('WINDOWS_C_ONLY');
    if(process.argv.length!==2)stop('NO_CLI_OVERRIDES');
    const {verify}=require(path.join(CONFIG.root,'Mobile','scripts','issue18-verify-stage.js'));
    console.log(JSON.stringify(exportPreview(CONFIG,verify),null,2));
  }catch(e){console.error(e.message);process.exitCode=2;}
}
module.exports={CONFIG,MOBILE,NGANG,EXPECTED,exportPreview};
