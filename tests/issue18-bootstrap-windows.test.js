'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WORKSPACE,SOURCE,argsOf,classifyChildren,expectedOrigin,cPath,prepare}
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
test('clone eligibility rejects any unknown file or partial source workspace',()=>{
  assert.equal(classifyChildren([]),'CREATE_NEW_ONLY');
  assert.equal(classifyChildren(['KTS','Mobile','Ngang']),'VERIFY_EXISTING_ONLY');
  assert.equal(classifyChildren(['ngang','kts','MOBILE']),'VERIFY_EXISTING_ONLY');
  for(const bad of [['KTS'],['Mobile','Ngang'],['KTS','Mobile','junk'],['KTS','Mobile','Mobile'],
    ['KTS','Mobile','Ngang','.env'],['.git']])
    assert.throws(()=>classifyChildren(bad),/PARTIAL_OR_UNKNOWN_WORKSPACE/);
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
