'use strict';
// Windows, real Chrome, standalone fake-only file. No app server or database.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kts-demo-chrome-'));
const file=path.resolve(__dirname,'../app/settlement-team-synthetic-walkthrough.html');
const evidence=process.env.KTS_DEMO_EVIDENCE_DIR;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
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
   if(evidence){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,`walkthrough-${viewport.width}x${viewport.height}.png`),Buffer.from(shot.data,'base64'));}
   console.log(`PASS file:// Chrome ${viewport.width}x${viewport.height} fake A/B workflows and tenant view`);
  }
  await call('Browser.close');
 }finally{
  if(ws)ws.close();
  if(child.exitCode===null){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(5000)]);if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3000)]);}}
  if(child.exitCode===null)throw Error('OWNED_CHROME_STILL_RUNNING');
  console.log('OWNED_CHROME_EXITED');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
