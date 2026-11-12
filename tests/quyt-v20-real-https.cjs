'use strict';
// WILSON86 no customer data; public test-only HTTPS proof $0.
const crypto=require('node:crypto');
const expected={
  "index.html": "064b3d19e833d3e4a9411176a9a897ce635cfc85",
  "sw.js": "750bf24cfd2825c0200a28ad7a24129aa68283c2",
  "station_calendar.generated.js": "a5bd05da4a0eb910eb46dfdb8917a589706ec9f4",
  "thu-nghiem/index.html": "064b3d19e833d3e4a9411176a9a897ce635cfc85",
  "thu-nghiem/sw.js": "f2e057d5fa4743f5f77c4f09771c65efb7262143",
  "manifest.webmanifest": "ec1eaa35cfcd737a6063021457b76afbcd3d94b6"
};
const base='https://wilson86.github.io/tach-dai-mobile/quyt-pwa/';
const sha=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
async function verify(file){
 let last;
 for(let attempt=0;attempt<5;attempt++){
  try{
   const res=await fetch(base+file+'?v=2026111203',{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const data=Buffer.from(await res.arrayBuffer()),body=data.toString('utf8');
   const markers=(file==='index.html'||file==='thu-nghiem/index.html')?
     body.includes('HOLD_DX_CAN_DUNG_2_SO')&&body.includes("dx:'dx'")&&
     body.includes('id="scaledTicket"')&&body.includes('id="unscaledTicket"')&&
     body.includes('HOLD_QUYT_V2_MONEY_CONTRACT')&&
     body.includes('id="copyScaled" disabled'):
     file==='sw.js'?body.includes('v20-mb-dx-pair-two-frames'):
     file==='thu-nghiem/sw.js'?body.includes('v4-mb-dx-pair-two-frames'):true;
   last={file,status:res.status,actual:sha(data),expected:expected[file],bytes:data.length,markers};
   if(res.status===200&&last.actual===expected[file]&&markers)return last;
  }catch(e){last={file,error:String(e)}}
  if(attempt<4)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('QUYT_V20_PUBLIC_HTTPS_MISMATCH '+JSON.stringify(last));
}
(async()=>{
 const receipts=[];
 for(const file of Object.keys(expected))receipts.push(await verify(file));
 console.log('QUYT_V20_REAL_HTTPS_PROOF',JSON.stringify({ok:true,receipts},null,2));
})().catch(e=>{console.error(String(e));process.exitCode=1});
