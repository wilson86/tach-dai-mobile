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
sessionStorage.setItem('KTS_OFFLINE_QUYT_DRAFT_V1',JSON.stringify({
 market:'mn',customer:'quyt',raw:'hn 21 b10n'
}));
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
 if(window.__qaDeferClipboard){
  window.__qaDeferClipboard=false;
  return new Promise((resolve,reject)=>{window.__qaFinishClipboard=failed=>{
   if(failed)reject(new Error('denied'));else{window.__qaClipboard=String(text);resolve()}
  }});
 }
 window.__qaClipboard=String(text);return Promise.resolve();
}}});
</script>`;
const checks=String.raw`<script>
(async()=>{
const report=[];
const el=id=>document.getElementById(id);
const assert=(name,condition)=>report.push({name,pass:Boolean(condition)});
const set=(id,value,event='input')=>{
 const x=el(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}));
 return x;
};
try{
 assert('main MB PWA rendered',!!el('market')&&!!el('raw')&&!!el('copy'));
 assert('legacy MN draft source preserved',el('raw').value==='hn 21 b10n');
 assert('legacy MN cannot be silently converted into MB',el('market').value==='');
 assert('old market explicit HOLD, no output and no Copy',
  !el('oldMarketNotice').hidden&&el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('HOLD'));
 assert('MN/MT has separate online preview navigation',
  !!document.querySelector('a[href="./mn-mt-review.html"]'));
 assert('old market selection options removed',
  !document.querySelector('option[value="mn"],option[value="mt"]'));
 assert('MB before merge result frames hidden',el('groupedResultsCard').hidden&&el('combinedResultsCard').hidden&&[...document.querySelectorAll('#betSections .bet-section')].every(x=>x.hidden));
 set('market','mb','change');
 assert('explicit MB choice clears legacy notice and computes valid stake',
  el('oldMarketNotice').hidden&&el('copy').disabled===false&&el('after').textContent==='10n');
 assert('MB B-only shows only B',!el('groupedResultsCard').hidden&&!el('combinedResultsCard').hidden&&!document.querySelector('[data-bet-kind="b"]').hidden&&['da','dd','xc','dau','dui'].every(k=>document.querySelector('[data-bet-kind="'+k+'"]').hidden));
 set('raw','hn 21 b15n');
 el('tick').checked=true;el('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('unsafe CEIL/HALF_UP BAO ticket HARD HOLD',
  el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('HOLD_CHENH_LECH_LAM_TRON'));
 assert('all sibling group Copy disabled on money HOLD',
  [...document.querySelectorAll('.section-copy')].every(x=>x.disabled));
 assert('MB money HOLD hides previous result frames',el('groupedResultsCard').hidden&&el('combinedResultsCard').hidden&&[...document.querySelectorAll('#betSections .bet-section')].every(x=>x.hidden));
 set('raw','hn 21 b75n');
 assert('owner 75n→80n preview not eligible for Copy until Router parity',el('after').textContent==='80n'&&el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('HOLD_CHENH_LECH_LAM_TRON'));
 set('raw','hn 21 b10n');
 assert('safe Quyt BAO money still shows preview and allows Copy',
  el('after').textContent==='11n'&&!el('copy').disabled&&el('result').value.includes('21 b11n'));
 el('copy').click();await Promise.resolve();await Promise.resolve();
 assert('full Copy from safe amount uses 11n exactly',
  String(window.__qaClipboard||'').includes('21 b11n'));
 set('raw','hn 21 b10n dd10n');
 assert('DD remains unmultiplied while B scales once',
  el('after').textContent==='21n'&&!el('copy').disabled);
 assert('B+DD shows only populated groups in order',!document.querySelector('[data-bet-kind="b"]').hidden&&!document.querySelector('[data-bet-kind="dd"]').hidden&&['da','xc','dau','dui'].every(k=>document.querySelector('[data-bet-kind="'+k+'"]').hidden)&&[...document.querySelectorAll('#betSections .bet-section:not([hidden])')].map(x=>x.dataset.betKind).join(',')==='b,dd');
 set('raw','hn 21 21 b10n');
 assert('MB repeated number single clause blocks entire ticket',el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('số lặp')&&el('groupedResultsCard').hidden);
 set('raw','hn 21 b10n b20n');
 assert('MB repeated selector without new number HOLD, not silent sum',el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('lặp loại cược')&&el('groupedResultsCard').hidden);
 set('raw','hn 21 b10n dd10n');
 set('customer','hien','change');
 assert('switching off Quyt clears tick and returns original stake',
  el('tick').checked===false&&el('tick').disabled&&el('after').textContent==='20n');
 set('raw','hn 21 b15n');
 assert('non-Quyt unaffected by MB money guard',
  el('after').textContent==='15n'&&!el('copy').disabled);
 set('market','mn','change');
 assert('programmatic unsupported MN selection also rejects atomically',
  el('copy').disabled&&el('result').value===''&&el('status').textContent.includes('HOLD'));
 assert('unsupported market HOLD hides stale MB results',el('groupedResultsCard').hidden&&el('combinedResultsCard').hidden);
 set('market','mb','change');
 set('customer','quyt','change');
 set('raw','hn 21 b55n');
 window.__qaDeferClipboard=true; window.__qaFinishClipboard=null;
 el('copy').click();
 assert('full clipboard request is asynchronous',typeof window.__qaFinishClipboard==='function');
 set('raw','hn 21 b90n');
 window.__qaFinishClipboard(false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('full stale Copy warns instead of claiming success',
  el('status').textContent.includes('CLIPBOARD CÓ THỂ CHỨA TIN CŨ')&&!el('status').textContent.includes('ĐÃ COPY')&&el('result').value.includes('90n'));
 set('raw','hn 21 b55n');
 window.__qaDeferClipboard=true; window.__qaFinishClipboard=null;
 document.querySelector('[data-bet-kind="b"] .section-copy').click();
 assert('group clipboard request is asynchronous',typeof window.__qaFinishClipboard==='function');
 set('raw','hn 21 b90n');
 window.__qaFinishClipboard(true);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('group rejected stale Copy warns, no fallback stale overwrite',
  el('status').textContent.includes('CLIPBOARD CÓ THỂ CHỨA TIN CŨ')&&!el('status').textContent.includes('ĐÃ COPY'));
}catch(error){report.push({name:'EXCEPTION',pass:false,error:String(error)})}
const target=document.createElement('pre');
target.id='quyt-mb-browser-qa';
target.textContent=JSON.stringify({pass:report.filter(x=>x.pass).length,
 fail:report.filter(x=>!x.pass).length,report});
document.body.append(target);
})();
</script>`;
if(!source.includes('</head>')||!source.includes('</body>'))throw Error('HTML_MISSING_CLOSING_TAG');
const rendered=source.replace('</head>',bootstrap+'\n</head>').replace('</body>',checks+'\n</body>');
const server=http.createServer((req,res)=>{
 const requested=new URL(req.url,'http://127.0.0.1');
 if(requested.pathname==='/quyt-pwa/index.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(rendered);
 }else{res.writeHead(404,{'Content-Type':'text/plain'});res.end('NOT_FOUND')}
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
  if(status!==0||result.fail>0||result.pass<15)process.exitCode=1;
 });
});
