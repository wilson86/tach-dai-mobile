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
 set('raw','hn 21 b10n');
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
  if(status!==0||result.fail>0||result.pass<18)process.exitCode=1;
 });
});
