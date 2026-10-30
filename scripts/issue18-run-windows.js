'use strict';
// $0 local Windows acceptance only. No Codex, network, deploy or checkout edits.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const KTS_PIN='eec80f812ff0ab47109edcacc32f31eedaffca79';
const NGANG_PIN='6f47f7c6b073c5df25da55b2b8f3bcc61513da20';
const MOBILE_BASE='737d689b5388fb1060bca5fbd1891e69328bed1d';
const REVIEW_BRANCH='review/issue18-offline-parity-gate-20261030';
const READ_ONLY_GIT_ENV=Object.freeze({GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'});
function block(code){const e=new Error(code);e.code=code;throw e}
function parseArgs(args){
  if(args.length!==0&&args.length!==4)block('USAGE');
  const result={'--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence'};
  for(let i=0;i<args.length;i+=2){if(!Object.hasOwn(result,args[i])||!args[i+1]||result._seen?.includes(args[i]))block('USAGE');
    result._seen??=[];result._seen.push(args[i]);result[args[i]]=args[i+1];}
  delete result._seen;return result;
}
function cOnly(p){if(process.platform!=='win32'||!path.win32.isAbsolute(p)||!/^C:\\/i.test(p))block('C_ONLY');return path.win32.resolve(p)}
function safeExisting(p){
  p=cOnly(p);
  if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync.native(p).toLowerCase()!==p.toLowerCase())block('UNSAFE_PATH');
  return p;
}
function git(dir,args){const r=cp.spawnSync('git',args,{cwd:dir,encoding:'utf8',shell:false,windowsHide:true,timeout:15000,env:{...process.env,...READ_ONLY_GIT_ENV}});
  if(r.status!==0||r.error||r.signal)block('GIT_PROBE_FAILED');return String(r.stdout).trim();}
function probe(root){
  const paths=Object.fromEntries(['KTS','Mobile','Ngang'].map(k=>[k,safeExisting(path.win32.join(root,k))]));
  for(const p of Object.values(paths)){
    const dotgit=safeExisting(path.win32.join(p,'.git'));
    if(!fs.lstatSync(dotgit).isDirectory())block('LINKED_GIT_REFUSED');
    if(path.win32.normalize(git(p,['rev-parse','--show-toplevel'])).toLowerCase()!==p.toLowerCase())
      block('GIT_ROOT_DRIFT');
  }
  const actual=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,git(p,['rev-parse','HEAD'])]));
  if(actual.KTS!==KTS_PIN||actual.Ngang!==NGANG_PIN||!/^[a-f0-9]{40}$/.test(actual.Mobile))block('SOURCE_DRIFT');
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
function run(args=process.argv.slice(2)){
  const opts=parseArgs(args),root=safeExisting(opts['--workspace']),evidence=cOnly(opts['--evidence']);
  const parent=safeExisting(path.win32.dirname(evidence));
  if(overlapsWorkspace(root,evidence))block('OVERLAPPING_EVIDENCE');
  const p=probe(root);
  const {admission}=require('./issue18-production-preflight.js');
  let result;
  try{result=admission({'--workspace':root,'--kts-sha':p.source.kts,'--mobile-sha':p.source.mobile,'--ngang-sha':p.source.ngang});}
  catch(e){result={status:'BLOCKED_PREFLIGHT',code:e.code||'UNKNOWN',detail:String(e.message),release:'NO_GO',cost_usd:0};}
  if(!fs.existsSync(evidence))fs.mkdirSync(evidence,{recursive:false});
  safeExisting(evidence);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const dest=path.win32.join(evidence,`issue18-${stamp}-${process.pid}.json`);
  fs.writeFileSync(dest,JSON.stringify({schema:'KTS_ISSUE18_LOCAL_EVIDENCE_V1',source:p.source,read_only_source:true,
    evidence_file:dest,release:'NO_GO',cost_usd:0,preflight:result},null,2)+'\n',{encoding:'utf8',flag:'wx'});
  return {file:dest,status:result.status,success:result.status==='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING'};
}
if(require.main===module){try{const result=run();console.log(JSON.stringify(result));if(!result.success)process.exitCode=2;}
catch(e){console.error(JSON.stringify({status:'BLOCKED',code:e.code||'UNKNOWN',detail:String(e.message),release:'NO_GO'}));process.exitCode=2;}}
module.exports={parseArgs,cOnly,overlapsWorkspace,READ_ONLY_GIT_ENV,run};
