'use strict';
// $0 local Windows acceptance only. No Codex, network, deploy or checkout edits.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const KTS_PIN='6210266f34620e4092d38605d970009e5579ef8b';
const NGANG_PIN='afc777d01ba2346b7eb3a322afe9bbebc6068fc0';
const MOBILE_BASE='737d689b5388fb1060bca5fbd1891e69328bed1d';
const REVIEW_BRANCH='review/issue18-calendar-hash-reconcile-20261031';
const READ_ONLY_GIT_ENV=Object.freeze({GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'});
function block(code){const e=new Error(code);e.code=code;throw e}
function parseArgs(args){
  const chrome=args.at(-1)==='--chrome';
  const words=chrome?args.slice(0,-1):args;
  // An ancestor/branch check alone accepts any future unreviewed commit.
  // The operator must supply the exact independently-reviewed SHA from
  // the checkpoint before this tool reads a checkout or writes a receipt.
  if(words.length<2||words.length>6||words.length%2!==0)block('USAGE');
  const result={'--workspace':'C:\\KTS-QA\\issue18-calendar-review','--evidence':'C:\\KTS-QA\\issue18-calendar-evidence'};
  const allowed=new Set(['--workspace','--evidence','--mobile-sha']);
  const seen=new Set();
  for(let i=0;i<words.length;i+=2){
    if(!allowed.has(words[i])||!words[i+1]||seen.has(words[i]))block('USAGE');
    seen.add(words[i]);result[words[i]]=words[i+1];
  }
  if(!/^[0-9a-f]{40}$/.test(result['--mobile-sha']||''))block('MOBILE_EXACT_SHA_REQUIRED');
  if(chrome)result._chrome=true;
  return result;
}
function cOnly(p){if(process.platform!=='win32'||!path.win32.isAbsolute(p)||!/^C:\\/i.test(p))block('C_ONLY');return path.win32.resolve(p)}
function safeExisting(p){
  p=cOnly(p);
  if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync.native(p).toLowerCase()!==p.toLowerCase())block('UNSAFE_PATH');
  return p;
}
function git(dir,args){const r=cp.spawnSync('git',args,{cwd:dir,encoding:'utf8',shell:false,windowsHide:true,timeout:15000,env:{...process.env,...READ_ONLY_GIT_ENV}});
  if(r.status!==0||r.error||r.signal)block('GIT_PROBE_FAILED');return String(r.stdout).trim();}
function assertExactMobileCommit(actual,expected){
  if(!/^[0-9a-f]{40}$/.test(expected||''))block('MOBILE_EXACT_SHA_REQUIRED');
  if(actual!==expected)block('SOURCE_DRIFT');
}
function probe(root,requiredMobileSha){
  if(!/^[0-9a-f]{40}$/.test(requiredMobileSha||''))block('MOBILE_EXACT_SHA_REQUIRED');
  const paths=Object.fromEntries(['KTS','Mobile','Ngang'].map(k=>[k,safeExisting(path.win32.join(root,k))]));
  for(const p of Object.values(paths)){
    const dotgit=safeExisting(path.win32.join(p,'.git'));
    if(!fs.lstatSync(dotgit).isDirectory())block('LINKED_GIT_REFUSED');
    if(path.win32.normalize(git(p,['rev-parse','--show-toplevel'])).toLowerCase()!==p.toLowerCase())
      block('GIT_ROOT_DRIFT');
  }
  const actual=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,git(p,['rev-parse','HEAD'])]));
  if(actual.KTS!==KTS_PIN||actual.Ngang!==NGANG_PIN)block('SOURCE_DRIFT');
  assertExactMobileCommit(actual.Mobile,requiredMobileSha);
  if(git(paths.Mobile,['branch','--show-current'])!==REVIEW_BRANCH)block('MOBILE_REVIEW_BRANCH_REQUIRED');
  if(git(paths.Mobile,['merge-base','--is-ancestor',MOBILE_BASE,actual.Mobile])!=='')block('UNEXPECTED_ANCESTRY');
  if(Object.values(paths).some(p=>git(p,['status','--porcelain','--untracked-files=all'])!==''))block('DIRTY_SOURCE');
  if(path.win32.normalize(path.win32.dirname(__dirname)).toLowerCase()!==paths.Mobile.toLowerCase())block('RUN_FROM_PINNED_MOBILE');
  return {source:{kts:actual.KTS,mobile:actual.Mobile,ngang:actual.Ngang},paths};
}
// Windows paths are case-insensitive: never allow evidence to overlap a source workspace
// using raw case-sensitive startsWith(), even if the CLI used a different casing.
function overlapsWorkspace(workspace,evidence){
  const a=path.win32.normalize(workspace).replace(/\\+$/,'').toLowerCase();
  const b=path.win32.normalize(evidence).replace(/\\+$/,'').toLowerCase();
  return a===b||a.startsWith(b+'\\')||b.startsWith(a+'\\');
}
const REQUIRED_CHROME_RECEIPTS=Object.freeze([
  'ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS',
  'ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS',
  'ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS',
  'ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS',
  'ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS'
]);
function chromeReceiptsComplete(stdout){
  const lines=String(stdout||'').split(/\r?\n/);
  return REQUIRED_CHROME_RECEIPTS.every(marker=>lines.some(line=>line===marker||line.startsWith(marker+' ')));
}
function selectChrome(){
  const supplied=process.env.CHROME_PATH;
  const candidates=supplied?[supplied]:[
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for(const name of candidates){
    if(!name)continue;
    if(fs.existsSync(name)){
      const checked=safeExisting(name);
      if(!fs.statSync(checked).isFile())block('CHROME_NOT_FILE');
      return checked;
    }
  }
  block(supplied?'CHROME_PATH_UNAVAILABLE':'CHROME_NOT_INSTALLED_C');
}
function browserAfterAdmission({root,evidence,p,stamp}){
  const chrome=selectChrome();
  // This directory is generated *only after* exact source/QA gates passed.
  // Stage and Chrome profile are local disposable evidence, never production.
  const stageDir=path.win32.join(evidence,`issue18-stage-${stamp}-${process.pid}`);
  const {stage}=require('./issue18-build-local-stage.js');
  const {verify}=require('./issue18-verify-stage.js');
  stage({mobile:p.paths.Mobile,ngang:p.paths.Ngang,out:stageDir,
    mobileSha:p.source.mobile,ngangSha:p.source.ngang});
  const stageReceipt=verify({mobile:p.paths.Mobile,ngang:p.paths.Ngang,out:stageDir,
    mobileSha:p.source.mobile,ngangSha:p.source.ngang});
  if(stageReceipt.status!=='STAGE_SOURCE_BYTES_PASS'||stageReceipt.release_authorized!==false)
    block('STAGE_NOT_QUALIFIED');
  const {safeFile}=require('./issue18-production-preflight.js');
  const smoke=safeFile(p.paths.Mobile,'scripts/issue18-chrome-isolated-smoke.js');
  const output=cp.spawnSync(process.execPath,[smoke,stageDir],{cwd:p.paths.Mobile,
    shell:false,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024,
    env:{...process.env,CHROME_PATH:chrome,...READ_ONLY_GIT_ENV}});
  if(output.status!==0||output.signal||output.error)
    return {status:'BLOCKED_CHROME',stage:stageDir,stage_receipt:stageReceipt,
      exit_code:output.status,signal:output.signal||null,
      detail:String(output.error?.message||output.stderr||'CHROME_EXIT_NONZERO').slice(-6000),
      stdout:String(output.stdout||'').slice(-6000)};
  if(!chromeReceiptsComplete(output.stdout))
    return {status:'BLOCKED_CHROME',stage:stageDir,stage_receipt:stageReceipt,
      error:'CHROME_RECEIPTS_MISSING',stdout:String(output.stdout||'').slice(-6000)};
  // Even success needs immutable checkout identities after real Chrome activity.
  const after=probe(root,p.source.mobile);
  if(JSON.stringify(after.source)!==JSON.stringify(p.source))block('POST_CHROME_SOURCE_DRIFT');
  return {status:'LOCAL_CHROME_PASS_ANDROID_PENDING',stage:stageDir,
    stage_receipt:stageReceipt,stdout:String(output.stdout||'').slice(-6000)};
}
function run(args=process.argv.slice(2)){
  const opts=parseArgs(args),chromeRequested=opts._chrome===true,root=safeExisting(opts['--workspace']),evidence=cOnly(opts['--evidence']);
  const parent=safeExisting(path.win32.dirname(evidence));
  if(overlapsWorkspace(root,evidence))block('OVERLAPPING_EVIDENCE');
  const p=probe(root,opts['--mobile-sha']);
  const {admission}=require('./issue18-production-preflight.js');
  let result;
  try{result=admission({'--workspace':root,'--kts-sha':p.source.kts,'--mobile-sha':p.source.mobile,'--ngang-sha':p.source.ngang});}
  catch(e){result={status:'BLOCKED_PREFLIGHT',code:e.code||'UNKNOWN',detail:String(e.message),release:'NO_GO',cost_usd:0};}
  if(!fs.existsSync(evidence))fs.mkdirSync(evidence,{recursive:false});
  safeExisting(evidence);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  let browser={status:'NOT_RUN'};
  if(chromeRequested&&result.status==='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING')try{
    browser=browserAfterAdmission({root,evidence,p,stamp});
  }catch(e){browser={status:'BLOCKED_CHROME',error:e.code||'UNKNOWN',detail:String(e.message)};}
  const dest=path.win32.join(evidence,`issue18-${stamp}-${process.pid}.json`);
  fs.writeFileSync(dest,JSON.stringify({schema:'KTS_ISSUE18_LOCAL_EVIDENCE_V1',source:p.source,read_only_source:true,
    evidence_file:dest,release:'NO_GO',cost_usd:0,preflight:result,browser},null,2)+'\n',{encoding:'utf8',flag:'wx'});
  return {file:dest,status:result.status,browser:browser.status,
    success:result.status==='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING'&&
      (!chromeRequested||browser.status==='LOCAL_CHROME_PASS_ANDROID_PENDING')};
}
if(require.main===module){try{const result=run();console.log(JSON.stringify(result));if(!result.success)process.exitCode=2;}
catch(e){console.error(JSON.stringify({status:'BLOCKED',code:e.code||'UNKNOWN',detail:String(e.message),release:'NO_GO'}));process.exitCode=2;}}
module.exports={parseArgs,cOnly,overlapsWorkspace,READ_ONLY_GIT_ENV,chromeReceiptsComplete,assertExactMobileCommit,run};
