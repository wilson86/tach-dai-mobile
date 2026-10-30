'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WORKSPACE,SOURCE,argsOf,classifyChildren,planWorkspace,expectedOrigin,cPath,prepare}
 =require('../scripts/issue18-bootstrap-windows.js');
const PIN='a'.repeat(40);
test('bootstrap targets only known three repos in explicit C: scope',()=>{
  assert.equal(WORKSPACE,'C:\\KTS-QA\\issue18-review');
  assert.deepEqual(SOURCE.map(s=>s.name),['KTS','Mobile','Ngang']);
  assert.equal(SOURCE[0].sha,'eec80f812ff0ab47109edcacc32f31eedaffca79');
  assert.equal(SOURCE[2].sha,'6f47f7c6b073c5df25da55b2b8f3bcc61513da20');
  assert.equal(SOURCE[1].sha,null);
  assert.ok(SOURCE.every(s=>s.branch.startsWith('review/issue18-')));
});
test('exact independent SHA required; Chrome is explicit opt-in',()=>{
  assert.deepEqual(argsOf(['--mobile-sha',PIN]),{mobileSha:PIN,runChrome:false});
  assert.deepEqual(argsOf(['--mobile-sha',PIN,'--run-chrome']),{mobileSha:PIN,runChrome:true});
});
test('missing, malformed, repeated and unknown flags fail before any Git action',()=>{
  for(const bad of [[],['--mobile-sha','x'],['--mobile-sha','A'.repeat(40)],
    ['--mobile-sha',PIN,'--run-chrome','--run-chrome'],
    ['--mobile-sha',PIN,'--unrecognized'],['--run-chrome','--mobile-sha',PIN]]){
    assert.throws(()=>argsOf(bad),/USAGE_EXACT_PIN_REQUIRED|MOBILE_PIN_REQUIRED|UNKNOWN_OPTION/);
  }
});
test('only complete known sources or verified-only partial clones are eligible',()=>{
  assert.equal(classifyChildren([]),'CREATE_NEW_ONLY');
  assert.equal(classifyChildren(['KTS','Mobile','Ngang']),'VERIFY_EXISTING_ONLY');
  assert.equal(classifyChildren(['ngang','kts','MOBILE']),'VERIFY_EXISTING_ONLY');
  assert.equal(classifyChildren(['KTS']),'RESUME_VERIFIED_ONLY');
  assert.equal(classifyChildren(['Ngang','KTS']),'RESUME_VERIFIED_ONLY');
  for(const bad of [['KTS','Mobile','junk'],['KTS','Mobile','Mobile'],
    ['KTS','Mobile','Ngang','.env'],['.git']])
    assert.throws(()=>classifyChildren(bad),/PARTIAL_OR_UNKNOWN_WORKSPACE/);
});
test('resume plan verifies all present repos before any missing clone',()=>{
  assert.deepEqual(planWorkspace([]),{
    mode:'CREATE_NEW_ONLY',verify:[],clone:['KTS','Mobile','Ngang']});
  assert.deepEqual(planWorkspace(['KTS']),{
    mode:'RESUME_VERIFIED_ONLY',verify:['KTS'],clone:['Mobile','Ngang']});
  assert.deepEqual(planWorkspace(['Ngang','KTS']),{
    mode:'RESUME_VERIFIED_ONLY',verify:['KTS','Ngang'],clone:['Mobile']});
  assert.deepEqual(planWorkspace(['Mobile','KTS','Ngang']),{
    mode:'VERIFY_EXISTING_ONLY',verify:['KTS','Mobile','Ngang'],clone:[]});
  assert.throws(()=>planWorkspace(['KTS','unknown']),/PARTIAL_OR_UNKNOWN_WORKSPACE/);
});
test('official repo origins accepted; credentials or different remotes refused',()=>{
  assert.equal(expectedOrigin('https://github.com/wilson86/KTS.git','wilson86/KTS'),true);
  assert.equal(expectedOrigin('git@github.com:wilson86/KTS.git','wilson86/KTS'),true);
  assert.equal(expectedOrigin('https://github.com/wilson86/KTS','wilson86/KTS'),true);
  for(const bad of ['https://github.com/attacker/KTS.git',
    'https://user:token@github.com/wilson86/KTS.git',
    'https://github.com/wilson86/KTS.git?token=secret','file:///E:/repo'])
    assert.equal(expectedOrigin(bad,'wilson86/KTS'),false,bad);
});
test('outside Windows bootstrap cannot create/check out anything',()=>{
  if(process.platform!=='win32'){
    assert.throws(()=>cPath('C:\\KTS-QA'),/C_ONLY/);
    assert.throws(()=>prepare(['--mobile-sha',PIN]),/C_ONLY/);
  }
});


