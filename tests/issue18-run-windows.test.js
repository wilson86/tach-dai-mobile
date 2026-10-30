'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseArgs,cOnly,overlapsWorkspace,READ_ONLY_GIT_ENV,run}=require('../scripts/issue18-run-windows.js');
test('source workspace and C-only evidence defaults remain separate',()=>{
 assert.deepEqual(parseArgs([]),{'--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence'});
 assert.equal(overlapsWorkspace('C:\\KTS-QA\\issue18-review','C:\\KTS-QA\\issue18-evidence'),false);
});
test('overlapping evidence detected case-insensitively, including inside Mobile',()=>{
 const root='C:\\KTS-QA\\issue18-review';
 for(const bad of ['C:\\kts-qa\\ISSUE18-review','c:\\KTS-QA\\Issue18-Review\\mobile\\evidence','C:\\KTS-QA', 'C:\\KTS-QA\\issue18-review\\..\\issue18-review\\EVIDENCE'])
   assert.equal(overlapsWorkspace(root,bad),true,bad);
 assert.equal(overlapsWorkspace(root,'C:\\KTS-QA\\issue18-evidence'),false);
 assert.equal(overlapsWorkspace(root,'C:\\KTS-QA\\issue18-review-other'),false);
});
test('browser pilot is opt-in and no extra tokens are accepted',()=>{
 assert.deepEqual(parseArgs(['--chrome']),{
  '--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence',_chrome:true
 });
 assert.equal(parseArgs(['--workspace','C:\\QA','--evidence','C:\\receipts','--chrome'])._chrome,true);
 assert.throws(()=>parseArgs(['--chrome','--workspace','C:\\QA','--evidence','C:\\receipts']),/USAGE/);
 assert.throws(()=>parseArgs(['--chrome','--chrome']),/USAGE/);
});
test('Git command policy refuses Git optional writes and credential prompt',()=>{
 assert.equal(READ_ONLY_GIT_ENV.GIT_OPTIONAL_LOCKS,'0');
 assert.equal(READ_ONLY_GIT_ENV.GIT_TERMINAL_PROMPT,'0');
});
test('unknown, duplicate and partial override blocked',()=>{
 assert.throws(()=>parseArgs(['--workspace','C:\\X']),/USAGE/);
 assert.throws(()=>parseArgs(['--workspace','C:\\X','--workspace','C:\\Y']),/USAGE/);
 assert.throws(()=>parseArgs(['--workspace','C:\\X','--unknown','C:\\Y']),/USAGE/);
});
test('non-Windows cannot probe checkout or create evidence',()=>{
 if(process.platform!=='win32'){
  assert.throws(()=>cOnly('C:\\KTS-QA'),/C_ONLY/);
  assert.throws(()=>run([]),/C_ONLY/);
 }
});
