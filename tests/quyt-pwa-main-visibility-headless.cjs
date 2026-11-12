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
const output=[]; const $=id=>document.getElementById(id);
const assert=(name,ok)=>output.push({name,pass:Boolean(ok)});
const display=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/gu,'.')+'n';
const sumTotals=()=>{
 const integer=id=>BigInt($(id).textContent.replaceAll('.','').replace('n',''));
 return display((integer('baoTotal')+integer('otherTotal')).toString());
};
const evaluated=()=>OfflineKTS.merge($('raw').value,{
 market:$('market').value,businessDate:$('businessDate').value,
 customer:$('customer').value,tick:$('tick').checked,rate:$('rate').value,
 duplicateConfirmed:true,confirmMissingDaN:true
});
const sourceTotal=()=>display(evaluated().sourceTotal);
const beforeTotal=()=>display(evaluated().original);

const set=(id,value,event='input')=>{const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}));return x};
const select=(id,value)=>set(id,value,'change');
const click=async id=>{ $(id).click();await Promise.resolve();await Promise.resolve();};
const frame=kind=>document.querySelector('[data-bet-kind="'+kind+'"]');
const pane=(kind,cls)=>frame(kind).querySelector(cls);
const acknowledge=()=>{ $('ackMoney').checked=true;$('ackMoney').dispatchEvent(new Event('change',{bubbles:true})); };
try{
 assert('single MB/MN/MT page rendered',Boolean($('raw')&&$('businessDate')&&frame('b')));
 assert('all region options present and MB default',[...$('market').options].map(o=>o.value).join(',')==='mb,mn,mt'&&$('market').value==='mb');
 assert('MB hides station-date selector',$('regionScope').style.display==='none');
 assert('before any wager result panes remain hidden',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden);
 set('raw','hn 21 b10n dd5n');
 assert('MB valid ticket renders B and DD only',!frame('b').hidden&&!frame('dd').hidden&&['da','xc','dau','dui'].every(k=>frame(k).hidden)&&sumTotals()==='15n');
 assert('MB requires explicit receipt acknowledgment before Copy',$('copy').disabled&&!$('ackMoney').disabled);
 set('raw','hn 21 21 b10n');
 assert('MB duplicate number HOLD and clears all groups',$('copy').disabled&&$('result').value===''&&$('groupedResultsCard').hidden);
 select('market','mn');
 assert('MN scope appears after region switch',$('regionScope').style.display==='block'&&$('copy').disabled);
 set('raw','');
 assert('MN scope visible',$('regionScope').style.display==='block');
 assert('before merging neither group nor full-result card exists visually',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&[...document.querySelectorAll('#betSections .bet-section')].every(x=>x.hidden));
 set('raw','mn dn 21 b10n');
 assert('missing draw date HOLD',$('copy').disabled);
 assert('missing date never displays empty group boxes',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden);
 select('businessDate','2026-11-04');
 assert('valid date shows preview but Copy locked',$('copy').disabled && sumTotals()==='10n');
 assert('B-only preview has exactly one visible group and no blank placeholders',!$('groupedResultsCard').hidden&&!$('combinedResultsCard').hidden&&!frame('b').hidden&&['da','dd','xc','dau','dui'].every(x=>frame(x).hidden));
 assert('source/exposure/output independent',sourceTotal()==='10n'&&beforeTotal()==='10n'&&sumTotals()==='10n');
 await click('copy');
 assert('cannot Copy without acknowledging',!window.__qaClipboard);
 acknowledge();
 assert('explicit acknowledgment enables Copy',!$('copy').disabled);
 await click('copy');
 assert('full Copy actually fired',window.__qaClipboard==='dn 21 b10n.');
 await pane('b','.section-copy').click();await Promise.resolve();await Promise.resolve();
 assert('B group Copy fired',window.__qaClipboard==='dn 21 b10n.');
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('Quyt tick scales once and resets approval',sumTotals()==='11n'&&pane('b','.section-text').value.includes('dn 21 b11n.')&&$('copy').disabled&&$('factorReceipt').textContent.includes('ĐÃ NHÂN BAO/LÔ'));
 set('raw','mn dn 21 b10n\\nmn ct 21 b10n');
 assert('stations separate and subtotal conserved',sumTotals()==='22n'&&pane('b','.section-total').textContent==='22n'&&$('copy').disabled);
 set('raw','mn dn hn 21 b10n');
 assert('nested HN always HOLD',$('copy').disabled&&$('result').value===''&&$('status').textContent.includes('HN nằm sau'));
 assert('invalid source atomically hides all previous grouped UI',$('groupedResultsCard').hidden&&$('combinedResultsCard').hidden&&[...document.querySelectorAll('#betSections .bet-section')].every(x=>x.hidden));
 set('raw','mn dn 21 21 b10n');
 assert('same clause double stake HOLD',$('copy').disabled&&$('status').textContent.includes('số lặp'));
 set('raw','mn dn 21 b10n\\n\\nmn ct 21 b10n\\n\\nmn ct 21 xx10n');
 assert('error physical line 5',$('copy').disabled&&$('status').textContent.includes('tin 5'));
 set('raw','21 b10n');
 assert('no station and no topology HOLD',$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 set('raw','2d 52 b10n');
 assert('2d expands 2 active stations, source not double-counted',$('copy').disabled&&sourceTotal()==='10n'&&beforeTotal()==='20n'&&sumTotals()==='22n'&&$('result').value.includes('dn 52 b11n.')&&$('result').value.includes('ct 52 b11n.'));
 acknowledge();
 await click('copy');
 assert('2d Copy has no MN/MT label',window.__qaClipboard.includes('ct 52 b11n.')&&!window.__qaClipboard.includes('MN')&&!window.__qaClipboard.includes('MT'));
 set('raw','3đ 52 b10n');
 assert('3đ expands 3 scheduled stations',sumTotals()==='33n'&&$('result').value.includes('st 52 b11n.'));
 set('raw','2d. 52. 852. B10n.');
 assert('legacy compact 3-digit accepted',sumTotals()==='44n'&&$('result').value.includes('852 b11n.'));
 set('raw','mn dn 21 xc10n');
 assert('XC and all sibling Copy HOLD',$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 assert('XC HOLD never displays false XC group or prior approved group',$('groupedResultsCard').hidden&&frame('xc').hidden&&frame('b').hidden);
 set('raw','[11/4/2026 6:06 PM] Cô Quýt: mn dn 21 b10n');
 assert('Telegram US month/day accepted, Copy requires new acknowledgment',sumTotals()==='11n'&&$('copy').disabled);
 select('businessDate','2026-11-05');
 assert('change date invalidates stale Copy',$('copy').disabled);
 select('market','mt');
 select('businessDate','2026-11-04');
 set('raw','dn 21 b10n');
 assert('MT valid station without prefix',sumTotals()==='11n'&&$('copy').disabled);
 set('raw','3d 21 b10n');
 assert('MT 3d missing third station HOLD',$('copy').disabled);
 set('raw','2đ 21 b10n');
 assert('MT 2đ has 2 scheduled stations',sumTotals()==='22n'&&$('result').value.includes('kh 21 b11n.'));
 select('market','mn');
 assert('change region recomputes 2đ for MN, always resets Copy',$('copy').disabled&&$('result').value.includes('ct 21 b11n.')&&!$('result').value.includes('kh 21 b11n.'));
 acknowledge();assert('re-acknowledge new region and date',!$('copy').disabled);
 set('raw','dn 52 b15n');
 assert('HOLD mismatch: no final text and no Copy',$('copy').disabled&&$('result').value===''&&sumTotals()==='16n'&&$('roundingAudit').textContent.includes('17n')&&$('status').textContent.includes('HOLD_CHENH_LECH_LAM_TRON'));
 set('raw','dn 52 b75n');
 assert('75n uses owner HALF_UP preview 80n but never Copy before receiving Router parity',sumTotals()==='80n'&&$('copy').disabled&&$('result').value===''&&$('status').textContent.includes('HOLD_CHENH_LECH_LAM_TRON'));
 set('raw','dn 52 b15n');
 assert('CEIL mismatch always resets last approval',!$('ackMoney').checked);
 acknowledge();assert('cannot bypass unresolved money policy by checking box',$('copy').disabled&&$('ackMoney').disabled&&[...document.querySelectorAll('.section-copy')].every(x=>x.disabled));
 set('raw','dn 52 b15n dd5.2n');
 assert('CEIL comparison never applies to DD even on HOLD',sumTotals()==='21n'&&$('roundingAudit').textContent.includes('22n')&&$('status').textContent.includes('HOLD'));
 set('raw','dn 52 xc10n');
 assert('HOLD disables acknowledgment and every Copy',$('ackMoney').disabled&&$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 set('raw','dn 21 b10n');
 assert('safe money preview re-enables acknowledgment only',$('copy').disabled&&!$('ackMoney').disabled);
 acknowledge();
 assert('safe money Copy permitted after new acknowledgment',!$('copy').disabled);
 window.__qaDeferNextCopy=true;$('copy').click();
 assert('asynchronous clipboard pending',typeof window.__qaResolveCopy==='function');
 set('raw','dn 21 b12n');
 assert('changed source disables old approval while copy pending',$('copy').disabled&&!$('ackMoney').checked);
 window.__qaResolveCopy();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('stale async clipboard never reports success',$('status').textContent.includes('Clipboard CÓ THỂ chứa tin CŨ')&&$('copy').disabled&&window.__qaClipboard==='dn 21 b11n.');
 acknowledge();
 assert('fresh 12n message can be acknowledged independently',!$('copy').disabled);
 window.__qaDeferNextCopy=true;pane('b','.section-copy').click();
 assert('group clipboard asynchronous operation pending',typeof window.__qaResolveCopy==='function');
 set('raw','dn 21 b13n');
 window.__qaResolveCopy();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert('stale group clipboard also warns and cannot claim success',$('status').textContent.includes('Clipboard CÓ THỂ chứa tin CŨ')&&$('copy').disabled&&window.__qaClipboard==='dn 21 b13n.');
 set('raw','2d 52 b10n\\n--//-----//--\\n3d 43 b10n');
 assert('approved divider lines skipped in real Chrome',sourceTotal()==='20n'&&beforeTotal()==='50n'&&sumTotals()==='55n'&&$('copy').disabled);
 set('raw','2d 52 b10n\\n--//123//--');
 assert('mixed number divider-like line remains atomic HOLD',$('copy').disabled&&$('ackMoney').disabled&&$('result').value==='');
 set('raw','----\\n////');
 assert('all-dividers HOLD and never unlock Copy',$('copy').disabled&&$('ackMoney').disabled&&$('status').textContent.includes('EMPTY_AFTER_PREPROCESS'));
 set('raw','2d 52 b10n b20n');
 assert('repeated selector without fresh numbers is full HOLD',$('copy').disabled&&$('ackMoney').disabled&&$('result').value===''&&$('status').textContent.includes('lặp loại cược'));
 set('raw','2d 52 b10n. 52 b2n');
 assert('fresh explicit number group still merges before single multiplier',sourceTotal()==='12n'&&beforeTotal()==='24n'&&sumTotals()==='26n'&&$('copy').disabled);
 set('raw','2d 52 b10n dd5n');
 assert('distinct B and DD on one number group remain valid',sourceTotal()==='15n'&&sumTotals()==='32n'&&!$('ackMoney').disabled);
 assert('B+DD displays only populated groups in required order',!frame('b').hidden&&!frame('dd').hidden&&['da','xc','dau','dui'].every(x=>frame(x).hidden)&&[...document.querySelectorAll('#betSections .bet-section:not([hidden])')].map(x=>x.dataset.betKind).join(',')==='b,dd');
 select('market','mn'); select('businessDate','2026-11-12');
 set('raw','tn 42 43 bl150n');
 assert('TN is recognized Thursday with HALF_UP 320n split as Bao 320 plus other 0',
   sumTotals()==='320n'&&$('baoTotal').textContent==='320n'&&$('otherTotal').textContent==='0n');
 assert('150n must HOLD Copy due to CEIL-vs-HALF_UP 322n receiver mismatch',
   $('copy').disabled&&$('result').value===''&&$('roundingAudit').textContent.includes('322n'));
 select('businessDate','2026-11-13');
 assert('TN on wrong weekday HOLD', $('copy').disabled&&$('baoTotal').textContent==='—'&&$('otherTotal').textContent==='—');
 assert('no service worker registration on fresh review origin',!navigator.serviceWorker || (await navigator.serviceWorker.getRegistrations()).length===0);
}catch(e){output.push({name:'EXCEPTION',pass:false,error:String(e)})}
const el=document.createElement('pre');el.id='quyt-e2e-qa';el.textContent=JSON.stringify({pass:output.filter(x=>x.pass).length,fail:output.filter(x=>!x.pass).length,results:output});
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
