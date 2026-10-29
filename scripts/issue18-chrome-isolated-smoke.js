'use strict';
// Optional zero-cost Linux Chrome smoke on public *isolated localhost* staging.
// Does NOT authorize release or replace Windows C:/Android acceptance.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const cp=require('node:child_process');
const assert=require('node:assert/strict');

const nap=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function ensure(ok,msg){if(!ok)throw Error('CHROME_STAGE_BLOCKED: '+msg)}
function serve(stage){
  const root=fs.realpathSync(stage);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      let full=path.resolve(root,'.'+pathname);
      if(full!==root&&!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
      if(fs.statSync(full).isDirectory())full=path.join(full,'index.html');
      if(!fs.realpathSync(full).startsWith(root+path.sep)){res.writeHead(403).end();return}
      res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD'){res.end();return}
      fs.createReadStream(full).pipe(res);
    }catch(_){res.writeHead(404).end()}
  });
  return server;
}
async function chromeSmoke(stage){
  ensure(path.isAbsolute(stage)&&fs.statSync(stage).isDirectory(),'stage must be existing absolute directory');
  const server=serve(stage);await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
  const origin='http://127.0.0.1:'+server.address().port;
  const served=await fetch(origin+'/Mobile/app/');
  ensure(served.ok&&((await served.text()).includes('id="tachFrame"')),'loopback server did not serve the real Unified HTML');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kts-issue18-headless-'));
  const chrome=process.env.CHROME_PATH||'google-chrome';
  let child,ws;
  try{
    const args=['--headless=new','--disable-gpu','--disable-dev-shm-usage','--no-sandbox',
      '--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',
      '--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,
      '--proxy-server=direct://','--proxy-bypass-list=*',
      '--host-resolver-rules=EXCLUDE 127.0.0.1, EXCLUDE localhost, MAP * ~NOTFOUND','about:blank'];
    child=cp.spawn(chrome,args,{stdio:'ignore',shell:false,env:{...process.env,HOME:process.env.HOME}});
    const activePort=path.join(profile,'DevToolsActivePort');
    let port=null;
    for(let i=0;i<120;i++){
      if(child.exitCode!==null)break;
      if(fs.existsSync(activePort)){
        const p=Number(fs.readFileSync(activePort,'utf8').split(/\r?\n/)[0]);
        if(Number.isInteger(p)&&p>0){port=p;break}
      }
      await nap(100);
    }
    ensure(port,'headless Chrome did not open DevTools loopback port');
    const result=await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(origin+'/Mobile/app/'),{method:'PUT'});
    ensure(result.ok,'cannot create isolated Chrome tab');
    const target=await result.json();
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true})});
    let seq=0;const pending=new Map();
    ws.addEventListener('message',event=>{
      try{const data=JSON.parse(event.data);if(!data.id)return;
        const hold=pending.get(data.id);if(!hold)return;
        pending.delete(data.id);clearTimeout(hold.timer);
        if(data.error)hold.fail(Error(data.error.message));else hold.ok(data.result)
      }catch(_){} 
    });
    function command(method,params={}){
      return new Promise((ok,fail)=>{
        const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},12000);
        pending.set(id,{ok,fail,timer});ws.send(JSON.stringify({id,method,params}))
      })
    }
    await command('Page.enable');await command('Runtime.enable');
    const navigation=await command('Page.navigate',{url:origin+'/Mobile/app/'});
    ensure(!navigation.errorText,'Chrome navigation rejected: '+JSON.stringify(navigation));
    let found,lastEval;
    for(let i=0;i<100;i++){
      const r=await command('Runtime.evaluate',{expression:"(()=>{try{const a=document.getElementById('tachFrame'),b=document.getElementById('ngangFrame');return {location:location.href,title:document.title,ready:document.readyState,html:document.documentElement?.outerHTML?.slice(0,350),unified:!!a&&!!b,local:!!a&&!!b&&a.src.startsWith(location.origin+'/Mobile/')&&b.src.startsWith(location.origin+'/Ngang/'),tach:!!a?.contentDocument?.querySelector('#input'),ngang:!!b?.contentDocument?.querySelector('#input'),versions:[document.body?.textContent?.includes('1.0.26'),a?.contentDocument?.body?.textContent?.includes('2.0.37'),b?.contentDocument?.body?.textContent?.includes('1.0.36')]}}catch(e){return {error:String(e)}}})()",returnByValue:true});
      lastEval=r;
      if(r.exceptionDetails)throw Error('CHROME_EVAL_EXCEPTION '+JSON.stringify(r.exceptionDetails).slice(0,1200));
      found=r.result?.value;
      if(found?.unified&&found?.local&&found?.tach&&found?.ngang&&found.versions?.every(Boolean))break;
      await nap(100);
    }
    assert.ok(found?.unified,'Unified two iframe shell did not load: '+JSON.stringify({found,lastEval}).slice(0,1800));
    assert.ok(found?.local,'One iframe routed outside localhost staging');
    assert.ok(found?.tach&&found?.ngang,'Mobile/Ngang child app input absent in real Chrome');
    assert.ok(found?.versions?.every(Boolean),'Versioned Unified/Mobile/Ngang UI missing');
    const r=await command('Runtime.evaluate',{expression:"(async()=>{const a=document.getElementById('tachFrame'),b=document.getElementById('ngangFrame');for(const f of [a,b]){const d=f.contentDocument;d.querySelector('#region').value='mn';d.querySelector('#date').value='2026-10-15';d.querySelector('#input').value='2d 89 98 b5n dx2,5n';d.querySelector('#runBtn').click()}await new Promise(ok=>setTimeout(ok,120));return {mobile:a.contentDocument.querySelector('#output').value,ngang:b.contentDocument.querySelector('#output').value}})()",awaitPromise:true,returnByValue:true});
    const output=r.result?.value||{};
    ensure(typeof output.mobile==='string'&&output.mobile.includes('89'),'Mobile real Chrome synthetic N035 output missing');
    ensure(typeof output.ngang==='string'&&output.ngang.includes('89'),'Ngang real Chrome synthetic N035 output missing');
    ensure(output.mobile!==output.ngang,'Ngang and Mobile unexpectedly same mode-specific result');
    await command('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    // Production-path browser events: select one rendered wager row, use the
    // actual Cut button, verify persisted survivor ledger, reload, then Undo.
    const cut=await command('Runtime.evaluate',{expression:"(async()=>{const d=document.getElementById('tachFrame').contentDocument;const group=d.getElementById('resultGroups')?.children?.[0],row=group?.children?.[1],box=row?.querySelector('input[type=checkbox]');if(!box)return {error:'NO_ROW_CHECKBOX',group:!!group};box.click();d.getElementById('cutBtn').click();await new Promise(done=>setTimeout(done,500));const input=d.getElementById('input').value,output=d.getElementById('output').value;return {input,output,stored:!!window.localStorage.getItem('tachDaiMobileExactOutputLedgerV1'),status:d.getElementById('status').textContent}})()",awaitPromise:true,returnByValue:true});
    if(cut.exceptionDetails)throw Error('CHROME_CUT_EXCEPTION: '+JSON.stringify(cut.exceptionDetails).slice(0,900));
    const cutResult=cut.result?.value||{};
    ensure(cutResult.input?.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n'),
      'Cut must commit its survivor ledger: '+JSON.stringify(cutResult).slice(0,850));
    ensure(cutResult.stored,'successful Cut must persist before visible deletion');
    ensure(cutResult.output!==output.mobile&&cutResult.output.length>0,
      'Cut must remove only selected row and retain other wagers');
    await command('Page.reload',{ignoreCache:true});
    let restored;
    for(let i=0;i<80;i++){
      const result=await command('Runtime.evaluate',{expression:"(()=>{const d=document.getElementById('tachFrame')?.contentDocument;return {input:d?.getElementById('input')?.value||'',output:d?.getElementById('output')?.value||'',undo:!!d?.getElementById('undoBtn'),status:d?.getElementById('status')?.textContent||''}})()",returnByValue:true});
      restored=result.result?.value;
      if(restored?.input.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n')&&restored?.output===cutResult.output)break;
      await nap(120);
    }
    ensure(restored?.input.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n')&&restored?.output===cutResult.output,
      'Real Chrome reload must retain exact surviving output: '+JSON.stringify(restored).slice(0,850));
    const undo=await command('Runtime.evaluate',{expression:"(async()=>{const d=document.getElementById('tachFrame').contentDocument;d.getElementById('undoBtn').click();await new Promise(done=>setTimeout(done,250));return {input:d.getElementById('input').value,output:d.getElementById('output').value,status:d.getElementById('status').textContent}})()",awaitPromise:true,returnByValue:true});
    const undoResult=undo.result?.value||{};
    ensure(undoResult.input==='2d 89 98 b5n dx2,5n'&&undoResult.output===output.mobile,
      'Undo after Chrome reload must restore exact original ticket: '+JSON.stringify(undoResult).slice(0,850));
    console.log('ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS');
    console.log('ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS '+JSON.stringify({
      origin:'http://127.0.0.1:<ephemeral>',versions:['2.0.37','1.0.36','1.0.26'],
      frames:2,source:'synthetic',modeOutputsDistinct:true,physicalWindows:'NOT_RUN',
      android:'NOT_RUN',production:'NO_GO',cost_usd:0
    }));
  }finally{
    try{ws?.close()}catch(_){}
    if(child&&child.exitCode===null){
      child.kill('SIGTERM');
      await Promise.race([new Promise(ok=>child.once('exit',ok)),nap(2000)]);
      if(child.exitCode===null)child.kill('SIGKILL');
    }
    await new Promise(ok=>server.close(ok));
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150})}
    catch(e){console.error('CHROME_TEST_PROFILE_CLEANUP_ONLY: '+e.message)}
  }
}
if(require.main===module)chromeSmoke(process.argv[2]).catch(e=>{console.error(e.stack||e);process.exitCode=2});
module.exports={chromeSmoke};
