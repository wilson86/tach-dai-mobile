'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const UI=require('../app/settlement-team-manual-ui.js');
function elem(){
 const callbacks=new Map();
 return {value:'',checked:false,disabled:false,textContent:'',children:[],
  addEventListener(n,fn){callbacks.set(n,fn);},
  removeEventListener(n){callbacks.delete(n);},
  get firstChild(){return this.children[0]||null;},
  removeChild(x){this.children.splice(this.children.indexOf(x),1);},
  appendChild(x){this.children.push(x);},
  click(){callbacks.get('click')?.();}
 };
}
const ids=['team-manual-secret','team-manual-consent','team-manual-save',
 'team-manual-inspect','team-manual-notice','team-manual-items'];
function setup(){
 const nodes=Object.fromEntries(ids.map(k=>[k,elem()]));
 const state={authenticated:false,workspace_id:null,session_epoch:0,drafts:[]};
 let notify=null;
 const client={
  snapshot:()=>structuredClone(state),
  subscribe(fn){notify=fn;fn(client.snapshot());return()=>{notify=null;};},
  verifyActor:async()=>({server_verified:true})
 };
 const seen=[];
 const bridge={
  async save(o){seen.push(['save',o]);return {status:'ENCRYPTED_ADAPTER_ACK',
   durability:'UNVERIFIED',auto_send_enabled:false,draft_count:1};},
  async inspect(o){seen.push(['inspect',o]);return {status:'QUARANTINED',
   durability:'UNVERIFIED',auto_send_enabled:false,items:[{
    id:'draft_'+'a'.repeat(32),status:'QUARANTINED',original_status:'PENDING',
    auto_retry:false,payload:{synthetic:true,memo:'NEVER_DISPLAY'}
   }]};}
 };
 const calls=[];
 const Checkpoint={createSyntheticManualCheckpoint(cfg){
  calls.push('checkpoint');assert.equal(cfg.sync,client);
  assert.equal(cfg.syntheticOnly,true);return bridge;
 }};
 const Idb={createSyntheticIndexedDbStore(cfg){
  calls.push('store');assert.equal(cfg.syntheticOnly,true);return {read(){},writeIfAbsent(){}};}};
 let approved=true;
 const win={isSecureContext:true,indexedDB:{},crypto:{},confirm:()=>approved};
 const doc={getElementById:id=>nodes[id]||null,createElement:tag=>{
  assert.equal(tag,'li');return elem();}};
 const mounted=UI.mount({doc,win,client,Checkpoint,Idb,syntheticOnly:true});
 const login=()=>{state.authenticated=true;state.workspace_id='group_a';
  state.session_epoch++;state.drafts=[{status:'PENDING'}];notify(client.snapshot());};
 const logout=()=>{state.authenticated=false;state.workspace_id=null;
  state.session_epoch++;state.drafts=[];notify(client.snapshot());};
 return {nodes,state,seen,calls,mounted,login,logout,
  denyConsent:()=>{approved=false;},notify:()=>notify?.(client.snapshot())};
}
const flush=()=>new Promise(ok=>setImmediate(ok));
test('default off without syntheticOnly and secure browser context',()=>{
 assert.throws(()=>UI.mount({}),/TEAM_MANUAL_UI_DISABLED/);
 const f=fs.readFileSync(path.join(__dirname,'../app/settlement-team-pilot.html'),'utf8');
 assert.doesNotMatch(f,/settlement-team-manual-ui|settlement-team-manual-start/);
 const preview=fs.readFileSync(path.join(__dirname,'../app/settlement-team-manual-pilot.html'),'utf8');
 assert.match(preview,/SYNTHETIC ONLY/);
 assert.match(preview,/settlement-team-manual-start\.js/);
 assert.match(preview,/settlement-team-manual-ui\.js/);
});
test('login gate, explicit consent, and secret wiped on denial',async()=>{
 const h=setup(),n=h.nodes;
 assert.equal(n['team-manual-save'].disabled,true);
 assert.equal(n['team-manual-inspect'].disabled,true);
 assert.deepEqual(h.seen,[]);
 h.login();
 assert.equal(n['team-manual-save'].disabled,false);
 n['team-manual-secret'].value='synthetic-separate-secret-123';
 n['team-manual-save'].click();
 await flush();
 assert.match(n['team-manual-notice'].textContent,/TEAM_MANUAL_UI_CONSENT_REQUIRED/);
 assert.equal(n['team-manual-secret'].value,'');
 assert.deepEqual(h.seen,[]);
 h.mounted.dispose();
});
test('explicit manual save is one-way, no plaintext report and consent is single-use',async()=>{
 const h=setup(),n=h.nodes;h.login();
 n['team-manual-secret'].value='synthetic-separate-secret-123';
 n['team-manual-consent'].checked=true;n['team-manual-save'].click();
 await flush();
 assert.equal(h.seen.length,1);
 assert.equal(h.seen[0][0],'save');
 assert.equal(h.seen[0][1].explicitConsent,true);
 assert.equal(n['team-manual-secret'].value,'');
 assert.equal(n['team-manual-consent'].checked,false);
 assert.match(n['team-manual-notice'].textContent,/độ bền CHƯA XÁC MINH/);
 assert.equal(n['team-manual-items'].children.length,0);
 h.mounted.dispose();
});
test('explicit inspect renders IDs only, session switch hides prior actor',async()=>{
 const h=setup(),n=h.nodes;h.login();
 n['team-manual-secret'].value='synthetic-separate-secret-123';
 n['team-manual-consent'].checked=true;n['team-manual-inspect'].click();
 await flush();
 assert.equal(h.seen.length,1);
 assert.equal(h.seen[0][0],'inspect');
 assert.equal(n['team-manual-items'].children.length,1);
 const shown=n['team-manual-items'].children[0].textContent;
 assert.match(shown,/QUARANTINED/);assert.match(shown,/không gửi lại/);
 assert.doesNotMatch(shown,/NEVER_DISPLAY/);
 h.logout();
 assert.equal(n['team-manual-items'].children.length,0);
 assert.equal(n['team-manual-inspect'].disabled,true);
 h.mounted.dispose();
});
test('rejected operator confirmation does not access checkpoint',async()=>{
 const h=setup(),n=h.nodes;h.login();h.denyConsent();
 n['team-manual-secret'].value='synthetic-separate-secret-123';
 n['team-manual-consent'].checked=true;n['team-manual-save'].click();
 await flush();
 assert.deepEqual(h.seen,[]);
 assert.match(n['team-manual-notice'].textContent,/TEAM_MANUAL_UI_CONFIRM_REQUIRED/);
 h.mounted.dispose();
});
test('dispose removes manual actions and scrubs typed secret',async()=>{
 const h=setup(),n=h.nodes;h.login();
 n['team-manual-secret'].value='synthetic-separate-secret-123';
 h.mounted.dispose();
 assert.equal(n['team-manual-secret'].value,'');
 n['team-manual-consent'].checked=true;n['team-manual-save'].click();
 await flush();assert.deepEqual(h.seen,[]);
});
