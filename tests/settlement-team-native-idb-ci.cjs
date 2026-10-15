'use strict';
// Runs only on disposable GitHub-hosted Linux. No installs, no real finance.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const http=require('node:http'),cp=require('node:child_process');
const {promisify}=require('node:util');
const execFile=promisify(cp.execFile),ROOT=path.resolve(__dirname,'..');
const proofHtml=fs.readFileSync(path.join(__dirname,'settlement-team-native-idb-proof.html'),'utf8');
const routes={
 '/app/settlement-team-recovery-v0.js':'app/settlement-team-recovery-v0.js',
 '/app/settlement-team-recovery-idb-v0.js':'app/settlement-team-recovery-idb-v0.js',
 '/app/settlement-team-manual-checkpoint-v0.js':'app/settlement-team-manual-checkpoint-v0.js'
};
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
 const evidence=process.env.KTS_NATIVE_EVIDENCE_DIR,sha=process.env.KTS_NATIVE_SOURCE_SHA;
 if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||
 !process.env.RUNNER_TEMP||!evidence||!/^[a-f0-9]{40}$/.test(sha||''))
 throw Error('NATIVE_TEST_ENV_NOT_AUTHORIZED');
 await fsp.mkdir(evidence,{recursive:true,mode:0o700});
 const report={source_sha:sha,status:'BLOCKED',native_browser_qa:'NOT_PROVEN',
 real_money_ready:false,release_readiness:'BLOCKED',pwa_enabled:false,
 financial_post_count:0,stages:[]};
 let server=null,temp=null,blockedHttpMethods=0;
 try{
  const bin=browser();
  report.browser_version=(await run(bin,['--version'],8000)).trim();
  temp=await fsp.mkdtemp(path.join(process.env.RUNNER_TEMP,'kts-native-idb-'));
  const profile=path.join(temp,'test-profile');
  server=http.createServer((req,res)=>{
   if(req.method!=='GET'){blockedHttpMethods++;res.writeHead(405);res.end();return}
   const key=new URL(req.url,'http://localhost').pathname;
   if(key==='/proof'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
     'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
     'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"});
    res.end(proofHtml);return
   }
   if(!Object.prototype.hasOwnProperty.call(routes,key)){res.writeHead(404);res.end();return}
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
   fs.createReadStream(path.join(ROOT,routes[key])).pipe(res);
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
  const port=server.address().port;
  if(port===8787)throw Error('RESERVED_PORT');
  for(const stage of ['save','restore','manual-save','manual-restore']){
   // Each pair restarts the test browser process with a shared profile.
   // Manual evidence must not inherit the ordinary test's ciphertext slot.
   const owned=stage.startsWith('manual-')?
     path.join(temp,'manual-profile'):profile;
   const obj=await chromeProof(bin,owned,
      'http://127.0.0.1:'+port+'/proof?stage='+stage);
   if(obj.status!=='PASS'||obj.stage!==stage||obj.native_indexeddb!==true||
      obj.auto_send_enabled!==false||obj.original_id!=='draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    throw Error('NATIVE_PROOF_INVALID_'+stage+'_'+String(obj.code||'NONE'));
   report.stages.push({stage,status:'PASS'});
  }
  // Proof comes from the actual GET-only server's request counter, not from
  // a hardcoded "zero" field in the artifact.
  report.financial_post_count=blockedHttpMethods;
  if(blockedHttpMethods!==0)throw Error('BROWSER_UNEXPECTED_HTTP_METHOD');
  report.status='PASS_SYNTHETIC_NATIVE_CHROME';
  report.native_browser_qa='PASS_CI_RESTART';
 }catch(e){report.error_code=String(e.message||e).slice(0,140)}
 finally{
  report.financial_post_count=blockedHttpMethods;
  if(server)await new Promise(ok=>server.close(ok));
  if(temp)await fsp.rm(temp,{recursive:true,force:true});
  report.owned_profile_cleanup='COMPLETE';
  await fsp.writeFile(path.join(evidence,'NATIVE_IDB_PROOF.json'),
   JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
 }
 if(report.status!=='PASS_SYNTHETIC_NATIVE_CHROME')process.exitCode=1;
}
main().catch(e=>{console.error('NATIVE_CI_FAILED '+e.message);process.exitCode=1});
