'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseArgs,cOnly,overlapsWorkspace,READ_ONLY_GIT_ENV,chromeReceiptsComplete,run}=require('../scripts/issue18-run-windows.js');
const PIN='a'.repeat(40);
test('source workspace and C-only evidence defaults remain separate',()=>{
 assert.deepEqual(parseArgs(['--mobile-sha',PIN]),{
  '--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence','--mobile-sha':PIN
 });
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
 assert.deepEqual(parseArgs(['--mobile-sha',PIN,'--chrome']),{
  '--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence',
  '--mobile-sha':PIN,_chrome:true
 });
 assert.equal(parseArgs(['--workspace','C:\\QA','--evidence','C:\\receipts','--mobile-sha',PIN,'--chrome'])._chrome,true);
 assert.throws(()=>parseArgs(['--chrome','--mobile-sha',PIN]),/USAGE/);
 assert.throws(()=>parseArgs(['--mobile-sha',PIN,'--chrome','--chrome']),/USAGE/);
});
test('real Chrome exit code alone cannot qualify absent offline/Cut/N035 receipts',()=>{
 const markers=[
  'ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS',
  'ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS',
  'ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS',
  'ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS ["/Mobile/"]',
  'ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS {"origin":"http://127.0.0.1"}'
 ];
 assert.equal(chromeReceiptsComplete(markers.join('\n')),true);
 for(let i=0;i<markers.length;i++)
  assert.equal(chromeReceiptsComplete(markers.filter((_,j)=>j!==i).join('\n')),false);
 assert.equal(chromeReceiptsComplete(''),false);
});
test('any unreviewed or missing exact Mobile commit is refused before checkout access',()=>{
 assert.throws(()=>parseArgs([]),/MOBILE_EXACT_SHA_REQUIRED|USAGE/);
 assert.throws(()=>parseArgs(['--chrome']),/MOBILE_EXACT_SHA_REQUIRED|USAGE/);
 assert.throws(()=>parseArgs(['--mobile-sha','b'.repeat(39)]),/MOBILE_EXACT_SHA_REQUIRED/);
 assert.throws(()=>parseArgs(['--mobile-sha','B'.repeat(40)]),/MOBILE_EXACT_SHA_REQUIRED/);
 assert.throws(()=>parseArgs(['--mobile-sha',PIN,'--mobile-sha',PIN]),/USAGE/);
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
  assert.throws(()=>run(['--mobile-sha',PIN]),/C_ONLY/);
 }
});
