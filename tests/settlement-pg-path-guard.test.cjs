'use strict';
// The Git for Windows --show-toplevel output can use C:/, while Node paths
// normally contain C:\\. Accept both without allowing another drive/UNC/reparse.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const FIXTURES=[
 ['settlement-pg-isolated-preflight.cjs','fullC'],
 ['settlement-pg-isolated-migrations.cjs','realC']
];
function guard(script,name,resolveReal){
 const source=fs.readFileSync(path.join(__dirname,'..','scripts',script),'utf8');
 const match=source.match(new RegExp('function '+name+'\\(p\\)\\s*\\{[\\s\\S]*?\\n\\}'));
 assert.ok(match,'guard function exists in '+script);
 const err=code=>{throw Error(code)};
 return new Function('path','fs','reject','fail',match[0]+';return '+name)(
   path,{realpathSync:resolveReal||((p)=>p)},err,err);
}
for(const [script,name] of FIXTURES){
 test(script+' accepts Git forward slashes and Node backslashes on C',()=>{
   const check=guard(script,name);
   const forward=check('C:/KTS-Settlement/PG_QA_TEST');
   const backward=check('C:\\KTS-Settlement\\PG_QA_TEST');
   assert.equal(forward.toLowerCase(),backward.toLowerCase());
   assert.equal(forward.toLowerCase(),'c:\\kts-settlement\\pg_qa_test');
 });
 test(script+' rejects other drives, relative and UNC paths',()=>{
   const check=guard(script,name);
   for(const p of ['E:/KTS-Settlement/qa','F:\\KTS-Settlement\\qa',
       'C:relative\\qa','\\\\server\\share\\qa','\\\\?\\C:\\unsafe']){
     assert.throws(()=>check(p),/TEAM_PG_(?:C_DRIVE_REQUIRED|C_ONLY)/);
   }
 });
 test(script+' rejects reparse target leaving C even for C:/ input',()=>{
   const check=guard(script,name,()=> 'E:\\unexpected\\qa');
   assert.throws(()=>check('C:/KTS-Settlement/QA'),
      /TEAM_PG_(?:REPARSE_LEAVES_C|C_REPARSE)/);
 });
}
