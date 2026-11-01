'use strict';
// Characterizes the real watchdog with a bounded disposable child. No database.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('watchdog cannot terminate a child absent from the ownership manifest',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kts-watchdog-gap-'));
  const manifest=path.join(dir,'manifest.json');
  const watchdog='C:\\KTS-Settlement\\w20-2d63c84e\\watchdog.ps1';
  const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),15000)'],{windowsHide:true,stdio:'ignore'});
  assert.ok(child.pid);
  try{
    fs.writeFileSync(manifest,JSON.stringify({owner:'synthetic-watchdog-gap',deadline_utc:new Date(Date.now()+30000).toISOString(),evidence:dir,pids:[]}));
    const result=spawnSync('powershell.exe',['-NoProfile','-File',watchdog,'-Manifest',manifest,'-Force'],{timeout:10000,windowsHide:true,encoding:'utf8'});
    assert.equal(result.status,0, result.stderr);
    const receipt=JSON.parse(fs.readFileSync(path.join(dir,'WATCHDOG_TERMINAL.json'),'utf8'));
    assert.equal(receipt.status,'PASS');
    assert.equal(receipt.owned_processes.length,0);
    process.kill(child.pid,0); // The actual child is still alive despite PASS.
  }finally{
    if(child.exitCode===null) child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000).unref();});
    for(const name of ['manifest.json','WATCHDOG_TERMINAL.json'])fs.rmSync(path.join(dir,name),{force:true});
    fs.rmdirSync(dir);
  }
});
