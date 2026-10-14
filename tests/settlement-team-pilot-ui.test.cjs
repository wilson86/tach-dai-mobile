'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const UI=require('../app/settlement-team-pilot-ui.js');

function element(){
 const listeners=new Map();
 return {
   value:'',textContent:'',disabled:false,children:[],
   addEventListener(type,fn){listeners.set(type,fn);},
   removeEventListener(type){listeners.delete(type);},
   querySelector(){return {set disabled(v){this._disabled=v;}};},
   appendChild(child){this.children.push(child);},
   removeChild(child){const n=this.children.indexOf(child);if(n>=0)this.children.splice(n,1);},
   get firstChild(){return this.children[0]||null;},
   fire(type,event={}){const fn=listeners.get(type);if(!fn)throw Error('MISSING_HANDLER');return fn(event);}
 };
}
function harness({syncStatus='SYNCED',pullStatuses=['SYNCED'],reconnectStatus='SYNCED',reconnectDrafts=[],logoutRevokeUnverified=false,
 syntheticReviewUiEnabled=false,reviewState='DRAFT',reviewOutcomes=['SYNCED']}={}){
 const ids=['team-login','team-subject','team-password','team-workspace',
  'team-logout','team-partner','team-date','team-region','team-create',
  'team-sync','team-pull','team-reconnect','team-read','team-context',
  'team-warning','team-drafts','team-changes','team-notice','team-review-readonly',
  'team-review-controls','team-submit-review','team-approve-review','team-review-attempts'];
 const els=Object.fromEntries(ids.map(id=>[id,element()]));
 const doc={
   getElementById:id=>els[id]||null,
   createElement:tag=>{assert.equal(tag,'li');return element();}
 };
 const win=element();win.confirm=()=>false;
 const state={authenticated:false,workspace_id:null,drafts:[],review_attempts:[]};
 let listener=null,requestCount=0;const calls=[];
 const notify=()=>{if(listener)listener({...state,drafts:state.drafts.slice()});};
 const client={
   snapshot:()=>({...state,drafts:state.drafts.map(v=>({...v}))}),
   subscribe(fn){listener=fn;notify();return ()=>{listener=null;};},
   async login(subject,password,workspace){
     calls.push('login');assert.equal(password,'synthetic-secret');
     state.authenticated=true;state.workspace_id=workspace;notify();
     return {authenticated:true};
   },
   queueDraft(scope,payload){
     calls.push('queueDraft');
     assert.match(scope.partner_id,/^(fake|demo|synthetic)_/);
     assert.equal(payload.synthetic,true);
     const item={id:'draft_synthetic_1',scope,status:'PENDING'};
     state.drafts.push(item);notify();return item;
   },
   async syncDraft(id){
     calls.push('syncDraft');const draft=state.drafts.find(x=>x.id===id);
     if(draft){draft.status=syncStatus;if(syncStatus!=='SYNCED')draft.error='SYNC_NETWORK_UNAVAILABLE';}
     notify();return {...draft};
   },
   async readScope(scope){calls.push('readScope');return {status:'SYNCED',scope:{...scope,revision:1,state:reviewState}};},
   async reviewScope(action,selected,revision,options={}){
     calls.push('reviewScope');let attempt=state.review_attempts.find(
       x=>x.action===action&&x.expected_revision===revision);
     if(!attempt){
       if(options.retryOnly)throw Error('RETRY_WITHOUT_INTENT');
       attempt={action,scope:selected,expected_revision:revision,idempotency_key:'fake_same_key',status:'PENDING'};
       state.review_attempts.push(attempt);
     }
     const choice=reviewOutcomes[Math.min(calls.filter(x=>x==='reviewScope').length-1,reviewOutcomes.length-1)];
     attempt.status=choice;
     if(choice==='SYNCED')attempt.server_result={event_id:'event_review'};
     notify();return {...attempt};
   },
   async pullChanges(){
     calls.push('pullChanges');requestCount++;
     const status=pullStatuses[Math.min(requestCount-1,pullStatuses.length-1)];
     return status==='SYNCED'?{status,items:[{event_id:'synthetic_safe_event'}]}:
       {status,error:'SYNC_NETWORK_UNAVAILABLE',items:[]};
   },
   async reconnect(){calls.push('reconnect');return {pull:{status:reconnectStatus},drafts:reconnectDrafts};},
   async logout(){
     calls.push('logout');state.authenticated=false;state.workspace_id=null;
     state.drafts=[];notify();
     if(logoutRevokeUnverified)throw Error('SYNC_LOGOUT_REVOKE_UNVERIFIED');
     return {authenticated:false};
   }
 };
 Object.assign(els['team-subject'],{value:'fake_user'});
 Object.assign(els['team-password'],{value:'synthetic-secret'});
 Object.assign(els['team-workspace'],{value:'group_a'});
 Object.assign(els['team-partner'],{value:'fake_partner_1'});
 Object.assign(els['team-date'],{value:'2026-10-12'});
 Object.assign(els['team-region'],{value:'mn'});
 const mounted=UI.mount({doc,win,client,syntheticReviewUiEnabled});
 return {mounted,els,win,calls,state,notify,get requests(){return requestCount;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('standalone pilot page uses restricted same-origin CSP and never wires legacy PWA',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot.html'),'utf8');
 for(const file of ['settlement-team-sync-client.js','settlement-team-pilot-ui.js',
   'settlement-team-pilot-start.js','settlement-team-pilot.css'])
   assert.ok(html.includes(file),file);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/connect-src 'self'/);
 assert.match(html,/SYNTHETIC ONLY/);
 assert.doesNotMatch(html,/8787:(?:[0-9]+)/);
 const original=fs.readFileSync(path.join(__dirname,'../app/settlement.html'),'utf8');
 assert.doesNotMatch(original,/settlement-team-pilot-(?:ui|start)\.js/);
});
test('Team UI logs in without keeping password input then queues fake-only pending draft',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});
 await tick();
 assert.equal(h.els['team-password'].value,'');
 assert.equal(h.state.authenticated,true);
 assert.match(h.els['team-context'].textContent,/group_a/);
 h.els['team-create'].fire('click');
 await tick();
 assert.equal(h.state.drafts.length,1);
 assert.equal(h.state.drafts[0].status,'PENDING');
 assert.match(h.els['team-warning'].textContent,/MEMORY_ONLY/);
 assert.match(h.els['team-warning'].textContent,/1 bản nháp/);
 assert.equal(h.els['team-drafts'].children.length,1);
 h.mounted.dispose();
});
test('UI requires fake partner prefix and refuses real-looking counterparties',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});
 await tick();
 h.els['team-partner'].value='customer_real';
 h.els['team-create'].fire('click');
 await tick();
 assert.equal(h.state.drafts.length,0);
 assert.equal(h.els['team-notice'].textContent,'TEAM_PILOT_SCOPE_INVALID');
 h.mounted.dispose();
});
test('queued synthetic draft only becomes SYNCED after client-verified acknowledgement',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});
 await tick();
 h.els['team-create'].fire('click');
 await tick();
 h.els['team-sync'].fire('click');
 await tick();
 assert.equal(h.state.drafts[0].status,'SYNCED');
 assert.match(h.els['team-warning'].textContent,/MEMORY_ONLY/);
 h.els['team-read'].fire('click');await tick();
 assert.match(h.els['team-review-readonly'].textContent,/revision 1/);
 h.els['team-pull'].fire('click');await tick();
 assert.equal(h.els['team-changes'].children[0].textContent,'synthetic_safe_event');
 h.mounted.dispose();
});
test('logout must ask before losing unsynced draft and beforeunload warns',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});
 await tick();
 h.els['team-create'].fire('click');await tick();
 let prevented=false;
 const ev={preventDefault(){prevented=true;},returnValue:undefined};
 h.win.fire('beforeunload',ev);
 assert.equal(prevented,true);
 assert.equal(ev.returnValue,'');
 h.els['team-logout'].fire('click');await tick();
 assert.equal(h.state.authenticated,true);
 assert.equal(h.calls.includes('logout'),false);
 h.win.confirm=()=>true;
 h.els['team-logout'].fire('click');await tick();
 assert.equal(h.state.authenticated,false);
 assert.equal(h.state.drafts.length,0);
 h.mounted.dispose();
});
test('HTML remains inert without runtime: scripts have no network listener or database installer',()=>{
 const start=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot-start.js'),'utf8');
 assert.match(start,/KtsTeamPilotUI\.mount/);
 assert.doesNotMatch(start,/listen\(|tailscale|spawn\(|postgres/);
});


test('offline PENDING cannot be presented as successfully saved',async()=>{
 const h=harness({syncStatus:'PENDING'});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-create'].fire('click');await tick();
 h.els['team-sync'].fire('click');await tick();
 assert.equal(h.state.drafts[0].status,'PENDING');
 assert.match(h.els['team-notice'].textContent,/1 PENDING \(chưa có receipt\)/);
 assert.doesNotMatch(h.els['team-notice'].textContent,/1 SYNCED/);
 assert.match(h.els['team-warning'].textContent,/CHƯA có receipt/);
 h.mounted.dispose();
});
test('conflict is explicitly distinguished from saved receipt',async()=>{
 const h=harness({syncStatus:'CONFLICT'});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-create'].fire('click');await tick();
 h.els['team-sync'].fire('click');await tick();
 assert.equal(h.state.drafts[0].status,'CONFLICT');
 assert.match(h.els['team-notice'].textContent,/1 CONFLICT \(cần người duyệt\)/);
 assert.doesNotMatch(h.els['team-notice'].textContent,/1 SYNCED/);
 h.mounted.dispose();
});
test('rejected BLOCKED draft remains visibly unverified',async()=>{
 const h=harness({syncStatus:'BLOCKED'});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-create'].fire('click');await tick();
 h.els['team-sync'].fire('click');await tick();
 assert.match(h.els['team-notice'].textContent,/1 BLOCKED \(chưa xác minh\)/);
 assert.match(h.els['team-warning'].textContent,/MEMORY_ONLY/);
 h.mounted.dispose();
});
test('reconnect never treats SYNCED change feed as proof that a PENDING draft was saved',async()=>{
 const h=harness({reconnectStatus:'SYNCED',reconnectDrafts:[{status:'PENDING'}]});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-reconnect'].fire('click');await tick();
 assert.match(h.els['team-notice'].textContent,/change feed: SYNCED/);
 assert.match(h.els['team-notice'].textContent,/1 PENDING \(chưa có receipt\)/);
 h.mounted.dispose();
});
test('failed change-feed pull keeps last verified items but clearly marks them stale',async()=>{
 const h=harness({pullStatuses:['SYNCED','PENDING']});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-pull'].fire('click');await tick();
 assert.equal(h.els['team-changes'].children[0].textContent,'synthetic_safe_event');
 h.els['team-pull'].fire('click');await tick();
 assert.equal(h.els['team-changes'].children.length,1);
 assert.match(h.els['team-notice'].textContent,/CHƯA CẬP NHẬT change feed/);
 assert.match(h.els['team-notice'].textContent,/lần đọc trước/);
 h.mounted.dispose();
});

test('UI clears former user feed and warns when remote logout revocation is unverified',async()=>{
 const h=harness({logoutRevokeUnverified:true});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-pull'].fire('click');await tick();
 assert.equal(h.els['team-changes'].children.length,1);
 h.els['team-logout'].fire('click');await tick();
 assert.equal(h.state.authenticated,false);
 assert.equal(h.els['team-changes'].children.length,0);
 assert.match(h.els['team-notice'].textContent,/CHƯA XÁC MINH thu hồi phiên/);
 assert.doesNotMatch(h.els['team-notice'].textContent,/^Đã đăng xuất và xác nhận máy chủ/);
 h.mounted.dispose();
});

test('read-only reviewer status comes only from verified scope; no approval control exists',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 assert.match(h.els['team-review-readonly'].textContent,/CHƯA XÁC MINH/);
 h.els['team-read'].fire('click');await tick();
 assert.match(h.els['team-review-readonly'].textContent,/MÁY CHỦ \(đã xác minh\): DRAFT/);
 assert.match(h.els['team-review-readonly'].textContent,/revision 1/);
 h.els['team-partner'].fire('change');
 assert.match(h.els['team-review-readonly'].textContent,/CHƯA XÁC MINH/);
 h.els['team-read'].fire('click');await tick();
 assert.match(h.els['team-review-readonly'].textContent,/MÁY CHỦ/);
 h.els['team-logout'].fire('click');await tick();
 assert.match(h.els['team-review-readonly'].textContent,/CHƯA XÁC MINH/);
 const html=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot.html'),'utf8');
 assert.doesNotMatch(html,/id="team-(?:finalize|close|reopen)"/);
 h.mounted.dispose();
});

test('review buttons remain hidden and inert by default despite source markup',async()=>{
 const h=harness();
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-read'].fire('click');await tick();
 assert.equal(h.els['team-review-controls'].hidden,true);
 assert.equal(h.els['team-submit-review'].disabled,true);
 assert.equal(h.els['team-approve-review'].disabled,true);
 h.els['team-submit-review'].fire('click');await tick();
 assert.equal(h.calls.includes('reviewScope'),false);
 assert.equal(h.els['team-notice'].textContent,'TEAM_REVIEW_UI_NOT_ENABLED');
 h.mounted.dispose();
});
test('opt-in synthetic review requires fresh scope read and explicit human confirmation',async()=>{
 const h=harness({syntheticReviewUiEnabled:true});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 assert.equal(h.els['team-review-controls'].hidden,false);
 h.els['team-submit-review'].fire('click');await tick();
 assert.equal(h.calls.includes('reviewScope'),false);
 h.els['team-read'].fire('click');await tick();
 assert.equal(h.els['team-submit-review'].disabled,false);
 h.els['team-submit-review'].fire('click');await tick();
 assert.equal(h.calls.includes('reviewScope'),false);
 assert.equal(h.els['team-submit-review'].disabled,false);
 h.win.confirm=()=>true;
 h.els['team-submit-review'].fire('click');await tick();
 assert.equal(h.calls.filter(x=>x==='readScope').length,2);
 assert.equal(h.calls.filter(x=>x==='reviewScope').length,1);
 assert.match(h.els['team-notice'].textContent,/receipt event_review/);
 assert.equal(h.els['team-submit-review'].disabled,true);
 h.mounted.dispose();
});
test('phone lost response keeps review PENDING and retries identical in-memory request only by human confirmation',async()=>{
 const h=harness({syntheticReviewUiEnabled:true,reviewOutcomes:['PENDING','SYNCED']});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-read'].fire('click');await tick();
 h.win.confirm=()=>true;
 h.els['team-submit-review'].fire('click');await tick();
 assert.match(h.els['team-notice'].textContent,/PENDING/);
 assert.equal(h.els['team-submit-review'].disabled,false);
 assert.equal(h.state.review_attempts.length,1);
 assert.equal(h.state.review_attempts[0].idempotency_key,'fake_same_key');
 h.els['team-submit-review'].fire('click');await tick();
 assert.equal(h.calls.filter(x=>x==='readScope').length,2);
 assert.equal(h.calls.filter(x=>x==='reviewScope').length,2);
 assert.equal(h.state.review_attempts[0].idempotency_key,'fake_same_key');
 assert.equal(h.els['team-submit-review'].disabled,true);
 h.mounted.dispose();
});
test('approver button is only a gated test action for a freshly verified pending review',async()=>{
 const h=harness({syntheticReviewUiEnabled:true,reviewState:'PENDING_REVIEW'});
 h.els['team-login'].fire('submit',{preventDefault(){}});await tick();
 h.els['team-read'].fire('click');await tick();
 assert.equal(h.els['team-submit-review'].disabled,true);
 assert.equal(h.els['team-approve-review'].disabled,false);
 h.win.confirm=()=>true;
 h.els['team-approve-review'].fire('click');await tick();
 assert.equal(h.calls.filter(x=>x==='reviewScope').length,1);
 assert.match(h.els['team-notice'].textContent,/PHÊ DUYỆT đã ghi nhận/);
 h.mounted.dispose();
});

test('opt-in controls stay concealed when the HTML hidden flag is set',()=>{
 const stylesheet=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot.css'),'utf8');
 assert.ok(stylesheet.includes('[hidden]{display:none!important}'));
 const bootstrap=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot-start.js'),'utf8');
 assert.equal(bootstrap.includes('syntheticReviewUiEnabled:true'),false);
});
