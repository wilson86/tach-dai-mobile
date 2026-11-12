'use strict';
// WILSON86 Quyt main Cut -> bucket recompute -> Undo -> F5.
// Synthetic bets only, localhost Chromium. Never touches Telegram/Router.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'quyt-pwa/quyt-cut-beta/index.html'),'utf8');
const checks=String.raw`<script>
(()=>{
 const report=[],$=id=>document.getElementById(id);
 const assert=(name,ok)=>report.push({name,pass:Boolean(ok)});
 const set=(id,val,event='input')=>{const e=$(id);e.value=val;e.dispatchEvent(new Event(event,{bubbles:true}))};
 const press=(rootId,n=0)=>{const btns=[...$(rootId).querySelectorAll('button')];if(!btns[n])throw Error('BUTTON_NOT_FOUND '+rootId+' '+n);btns[n].click()};
 const input='60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n';
 const amount=id=>$(id).textContent;
 const stage=sessionStorage.getItem('QA_QUYT_LIVE_CUT_STAGE');
 assert('beta visible review-only banner',document.body.textContent.includes('BẢN THỬ ĐỘC LẬP'));
 assert('beta keeps all money Copy locked',$('copyUnscaled').disabled&&$('copyScaled').disabled);
 try{
  if(stage==='after'){
   const first=JSON.parse(sessionStorage.getItem('QA_QUYT_LIVE_CUT_FIRST')||'null');
   assert('pre-F5 checks persist',Array.isArray(first));if(Array.isArray(first))report.push(...first);
   assert('F5 original source exact unchanged',$('raw').value===input);
   assert('F5 Quyt toggle preserved',$('tick').checked);
   assert('F5 Cut recomputed scaled and unscaled',amount('baoTotal')==='321n'&&amount('otherTotal')==='15n');
   assert('F5 Cut ledger receipts',amount('cutBefore')==='443n'&&amount('cutRemoved')==='107n'&&amount('cutAfter')==='336n');
   assert('F5 undo still enabled',!$('undoQuytCut').disabled);
   $('undoQuytCut').click();
   assert('F5 Undo restores both boxes',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n'&&amount('cutAfter')==='443n');
   assert('F5 Undo clears ledger',sessionStorage.getItem('KTS_QUYT_BETA_CUT_LEDGER_V1')===null);
   press('cutBetList',0);
   assert('after F5 new Cut still works',amount('cutAfter')==='336n');
   set('raw',input.replace('b 100','b 101'));
   assert('source edit after Cut HOLD clears two frames',amount('baoTotal')==='—'&&amount('otherTotal')==='—'&&$('scaledTicket').value===''&&$('unscaledTicket').value===''&&$('status').textContent.includes('HOLD_CUT_SOURCE_CHANGED'));
   assert('source edit requires explicit new batch',!$('startNewQuytBatch').hidden);
   set('raw',input);
   assert('restoring source reapplies exactly one Cut',amount('cutRemoved')==='107n'&&amount('cutAfter')==='336n');
   set('rate','1.068');
   assert('rate edit after Cut also HOLD',amount('baoTotal')==='—'&&amount('otherTotal')==='—');
   set('rate','1.067');
   assert('restoring factor restores receipt',amount('cutAfter')==='336n');
   assert('scaled Copy stays locked even with audit',$('copyScaled').disabled);
   set('raw',input+'\n160 dd10n');
   assert('invalid third line atomically clears both boxes',amount('baoTotal')==='—'&&amount('otherTotal')==='—');
   sessionStorage.removeItem('QA_QUYT_LIVE_CUT_STAGE');sessionStorage.removeItem('QA_QUYT_LIVE_CUT_FIRST');
  }else{
   assert('CẮT workflow visible on initial phone screen',!$('sourceCutCard').hidden&&$('cutSelectedQuyt').disabled);
   assert('CẮT located before two money-result frames',!!($('sourceCutCard').compareDocumentPosition($('baoTotal'))&Node.DOCUMENT_POSITION_FOLLOWING));
   set('raw',input);
   $('tick').checked=true;$('tick').dispatchEvent(new Event('change',{bubbles:true}));
   assert('two source lines sum 428 and 15',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n');
   assert('Cut summary shows 443 source result',amount('cutBefore')==='443n'&&amount('cutAfter')==='443n'&&amount('cutRemoved')==='0n');
   assert('source raw visible in audit',$('cutSourceList').textContent.includes('60 b 100')&&$('cutSourceList').textContent.includes('526 b10n'));
   assert('source audit preserves all six wager atoms',$('cutBetList').querySelectorAll('button').length===6);
   press('cutSourceList',1);
   assert('Cut second source removes BOTH unchanged bets',amount('baoTotal')==='428n'&&amount('otherTotal')==='0n');
   assert('Cut source2 conservation',amount('cutBefore')==='443n'&&amount('cutRemoved')==='15n'&&amount('cutAfter')==='428n');
   assert('source textarea byte-for-byte retained',$('raw').value===input);
   $('undoQuytCut').click();
   assert('Undo full source restores original buckets',amount('baoTotal')==='428n'&&amount('otherTotal')==='15n');
   const firstPick=$('cutBetList').querySelector('.cut-bet-check');
   assert('source wager checkbox exists',!!firstPick);
   firstPick.checked=true;firstPick.dispatchEvent(new Event('change',{bubbles:true}));
   assert('primary CẮT becomes enabled for selected atom',!$('cutSelectedQuyt').disabled);
   $('cutSelectedQuyt').click();
   assert('selected CẮT clears selection and disables primary action',$('cutSelectedQuyt').disabled);
   assert('Cut B 100n updates scaled bucket only',amount('baoTotal')==='321n'&&amount('otherTotal')==='15n');
   assert('Cut one wager preserves exact conservation',amount('cutBefore')==='443n'&&amount('cutRemoved')==='107n'&&amount('cutAfter')==='336n');
   assert('Cut does not enable Copy scaled',$('copyScaled').disabled);
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
 try{data=name==='quyt-pwa/quyt-cut-beta/index.html'?html:fs.readFileSync(target)}
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
  'http://127.0.0.1:'+server.address().port+'/quyt-pwa/quyt-cut-beta/index.html'];
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