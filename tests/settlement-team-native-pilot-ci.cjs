'use strict';
// Disposable CI-only native Chrome pilot UI + isolated fake HTTP backend.
// Never import team-settlement/auth-http-contract into real operations.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const http=require('node:http'),cp=require('node:child_process');
const {promisify}=require('node:util');const execFile=promisify(cp.execFile);
const ROOT=path.resolve(__dirname,'..'),controller=fs.readFileSync(path.join(__dirname,'settlement-team-native-pilot-controller.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'app/settlement-team-pilot.html'),'utf8');
const TOKEN='a'.repeat(43);
const offlineController=fs.readFileSync(
 path.join(__dirname,'settlement-team-native-offline-controller.js'),'utf8');
const ASSETS=new Map([
 ['settlement-team-review-audit.js','app/settlement-team-review-audit.js'],
 ['settlement-team-sync-client.js','app/settlement-team-sync-client.js'],
 ['settlement-team-pilot-ui.js','app/settlement-team-pilot-ui.js'],
 ['settlement-team-pilot-start.js','app/settlement-team-pilot-start.js'],
 ['settlement-team-pilot.css','app/settlement-team-pilot.css']
]);
function browser(){
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{return cp.execFileSync('which',[name],{encoding:'utf8',timeout:2000}).trim()}catch(_){}
 }
 throw Error('CHROME_BINARY_NOT_AVAILABLE');
}
async function run(bin,args,timeout=50000){
 const r=await execFile(bin,args,{encoding:'utf8',timeout,maxBuffer:300000});
 return r.stdout;
}
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function chromeProof(bin,profile,url){
 // The prior browser can leave a stale debugger port marker even after
 // its process has exited. Never connect to that earlier browser by accident.
 await fsp.rm(path.join(profile,'DevToolsActivePort'),{force:true});
 const proc=cp.spawn(bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-extensions','--no-first-run',
  '--no-default-browser-check','--remote-debugging-port=0',
  '--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],
  {stdio:['ignore','ignore','ignore']});
 let ws=null;
 try{
  if(typeof WebSocket!=='function')throw Error('NATIVE_NODE_WEBSOCKET_MISSING_'+process.version);
  let port=0;
  for(let n=0;n<80;n++){
   if(proc.exitCode!==null)throw Error('CHROME_EXIT_BEFORE_DEVTOOLS');
   try{
    const text=await fsp.readFile(path.join(profile,'DevToolsActivePort'),'utf8');
    port=Number(text.split('\n')[0]);if(port>0)break;
   }catch(_){}
   await sleep(150);
  }
  if(!port)throw Error('CHROME_DEVTOOLS_PORT_MISSING');
  let target;
  for(let n=0;n<40;n++){
   try{
    const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    target=(await res.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
    if(target)break;
   }catch(_){}
   await sleep(150);
  }
  if(!target)throw Error('CHROME_DEVTOOLS_PAGE_MISSING');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{
   const t=setTimeout(()=>bad(Error('CHROME_WEBSOCKET_TIMEOUT')),8000);
   ws.addEventListener('open',()=>{clearTimeout(t);ok()},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(t);bad(Error('CHROME_WEBSOCKET_ERROR'))},{once:true});
  });
  const pending=new Map();let counter=0;
  ws.addEventListener('message',e=>{
   let msg;try{msg=JSON.parse(e.data)}catch(_){return}
   if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id)}
  });
  async function call(method,params={}){
   const id=++counter;
   const v=await Promise.race([
    new Promise((ok,bad)=>{pending.set(id,ok);
     try{ws.send(JSON.stringify({id,method,params}))}
     catch(e){pending.delete(id);bad(e)}}),
    sleep(8000).then(()=>{throw Error('CDP_TIMEOUT_'+method)})
   ]);
   pending.delete(id);
   if(v.error)throw Error('CDP_ERROR_'+method+'_'+v.error.code);
   return v.result;
  }
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await call('Page.navigate',{url});
  const end=Date.now()+35000;
  while(Date.now()<end){
   const r=await call('Runtime.evaluate',{expression:
    "document.getElementById('proof')?.textContent",returnByValue:true});
   const output=r&&r.result&&r.result.value;
   if(typeof output==='string'&&output!=='PENDING'){
    try{return JSON.parse(output)}catch(_){throw Error('NATIVE_PROOF_NOT_JSON')}
   }
   await sleep(200);
  }
  throw Error('NATIVE_PROOF_TIMEOUT');
 }finally{
  // Request normal browser-wide shutdown before signalling only this owned
  // Chrome child. A tab WebSocket close alone leaves browser child processes.
  try{
   if(ws&&ws.readyState===WebSocket.OPEN){
    ws.send(JSON.stringify({id:999999,method:'Browser.close'}));
    await sleep(450);
   }
  }catch(_){}
  try{ws?.close()}catch(_){}
  if(proc.exitCode===null){
   proc.kill('SIGTERM');
   await Promise.race([new Promise(ok=>proc.once('close',ok)),sleep(3000)]);
   if(proc.exitCode===null){
    proc.kill('SIGKILL');
    await Promise.race([new Promise(ok=>proc.once('close',ok)),sleep(1500)]);
   }
  }
  // The second proof must use a genuinely closed/reopened Chrome profile.
  // Retaining a SingletonLock means another test-owned process can still
  // hold it, so never claim independent browser restart.
  let lockReleased=false;
  for(let n=0;n<20;n++){
   try{await fsp.lstat(path.join(profile,'SingletonLock'));}
   catch(e){
    if(e.code==='ENOENT'){lockReleased=true;break;}
    throw e;
   }
   await sleep(150);
  }
  if(!lockReleased)throw Error('CHROME_PROFILE_LOCK_NOT_RELEASED');
 }
}
async function main(){
 const sha=process.env.KTS_PILOT_SOURCE_SHA,evidence=process.env.KTS_PILOT_EVIDENCE_DIR;
 if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||
    !process.env.RUNNER_TEMP||!/^[a-f0-9]{40}$/.test(sha||'')||!evidence)
   throw Error('PILOT_CI_NOT_AUTHORIZED');
 await fsp.mkdir(evidence,{recursive:true,mode:0o700});
 const report={source_sha:sha,status:'BLOCKED',pilot_ui_browser:'NOT_PROVEN',
  release_readiness:'BLOCKED',real_money_ready:false,real_money_post_count:0,
  synthetic_draft_post_count:0,draft_post_attempts:0,replay_count:0,
  forged_feed_deliveries:0,auth_logins:0,denied_logins:0,
  auth_logouts:0,proofs:[]};
 let server=null,profileRoot=null;
 try{
  const binary=browser();
  report.browser_version=(await run(binary,['--version'],8000)).trim();
  profileRoot=await fsp.mkdtemp(path.join(process.env.RUNNER_TEMP,'kts-pilot-native-'));
  let created=false,acceptedKey=null,attempts=0,scenario='happy';
  const receiptId='fake_event_1';
  const send=(res,status,payload)=>{
    const body=JSON.stringify(payload);
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    res.end(body);
  };
  async function body(req){
   const chunks=[];let size=0;
   for await (const chunk of req){
    size+=chunk.length;if(size>4096)throw Error('PILOT_BODY_LIMIT');
    chunks.push(chunk);
   }
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  server=http.createServer(async(req,res)=>{
   const incoming=new URL(req.url,'http://127.0.0.1');
   const pathname=incoming.pathname;
   if(req.method==='GET'&&pathname==='/proof'){
    const requested=incoming.searchParams.get('scenario')||'happy';
    if(!['happy','lost_ack','unverified_feed'].includes(requested)){
      send(res,404,{error:'PILOT_SCENARIO_NOT_ALLOWED'});return;
    }
    scenario=requested;created=false;acceptedKey=null;attempts=0;
    const controllerFile=scenario==='happy'
      ?'settlement-team-native-pilot-controller.js'
      :'settlement-team-native-offline-controller.js';
    const injected=html.replace('</head>',
      '<script src="./'+controllerFile+'" defer></script></head>')
      .replace('</body>','<pre id="proof">PENDING</pre></body>');
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(injected);return;
   }
   if(req.method==='GET'&&pathname==='/settlement-team-native-pilot-controller.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    res.end(controller);return;
   }
   if(req.method==='GET'&&pathname==='/settlement-team-native-offline-controller.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    res.end(offlineController);return;
   }
   if(req.method==='GET'&&pathname.startsWith('/')){
    const file=ASSETS.get(pathname.slice(1));
    if(file){
     res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript'});
     fs.createReadStream(path.join(ROOT,file)).pipe(res);return;
    }
   }
   if(req.method==='POST'&&pathname==='/v1/login'){
    let data;try{data=await body(req)}catch(_){send(res,400,{error:'AUTH_JSON_INVALID'});return}
    if(data.auth_subject!=='fake_operator_a'||data.password!=='synthetic-secret'||
       data.workspace_id!=='group_a'){
      report.denied_logins++;
      send(res,401,{error:'AUTH_LOGIN_DENIED'});return;
    }
    report.auth_logins++;
    send(res,200,{session_token:TOKEN,expires_at:'2026-10-15T12:00:00Z'});return;
   }
   if(req.headers.authorization==='Bearer '+TOKEN){
    if(req.method==='POST'&&pathname==='/v1/scopes/drafts'){
     let data;try{data=await body(req)}catch(_){send(res,400,{error:'AUTH_JSON_INVALID'});return}
     report.draft_post_attempts++;
     if(!data||data.scope?.workspace_id!=='group_a'||
        data.scope?.partner_id!=='fake_partner_1'||
        data.scope?.business_date!=='2026-10-15'||data.scope?.region!=='mn'||
        data.payload?.synthetic!==true||data.expected_revision!==0||
        !/^draft_[a-f0-9]{32}$/.test(data.idempotency_key||'')){
       send(res,422,{error:'TEAM_SYNTHETIC_INTENT_DENIED'});return;
     }
     attempts++;
     if(created){
       if(scenario!=='lost_ack'||attempts!==2||
          data.idempotency_key!==acceptedKey){
         send(res,409,{error:'TEAM_IDEMPOTENCY_CHANGED_OR_DUPLICATE'});return;
       }
       report.replay_count++;
       send(res,200,{sync_status:'SYNCED',
         scope_key:'group_a:fake_partner_1:2026-10-15:mn',
         event_id:receiptId,feed_seq:'1',new_revision:1,replayed:true});return;
     }
     created=true;acceptedKey=data.idempotency_key;
     report.synthetic_draft_post_count++;
     // The fake DB committed, but the browser never received a verified
     // receipt. A 503 cannot authorize minting a new idempotency key.
     if(scenario!=='happy'){
       send(res,503,{error:'TEAM_RECEIPT_ACK_LOST'});return;
     }
     send(res,200,{sync_status:'SYNCED',
       scope_key:'group_a:fake_partner_1:2026-10-15:mn',
       event_id:receiptId,feed_seq:'1',new_revision:1,replayed:false});return;
    }
    if(req.method==='GET'&&pathname==='/v1/scopes/fake_partner_1/2026-10-15/mn'){
     send(res,200,{workspace_id:'group_a',partner_id:'fake_partner_1',
       business_date:'2026-10-15',region:'mn',revision:1,state:'DRAFT'});return;
    }
    if(req.method==='GET'&&pathname==='/v1/changes'){
     const forged=scenario==='unverified_feed'&&created;
     if(forged)report.forged_feed_deliveries++;
     send(res,200,{sync_status:'SYNCED',
      items:created?[{workspace_id:forged?'group_b':'group_a',
        event_id:receiptId,feed_seq:'1',event_kind:'DRAFT_CREATED'}]:[],
      next_cursor:created?'fake_cursor_1':null,has_more:false});return;
    }
    if(req.method==='POST'&&pathname==='/v1/logout'){
     report.auth_logouts++;
     res.writeHead(204,{'cache-control':'no-store'});res.end();return;
    }
   }
   report.real_money_post_count++;
   send(res,404,{error:'TEAM_ROUTE_NOT_ENABLED'});
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
  const port=server.address().port;
  if(port===8787)throw Error('RESERVED_PORT_COLLISION');
  for(const scenarioName of ['happy','lost_ack','unverified_feed']){
   const proof=await chromeProof(binary,
     path.join(profileRoot,'chrome-profile-'+scenarioName),
     'http://127.0.0.1:'+port+'/proof?scenario='+scenarioName);
   report.proofs.push(proof);
   if(!proof||proof.status!=='PASS'||
      proof.stage!==(scenarioName==='happy'?'pilot':scenarioName)||
      (scenarioName==='happy'&&
       (proof.fake_only!==true||proof.real_money_ready!==false||
        proof.review_ui_enabled!==false||proof.mobile_viewport!==true||
        proof.touch_target_44px!==true||
        proof.bad_login_denied!==true||
        proof.real_counterparty_denied!==true))||
      (scenarioName!=='happy'&&
       (proof.synthetic_only!==true||proof.auto_send_enabled!==false)))
     throw Error('PILOT_NATIVE_UI_PROOF_UNVERIFIED_'+scenarioName+'_'+
       String(proof&&(proof.code||proof.error_code)||'NO_RECEIPT'));
  }
  // The fake backend has one immutable event per scenario; only the lost
  // response case legitimately replays a key, without a second event.
  if(report.auth_logins!==3||report.denied_logins!==1||
     report.auth_logouts!==3||
     report.synthetic_draft_post_count!==3||
     report.draft_post_attempts!==4||report.replay_count!==1||
     report.forged_feed_deliveries!==1||report.real_money_post_count!==0)
    throw Error('PILOT_IDEMPOTENCY_OR_TENANCY_EVIDENCE_MISSING');
  report.pilot_ui_browser='PASS_SYNTHETIC_CHROME_REAL_UI';
  report.status='PASS_SYNTHETIC_NATIVE_PILOT';
 }catch(e){report.error_code=String(e.message||e).slice(0,160)}
 finally{
  if(server)await new Promise(ok=>server.close(ok));
  if(profileRoot)await fsp.rm(profileRoot,{recursive:true,force:true});
  report.test_profile_cleanup='COMPLETE';
  await fsp.writeFile(path.join(evidence,'NATIVE_PILOT_UI_PROOF.json'),
   JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
 }
 if(report.status!=='PASS_SYNTHETIC_NATIVE_PILOT')process.exitCode=1;
}
main().catch(e=>{console.error('NATIVE_PILOT_CI_FAILED '+String(e.message||e));process.exitCode=1;});
