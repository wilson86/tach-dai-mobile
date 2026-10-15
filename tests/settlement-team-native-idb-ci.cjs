'use strict';
// Runs only on disposable GitHub-hosted Linux. No installs, no real finance.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const http=require('node:http'),cp=require('node:child_process');
const {promisify}=require('node:util');
const execFile=promisify(cp.execFile),ROOT=path.resolve(__dirname,'..');
const proofHtml=fs.readFileSync(path.join(__dirname,'settlement-team-native-idb-proof.html'),'utf8');
const routes={
 '/app/settlement-team-recovery-v0.js':'app/settlement-team-recovery-v0.js',
 '/app/settlement-team-recovery-idb-v0.js':'app/settlement-team-recovery-idb-v0.js'
};
function browser(){
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{return cp.execFileSync('which',[name],{encoding:'utf8',timeout:2000}).trim()}catch(_){}
 }
 throw Error('CHROME_BINARY_NOT_AVAILABLE');
}
async function run(bin,args,timeout=50000){
 const r=await execFile(bin,args,{encoding:'utf8',timeout,maxBuffer:300000});
 return r.stdout;
}
async function main(){
 const evidence=process.env.KTS_NATIVE_EVIDENCE_DIR,sha=process.env.KTS_NATIVE_SOURCE_SHA;
 if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||
 !process.env.RUNNER_TEMP||!evidence||!/^[a-f0-9]{40}$/.test(sha||''))
 throw Error('NATIVE_TEST_ENV_NOT_AUTHORIZED');
 await fsp.mkdir(evidence,{recursive:true,mode:0o700});
 const report={source_sha:sha,status:'BLOCKED',native_browser_qa:'NOT_PROVEN',
 real_money_ready:false,release_readiness:'BLOCKED',pwa_enabled:false,
 financial_post_count:0,stages:[]};
 let server=null,temp=null;
 try{
  const bin=browser();
  report.browser_version=(await run(bin,['--version'],8000)).trim();
  temp=await fsp.mkdtemp(path.join(process.env.RUNNER_TEMP,'kts-native-idb-'));
  const profile=path.join(temp,'test-profile');
  server=http.createServer((req,res)=>{
   if(req.method!=='GET'){res.writeHead(405);res.end();return}
   const key=new URL(req.url,'http://localhost').pathname;
   if(key==='/proof'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(proofHtml);return
   }
   if(!Object.prototype.hasOwnProperty.call(routes,key)){res.writeHead(404);res.end();return}
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
   fs.createReadStream(path.join(ROOT,routes[key])).pipe(res);
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
  const port=server.address().port;
  if(port===8787)throw Error('RESERVED_PORT');
  for(const stage of ['save','restore']){
   const output=await run(bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--disable-extensions','--no-first-run',
    '--no-default-browser-check','--user-data-dir='+profile,
    '--virtual-time-budget=15000','--dump-dom',
    'http://127.0.0.1:'+port+'/proof?stage='+stage]);
   const match=output.match(/<pre id="proof">([^<]*)<\/pre>/);
   if(!match)throw Error('NATIVE_DOM_PROOF_MISSING_'+stage);
   const obj=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
   if(obj.status!=='PASS'||obj.stage!==stage||obj.native_indexeddb!==true||
      obj.auto_send_enabled!==false||obj.original_id!=='draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    throw Error('NATIVE_PROOF_INVALID_'+stage+'_'+String(obj.code||'NONE'));
   report.stages.push({stage,status:'PASS'});
  }
  report.status='PASS_SYNTHETIC_NATIVE_CHROME';
  report.native_browser_qa='PASS_CI_RESTART';
 }catch(e){report.error_code=String(e.message||e).slice(0,140)}
 finally{
  if(server)await new Promise(ok=>server.close(ok));
  if(temp)await fsp.rm(temp,{recursive:true,force:true});
  report.owned_profile_cleanup='COMPLETE';
  await fsp.writeFile(path.join(evidence,'NATIVE_IDB_PROOF.json'),
   JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
 }
 if(report.status!=='PASS_SYNTHETIC_NATIVE_CHROME')process.exitCode=1;
}
main().catch(e=>{console.error('NATIVE_CI_FAILED '+e.message);process.exitCode=1});
