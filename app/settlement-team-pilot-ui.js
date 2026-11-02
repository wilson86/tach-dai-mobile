(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./settlement-team-review-audit.js'));
  else root.KtsTeamPilotUI=factory(root.KtsTeamReviewAudit);
}(typeof globalThis!=='undefined'?globalThis:this,function(Audit){
'use strict';
// Opt-in, synthetic-only, no production or automatic server startup.
const PARTNER=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
function validBusinessDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1];
}
const MAX_VISIBLE_EVENTS=500;
const REVIEW_LABELS=Object.freeze({
  DRAFT:'DRAFT — bản nháp',
  PENDING_REVIEW:'PENDING_REVIEW — chờ người duyệt',
  REVIEWED:'REVIEWED — đã có người duyệt',
  CLOSED:'CLOSED — đã khóa',
  REOPEN_REQUESTED:'REOPEN_REQUESTED — yêu cầu mở lại'
});
const IDS=['team-login','team-subject','team-password','team-workspace',
 'team-logout','team-partner','team-directory','team-counterparties','team-date','team-region','team-create',
 'team-sync','team-pull','team-reconnect','team-read','team-context',
 'team-warning','team-drafts','team-changes','team-notice','team-review-readonly',
 'team-recovery-controls','team-reconcile','team-recovery-readonly',
 'team-review-controls','team-submit-review','team-approve-review','team-review-attempts',
 'team-review-audit','team-feed-progress'];
