'use strict';
// Read-only observation of actual public GitHub Pages bytes; no deployment,
// telemetry, customer data, clipboard access, or live Telegram.
// A nonzero result means NOT READY on the official URL, not a candidate parser failure.
const vm=require('node:vm');
const crypto=require('node:crypto');
const base='https://wilson86.github.io/tach-dai-mobile/';
const paths=['quyt-pwa/index.html','quyt-pwa/mn-mt-review.html','station_calendar.generated.js'];
async function getText(path){
 const url=base+path;
 const res=await fetch(url,{signal:AbortSignal.timeout(13000),headers:{'Accept':'text/html,application/javascript;q=0.9'}});
 if(!res.ok)throw Error('HTTP_'+res.status+' '+path);
 const text=await res.text();
 console.log('LIVE_RESOURCE',path,'HTTP',res.status,'BYTES',Buffer.byteLength(text),'SHA256',crypto.createHash('sha256').update(text).digest('hex'));
 return text;
}
(async()=>{
 const [mb,mn,calendar]=await Promise.all(paths.map(getText));
 const marker={
  bao_after_factor:mb.includes('id="baoTotal"'),
  rest_other:mb.includes('id="otherTotal"'),
  tn_handoff:mb.includes('id="regionalHelp"')&&mb.includes('id="openRegional"'),
  mn_date_gate:mn.includes('id="businessDate"'),
  mn_two_amounts:mn.includes('id="baoTotal"')&&mn.includes('id="otherTotal"'),
  session_transfer:mn.includes('KTS_QUYT_MNMT_HANDOFF_V1')
 };
 console.log('OFFICIAL_UI_MARKERS',JSON.stringify(marker));
 const rx=/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u;
 const match=mn.match(rx);
 if(!match){console.log('LIVE_STATUS=BLOCKED_MNMT_ENGINE_NOT_FOUND');process.exitCode=3;return}
 const app=vm.runInNewContext(calendar+'\n'+match[0]+';OfflineKTS;');
 // Synthetic numbers ONLY, never an actual customer source.
 const testSource='Tn 42 43 bl10n';
 const options={market:'mn',businessDate:'2026-11-12',customer:'quyt',rate:'1.067',tick:true};
 let thursdayOK=false,fridayHold=false;
 try{
  const out=app.merge(testSource,options);
  thursdayOK=out.total==='22'&&out.sections.find(x=>x.kind==='b')?.total==='22';
 }catch(e){console.log('LIVE_THURSDAY_FAIL',String(e.message||e).slice(0,240))}
 try{app.merge(testSource,{...options,businessDate:'2026-11-13'})}catch(_){fridayHold=true}
 console.log('LIVE_TN_SYNTHETIC',{thursdayOK,fridayHold});
 if(!thursdayOK||!fridayHold){console.log('LIVE_STATUS=FAIL_STATION_OR_MONEY');process.exitCode=2;return}
 if(!Object.values(marker).every(Boolean)){console.log('LIVE_STATUS=OLD_UI_NOT_DEPLOYED');process.exitCode=2;return}
 console.log('LIVE_STATUS=HTTP_SOURCE_ACCEPTANCE_PASS_PHONE_NATIVE_NOT_RUN');
})().catch(e=>{console.error('LIVE_STATUS=BLOCKED_HTTP_ACCESS',String(e.message||e).slice(0,300));process.exitCode=3});
