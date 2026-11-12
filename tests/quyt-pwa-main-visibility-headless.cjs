'use strict';
// GitHub public standard runner only; no external package, API, customer data, or deploy.
// Serves current PR source on loopback for actual Chromium HTML/DOM event QA.
// Clipboard transport is deliberately MOCKED (native clipboard acceptance remains NOT_RUN).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),child=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sourceFile=path.join(root,'quyt-pwa/index.html');
const original=fs.readFileSync(sourceFile,'utf8');
const injection=`<script>
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:s=>{
 if(window.__qaDeferNextCopy){
  window.__qaDeferNextCopy=false;
  return new Promise(resolve=>{window.__qaResolveCopy=()=>{window.__qaClipboard=String(s);resolve()};});
 }
 window.__qaClipboard=String(s);return Promise.resolve();
}}});
</script>`;
const tests=`<script>
(async()=>{
const output=[], $=id=>document.getElementById(id);
const assert=(name,ok)=>output.push({name,pass:Boolean(ok)});
const set=(id,value,event='input')=>{
 const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}));return x;
};
const select=(id,value)=>set(id,value,'change');
const click=async id=>{ $(id).click();await Promise.resolve();await Promise.resolve();};
const totals=()=>{
 const part=id=>BigInt($(id).textContent.replaceAll('.','').replace('n',''));
 return (part('baoTotal')+part('otherTotal')).toLocaleString('vi-VN')+'n';
};
const acknowledge=()=>{$('ackMoney').checked=true;$('ackMoney').dispatchEvent(new Event('change',{bubbles:true}));};
const hidden=()=>$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden;
try {
 assert('one URL displays MB/MN/MT, date and two summary cells',
  ['mb','mn','mt'].every(id=>[...$('market').options].some(x=>x.value===id))&&
  Boolean($('businessDate')&&$('baoTotal')&&$('otherTotal')&&$('checkMerge')));
 assert('empty source has no Copy, no grouped results',$('copy').disabled&&hidden());
 set('raw','hn 21 b10n dd5n');
 assert('MB computes Bao and unmultiplied DD with exactly two cards',
  $('baoTotal').textContent==='10n'&&$('otherTotal').textContent==='5n'&&totals()==='15n');
 assert('MB result displayed but Copy waits for confirmation',
  !$('groupedResultsCard').hidden&&!$('combinedResultsCard').hidden&&
  $('copy').disabled&&!$('ackMoney').disabled);
 await click('copy');
 assert('cannot Copy before receipt acceptance',!window.__qaClipboard);
 acknowledge();
 assert('MB receipt acceptance enables Copy',!$('copy').disabled);
 await click('copy');
 assert('MB normalized ticket is copied after acknowledgment',
  typeof window.__qaClipboard==='string'&&window.__qaClipboard.includes('21 b10n.')&&
  window.__qaClipboard.includes('21 dd5n.'));
 set('raw','hn 21 21 b10n');
 assert('duplicate within one MB wager clause HOLD with no stale output',
  $('copy').disabled&&hidden()&&$('result').value===''&&$('baoTotal').textContent==='—');
 set('raw','hn 21 b75n');
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('MB rounding disagreement HOLDs all ticket output',totals()==='80n'&&
  $('copy').disabled&&$('result').value===''&&hidden()&&$('ackMoney').disabled&&
  $('status').textContent.includes('HOLD_CHENH_LECH_LAM_TRON'));
 set('raw','hn 21 b10n');
 assert('MB once-only Quýt Bao multiplier gives 11n',totals()==='11n'&&
  $('baoTotal').textContent==='11n'&&$('otherTotal').textContent==='0n'&&!$('ackMoney').disabled);
 acknowledge();
 assert('MB unchanged receiver scope can unlock approved money output',!$('copy').disabled);
 window.__qaDeferNextCopy=true;
 $('copy').click();await Promise.resolve();await Promise.resolve();
 assert('MB delayed clipboard can be detected',typeof window.__qaResolveCopy==='function');
 set('raw','hn 21 b12n');
 assert('changing MB source revokes previous receipt',$('copy').disabled&&!$('ackMoney').checked);
 window.__qaResolveCopy();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('old MB asynchronous Copy cannot be reported as current',
  $('status').textContent.includes('Clipboard CÓ THỂ chứa tin CŨ')&&$('copy').disabled);
 select('market','mn');set('raw','tn 42 43 bl150n');
 assert('MN without date HOLDs and clears previously copied MB result',
  $('copy').disabled&&hidden()&&$('baoTotal').textContent==='—'&&
  $('status').textContent.includes('ngày'));
 select('businessDate','2026-11-12');
 assert('TN correct Thursday displays Bao half-up 320n and other 0n',
  $('baoTotal').textContent==='320n'&&$('otherTotal').textContent==='0n'&&totals()==='320n');
 assert('unapproved MN receiver displays only totals, no ticket, groups, ACK or Copy',
  $('status').textContent.includes('HOLD_RECEIVER_MARKET_UNAPPROVED')&&
  $('copy').disabled&&$('select').disabled&&$('ackMoney').disabled&&
  hidden()&&$('result').value===''&&
  [...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 $('ackMoney').checked=true;$('ackMoney').dispatchEvent(new Event('change',{bubbles:true}));
 await click('copy');
 assert('manually toggling MN acknowledgment cannot bypass receiver HOLD',
  $('copy').disabled&&$('result').value===''&&hidden());
 set('raw','tn 42 b10n dd5n');
 assert('even numerically agreeing MN Quýt amounts remain HOLD',
  $('baoTotal').textContent==='11n'&&$('otherTotal').textContent==='5n'&&
  $('copy').disabled&&$('ackMoney').disabled&&hidden());
 select('businessDate','2026-11-13');
 assert('TN wrong weekday atomically clears summary',
  $('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—'&&
  $('copy').disabled&&$('result').value===''&&hidden());
 select('market','mt');select('businessDate','2026-11-11');set('raw','dn 21 b10n');
 assert('MT correct station/day shows review summary but cannot output wager',
  $('baoTotal').textContent==='11n'&&$('otherTotal').textContent==='0n'&&
  $('status').textContent.includes('HOLD_RECEIVER_MARKET_UNAPPROVED')&&
  $('copy').disabled&&hidden());
 set('raw','21 b10n');
 assert('MT without station HOLD even before receiver approval',
  $('baoTotal').textContent==='—'&&$('copy').disabled&&$('result').value==='');
 select('market','mb');set('raw','hn 21 b10n');
 assert('returning to MB does not inherit old market approval',
  $('ackMoney').checked===false&&$('copy').disabled&&!hidden()&&totals()==='11n');
 assert('localhost test does not install official service worker',
  !navigator.serviceWorker||(await navigator.serviceWorker.getRegistrations()).length===0);
} catch(e){output.push({name:'EXCEPTION',pass:false,error:String(e)});}
const el=document.createElement('pre');el.id='quyt-e2e-qa';
el.textContent=JSON.stringify({pass:output.filter(x=>x.pass).length,fail:output.filter(x=>!x.pass).length,results:output});
document.body.append(el);
})();
</script>`;
const ready=original.replace('</head>',injection+'</head>').replace('</body>',tests+'</body>');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const name=decodeURIComponent(url.pathname).replace(/^\//,'');
 const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data;
 try{data=name==='quyt-pwa/index.html'?ready:fs.readFileSync(file);}
 catch(_){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8');
 res.end(data);
});
server.listen(0,'127.0.0.1',()=>{
 const port=server.address().port;
 const bins=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
 const chrome=process.env.CHROME_BIN||bins.find(x=>fs.existsSync(x));
 if(!chrome){console.error('CHROME_NOT_FOUND: real-browser QA NOT_RUN');server.close();process.exitCode=2;return}
 const cmd=[ '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--disable-background-networking','--disable-extensions',
  '--user-data-dir=/tmp/quyt-review-qa-'+process.pid,'--virtual-time-budget=5000','--dump-dom',
  'http://127.0.0.1:'+port+'/quyt-pwa/index.html' ];
 const proc=child.spawn(chrome,cmd,{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timeout;
 const limit=20*1024*1024;
 proc.stdout.on('data',buf=>{stdout+=buf.toString();if(stdout.length>limit)proc.kill('SIGKILL')});
 proc.stderr.on('data',buf=>{stderr=(stderr+buf.toString()).slice(-5000)});
 timeout=setTimeout(()=>{console.error('CHROME_TIMEOUT');proc.kill('SIGKILL')},50000);
 proc.on('error',e=>{console.error('CHROME_START_FAILED',String(e));clearTimeout(timeout);server.close();process.exitCode=1});
 proc.on('close',status=>{
  clearTimeout(timeout);server.close();
  const open='<pre id="quyt-e2e-qa">',at=stdout.indexOf(open),end=stdout.indexOf('</pre>',at);
  if(at<0||end<0){console.error('NO_BROWSER_QA_RECEIPT',stderr.slice(-1500));process.exitCode=1;return}
  const raw=stdout.slice(at+open.length,end);
  let result;
  try{result=JSON.parse(raw.replaceAll('&quot;','"').replaceAll('&amp;','&'))}
  catch(e){console.error('MALFORMED_BROWSER_RECEIPT',raw.slice(0,300),String(e));process.exitCode=1;return}
  console.log(JSON.stringify({browser:'real Chromium headless / localhost HTML',qa:result},null,2));
  if(status!==0||result.fail!==0||result.pass<15)process.exitCode=1;
 });
});
