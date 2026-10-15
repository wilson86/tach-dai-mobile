(function(){
'use strict';
// Explicit separate preview page only: this is NEVER imported by public PWA
// or the existing original settlement-team-pilot.html.
if(typeof document==='undefined')return;
function start(){
 const msg=document.getElementById('team-manual-notice');
 try{
   if(!globalThis.KtsTeamPilotUI||!globalThis.KtsSettlementSyncClient||
      !globalThis.KtsTeamSyntheticManualUI||
      !globalThis.KtsTeamSyntheticManualCheckpointV0||
      !globalThis.KtsTeamSyntheticIndexedDbV0)
     throw Error('TEAM_MANUAL_PREVIEW_DEPENDENCY_MISSING');
   const main=globalThis.KtsTeamPilotUI.mount({doc:document,win:window,
      Sync:globalThis.KtsSettlementSyncClient});
   globalThis.KtsTeamSyntheticManualUI.mount({
     doc:document,win:window,client:main.client,
     Checkpoint:globalThis.KtsTeamSyntheticManualCheckpointV0,
     Idb:globalThis.KtsTeamSyntheticIndexedDbV0,
     syntheticOnly:true});
 }catch(_){
   if(msg)msg.textContent='TEAM_MANUAL_PREVIEW_DISABLED';
 }
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
}());