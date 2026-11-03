'use strict';
// KTS Settlement: Windows C:-only isolated PostgreSQL readiness PRE-FLIGHT.
// Zero DB connections, zero installs, zero daemon starts, zero network.
// Usage: node scripts/settlement-pg-isolated-preflight.cjs --expected-sha=<SHA>
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
function reject(message){throw Error(message)}
function execute(exe,args,cwd){
  const r=cp.spawnSync(exe,args,{cwd,encoding:'utf8',timeout:12000,
    windowsHide:true,maxBuffer:128*1024});
  if(r.error||r.status!==0)reject('TEAM_PG_PREFLIGHT_COMMAND_FAILED');
  return String(r.stdout||'').trim();
}
function fullC(p){
  if(typeof p!=='string'||!path.win32.isAbsolute(p)||!/^C:[\\/]/i.test(p)||
     p.startsWith('\\\\'))reject('TEAM_PG_C_DRIVE_REQUIRED');
  const normalized=path.win32.normalize(p);
  const resolved=path.win32.normalize(fs.realpathSync(normalized));
  if(!/^C:\\/i.test(resolved)||resolved.startsWith('\\\\'))
    reject('TEAM_PG_REPARSE_LEAVES_C');
  return resolved;
}
function locateBinaries(){
  const root='C:\\Program Files\\PostgreSQL';
  if(!fs.existsSync(root))return null;
  const folders=fs.readdirSync(root,{withFileTypes:true})
    .filter(entry=>entry.isDirectory()&&/^\d+$/.test(entry.name))
    .map(entry=>Number(entry.name)).sort((a,b)=>b-a);
  for(const major of folders){
    if(major<15)continue;
    const bin=path.join(root,String(major),'bin');
    if(!fs.existsSync(bin))continue;
    const names=['initdb','pg_ctl','psql','pg_config'];
    if(names.some(n=>!fs.existsSync(path.join(bin,n+'.exe'))))continue;
    const exe=Object.fromEntries(names.map(n=>[n,fullC(path.join(bin,n+'.exe'))]));
    return {major,bin:fullC(bin),exe,version:execute(exe.pg_config,['--version'],bin)};
  }
  return null;
}
function main(){
  if(process.platform!=='win32')reject('TEAM_PG_WINDOWS_REQUIRED');
  const args=process.argv.slice(2);
  if(args.length!==1||!/^--expected-sha=[a-f0-9]{40}$/.test(args[0]))
    reject('TEAM_PG_EXACT_SHA_REQUIRED');
  const expected=args[0].slice('--expected-sha='.length);
  const root=fullC(path.resolve(__dirname,'..'));
  const actual=execute('git',['-C',root,'rev-parse','HEAD'],root);
  if(actual!==expected)reject('TEAM_PG_SOURCE_SHA_DRIFT');
  const top=fullC(execute('git',['-C',root,'rev-parse','--show-toplevel'],root));
  if(top.toLowerCase()!==root.toLowerCase())reject('TEAM_PG_REPO_ROOT_MISMATCH');
  if(execute('git',['-C',root,'status','--porcelain','--untracked-files=no'],root)!=='')
    reject('TEAM_PG_SOURCE_DIRTY');
  const evidenceRoot=path.join(root,'.qa-evidence');
  const dir=path.join(evidenceRoot,'pg-isolated-preflight');
  for(const p of [evidenceRoot,dir]){
    if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())
      reject('TEAM_PG_EVIDENCE_SYMLINK');
  }
  const binaries=locateBinaries();
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
  const receiptPath=path.join(dir,'PREFLIGHT_'+expected+'.json');
  if(fs.existsSync(receiptPath))reject('TEAM_PG_EVIDENCE_ALREADY_EXISTS_PRESERVE');
  const receipt={
    schema:'kts-settlement-pg-isolation-preflight-v1',
    source_sha:expected,node:process.version,platform:process.platform,
    checked_at:new Date().toISOString(),
    status:binaries?'POSTGRES_BINARIES_ON_C_READY':'BLOCKED_POSTGRES_BINARIES_NOT_FOUND_ON_C',
    pg_major:binaries?.major??null,pg_version:binaries?.version??null,
    pg_bindir:binaries?.bin??null,
    database_created:false,database_connected:false,postgres_started:false,
    candidate_sql_applied:false,rbac_verified:false,rls_verified:false,
    lost_commit_verified:false,
    release_readiness:'NO_GO',write_block:'ENABLED',production_mutation:'NONE',cost_usd:0
  };
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  process.stdout.write('PG_PREFLIGHT='+receipt.status+' SHA='+expected+
    ' RECEIPT='+receiptPath+'\n');
  if(!binaries)process.exitCode=3;
}
try{main()}catch(e){process.stderr.write((e&&e.message)||'TEAM_PG_PREFLIGHT_FAILED');process.stderr.write('\n');process.exitCode=2}
