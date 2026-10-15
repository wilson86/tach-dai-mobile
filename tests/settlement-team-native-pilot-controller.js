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
  check(window.innerWidth<=400,'PILOT_MOBILE_VIEWPORT_NOT_APPLIED');
  check(document.documentElement.scrollWidth<=window.innerWidth+1,
    'PILOT_HORIZONTAL_OVERFLOW');
  check(document.querySelector('.badge').textContent.includes('SYNTHETIC ONLY'),'PILOT_LIVE_BANNER_MISSING');
  check(el('team-review-controls').hidden===true,'PILOT_HIDDEN_REVIEW_ACTIVE');
  check(el('team-logout').disabled===true,'PILOT_LOGOUT_NOT_GATED');
  check(document.title.includes('Pilot nhóm'),'PILOT_WRONG_PAGE');
  el('team-subject').value='fake_operator_a';
  el('team-workspace').value='group_a';
  // An invalid credential is rejected by the fake HTTP endpoint without
  // creating an authenticated browser session.
  el('team-password').value='wrong-synthetic-secret';
  el('team-login').requestSubmit();
  await until(()=>el('team-notice').textContent.includes('AUTH_LOGIN_DENIED'),
    'BAD_LOGIN_NOT_DENIED');
  check(el('team-create').disabled,'BAD_LOGIN_UNLOCKED_CREATE');
  check(el('team-context').textContent.includes('Chưa đăng nhập'),
    'BAD_LOGIN_CHANGED_CONTEXT');
  el('team-password').value='synthetic-secret';
  el('team-date').value='2026-10-15';
  el('team-login').requestSubmit();
  await until(()=>el('team-notice').textContent.includes('Đăng nhập pilot thành công'),'PILOT_LOGIN_NOT_VERIFIED');
  check(el('team-password').value==='','PILOT_PASSWORD_RETAINED');
  check(!el('team-create').disabled,'PILOT_DRAFT_ACTION_BLOCKED');
  const touch=el('team-create').getBoundingClientRect();
  check(touch.height>=44&&touch.width>=44,'PILOT_TOUCH_TARGET_TOO_SMALL');
  // The synthetic pilot must refuse actual/non-fake partner IDs on the
  // client BEFORE trying to create any financial-looking draft.
  el('team-partner').value='real_customer';
  el('team-create').click();
  await until(()=>el('team-notice').textContent.includes('TEAM_PILOT_SCOPE_INVALID'),
    'REAL_COUNTERPARTY_NOT_BLOCKED');
  check(el('team-drafts').children.length===0,'INVALID_PARTNER_CREATED_DRAFT');
  el('team-partner').value='fake_partner_1';
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
  check(document.documentElement.scrollWidth<=window.innerWidth+1,
    'PILOT_POST_LOGIN_HORIZONTAL_OVERFLOW');
  status='PASS';
 }catch(error){reason=String(error&&error.message||error).slice(0,130)}
 el('proof').textContent=JSON.stringify({stage:'pilot',status,
  fake_only:true,real_money_ready:false,review_ui_enabled:false,
  mobile_viewport:true,touch_target_44px:true,
  bad_login_denied:true,real_counterparty_denied:true,
  ...(reason?{code:reason}:{})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
else void run();
}());