// Run the real bootstrap source under an isolated Windows fs/git simulator.
// The real runner/test process remains Linux-safe and cannot clone or write.
function simulateBootstrap(existing,{dirty,wrongSha,junction}={}){
  const vm=require('node:vm');
  const fs=require('node:fs');
  const win=require('node:path').win32;
  const code=fs.readFileSync(require.resolve('../scripts/issue18-bootstrap-windows.js'),'utf8');
  const present=new Set(existing);
  const operations=[];
  const root='C:\\KTS-QA\\issue18-review';
  const sha={KTS:SOURCE[0].sha,Mobile:PIN,Ngang:SOURCE[2].sha};
  const branch=Object.fromEntries(SOURCE.map(item=>[item.name,item.branch]));
  const repo=Object.fromEntries(SOURCE.map(item=>[item.name,item.repo]));
  const virtualFs={
    existsSync:p=>{
      const abs=win.resolve(p);
      return ['C:\\\\','C:\\KTS-QA',root,'C:\\Temp'].includes(abs)||
        [...present].some(name=>abs===win.join(root,name)||abs===win.join(root,name,'.git'));
    },
    lstatSync:p=>({isDirectory:()=>true,
      isSymbolicLink:()=>junction==='KTS'&&win.resolve(p)===win.join(root,'KTS')}),
    realpathSync:{native:p=>win.resolve(p)},
    readdirSync:()=>[...present],
    mkdirSync:()=>{throw Error('UNEXPECTED_WORKSPACE_CREATION');}
  };
  const remote={spawnSync:(name,args,options)=>{
    if(name!=='git')throw Error('UNEXPECTED_EXECUTABLE');
    operations.push({op:args[0],args:[...args],cwd:options.cwd,
      optionalLocks:options.env.GIT_OPTIONAL_LOCKS});
    if(args[0]==='clone'){
      const name=win.basename(args.at(-1));
      present.add(name);
      return {status:0,stdout:'',stderr:'',signal:null,error:null};
    }
    const name=win.basename(options.cwd);
    let stdout='';
    if(args[0]==='rev-parse'&&args[1]==='--show-toplevel')stdout=options.cwd;
    if(args[0]==='rev-parse'&&args[1]==='HEAD')
      stdout=(wrongSha===name?'f'.repeat(40):sha[name]);
    if(args[0]==='branch')stdout=branch[name];
    if(args[0]==='remote')stdout='https://github.com/'+repo[name]+'.git';
    if(args[0]==='status'&&dirty===name)stdout='?? stray.txt';
    return {status:0,stdout,stderr:'',signal:null,error:null};
  }};
  const deps={'node:fs':virtualFs,'node:path':{win32:win},
    'node:os':{tmpdir:()=> 'C:\\Temp'},'node:child_process':remote};
  const runtime={platform:'win32',env:{},argv:[],execPath:'C:\\node.exe'};
  const context={module:{exports:{}},process:runtime,require:name=>{
    if(!Object.hasOwn(deps,name))throw Error('UNEXPECTED_REQUIRE '+name);
    return deps[name];
  }};
  vm.runInNewContext(code,context,{filename:'issue18-bootstrap-windows.js'});
  let outcome;
  try{outcome=context.module.exports.prepare(['--mobile-sha',PIN]);}
  catch(e){outcome={status:'BLOCKED',code:e.code};}
  return {outcome,operations};
}

test('resumes verified partial checkout and does not reclone existing repositories',()=>{
  const a=simulateBootstrap(['KTS']);
  assert.equal(a.outcome.status,'C_ONLY_CHECKOUTS_READY');
  assert.deepEqual(a.operations.filter(x=>x.op==='clone').map(x=>require('node:path').win32.basename(x.args.at(-1))),
    ['Mobile','Ngang']);
  assert.ok(a.operations.every(x=>x.optionalLocks==='0'));
  const b=simulateBootstrap(['KTS','Ngang']);
  assert.equal(b.outcome.status,'C_ONLY_CHECKOUTS_READY');
  assert.equal(b.operations.filter(x=>x.op==='clone').length,1);
  const c=simulateBootstrap(['KTS','Mobile','Ngang']);
  assert.equal(c.outcome.status,'C_ONLY_CHECKOUTS_READY');
  assert.equal(c.operations.filter(x=>x.op==='clone').length,0);
});

test('an untrusted existing source blocks before any clone',()=>{
  for(const [present,options,expected] of [
    [['KTS'],{dirty:'KTS'},'SOURCE_NOT_CLEAN'],
    [['KTS'],{wrongSha:'KTS'},'SOURCE_SHA_DRIFT'],
    [['KTS'],{junction:'KTS'},'UNSAFE_EXISTING_PATH'],
    [['KTS','unknown'],{},'PARTIAL_OR_UNKNOWN_WORKSPACE']
  ]){
    const result=simulateBootstrap(present,options);
    assert.equal(result.outcome.code,expected);
    assert.equal(result.operations.filter(x=>x.op==='clone').length,0);
  }
});
