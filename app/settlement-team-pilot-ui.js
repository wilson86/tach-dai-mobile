(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KtsTeamPilotUI=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Opt-in, synthetic-only, no production or automatic server startup.
const PARTNER=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
const REVIEW_LABELS=Object.freeze({
  DRAFT:'DRAFT — bản nháp',
  PENDING_REVIEW:'PENDING_REVIEW — chờ người duyệt',
  REVIEWED:'REVIEWED — đã có người duyệt',
  CLOSED:'CLOSED — đã khóa',
  REOPEN_REQUESTED:'REOPEN_REQUESTED — yêu cầu mở lại'
});
const IDS=['team-login','team-subject','team-password','team-workspace',
 'team-logout','team-partner','team-date','team-region','team-create',
 'team-sync','team-pull','team-reconnect','team-read','team-context',
 'team-warning','team-drafts','team-changes','team-notice','team-review-readonly'];
function mount({doc,win,client,Sync}={}){
  const d=doc||(typeof document!=='undefined'?document:null);
  const w=win||(typeof window!=='undefined'?window:null);
  const f=Sync||(typeof globalThis!=='undefined'?globalThis.KtsSettlementSyncClient:null);
  if(!d||!w||(!client&&(!f||typeof f.createSyncClient!=='function')))
    throw Error('TEAM_PILOT_UI_DEPENDENCIES_REQUIRED');
  const e=Object.fromEntries(IDS.map(id=>{
    const el=d.getElementById(id);
    if(!el)throw Error('TEAM_PILOT_UI_ELEMENT_MISSING');
    return [id,el];
  }));
  const sync=client||f.createSyncClient({baseUrl:''});
  let busy=false,dead=false,notice='',unsubscribe;
  const listeners=[];
  function on(el,name,handler){el.addEventListener(name,handler);listeners.push([el,name,handler]);}
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
  function row(el,value){const li=d.createElement('li');li.textContent=String(value);el.appendChild(li);}
  function tell(value){notice=String(value);e['team-notice'].textContent=notice;}
  function clearReview(){
    e['team-review-readonly'].textContent='CHƯA XÁC MINH trạng thái xét duyệt từ máy chủ.';
  }
  function render(state){
    if(dead)return;
    e['team-context'].textContent=state.authenticated?
      'Đã đăng nhập: '+String(state.workspace_id||'unknown'):'Chưa đăng nhập';
    const unsent=state.drafts.filter(x=>x.status!=='SYNCED').length;
    e['team-warning'].textContent=unsent>0?
      'CẢNH BÁO: '+unsent+' bản nháp MEMORY_ONLY CHƯA có receipt xác minh; có thể đã tới máy chủ, không được coi là đã lưu. Tải lại/đóng trang sẽ mất bản nháp cục bộ.':
      'MEMORY_ONLY — chưa có lưu ngoại tuyến bền vững; bản nháp mới có thể mất khi tải lại.';
    for(const id of ['team-logout','team-create','team-sync','team-pull','team-reconnect','team-read'])
      e[id].disabled=busy||!state.authenticated;
    e['team-login'].querySelector('button[type="submit"]').disabled=busy||state.authenticated;
    clear(e['team-drafts']);
    for(const x of state.drafts)row(e['team-drafts'],x.id+' • '+x.status+(x.error?' • '+x.error:''));
  }
  // Only the sync client's verified receipt may mark a draft SYNCED.
  // Do not collapse offline, conflict, and rejection into a generic success.
  function draftOutcome(items){
    const counts={SYNCED:0,PENDING:0,CONFLICT:0,BLOCKED:0};
    for(const item of items){
      if(Object.prototype.hasOwnProperty.call(counts,item.status))counts[item.status]++;
      else counts.BLOCKED++; // Unknown state must never be presented as saved.
    }
    const parts=[];
    if(counts.SYNCED)parts.push(counts.SYNCED+' SYNCED (receipt máy chủ hợp lệ)');
    if(counts.PENDING)parts.push(counts.PENDING+' PENDING (chưa có receipt)');
    if(counts.CONFLICT)parts.push(counts.CONFLICT+' CONFLICT (cần người duyệt)');
    if(counts.BLOCKED)parts.push(counts.BLOCKED+' BLOCKED (chưa xác minh)');
    return parts.length?parts.join('; '):'không có bản nháp cần gửi';
  }
  async function action(fn){
    if(dead||busy)return;
    busy=true;render(sync.snapshot());
    try{await fn();}
    catch(err){
      const code=err&&err.message;
      tell(typeof code==='string'&&/^(?:AUTH_|TEAM_|SYNC_)[A-Z0-9_]{1,72}$/.test(code)?
        code:'TEAM_PILOT_REQUEST_FAILED');
    }finally{busy=false;render(sync.snapshot());}
  }
  function scope(){
    const workspace_id=sync.snapshot().workspace_id;
    const partner_id=e['team-partner'].value.trim();
    const business_date=e['team-date'].value;
    const region=e['team-region'].value;
    if(!workspace_id||!PARTNER.test(partner_id)||
       !/^\d{4}-\d{2}-\d{2}$/.test(business_date)||
       !['mn','mt','mb'].includes(region))
      throw Error('TEAM_PILOT_SCOPE_INVALID');
    return {workspace_id,partner_id,business_date,region};
  }
  on(e['team-login'],'submit',event=>{event.preventDefault();void action(async()=>{
    const subject=e['team-subject'].value.trim(),pwd=e['team-password'].value,
      workspace=e['team-workspace'].value.trim();
    e['team-password'].value='';
    await sync.login(subject,pwd,workspace);
    clear(e['team-changes']); // Never display another session's previously read feed.
    clearReview();
    tell('Đăng nhập pilot thành công. Chỉ dùng dữ liệu giả.');
  });});
  on(e['team-logout'],'click',()=>void action(async()=>{
    const n=sync.snapshot().drafts.filter(x=>x.status!=='SYNCED').length;
    if(n>0&&!w.confirm('Có '+n+' nháp chưa ghi! Đăng xuất sẽ xóa nháp. Đồng ý?'))return;
    try{
      await sync.logout({discardPending:n>0});
    }catch(err){
      if(!sync.snapshot().authenticated){
        clear(e['team-changes']); // Do not show former user's feed after local logout.
        clearReview();
        if(err&&err.message==='SYNC_LOGOUT_REVOKE_UNVERIFIED'){
          tell('Đã xóa phiên trên trình duyệt. CHƯA XÁC MINH thu hồi phiên trên máy chủ vì lỗi mạng/phản hồi; không coi là đăng xuất máy chủ thành công.');
          return;
        }
      }
      throw err;
    }
    clear(e['team-changes']);clearReview();
    tell('Đã đăng xuất và xác nhận máy chủ thu hồi phiên.');
  }));
  on(e['team-create'],'click',()=>void action(async()=>{
    const draft=sync.queueDraft(scope(),
      {synthetic:true,demo_message:'TEAM_PILOT_FAKE_DATA_ONLY'});
    tell(draft.id+' PENDING: chỉ có trong bộ nhớ, chưa ghi máy chủ.');
  }));
  on(e['team-sync'],'click',()=>void action(async()=>{
    const pending=sync.snapshot().drafts.filter(z=>z.status==='PENDING');
    const results=[];
    for(const x of pending)results.push(await sync.syncDraft(x.id));
    tell('Kết quả gửi: '+draftOutcome(results)+'. Chỉ SYNCED có receipt mới được coi là đã lưu.');
  }));
  on(e['team-read'],'click',()=>void action(async()=>{
    const selected=scope();
    clearReview(); // Never show a stale review while an async read is in flight.
    const r=await sync.readScope(selected);
    // The user may have edited the selected scope before this request finished.
    let current;
    try{current=scope();}catch(_){current=null;}
    if(!current||Object.keys(selected).some(key=>selected[key]!==current[key])){
      tell('CHƯA XÁC MINH: phạm vi đã thay đổi trong lúc đọc; hãy đọc lại.');
      return;
    }
    if(r.status!=='SYNCED'||!r.scope||!Object.prototype.hasOwnProperty.call(REVIEW_LABELS,r.scope.state)){
      tell('CHƯA XÁC MINH trạng thái xét duyệt: '+String(r.status||'BLOCKED')+
        (r.error?' • '+r.error:'')+'.');
      return;
    }
    e['team-review-readonly'].textContent=
      'MÁY CHỦ (chỉ đọc): '+REVIEW_LABELS[r.scope.state]+
      ' • revision '+String(r.scope.revision)+'. Chưa có chức năng duyệt/khóa trong pilot.';
    tell('Đã đọc trạng thái từ máy chủ; KHÔNG phải xác nhận quyết toán tiền.');
  }));
  on(e['team-pull'],'click',()=>void action(async()=>{
    const r=await sync.pullChanges();
    if(r.status==='SYNCED'&&Array.isArray(r.items)){
      clear(e['team-changes']);
      for(const item of r.items)row(e['team-changes'],String(item.event_id||'fake_event'));
      tell('Change feed SYNCED: '+r.items.length+' sự kiện được xác minh.');
    }else{
      tell('CHƯA CẬP NHẬT change feed: '+String(r.status||'BLOCKED')+
        (r.error?' • '+r.error:'')+'. Danh sách đang hiển thị là lần đọc trước.');
    }
  }));
  on(e['team-reconnect'],'click',()=>void action(async()=>{
    const r=await sync.reconnect();
    const states=Array.isArray(r.drafts)?r.drafts:[];
    const feed=r.pull&&r.pull.status==='SYNCED'?'SYNCED':'CHƯA XÁC MINH';
    tell('Kết nối lại — change feed: '+feed+'; DRAFT: '+draftOutcome(states)+
      '. Chỉ SYNCED có receipt mới được coi là đã lưu.');
  }));
  for(const id of ['team-partner','team-date','team-region'])
    on(e[id],'change',clearReview);
  on(e['team-workspace'],'change',clearReview);
  clearReview();
  on(w,'beforeunload',event=>{
    if(sync.snapshot().drafts.some(x=>x.status!=='SYNCED')){
      event.preventDefault();event.returnValue='';
    }
  });
  unsubscribe=sync.subscribe(render);
  return Object.freeze({client:sync,dispose(){
    if(dead)return;dead=true;if(unsubscribe)unsubscribe();
    for(const [el,name,handler] of listeners)el.removeEventListener(name,handler);
  }});
}
return Object.freeze({mount,PARTNER});
}));