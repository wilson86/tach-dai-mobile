(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KtsTeamPilotUI=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Opt-in, synthetic-only, no production or automatic server startup.
const PARTNER=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
const IDS=['team-login','team-subject','team-password','team-workspace',
 'team-logout','team-partner','team-date','team-region','team-create',
 'team-sync','team-pull','team-reconnect','team-read','team-context',
 'team-warning','team-drafts','team-changes','team-notice'];
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
  function render(state){
    if(dead)return;
    e['team-context'].textContent=state.authenticated?
      'Đã đăng nhập: '+String(state.workspace_id||'unknown'):'Chưa đăng nhập';
    const unsent=state.drafts.filter(x=>x.status!=='SYNCED').length;
    e['team-warning'].textContent=unsent>0?
      'CẢNH BÁO: '+unsent+' bản nháp MEMORY_ONLY chưa ghi máy chủ; tải lại/đóng trang sẽ mất.':
      'MEMORY_ONLY — chưa có lưu ngoại tuyến bền vững; bản nháp mới có thể mất khi tải lại.';
    for(const id of ['team-logout','team-create','team-sync','team-pull','team-reconnect','team-read'])
      e[id].disabled=busy||!state.authenticated;
    e['team-login'].querySelector('button[type="submit"]').disabled=busy||state.authenticated;
    clear(e['team-drafts']);
    for(const x of state.drafts)row(e['team-drafts'],x.id+' • '+x.status+(x.error?' • '+x.error:''));
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
    tell('Đăng nhập pilot thành công. Chỉ dùng dữ liệu giả.');
  });});
  on(e['team-logout'],'click',()=>void action(async()=>{
    const n=sync.snapshot().drafts.filter(x=>x.status!=='SYNCED').length;
    if(n>0&&!w.confirm('Có '+n+' nháp chưa ghi! Đăng xuất sẽ xóa nháp. Đồng ý?'))return;
    await sync.logout({discardPending:n>0});
    clear(e['team-changes']);tell('Đã đăng xuất.');
  }));
  on(e['team-create'],'click',()=>void action(async()=>{
    const draft=sync.queueDraft(scope(),
      {synthetic:true,demo_message:'TEAM_PILOT_FAKE_DATA_ONLY'});
    tell(draft.id+' PENDING: chỉ có trong bộ nhớ, chưa ghi máy chủ.');
  }));
  on(e['team-sync'],'click',()=>void action(async()=>{
    for(const x of sync.snapshot().drafts.filter(z=>z.status==='PENDING'))
      await sync.syncDraft(x.id);
    tell('Chỉ những DRAFT SYNCED với receipt hợp lệ mới đã ghi máy chủ.');
  }));
  on(e['team-read'],'click',()=>void action(async()=>{
    const r=await sync.readScope(scope());
    tell('Đọc scope: '+r.status+(r.scope?' • revision '+r.scope.revision:''));
  }));
  on(e['team-pull'],'click',()=>void action(async()=>{
    const r=await sync.pullChanges();clear(e['team-changes']);
    if(r.status==='SYNCED'&&Array.isArray(r.items))
      for(const item of r.items)row(e['team-changes'],String(item.event_id||'fake_event'));
    tell('Lịch sử: '+r.status+(r.error?' • '+r.error:''));
  }));
  on(e['team-reconnect'],'click',()=>void action(async()=>{
    const r=await sync.reconnect();
    tell('Kết nối lại: '+r.pull.status+'. Xung đột cần người duyệt.');
  }));
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