function mount({doc,win,client,Sync,syntheticReviewUiEnabled=false,syntheticRecoveryUiEnabled=false}={}){
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
  if(!Audit||typeof Audit.auditRows!=='function'||typeof Audit.displayRow!=='function')
    throw Error('TEAM_REVIEW_AUDIT_DEPENDENCY_REQUIRED');
  if(typeof syntheticReviewUiEnabled!=='boolean')
    throw Error('TEAM_PILOT_REVIEW_CONFIG_INVALID');
  if(syntheticReviewUiEnabled && typeof sync.reviewScope!=='function')
    throw Error('TEAM_PILOT_REVIEW_CLIENT_REQUIRED');
  if(typeof syntheticRecoveryUiEnabled!=='boolean')
    throw Error('TEAM_RECOVERY_UI_CONFIG_INVALID');
  if(syntheticRecoveryUiEnabled && typeof sync.inspectRecoveryReceipts!=='function')
    throw Error('TEAM_RECOVERY_UI_CLIENT_REQUIRED');
  let busy=false,dead=false,notice='',unsubscribe,verifiedScope=null;
  let verifiedEventIds=[],verifiedAuditRows=[],historyTruncated=false,observedSessionEpoch=null;
  let feedHasMore=null,feedStale=false;
  let selectionEpoch=0,identityEpoch=0; // Detect scope ABA and external session rotation.
  const listeners=[];
  function on(el,name,handler){el.addEventListener(name,handler);listeners.push([el,name,handler]);}
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
  function row(el,value){const li=d.createElement('li');li.textContent=String(value);el.appendChild(li);}
  function tell(value){if(dead)return;notice=String(value);e['team-notice'].textContent=notice;}
  function renderFeedProgress(){
    const next=feedHasMore===true?'CÒN TRANG: nhấn Đọc change feed để tiếp tục':
      feedHasMore===false?'Đã đến cuối tại lần kiểm tra (có thể có sự kiện mới)':
      'Chưa xác minh đã đọc hết các trang';
    e['team-feed-progress'].textContent='Trong phiên: '+verifiedEventIds.length+
      ' sự kiện, '+verifiedAuditRows.length+' xét duyệt • '+next+
      (historyTruncated?' • Chỉ giữ 500 sự kiện gần nhất':'')+
      (feedStale?' • Lần đọc gần nhất CHƯA XÁC MINH':'')+
      ' • MEMORY_ONLY, không phải toàn bộ lịch sử.';
  }
  function clearVerifiedHistory(){
    verifiedEventIds=[];verifiedAuditRows=[];historyTruncated=false;
    feedHasMore=null;feedStale=false;
    clear(e['team-changes']);clear(e['team-review-audit']);
    renderFeedProgress();
  }
  function clearRecovery(){
    e['team-recovery-readonly'].textContent='CHƯA XÁC MINH receipt. Không tự gửi lại.';
  }
  function clearReview(){
    verifiedScope=null;
    e['team-review-readonly'].textContent='CHƯA XÁC MINH trạng thái xét duyệt từ máy chủ.';
    for(const id of ['team-submit-review','team-approve-review'])e[id].disabled=true;
  }
  function sameScope(a,b){
    return Boolean(a&&b) && ['workspace_id','partner_id','business_date','region']
      .every(key=>a[key]===b[key]);
  }
  function render(state){
    if(dead)return;
    // A session rotation can occur outside this page's explicit login/logout
    // handlers. Never retain a prior actor's observed tenant audit timeline.
    if(Number.isSafeInteger(state.session_epoch)&&
       state.session_epoch!==observedSessionEpoch){
      observedSessionEpoch=state.session_epoch;
      identityEpoch++;selectionEpoch++;
      clearVerifiedHistory();
      clearReview();clearRecovery();
    }
    e['team-context'].textContent=state.authenticated?
      'Đã đăng nhập: '+String(state.workspace_id||'unknown'):'Chưa đăng nhập';
    const reviews=Array.isArray(state.review_attempts)?state.review_attempts:[];
    const unsent=state.drafts.filter(x=>x.status!=='SYNCED').length+
      reviews.filter(x=>x.status!=='SYNCED').length;
    const needsReconciliation=state.drafts.filter(x=>x.status==='NEEDS_RECONCILIATION').length+
      reviews.filter(x=>x.status==='NEEDS_RECONCILIATION').length;
    const persistence=state.draft_persistence;
    if(persistence==='STORAGE_FAILED'||persistence==='STORAGE_CORRUPT')
      e['team-warning'].textContent='CẢNH BÁO: không thể lưu an toàn DRAFT PENDING trên thiết bị ('+persistence+'). Không gửi DRAFT; sao chép bằng chứng và liên hệ người vận hành.';
    else if(persistence==='LOCAL_STORAGE')
      e['team-warning'].textContent=unsent>0?
        'DRAFT PENDING được giữ cục bộ theo tài khoản/workspace; CHƯA có receipt xác minh nên không được coi là đã lưu trên máy chủ.':
        'Không có DRAFT PENDING cục bộ. Chỉ SYNCED có receipt xác minh mới được coi là đã lưu.';
    else e['team-warning'].textContent=unsent>0?
      'CẢNH BÁO: '+unsent+' bản nháp/yêu cầu duyệt MEMORY_ONLY CHƯA có receipt xác minh; có thể đã tới máy chủ, không được coi là đã lưu. Tải lại/đóng trang sẽ mất bản nháp cục bộ.':
      'MEMORY_ONLY — chưa có lưu ngoại tuyến bền vững; bản nháp mới có thể mất khi tải lại.';
    if(needsReconciliation>0)
      e['team-warning'].textContent+=' DỪNG GỬI: '+needsReconciliation+
        ' giao dịch NEEDS_RECONCILIATION. KHÔNG thử gửi lại; phải đối soát receipt máy chủ trước.';
    for(const id of ['team-logout','team-directory','team-create','team-sync','team-pull','team-reconnect','team-read'])
      e[id].disabled=busy||!state.authenticated;
    e['team-sync'].disabled=busy||!state.authenticated||
      !state.drafts.some(x=>x.status==='PENDING');
    e['team-login'].querySelector('button[type="submit"]').disabled=busy||state.authenticated;
    e['team-review-controls'].hidden=!syntheticReviewUiEnabled;
    e['team-recovery-controls'].hidden=!syntheticRecoveryUiEnabled;
    e['team-reconcile'].disabled=busy||!state.authenticated||!syntheticRecoveryUiEnabled||
      !state.drafts.some(x=>x.status==='NEEDS_RECONCILIATION');
    const hasDrafts=state.drafts.some(x=>x.status!=='SYNCED');
    const hasOtherPending=reviews.some(x=>x.status!=='SYNCED' &&
      (!verifiedScope || !sameScope(x.scope,verifiedScope) ||
       x.expected_revision!==Number(verifiedScope.revision)));
    const reviewButton=(action,stateName)=>{
      const hasExistingAttempt=reviews.some(x=>x.action===action &&
        sameScope(x.scope,verifiedScope) &&
        x.expected_revision===Number(verifiedScope&&verifiedScope.revision));
      e[action==='submit_review'?'team-submit-review':'team-approve-review'].disabled=
        busy||!state.authenticated||!syntheticReviewUiEnabled||!verifiedScope||
        verifiedScope.state!==stateName||hasDrafts||hasOtherPending||hasExistingAttempt||
        reviews.some(x=>x.status==='PENDING'&&x.action!==action);
    };
    reviewButton('submit_review','DRAFT');
    reviewButton('approve_review','PENDING_REVIEW');
    clear(e['team-review-attempts']);
    for(const x of reviews)row(e['team-review-attempts'],
      x.action+' • '+x.status+(x.error?' • '+x.error:''));
    clear(e['team-drafts']);
    for(const x of state.drafts)row(e['team-drafts'],x.id+' • '+x.status+(x.error?' • '+x.error:''));
  }
  // Only the sync client's verified receipt may mark a draft SYNCED.
  // Do not collapse offline, conflict, and rejection into a generic success.
  function draftOutcome(items){
    const counts={SYNCED:0,PENDING:0,CONFLICT:0,BLOCKED:0,NEEDS_RECONCILIATION:0};
    for(const item of items){
      if(Object.prototype.hasOwnProperty.call(counts,item.status))counts[item.status]++;
      else counts.BLOCKED++; // Unknown state must never be presented as saved.
    }
    const parts=[];
    if(counts.SYNCED)parts.push(counts.SYNCED+' SYNCED (receipt máy chủ hợp lệ)');
    if(counts.PENDING)parts.push(counts.PENDING+' PENDING (chưa có receipt)');
    if(counts.CONFLICT)parts.push(counts.CONFLICT+' CONFLICT (cần người duyệt)');
    if(counts.BLOCKED)parts.push(counts.BLOCKED+' BLOCKED (chưa xác minh)');
    if(counts.NEEDS_RECONCILIATION)
      parts.push(counts.NEEDS_RECONCILIATION+' NEEDS_RECONCILIATION (KHÔNG gửi lại; cần đối soát receipt)');
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
       !validBusinessDate(business_date)||
       !['mn','mt','mb'].includes(region))
      throw Error('TEAM_PILOT_SCOPE_INVALID');
    return {workspace_id,partner_id,business_date,region};
  }
  on(e['team-login'],'submit',event=>{event.preventDefault();void action(async()=>{
    const subject=e['team-subject'].value.trim(),pwd=e['team-password'].value,
      workspace=e['team-workspace'].value.trim();
    e['team-password'].value='';
    await sync.login(subject,pwd,workspace);
    clearVerifiedHistory(); // Never display another session's previously read feed.
    clearReview();
    clear(e['team-counterparties']);
    tell('Đăng nhập pilot thành công. Chỉ dùng dữ liệu giả.');
  });});
  on(e['team-directory'],'click',()=>void action(async()=>{
    if(typeof sync.listCounterparties!=='function')throw Error('TEAM_PILOT_DIRECTORY_UNAVAILABLE');
    const startIdentity=identityEpoch;
    const result=await sync.listCounterparties();
    if(dead||startIdentity!==identityEpoch||!sync.snapshot().authenticated){
      clear(e['team-counterparties']);
      tell('CHƯA XÁC MINH danh bạ: phiên đã thay đổi trong lúc đọc.');
      return;
    }
    if(!result||result.status!=='SYNCED'||!Array.isArray(result.items)){
      tell('CHƯA XÁC MINH danh bạ: '+String(result&&result.status||'BLOCKED')+
        (result&&result.error?' • '+result.error:'')+'.');
      return;
    }
    clear(e['team-counterparties']);
    for(const item of result.items)row(e['team-counterparties'],
      item.partner_id+' • '+item.partner_kind+' • '+item.display_name);
    tell('Đã đọc '+result.items.length+' đối tác giả. Danh bạ chỉ đọc; hãy tự chọn mã trước khi tạo DRAFT.');
  }));
  on(e['team-logout'],'click',()=>void action(async()=>{
    const snap=sync.snapshot();
    const n=snap.drafts.filter(x=>x.status!=='SYNCED').length+
      (snap.review_attempts||[]).filter(x=>x.status!=='SYNCED').length;
    if(n>0&&!w.confirm('Có '+n+' giao dịch chưa xác minh. Đăng xuất sẽ ẩn dữ liệu trong phiên; bằng chứng đã lưu vẫn được giữ để đối soát. Dữ liệu MEMORY_ONLY có thể mất. Tiếp tục?'))return;
    try{
      await sync.logout({discardPending:n>0});
    }catch(err){
      if(!sync.snapshot().authenticated){
        clearVerifiedHistory(); // Do not show former user's feed after local logout.
        clearReview();
        if(err&&err.message==='SYNC_LOGOUT_REVOKE_UNVERIFIED'){
          tell('Đã xóa phiên trên trình duyệt. CHƯA XÁC MINH thu hồi phiên trên máy chủ vì lỗi mạng/phản hồi; không coi là đăng xuất máy chủ thành công.');
          return;
        }
      }
      throw err;
    }
    clearVerifiedHistory();clearReview();clear(e['team-counterparties']);
    tell('Đã đăng xuất và xác nhận máy chủ thu hồi phiên.');
  }));
  on(e['team-create'],'click',()=>void action(async()=>{
    const draft=sync.queueDraft(scope(),
      {synthetic:true,demo_message:'TEAM_PILOT_FAKE_DATA_ONLY'});
    tell(draft.id+' PENDING: chưa có receipt máy chủ; trạng thái lưu cục bộ: '+sync.snapshot().draft_persistence+'.');
  }));

  // Synthetic-only manual receipt inspection. No send/retry/status promotion.
  on(e['team-reconcile'],'click',()=>void action(async()=>{
    if(!syntheticRecoveryUiEnabled)throw Error('TEAM_RECOVERY_UI_NOT_ENABLED');
    const before=sync.snapshot(),startIdentity=identityEpoch;
    if(!before.authenticated)throw Error('AUTH_SESSION_REQUIRED');
    const drafts=before.drafts.filter(x=>x.status==='NEEDS_RECONCILIATION');
    if(drafts.length<1||drafts.length>30)throw Error('TEAM_RECOVERY_QUARANTINE_REQUIRED');
    const quarantined=drafts.map(x=>{
      if(!x||!/^draft_[a-f0-9]{32}$/.test(x.id||'')||
         x.dispatch_uncertain!==true||
         !Number.isSafeInteger(x.base_revision)||x.base_revision<0||
         !x.scope||x.scope.workspace_id!==before.workspace_id||
         !PARTNER.test(x.scope.partner_id||'')||
         !validBusinessDate(x.scope.business_date)||
         !['mn','mt','mb'].includes(x.scope.region)||
         !x.payload||x.payload.synthetic!==true)
        throw Error('TEAM_RECOVERY_QUARANTINE_REQUIRED');
      // All queued drafts originate as PENDING; this is NOT a server receipt.
      return {id:x.id,status:'QUARANTINED',original_status:'PENDING',
        auto_retry:false,scope:x.scope,payload:x.payload,base_revision:x.base_revision};
    });
    if(!w.confirm('Chỉ ĐỌC receipt cho '+quarantined.length+
      ' DRAFT GIẢ chưa rõ kết quả? Không gửi lại, không xác nhận chốt tiền.'))return;
    clearRecovery();
    const result=await sync.inspectRecoveryReceipts(quarantined,
      {syntheticOnly:true,explicitConsent:true});
    if(dead||startIdentity!==identityEpoch||
       !sync.snapshot().authenticated||
       sync.snapshot().workspace_id!==before.workspace_id){
      clearRecovery();tell('CHƯA XÁC MINH: phiên đã đổi trong lúc đối soát.');return;
    }
    if(!result||result.status!=='REVIEW_ONLY'||
       result.auto_send_enabled!==false||!Array.isArray(result.items)||
       result.items.length!==quarantined.length)
      throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
    const matched=result.items.filter(x=>x.classification==='MATCHED_SERVER_RECEIPT').length;
    if(result.items.some((x,i)=>x.id!==quarantined[i].id||
       x.auto_retry!==false||
       !['MATCHED_SERVER_RECEIPT','UNVERIFIED_NOT_SAFE_TO_RETRY'].includes(x.classification))||
       result.all_receipts_verified!==(matched===quarantined.length))
      throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
    e['team-recovery-readonly'].textContent='REVIEW_ONLY: '+matched+
      '/'+quarantined.length+' receipt được đối chiếu; '+
      (quarantined.length-matched)+' chưa xác minh. KHÔNG tự gửi lại; DRAFT vẫn NEEDS_RECONCILIATION.';
    tell('Đối soát CHỈ ĐỌC. Không có giao dịch được tự gửi hoặc tự chuyển SYNCED.');
  }));

  on(e['team-sync'],'click',()=>void action(async()=>{
    const pending=sync.snapshot().drafts.filter(z=>z.status==='PENDING');
    const results=[];
    for(const x of pending)results.push(await sync.syncDraft(x.id));
    tell('Kết quả gửi: '+draftOutcome(results)+'. Chỉ SYNCED có receipt mới được coi là đã lưu.');
  }));
  on(e['team-read'],'click',()=>void action(async()=>{
    const selected=scope(),startSelection=selectionEpoch,startIdentity=identityEpoch;
    clearReview(); // Never show a stale review while an async read is in flight.
    const r=await sync.readScope(selected);
    // The user may have edited the selected scope before this request finished.
    let current;
    try{current=scope();}catch(_){current=null;}
    if(dead||startIdentity!==identityEpoch||startSelection!==selectionEpoch||
       !sync.snapshot().authenticated||!sameScope(selected,current)){
      clearReview();
      tell('CHƯA XÁC MINH: phiên hoặc phạm vi đã thay đổi trong lúc đọc; hãy đọc lại.');
      return;
    }
    if(!r||r.status!=='SYNCED'||!r.scope||!sameScope(selected,r.scope)||
       !Number.isSafeInteger(Number(r.scope.revision))||Number(r.scope.revision)<0||
       !Object.prototype.hasOwnProperty.call(REVIEW_LABELS,r.scope.state)){
      tell('CHƯA XÁC MINH trạng thái xét duyệt: '+String(r.status||'BLOCKED')+
        (r.error?' • '+r.error:'')+'.');
      return;
    }
    verifiedScope={...r.scope};
    e['team-review-readonly'].textContent=
      'MÁY CHỦ (đã xác minh): '+REVIEW_LABELS[r.scope.state]+
      ' • revision '+String(r.scope.revision)+
      (r.scope.submitted_by?' • người gửi duyệt '+String(r.scope.submitted_by):'')+
      (r.scope.reviewed_by?' • người duyệt '+String(r.scope.reviewed_by):'')+
      '. Không có chốt tiền trong pilot.';
    tell('Đã đọc trạng thái từ máy chủ; KHÔNG phải xác nhận quyết toán tiền.');
    render(sync.snapshot());
  }));

  async function performReview(actionName,requiredState){
    if(!syntheticReviewUiEnabled)throw Error('TEAM_REVIEW_UI_NOT_ENABLED');
    const selected=scope(),previous=verifiedScope;
    const startSelection=selectionEpoch,startIdentity=identityEpoch;
    if(!previous||!sameScope(selected,previous)||previous.state!==requiredState)
      throw Error('TEAM_REVIEW_SCOPE_READ_REQUIRED');
    if(!Number.isSafeInteger(Number(previous.revision))||
       Number(previous.revision)<0)throw Error('TEAM_REVIEW_REVISION_UNVERIFIED');
    const snapshot=sync.snapshot();
    if(snapshot.drafts.some(x=>x.status!=='SYNCED'))
      throw Error('TEAM_REVIEW_UNSENT_DRAFTS');
    const attempt=(snapshot.review_attempts||[]).find(x=>x.action===actionName &&
      sameScope(x.scope,selected)&&x.expected_revision===Number(previous.revision));
    if(attempt)
      throw Error(attempt.status==='SYNCED'?'TEAM_REVIEW_REQUIRES_MANUAL_REFRESH':
        'TEAM_REVIEW_REQUIRES_MANUAL_RECONCILIATION');
    const label=actionName==='submit_review'?'GỬI DUYỆT':'PHÊ DUYỆT';
    if(!w.confirm(label+' dữ liệu GIẢ '+selected.partner_id+' / '+selected.business_date+
      ' / '+selected.region+' / revision '+previous.revision+
      '? Chỉ SYNCED với server receipt mới được ghi nhận.'))return;
    if(!attempt){
      // First submit must be based on a fresh server read. Retry after uncertain
      // network result MUST preserve old revision/idempotency key, not rebase.
      const fresh=await sync.readScope(selected);
      let current;
      try{current=scope();}catch(_){current=null;}
      if(dead||startSelection!==selectionEpoch||startIdentity!==identityEpoch||
         !sync.snapshot().authenticated||!sameScope(selected,current)||!verifiedScope||
         !sameScope(selected,verifiedScope)||
         fresh.status!=='SYNCED'||!fresh.scope||!sameScope(selected,fresh.scope)||
         fresh.scope.state!==requiredState ||
         Number(fresh.scope.revision)!==Number(previous.revision)){
        clearReview();
        tell('CHƯA GỬI: trạng thái/revision đã thay đổi; hãy đọc scope lại.');
        return;
      }
    }
    const outcome=await sync.reviewScope(actionName,selected,Number(previous.revision),
      {retryOnly:false});
    if(dead||startIdentity!==identityEpoch||
       startSelection!==selectionEpoch||!sync.snapshot().authenticated){
      clearReview();
      tell('CHƯA XÁC MINH: phiên hoặc phạm vi thay đổi trong lúc gửi yêu cầu duyệt.');
      return;
    }
    let current;
    try{current=scope();}catch(_){current=null;}
    if(!sameScope(selected,current)){
      clearReview();
      tell('Kết quả thuộc phạm vi trước; hãy đọc lại trước khi thao tác khác.');
      return;
    }
    if(outcome.status==='SYNCED'){
      // Defense in depth against a compromised/injected client reporting
      // SYNCED without the verified immutable event from the server.
      const receipt=outcome.server_result;
      if(!receipt||typeof receipt.event_id!=='string'||
         !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(receipt.event_id)){
        clearReview();tell('CHƯA XÁC MINH: thiếu biên nhận sự kiện máy chủ; không coi là đã duyệt.');
        return;
      }
      clearReview();
      tell(label+' đã ghi nhận bởi máy chủ (receipt '+String(receipt.event_id)+
        '). Hãy đọc lại scope để xem trạng thái mới. KHÔNG phải chốt tiền thật.');
    }else if(outcome.status==='PENDING'){
      tell(label+' PENDING: chưa có receipt, có thể đã COMMIT. KHÔNG nhấn lại; cần đối soát thủ công.');
    }else{
      clearReview();
      tell(label+' '+String(outcome.status||'BLOCKED')+' • '+
        String(outcome.error||'TEAM_REVIEW_NOT_VERIFIED')+'. Không tự động thử lại.');
    }
  }
  on(e['team-submit-review'],'click',()=>void action(()=>
    performReview('submit_review','DRAFT')));
  on(e['team-approve-review'],'click',()=>void action(()=>
    performReview('approve_review','PENDING_REVIEW')));
  // Both manual pull and reconnect consume the SAME server-verified page.
  // Otherwise reconnect would advance the cursor but silently hide its events.
  function acceptFeedPage(r){
    if(!r||r.status!=='SYNCED'||!Array.isArray(r.items)){
      feedStale=true;renderFeedProgress();
      return {ok:false,message:'CHƯA CẬP NHẬT change feed: '+
        String(r&&r.status||'BLOCKED')+(r&&r.error?' • '+r.error:'')+
        '. Danh sách đang hiển thị là lần đọc trước.'};
    }
    let auditRows;
    try{auditRows=Audit.auditRows(r.items,sync.snapshot().workspace_id);}
    catch(_){
      feedStale=true;renderFeedProgress();
      return {ok:false,message:'CHƯA XÁC MINH lịch sử xét duyệt. Danh sách đang hiển thị là lần đọc trước.'};
    }
    const newIds=r.items.map(item=>item.event_id);
    const known=new Set(verifiedEventIds);
    if(new Set(newIds).size!==newIds.length ||
       newIds.some(id=>typeof id!=='string'||known.has(id)) ||
       (r.has_more!=null&&typeof r.has_more!=='boolean') ||
       (r.has_more===true&&newIds.length===0)){
      feedStale=true;renderFeedProgress();
      return {ok:false,message:'CHƯA XÁC MINH change feed: trùng mã sự kiện hoặc metadata không hợp lệ; giữ lịch sử phiên đã đọc trước.'};
    }
    verifiedEventIds.push(...newIds);
    verifiedAuditRows.push(...auditRows);
    if(verifiedEventIds.length>MAX_VISIBLE_EVENTS){
      verifiedEventIds=verifiedEventIds.slice(-MAX_VISIBLE_EVENTS);
      const keep=new Set(verifiedEventIds);
      verifiedAuditRows=verifiedAuditRows.filter(x=>keep.has(x.event_id));
      historyTruncated=true;
    }
    feedHasMore=typeof r.has_more==='boolean'?r.has_more:null;
    feedStale=false;
    clear(e['team-changes']);clear(e['team-review-audit']);
    for(const id of verifiedEventIds)row(e['team-changes'],id);
    for(const item of verifiedAuditRows)row(e['team-review-audit'],Audit.displayRow(item));
    renderFeedProgress();
    return {ok:true,message:'Change feed SYNCED: '+r.items.length+' sự kiện mới; đã đọc trong phiên '+
      verifiedEventIds.length+' sự kiện / '+verifiedAuditRows.length+
      ' xét duyệt'+(historyTruncated?' (chỉ giữ '+MAX_VISIBLE_EVENTS+' gần nhất)':'')+
      '. Không phải toàn bộ lịch sử máy chủ; đóng trang sẽ xóa.'};
  }
  on(e['team-pull'],'click',()=>void action(async()=>{
    const startIdentity=identityEpoch,workspace=sync.snapshot().workspace_id;
    const page=await sync.pullChanges();
    if(dead||startIdentity!==identityEpoch||!sync.snapshot().authenticated||
       sync.snapshot().workspace_id!==workspace){
      tell('CHƯA XÁC MINH change feed: phiên đã thay đổi trong lúc đọc.');return;
    }
    const result=acceptFeedPage(page);tell(result.message);
  }));
  on(e['team-reconnect'],'click',()=>void action(async()=>{
    const startIdentity=identityEpoch,workspace=sync.snapshot().workspace_id;
    const r=await sync.reconnect();
    if(dead||startIdentity!==identityEpoch||!sync.snapshot().authenticated||
       sync.snapshot().workspace_id!==workspace){
      tell('CHƯA XÁC MINH: phiên đã thay đổi trong lúc kết nối lại.');return;
    }
    const states=r&&Array.isArray(r.drafts)?r.drafts:[];
    const progress=acceptFeedPage(r&&r.pull);
    const pullVerified=r&&r.pull&&r.pull.status==='SYNCED';
    const unattempted=!pullVerified?sync.snapshot().drafts.filter(x=>x.status==='PENDING').length:0;
    tell('Kết nối lại — change feed: '+(progress.ok?'SYNCED':'CHƯA XÁC MINH')+
      '; '+progress.message+'; DRAFT: '+draftOutcome(states)+
      (unattempted?'; CHƯA THỬ LẠI '+unattempted+
       ' bản nháp PENDING vì chưa xác minh kết nối/máy chủ':'')+
      '. Chỉ SYNCED có receipt mới được coi là đã lưu.');
  }));
  for(const id of ['team-partner','team-date','team-region']){
    const invalidate=()=>{selectionEpoch++;clearReview();render(sync.snapshot());};
    on(e[id],'input',invalidate);
    on(e[id],'change',invalidate);
  }
  on(e['team-workspace'],'change',()=>{selectionEpoch++;clearReview();render(sync.snapshot());});
  clearReview();clearRecovery();
  on(w,'beforeunload',event=>{
    if(sync.snapshot().volatile_unsent_count>0 ||
       sync.snapshot().drafts.some(x=>x.status!=='SYNCED')){
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
