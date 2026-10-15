(function(){
'use strict';
const el=id=>document.getElementById(id),delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
async function wait(test,msg){
 for(let i=0;i<160;i++){if(test())return;await delay(70)}
 throw Error(msg);
}
const secret='synthetic-separate-recovery-secret-2026';
async function main(){
 const stage=new URL(location.href).searchParams.get('stage');
 let status='FAIL',error_code=null,original_id=null;
 window.confirm=()=>true; // disposable CI fake-only consent
 try{
  check(['manual-save','manual-restore'].includes(stage),'STAGE_INVALID');
  check(isSecureContext&&window.innerWidth<=400,'PREVIEW_UNSAFE_CONTEXT');
  check(el('team-manual-save').disabled&&el('team-manual-inspect').disabled,
    'PREVIEW_NOT_LOGIN_GATED');
  check(el('team-manual-items').children.length===0,'PREVIEW_AUTO_IMPORT');
  el('team-subject').value='fake_operator_a';
  el('team-workspace').value='group_a';
  el('team-password').value='synthetic-secret';
  el('team-date').value='2026-10-15';
  el('team-login').requestSubmit();
  await wait(()=>el('team-notice').textContent.includes('Đăng nhập pilot thành công'),
    'PREVIEW_LOGIN_MISSING');
  if(stage==='manual-save'){
   el('team-create').click();
   await wait(()=>el('team-notice').textContent.includes('PENDING'),'PREVIEW_DRAFT_MISSING');
   const hit=el('team-drafts').textContent.match(/draft_[a-f0-9]{32}/);
   check(hit,'PREVIEW_ORIGINAL_ID_MISSING');original_id=hit[0];
   el('team-manual-secret').value=secret;
   el('team-manual-save').click();
   await wait(()=>el('team-manual-notice').textContent.includes('TEAM_MANUAL_UI_CONSENT_REQUIRED'),
      'PREVIEW_MISSING_CONSENT_ACCEPTED');
   el('team-manual-secret').value=secret;el('team-manual-consent').checked=true;
   el('team-manual-save').click();
   await wait(()=>el('team-manual-notice').textContent.includes('BẢN MÃ ĐÃ ĐỌC LẠI'),
      'PREVIEW_SAVE_UNVERIFIED');
   check(el('team-manual-items').children.length===0,'PREVIEW_AUTO_RESTORE');
  }else{
   check(el('team-drafts').children.length===0,'PREVIEW_IMPORT_ON_BROWSER_RESTART');
   el('team-manual-secret').value='wrong-synthetic-recovery-password';
   el('team-manual-consent').checked=true;el('team-manual-inspect').click();
   await wait(()=>el('team-manual-notice').textContent.includes('TEAM_RECOVERY_AUTH_FAILED'),
     'PREVIEW_WRONG_PASSWORD_ACCEPTED');
   check(el('team-manual-items').children.length===0,'PREVIEW_WRONG_PASSWORD_LEAK');
   el('team-manual-secret').value=secret;
   el('team-manual-consent').checked=true;el('team-manual-inspect').click();
   await wait(()=>el('team-manual-notice').textContent.includes('CHỈ XEM CÁCH LY'),
      'PREVIEW_QUARANTINE_MISSING');
   const nodes=el('team-manual-items').children;
   check(nodes.length===1&&nodes[0].textContent.includes('QUARANTINED'),
      'PREVIEW_NOT_QUARANTINED');
   const hit=nodes[0].textContent.match(/draft_[a-f0-9]{32}/);
   check(hit,'PREVIEW_RECOVERED_ID_MISSING');original_id=hit[0];
   check(el('team-drafts').children.length===0,'PREVIEW_RECOVERY_AUTOSENT');
  }
  check(el('team-manual-secret').value===''&&!el('team-manual-consent').checked,
    'PREVIEW_SECRET_OR_CONSENT_RETAINED');
  el('team-logout').click();
  await wait(()=>el('team-context').textContent.includes('Chưa đăng nhập'),
     'PREVIEW_LOGOUT_MISSING');
  check(el('team-manual-items').children.length===0,'PREVIEW_OLD_ACTOR_VISIBLE');
  status='PASS';
 }catch(e){error_code=String(e&&e.message||e).slice(0,120)}
 el('proof').textContent=JSON.stringify({stage,status,original_id,
  synthetic_only:true,auto_send_enabled:false,
  ...(error_code?{error_code}:{})});
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',()=>void main(),{once:true});
else void main();
}());