'use strict';
// Issue18 - no installs, no Telegram, no real wagers, no production changes.
// Must run locally on Windows with built-in Node WebSocket (Node 22+).
const fs=require('node:fs'), path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const URL='http://127.0.0.1:8772/app/', ORIGIN='http://127.0.0.1:8772';
const PIN={KTS:'NOT_VERIFIED',Mobile:'NOT_VERIFIED',Ngang:'NOT_VERIFIED'};
const nap=ms=>new Promise(r=>setTimeout(r,ms));
function checkRoot(x){
 assert.equal(process.platform,'win32','Only Windows C: acceptance is authorized');
 const root=path.resolve('C:\\KTS-QA\\issue18-quyt-r6-8772');
 assert.equal(path.resolve(x||'').toLowerCase(),root.toLowerCase(),'C-only scope');
 assert.equal(fs.realpathSync(root).toLowerCase(),root.toLowerCase(),'no junctions');
 return root;
}
function getChrome(){
 const roots=[process.env.CHROME_PATH,
  path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA||'C:\\Users\\none','Google/Chrome/Application/chrome.exe')];
 const p=roots.find(x=>x&&path.win32.isAbsolute(x)&&
  path.win32.parse(x).root.toLowerCase()==='c:\\'&&fs.existsSync(x));
 assert.ok(p,'Chrome executable not found on C:');
 return p;
}

function verifySourceManifest(root){
 const manifestPath=path.join(root,'SOURCE_MANIFEST.json');
 assert.ok(fs.existsSync(manifestPath),'SOURCE_MANIFEST missing; cannot accept exact HEAD');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 for(const k of ['KTS','Mobile','Ngang']){
  const expected=manifest?.sources?.[k];
  assert.match(String(expected||''),/^[0-9a-f]{40}$/i,'Invalid source SHA '+k);
  const cwd=path.join(root,'source-'+k);
  assert.ok(fs.existsSync(cwd),'Missing checkout '+k);
  assert.equal(fs.realpathSync(cwd).toLowerCase(),cwd.toLowerCase(),'Junction/symlink refused '+k);
  const git=cp.spawnSync('git',['-C',cwd,'rev-parse','HEAD'],{
    encoding:'utf8',shell:false,windowsHide:true,timeout:5000});
  assert.equal(git.status,0,'Failed to verify Git HEAD for '+k);
  assert.equal(git.stdout.trim().toLowerCase(),expected.toLowerCase(),'Source drift '+k);
  PIN[k]=expected;
 }
 return manifest;
}
const sha256=buf=>crypto.createHash('sha256').update(buf).digest('hex');
async function verifyStageAssets(root){
 const receipts={};
 for(const [k,prefix] of [['Mobile',''],['Ngang','ngang/']]){
  for(const file of ['quyt-bao-review.js','quyt-bao-review-ui.js']){
   const source=fs.readFileSync(path.join(root,'source-'+k,file));
   const request=await fetch(ORIGIN+'/'+prefix+file,
      {cache:'no-store',signal:AbortSignal.timeout(5000)});
   assert.equal(request.status,200,'Missing staged '+k+'/'+file);
   const observed=sha256(Buffer.from(await request.arrayBuffer()));
   assert.equal(observed,sha256(source),'Staged JS does not match Git checkout '+k+'/'+file);
   receipts[k+'/'+file]=observed;
  }
 }
 return receipts;
}

