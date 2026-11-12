'use strict';
// WILSON86: READ-ONLY HTTPS GitHub Pages proof; no payment or customer tickets.
// Executed only from an already-public GitHub PR standard-free runner.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const base='https://wilson86.github.io/tach-dai-mobile/quyt-pwa/thu-nghiem/';
const expected={
  "index.html": "f9daa60cc1f8cc84dcf006c3cfa680bddbe11b8a",
  "sw.js": "489eabe5afdad2518780d7d22c896a7a0b538eea",
  "manifest.webmanifest": "ccb8236185806f6fa7d48248ad8b09bb1a7a0731",
  "icon.svg": "c9e90b1fd67afadba176b311e0dc58544c22a37c",
  "station_calendar.generated.js": "a5bd05da4a0eb910eb46dfdb8917a589706ec9f4"
};
const rootExpected='f486295ede0f99cc941ecebbe1730c89a1d1277d';
function gitBlob(b){return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')}
async function retrieve(url,blob){
 let last;
 for(let attempt=0;attempt<5;attempt++){
  try{
   const response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const body=Buffer.from(await response.arrayBuffer());
   const actual=gitBlob(body);
   last={url,status:response.status,bytes:body.length,blob:actual,content_type:response.headers.get('content-type')};
   if(response.status===200&&actual===blob)return last;
  }catch(e){last={url,error:String(e)}}
  if(attempt!==4)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 console.error('LIVE_HTTPS_MISMATCH',JSON.stringify(last));
 process.exitCode=2;
 return last;
}
(async()=>{
 const receipts=[];
 for(const [file,blob] of Object.entries(expected)){
  const page=await retrieve(base+file+'?v=f7fd5ff5',blob);
  receipts.push({file,...page});
 }
 const root=await retrieve('https://wilson86.github.io/tach-dai-mobile/quyt-pwa/index.html?v=f7fd5ff5',rootExpected);
 receipts.push({file:'OFFICIAL_MAIN_UNCHANGED',...root});
 const ok=receipts.every(x=>x.status===200&&x.blob===(expected[x.file]||rootExpected));
 console.log('PUBLIC_QUYT_HTTPS_PROBE',JSON.stringify({ok,receipts},null,2));
 if(!ok)process.exitCode=2;
})().catch(e=>{console.error('PROBE_EXCEPTION',e);process.exitCode=2});
