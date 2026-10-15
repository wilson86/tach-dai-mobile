(function(){
'use strict';
// CI-only synthetic controller loaded AFTER the exact pilot's original scripts.
const safe=x=>{if(!x)throw Error('PILOT_DOM_MISSING');return x};
const el=id=>safe(document.getElementById(id));
const check=(condition,code)=>{if(!condition)throw Error(code)};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,code){
 for(let i=0;i<130;i++){
  if(fn())return;
  await sleep(60);
 }
 throw Error(code);
}
async function run(){
 let status='FAIL',reason=null;
 try{
  check(isSecureContext,'PILOT_INSECURE');
  check(document.querySelector('.badge').textContent.includes('SYNTHETIC ONLY'),'PILOT_LIVE_BANNER_MISSING');
  check(el('team-review-controls').hidden===true,'PILOT_HIDDEN_REVIEW_ACTIVE');
  check(el('team-logout').disabled===true,'PILOT_LOGOUT_NOT_GATED');
  check(document.title.includes('Pilot nhóm'),'PILOT_WRONG_PAGE');
  el('team-subject').value='fake_operator_a';
  el('team-workspace').value='group_a';
  el('team-password').value='synthetic-secret';
  el('team-date').value='2026-10-15';
  el('team-login').requestSubmit();
  await until(()=>el('team-notice').textContent.includes('Đăng nhập pilot thành công'),'PILOT_LOGIN_NOT_VERIFIED');
  check(el('team-password').value==='','PILOT_PASSWORD_RETAINED');
  check(!el('team-create').disabled,'PILOT_DRAFT_ACTION_BLOCKED');
  el('team-create').click();
  await until(()=>el('team-notice').textContent.includes('PENDING'),'PILOT_PENDING_MISSING');
  check(el('team-warning').textContent.includes('MEMORY_ONLY'),'PILOT_VOLATILE_WARNING_MISSING');
  el('team-sync').click();
  await until(()=>el('team-notice').textContent.includes('SYNCED'),'PILOT_RECEIPT_MISSING');
  check(el('team-drafts').textContent.includes('') ||
    el('team-drafts').children.length===1,'PILOT_DRAFT_LIST_MISSING');
  check(el('team-drafts').textContent.includes('SYNCED')||
    [...el('team-drafts').children].some(x=>x.textContent.includes('SYNCED')),'PILOT_DRAFT_NOT_VERIFIED');
  el('team-read').click();
  await until(()=>el('team-review-readonly').textContent.includes('MÁY CHỦ (đã xác minh)'),
    'PILOT_SCOPE_READ_MISSING');
  check(el('team-review-controls').hidden===true,'PILOT_REVIEW_CONTROLS_EXPOSED');
  el('team-pull').click();
  await until(()=>el('team-notice').textContent.includes('Change feed SYNCED'),'PILOT_FEED_NOT_VERIFIED');
  check(el('team-changes').children.length===1,'PILOT_EVENT_HISTORY_MISSING');
  el('team-logout').click();
  await until(()=>el('team-notice').textContent.includes('Đã đăng xuất'),'PILOT_LOGOUT_NOT_VERIFIED');
  check(el('team-changes').children.length===0,'PILOT_FEED_STALE_AFTER_LOGOUT');
  check(el('team-context').textContent.includes('Chưa đăng nhập'),'PILOT_SESSION_STILL_OPEN');
  status='PASS';
 }catch(error){reason=String(error&&error.message||error).slice(0,130)}
 el('proof').textContent=JSON.stringify({stage:'pilot',status,
  fake_only:true,real_money_ready:false,review_ui_enabled:false,
  ...(reason?{code:reason}:{})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
else void run();
}());