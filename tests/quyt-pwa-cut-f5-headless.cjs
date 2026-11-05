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
const report=[],$=id=>document.getElementById(id),frame=k=>document.querySelector('[data-bet-kind="'+k+'"]');
const assert=(name,ok)=>report.push({name,pass:Boolean(ok)});
const set=(id,value,event='input')=>{const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}))};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
try{
 if(sessionStorage.getItem('QA_QUYT_CUT_REFRESH_STAGE')==='after'){
  const first=JSON.parse(sessionStorage.getItem('QA_QUYT_CUT_FIRST_PHASE')||'null');
  assert('first-phase receipt available',Array.isArray(first));
  if(Array.isArray(first))report.push(...first);
  assert('F5 restored raw source',$('raw').value==='hn 21 b10n dd5n');
  assert('F5 restored Quyt multiplier toggle',$('tick').checked===true);
  assert('F5 keeps B cut, only DD remains',$('result').value.includes('dd5n')&&!$('result').value.includes('b11n')&&$('after').textContent==='5n'&&frame('b').hidden);
  set('raw','hn 21 b12n dd5n');
  assert('editing after Cut must HOLD and disable all Copy',$('copy').disabled&&$('result').value===''&&$('status').textContent.includes('HOLD'));
  assert('editing after Cut requires explicit new-batch acknowledgement',!$('startNewBatch').hidden);
  const oldConfirm=window.confirm;window.confirm=()=>false;$('startNewBatch').click();window.confirm=oldConfirm;
  assert('rejecting new-batch confirmation retains financial HOLD',$('copy').disabled&&$('result').value===''&&!$('startNewBatch').hidden);
  set('raw','hn 21 b10n dd5n');
  assert('restoring exact source retains prior B cut',$('after').textContent==='5n'&&!$('result').value.includes('b11n'));
  set('rate','1.050');
  assert('rate change after Cut must HOLD',$('copy').disabled&&$('result').value==='');
  set('rate','1.067');
  assert('restoring exact factor retains prior B cut',$('after').textContent==='5n'&&!$('result').value.includes('b11n'));
  assert('F5 still allows Undo',!$('undoQuytCut').disabled);
  $('undoQuytCut').click();
  assert('Undo after F5 returns full 16n',$('after').textContent==='16n'&&$('result').value.includes('b11n'));
  sessionStorage.removeItem('QA_QUYT_CUT_REFRESH_STAGE');
  sessionStorage.removeItem('QA_QUYT_CUT_FIRST_PHASE');
 }else{
  set('raw','hn 21 b10n dd5n');
  $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
  assert('Quyt tick base is 16n',$('after').textContent==='16n');
  const orig=$('raw').value;
  const write=navigator.clipboard.writeText;
  navigator.clipboard.writeText=()=>Promise.reject(new Error('DENIED'));
  frame('b').querySelector('.section-cut').click();await flush();
  assert('clipboard denied means no cut',$('after').textContent==='16n'&&$('result').value.includes('b11n')&&$('raw').value===orig);
  let resolveCut;
  navigator.clipboard.writeText=()=>new Promise(done=>{resolveCut=done});
  frame('b').querySelector('.section-cut').click();
  assert('async Cut in progress',typeof resolveCut==='function');
  set('raw','hn 21 b12n dd5n');
  resolveCut();await flush();
  assert('stale async Cut preserves changed ticket',$('result').value.includes('b13n')&&$('after').textContent==='18n');
  navigator.clipboard.writeText=write;
  set('raw','hn 21 b10n dd5n');
  frame('b').querySelector('.section-cut').click();await flush();
  assert('normal Cut B after clipboard works',$('after').textContent==='5n'&&!$('result').value.includes('b11n'));
  assert('local ledger persisted for reload',sessionStorage.getItem('KTS_QUYT_SCOPED_CUT_V1').includes('b|21'));
  sessionStorage.setItem('QA_QUYT_CUT_FIRST_PHASE',JSON.stringify(report));
  sessionStorage.setItem('QA_QUYT_CUT_REFRESH_STAGE','after');
  window.location.reload();return;
 }
}catch(e){report.push({name:'EXCEPTION',pass:false,error:String(e)})}
const out=document.createElement('pre');out.id='quyt-mb-browser-qa';
out.textContent=JSON.stringify({pass:report.filter(x=>x.pass).length,fail:report.filter(x=>!x.pass).length,report});document.body.append(out);
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
  if(status!==0||result.fail>0||result.pass<18)process.exitCode=1;
 });
});
