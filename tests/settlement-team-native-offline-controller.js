(function(){
'use strict';
// Test-only native Chrome controller for uncertain ACK and unverified feed.
// Loaded alongside the real pilot browser scripts; never in live PWA.
const el=id=>document.getElementById(id);
const fail=code=>{throw Error(code)};
const check=(ok,code)=>{if(!ok)fail(code)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,code){
 for(let i=0;i<140;i++){if(predicate())return;await sleep(60)}
 fail(code);
}
async function run(){
 const scenario=new URL(location.href).searchParams.get('scenario');
 let result='FAIL',error=null;
 try{
  check(scenario==='lost_ack'||scenario==='unverified_feed','SCENARIO_UNKNOWN');
  check(isSecureContext===true,'INSECURE_ORIGIN');
  check(el('team-review-controls').hidden===true,'REVIEW_UNEXPECTEDLY_ENABLED');
  check(el('team-warning').textContent.includes('MEMORY_ONLY'),'DURABILITY_WARNING_MISSING');
  el('team-subject').value='fake_operator_a';
  el('team-workspace').value='group_a';
  el('team-password').value='synthetic-secret';
  el('team-date').value='2026-10-15';
  el('team-login').requestSubmit();
  await until(()=>el('team-notice').textContent.includes('Đăng nhập pilot thành công'),
    'LOGIN_NOT_VERIFIED');
  el('team-create').click();
  await until(()=>el('team-notice').textContent.includes('PENDING'),'DRAFT_NOT_PENDING');
  check(el('team-drafts').children.length===1,'DRAFT_ID_DUPLICATED');
  // First POST was durably accepted by the disposable fake server, but a
  // deliberately lost HTTP acknowledgement leaves the browser uncertain.
  el('team-sync').click();
  await until(()=>el('team-notice').textContent.includes('Kết quả gửi:'),
    'LOST_ACK_PENDING_RESPONSE_NOT_SHOWN');
  check(el('team-notice').textContent.includes('PENDING'),'UNVERIFIED_503_MARKED_SYNCED');
  check(el('team-drafts').children.length===1,'ORIGINAL_DRAFT_NOT_HELD');
  check(el('team-drafts').textContent.includes('PENDING'),'LOST_ACK_ORIGINAL_NOT_PENDING');
  el('team-reconnect').click();
  await until(()=>el('team-notice').textContent.includes('Kết nối lại —'),
    'RECONNECT_RESULT_MISSING');
  if(scenario==='lost_ack'){
   check(el('team-notice').textContent.includes('change feed: SYNCED'),
     'FEED_NOT_VERIFIED');
   check(el('team-notice').textContent.includes('DRAFT: 1 SYNCED'),
     'ORIGINAL_KEY_NOT_REPLAYED');
   check(el('team-drafts').textContent.includes('SYNCED'),'FINAL_RECEIPT_MISSING');
   check(el('team-changes').children.length===1,'COMMITTED_EVENT_NOT_SHOWN');
  }else{
   check(el('team-notice').textContent.includes('change feed: CHƯA XÁC MINH'),
     'FORGED_FEED_ACCEPTED');
   check(el('team-notice').textContent.includes('CHƯA THỬ LẠI 1'),
     'RECONNECT_RETRIED_WITHOUT_VERIFIED_FEED');
   check(el('team-drafts').textContent.includes('PENDING'),
     'UNKNOWN_COMMIT_MISCLASSIFIED');
   check(el('team-changes').children.length===0,'FORGED_FEED_RENDERED');
   // Explicit human discard in disposable QA, never automated production loss.
   window.confirm=()=>true;
  }
  check(el('team-review-controls').hidden===true,'FINANCIAL_APPROVAL_VISIBLE');
  el('team-logout').click();
  await until(()=>el('team-context').textContent.includes('Chưa đăng nhập'),
    'LOCAL_SESSION_NOT_CLEARED');
  check(el('team-changes').children.length===0,'OLD_ACTOR_HISTORY_RETAINED');
  result='PASS';
 }catch(e){error=String(e.message||e).slice(0,130)}
 el('proof').textContent=JSON.stringify({
  stage:scenario,status:result,synthetic_only:true,auto_send_enabled:false,
  ...(error?{error_code:error}:{})
 });
}
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',()=>void run(),{once:true});
}else void run();
}());
