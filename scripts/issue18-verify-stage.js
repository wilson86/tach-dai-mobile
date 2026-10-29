'use strict';
// Read-only, exact-byte verifier for an Issue18 localhost Unified staging tree.
// Does not navigate a browser, rewrite files, contact a network or grant release.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isolatedUnifiedHtml,isolatedUnifiedServiceWorker}=require('./issue18-build-local-stage.js');
const {verifyGitSource}=require('./issue18-git-source-pin.js');

const MOBILE_FILES=[
  'index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js',
  'icon-192.png','icon-512.png','app/index.html','app/sw.js',
  'app/version.json','app/unified-core.js','app/manifest.webmanifest'
];
const NGANG_FILES=[
  'index.html','sw.js','version.json','manifest.webmanifest',
  'business_engine.generated.js','station_calendar.generated.js',
  'icon-192.png','icon-512.png'
];
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(code,message){const e=new Error('STAGE_INTEGRITY_BLOCKED ['+code+']: '+message);e.code=code;throw e}
function root(name,p){
  if(typeof p!=='string'||!path.isAbsolute(p)||!fs.existsSync(p))
    fail('INVALID_ROOT',name+' must exist at an absolute path');
  const resolved=path.resolve(p);
  if(fs.lstatSync(resolved).isSymbolicLink()||fs.realpathSync(resolved)!==resolved)
    fail('UNSAFE_ROOT',name+' must not be a junction or symlink');
  if(process.platform==='win32'&&!/^[cC]:\\/.test(resolved))
    fail('C_ONLY',name+' must be on C:');
  return resolved;
}
function safeRead(dir,rel){
  const f=path.join(dir,rel);
  if(!f.startsWith(dir+path.sep)||!fs.existsSync(f)||
     fs.lstatSync(f).isSymbolicLink()||!fs.statSync(f).isFile()||
     !fs.realpathSync(f).startsWith(dir+path.sep))
    fail('MISSING_OR_UNSAFE_FILE',rel+' missing, unreadable or outside controlled tree');
  return fs.readFileSync(f);
}
function pathsIn(rootDir){
  const found=[];
  function walk(dir,base=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(entry.isSymbolicLink())fail('UNSAFE_ENTRY','symlink in staging');
      const rel=base?base+'/'+entry.name:entry.name;
      if(entry.isDirectory())walk(path.join(dir,entry.name),rel);
      else if(entry.isFile())found.push(rel);
      else fail('UNSAFE_ENTRY','special file '+rel);
    }
  }
  walk(rootDir);
  return found.sort();
}
function verify({mobile,ngang,out,mobileSha,ngangSha}){
  const m=root('mobile',mobile),n=root('ngang',ngang),s=root('out',out);
  if(Boolean(mobileSha)!==Boolean(ngangSha))fail('SOURCE_SHA_PIN_REQUIRED','both Git source pins must be provided');
  if(mobileSha){verifyGitSource(m,mobileSha);verifyGitSource(n,ngangSha);}
  if(new Set([m,n,s]).size!==3)fail('OVERLAP','staging and source paths collide');
  if([m,n].some(x=>s.startsWith(x+path.sep)||x.startsWith(s+path.sep)))
    fail('OVERLAP','staging and source must be disjoint');
  const expectedFiles=[
    ...MOBILE_FILES.map(p=>'Mobile/'+p),
    ...NGANG_FILES.map(p=>'Ngang/'+p),
    'ISSUE18_STAGE_MANIFEST.json'
  ].sort();
  if(JSON.stringify(pathsIn(s))!==JSON.stringify(expectedFiles))
    fail('EXTRA_OR_MISSING_ASSET','stage must contain exactly the allowlisted assets');
  let manifest;
  try{manifest=JSON.parse(safeRead(s,'ISSUE18_STAGE_MANIFEST.json').toString('utf8'))}
  catch(e){fail('INVALID_MANIFEST',e.message)}
  if(mobileSha&&(manifest.source_commit_sha?.mobile!==mobileSha||manifest.source_commit_sha?.ngang!==ngangSha))
    fail('SOURCE_SHA_DRIFT','stage manifest is not pinned to the requested Git commits');
  if(manifest.schema!=='KTS_ISSUE18_LOCAL_ONLY_STAGE_V1' ||
    manifest.release_authorized!==false||manifest.source_unchanged!==true ||
    manifest.iframe_ngang!=='../../Ngang/' ||
    manifest.mobile_version!=='2.0.36'||
    manifest.ngang_version!=='1.0.35'||
    manifest.unified_version!=='1.0.25')
    fail('BAD_MANIFEST','wrong schema, version, iframe or release flag');
  const mv=JSON.parse(safeRead(m,'version.json')),nv=JSON.parse(safeRead(n,'version.json')),
    uv=JSON.parse(safeRead(m,'app/version.json'));
  const engine=mv.business_engine_sha256;
  if(!/^[a-f0-9]{64}$/.test(engine)||nv.business_engine_sha256!==engine||
    uv.business_engine_sha256!==engine||manifest.engine_sha256!==engine||
    mv.version!==manifest.mobile_version||nv.version!==manifest.ngang_version||
    uv.version!==manifest.unified_version)
    fail('ENGINE_OR_VERSION_DRIFT','source, stage and engine version identity mismatch');
  const actualSource={
    unified_html:sha256(safeRead(m,'app/index.html')),
    unified_sw:sha256(safeRead(m,'app/sw.js')),
    mobile_engine:sha256(safeRead(m,'business_engine.generated.js')),
    ngang_engine:sha256(safeRead(n,'business_engine.generated.js'))
  };
  for(const [key,hash]of Object.entries(actualSource))
    if(manifest.source_sha256?.[key]!==hash)
      fail('SOURCE_DRIFT','source changed since stage generation: '+key);
  const rewrittenHtml=Buffer.from(isolatedUnifiedHtml(safeRead(m,'app/index.html').toString('utf8')));
  const rewrittenSw=Buffer.from(isolatedUnifiedServiceWorker(safeRead(m,'app/sw.js').toString('utf8')));
  if(!manifest.source_files_sha256||!manifest.staged_files_sha256||
     Object.keys(manifest.source_files_sha256).length!==21||
     Object.keys(manifest.staged_files_sha256).length!==21)
    fail('INCOMPLETE_ASSET_HASHES','manifest must bind all 21 source and stage assets');
  let checked=0;
  for(const [prefix,source,files]of [['Mobile',m,MOBILE_FILES],['Ngang',n,NGANG_FILES]]){
    for(const rel of files){
      const fullRel=prefix+'/'+rel;
      const sourceBytes=safeRead(source,rel);
      if(manifest.source_files_sha256[fullRel]!==sha256(sourceBytes))
        fail('SOURCE_DRIFT','source asset changed since stage build: '+fullRel);
      let expected=sourceBytes;
      if(prefix==='Mobile'&&rel==='app/index.html')expected=rewrittenHtml;
      if(prefix==='Mobile'&&rel==='app/sw.js')expected=rewrittenSw;
      const actual=safeRead(s,fullRel),hash=sha256(actual);
      if(hash!==sha256(expected)||
         manifest.staged_files_sha256[fullRel]!==hash)
        fail('ASSET_BYTES_DRIFT',fullRel+' differs from original or safe rewrite');
      checked++;
    }
  }
  if(manifest.staged_sha256?.unified_html!==sha256(rewrittenHtml)||
    manifest.staged_sha256?.unified_sw!==sha256(rewrittenSw))
    fail('STAGED_DIGEST_DRIFT','manifest stage hashes do not match verified content');
  if(mobileSha){verifyGitSource(m,mobileSha);verifyGitSource(n,ngangSha);}
  return Object.freeze({status:'STAGE_SOURCE_BYTES_PASS',
    checked_assets:checked,engine_sha256:engine,
    stage_manifest_sha256:sha256(safeRead(s,'ISSUE18_STAGE_MANIFEST.json')),
    release_authorized:false,chrome:'NOT_RUN',android:'NOT_RUN',cost_usd:0});
}
function parseArgs(args){
  if(args.length!==10)fail('USAGE','--mobile ABS --ngang ABS --out ABS --mobile-sha SHA40 --ngang-sha SHA40');
  const values=Object.create(null);
  for(let i=0;i<args.length;i+=2){
    const key=args[i];
    if(!['--mobile','--ngang','--out','--mobile-sha','--ngang-sha'].includes(key)||!args[i+1]||Object.hasOwn(values,key))
      fail('USAGE','unexpected or duplicate argument '+key);
    values[key]=args[i+1];
  }
  if(!values['--mobile']||!values['--ngang']||!values['--out']||!values['--mobile-sha']||!values['--ngang-sha'])
    fail('USAGE','all five pinned inputs required');
  return {mobile:values['--mobile'],ngang:values['--ngang'],out:values['--out'],
    mobileSha:values['--mobile-sha'],ngangSha:values['--ngang-sha']};
}
if(require.main===module){
  try{console.log(JSON.stringify(verify(parseArgs(process.argv.slice(2))),null,2))}
  catch(error){console.error(JSON.stringify({status:'STAGE_INTEGRITY_BLOCKED',
    code:error.code||'UNKNOWN',message:String(error.message),release:'NO_GO',cost_usd:0}));
    process.exitCode=2}
}
module.exports={verify,parseArgs};
