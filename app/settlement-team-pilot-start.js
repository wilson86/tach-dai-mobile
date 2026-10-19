(function(){
'use strict';
// Only loaded by settlement-team-pilot.html. No live service starts here.
if(typeof document==='undefined')return;
function start(){
 const node=document.getElementById('team-notice');
 try{
   if(!globalThis.KtsTeamPilotUI||!globalThis.KtsSettlementSyncClient)
     throw Error('TEAM_PILOT_DEPENDENCY_MISSING');
   // Review controls are a separately opted-in synthetic test feature.  They
   // may only be exposed by the loopback HTTP composition used for a bounded
   // local qualification; a copied file or LAN/Internet page cannot enable it.
   const page=new URL(window.location.href);
   const loopback=page.protocol==='http:'&&
     (page.hostname==='127.0.0.1'||page.hostname==='localhost'||page.hostname==='::1');
   const syntheticReviewUiEnabled=loopback&&
     page.searchParams.get('synthetic_review_ui')==='1';
   globalThis.KtsTeamPilotUI.mount({
     doc:document,win:window,Sync:globalThis.KtsSettlementSyncClient,
     syntheticReviewUiEnabled
   });
 }catch(_){
   if(node)node.textContent='Pilot bị khóa: yêu cầu HTTPS/localhost và backend riêng được phê duyệt.';
 }
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
}());
