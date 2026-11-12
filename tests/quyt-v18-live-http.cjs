'use strict';
// WILSON86 $0 public HTTP probe only. NEVER access customer data, Telegram, Router or paid APIs.
const crypto=require('node:crypto');
const base='https://wilson86.github.io/tach-dai-mobile/quyt-pwa/';
const expected={
 'index.html':'f5bb5446ff6a9c2cd211ca800bbeb0723e0f88b9',
 'sw.js':'b73c2d9f3d86d4876bbc919400dcaff58b5d1025',
 'station_calendar.generated.js':'a5bd05da4a0eb910eb46dfdb8917a589706ec9f4',
 'manifest.webmanifest':'ec1eaa35cfcd737a6063021457b76afbcd3d94b6',
 'thu-nghiem/index.html':'f5bb5446ff6a9c2cd211ca800bbeb0723e0f88b9',
 'thu-nghiem/sw.js':'165465bf7cc5c3d892b4f4123408483620a00d1b'
};
const sha=buf=>crypto.createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
async function check(file){
 let last;
 for(let i=0;i<6;i++){
  try {
   const url=base+file+'?v=20261112';
   const res=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const buf=Buffer.from(await res.arrayBuffer());
   const body=buf.toString('utf8');
   const markers=file==='index.html'||file==='thu-nghiem/index.html'
    ?body.includes('Kết quả gộp — CHỈ 2 KHUNG')&&body.includes('normalizeApprovedBareStakes(raw)')&&
     body.includes('HOLD_QUYT_V2_MONEY_CONTRACT')&&!body.includes('MỞ GỘP CHUNG MB / MN / MT (BẢN THỬ)')
    :file==='sw.js'?body.includes('v18-two-boxes-approved-bare')
    :file==='thu-nghiem/sw.js'?body.includes('kts-quyt-preview-20261112-v2-bare-money-two-boxes')
    :true;
   last={file,url,status:res.status,actual:sha(buf),expected:expected[file],bytes:buf.length,markers};
   if(res.status===200&&last.actual===expected[file]&&markers)return last;
  } catch(e){last={file,error:String(e)}}
  if(i<5)await new Promise(r=>setTimeout(r,1200));
 }
 throw Error('LIVE_MISMATCH_'+JSON.stringify(last));
}
(async()=>{
 const results=[];
 for(const file of Object.keys(expected))results.push(await check(file));
 console.log('QUYT_V18_PUBLIC_LIVE_HTTP_PROOF',JSON.stringify({ok:true,results},null,2));
})().catch(e=>{console.error(String(e));process.exitCode=1});
