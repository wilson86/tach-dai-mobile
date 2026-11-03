'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startWithFileCapture}=require('../scripts/settlement-pg-start-capture.cjs');
test('inherited output handle cannot hold command capture open',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kts-start-fixture-'));
 const source="require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},1200)'],{stdio:'inherit',windowsHide:true,detached:true}).unref();";
 const start=Date.now();const r=startWithFileCapture(process.execPath,['-e',source],{cwd:dir,env:process.env,timeout:500,logPath:path.join(dir,'start.log')});
 assert.equal(r.ok,true);assert.equal(r.exit_code,0);assert.ok(Date.now()-start<1000);
});
test('nonzero exit and timeout remain failures',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kts-start-fixture-'));
 const opts={cwd:dir,env:process.env,timeout:500,logPath:path.join(dir,'nonzero.log')};
 const bad=startWithFileCapture(process.execPath,['-e','process.exit(7)'],opts);
 assert.equal(bad.ok,false);assert.equal(bad.exit_code,7);
 const timed=startWithFileCapture(process.execPath,['-e','setTimeout(()=>{},2000)'],{...opts,timeout:200,logPath:path.join(dir,'timeout.log')});
 assert.equal(timed.ok,false);assert.equal(timed.problem,'ETIMEDOUT');
});
