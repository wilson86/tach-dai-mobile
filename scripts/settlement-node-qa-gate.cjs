'use strict';
// Offline Windows C:-only source-bound Node acceptance gate.
// No PostgreSQL, browser, HTTP listener, deploy, CI, credentials or production writes.
// Usage: node scripts/settlement-node-qa-gate.cjs --expected-sha=<40 hex>
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const TESTS=Object.freeze([
  'tests/settlement-team-client-review-findings.test.cjs',
  'tests/settlement-team-unknown-outcome-client.test.cjs',
  'tests/settlement-team-pilot-ui.test.cjs'
]);
function abort(code,details){process.stderr.write(code+(details?' '+details:'')+'\n');process.exitCode=2;}
function git(args,root){
  const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:12000,
    windowsHide:true,maxBuffer:1024*1024});
  if(r.error||r.status!==0)throw Error('TEAM_QA_GIT_PREFLIGHT_FAILED');
  return String(r.stdout||'').trim();
}
function asNum(output,key){
  const matches=[...output.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$','gm'))];
  return matches.length?Number(matches[matches.length-1][1]):null;
}
function main(){
  if(process.platform!=='win32')throw Error('TEAM_QA_WINDOWS_REQUIRED');
  const expected=(process.argv.slice(2).find(x=>x.startsWith('--expected-sha='))||'').split('=')[1];
  if(!expected||! /^[a-f0-9]{40}$/.test(expected)||process.argv.length!==3)
    throw Error('TEAM_QA_EXPECTED_SHA_REQUIRED');
  const root=fs.realpathSync(path.resolve(__dirname,'..'));
  if(!/^C:\\/.test(root))throw Error('TEAM_QA_C_ONLY');
  const actual=git(['rev-parse','HEAD'],root);
  if(actual!==expected)throw Error('TEAM_QA_SOURCE_SHA_DRIFT');
  if(fs.realpathSync(git(['rev-parse','--show-toplevel'],root))!==root)
    throw Error('TEAM_QA_REPO_ROOT_MISMATCH');
  if(git(['status','--porcelain','--untracked-files=no'],root)!=='')
    throw Error('TEAM_QA_TRACKED_SOURCE_DIRTY');
  for(const name of TESTS){
    const location=path.join(root,name);
    if(!fs.statSync(location).isFile()||fs.realpathSync(location)!==location)
      throw Error('TEAM_QA_TEST_FILE_INVALID');
  }
  const evidenceRoot=path.join(root,'.qa-evidence');
  const target=path.join(evidenceRoot,'settlement-node-gate');
  for(const dir of [evidenceRoot,target]){
    if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())
      throw Error('TEAM_QA_EVIDENCE_SYMLINK_FORBIDDEN');
  }
  if(!fs.existsSync(target))fs.mkdirSync(target,{recursive:true});
  const receipt=path.join(target,'NODE_QA_'+expected+'.json');
  if(fs.existsSync(receipt)){
    if(fs.lstatSync(receipt).isSymbolicLink())throw Error('TEAM_QA_RECEIPT_SYMLINK_FORBIDDEN');
    const old=JSON.parse(fs.readFileSync(receipt,'utf8'));
    if(old.status==='PASS'&&old.source_sha===expected&&
       old.node===process.version&&JSON.stringify(old.test_files)===JSON.stringify(TESTS)){
      process.stdout.write('SKIP_ALREADY_PASS source='+expected+' receipt='+receipt+'\n');
      return;
    }
  }
  const run=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...TESTS],
    {cwd:root,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:4*1024*1024,
      env:{...process.env,NODE_ENV:'test'}});
  const stdout=String(run.stdout||''),stderr=String(run.stderr||'');
  const n=asNum(stdout,'tests'),pass=asNum(stdout,'pass'),
    fail=asNum(stdout,'fail'),skip=asNum(stdout,'skipped')??0;
  const accepted=!run.error&&run.status===0&&n!==null&&pass!==null&&fail===0&&
    n>0&&pass+skip===n;
  const data={
    schema:'kts-settlement-native-node-qa-v1',source_sha:expected,
    tested_at:new Date().toISOString(),node:process.version,
    platform:process.platform,test_files:TESTS,status:accepted?'PASS':'FAIL',
    tests:n,pass,fail,skip,exit_code:run.status,
    timed_out:run.error?.code==='ETIMEDOUT',
    ci_status:'NOT_RUN',browser_status:'NOT_RUN',postgresql_status:'NOT_RUN',
    write_block:'ENABLED',production_mutation:'NONE',cost_usd:0,
    stdout_tail:stdout.slice(-14000),stderr_tail:stderr.slice(-4000)
  };
  fs.writeFileSync(receipt,JSON.stringify(data,null,2)+'\n',{flag:'w',encoding:'utf8'});
  process.stdout.write('NODE_QA_'+data.status+' source='+expected+
    ' tests='+n+' pass='+pass+' fail='+fail+' skip='+skip+' receipt='+receipt+'\n');
  if(!accepted)process.exitCode=1;
}
try{main();}catch(e){abort(e.message||'TEAM_QA_FAILED');}
