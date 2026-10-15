(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.KtsTeamSyntheticManualUI=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Isolated DEFAULT-OFF fake-only manual UI. No HTTP POST, import, auto-sync,
// timers, auto-save, plaintext local storage, or access to production PWA.
const IDS=['team-manual-secret','team-manual-consent','team-manual-save',
 'team-manual-inspect','team-manual-notice','team-manual-items'];
function deny(code){throw Error(code);}
function mount({doc,win,client,Checkpoint,Idb,syntheticOnly=false}={}){
 if(syntheticOnly!==true||!doc||!win||!client||
    typeof client.snapshot!=='function'||typeof client.subscribe!=='function'||
    typeof client.verifyActor!=='function'||!Checkpoint||
    typeof Checkpoint.createSyntheticManualCheckpoint!=='function'||!Idb||
    typeof Idb.createSyntheticIndexedDbStore!=='function'||
    win.isSecureContext!==true)
   deny('TEAM_MANUAL_UI_DISABLED');
 const els=Object.fromEntries(IDS.map(id=>{
   const node=doc.getElementById(id);
   if(!node)deny('TEAM_MANUAL_UI_ELEMENT_MISSING');
   return [id,node];
 }));
 const store=Idb.createSyntheticIndexedDbStore({
   indexedDB:win.indexedDB,syntheticOnly:true});
 const bridge=Checkpoint.createSyntheticManualCheckpoint({
   sync:client,store,verifyActor:()=>client.verifyActor(),
   cryptoProvider:win.crypto,syntheticOnly:true
 });
 let dead=false,busy=false,identityEpoch=null;
 function clear(){while(els['team-manual-items'].firstChild)
   els['team-manual-items'].removeChild(els['team-manual-items'].firstChild);}
 function tell(code){if(!dead)els['team-manual-notice'].textContent=code;}
 function render(state){
   if(dead)return;
   if(identityEpoch!==state.session_epoch){
     identityEpoch=state.session_epoch;
     clear();tell('CHƯA XÁC MINH bản nháp sau thay đổi phiên. Cần xác thực lại.');
   }
   const authenticated=state.authenticated===true;
   const unsent=Array.isArray(state.drafts)&&state.drafts.some(x=>
     ['PENDING','CONFLICT','BLOCKED'].includes(x.status));
   els['team-manual-save'].disabled=busy||!authenticated||!unsent;
   els['team-manual-inspect'].disabled=busy||!authenticated;
 }
 async function act(mode){
   if(dead||busy)return;
   busy=true;
   const atStart=client.snapshot().session_epoch;
   const phrase=els['team-manual-secret'].value;
   els['team-manual-secret'].value='';
   const checked=els['team-manual-consent'].checked===true;
   els['team-manual-consent'].checked=false;
   clear();
   render(client.snapshot());
   try{
     if(!checked)deny('TEAM_MANUAL_UI_CONSENT_REQUIRED');
     if(typeof phrase!=='string'||phrase.length<16||
        phrase.length>256)deny('TEAM_RECOVERY_PASSPHRASE_INVALID');
     if(typeof win.confirm!=='function'||win.confirm(
       'DỮ LIỆU GIẢ: '+(mode==='save'?'lưu bản mã thủ công?':
       'chỉ xem bản nháp đã cách ly, không gửi lại?'))!==true)
       deny('TEAM_MANUAL_UI_CONFIRM_REQUIRED');
     const result=mode==='save'?
       await bridge.save({passphrase:phrase,explicitConsent:true}):
       await bridge.inspect({passphrase:phrase,explicitConsent:true});
     if(dead||client.snapshot().session_epoch!==atStart||
        client.snapshot().authenticated!==true)
       deny('TEAM_MANUAL_CHECKPOINT_SESSION_CHANGED');
     if(mode==='save'){
       if(result.status!=='ENCRYPTED_ADAPTER_ACK'||result.durability!=='UNVERIFIED'||
          result.auto_send_enabled!==false)
         deny('TEAM_MANUAL_UI_UNVERIFIED_SAVE');
       tell('BẢN MÃ ĐÃ ĐỌC LẠI • '+result.draft_count+
         ' nháp giả • độ bền CHƯA XÁC MINH • không tự gửi.');
     }else if(result.status==='NO_ENCRYPTED_BACKUP'){
       tell('Chưa tìm thấy bản mã thử nghiệm. Không có bản nháp nào được nhập.');
     }else{
       if(result.status!=='QUARANTINED'||result.auto_send_enabled!==false||
          result.durability!=='UNVERIFIED'||!Array.isArray(result.items))
         deny('TEAM_MANUAL_UI_UNVERIFIED_RESTORE');
       for(const item of result.items){
         if(!/^draft_[a-f0-9]{32}$/.test(item.id)||item.status!=='QUARANTINED'||
            item.auto_retry!==false)deny('TEAM_MANUAL_UI_UNVERIFIED_ITEM');
         const li=doc.createElement('li');
         li.textContent=item.id+' • QUARANTINED • gốc: '+
           item.original_status+' • không gửi lại';
         els['team-manual-items'].appendChild(li);
       }
       tell('CHỈ XEM CÁCH LY • '+result.items.length+
         ' bản nháp • phải đối chiếu biên nhận máy chủ và quyết định thủ công.');
     }
   }catch(error){
     clear();
     const code=error&&error.message;
     tell(typeof code==='string'&&/^(?:AUTH_|SYNC_|TEAM_)[A-Z0-9_]{1,96}$/.test(code)?
       code:'TEAM_MANUAL_UI_OPERATION_FAILED');
   }finally{
     busy=false;render(client.snapshot());
   }
 }
 const save=()=>void act('save'),inspect=()=>void act('inspect');
 els['team-manual-save'].addEventListener('click',save);
 els['team-manual-inspect'].addEventListener('click',inspect);
 const unsubscribe=client.subscribe(render);
 return Object.freeze({dispose(){
   if(dead)return;dead=true;clear();
   els['team-manual-secret'].value='';
   els['team-manual-consent'].checked=false;
   els['team-manual-save'].removeEventListener('click',save);
   els['team-manual-inspect'].removeEventListener('click',inspect);
   unsubscribe();
 }});
}
return Object.freeze({mount});
}));