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
const cases=[],$=id=>document.getElementById(id);
const assert=(name,yes)=>cases.push({name,pass:Boolean(yes)});
const set=(id,value,event='input')=>{const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}));return x};
const market=id=>set('market',id,'change');
const checkbox=on=>{$('tick').checked=on;$('tick').dispatchEvent(new Event('change',{bubbles:true}))};
const ack=()=>{$('ackMoney').checked=true;$('ackMoney').dispatchEvent(new Event('change',{bubbles:true}))};
const closed=()=> $('copy').disabled&&$('select').disabled&&
 [...document.querySelectorAll('.section-copy')].every(b=>b.disabled)&&
 $('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&$('result').value==='';
const money=id=>{const v=$(id).textContent.replaceAll('.','').replace('n','');return /^[0-9]+$/u.test(v)?BigInt(v):null;};
try{
 assert('one-screen MB/MN/MT with exactly TWO distinct result frames',
  ['mb','mn','mt'].every(id=>[...$('market').options].some(x=>x.value===id))&&
  [...document.querySelectorAll('.total')].length===2&&Boolean($('scaledItems')&&$('unscaledItems')));
 assert('empty source keeps both result frames empty',closed()&&$('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—');

 assert('MB means region, not HN alias', 
   [...$('market').options].some(x=>x.value==='mb'&&x.textContent.trim()==='MB')&&
   ![...$('market').options].some(x=>x.value==='mb'&&x.textContent.includes('/ HN')));
 set('raw','60 b 100 dd 100 dau 100 duoi 100\\n33 61 dx 5n 526 b10n');
 checkbox(true);
 assert('two independent input source lines produce two money frames, 428n multiplied and 15n raw',
  money('baoTotal')===428n&&money('otherTotal')===15n&&
  $('scaledTicket').value==='60 b107n.\\n60 dd107n.\\n60 dau107n.\\n60 dui107n.'&&
  $('unscaledTicket').value.includes('526 b10n.')&&
  $('unscaledTicket').value.includes('33 61 dx5n.')&&
  $('unscaledTicket').value.split('\\n').length===2&&closed());
 assert('DX5n and Bao52610n remain unmultiplied; Copy stays gated while Quýt factor active',
  $('unscaledItems').textContent.includes('DX · 33-61 · 5n (không nhân)')&&
  $('unscaledItems').textContent.includes('BAO/LÔ · 526 · 10n (không nhân)')&&
  $('copyScaled').disabled&&$('copyUnscaled').disabled&&
  $('status').textContent.includes('HOLD_QUYT_V2_MONEY_CONTRACT'));
 set('raw','60 b 100 dd 100 dau 100 duoi 100\\n33 61 dx 5n 526 b10n\\n33 dx5n');
 assert('malformed DX on line 3 clears both frames and all ticket text (no partial financial output)',
  $('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—'&&
  !$('scaledTicket').value&&!$('unscaledTicket').value&&
  $('copyScaled').disabled&&$('copyUnscaled').disabled);
 set('raw','60 b 100 dd 100 dau 100 duoi 100');
 checkbox(true);
 assert('owner screenshot 60 four bare amounts 100n -> 4 x 107n = 428n scaled, 0n raw',
  money('baoTotal')===428n&&money('otherTotal')===0n&&closed()&&
  ['BAO/LÔ · 60','DD · 60','ĐẦU · 60','ĐUÔI · 60'].every(x=>$('scaledItems').textContent.includes(x))&&
  $('scaledItems').textContent.split('→ 107n').length-1===4);
 assert('factorized ticket now contains complete paste-ready source lines in first box',
  $('scaledTicket').value==='60 b107n.\\n60 dd107n.\\n60 dau107n.\\n60 dui107n.'&&
  $('unscaledTicket').value===''&&$('copyScaled').disabled&&$('copyUnscaled').disabled);
 assert('exactly two visible money-result panels and old grouped/copied boxes always hidden',
  [...document.querySelectorAll('.total')].length===2&&
  getComputedStyle($('groupedResultsCard')).display==='none'&&
  getComputedStyle($('combinedResultsCard')).display==='none'&&
  $('groupedResultsCard').inert&&$('combinedResultsCard').inert);
 checkbox(false);
 set('raw','21 b10n. 31 dd15n.');
 assert('MB no HN/station prefix accepted, total unscaled 25n and no injected HN header',
   money('baoTotal')===0n&&money('otherTotal')===25n&&
   $('result').value.length>0&&!$('result').value.startsWith('HN'));
 assert('MB original 2-ticket output present in second textbox and stale copy disabled before ACK',
   $('scaledTicket').value===''&&
   $('unscaledTicket').value==='21 b10n.\\n31 dd15n.'&&
   $('copyUnscaled').disabled&&!$('moneyAcknowledgment').hidden);
 assert('MB no HN remains receipt-gated before Copy',
   $('copy').disabled&&!$('ackMoney').disabled);
 ack();assert('MB no HN can be copied after explicit receipt',!$('copy').disabled);
 assert('new second-box copy is approved only for original MB after acknowledged',
   !$('copyUnscaled').disabled&&$('copyScaled').disabled);
 $('copyUnscaled').click();await Promise.resolve();await Promise.resolve();
 assert('new original MB Copy uses displayed second-box text only',
   window.__qaClipboard===$('unscaledTicket').value);

 set('raw','21 b10n.\\n31 dd15n.');
 assert('changing source invalidates second box Copy immediately',
   $('copyUnscaled').disabled&&!$('ackMoney').checked);

 assert('MB multiline bare ticket parses both lines independently, no HN required',
   money('baoTotal')===0n&&money('otherTotal')===25n&&
   $('status').textContent.includes('ĐÃ GỘP 2 tin')&&!$('ackMoney').checked);
 set('raw','HN 21 b10n.\\n31 dd15n.');
 assert('Mixed optional HN and bare MB lines remain legal and source counted',
   money('otherTotal')===25n&&$('status').textContent.includes('ĐÃ GỘP 2 tin'));
 set('raw','21 b10n.\\n31');
 assert('Incomplete second MB line HOLDs atomically without leftover summary',
   closed()&&$('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—');
 set('raw','hn 21 b10n. 321 b10n. 31 dd15n. 41 dau15n. 51 dui15n.');
 assert('MB UNCHECKED amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,95),
  money('baoTotal')===0n&&money('otherTotal')===65n&&closed()===false);
 assert('unscaled source preview itemization lists all four kinds without ticket copy syntax',
  !$('scaledItems').textContent.includes('· 21 ·')&&$('unscaledItems').textContent.includes('BAO/LÔ'));
 assert('unchecked MB output only opens after explicit receipt', $('copy').disabled&&!$('ackMoney').disabled);
 ack();assert('unchecked MB Copy can unlock as before',!$('copy').disabled);
 checkbox(true);
 assert('MB CHECKED amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,95),
  money('baoTotal')===59n&&money('otherTotal')===10n&&closed());
 assert('scaled frame contains B/DD/Đầu/Đuôi 2-digit itemization',
  $('scaledItems').textContent.includes('BAO/LÔ · 21 · 10n → 11n')&&
  $('scaledItems').textContent.includes('DD · 31 · 15n → 16n')&&
  $('scaledItems').textContent.includes('ĐẦU · 41')&&$('scaledItems').textContent.includes('ĐUÔI · 51'));
 assert('unchanged frame contains 3-digit Bao item even when checked',
  $('unscaledItems').textContent.includes('BAO/LÔ · 321 · 10n (không nhân)'));
 assert('factorized Quýt result may not be copied until receiver confirms policy',
  closed()&&$('ackMoney').disabled&&$('status').textContent.includes('HOLD_QUYT_V2_MONEY_CONTRACT'));
 set('raw','hn 21 b5n. 321 b5n. 31 dd5n. 41 dui5n.');
 assert('MB 5N amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,75),
  money('baoTotal')===15n&&money('otherTotal')===5n&&
  $('scaledItems').textContent.includes('BAO/LÔ · 21 · 5n → 5n')&&closed());
 set('raw','hn 321 b10n. 031 lo5n.');
 assert('MB B3 amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,75),
  money('baoTotal')===0n&&money('otherTotal')===15n&&
  $('unscaledItems').textContent.includes('BAO/LÔ · 031 · 5n')&&closed());
 set('raw','hn 531 dd15n');
 assert('invalid money clears both result text boxes and blocks Copy',
   !$('scaledTicket').value&&!$('unscaledTicket').value&&
   $('copyScaled').disabled&&$('copyUnscaled').disabled);
 assert('three-digit DD is error and both result frames clear',
  closed()&&$('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—'&&
  !$('scaledItems').textContent&&!$('unscaledItems').textContent&&
  $('status').textContent.includes('HOLD_3_CHU_SO_KHONG_HOP_LE'));
 set('raw','hn 641 dau15n');
 assert('three-digit Đầu error',closed()&&$('status').textContent.includes('HOLD_3_CHU_SO_KHONG_HOP_LE'));
 set('raw','hn 751 đuôi15n');
 assert('three-digit Đuôi error',closed()&&$('status').textContent.includes('HOLD_3_CHU_SO_KHONG_HOP_LE'));
 set('raw','hn 21 b10n. 321 b10n. 31 dd15n. 531 dd15n.');
 assert('one invalid DD three-digit clause HOLDS entire mixed bet; never partial results',
  closed()&&$('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—');
 checkbox(false);set('raw','hn 531 dd15n');
 assert('DD three-digit invalid even when Quýt factor is OFF',
  closed()&&$('status').textContent.includes('HOLD_3_CHU_SO_KHONG_HOP_LE'));
 set('raw','hn 21 b10n. 321 b10n.');
 assert('unchecked MB still requires new receipt and has no multiplied bucket',
  money('baoTotal')===0n&&money('otherTotal')===20n&&
  $('copy').disabled&&!$('ackMoney').disabled);
 ack();assert('unchecked MB may Copy after fresh receipt',!$('copy').disabled);
 checkbox(true);
 market('mn');set('raw','tn 21 b10n. 321 b10n. 41 dd15n.');
 assert('MN without date HOLDs and clears both buckets',closed()&&$('baoTotal').textContent==='—');
 set('businessDate','2026-11-12','change');
 assert('MN Thursday acceptance status: '+$('status').textContent.slice(0,100),$('baoTotal').textContent!=='—');
 assert('MN THU amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,85),
  money('baoTotal')===27n&&money('otherTotal')===10n&&closed());
 set('businessDate','2026-11-13','change');
 assert('TN wrong weekday clears both buckets and COPY',closed()&&$('baoTotal').textContent==='—');
 market('mt');set('businessDate','2026-11-11','change');set('raw','dn 21 dd15n.');
 assert('MT WED amounts '+$('baoTotal').textContent+' / '+$('otherTotal').textContent+' '+$('status').textContent.slice(0,85),
  money('baoTotal')===16n&&money('otherTotal')===0n&&closed());
 set('raw','dn 531 dui15n');
 assert('MT 3-digit Đuôi invalid and clears both buckets',
  closed()&&$('baoTotal').textContent==='—'&&$('status').textContent.includes('HOLD_3_CHU_SO_KHONG_HOP_LE'));
 assert('localhost HTTP test does not register production service worker',
  !navigator.serviceWorker||(await navigator.serviceWorker.getRegistrations()).length===0);
}catch(e){cases.push({name:'EXCEPTION',pass:false,error:String(e)})}
const el=document.createElement('pre');el.id='quyt-e2e-qa';
el.textContent=JSON.stringify({pass:cases.filter(x=>x.pass).length,fail:cases.filter(x=>!x.pass).length,results:cases});
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
  if(at<0||end<0){console.error('NO_BROWSER_QA_RECEIPT',JSON.stringify({exitStatus:status,stdoutBytes:stdout.length,stdoutFirst:stdout.slice(0,500),stderrLast:stderr.slice(-4500)}));process.exitCode=1;return}
  const raw=stdout.slice(at+open.length,end);
  let result;
  try{result=JSON.parse(raw.replaceAll('&quot;','"').replaceAll('&amp;','&'))}
  catch(e){console.error('MALFORMED_BROWSER_RECEIPT',raw.slice(0,300),String(e));process.exitCode=1;return}
  console.log(JSON.stringify({browser:'real Chromium headless / localhost HTML',qa:result},null,2));
  if(status!==0||result.fail!==0||result.pass<15)process.exitCode=1;
 });
});
