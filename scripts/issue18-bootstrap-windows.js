'use strict';
// KTS Issue #18 — operator-run C:-only source preparation. NEVER overwrite
// existing files or clone outside the explicitly scoped Windows QA workspace.
// Does not create/trigger CI, release, publish or access customer data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const WORKSPACE='C:\\KTS-QA\\issue18-calendar-review';
const SOURCE=Object.freeze([
  Object.freeze({name:'KTS',repo:'wilson86/KTS',branch:'review/issue18-calendar-hash-reconcile-20261031',sha:'6210266f34620e4092d38605d970009e5579ef8b'}),
  Object.freeze({name:'Mobile',repo:'wilson86/tach-dai-mobile',branch:'review/issue18-calendar-hash-reconcile-20261031',sha:null}),
  Object.freeze({name:'Ngang',repo:'wilson86/tach-dai-ngang',branch:'review/issue18-calendar-hash-reconcile-20261031',sha:'afc777d01ba2346b7eb3a322afe9bbebc6068fc0'})
]);
function fail(code){const e=new Error(code);e.code=code;throw e}
function argsOf(args){
  if(args.length!==2&&args.length!==3)fail('USAGE_EXACT_PIN_REQUIRED');
  if(args[0]!=='--mobile-sha'||!/^[0-9a-f]{40}$/.test(args[1]||''))fail('MOBILE_PIN_REQUIRED');
  if(args.length===3&&args[2]!=='--run-chrome')fail('UNKNOWN_OPTION');
  return {mobileSha:args[1],runChrome:args[2]==='--run-chrome'};
}
function classifyChildren(children){
  if(!Array.isArray(children))fail('BAD_LISTING');
  const normalized=children.map(x=>String(x).toLowerCase());
  if(normalized.length===0)return 'CREATE_NEW_ONLY';
  const wanted=new Set(SOURCE.map(item=>item.name.toLowerCase()));
  if(new Set(normalized).size!==normalized.length||normalized.some(name=>!wanted.has(name)))
    fail('PARTIAL_OR_UNKNOWN_WORKSPACE');
  return normalized.length===SOURCE.length?'VERIFY_EXISTING_ONLY':'RESUME_VERIFIED_ONLY';
}
// A partial workspace is safe to resume ONLY after every already-present
// checkout has passed the same full SHA/branch/origin/clean validation.
// Compute all required preflight verifications BEFORE the first clone.
function planWorkspace(children){
  const mode=classifyChildren(children);
  const present=new Set(children.map(name=>String(name).toLowerCase()));
  return {
    mode,
    verify:SOURCE.filter(item=>present.has(item.name.toLowerCase())).map(item=>item.name),
    clone:SOURCE.filter(item=>!present.has(item.name.toLowerCase())).map(item=>item.name)
  };
}
function expectedOrigin(origin,repo){
  const escaped=repo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('^(?:https://github\\.com/|git@github\\.com:)'+escaped+'(?:\\.git)?$','i').test(String(origin).trim());
}
function cPath(raw){
  if(process.platform!=='win32'||!path.win32.isAbsolute(raw)||!/^C:\\/i.test(raw))fail('C_ONLY');
  return path.win32.resolve(raw);
}
function safeExisting(p){
  p=cPath(p);
  if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink()||
     fs.realpathSync.native(p).toLowerCase()!==p.toLowerCase())fail('UNSAFE_EXISTING_PATH');
  return p;
}
function git(args,cwd,timeout=30000){
  const env={...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'};
  const r=cp.spawnSync('git',args,{cwd,encoding:'utf8',shell:false,windowsHide:true,
    timeout,maxBuffer:1024*1024,env});
  if(r.status!==0||r.signal||r.error)fail('GIT_FAILED');
  return String(r.stdout).trim();
}
function assertCleanPinned(dir,item){
  safeExisting(dir);
  const dot=safeExisting(path.win32.join(dir,'.git'));
  if(!fs.lstatSync(dot).isDirectory())fail('LINKED_WORKTREE_REFUSED');
  if(path.win32.normalize(git(['rev-parse','--show-toplevel'],dir)).toLowerCase()!==
     path.win32.normalize(dir).toLowerCase())fail('GIT_ROOT_DRIFT');
  if(git(['branch','--show-current'],dir)!==item.branch)fail('BRANCH_DRIFT');
  if(git(['rev-parse','HEAD'],dir)!==item.sha)fail('SOURCE_SHA_DRIFT');
  if(!expectedOrigin(git(['remote','get-url','origin'],dir),item.repo))fail('REMOTE_ORIGIN_DRIFT');
  if(git(['status','--porcelain','--untracked-files=all'],dir)!=='')fail('SOURCE_NOT_CLEAN');
}
function ensureRoot(){
  cPath(WORKSPACE);
  const root='C:\\',parent='C:\\KTS-QA';
  safeExisting(root);
  if(!fs.existsSync(parent))fs.mkdirSync(parent);
  safeExisting(parent);
  if(!fs.existsSync(WORKSPACE))fs.mkdirSync(WORKSPACE);
  safeExisting(WORKSPACE);
  if(!fs.lstatSync(WORKSPACE).isDirectory())fail('WORKSPACE_NOT_DIRECTORY');
  return WORKSPACE;
}
function checkEnvironment(){
  cPath(WORKSPACE);
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_CONFIG_COUNT',
    'GIT_TEMPLATE_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES']){
    if(process.env[key])fail('UNSAFE_GIT_ENV_'+key);
  }
  const tmp=os.tmpdir();
  safeExisting(tmp);
}
function prepare(args=process.argv.slice(2)){
  const opts=argsOf(args);
  checkEnvironment();
  const root=ensureRoot();
  const plan=planWorkspace(fs.readdirSync(root));
  const items=SOURCE.map(x=>({...x,sha:x.sha||opts.mobileSha}));
  // Fail closed before creating ANY missing clone if an existing folder
  // is dirty, untrusted, a reparse point or at an unexpected SHA.
  for(const item of items){
    if(plan.verify.includes(item.name))assertCleanPinned(path.win32.join(root,item.name),item);
  }
  for(const item of items){
    if(!plan.clone.includes(item.name))continue;
    const dest=path.win32.join(root,item.name);
    if(fs.existsSync(dest))fail('DESTINATION_APPEARED');
    // core.autocrlf=false applies BEFORE initial checkout and is saved only
    // inside newly created isolated clones. No global Git configuration.
    // Never delete a partial clone on failure: preserve error evidence.
    git(['clone','-c','core.autocrlf=false','--branch',item.branch,'--single-branch',
      '--no-tags','https://github.com/'+item.repo+'.git',dest],root,300000);
    assertCleanPinned(dest,item);
  }
  // Recheck all cloned and previously verified identities before admission.
  for(const item of items)assertCleanPinned(path.win32.join(root,item.name),item);
  // The built-in launcher performs its OWN strict SHA/branch/clean-source checks.
  if(!opts.runChrome)return {status:'C_ONLY_CHECKOUTS_READY',source:Object.fromEntries(items.map(x=>[x.name,x.sha])),
    executed_admission:false,release:'NO_GO',cost_usd:0};
  const exe=path.win32.join(root,'Mobile','scripts','issue18-run-windows.js');
  safeExisting(exe);
  const res=cp.spawnSync(process.execPath,[exe,'--mobile-sha',opts.mobileSha,'--chrome'],{
    cwd:path.win32.join(root,'Mobile'),encoding:'utf8',shell:false,windowsHide:true,
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'},timeout:1200000,maxBuffer:1024*1024});
  // Do not declare acceptance merely because the child exits zero. The
  // admission JSON receipt and real device gates remain mandatory.
  return {status:res.status===0&&!res.error&&!res.signal?'LOCAL_ACCEPTANCE_RECEIPT_REVIEW_REQUIRED':'LOCAL_ACCEPTANCE_BLOCKED',
    helper_exit_code:res.status,helper_output:String(res.stdout||'').slice(-4500),
    helper_error:String(res.error?.message||res.stderr||'').slice(-2500),
    release:'NO_GO',cost_usd:0};
}
if(require.main===module){
  try{const result=prepare();console.log(JSON.stringify(result));if(result.status==='LOCAL_ACCEPTANCE_BLOCKED')process.exitCode=2;}
  catch(e){console.error(JSON.stringify({status:'BLOCKED',code:e.code||'UNKNOWN',release:'NO_GO',cost_usd:0}));
    process.exitCode=2;}
}
module.exports={WORKSPACE,SOURCE,argsOf,classifyChildren,planWorkspace,expectedOrigin,cPath,prepare};
