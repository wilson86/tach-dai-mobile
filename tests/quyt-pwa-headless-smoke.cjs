'use strict';
// GitHub public standard runner only; no external package, API, customer data, or deploy.
// Serves current PR source on loopback for actual Chromium HTML/DOM event QA.
// Clipboard transport is deliberately MOCKED (native clipboard acceptance remains NOT_RUN).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),child=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sourceFile=path.join(root,'quyt-pwa/mn-mt-review.html');
const original=fs.readFileSync(sourceFile,'utf8');
const injection=`<script>
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>{window.__qaClipboard=String(s)}}});
</script>`;
const tests=`<script>
(async()=>{
const output=[]; const $=id=>document.getElementById(id);
const assert=(name,ok)=>output.push({name,pass:Boolean(ok)});
const set=(id,value,event='input')=>{const x=$(id);x.value=value;x.dispatchEvent(new Event(event,{bubbles:true}));return x};
const select=(id,value)=>set(id,value,'change');
const click=async id=>{ $(id).click();await Promise.resolve();await Promise.resolve();};
const frame=kind=>document.querySelector('[data-bet-kind="'+kind+'"]');
const pane=(kind,cls)=>frame(kind).querySelector(cls);
try{
 assert('page rendered',Boolean($('raw')&&$('businessDate')&&frame('b')));
 assert('MN scope visible',$('regionScope').style.display==='block');
 set('raw','mn dn 21 b10n');
 assert('missing draw date HOLD',$('copy').disabled);
 select('businessDate','2026-11-04');
 assert('valid date enables Copy',!$('copy').disabled && $('after').textContent==='10n');
 await click('copy');
 assert('full Copy actually fired',window.__qaClipboard==='MN 2026-11-04\\ndn 21 b10n.');
 await pane('b','.section-copy').click();await Promise.resolve();await Promise.resolve();
 assert('B group Copy fired',window.__qaClipboard==='MN 2026-11-04\\ndn 21 b10n.');
 $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
 assert('Quyt tick scales once',$('after').textContent==='11n'&&pane('b','.section-text').value.includes('dn 21 b11n.'));
 set('raw','mn dn 21 b10n\\nmn ct 21 b10n');
 assert('stations separate and subtotal conserved',$('after').textContent==='22n'&&pane('b','.section-total').textContent==='22n');
 set('raw','mn dn hn 21 b10n');
 assert('nested HN always HOLD',$('copy').disabled&&$('result').value===''&&$('status').textContent.includes('HN nằm sau'));
 set('raw','mn dn 21 21 b10n');
 assert('same clause double stake HOLD',$('copy').disabled&&$('status').textContent.includes('số lặp'));
 set('raw','mn dn 21 b10n\\n\\nmn ct 21 b10n\\n\\nmn ct 21 xx10n');
 assert('error physical line 5',$('copy').disabled&&$('status').textContent.includes('tin 5'));
 set('raw','mn dn 21 b10n\\nmn 2d 21 b10n');
 assert('2d and all sibling Copy HOLD',$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 set('raw','mn dn 21 xc10n');
 assert('XC and all sibling Copy HOLD',$('copy').disabled&&[...document.querySelectorAll('.section-copy')].every(b=>b.disabled));
 set('raw','[11/4/2026 6:06 PM] Cô Quýt: mn dn 21 b10n');
 assert('Telegram US month/day accepted',$('after').textContent==='11n'&&!$('copy').disabled);
 select('businessDate','2026-11-05');
 assert('change date invalidates stale Copy',$('copy').disabled);
 select('market','mt');
 select('businessDate','2026-11-04');
 set('raw','mt dn 21 b10n');
 assert('MT valid station',$('after').textContent==='11n'&&!$('copy').disabled);
 select('market','mn');
 assert('change region invalidates stale Copy',$('copy').disabled);
 assert('no service worker from review page',!document.documentElement.outerHTML.includes('serviceWorker.register'));
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
 try{data=name==='quyt-pwa/mn-mt-review.html'?ready:fs.readFileSync(file);}
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
  'http://127.0.0.1:'+port+'/quyt-pwa/mn-mt-review.html' ];
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
