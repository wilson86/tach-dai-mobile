'use strict';
// WILSON86 Quyt main Cut -> bucket recompute -> Undo -> F5.
// Synthetic bets only, localhost Chromium. Never touches Telegram/Router.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const checks=String.raw`<script>
(()=>{
 const report=[],$=id=>document.getElementById(id);
 const assert=(name,ok)=>report.push({name,pass:Boolean(ok)});
 const set=(id,value,event='input')=>{const e=$(id);e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}))};
 const amount=id=>$(id).textContent;
 const input='60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n';
 const stage=sessionStorage.getItem('QA_QUYT_LIVE_CUT_STAGE');
 try{
  assert('only two result money panels',document.querySelectorAll('.total').length===2);
  assert('no repeated raw-message Cut card',!document.getElementById('sourceCutCard')&&!document.getElementById('cutSourceList'));
  assert('no individual wager checkbox lists',!document.querySelector('.bucket-cut-entry')&&!document.querySelector('.bucket-cut-check'));
  assert('both full-bucket Cut buttons exist',!!$('cutSelectedScaled')&&!!$('cutSelectedUnscaled'));
  if(stage==='after'){
   const before=JSON.parse(sessionStorage.getItem('QA_QUYT_LIVE_CUT_FIRST')||'null');
   assert('pre-F5 evidence exists',Array.isArray(before));if(Array.isArray(before))report.push(...before);
   assert('F5 exact original source retained',$('raw').value===input);
   assert('F5 multiplier selection preserved',$('tick').checked);
   assert('F5 entire scaled bucket stays removed',amount('baoTotal')==='0n'&&amount('otherTotal')==='15n');
   assert('F5 financial receipt after full scaled Cut',amount('scaledCutBefore')==='428n'&&amount('scaledCutRemoved')==='428n'&&amount('scaledCutAfter')==='0n');
   assert('F5 both buttons reflect eligible buckets',$('cutSelectedScaled').disabled&&!$('cutSelectedUnscaled').disabled);
   $('undoQuytCut').click();
   assert('Undo entire scaled Cut restores two buckets',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n');
   assert('Undo empties Cut ledger',sessionStorage.getItem('KTS_QUYT_MAIN_V4_SOURCE_CUT_V1')===null);
   $('cutSelectedUnscaled').click();
   assert('after F5 cut unchanged bucket',$('cutSelectedUnscaled').disabled&&amount('baoTotal')==='428n'&&amount('otherTotal')==='0n');
   set('raw',input.replace('b 100','b 101'));
   assert('source mutation HOLD clears both money totals',amount('baoTotal')==='—'&&amount('otherTotal')==='—'&&$('scaledTicket').value===''&&$('unscaledTicket').value==='');
   assert('source mutation requires new batch confirmation',!$('startNewQuytBatch').hidden);
   assert('source mutation disables both Cut actions',$('cutSelectedScaled').disabled&&$('cutSelectedUnscaled').disabled);
   set('raw',input);
   assert('restoring original source reapplies identical Cut',amount('baoTotal')==='428n'&&amount('otherTotal')==='0n');
   set('rate','1.068');
   assert('changing multiplier after Cut HOLD',amount('baoTotal')==='—'&&amount('otherTotal')==='—');
   set('rate','1.067');
   assert('restored multiplier restores ledger receipt',amount('unscaledCutRemoved')==='15n'&&amount('unscaledCutAfter')==='0n');
   set('raw',input+'\n160 dd10n');
   assert('invalid 3-digit DD HOLD atomically clears two panels',amount('baoTotal')==='—'&&amount('otherTotal')==='—');
   assert('invalid source Cut buttons remain disabled',$('cutSelectedScaled').disabled&&$('cutSelectedUnscaled').disabled);
   assert('multiplied Copy remains locked',$('copyScaled').disabled);
   sessionStorage.removeItem('QA_QUYT_LIVE_CUT_STAGE');sessionStorage.removeItem('QA_QUYT_LIVE_CUT_FIRST');
  }else{
   assert('blank screen holds both Cut actions',$('cutSelectedScaled').disabled&&$('cutSelectedUnscaled').disabled);
   set('raw',input);$('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
   assert('owner fixture before Cut exactly 428 plus 15',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n');
   assert('both whole Cut buttons enabled',!$('cutSelectedScaled').disabled&&!$('cutSelectedUnscaled').disabled);
   assert('bucket receipt original totals',amount('scaledCutBefore')==='428n'&&amount('unscaledCutBefore')==='15n');
   assert('no duplicated raw text inside result buckets',!document.querySelector('.bucket-cut-list')&&!document.querySelector('.bucket-cut-entry'));
   $('cutSelectedUnscaled').click();
   assert('one tap removes entire unchanged bucket',amount('baoTotal')==='428n'&&amount('otherTotal')==='0n');
   assert('unchanged bucket receipt 15 minus 15 equals 0',amount('unscaledCutBefore')==='15n'&&amount('unscaledCutRemoved')==='15n'&&amount('unscaledCutAfter')==='0n');
   assert('uncut multiplied bucket remains enabled',!$('cutSelectedScaled').disabled&&$('cutSelectedUnscaled').disabled);
   $('cutSelectedScaled').click();
   assert('second tap removes entire multiplied bucket',amount('baoTotal')==='0n'&&amount('otherTotal')==='0n');
   assert('whole-source conservation ends at zero',amount('scaledCutRemoved')==='428n'&&amount('unscaledCutRemoved')==='15n'&&$('cutConservation').textContent.includes('443 = 443 + 0'));
   assert('all cut actions disabled after all removed',$('cutSelectedScaled').disabled&&$('cutSelectedUnscaled').disabled);
   assert('Cut never modifies raw source',$('raw').value===input);
   $('undoQuytCut').click();
   assert('first Undo restores scaled only',amount('baoTotal')==='428n'&&amount('otherTotal')==='0n');
   $('undoQuytCut').click();
   assert('second Undo restores unchanged also',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n');
   assert('no double multiplication after Undo',amount('scaledCutBefore')==='428n'&&amount('scaledCutAfter')==='428n');
   $('cutSelectedScaled').click();
   assert('single tap scaled entire bucket for F5',amount('baoTotal')==='0n'&&amount('otherTotal')==='15n');
   assert('factorized Copy remains disabled',$('copyScaled').disabled);
   sessionStorage.setItem('QA_QUYT_LIVE_CUT_FIRST',JSON.stringify(report));
   sessionStorage.setItem('QA_QUYT_LIVE_CUT_STAGE','after');
   location.reload();return;
  }
 }catch(e){report.push({name:'EXCEPTION',pass:false,error:String(e&&e.stack||e)})}
 const receipt=document.createElement('pre');receipt.id='quyt-source-cut-browser-qa';
 receipt.textContent=JSON.stringify({pass:report.filter(x=>x.pass).length,fail:report.filter(x=>!x.pass).length,report});
 document.body.append(receipt);
})();
</script>`;
const html=source.replace('</body>',checks+'\n</body>');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://127.0.0.1').pathname;
 const name=route.replace(/^\/+/u,'');
 if(!name.startsWith('quyt-pwa/')||name.includes('..')){res.writeHead(404).end();return;}
 const target=path.join(root,name);
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data;
 try{data=name==='quyt-pwa/index.html'?html:fs.readFileSync(target)}
 catch(_){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(data);
});
server.listen(0,'127.0.0.1',()=>{
 const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
 if(!chrome){console.error('CHROME_NOT_FOUND');server.close();process.exitCode=2;return}
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',
  '--disable-extensions','--no-first-run','--virtual-time-budget=6500',
  '--user-data-dir=/tmp/quyt-main-cut-'+process.pid,'--dump-dom',
  'http://127.0.0.1:'+server.address().port+'/quyt-pwa/index.html'];
 const proc=cp.spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 const timeout=setTimeout(()=>{console.error('CHROME_TIMEOUT');proc.kill('SIGKILL')},45000);
 proc.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>20*1024*1024)proc.kill('SIGKILL')});
 proc.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-1800)});
 proc.on('error',e=>{clearTimeout(timeout);server.close();console.error('CHROME_START_FAILED',String(e));process.exitCode=1});
 proc.on('close',code=>{
  clearTimeout(timeout);server.close();
  const marker='<pre id="quyt-source-cut-browser-qa">',i=stdout.indexOf(marker),j=stdout.indexOf('</pre>',i);
  if(i<0||j<0){console.error('BROWSER_RECEIPT_MISSING',stderr,stdout.slice(-500));process.exitCode=1;return}
  let report;try{report=JSON.parse(stdout.slice(i+marker.length,j).replaceAll('&quot;','"').replaceAll('&amp;','&'))}
  catch(e){console.error('BROWSER_RECEIPT_INVALID',String(e));process.exitCode=1;return}
  console.log(JSON.stringify({browser:'actual Chromium localhost synthetic F5',report},null,2));
  if(code!==0||report.fail!==0||report.pass<25)process.exitCode=1;
 });
});