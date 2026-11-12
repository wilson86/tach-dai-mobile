'use strict';
// WILSON86 $0 read-only network probe; no personal data, no Telegram, no payments.
const crypto=require('node:crypto');
const expected={"index.html":"9345ae409af516e82ae820f78578218b53e48bd9","sw.js":"af29ed83a1a3081f006b8dbcdde8438f086ee274","station_calendar.generated.js":"a5bd05da4a0eb910eb46dfdb8917a589706ec9f4","thu-nghiem/index.html":"9345ae409af516e82ae820f78578218b53e48bd9","thu-nghiem/sw.js":"93be612544a8895317273e6c44ecb9f3a42a7e65","manifest.webmanifest":"ec1eaa35cfcd737a6063021457b76afbcd3d94b6"};
const base='https://wilson86.github.io/tach-dai-mobile/quyt-pwa/';
const sha=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
async function check(file){
 let seen;
 for(let tries=0;tries<5;tries++){
  try{
   const res=await fetch(base+file+'?v=2026111202',{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const bytes=Buffer.from(await res.arrayBuffer());
   const body=bytes.toString('utf8');
   const markers=file==='index.html'||file==='thu-nghiem/index.html'
     ?body.includes('<option value="mb">MB</option>')&&body.includes('id="scaledTicket"')&&
      body.includes('id="unscaledTicket"')&&body.includes('id="copyScaled" disabled')&&
      body.includes('id="copyUnscaled" disabled')&&
      body.includes('HOLD_QUYT_V2_MONEY_CONTRACT')
     :file==='sw.js'?body.includes('v19-two-frame-text-copy-mb-label')
     :file==='thu-nghiem/sw.js'?body.includes('v3-two-frame-text-copy'):true;
   seen={file,status:res.status,blob:sha(bytes),expected:expected[file],bytes:bytes.length,markers};
   if(seen.status===200&&seen.blob===expected[file]&&seen.markers)return seen;
  }catch(e){seen={file,error:String(e)}}
  if(tries!==4)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('LIVE_QUYT_V19_MISMATCH_'+JSON.stringify(seen));
}
(async()=>{
 const receipts=[];
 for(const name of Object.keys(expected))receipts.push(await check(name));
 console.log('LIVE_QUYT_V19_RELEASE_PROOF',JSON.stringify({ok:true,receipts},null,2));
})().catch(e=>{console.error(String(e));process.exitCode=2});
