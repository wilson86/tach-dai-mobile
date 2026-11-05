'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {exited,waitExit,approvedDirectory}=require('./settlement-team-windows-walkthrough.cjs');
test('a disposable child killed by a signal is recognized as exited',async()=>{
 const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 const done=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 assert.equal(child.kill(),true);await done;
 assert.notEqual(child.signalCode,null);
 assert.equal(exited(child),true);await waitExit(child,50);
});
test('evidence must be an existing verified C control directory',()=>{
 assert.throws(()=>approvedDirectory('E:\\unapproved'),/DIRECTORY_OUTSIDE_CONTROL_ROOT/);
 assert.throws(()=>approvedDirectory('C:\\unapproved'),/DIRECTORY_OUTSIDE_CONTROL_ROOT/);
 assert.throws(()=>approvedDirectory('relative'),/C_ONLY_DIRECTORY_REQUIRED/);
 assert.match(approvedDirectory('C:\\KTS-Settlement\\w20-2d63c84e'),/^C:\\/i);
});
test('an owned disposable junction is rejected and left untouched by admission',()=>{
 const base='C:\\KTS-Settlement\\w20-2d63c84e';
 const dir=fs.mkdtempSync(path.join(base,'kts-junction-fixture-'));
 const link=path.join(dir,'link');
 try{
  fs.symlinkSync(base,link,'junction');
  assert.throws(()=>approvedDirectory(link),/REPARSE_OR_NON_DIRECTORY/);
  assert.equal(fs.lstatSync(link).isSymbolicLink(),true);
 }finally{
  if(fs.existsSync(link))fs.rmdirSync(link);
  fs.rmdirSync(dir);
 }
});
