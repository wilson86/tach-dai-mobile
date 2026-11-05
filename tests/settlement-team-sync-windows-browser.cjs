'use strict';
// Real browser storage, synthetic loopback fixture; no application backend.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const cp=require('node:child_process'),assert=require('node:assert/strict');
const {approvedDirectory,removeOwnedProfile,exited,waitExit}=require('./settlement-team-windows-walkthrough.cjs');
const base=approvedDirectory('C:\\KTS-Settlement\\w20-2d63c84e');
const profile=fs.mkdtempSync(path.join(base,'kts-demo-chrome-'));
const client=fs.readFileSync(path.resolve(__dirname,'../app/settlement-team-sync-client.js'));
const html=Buffer.from('<!doctype html><title>synthetic sync fixture</title><script src="/client.js"></script>');
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);}
 else if(req.url==='/client.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(client);}
 else{res.writeHead(404);res.end();}
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 let child,ws;const pending=new Map();let seq=0;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  child=cp.spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break;}catch{}await sleep(100);}
  if(!port)throw Error('CHROME_DEVTOOLS_NOT_READY');
  const target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
  if(!target)throw Error('NO_PAGE');ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('CDP_TIMEOUT'));},8000).unref();});
  await call('Page.enable');await call('Page.navigate',{url:origin+'/'});
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('BROWSER_EXCEPTION');return r.result.value;};
  let ready=false;for(let i=0;i<80;i++){ready=await ev("typeof window.KtsSettlementSyncClient==='object'");if(ready)break;await sleep(100);}assert.equal(ready,true);
  const first=await ev(`(()=>{window.__ktsOldDocument=true;const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>{throw Error('NO_NETWORK')}});c.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});const scope={workspace_id:'group_a',partner_id:'partner_a',business_date:'2026-11-05',region:'mn'};let denied=false;try{c.queueDraft({...scope,partner_id:''},{synthetic:true})}catch(e){denied=e.message==='SYNC_SCOPE_INVALID'}const before=c.snapshot().drafts.length;const d=c.queueDraft(scope,{synthetic:true});return {denied,before,id:d.id}})()`);
  assert.equal(first.denied,true);assert.equal(first.before,0);
  await call('Page.navigate',{url:'about:blank'});await call('Page.navigate',{url:origin+'/'});
  ready=false;for(let i=0;i<80;i++){ready=await ev("location.origin!=='null' && typeof window.KtsSettlementSyncClient==='object' && window.__ktsOldDocument!==true");if(ready)break;await sleep(100);}assert.equal(ready,true);
  const result=await ev(`(()=>{const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>{throw Error('NO_NETWORK')}});c.setSessionToken('b'.repeat(43),'group_a',{accountId:'user_a'});return {restored:c.snapshot().drafts[0],persistence:c.snapshot().draft_persistence}})()`);
  assert.equal(result.persistence,'LOCAL_STORAGE');assert.equal(result.restored.id,first.id);assert.equal(result.restored.status,'NEEDS_RECONCILIATION');
  const actorCheck=await ev(`(async()=>{let user='user_b';const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>({server_verified:true,membership_active:true,workspace_id:'group_a',user_id:user,role:'operator'})})});c.setSessionToken('c'.repeat(43),'group_a',{accountId:'user_a'});let rejected=false;try{await c.verifyActor()}catch(e){rejected=e.message==='SYNC_ACTOR_UNVERIFIED'}user='user_a';return {rejected,accepted:(await c.verifyActor()).user_id}})()`);
  assert.equal(actorCheck.rejected,true);assert.equal(actorCheck.accepted,'user_a');
  const filterCheck=await ev(`(async()=>{let kind='owner';const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>[{workspace_id:'group_a',partner_id:'fake_partner_1',partner_kind:kind,display_name:'Synthetic'}]})});c.setSessionToken('d'.repeat(43),'group_a',{accountId:'user_a'});const rejected=(await c.listCounterparties({kind:'customer'})).status;kind='customer';const accepted=(await c.listCounterparties({kind:'customer'})).status;return {rejected,accepted}})()`);
  assert.deepEqual(filterCheck,{rejected:'BLOCKED',accepted:'SYNCED'});
  console.log('PASS real Chrome localStorage: invalid scope denied; valid intent restored and quarantined');
  console.log('PASS real Chrome actor check: foreign same-workspace user denied');
  console.log('PASS real Chrome directory: wrong requested kind denied');
  await call('Browser.close');
 }finally{
  if(ws)ws.close();if(child){await waitExit(child,5000);if(!exited(child)){child.kill();await waitExit(child,3000);}if(!exited(child))throw Error('CHROME_NOT_CLOSED');}
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  const scan=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p=$env:KTS_OWNED_PROFILE; @(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) }).Count"],{encoding:'utf8',timeout:10000,env:{...process.env,KTS_OWNED_PROFILE:profile}});
  if(scan.error||scan.status!==0||String(scan.stdout).trim()!=='0')throw Error('CHROME_DESCENDANTS_UNVERIFIED');
  removeOwnedProfile(profile);console.log('OWNED_CHROME_AND_LOOPBACK_SERVER_CLOSED');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
