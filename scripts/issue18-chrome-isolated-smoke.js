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
      const r=await command('Runtime.evaluate',{expression:"(()=>{try{const a=document.getElementById('tachFrame'),b=document.getElementById('ngangFrame');return {location:location.href,title:document.title,ready:document.readyState,html:document.documentElement?.outerHTML?.slice(0,350),unified:!!a&&!!b,readyChildren:a?.contentDocument?.readyState==='complete'&&b?.contentDocument?.readyState==='complete',local:!!a&&!!b&&a.src.startsWith(location.origin+'/Mobile/')&&b.src.startsWith(location.origin+'/Ngang/'),tach:!!a?.contentDocument?.querySelector('#input'),ngang:!!b?.contentDocument?.querySelector('#input'),versions:[document.body?.textContent?.includes('1.0.26'),a?.contentDocument?.body?.textContent?.includes('2.0.37'),b?.contentDocument?.body?.textContent?.includes('1.0.36')]}}catch(e){return {error:String(e)}}})()",returnByValue:true});
      lastEval=r;
      if(r.exceptionDetails)throw Error('CHROME_EVAL_EXCEPTION '+JSON.stringify(r.exceptionDetails).slice(0,1200));
      found=r.result?.value;
      if(found?.unified&&found?.readyChildren&&found?.local&&found?.tach&&found?.ngang&&found.versions?.every(Boolean))break;
      await nap(100);
    }
    assert.ok(found?.unified,'Unified two iframe shell did not load: '+JSON.stringify({found,lastEval}).slice(0,1800));
    assert.ok(found?.local,'One iframe routed outside localhost staging');
    assert.ok(found?.tach&&found?.ngang,'Mobile/Ngang child app input absent in real Chrome');
    assert.ok(found?.versions?.every(Boolean),'Versioned Unified/Mobile/Ngang UI missing');
    // Unified owns date/region. Never bypass its shared controls by writing
    // directly into an iframe; parent sync otherwise overwrites the oracle date
    // between initial output and subsequent Cut/Undo.
    const setShared=await command('Runtime.evaluate',{expression:"(()=>{const region=document.getElementById('sharedRegion'),date=document.getElementById('sharedDate'),today=document.getElementById('sharedToday');if(!region||!date||!today)return {error:'MISSING_UNIFIED_SETTINGS'};today.checked=false;region.value='mn';date.value='2026-10-15';date.dispatchEvent(new Event('change',{bubbles:true}));return {region:region.value,date:date.value,today:today.checked}})()",returnByValue:true});
    ensure(setShared.result?.value?.date==='2026-10-15','Cannot set authoritative Unified date for N035');
    let childrenReady;
    for(let i=0;i<80;i++){
      const check=await command('Runtime.evaluate',{expression:"(()=>{const a=document.getElementById('tachFrame')?.contentDocument,b=document.getElementById('ngangFrame')?.contentDocument;return {mobileDate:a?.getElementById('date')?.value,ngangDate:b?.getElementById('date')?.value,mobileRegion:a?.getElementById('region')?.value,ngangRegion:b?.getElementById('region')?.value,sharedDate:document.getElementById('sharedDate')?.value}})()",returnByValue:true});
      childrenReady=check.result?.value;
      if(childrenReady?.mobileDate==='2026-10-15'&&childrenReady?.ngangDate==='2026-10-15'&&
         childrenReady?.mobileRegion==='mn'&&childrenReady?.ngangRegion==='mn')break;
      await nap(90);
    }
    ensure(childrenReady?.mobileDate==='2026-10-15'&&childrenReady?.ngangDate==='2026-10-15',
      'Unified shared date did not propagate to both engines: '+JSON.stringify(childrenReady));
    const r=await command('Runtime.evaluate',{expression:"(async()=>{const a=document.getElementById('tachFrame'),b=document.getElementById('ngangFrame');const results={};for(const [key,f] of [['mobile',a],['ngang',b]]){const d=f.contentDocument;if(d.querySelector('#region').value!=='mn'||d.querySelector('#date').value!=='2026-10-15')throw Error('N035_DATE_DRIFT_'+key);d.querySelector('#input').value='2d 89 98 b5n dx2,5n';d.querySelector('#runBtn').click();await new Promise(ok=>setTimeout(ok,120));results[key]=d.querySelector('#output').value}return results})()",awaitPromise:true,returnByValue:true});
    const output=r.result?.value||{};
    ensure(typeof output.mobile==='string'&&output.mobile.includes('89'),'Mobile real Chrome synthetic N035 output missing: '+JSON.stringify(output).slice(0,650));
    ensure(typeof output.ngang==='string'&&output.ngang.includes('89'),'Ngang real Chrome synthetic N035 output missing: '+JSON.stringify(output).slice(0,650));
    ensure(output.mobile!==output.ngang,'Ngang and Mobile unexpectedly same mode-specific result');
    await command('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    // Production-path browser events: select one rendered wager row, use the
    // actual Cut button, verify persisted survivor ledger, reload, then Undo.
    // Use a trusted CDP pointer event. A programmatic button.click() has no
    // user activation and is (correctly) refused by navigator.clipboard.
    const prep=await command('Runtime.evaluate',{expression:"(async()=>{document.querySelector('.tab[data-mode=tach]').click();await new Promise(done=>setTimeout(done,250));const frame=document.getElementById('tachFrame'),d=frame.contentDocument;d.getElementById('input').value='2d 89 98 b5n dx2,5n';d.getElementById('runBtn').click();await new Promise(done=>setTimeout(done,100));const group=d.getElementById('resultGroups')?.children?.[0],row=group?.children?.[1],box=row?.querySelector('input[type=checkbox]');if(!box)return {error:'NO_ROW_CHECKBOX',status:d.getElementById('status').textContent};box.click();const button=d.getElementById('cutBtn');button.scrollIntoView({block:'center'});await new Promise(done=>setTimeout(done,100));const a=frame.getBoundingClientRect(),b=button.getBoundingClientRect();return {x:a.left+b.left+b.width/2,y:a.top+b.top+b.height/2,buttonDisabled:button.disabled,status:d.getElementById('status').textContent}})()",awaitPromise:true,returnByValue:true});
    if(prep.exceptionDetails)throw Error('CHROME_PREP_EXCEPTION: '+JSON.stringify(prep.exceptionDetails).slice(0,900));
    const coords=prep.result?.value||{};
    ensure(Number.isFinite(coords.x)&&Number.isFinite(coords.y)&&!coords.buttonDisabled,
      'Cut UI button not ready for trusted click: '+JSON.stringify(coords).slice(0,750));
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:coords.x,y:coords.y,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:coords.x,y:coords.y,button:'left',clickCount:1});
    await nap(500);
    const cut=await command('Runtime.evaluate',{expression:"(()=>{const d=document.getElementById('tachFrame').contentDocument;return {input:d.getElementById('input').value,output:d.getElementById('output').value,stored:!!window.localStorage.getItem('tachDaiMobileExactOutputLedgerV1'),status:d.getElementById('status').textContent}})()",returnByValue:true});
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
    console.log('ISSUE18_PUBLIC_CHROME_MOBILE_CUT_RELOAD_UNDO_PASS');
    // Independent Ngang browser acceptance, on the same isolated localhost
    // and same canonical source. Do not infer from the Mobile receipt.
    const nPrep=await command('Runtime.evaluate',{expression:"(async()=>{document.querySelector('.tab[data-mode=ngang]').click();await new Promise(ok=>setTimeout(ok,250));const frame=document.getElementById('ngangFrame'),d=frame.contentDocument;const region=d.getElementById('region'),date=d.getElementById('date');region.value='mn';region.dispatchEvent(new Event('change',{bubbles:true}));date.value='2026-10-15';date.dispatchEvent(new Event('change',{bubbles:true}));d.getElementById('input').value='2d 89 98 b5n dx2,5n';d.getElementById('runBtn').click();await new Promise(ok=>setTimeout(ok,150));const baseline=d.getElementById('output').value,group=d.getElementById('resultGroups')?.children?.[0],row=group?.children?.[1],box=row?.querySelector('input[type=checkbox]');if(!box)return {error:'NGANG_NO_ROW',baseline,status:d.getElementById('status').textContent};box.click();const btn=d.getElementById('cutBtn');btn.scrollIntoView({block:'center'});await new Promise(ok=>setTimeout(ok,100));const a=frame.getBoundingClientRect(),b=btn.getBoundingClientRect();return {x:a.left+b.left+b.width/2,y:a.top+b.top+b.height/2,baseline,disabled:btn.disabled}})()",awaitPromise:true,returnByValue:true});
    if(nPrep.exceptionDetails)throw Error('NGANG_BROWSER_PREP_EXCEPTION: '+JSON.stringify(nPrep.exceptionDetails).slice(0,800));
    const nPosition=nPrep.result?.value||{};
    ensure(Number.isFinite(nPosition.x)&&Number.isFinite(nPosition.y)&&!nPosition.disabled,
      'Ngang result checkbox/cut inaccessible: '+JSON.stringify(nPosition).slice(0,750));
    ensure(nPosition.baseline&&nPosition.baseline!==output.mobile,'Ngang must remain distinct from Mobile');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:nPosition.x,y:nPosition.y,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:nPosition.x,y:nPosition.y,button:'left',clickCount:1});
    await nap(500);
    const nResult=await command('Runtime.evaluate',{expression:"(()=>{const d=document.getElementById('ngangFrame').contentDocument;return {input:d.getElementById('input').value,output:d.getElementById('output').value,stored:!!window.localStorage.getItem('tachDaiNgangExactOutputLedgerV1'),status:d.getElementById('status').textContent}})()",returnByValue:true});
    const nCut=nResult.result?.value||{};
    ensure(nCut.input?.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n')&&nCut.stored&&nCut.output&&nCut.output!==nPosition.baseline,
      'Ngang Chrome Cut must be persistent and conserve surviving results: '+JSON.stringify(nCut).slice(0,900));
    await command('Page.reload',{ignoreCache:true});
    let nReload;
    for(let i=0;i<80;i++){
      const rr=await command('Runtime.evaluate',{expression:"(()=>{const d=document.getElementById('ngangFrame')?.contentDocument;return {input:d?.getElementById('input')?.value||'',output:d?.getElementById('output')?.value||'',status:d?.getElementById('status')?.textContent||''}})()",returnByValue:true});
      nReload=rr.result?.value;
      if(nReload?.input.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n')&&nReload?.output===nCut.output)break;
      await nap(120);
    }
    ensure(nReload?.input.startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n')&&nReload?.output===nCut.output,
      'Ngang Chrome reload must keep exact surviving stakes: '+JSON.stringify(nReload).slice(0,800));
    const nUndo=await command('Runtime.evaluate',{expression:"(async()=>{const d=document.getElementById('ngangFrame').contentDocument;d.getElementById('undoBtn').click();await new Promise(ok=>setTimeout(ok,250));return {input:d.getElementById('input').value,output:d.getElementById('output').value,status:d.getElementById('status').textContent}})()",awaitPromise:true,returnByValue:true});
    const nUndoValue=nUndo.result?.value||{};
    ensure(nUndoValue.input==='2d 89 98 b5n dx2,5n'&&nUndoValue.output===nPosition.baseline,
      'Ngang reload Undo must restore original stakes: '+JSON.stringify(nUndoValue).slice(0,850));
    console.log('ISSUE18_PUBLIC_CHROME_NGANG_CUT_RELOAD_UNDO_PASS');
    console.log('ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS');

    // Genuine browser offline reload (not the static SW simulation):
    // all three independent SW scopes must have activated before the network
    // is taken offline. This intentionally does not replace Android testing.
    let swScopes=[];
    for(let i=0;i<60;i++){
      const check=await command('Runtime.evaluate',{expression:"(async()=>{const regs=await navigator.serviceWorker.getRegistrations();return regs.filter(x=>x.active).map(x=>new URL(x.scope).pathname)})()",awaitPromise:true,returnByValue:true});
      swScopes=check.result?.value||[];
      if(['/Mobile/','/Mobile/app/','/Ngang/'].every(scope=>swScopes.includes(scope)))break;
      await nap(150);
    }
    ensure(['/Mobile/','/Mobile/app/','/Ngang/'].every(scope=>swScopes.includes(scope)),
      'Expected three active isolated PWA service-worker scopes: '+JSON.stringify(swScopes));
    await command('Network.enable');
    await command('Network.emulateNetworkConditions',{
      offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await command('Page.reload',{ignoreCache:false});
    let offline;
    for(let i=0;i<100;i++){
      const resp=await command('Runtime.evaluate',{expression:"(()=>{const a=document.getElementById('tachFrame'),b=document.getElementById('ngangFrame');return {ready:document.readyState==='complete'&&a?.contentDocument?.readyState==='complete'&&b?.contentDocument?.readyState==='complete',frames:!!a?.contentDocument?.querySelector('#runBtn')&&!!b?.contentDocument?.querySelector('#runBtn'),local:!!a&&!!b&&a.src.startsWith(location.origin+'/Mobile/')&&b.src.startsWith(location.origin+'/Ngang/')}})()",returnByValue:true});
      offline=resp.result?.value;
      if(offline?.ready&&offline?.frames&&offline?.local)break;
      await nap(100);
    }
    ensure(offline?.ready&&offline?.frames&&offline?.local,
      'Offline Chrome Unified and child apps must render from SW caches: '+JSON.stringify(offline));
    // Negative cross-date safety: stored Cut made on 2026-10-15 must HOLD
    // (without rewriting any wager) when Unified opens on 2026-10-16.
    // Both ledgers are exactly the receipts produced by real trusted Cuts
    // earlier in this same isolated browser test. No forged production data.
    for(let cycle=1;cycle<=5;cycle++){
    const stagedDate='2026-10-16',originalDate='2026-10-15';
    const injectLedger="(()=>{const s=window.localStorage;const wrong={region:'mn',date:'"+stagedDate+"',today:false};"+
      "s.setItem('kts_unified_shared_settings_v1',JSON.stringify(wrong));"+
      "s.setItem('tachDaiMobileSettings',JSON.stringify(wrong));"+
      "s.setItem('tachDaiNgangSettings',JSON.stringify(wrong));"+
      "s.setItem('tachDaiMobileExactOutputLedgerV1',"+JSON.stringify(cutResult.input)+");"+
      "s.setItem('tachDaiNgangExactOutputLedgerV1',"+JSON.stringify(nCut.input)+");"+
      "return {date:wrong.date,mobileStored:!!s.getItem('tachDaiMobileExactOutputLedgerV1'),ngangStored:!!s.getItem('tachDaiNgangExactOutputLedgerV1')}})()";
    const injected=await command('Runtime.evaluate',{expression:injectLedger,returnByValue:true});
    ensure(injected.result?.value?.mobileStored&&injected.result?.value?.ngangStored,
      'Unable to install two synthetic Cut receipts into isolated test storage');
    await command('Page.reload',{ignoreCache:false});
    let holdResult;
    for(let i=0;i<100;i++){
      const check=await command('Runtime.evaluate',{expression:"(()=>{const a=document.getElementById('tachFrame')?.contentDocument,b=document.getElementById('ngangFrame')?.contentDocument,s=window.localStorage;return {shared:document.getElementById('sharedDate')?.value,mobile:{date:a?.getElementById('date')?.value,status:a?.getElementById('status')?.textContent||'',output:a?.getElementById('output')?.value||''},ngang:{date:b?.getElementById('date')?.value,status:b?.getElementById('status')?.textContent||'',output:b?.getElementById('output')?.value||''},mobilePreserved:!!s.getItem('tachDaiMobileExactOutputLedgerV1'),ngangPreserved:!!s.getItem('tachDaiNgangExactOutputLedgerV1')}})()",returnByValue:true});
      holdResult=check.result?.value;
      if(holdResult?.mobile?.status?.includes('HOLD')&&holdResult?.ngang?.status?.includes('HOLD'))break;
      await nap(110);
    }
    ensure(holdResult?.shared===stagedDate&&
      holdResult?.mobile?.date===stagedDate&&holdResult?.ngang?.date===stagedDate&&
      holdResult?.mobile?.status?.includes('HOLD')&&holdResult?.ngang?.status?.includes('HOLD')&&
      holdResult?.mobile?.output===''&&holdResult?.ngang?.output===''&&
      holdResult?.mobilePreserved&&holdResult?.ngangPreserved,
      'Wrong-date saved Cut must HOLD on both modes without wagers: '+JSON.stringify(holdResult).slice(0,1100));
    // Exercise actual Run and Clear UI while incompatible ledger is held.
    const guarded=await command('Runtime.evaluate',{expression:"(()=>{for(const id of ['tachFrame','ngangFrame']){const d=document.getElementById(id).contentDocument;d.getElementById('runBtn').click();d.getElementById('clearBtn').click()}const a=document.getElementById('tachFrame').contentDocument,b=document.getElementById('ngangFrame').contentDocument;return {mobile:a.getElementById('status').textContent,ngang:b.getElementById('status').textContent,mobileOutput:a.getElementById('output').value,ngangOutput:b.getElementById('output').value}})()",returnByValue:true});
    const guardValue=guarded.result?.value||{};
    ensure(guardValue.mobile.includes('HOLD')&&guardValue.ngang.includes('HOLD')&&
      guardValue.mobileOutput===''&&guardValue.ngangOutput==='',
      'Run/Clear during cross-date HOLD must fail closed: '+JSON.stringify(guardValue).slice(0,900));
    const kept=await command('Runtime.evaluate',{expression:"(()=>{const s=window.localStorage;return {mobile:s.getItem('tachDaiMobileExactOutputLedgerV1'),ngang:s.getItem('tachDaiNgangExactOutputLedgerV1')}})()",returnByValue:true});
    ensure(kept.result?.value?.mobile===cutResult.input&&kept.result?.value?.ngang===nCut.input,
      'Run/Clear with wrong date must never destroy either original saved wager ledger');
    const repair="(()=>{const s=window.localStorage,correct={region:'mn',date:'"+originalDate+"',today:false};"+
      "for(const k of ['kts_unified_shared_settings_v1','tachDaiMobileSettings','tachDaiNgangSettings'])s.setItem(k,JSON.stringify(correct));"+
      "return correct.date})()";
    await command('Runtime.evaluate',{expression:repair,returnByValue:true});
    await command('Page.reload',{ignoreCache:false});
    let repaired;
    for(let i=0;i<100;i++){
      const check=await command('Runtime.evaluate',{expression:"(()=>{const a=document.getElementById('tachFrame')?.contentDocument,b=document.getElementById('ngangFrame')?.contentDocument,s=window.localStorage;return {mobile:a?.getElementById('output')?.value||'',ngang:b?.getElementById('output')?.value||'',date:document.getElementById('sharedDate')?.value,mobileDate:a?.getElementById('date')?.value,ngangDate:b?.getElementById('date')?.value,mobileStatus:a?.getElementById('status')?.textContent,ngangStatus:b?.getElementById('status')?.textContent,mobileInput:a?.getElementById('input')?.value?.slice(0,60),ngangInput:b?.getElementById('input')?.value?.slice(0,60),mobileStored:!!s.getItem('tachDaiMobileExactOutputLedgerV1'),ngangStored:!!s.getItem('tachDaiNgangExactOutputLedgerV1')}})()",returnByValue:true});
      repaired=check.result?.value;
      if(repaired?.date===originalDate&&repaired?.mobile===cutResult.output&&repaired?.ngang===nCut.output)break;
      await nap(110);
    }
    ensure(repaired?.date===originalDate&&repaired?.mobile===cutResult.output&&repaired?.ngang===nCut.output,
      'Both saved Cut ledgers must restore exact survivor wagers after returning to source date: '+JSON.stringify(repaired).slice(0,850));
    console.log('ISSUE18_CHROME_HOLD_RECOVERY_CYCLE_PASS '+cycle);
    }
    console.log('ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS');
    // Canonical owner N035: Thursday 2026-10-29 has TWO primary
    // stations tn/ag. Check exact output bytes in real offline Chrome.
    // Prior synthetic Cut receipts have already been validated; clear ONLY
    // this disposable profile's two fake ledgers before testing new wagers.
    const n035Setup=await command('Runtime.evaluate',{expression:"(()=>{const s=window.localStorage;for(const k of ['tachDaiMobileExactOutputLedgerV1','tachDaiNgangExactOutputLedgerV1'])s.removeItem(k);const v={region:'mn',date:'2026-10-29',today:false};for(const k of ['kts_unified_shared_settings_v1','tachDaiMobileSettings','tachDaiNgangSettings'])s.setItem(k,JSON.stringify(v));return {date:v.date,day:new Date('2026-10-29T12:00:00').getDay()}})()",returnByValue:true});
    ensure(n035Setup.result?.value?.day===4,'N035 oracle date must be Thursday for primary stations tn/ag');
    await command('Page.reload',{ignoreCache:false});
    let n035Ready;
    for(let i=0;i<100;i++){
      const q=await command('Runtime.evaluate',{expression:"(()=>{const a=document.getElementById('tachFrame')?.contentDocument,b=document.getElementById('ngangFrame')?.contentDocument;return {shared:document.getElementById('sharedDate')?.value,mobile:a?.getElementById('date')?.value,ngang:b?.getElementById('date')?.value}})()",returnByValue:true});
      n035Ready=q.result?.value;
      if(n035Ready?.shared==='2026-10-29'&&n035Ready?.mobile==='2026-10-29'&&n035Ready?.ngang==='2026-10-29')break;
      await nap(100);
    }
    ensure(n035Ready?.mobile==='2026-10-29'&&n035Ready?.ngang==='2026-10-29',
      'Unified must synchronize N035 Thursday across both apps: '+JSON.stringify(n035Ready));
    const n035Output=await command('Runtime.evaluate',{expression:"(()=>{const r={};for(const [mode,id] of [['mobile','tachFrame'],['ngang','ngangFrame']]){const d=document.getElementById(id).contentDocument;d.getElementById('input').value='2d 52 dx5n';d.getElementById('runBtn').click();r[mode]={output:d.getElementById('output').value,status:d.getElementById('status').textContent,calendar:d.getElementById('schedule')?.textContent}}const input=document.getElementById('dvInput');input.value='2d 52 dx5n';document.getElementById('dvRun').click();r.davong={output:document.getElementById('dvOutput').value,status:document.getElementById('dvStatus').textContent};return r})()",returnByValue:true});
    if(n035Output.exceptionDetails)throw Error('N035_BROWSER_EXCEPTION '+JSON.stringify(n035Output.exceptionDetails).slice(0,800));
    const n035=n035Output.result?.value||{};
    ensure(n035.mobile?.output?.trim()==='tn ag 52 dx5n',
      'N035 Thursday Tách Đài exact two-station singleton DX oracle: '+JSON.stringify(n035).slice(0,1000));
    ensure(n035.ngang?.output?.trim()==='2d 52 dx2.5n\n2d 52 dx2.5n',
      'N035 Thursday Tách Ngang money-halving oracle: '+JSON.stringify(n035).slice(0,1000));
    ensure(n035.davong?.output===''&&/lỗi|sai|không|từ chối|ít nhất|error/i.test(n035.davong?.status||''),
      'N035 singleton DX must be rejected by Đá Vòng: '+JSON.stringify(n035.davong).slice(0,500));
    console.log('ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS');
    console.log('ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS '+JSON.stringify(swScopes));
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
