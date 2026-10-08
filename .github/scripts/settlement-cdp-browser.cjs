'use strict';
// No network dependencies: exercises real Chromium DevTools, separate browsing
// contexts and browser-managed IndexedDB / service worker with wall-clock waits.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const mode=process.argv[2]||'indexeddb';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message)};
function browserBinary(){
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    const result=spawnSync('which',[name],{encoding:'utf8'});
    if(result.status===0&&result.stdout.trim())return result.stdout.trim();
  }
  throw Error('CHROMIUM_NOT_INSTALLED');
}
function serve(){
  const mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
    '.png':'image/png','.css':'text/css'};
  const server=http.createServer((req,res)=>{
    let name;
    try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch(_){res.writeHead(400);res.end();return;}
    const filename=path.resolve(root,'.'+name);
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{
      const stat=fs.statSync(filename);
      const file=stat.isDirectory()?path.join(filename,'index.html'):filename;
      res.writeHead(200,{'Content-Type':mimes[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(file).on('error',()=>{res.destroy()}).pipe(res);
    }catch(_){res.writeHead(404);res.end('Not Found: '+name);}
  });
  return server;
}
async function waitFor(fn,timeoutMs,label){
  const end=Date.now()+timeoutMs;let last;
  while(Date.now()<end){
    try{const result=await fn();if(result)return result;}catch(e){last=e;}
    await pause(250);
  }
  throw Error('TIMED_OUT_'+label+(last?':'+last.message:''));
}
async function launchChrome(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kts-cdp-'));
  const stderr=[];const binary=browserBinary();
  const proc=spawn(binary,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--remote-debugging-port=0','--remote-allow-origins=*',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  proc.stderr.on('data',chunk=>{stderr.push(String(chunk));if(stderr.length>40)stderr.shift()});
  try {
  const port=await waitFor(()=>{
    if(proc.exitCode!==null)throw Error('CHROME_EXITED:'+proc.exitCode);
    const active=path.join(profile,'DevToolsActivePort');
    if(!fs.existsSync(active))return null;
    const n=Number(fs.readFileSync(active,'utf8').split(/\r?\n/)[0]);
    return Number.isInteger(n)&&n>0?n:null;
  },18000,'CHROME_DEBUG_PORT');
  const targets=await waitFor(async()=>{
    const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    const items=await res.json();
    return items.find(x=>x.type==='page'&&x.webSocketDebuggerUrl)||null;
  },12000,'PAGE_TARGET');
  const conn=await connect(targets.webSocketDebuggerUrl);
  await conn.send('Page.enable');
  await conn.send('Runtime.enable');
  return {profile,proc,conn,stderr};
  } catch(error) {
    const detail=stderr.slice(-6).join('').slice(-2200);
    proc.kill('SIGKILL');
    await pause(250);
    fs.rmSync(profile,{recursive:true,force:true});
    throw Error('CHROME_START_FAILED:'+error.message+' STDERR='+detail);
  }
}
async function connect(url){
  assert(typeof WebSocket==='function','NODE_WEBSOCKET_UNAVAILABLE');
  const ws=new WebSocket(url),pending=new Map();let seq=0;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP_SOCKET_TIMEOUT')),10000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
    ws.addEventListener('error',ev=>{clearTimeout(timer);reject(Error('CDP_SOCKET_ERROR:'+String(ev.message||'')))},{once:true});
  });
  ws.addEventListener('message',evt=>{
    let msg;try{msg=JSON.parse(String(evt.data));}catch(_){return;}
    const p=pending.get(msg.id);if(!p)return;
    pending.delete(msg.id);clearTimeout(p.timer);
    if(msg.error)p.reject(Error('CDP_'+p.method+':'+msg.error.message));
    else p.resolve(msg.result);
  });
  return {
    async send(method,params={}){
      const id=++seq;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT_'+method))},17000);
        pending.set(id,{resolve,reject,timer,method});
        ws.send(JSON.stringify({id,method,params}));
      });
    },
    close(){ws.close()}
  };
}
async function pageEval(browser,expr){
  const response=await browser.conn.send('Runtime.evaluate',{
    expression:expr,returnByValue:true,awaitPromise:false
  });
  if(response.exceptionDetails)throw Error('PAGE_EVAL_EXCEPTION:'+JSON.stringify(response.exceptionDetails).slice(0,260));
  return response.result&&response.result.value;
}
async function navigate(browser,url){
  const result=await browser.conn.send('Page.navigate',{url});
  if(result.errorText)throw Error('NAVIGATE:'+result.errorText);
}
async function waitResult(browser,expected,timeout=90000){
  let last={state:'not-ready'};
  const output=await waitFor(async()=>{
    const value=await pageEval(browser,`(()=>{const e=document.getElementById('result');return e?{state:e.dataset.state||'pending',text:e.textContent||''}:{state:'no-result',title:document.title}})()`);
    if(value)last=value;
    if(value&&value.state==='fail')throw Error('BROWSER_RUNTIME_FAILED:'+value.text);
    return value&&value.state==='pass'?value:null;
  },timeout,expected);
  assert(output.text.includes(expected+'=PASS'),expected+'_MISSING_PASS_TEXT');
  console.log(expected+'=PASS');
  console.log('RUNTIME_RESULT='+output.text.replace(/\n/g,' | ').slice(0,700));
}
async function closeChrome(browser){
  if(!browser)return;
  try{await browser.conn.send('Browser.close')}catch(_){}
  browser.conn.close();
  browser.proc.kill('SIGTERM');
  await pause(500);
  fs.rmSync(browser.profile,{recursive:true,force:true});
}
async function shutdownServer(server){
  if(!server.listening)return;
  const completed=new Promise(resolve=>server.close(resolve));
  server.closeAllConnections();
  await completed;
}
async function checkIndexedDb(browser,base){
  await navigate(browser,base+'/qualification-indexeddb-smoke.html');
  await waitResult(browser,'QUALIFICATION_INDEXEDDB_BROWSER');
  const details=await pageEval(browser,`(()=>{const e=document.getElementById('result');return {state:e&&e.dataset.state,text:e&&e.textContent}})()`);
  for(const marker of [
    'QUALIFICATION_CROSS_IFRAME_CONCURRENT_APPEND=PASS',
    'QUALIFICATION_EVENT_CHAIN_DURABLE=PASS',
    'QUALIFICATION_BLOCKED_REVOKES_READY=PASS',
    'QUALIFICATION_BROWSER_REQUALIFIED_CURRENT=PASS',
    'QUALIFICATION_BROWSER_PRODUCTION_DISABLED=PASS',
    'QUALIFICATION_INDEXEDDB_EVENT_COUNT=5'
  ])assert(details.text.includes(marker),'INDEXEDDB_MISSING_'+marker);
}
async function checkOffline(browser,server,base){
  await navigate(browser,base+'/settlement.html');
  await waitFor(async()=>await pageEval(browser,`(()=>Boolean(document.getElementById('messageText')&&document.getElementById('checkMessageSyntax')&&window.KTS_SETTLEMENT_STORE))()`),65000,'APP_WARMUP');
  console.log('WARMUP_SETTLEMENT_RUNTIME=PASS');
  await navigate(browser,base+'/sw-diagnostics.html');
  await waitResult(browser,'SW_DIAGNOSTICS',85000);
  console.log('SW_DIAGNOSTIC_RUNTIME_COMPLETED=PASS');
  await shutdownServer(server);
  let unavailable=false;
  try{await fetch(base+'/settlement.html',{signal:AbortSignal.timeout(1700)})}catch(_){unavailable=true;}
  assert(unavailable,'LOCALHOST_STILL_ONLINE');
  console.log('LOCALHOST_SERVER_OFFLINE=PASS');
  await navigate(browser,base+'/settlement.html');
  const state=await waitFor(async()=>{
    const x=await pageEval(browser,`(()=>{
      const valid=Boolean(document.getElementById('messageText')&&
        document.getElementById('kqxsAutoBadge')&&document.getElementById('checkMessageSyntax')&&
        document.getElementById('messageParsePreview')&&window.KTS_SETTLEMENT_STORE);
      const error=String(document.body&&document.body.textContent||'').includes('Khởi tạo lỗi:');
      return {valid,error,title:document.title,sw:Boolean(navigator.serviceWorker&&navigator.serviceWorker.controller)};
    })()`);
    if(x&&x.valid&&!x.error)return x;
    return null;
  },40000,'OFFLINE_REAL_RENDER');
  assert(state.sw,'OFFLINE_PAGE_NOT_SW_CONTROLLED');
  console.log('QUALIFICATION_PR_SERVICE_WORKER_OFFLINE=PASS');
}
(async()=>{
  assert(['indexeddb','offline'].includes(mode),'INVALID_TEST_MODE');
  const server=serve();let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/settlement-test';
    // A startup retry is strictly bounded to 2 attempts; Linux CI can
    // transiently fail Chrome DevTools startup under parallel runner load.
    let startupError=null;
    for(let attempt=1;attempt<=2;attempt++){
      try{
        console.log('CHROME_START_ATTEMPT='+attempt);
        browser=await launchChrome();
        break;
      }catch(error){
        startupError=error;
        console.error('CHROME_START_ATTEMPT_FAILED='+attempt+' '+error.message);
        if(attempt<2)await pause(1250);
      }
    }
    if(!browser)throw startupError||Error('CHROME_STARTUP_FAILED');
    console.log('CDP_CHROME_ATTACHED=PASS');
    if(mode==='indexeddb')await checkIndexedDb(browser,base);
    else await checkOffline(browser,server,base);
    console.log('CDP_'+mode.toUpperCase()+'_PASS=YES');
  }catch(e){
    console.error('CDP_'+mode.toUpperCase()+'_FAIL='+e.stack);
    if(browser)console.error('CHROME_STDERR_TAIL='+browser.stderr.slice(-8).join('').slice(-1500));
    process.exitCode=1;
  }finally{
    await closeChrome(browser);
    await shutdownServer(server);
  }
})();
