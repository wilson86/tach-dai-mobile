'use strict';
// Real browser storage, synthetic loopback fixture; no application backend.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const cp=require('node:child_process'),assert=require('node:assert/strict');
const {approvedDirectory,removeOwnedProfile,exited,waitExit}=require('./settlement-team-windows-walkthrough.cjs');
const base=approvedDirectory('C:\\KTS-Settlement\\w20-2d63c84e');
const profile=fs.mkdtempSync(path.join(base,'kts-demo-chrome-'));
const client=fs.readFileSync(path.resolve(__dirname,'../app/settlement-team-sync-client.js'));
const html=Buffer.from('<!doctype html><title>synthetic sync fixture</title><script src="/client.js"></script>');
const appFiles=new Map(['settlement-team-pilot.html','settlement-team-pilot.css','settlement-team-review-audit.js','settlement-team-sync-client.js','settlement-team-pilot-ui.js','settlement-team-pilot-start.js'].map(name=>['/'+name,fs.readFileSync(path.resolve(__dirname,'../app',name))]));
let directoryRequests=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);}
 else if(req.url==='/client.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(client);}
 else if(appFiles.has(req.url)){res.writeHead(200,{'content-type':req.url.endsWith('.html')?'text/html':req.url.endsWith('.css')?'text/css':'text/javascript'});res.end(appFiles.get(req.url));}
 else if(req.url==='/v1/login'&&req.method==='POST'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({session_token:'x'.repeat(43),expires_at:123}));}
 else if(req.url==='/v1/session'&&req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({server_verified:true,membership_active:true,workspace_id:'group_a',user_id:'user_a',role:'operator'}));}
 else if(req.url.startsWith('/v1/counterparties?')&&req.method==='GET'){directoryRequests++;res.writeHead(directoryRequests===2?503:200,{'content-type':'application/json'});res.end(directoryRequests===2?'{}':JSON.stringify([{workspace_id:'group_a',partner_id:'fake_partner_1',partner_kind:'customer',display_name:'Synthetic'}]));}
 else if(req.url==='/v1/logout'&&req.method==='POST'){res.writeHead(503,{'content-type':'application/json'});res.end('{}');}
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
  const extraCheck=await ev(`(async()=>{const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>[{workspace_id:'group_a',partner_id:'fake_partner_1',partner_kind:'customer',display_name:'Synthetic',internal_synthetic_secret:'DO_NOT_RETURN'}]})});c.setSessionToken('d'.repeat(43),'group_a',{accountId:'user_a'});const r=await c.listCounterparties();return {status:r.status,items:r.items.length}})()`);
  assert.deepEqual(extraCheck,{status:'BLOCKED',items:0});
  const scopeRace=await ev(`(async()=>{let release,posted;const gate=new Promise(r=>release=r);const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async(url,options)=>{if(url==='/v1/session'){await gate;return {ok:true,status:200,json:async()=>({server_verified:true,membership_active:true,workspace_id:'group_a',user_id:'user_race',role:'operator'})}}if(url==='/v1/scopes/review'){posted=JSON.parse(options.body);return {ok:false,status:503,json:async()=>({})}}throw Error('UNEXPECTED') }});c.setSessionToken('e'.repeat(43),'group_a',{accountId:'user_race'});const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};const p=c.reviewScope('submit_review',scope,1);scope.partner_id='fake_partner_2';release();const result=await p;return {scope:posted&&posted.scope.partner_id,status:result.status}})()`);
  assert.deepEqual(scopeRace,{scope:'fake_partner_1',status:'NEEDS_RECONCILIATION'});
  console.log('PASS real Chrome localStorage: invalid scope denied; valid intent restored and quarantined');
  console.log('PASS real Chrome actor check: foreign same-workspace user denied');
  console.log('PASS real Chrome directory: wrong requested kind denied');
  console.log('PASS real Chrome directory: unexpected fields denied');
  console.log('PASS real Chrome review scope: original preserved across async auth');
  console.log('PILOT_STAGE_NAVIGATE');await call('Page.navigate',{url:origin+'/settlement-team-pilot.html'});
  ready=false;for(let i=0;i<80;i++){ready=await ev("document.readyState==='complete' && !!document.getElementById('team-login') && !!window.KtsTeamPilotUI");if(ready)break;await sleep(100);}assert.equal(ready,true);
  // Prior checks intentionally left a quarantined synthetic draft in this
  // disposable profile. Clear it so logout has no native unsent-data dialog.
  await ev('localStorage.clear()');
  console.log('PILOT_STAGE_LOGIN');await ev("document.getElementById('team-subject').value='synthetic_user';document.getElementById('team-password').value='synthetic-password';document.getElementById('team-login').requestSubmit()");
  let ok=false;for(let i=0;i<80;i++){ok=await ev("document.getElementById('team-context').textContent.includes('Đã đăng nhập')");if(ok)break;await sleep(100);}assert.equal(ok,true);
  console.log('PILOT_STAGE_DIRECTORY');await ev("document.getElementById('team-directory').click()");
  ok=false;for(let i=0;i<80;i++){ok=await ev("document.getElementById('team-counterparties').children.length===1");if(ok)break;await sleep(100);}assert.equal(ok,true);
  await ev("document.getElementById('team-directory').click()");
  ok=false;for(let i=0;i<80;i++){ok=await ev("document.getElementById('team-notice').textContent.includes('CHƯA XÁC MINH danh bạ')");if(ok)break;await sleep(100);}assert.equal(ok,true);
  assert.equal(await ev("document.getElementById('team-counterparties').children.length"),0);
  await ev("document.getElementById('team-directory').click()");
  ok=false;for(let i=0;i<80;i++){ok=await ev("document.getElementById('team-counterparties').children.length===1");if(ok)break;await sleep(100);}assert.equal(ok,true);
  console.log('PASS real Chrome pilot UI: failed refresh clears stale directory');
  console.log('PILOT_STAGE_LOGOUT');await ev("document.getElementById('team-logout').click()");
  ok=false;for(let i=0;i<80;i++){ok=await ev("document.getElementById('team-notice').textContent.includes('CHƯA XÁC MINH thu hồi')");if(ok)break;await sleep(100);}assert.equal(ok,true);
  assert.equal(await ev("document.getElementById('team-counterparties').children.length"),0);
  console.log('PASS real Chrome pilot UI: directory cleared after unverified logout');
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
