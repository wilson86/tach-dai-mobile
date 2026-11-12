'use strict';
// WILSON86: live read-only HTTPS release proof. No customer tickets/credentials.
const crypto=require('node:crypto');
const expected={
 'OFFICIAL_INDEX':'33b9fca15ed9100f4b0f00036d15dbe74553b043',
 'OFFICIAL_SW':'b21e620b5a97a05a16ac369b81a6990e84123918',
 'PREVIEW_INDEX':'f9daa60cc1f8cc84dcf006c3cfa680bddbe11b8a'
};
const urls={
 OFFICIAL_INDEX:'https://wilson86.github.io/tach-dai-mobile/quyt-pwa/index.html?v=3131cd74',
 OFFICIAL_SW:'https://wilson86.github.io/tach-dai-mobile/quyt-pwa/sw.js?v=3131cd74',
 PREVIEW_INDEX:'https://wilson86.github.io/tach-dai-mobile/quyt-pwa/thu-nghiem/index.html?v=3131cd74'
};
const sha=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
async function check(label){
 const url=urls[label],want=expected[label];
 let last;
 for(let i=0;i<5;i++){
  try{
   const response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const buf=Buffer.from(await response.arrayBuffer());
   const hash=sha(buf);
   const content=buf.toString('utf8');
   const marker=label==='OFFICIAL_INDEX'?content.includes('id="quyt-three-region-open" href="./thu-nghiem/"'):
      label==='PREVIEW_INDEX'?content.includes('HOLD_QUYT_V2_MONEY_CONTRACT'):
      content.includes("const CACHE='kts-quyt-standalone-pwa-20261106-v8-route-boundary-hold'");
   last={label,url,status:response.status,sha:hash,expected:want,bytes:buf.length,contentType:response.headers.get('content-type'),marker};
   if(response.status===200&&hash===want&&marker)return last;
  }catch(e){last={label,url,error:String(e)}}
  if(i<4)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('LIVE_HTTPS_NOT_QUALIFIED '+JSON.stringify(last));
}
(async()=>{
 const receipts=[];
 for(const label of Object.keys(expected))receipts.push(await check(label));
 console.log('KTS_QUYT_MAIN_LINK_LIVE_HTTPS_PROOF',JSON.stringify({ok:true,receipts},null,2));
})().catch(e=>{console.error(String(e));process.exitCode=1});
