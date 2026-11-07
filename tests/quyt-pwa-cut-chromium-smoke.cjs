'use strict';
// Real Chromium DOM smoke in ephemeral public Ubuntu runner; only synthetic ticket text.
// No APIs, live Telegram, real customer source, backend, write, or deployment.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const bootstrap=String.raw`<script>
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:s=>{window.__qaClipboard=String(s);return Promise.resolve()}}});
</script>`;
const checks=String.raw`<script>
(async()=>{
const report=[],$=id=>document.getElementById(id);
const assert=(name,pass)=>report.push({name,pass:Boolean(pass)});
const section=kind=>document.querySelector('[data-bet-kind="'+kind+'"]');
const visible=()=>[...document.querySelectorAll('#betSections .bet-section:not([hidden])')].map(x=>x.dataset.betKind).join(',');
const set=(id,value,event='input')=>{const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}))};
try{
 assert('original 3-region selector preserved',[...$('market').options].map(x=>x.value).join(',')==='mb,mn,mt');
 assert('original customer selector preserved',$('customer').value==='quyt');
 assert('empty source leaves group card hidden',$('groupedResultsCard').hidden);
 assert('empty source leaves full Copy card hidden',$('combinedResultsCard').hidden);
 assert('no placeholder panels visible',[...document.querySelectorAll('#betSections .bet-section')].every(x=>x.hidden));
 assert('global Copy disabled on empty',$('copy').disabled);
 assert('manual check-merge exists',$('checkMerge')&&$('checkMerge').getBoundingClientRect().width>0);
 $('checkMerge').click();
 assert('manual check-merge stays HOLD for blank source',$('copy').disabled);
 // Operator's exact screenshot: whole-n amount directly after wager selector.
 const originalTick=$('tick').checked;
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 set('raw','40 22 33 61 77 b300');
 $('checkMerge').click();
 assert('bare b300 = five 300n original bets',$('before').textContent==='1500n');
 assert('Quyt scales BAO once and rounds each number',$('after').textContent==='1600n'&&$('result').value.includes('40 22 33 61 77 b320n.'));
 assert('original screenshot raw remains immutable',$('raw').value==='40 22 33 61 77 b300');
 assert('no obsolete missing-n confirmation',$('confirmMissingDaN')===null);
 set('raw','40 22 33 61 77 b300n');
 assert('b300n and b300 money parity',$('before').textContent==='1500n'&&$('after').textContent==='1600n'&&$('result').value.includes('b320n'));
 $('tick').checked=originalTick;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 set('raw','hn 21 b10n');
 $('checkMerge').click();
 assert('manual check-merge preserves B-only money',$('after').textContent==='10n');

 assert('B-only shows exactly B',visible()==='b');
 assert('B-only reveals group card and full Copy card',!$('groupedResultsCard').hidden&&!$('combinedResultsCard').hidden);
 assert('B-only number unchanged',$('after').textContent==='10n'&&$('result').value.includes('21 b10n'));
 set('raw','hn 21 b10n dd5n');
 assert('B+DD reveals exactly B,DD',visible()==='b,dd');
 assert('B+DD money preserved',$('after').textContent==='15n');
 set('raw','hn 21 22 da20n');
 assert('DA only reveals DA pane',visible()==='da');
 set('raw','hn 21 xc10n');
 assert('XC HOLD clears all group and full cards',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&visible()==='');
 assert('XC HOLD disables all Copy',$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(x=>x.disabled));
 set('raw','hn 21 b10n');
 set('market','mn','change');
 assert('switching to unsupported region clears prior groups',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&$('copy').disabled);
 set('market','mb','change');
 assert('switching back to MB restores valid result',visible()==='b');
 set('raw','');
 assert('clearing input hides all groups and copy',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&[...document.querySelectorAll('.bet-section')].every(x=>x.hidden));
 // Financial UI race: rejected clipboard writes must not copy a new ticket through legacy fallback.
 set('raw','hn 21 b10n dd5n');
 const safeWrite=navigator.clipboard.writeText, safeExec=document.execCommand;
 let rejectedWrite, legacyCalls=0;
 document.execCommand=()=>{legacyCalls++;return true};
 navigator.clipboard.writeText=()=>new Promise((_ok,no)=>{rejectedWrite=no});
 section('b').querySelector('.section-copy').click();
 assert('group Copy has a pending clipboard write',typeof rejectedWrite==='function');
 set('raw','hn 22 b20n dd5n');
 rejectedWrite(new Error('DENIED'));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('stale group Copy never falls back to a different ticket',legacyCalls===0);
 assert('stale group Copy keeps HOLD warning',$('status').textContent.includes('HOLD'));
 set('raw','hn 21 b10n dd5n');
 rejectedWrite=undefined;
 $('copy').click();
 assert('combined Copy has a pending clipboard write',typeof rejectedWrite==='function');
 set('raw','hn 22 b20n dd5n');
 rejectedWrite(new Error('DENIED'));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('stale combined Copy never falls back to a different ticket',legacyCalls===0);
 assert('stale combined Copy keeps HOLD warning',$('status').textContent.includes('HOLD'));
 navigator.clipboard.writeText=safeWrite;document.execCommand=safeExec;
 // A pending normal Copy must exclude a concurrent Cut/second Copy, or clipboard order is unknowable.
 set('raw','hn 21 b10n dd5n');
 let finishCopy, writeCount=0;
 navigator.clipboard.writeText=()=>{writeCount++;return new Promise(ok=>{finishCopy=ok})};
 section('b').querySelector('.section-copy').click();
 assert('group Copy has unresolved clipboard receipt',typeof finishCopy==='function');
 assert('group Copy pending disables Cut UI',section('b').querySelector('.section-cut').disabled);
 assert('group Copy pending disables global Copy UI',$('copy').disabled);
 finishCopy();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('group Copy completion restores Cut UI',!section('b').querySelector('.section-cut').disabled);
 $('copy').click();
 assert('combined Copy has unresolved clipboard receipt',writeCount===2);
 assert('combined Copy pending disables group Cut UI',section('b').querySelector('.section-cut').disabled);
 finishCopy();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 navigator.clipboard.writeText=safeWrite;

 set('raw','hn 21 b10n dd5n. 21 22 da20n.');
 assert('six group and select Cut controls',document.querySelectorAll('.section-cut').length===6&&document.querySelectorAll('.section-cut-selected').length===6);
 assert('before Cut total 35n',$('after').textContent==='35n');
 const orig=$('raw').value;
 section('b').querySelector('.section-cut').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('after Cắt B removes B live',$('after').textContent==='25n'&&!$('result').value.includes(' b10n')&&$('result').value.includes('dd5n'));
 assert('original source unchanged',$('raw').value===orig);
 assert('Undo restores full amount',$('undoQuytCut').disabled===false);
 $('undoQuytCut').click();
 assert('Undo source-amount restore',$('after').textContent==='35n'&&$('result').value.includes('b10n'));
 // Pending Copy of previous ticket blocks consent to a different batch.
 let completePendingCopy;
 const pendingCopyWrite=navigator.clipboard.writeText;
 navigator.clipboard.writeText=()=>new Promise(resolve=>{completePendingCopy=resolve});
 section('b').querySelector('.section-copy').click();
 assert('previous batch has pending Copy',typeof completePendingCopy==='function');
 set('raw','hn 21 22 b10n dd5n');
 let unsafeConfirms=0;const savedPendingConfirm=window.confirm;
 window.confirm=()=>{unsafeConfirms++;return true};
 $('startNewBatch').click();window.confirm=savedPendingConfirm;
 assert('new batch is HOLD until the old Copy completes',
  unsafeConfirms===0&&$('copy').disabled&&!$('startNewBatch').hidden&&
  $('status').textContent.includes('HOLD_COPY_BUSY'));
 completePendingCopy();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 navigator.clipboard.writeText=pendingCopyWrite;
 set('raw','hn 21 22 b10n dd5n');
 assert('edit after earlier Cut forces HOLD and manual reset',$('copy').disabled&&$('result').value===''&&!$('startNewBatch').hidden);
 $('checkMerge').click();
 assert('manual check-merge cannot bypass prior Cut replay HOLD',$('copy').disabled&&$('result').value===''&&!$('startNewBatch').hidden);
 const originalConfirm=window.confirm;window.confirm=()=>true;$('startNewBatch').click();window.confirm=originalConfirm;
 assert('new independent source after explicit confirmation provides two B rows',section('b').querySelectorAll('.cut-row-check').length===2);
 const first=section('b').querySelector('.cut-row-check');first.checked=true;first.dispatchEvent(new Event('change',{bubbles:true}));
 assert('selected Cut enabled',!section('b').querySelector('.section-cut-selected').disabled);
 section('b').querySelector('.section-cut-selected').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('selected Cut keeps other B number and DD',$('after').textContent==='20n'&&$('result').value.includes('22 b10n')&&$('result').value.includes('dd5n'));
 assert('cut ledger persists in session',String(sessionStorage.getItem('KTS_QUYT_SCOPED_CUT_V1')).includes('b|21'));
 $('undoQuytCut').click();
 assert('undo selected restores 25n',$('after').textContent==='30n');
 // Force storage quota failure at Undo after a separate synthetic Cut.
 // The UI must be HOLD, not leave previously-Cut numbers Copy-able.
 section('b').querySelector('.section-cut').click();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('storage-failure Undo test has active Cut',!$('undoQuytCut').disabled);
 const originalStorageSet=Storage.prototype.setItem;
 Storage.prototype.setItem=function(key,value){
  if(key==='KTS_QUYT_SCOPED_CUT_V1')throw Error('SIMULATED_UNDO_QUOTA');
  return originalStorageSet.call(this,key,value);
 };
 try{$('undoQuytCut').click()}finally{Storage.prototype.setItem=originalStorageSet}
 assert('Undo persistence failure locks all Copy and clears results',
  $('copy').disabled&&$('result').value===''&&$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&
  [...document.querySelectorAll('.section-copy,.section-cut,.section-cut-selected')].every(b=>b.disabled)&&
  $('status').textContent.includes('HOLD_UNDO_SAVE_FAILED'));
}catch(e){report.push({name:'EXCEPTION',pass:false,error:String(e)})}
const result=document.createElement('pre');result.id='quyt-mb-browser-qa';
result.textContent=JSON.stringify({pass:report.filter(x=>x.pass).length,fail:report.filter(x=>!x.pass).length,report});
document.body.append(result);
})();
</script>`;
if(!source.includes('</head>')||!source.includes('</body>'))throw Error('HTML_MISSING_CLOSING_TAG');
const rendered=source.replace('</head>',bootstrap+'\n</head>').replace('</body>',checks+'\n</body>');
const server=http.createServer((req,res)=>{
 const requested=new URL(req.url,'http://127.0.0.1');
 if(requested.pathname==='/quyt-pwa/index.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(rendered);
 }else if(requested.pathname==='/quyt-pwa/quyt-cut-ledger.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,'quyt-pwa/quyt-cut-ledger.js'),'utf8'));}
 else{res.writeHead(404,{'Content-Type':'text/plain'});res.end('NOT_FOUND')}
});
server.listen(0,'127.0.0.1',()=>{
 const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
 if(!chrome){console.error('CHROME_NOT_FOUND');server.close();process.exitCode=2;return}
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',
  '--disable-background-networking','--disable-extensions',
  '--user-data-dir=/tmp/quyt-mb-chrome-'+process.pid,'--virtual-time-budget=4000','--dump-dom',
  'http://127.0.0.1:'+server.address().port+'/quyt-pwa/index.html'];
 const proc=cp.spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 const timeout=setTimeout(()=>{console.error('CHROME_TIMEOUT');proc.kill('SIGKILL')},45000);
 proc.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>20*1024*1024)proc.kill('SIGKILL')});
 proc.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2500)});
 proc.on('error',error=>{clearTimeout(timeout);server.close();console.error('CHROME_START_FAILED',String(error));process.exitCode=1});
 proc.on('close',status=>{
  clearTimeout(timeout);server.close();
  const start='<pre id="quyt-mb-browser-qa">',at=stdout.indexOf(start),end=stdout.indexOf('</pre>',at);
  if(at<0||end<0){console.error('BROWSER_RECEIPT_MISSING',stderr);process.exitCode=1;return}
  let result;
  try{result=JSON.parse(stdout.slice(at+start.length,end).replaceAll('&quot;','"').replaceAll('&amp;','&'))}
  catch(e){console.error('BROWSER_RECEIPT_PARSE_FAILED',String(e));process.exitCode=1;return}
  console.log(JSON.stringify({browser:'actual Chromium headless, localhost, synthetic data',result},null,2));
  if(status!==0||result.fail>0||result.pass<29)process.exitCode=1;
 });
});
