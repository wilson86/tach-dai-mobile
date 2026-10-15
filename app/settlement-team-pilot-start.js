(function(){
'use strict';
// Only loaded by settlement-team-pilot.html. No live service starts here.
if(typeof document==='undefined')return;
function start(){
 const node=document.getElementById('team-notice');
 try{
   if(!globalThis.KtsTeamPilotUI||!globalThis.KtsSettlementSyncClient)
     throw Error('TEAM_PILOT_DEPENDENCY_MISSING');
   globalThis.KtsTeamPilotUI.mount({
     doc:document,win:window,Sync:globalThis.KtsSettlementSyncClient
   });
 }catch(_){
   if(node)node.textContent='Pilot bị khóa: yêu cầu HTTPS/localhost và backend riêng được phê duyệt.';
 }
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
}());