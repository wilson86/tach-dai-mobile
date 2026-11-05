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
 let child,ws,ws2;const pending=new Map();let seq=0;
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
  const readRace=await ev(`(async()=>{async function run(partner){let release;const gate=new Promise(r=>release=r);let requested;const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async(url)=>{requested=url;await gate;return {ok:true,status:200,json:async()=>({workspace_id:'group_a',partner_id:partner,business_date:'2026-11-05',region:'mn',revision:0,state:'DRAFT'})}}});c.setSessionToken('f'.repeat(43),'group_a',{accountId:'user_a'});const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};const pending=c.readScope(scope);scope.partner_id='fake_partner_2';release();const result=await pending;return {requested,status:result.status}}return {wrong:await run('fake_partner_2'),correct:await run('fake_partner_1')}})()`);
  assert.deepEqual(readRace,{wrong:{requested:'/v1/scopes/fake_partner_1/2026-11-05/mn',status:'BLOCKED'},correct:{requested:'/v1/scopes/fake_partner_1/2026-11-05/mn',status:'SYNCED'}});
  const recoveryRace=await ev(`(async()=>{async function run(responseId){let release,sent;const gate=new Promise(r=>release=r);const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);await gate;return {ok:true,status:200,json:async()=>({status:'REVIEW_ONLY',auto_send_enabled:false,all_receipts_verified:true,items:[{id:responseId,classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]})}}});c.setSessionToken('g'.repeat(43),'group_a',{accountId:'user_a'});const a='draft_'+'a'.repeat(32),b='draft_'+'b'.repeat(32);const items=[{id:a,status:'QUARANTINED',original_status:'PENDING',auto_retry:false,base_revision:0,scope:{workspace_id:'group_a',partner_id:'fake_partner_1'},payload:{synthetic:true}}];const p=c.inspectRecoveryReceipts(items,{syntheticOnly:true,explicitConsent:true});items[0].id=b;release();try{const result=await p;return {sent:sent.quarantined[0].id,result:result.items[0].id}}catch(e){return {sent:sent.quarantined[0].id,error:e.message}}}const a='draft_'+'a'.repeat(32),b='draft_'+'b'.repeat(32);return {wrong:await run(b),correct:await run(a)}})()`);
  const idA='draft_'+'a'.repeat(32);
  assert.deepEqual(recoveryRace,{wrong:{sent:idA,error:'TEAM_RECOVERY_RECEIPT_UNVERIFIED'},correct:{sent:idA,result:idA}});
  const unboundFeed=await ev(`(async()=>{let calls=0;const c=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({sync_status:'SYNCED',items:[{event_id:'fake_event',workspace_id:'other',feed_seq:1}],next_cursor:'opaque'})}}});c.setSessionToken('h'.repeat(43));const r=await c.pullChanges();return {status:r.status,error:r.error,calls,cursor:c.snapshot().cursor}})()`);
  assert.deepEqual(unboundFeed,{status:'BLOCKED',error:'AUTH_SESSION_REQUIRED',calls:0,cursor:null});
  const collision=await ev(`(()=>{const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});try{const opts={fetchImpl:async()=>{throw Error('NO_NETWORK')}};const a=window.KtsSettlementSyncClient.createSyncClient(opts),b=window.KtsSettlementSyncClient.createSyncClient(opts);a.setSessionToken('i'.repeat(43),'group_a',{accountId:'user_collision'});b.setSessionToken('j'.repeat(43),'group_a',{accountId:'user_collision'});const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};a.queueDraft(scope,{synthetic:true,memo:'original'});let denied=false;try{b.queueDraft(scope,{synthetic:true,memo:'other'})}catch(e){denied=e.message==='SYNC_DRAFT_ID_COLLISION'}return {denied,original:a.snapshot().drafts[0].payload.memo,otherCount:b.snapshot().drafts.length}}finally{if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID}})()`);
  assert.deepEqual(collision,{denied:true,original:'original',otherCount:0});
  // Two genuinely separate browser page targets share the origin's localStorage
  // and native Web Locks. The second page restores a quarantine, not a retry.
  const initClient=`(()=>{window.__posts=0;window.__client=window.KtsSettlementSyncClient.createSyncClient({fetchImpl:async(url,options)=>{if(url==='/v1/session')return {ok:true,status:200,json:async()=>({server_verified:true,membership_active:true,workspace_id:'group_a',user_id:'user_multitab',role:'operator'})};if(url==='/v1/scopes/drafts'){window.__posts++;return {ok:true,status:200,json:async()=>({sync_status:'SYNCED',scope_key:'group_a:fake_partner_1:2026-11-05:mn',event_id:'event_one',replayed:false,feed_seq:1,new_revision:1})}}throw Error('UNEXPECTED')}});window.__client.setSessionToken('k'.repeat(43),'group_a',{accountId:'user_multitab'});return true})()`;
  assert.equal(await ev(initClient),true);
  const draftId=await ev(`window.__client.queueDraft({workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'},{synthetic:true}).id`);
  const second=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/')}`,{method:'PUT'})).json();
  if(!second.webSocketDebuggerUrl)throw Error('SECOND_TAB_UNAVAILABLE');
  ws2=new WebSocket(second.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws2.addEventListener('open',resolve,{once:true});ws2.addEventListener('error',reject,{once:true});});
  const pending2=new Map();let seq2=0;
  ws2.addEventListener('message',event=>{const m=JSON.parse(event.data);if(pending2.has(m.id)){const p=pending2.get(m.id);pending2.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const call2=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq2;pending2.set(id,{resolve,reject});ws2.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending2.delete(id))reject(Error('CDP_SECOND_TIMEOUT'));},8000).unref();});
  const ev2=async expression=>{const r=await call2('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('SECOND_BROWSER_EXCEPTION');return r.result.value;};
  let secondReady=false;for(let i=0;i<80;i++){secondReady=await ev2("typeof window.KtsSettlementSyncClient==='object'");if(secondReady)break;await sleep(100);}assert.equal(secondReady,true);
  assert.equal(await ev2(initClient),true);
  assert.equal(await ev2('window.__client.snapshot().drafts[0].status'),'NEEDS_RECONCILIATION');
  const [firstSend,secondSend]=await Promise.all([ev(`window.__client.syncDraft(${JSON.stringify(draftId)})`),ev2(`window.__client.syncDraft(${JSON.stringify(draftId)})`)]);
  assert.equal(firstSend.status,'SYNCED');assert.equal(secondSend.status,'NEEDS_RECONCILIATION');
  assert.equal(await ev('window.__posts'),1);assert.equal(await ev2('window.__posts'),0);
  console.log('PASS real Chrome two tabs: restored intent quarantined and only one fake POST');
  ws2.close();ws2=null;
  console.log('PASS real Chrome localStorage: invalid scope denied; valid intent restored and quarantined');
  console.log('PASS real Chrome actor check: foreign same-workspace user denied');
  console.log('PASS real Chrome directory: wrong requested kind denied');
  console.log('PASS real Chrome directory: unexpected fields denied');
  console.log('PASS real Chrome review scope: original preserved across async auth');
  console.log('PASS real Chrome read scope: response bound to original request');
  console.log('PASS real Chrome recovery inspection: original request IDs enforced');
  console.log('PASS real Chrome feed: unbound workspace blocked before fetch');
  console.log('PASS real Chrome synthetic UUID collision preserves original intent');
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
  if(ws2)ws2.close();if(ws)ws.close();if(child){await waitExit(child,5000);if(!exited(child)){child.kill();await waitExit(child,3000);}if(!exited(child))throw Error('CHROME_NOT_CLOSED');}
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  const scan=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p=$env:KTS_OWNED_PROFILE; @(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) }).Count"],{encoding:'utf8',timeout:10000,env:{...process.env,KTS_OWNED_PROFILE:profile}});
  if(scan.error||scan.status!==0||String(scan.stdout).trim()!=='0')throw Error('CHROME_DESCENDANTS_UNVERIFIED');
  removeOwnedProfile(profile);console.log('OWNED_CHROME_AND_LOOPBACK_SERVER_CLOSED');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
