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
const result=[],$=id=>document.getElementById(id);
const assert=(name,yes)=>result.push({name,pass:Boolean(yes)});
const set=(id,value,event='input')=>{const e=$(id);e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}));return e;};
const sel=(id,value)=>set(id,value,'change');
const acknowledge=()=>{$('ackMoney').checked=true;$('ackMoney').dispatchEvent(new Event('change',{bubbles:true}));};
const closed=()=> $('copy').disabled && $('select').disabled &&
 [...document.querySelectorAll('.section-copy')].every(b=>b.disabled) &&
 $('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&$('result').value==='';
const sum=()=>BigInt($('baoTotal').textContent.replaceAll('.','').replace('n',''))+
 BigInt($('otherTotal').textContent.replaceAll('.','').replace('n',''));
try{
 assert('One page selects all regions and two Quýt accounting cells',
  ['mb','mn','mt'].every(v=>[...$('market').options].some(x=>x.value===v))&&
  Boolean($('baoTotal')&&$('otherTotal')&&$('otherLabel')&&$('businessDate')));
 assert('No source means no accepted ticket',closed());
 set('raw','hn 21 b10n dd15n dau10n dui10n');
 assert('Unchecked Quýt is original money, including DD/DAU/DUI',
  $('baoTotal').textContent==='10n'&&$('otherTotal').textContent==='35n'&&sum()===45n);
 assert('Unchecked MB Copy requires receipt acknowledgment',$('copy').disabled&&!$('ackMoney').disabled);
 acknowledge();
 assert('Unchecked MB authorized receipt allows Copy',!$('copy').disabled);
 $('copy').click();await Promise.resolve();await Promise.resolve();
 assert('Unchecked MB Copy is source-equivalent and unscaled',
  window.__qaClipboard?.includes('dd15n.')&&window.__qaClipboard?.includes('dau10n dui10n.'));
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('Quýt V2 MB scales Bao+DD+Đầu+Đuôi only after canonical grouping',
  $('baoTotal').textContent==='11n'&&$('otherTotal').textContent==='38n'&&sum()===49n);
 assert('New MB Quýt money policy HOLDs output/ack before receiver oracle',
  closed()&&$('ackMoney').disabled&&$('status').textContent.includes('HOLD_QUYT_V2_MONEY_CONTRACT'));
 acknowledge();$('copy').click();await Promise.resolve();
 assert('Changing disabled acknowledgement cannot unlock MB Quýt v2 Copy',closed());
 set('raw','hn 21 dd5n dau5n dui5n');
 assert('5n rounds to 5n under Quýt v2 (no extra unit and no second factor)',
  $('baoTotal').textContent==='0n'&&$('otherTotal').textContent==='15n'&&closed());
 set('raw','hn 21 dd15n dau15n dui15n');
 assert('All three Quýt categories at 15n become 16n each',
  $('otherTotal').textContent==='48n'&&closed());
 set('raw','hn 21 22 da10n. 33 dd15n');
 assert('DA unscaled 10n and DD 15n becomes 16n, accounting total 26n',
  $('baoTotal').textContent==='0n'&&$('otherTotal').textContent==='26n'&&closed());
 set('raw','hn 21 đui10n. 22 đuôi10n. 23 dui10n. 24 duoi10n.');
 assert('All Đui/Đuôi spelling aliases scale consistently to 44n',
  $('otherTotal').textContent==='44n'&&closed());
 set('raw','hn 21 b10n. 321 b10n. 31 dd15n. 531 dd15n. 41 dau15n. 641 dau15n. 51 dui15n. 751 dui15n.');
 assert('Quýt mixed 2/3-digit B+DD+DAU+DUI factor only two-digit, sum conserved',
  $('baoTotal').textContent==='21n'&&$('otherTotal').textContent==='93n'&&sum()===114n&&closed());
 assert('Two cards show 3-digit original-stake exemption',
  $('baoLabel').textContent.includes('3 SỐ GỐC')&&$('otherLabel').textContent.includes('3 SỐ / ĐÁ GỐC'));
 set('raw','hn 321 b10n. 531 dd15n. 641 dau15n. 751 dui15n.');
 assert('Only three-digit wagers keep original amount with Quýt checked',
  $('baoTotal').textContent==='10n'&&$('otherTotal').textContent==='45n'&&sum()===55n&&closed());
 set('raw','hn 21 21 dd10n');
 assert('Single clause duplicate number still HOLDS instead of double counting',
  $('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—'&&closed());
 set('raw','hn 21 dd10n'); $('tick').checked=false;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('Disabling Quýt factor restores base DD money and requires fresh receipt',
  $('otherTotal').textContent==='10n'&&!$('ackMoney').disabled&&$('copy').disabled);
 acknowledge();
 assert('Unscaled MB may Copy but never promotes new Quýt v2 factor',!$('copy').disabled);
 window.__qaDeferNextCopy=true;$('copy').click();await Promise.resolve();await Promise.resolve();
 assert('Unscaled MB pending clipboard operation is detected',typeof window.__qaResolveCopy==='function');
 set('raw','hn 21 dd11n');window.__qaResolveCopy();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('Stale clipboard warns on changed source',$('status').textContent.includes('Clipboard CÓ THỂ')&&$('copy').disabled);
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 sel('market','mn');set('raw','tn 42 bl10n dd15n dau10n dui10n');
 assert('MN missing date fully HOLDs',closed()&&$('baoTotal').textContent==='—');
 sel('businessDate','2026-11-12');
 assert('MN correct Thursday previews all four Quýt groups with two cells',
   $('baoTotal').textContent==='11n'&&$('otherTotal').textContent==='38n'&&sum()===49n);
 assert('MN Quýt remains no-output even with numerically matching rounded money',
   closed()&&$('ackMoney').disabled&&$('status').textContent.includes('HOLD_RECEIVER_MARKET_UNAPPROVED'));
 sel('businessDate','2026-11-13');
 assert('TN invalid Friday removes all review amounts and Copy',
   $('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—'&&closed());
 sel('market','mt');sel('businessDate','2026-11-11');set('raw','dn 21 dd15n');
 assert('MT DD also scales to 16n for review but cannot be copied',
   $('otherTotal').textContent==='16n'&&closed());
 sel('market','mb');set('raw','hn 21 dd15n');
 assert('Switch back to MB does not bypass Quýt V2 hold',
   $('otherTotal').textContent==='16n'&&closed());
 assert('Fresh localhost Chromium never installs production PWA worker',
  !navigator.serviceWorker||(await navigator.serviceWorker.getRegistrations()).length===0);
}catch(e){result.push({name:'EXCEPTION',pass:false,error:String(e)});}
const el=document.createElement('pre');el.id='quyt-e2e-qa';
el.textContent=JSON.stringify({pass:result.filter(x=>x.pass).length,fail:result.filter(x=>!x.pass).length,results:result});
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