function readLedger(raw){
 const p='[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n';
 return raw?.startsWith(p)?JSON.parse(raw.slice(p.length)):null;
}
async function run(root){
 const sourceManifest=verifySourceManifest(root);
 const dir=fs.mkdtempSync(path.join(root,'chrome-quyt-r6-acceptance-')),profile=path.join(dir,'profile');
 fs.mkdirSync(profile);
 const result={scope:'HEADLESS_REAL_CHROME_NOT_CHROME_GUEST',source:PIN,preview:URL,
 chrome:'NOT_RUN',android:'NOT_RUN',production:'NO_GO',cost_usd:0,checks:[],screenshots:[]};
 const save=()=>fs.writeFileSync(path.join(dir,'RESULT.json'),JSON.stringify(result,null,2));
 let child,ws;const pending=new Map();let sequence=0;
 try{
  assert.equal(typeof WebSocket,'function','Node 22+ built-in WebSocket required; no new packages');
  const response=await fetch(URL,{signal:AbortSignal.timeout(5000),cache:'no-store'});
  assert.equal(response.status,200,'Quyt-r6 preview :8772 unavailable');
  result.source_manifest=sourceManifest;
  result.sha_bound_js=await verifyStageAssets(root);
  assert.ok((await response.text()).includes('id="ngangFrame"'),'Wrong preview');
  const meta=await fetch(ORIGIN+'/app/version.json').then(r=>r.json());
  assert.ok(JSON.stringify(meta).includes('1.0.33'),'Expected Unified 1.0.33');
  result.unifiedVersion=meta;
  child=cp.spawn(getChrome(),['--headless=new','--disable-gpu',
   '--no-first-run','--no-default-browser-check','--disable-background-networking',
   '--disable-extensions','--remote-debugging-address=127.0.0.1',
   '--remote-debugging-port=0','--user-data-dir='+profile,
   '--proxy-server=direct://','--proxy-bypass-list=*',
   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
   'about:blank'],{shell:false,stdio:'ignore'});
  let port=0;
  for(let i=0;i<150;i++){
   if(child.exitCode!==null)break;
   const f=path.join(profile,'DevToolsActivePort');
   if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split(/\r?\n/)[0]);if(port>0)break}
   await nap(100);
  }
  assert.ok(port,'Chrome DevTools did not start');
  const info=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());
  result.chromeVersion=info.Browser;
  assert.ok(/Chrome\//.test(result.chromeVersion),'Google Chrome browser required');
  const t=await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(URL),{method:'PUT'}).then(r=>r.json());
  assert.ok(t.webSocketDebuggerUrl,'No Chrome CDP target');
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true})});
  ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data),p=pending.get(m.id);
   if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
   if(m.error)p.bad(Error(m.error.message));else p.ok(m.result);
  }catch(_){}});
  const cdp=(method,params={})=>new Promise((ok,bad)=>{
   const id=++sequence,timer=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout '+method))},12000);
   pending.set(id,{ok,bad,timer});ws.send(JSON.stringify({id,method,params}));
  });
  const js=async(expr,promise=false)=>{
   const r=await cdp('Runtime.evaluate',{expression:expr,awaitPromise:promise,returnByValue:true,userGesture:true});
   if(r.exceptionDetails)throw Error('Chrome JS '+r.exceptionDetails.text);
   return r.result?.value;
  };
  const wait=async(expr,pred,label)=>{
   let last;for(let i=0;i<90;i++){
    try{last=await js(expr,true);if(pred(last))return last}catch(_){}
    await nap(150)
   }throw Error('TIMEOUT '+label+' '+JSON.stringify(last).slice(0,850))
  };
  const snap=async(name)=>{
   const r=await cdp('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));
   result.screenshots.push(name+'.png');
  };
  const log=(label,value)=>{result.checks.push({label,value});save()};
  await cdp('Page.enable');await cdp('Runtime.enable');
  const frameReady="(()=>{const a=document.querySelector('#tachFrame'),b=document.querySelector('#ngangFrame');return !!a?.contentDocument?.querySelector('#runBtn')&&!!b?.contentDocument?.querySelector('#runBtn')&&a.src.startsWith(location.origin+'/')&&b.src.startsWith(location.origin+'/')})()";
  await wait(frameReady,x=>x===true,'same-origin frames');
  const versions=await js("(()=>({u:document.body.innerText.includes('1.0.33'),a:document.querySelector('#tachFrame').contentDocument.body.innerText.includes('2.0.40'),b:document.querySelector('#ngangFrame').contentDocument.body.innerText.includes('1.0.39')}))()");
  assert.ok(versions.u&&versions.a&&versions.b,'Different source versions '+JSON.stringify(versions));
  // Check the *executed iframe code*, not only HTTP version metadata:
  // unchanged version labels can coexist with a stale Service Worker asset.
  const runtimeRules=await js("(()=>{const a=document.querySelector('#tachFrame').contentWindow,b=document.querySelector('#ngangFrame').contentWindow;return {mobileSha:a.KTS_BUSINESS_ENGINE?.ENGINE_SHA256,ngangSha:b.KTS_BUSINESS_ENGINE?.ENGINE_SHA256,mobileAlias:a.normalizeInput?.('hn 43 b10n 98 dui100n'),ngangAlias:b.normalizeInput?.('hn 43 b10n 98 dui100n')}})()");
  const engine='0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487';
  assert.equal(runtimeRules.mobileSha,engine,'Mobile iframe generated engine SHA');
  assert.equal(runtimeRules.ngangSha,engine,'Ngang iframe generated engine SHA');
  assert.equal(runtimeRules.mobileAlias,'mb 43 b10n 98 duoi100n','Mobile runtime alias');
  assert.equal(runtimeRules.ngangAlias,'mb 43 b10n 98 duoi100n','Ngang runtime alias');
  log('RUNTIME_ENGINE_AND_ALIAS',runtimeRules);
  await wait("(async()=>{const r=await navigator.serviceWorker.getRegistrations();return r.filter(x=>x.active).map(x=>new URL(x.scope).pathname)})()",
   x=>Array.isArray(x)&&['/','/app/','/ngang/'].every(t=>x.includes(t)),'3 SW scopes');
  await cdp('Page.reload',{ignoreCache:false});
  await wait(frameReady,x=>x===true,'frames after SW reload');
  const sw=await js("(async()=>({controller:navigator.serviceWorker.controller?.scriptURL,cacheKeys:await caches.keys()}))()",true);
  assert.ok(sw.cacheKeys.some(key=>key.includes('clean-r2-quyt-r11')),'Chrome stale Quyt SW cache, r6 required');
  assert.ok(sw.controller?.endsWith('/app/sw.js'),'Chrome must be controlled by Unified app SW');
  log('REAL_CHROME_SW',sw);
  await js("(()=>{const r=document.querySelector('#sharedRegion'),d=document.querySelector('#sharedDate'),t=document.querySelector('#sharedToday');t.checked=false;r.value='mb';r.dispatchEvent(new Event('change',{bubbles:true}));d.value='2026-10-29';d.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await wait("(()=>[document.querySelector('#tachFrame').contentDocument.querySelector('#region')?.value,document.querySelector('#ngangFrame').contentDocument.querySelector('#region')?.value])()",
   x=>x?.[0]==='mb'&&x?.[1]==='mb','shared MB setting');
  async function mode(name,raw){
   const params=JSON.stringify({name,raw});
   return js("(async()=>{const q="+params+";document.querySelector('.tab[data-mode=\"'+q.name+'\"]').click();await new Promise(ok=>setTimeout(ok,140));const d=q.name==='davong'?document:document.querySelector('#'+(q.name==='tach'?'tachFrame':'ngangFrame')).contentDocument;const i=d.querySelector('#'+(q.name==='davong'?'dvInput':'input'));i.value=q.raw;i.dispatchEvent(new Event('input',{bubbles:true}));d.querySelector('#'+(q.name==='davong'?'dvRun':'runBtn')).click();await new Promise(ok=>setTimeout(ok,140));return {input:i.value,output:d.querySelector('#'+(q.name==='davong'?'dvOutput':'output')).value,status:d.querySelector('#'+(q.name==='davong'?'dvStatus':'status')).textContent,rows:q.name==='davong'?d.querySelectorAll('.dv-checkbox-row').length:d.querySelectorAll('#resultGroups .result-group-row').length}})()",true);
  }
  // User's corrected oracle: repeat wagers aggregate first and CEIL once.
  // This exercises the actual installed Chrome JS and mounted Quyt control;
  // no bets are transmitted. Separate operator Guest/Android gates still apply.
  for(const name of ['tach','ngang','davong']){
    const inspected=await js(`(async()=>{
      const mode=${JSON.stringify(name)};
      const doc=mode==='davong'?document:document.querySelector('#'+
        (mode==='tach'?'tachFrame':'ngangFrame')).contentDocument;
      const win=doc.defaultView,source='43 b1n\\n43 b1n';
      const input=doc.getElementById(mode==='davong'?'dvInput':'input');
      const toggle=doc.getElementById('ktsQuytCheckbox');
      const rate=doc.getElementById('ktsQuytRate');
      const panel=doc.getElementById('ktsQuytPreparedPanel');
      if(!input||!toggle||!rate||!panel||!win.KTSQuytBaoReview||!win.KTSCleanAggregate)
        return {missing:true};
      const opts={customer:'Quýt',inputStage:'CANONICAL_UNADJUSTED_RESULT',
        sourceText:source,cleanCore:win.KTSCleanAggregate,region:'mb',
        repeatDecision:'keep_all',omitRegion:true};
      const defaultResult=win.KTSQuytBaoReview.prepareGrouped('43 b2n',{...opts,rate:'1,067'});
      const changedResult=win.KTSQuytBaoReview.prepareGrouped('43 b2n',{...opts,rate:'1,05'});
      const repeated100=win.KTSQuytBaoReview.prepareGrouped('43 b200n',{...opts,
        sourceText:'43 b100n 43 b100n',rate:'1,067'});
      let confirmHeld=false;
      try{win.KTSQuytBaoReview.prepareGrouped('43 b2n',{...opts,
        repeatDecision:'ask_operator'})}
      catch(e){confirmHeld=String(e).includes('DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED')}
      let driftHeld=false;
      try{win.KTSQuytBaoReview.prepareGrouped('43 b3n',opts)}
      catch(e){driftHeld=String(e).includes('SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD')}
      rate.value='4';rate.dispatchEvent(new Event('input',{bubbles:true}));
      const invalidStatus=panel.querySelector('[role=status]')?.textContent||'';
      input.value='mb 43 b1n';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      return {initialRate:'1,067',default:defaultResult.preview,
        changed:changedResult.preview,big:repeated100.preview,
        confirmHeld,driftHeld,invalidHOLD:invalidStatus.includes('HOLD'),
        sourceDisarmed:!toggle.checked,noSend:defaultResult.forwardAuthorized===false,
        stage:defaultResult.stage};
    })()`,true);
    assert.ok(!inspected.missing,'Quyt code/checkbox absent '+name);
    assert.equal(inspected.default,'43 b3n','two wagers GROUP then factor 1.067 '+name);
    assert.equal(inspected.changed,'43 b3n','two wagers GROUP then factor 1.05 '+name);
    assert.equal(inspected.big,'43 b214n','two b100 GROUP to b200 then ×1.067 '+name);
    assert.ok(inspected.confirmHeld,'operator confirmation required '+name);
    assert.ok(inspected.driftHeld,'stale/altered money HOLD '+name);
    assert.ok(inspected.invalidHOLD,'invalid factor must HOLD '+name);
    assert.ok(inspected.sourceDisarmed,'new source disarms Quyt '+name);
    assert.ok(inspected.noSend&&inspected.stage==='PREPARED_PREVIEW_ONLY','NO_SEND '+name);
    log('QUYT_AGGREGATE_THEN_RATE_'+name.toUpperCase(),inspected);
    await snap('quyt-group-first-'+name);
  }
  // Review-only smoke of the exact NEW feature, using synthetic 52-clause
  // text. Do not put a customer's original message into any public source.
  // 19+19 plus 7+7 exact blocks = 52 intentionally separate placed clauses.
  const blockA=Array.from({length:19},(_,i)=>
    String(10+i).padStart(2,'0')+' b'+(i%4+1)+'n').join(' ');
  const blockB=Array.from({length:7},(_,i)=>
    String(40+i).padStart(2,'0')+' dd'+(i%3+2)+'n').join(' ');
  const synthetic=[blockA,blockA,blockB,blockB].join(' ');
  for(const m of ['tach','ngang','davong']){
    const encoded=JSON.stringify({mode:m,raw:synthetic});
    const check=await js(`(async()=>{const {mode,raw}=${encoded}; 
      const d=mode==='davong'?document:document.querySelector('#'+(mode==='tach'?'tachFrame':'ngangFrame')).contentDocument;
      const w=d.defaultView,input=d.getElementById(mode==='davong'?'dvInput':'input');
      const panel=d.getElementById('ktsCleanReviewPanel');
      if(!panel||!w.KTSCleanAggregate)return {missingPanel:true};
      const candidate=w.KTSCleanAggregate.preview(raw,{region:'mb',repeatDecision:'keep_all',omitRegion:true});
      input.value=raw;input.dispatchEvent(new Event('input',{bubbles:true}));
      panel.querySelector('button').click();
      await new Promise(r=>setTimeout(r,60));
      const before={text:panel.querySelector('[role="status"]').textContent,preview:panel.querySelector('textarea').value};
      const keep=[...panel.querySelectorAll('button')].find(b=>b.textContent.includes('GIỮ ĐỦ'));
      if(!keep)return {missingKeep:true,before,candidate};
      keep.click();
      await new Promise(r=>setTimeout(r,60));
      const after={text:panel.querySelector('[role="status"]').textContent,preview:panel.querySelector('textarea').value};
      const clear=d.getElementById(mode==='davong'?'dvClear':'clearBtn');
      clear.click();
      await new Promise(r=>setTimeout(r,60));
      const cleared={text:panel.querySelector('[role="status"]').textContent,preview:panel.querySelector('textarea').value,input:input.value};
      return {candidate:{count:candidate.rawClauses,kept:candidate.keptClauses,removed:candidate.removedClauses,blocks:candidate.repeated,
           total:candidate.total,rawTotal:candidate.rawTotal,forwardAuthorized:candidate.forwardAuthorized},
           before,after,cleared};
    })()`,true);
    assert.equal(check.candidate?.count,52,'must parse all 52 synthetic clauses: '+m);
    assert.equal(check.candidate?.kept,52,'must keep all 52 original clauses: '+m);
    assert.equal(check.candidate?.removed,0,'must never auto delete intentional repeat: '+m);
    assert.deepEqual(check.candidate?.blocks.map(x=>x.length),[19,7],'two identical repeat block lengths: '+m);
    assert.equal(check.candidate?.total,check.candidate?.rawTotal,'money point conservation: '+m);
    assert.equal(check.candidate?.forwardAuthorized,false,'never auto send: '+m);
    assert.equal(check.before?.preview,'','duplicate requires operator confirmation: '+m);
    assert.ok(check.before?.text?.includes('HOLD'),'repeated message must HOLD: '+m);
    assert.equal(check.after?.preview?.trim().length>0,true,'KEEP ALL should show review only: '+m);
    assert.ok(check.after?.text?.includes('Giữ: 52')&&check.after?.text?.includes('Loại: 0'),'count visible: '+m);
    assert.equal(check.cleared?.preview,'','Clear must invalidate stale cleaning output: '+m);
    assert.equal(check.cleared?.input,'','Clear must clear input: '+m);
    log('CLEAN_AGGREGATE_'+m.toUpperCase(),{count:52,kept:52,removed:0,blocks:[19,7],total:check.candidate.total,
      clearInvalidated:true,readOnly:true,forwardAuthorized:false});
    await snap('clean-aggregate-'+m);
  }
  const good='hn 21 34 47 b10n 58 dui12n 63 74 b5n\nmb 12 dd5n b3n 48 b7n';
  const twice='hn 21 34 b10n\nhn 21 34 b10n';
  const mixed='mb 12 b5n\nmb 34 unrecognized5n';
  for(const m of ['tach','ngang','davong']){
   const a=await mode(m,good);
   assert.ok(a.output?.trim()&&!/lỗi|error|không nhận/i.test(a.status||''),'valid HN/DUI '+m+': '+JSON.stringify(a));
   log('VALID_HN_DUI_'+m,{rows:a.rows,status:a.status,outputLines:a.output.split('\n').length});
   await snap('syntax-'+m);
   const b=await mode(m,twice);
   assert.ok(b.output?.trim()&&b.output.split('\n').filter(Boolean).length>=2,'repeat physical lines '+m);
   log('DUPLICATE_PHYSICAL_LINE_'+m,{rows:b.rows,outputLines:b.output.split('\n').length});
   const c=await mode(m,mixed);
   assert.ok(!c.output||c.output.startsWith('PHÁT HIỆN TIN SAI:'),'atomic invalid '+m);
   assert.equal(c.rows,0,'no partial money row when invalid '+m);
   log('MIXED_INVALID_'+m,{rows:c.rows,status:c.status});
  }
  // Real browser Cut through a trusted CDP pointer, not HTMLElement.click().
  await cdp('Browser.grantPermissions',{origin:ORIGIN,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  const A='2d 52 68 dx5n',B='2d 12 34 dx2n';
  async function startA(){
   const r=await mode('ngang',A),rows=r.output.split(/\r?\n/).filter(Boolean);
   assert.equal(rows.length,2,'Ngang generates exactly 2 output rows');
   assert.ok(rows.every(x=>x.includes('dx2.5n')),'Ngang each result is dx2.5n');
  }
  async function cutA(){
   const c=await js("(()=>{const f=document.querySelector('#ngangFrame'),d=f.contentDocument;d.querySelector('#selectAllOutputBtn').click();const b=d.querySelector('#cutBtn');b.scrollIntoView({block:'center'});const x=f.getBoundingClientRect(),y=b.getBoundingClientRect();return {x:x.x+y.x+y.width/2,y:x.y+y.y+y.height/2,disabled:b.disabled}})()");
   assert.ok(!c.disabled&&Number.isFinite(c.x)&&Number.isFinite(c.y),'Cut button inaccessible');
   await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:c.x,y:c.y,button:'left',clickCount:1});
   await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:c.x,y:c.y,button:'left',clickCount:1});
   return wait("(()=>{const d=document.querySelector('#ngangFrame').contentDocument;return {raw:localStorage.getItem('tachDaiNgangExactOutputLedgerV1'),output:d.querySelector('#output').value,status:d.querySelector('#status').textContent}})()",
    x=>readLedger(x?.raw)?.rows?.length===0&&x.output==='', 'Cut ALL 2/2 ledger');
  }
  await startA();
  let x=await cutA();
  assert.equal(readLedger(x.raw).origin,A);
  log('CUT_ALL_BEFORE_F5',{rows:readLedger(x.raw).rows.length,status:x.status});
  await snap('cut-before-f5');
  await cdp('Page.reload',{ignoreCache:false});
  x=await wait("(()=>{const d=document.querySelector('#ngangFrame')?.contentDocument;return {mode:document.querySelector('.tab.active')?.dataset.mode,raw:localStorage.getItem('tachDaiNgangExactOutputLedgerV1'),output:d?.querySelector('#output')?.value||'',status:d?.querySelector('#status')?.textContent||''}})()",
    x=>x?.mode==='ngang'&&readLedger(x.raw)?.rows?.length===0&&x.status.includes('Cắt'),'Cut A F5');
  assert.equal(x.output,'','Cut results must not resurrect');
  log('CUT_ALL_AFTER_F5',{rows:0,mode:x.mode,status:x.status});
  await snap('cut-after-f5');
  await js("document.querySelector('#ngangFrame').contentDocument.querySelector('#undoBtn').click()");
  const u=await wait("(()=>{const d=document.querySelector('#ngangFrame')?.contentDocument;return {input:d?.querySelector('#input')?.value||'',output:d?.querySelector('#output')?.value||''}})()",
    x=>x?.input===A&&x.output.split(/\r?\n/).filter(Boolean).length===2,'Undo Cut A after F5');
  assert.ok(u.output.split(/\r?\n/).every(x=>x.includes('dx2.5n')),'Undo money unchanged');
  log('UNDO_AFTER_F5',{originalRestored:true,output:u.output});
  await snap('undo-after-f5');
  await startA();await cutA();
  await js("(()=>{document.querySelector('.tab[data-mode=\"tach\"]').click();const i=document.querySelector('#tachFrame').contentDocument.querySelector('#input');i.value='2d 12 34 dx2n';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await cdp('Page.reload',{ignoreCache:false});
  const cross=await wait("(()=>{const t=document.querySelector('#tachFrame')?.contentDocument,n=document.querySelector('#ngangFrame')?.contentDocument;return {B:t?.querySelector('#input')?.value||'',nOutput:n?.querySelector('#output')?.value||'',nLedger:localStorage.getItem('tachDaiNgangExactOutputLedgerV1')}})()",
   x=>x?.B===B&&readLedger(x.nLedger)?.rows?.length===0,'Cut A plus independent B F5');
  assert.equal(cross.nOutput,'','Old Cut A must stay removed');
  log('CUT_A_NEW_B_F5',{draftPersisted:true,cutALedgerRows:0});
  await snap('cut-a-new-b-f5');
  result.chrome='PASS_SCOPED_HEADLESS_CHROME';save();
 }catch(e){
  result.chrome='FAIL_OR_BLOCKED';
  result.error=String(e.stack||e);
  save();
  process.exitCode=2;
 }finally{
  try{ws?.close()}catch(_){}
  if(child&&child.exitCode===null)try{child.kill()}catch(_){}
  result.cleanup={status:'KEEP_UNIQUE_EVIDENCE',files_removed:0,space_recovered_mb:0,
   preserved:['RESULT.json','profile',...result.screenshots]};
  save();
  console.log('ISSUE18_CHROME_ACCEPTANCE_REPORT '+path.join(dir,'RESULT.json'));
 }
}
if(require.main===module){
 try{const root=checkRoot(process.argv[2]);run(root).catch(e=>{console.error(e.stack);process.exitCode=2})}
 catch(e){console.error('PRECHECK_BLOCKED '+e.stack);process.exitCode=2}
}
module.exports={checkRoot,readLedger,PIN,URL};
