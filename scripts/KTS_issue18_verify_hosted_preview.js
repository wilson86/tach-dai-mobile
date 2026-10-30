'use strict';
// KTS Issue #18 separate-origin, read-only hosted preview verification.
// Never creates a site, sends customer data, deploys, or changes GitHub.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assetNames=[
  ...['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js',
    'station_calendar.generated.js','icon-192.png','icon-512.png','app/index.html','app/sw.js',
    'app/version.json','app/unified-core.js','app/manifest.webmanifest'].map(x=>'Mobile/'+x),
  ...['index.html','sw.js','version.json','manifest.webmanifest','business_engine.generated.js',
    'station_calendar.generated.js','icon-192.png','icon-512.png'].map(x=>'Ngang/'+x)
].sort();
const ROOT_FILES=['index.html','robots.txt','KTS_PREVIEW_MANIFEST.json'];
const EXPECTED_SHAS=Object.freeze({
  mobile:'f882330841a0e84d0f2ee29a75eed1cc1ae14b5b',
  ngang:'afc777d01ba2346b7eb3a322afe9bbebc6068fc0',
  stageManifest:'7b224b1d40a0d5f1c76402f5df858bb14976062f972e3d8c8a59d58c4b9cfb53'
});
function die(x){throw Error('HOSTED_PREVIEW_BLOCKED:'+x)}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex')}
function checkUrl(u){
  let parsed; try{parsed=new URL(u)}catch(_){die('INVALID_URL')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||
     parsed.pathname!=='/'||!/^[a-z\d-]+(?:\.[a-z\d-]+)?\.pages\.dev$/i.test(parsed.hostname))
    die('HTTPS_SEPARATE_PAGES_DEV_ORIGIN_REQUIRED');
  if(parsed.hostname==='wilson86.github.io')die('PRODUCTION_ORIGIN_FORBIDDEN');
  return parsed;
}
function readLocal(root,file){
  const dest=path.join(root,...file.split('/'));
  if(!dest.startsWith(root+path.sep)||!fs.existsSync(dest)||fs.lstatSync(dest).isSymbolicLink()||
     !fs.statSync(dest).isFile()||!fs.realpathSync(dest).startsWith(root+path.sep))die('UNSAFE_LOCAL_FILE:'+file);
  return fs.readFileSync(dest);
}
function checkRoot(root){
  if(!path.isAbsolute(root)||!fs.existsSync(root)||!fs.lstatSync(root).isDirectory()||
      fs.lstatSync(root).isSymbolicLink())die('INVALID_LOCAL_EXPORT_ROOT');
  const resolved=path.resolve(root),real=fs.realpathSync(root);
  if(process.platform==='win32'?resolved.toLowerCase()!==real.toLowerCase():resolved!==real)
    die('UNSAFE_LOCAL_EXPORT_ROOT');
  return resolved;
}
function validateLocal(root){
  const manifestBytes=readLocal(root,'KTS_PREVIEW_MANIFEST.json');
  let manifest;try{manifest=JSON.parse(manifestBytes)}catch(_){die('BAD_LOCAL_MANIFEST')}
  if(manifest.schema!=='KTS_ISSUE18_PREVIEW_EXPORT_V1'||manifest.public_preview_only!==true||
     manifest.release_authorized!==false||manifest.target_origin_policy!=='SEPARATE_ORIGIN_REQUIRED'||
     manifest.mobile_sha!==EXPECTED_SHAS.mobile||manifest.ngang_sha!==EXPECTED_SHAS.ngang||
     manifest.stage_manifest_sha256!==EXPECTED_SHAS.stageManifest||
     Object.keys(manifest.assets||{}).length!==21||
     JSON.stringify(Object.keys(manifest.assets).sort())!==JSON.stringify(assetNames))
    die('LOCAL_MANIFEST_NOT_SOURCE_PINNED');
  for(const file of assetNames){
    if(!/^[a-f0-9]{64}$/.test(manifest.assets[file])||
      sha256(readLocal(root,file))!==manifest.assets[file])die('LOCAL_ASSET_DRIFT:'+file);
  }
  const unified=readLocal(root,'Mobile/app/index.html').toString('utf8');
  const sw=readLocal(root,'Mobile/app/sw.js').toString('utf8');
  if(!unified.includes('src="../../Ngang/"')||unified.includes('https://wilson86.github.io/tach-dai-ngang/'))
    die('EXTERNAL_NGANG_IFRAME');
  if(!sw.includes('/Mobile/app')||sw.includes('/tach-dai-mobile/app'))die('SW_PREVIEW_PATH_INVALID');
  if(!readLocal(root,'index.html').toString('utf8').includes('BẢN THỬ NGHIỆM'))die('PREVIEW_BANNER_MISSING');
  return {manifest,files:[...ROOT_FILES,...assetNames]};
}
function canonicalRemotePath(file){
  if(file==='index.html')return '';
  if(file.endsWith('/index.html'))return file.slice(0,-'index.html'.length);
  return file;
}
function enforceHeaders(headers){
  const csp=headers.get('content-security-policy')||'';
  for(const required of ["default-src 'self'","connect-src 'self'","frame-src 'self'",
       "frame-ancestors 'self'","worker-src 'self'","object-src 'none'",
       "form-action 'none'"]){
    if(!csp.includes(required))die('CSP_MISSING:'+required);
  }
  if((headers.get('x-frame-options')||'').toUpperCase()!=='SAMEORIGIN')die('XFRAME_MISSING');
  if(!(headers.get('x-robots-tag')||'').includes('noindex'))die('NOINDEX_MISSING');
  if((headers.get('x-content-type-options')||'').toLowerCase()!=='nosniff')die('NOSNIFF_MISSING');
}
async function verifyHosted({origin,root,fetchImpl=globalThis.fetch}){
  const base=checkUrl(origin),local=checkRoot(root),inventory=validateLocal(local);
  if(typeof fetchImpl!=='function')die('FETCH_UNAVAILABLE');
  let count=0,bytesChecked=0;
  for(const file of inventory.files){
    const url=new URL(canonicalRemotePath(file),base).href;
    let response;
    try{response=await fetchImpl(url,{method:'GET',redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(10000),headers:{'Accept':'*/*'}})}
    catch(e){die('REMOTE_FETCH_ERROR:'+file+':'+e.message)}
    if(response.status!==200||response.redirected||response.url&&response.url!==url)
      die('REMOTE_NOT_EXACT_200:'+file+':'+response.status);
    enforceHeaders(response.headers);
    const length=Number(response.headers.get('content-length'));
    if(Number.isFinite(length)&&length>3*1024*1024)die('REMOTE_FILE_TOO_LARGE:'+file);
    const body=Buffer.from(await response.arrayBuffer());
    if(body.length>3*1024*1024)die('REMOTE_BODY_TOO_LARGE:'+file);
    if(sha256(body)!==sha256(readLocal(local,file)))die('REMOTE_HASH_MISMATCH:'+file);
    count++;bytesChecked+=body.length;
  }
  return {status:'HOSTED_PREVIEW_SOURCE_AND_HEADERS_PASS',origin:base.origin,
    checked_files:count,sha_bound_asset_files:21,source_commit_sha:{mobile:EXPECTED_SHAS.mobile,ngang:EXPECTED_SHAS.ngang},
    bytes_checked:bytesChecked,android:'NOT_RUN',production:'NO_GO',cost_usd:0};
}
if(require.main===module){
  (async()=>{
    try{
      if(process.platform!=='win32'||process.argv.length!==3)die('WINDOWS_C_ONLY_AND_SINGLE_URL_REQUIRED');
      const root='C:\\KTS-QA\\issue18-preview-upload-20261031';
      const actual=path.resolve(root);
      if(!/^[cC]:\\/.test(actual))die('C_ONLY');
      console.log(JSON.stringify(await verifyHosted({origin:process.argv[2],root}),null,2));
    }catch(e){console.error(e.message||e);process.exitCode=2;}
  })();
}
module.exports={verifyHosted,checkUrl,validateLocal,enforceHeaders,canonicalRemotePath,assetNames};
