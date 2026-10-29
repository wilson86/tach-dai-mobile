'use strict';
// Issue #18: operator-invoked, read-only local admission. No production or network.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');

const EXPECTED_VERSIONS=Object.freeze({mobile:'2.0.36',ngang:'1.0.34',unified:'1.0.25'});
const MOBILE_TESTS=Object.freeze([
  'tests/release-review-asset-consistency.js',
  'tests/ledger-readable-working-ui.js',
  'tests/source-copy-cut-actions.js',
  'tests/unified-offline-engine-cache.js',
  'tests/unified-versioned-ux-cache.js',
  'tests/issue18-build-local-stage.test.js'
]);
const NGANG_TESTS=Object.freeze([
  'tests/release-review-asset-consistency.js',
  'tests/ledger-readable-working-ui.js',
  'tests/source-copy-cut-actions.js',
  'tests/ngang-money-boundary-matrix.js'
]);
const ISSUE18_ENGINE='7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
function block(code,detail){const error=new Error(String(detail||code));error.code=code;throw error;}
function argsOf(words){
  const wanted=['--workspace','--kts-sha','--mobile-sha','--ngang-sha'];
  if(words.length!==8)block('USAGE','Provide --workspace ABS_C_PATH and all three exact GitHub commit SHAs.');
  const args=Object.create(null);
  for(let i=0;i<words.length;i+=2){
    if(!wanted.includes(words[i])||!words[i+1]||Object.hasOwn(args,words[i]))
      block('USAGE','Unknown, duplicate or empty argument '+words[i]);
    args[words[i]]=words[i+1];
  }
  if(wanted.some(key=>!args[key]))block('USAGE','Missing a required parameter');
  for(const k of wanted.slice(1))if(!/^[a-f0-9]{40}$/.test(args[k]))block('USAGE','Invalid commit SHA for '+k);
  return args;
}
function verifyWindowsWorkspace(raw){
  if(process.platform!=='win32')block('WINDOWS_REQUIRED','Run on authorized Windows C: test host, not a cloud runner.');
  if(!path.win32.isAbsolute(raw)||!/^c:\\/i.test(raw))block('C_ONLY','Workspace must be an absolute C: path.');
  const full=path.win32.resolve(raw);
  if(!fs.existsSync(full)||fs.lstatSync(full).isSymbolicLink())block('WORKSPACE_MISSING','Clean C: workspace not found or symlink.');
  const real=fs.realpathSync.native(full);
  if(path.win32.normalize(real).toLowerCase()!==path.win32.normalize(full).toLowerCase())
    block('JUNCTION_REFUSED','Workspace resolves through a junction/symlink.');
  return full;
}
function verifyFolder(root,folder){
  const p=path.join(root,folder);
  if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink())block('MISSING_REPO',folder);
  const real=fs.realpathSync.native(p);
  if(path.win32.normalize(real).toLowerCase()!==path.win32.normalize(p).toLowerCase())
    block('JUNCTION_REFUSED',folder);
  return p;
}
function processReadOnly(binary,argv,cwd,timeout=120000){
  const r=cp.spawnSync(binary,argv,{cwd,encoding:'utf8',shell:false,windowsHide:true,timeout,
    maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PIP_NO_INDEX:'1'}});
  return {exitCode:r.status,signal:r.signal||null,error:r.error?String(r.error.message):null,
    stdout:String(r.stdout||'').slice(-5000),stderr:String(r.stderr||'').slice(-5000)};
}
function verifiedRepo(dir,expectedSha){
  // Disallow linked Git worktrees or .git indirections pointing to E:/F:.
  // A fresh isolated clone on C: has a normal local .git directory.
  const gitdir=path.join(dir,'.git');
  if(!fs.existsSync(gitdir)||!fs.lstatSync(gitdir).isDirectory()||
     fs.lstatSync(gitdir).isSymbolicLink()||
     path.win32.normalize(fs.realpathSync.native(gitdir)).toLowerCase()!==
       path.win32.normalize(gitdir).toLowerCase())
    block('LINKED_GIT_REFUSED','Use a normal clean clone with .git on C:, not a linked worktree.');
  const root=processReadOnly('git',['rev-parse','--show-toplevel'],dir);
  if(root.exitCode!==0||!root.stdout.trim())block('GIT_ROOT_UNAVAILABLE',dir);
  if(path.win32.normalize(root.stdout.trim()).toLowerCase()!==path.win32.normalize(dir).toLowerCase())
    block('NESTED_OR_WRONG_REPO',dir);
  const head=processReadOnly('git',['rev-parse','HEAD'],dir);
  if(head.exitCode!==0||head.stdout.trim()!==expectedSha)
    block('SOURCE_DRIFT',dir+' expected '+expectedSha+' actual '+head.stdout.trim());
  const dirty=processReadOnly('git',['status','--porcelain','--untracked-files=all'],dir);
  if(dirty.exitCode!==0||dirty.stdout.trim())block('DIRTY_SOURCE',dir+' contains local changes or unknown files');
}
function jsonAt(folder,filename){return JSON.parse(fs.readFileSync(path.join(folder,filename),'utf8'));}
function admission(options,runCommand=processReadOnly){
  const root=verifyWindowsWorkspace(options['--workspace']);
  const dirs={kts:verifyFolder(root,'KTS'),mobile:verifyFolder(root,'Mobile'),ngang:verifyFolder(root,'Ngang')};
  verifiedRepo(dirs.kts,options['--kts-sha']);
  verifiedRepo(dirs.mobile,options['--mobile-sha']);
  verifiedRepo(dirs.ngang,options['--ngang-sha']);
  const m=jsonAt(dirs.mobile,'version.json'),n=jsonAt(dirs.ngang,'version.json'),
    u=jsonAt(dirs.mobile,'app/version.json');
  if(m.version!==EXPECTED_VERSIONS.mobile||n.version!==EXPECTED_VERSIONS.ngang||
     u.version!==EXPECTED_VERSIONS.unified)
    block('VERSION_DRIFT','Candidate Mobile/Ngang/Unified version mismatch');
  if([m,n,u].some(v=>v.business_engine_sha256!==ISSUE18_ENGINE))
    block('ENGINE_DRIFT','One or more candidate engine SHA fields mismatch');
  const result={schema:'KTS_ISSUE18_LOCAL_ADMISSION_V1',source:{
    kts:options['--kts-sha'],mobile:options['--mobile-sha'],ngang:options['--ngang-sha']
  },versions:EXPECTED_VERSIONS,engine:ISSUE18_ENGINE,checks:[],chrome:'NOT_RUN',
    android:'NOT_RUN',production:'UNMODIFIED',release:'NO_GO',cost_usd:0};
  const py=runCommand('python',['-B','KTSRouter/scripts/build_shared_business_engine.py','--check',
    '--workspace-root',root],dirs.kts,180000);
  result.checks.push({name:'CANONICAL_GENERATOR_CHECK',...py});
  if(py.exitCode!==0||py.error){result.status='BLOCKED_GENERATOR';return result;}
  for(const [name,dir,tests] of [
    ['MOBILE',dirs.mobile,MOBILE_TESTS],['NGANG',dirs.ngang,NGANG_TESTS]
  ])for(const test of tests){
    const actual=path.join(dir,test);
    if(!fs.existsSync(actual)||fs.lstatSync(actual).isSymbolicLink())
      block('MISSING_TEST',name+'/'+test);
    const r=runCommand(process.execPath,[test],dir,90000);
    result.checks.push({name:name+'/'+test,...r});
    if(r.exitCode!==0||r.error){result.status='BLOCKED_FOCUSED_TEST';return result;}
  }
  result.status='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING';
  return result;
}
if(require.main===module){
  try {
    const result=admission(argsOf(process.argv.slice(2)));
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING')process.exitCode=2;
  }catch(e){
    console.error(JSON.stringify({status:'BLOCKED_PREFLIGHT',code:e.code||'UNKNOWN',
      detail:String(e.message||e),cost_usd:0,release:'NO_GO'}));
    process.exitCode=2;
  }
}
module.exports={argsOf,admission};
