'use strict';
// Windows, real Chrome, standalone fake-only file. No app server or database.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const file=path.resolve(__dirname,'../app/settlement-team-synthetic-walkthrough.html');
const ROOT='C:\\KTS-Settlement\\w20-2d63c84e';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function approvedDirectory(candidate){
 if(process.platform!=='win32'||typeof candidate!=='string'||!path.win32.isAbsolute(candidate))throw Error('C_ONLY_DIRECTORY_REQUIRED');
 const target=path.resolve(candidate),base=path.resolve(ROOT);
 const relative=path.relative(base,target);
 if(!/^C:\\/i.test(target)||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('DIRECTORY_OUTSIDE_CONTROL_ROOT');
 let current=path.parse(target).root;
 for(const part of target.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const st=fs.lstatSync(current);
  if(st.isSymbolicLink()||!st.isDirectory())throw Error('DIRECTORY_REPARSE_OR_NON_DIRECTORY');
 }
 if(fs.realpathSync.native(target).toLowerCase()!==target.toLowerCase())throw Error('DIRECTORY_IDENTITY_MISMATCH');
 return target;
}
const exited=child=>child.exitCode!==null||child.signalCode!==null;
async function waitExit(child,ms){if(exited(child))return;await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(ms)]);}
function removeOwnedProfile(profile){
 const resolved=approvedDirectory(profile),base=approvedDirectory(ROOT);
 if(path.dirname(resolved).toLowerCase()!==base.toLowerCase()||!path.basename(resolved).startsWith('kts-demo-chrome-'))throw Error('PROFILE_IDENTITY_INVALID');
 let files=0,bytes=0;
 function inspect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name),s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('PROFILE_REPARSE_PRESERVED');if(s.isDirectory())inspect(p);else if(s.isFile()){files++;bytes+=s.size;}else throw Error('PROFILE_UNKNOWN_OBJECT_PRESERVED');}}
 inspect(resolved);console.log(`PROFILE_INVENTORY files=${files} bytes=${bytes}`);
 fs.rmSync(resolved,{recursive:true});console.log('OWNED_PROFILE_REMOVED');
}
async function main(){
 const evidence=approvedDirectory(process.env.KTS_DEMO_EVIDENCE_DIR);
 const base=approvedDirectory(ROOT);
 const profile=fs.mkdtempSync(path.join(base,'kts-demo-chrome-'));
 const child=cp.spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let ws,port,seq=0;const pending=new Map();let errors=[];
 try{
  for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break;}catch{} await sleep(100);}
  if(!port)throw Error('CHROME_DEVTOOLS_NOT_READY');
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target=tabs.find(x=>x.type==='page');if(!target)throw Error('NO_CHROME_PAGE');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push('JS_EXCEPTION');if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('CDP_TIMEOUT_'+method));},8000).unref();});
  await call('Runtime.enable');await call('Page.enable');
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('EVALUATE_FAILED');return r.result.value;};
  for(const viewport of [{width:390,height:844,mobile:true},{width:1366,height:768,mobile:false}]){
   await call('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
   await call('Page.navigate',{url:pathToFileURL(file).href});
   let ready=false;for(let i=0;i<100;i++){try{ready=await ev("document.readyState==='complete' && !!document.getElementById('create')");if(ready)break;}catch{}await sleep(100);}
   assert.equal(ready,true,'file readiness');
   assert.equal(await ev("location.protocol"),'file:');
   const step=async expression=>ev(`(()=>{${expression}})()`);
   await step("document.getElementById('create').click();document.getElementById('submit').click();");
   assert.equal(await ev("document.getElementById('out-revision').textContent"),'2');
   await step("const a=document.getElementById('actor');a.value='reviewer_a';a.dispatchEvent(new Event('change'));document.getElementById('approve').click();");
   assert.equal(await ev("document.getElementById('out-revision').textContent"),'3');
   assert.match(await ev("document.getElementById('out-state').textContent"),/ĐÃ DUYỆT/);
   await step("const a=document.getElementById('actor');a.value='operator_b';a.dispatchEvent(new Event('change'));");
   assert.equal(await ev("document.getElementById('out-state').textContent"),'KHÔNG CÓ QUYỀN');
   await step("const s=document.getElementById('scope');s.value='B';s.dispatchEvent(new Event('change'));document.getElementById('create').click();document.getElementById('submit').click();const a=document.getElementById('actor');a.value='reviewer_b';a.dispatchEvent(new Event('change'));document.getElementById('approve').click();");
   assert.equal(await ev("document.getElementById('out-revision').textContent"),'3');
   assert.match(await ev("document.getElementById('out-state').textContent"),/ĐÃ DUYỆT/);
   assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true,'horizontal overflow');
   assert.deepEqual(errors,[]);
   if(evidence){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,`walkthrough-${viewport.width}x${viewport.height}.png`),Buffer.from(shot.data,'base64'),{flag:'wx'});}
   console.log(`PASS file:// Chrome ${viewport.width}x${viewport.height} fake A/B workflows and tenant view`);
  }
  await call('Browser.close');
 }finally{
  if(ws)ws.close();
  await waitExit(child,5000);if(!exited(child)){child.kill();await waitExit(child,3000);}
  if(!exited(child))throw Error('OWNED_CHROME_STILL_RUNNING');
  console.log('OWNED_CHROME_EXITED');
  // Confirm no Chrome process reports the exact owned profile before removal.
  const scan=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
   "$p=$env:KTS_OWNED_PROFILE; @(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) }).Count"],
   {encoding:'utf8',timeout:10000,env:{...process.env,KTS_OWNED_PROFILE:profile}});
  if(scan.error||scan.status!==0||String(scan.stdout).trim()!=='0')throw Error('OWNED_CHROME_DESCENDANTS_UNVERIFIED_PROFILE_PRESERVED');
  removeOwnedProfile(profile);
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={exited,waitExit,approvedDirectory,removeOwnedProfile};
