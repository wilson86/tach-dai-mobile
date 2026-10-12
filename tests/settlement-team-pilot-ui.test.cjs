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
function harness(){
 const ids=['team-login','team-subject','team-password','team-workspace',
  'team-logout','team-partner','team-date','team-region','team-create',
  'team-sync','team-pull','team-reconnect','team-read','team-context',
  'team-warning','team-drafts','team-changes','team-notice'];
 const els=Object.fromEntries(ids.map(id=>[id,element()]));
 const doc={
   getElementById:id=>els[id]||null,
   createElement:tag=>{assert.equal(tag,'li');return element();}
 };
 const win=element();win.confirm=()=>false;
 const state={authenticated:false,workspace_id:null,drafts:[]};
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
     if(draft)draft.status='SYNCED';notify();return {...draft};
   },
   async readScope(scope){calls.push('readScope');return {status:'SYNCED',scope:{...scope,revision:1}};},
   async pullChanges(){
     calls.push('pullChanges');requestCount++;
     return {status:'SYNCED',items:[{event_id:'synthetic_safe_event'}]};
   },
   async reconnect(){calls.push('reconnect');return {pull:{status:'SYNCED'}};},
   async logout(){
     calls.push('logout');state.authenticated=false;state.workspace_id=null;
     state.drafts=[];notify();return {authenticated:false};
   }
 };
 Object.assign(els['team-subject'],{value:'fake_user'});
 Object.assign(els['team-password'],{value:'synthetic-secret'});
 Object.assign(els['team-workspace'],{value:'group_a'});
 Object.assign(els['team-partner'],{value:'fake_partner_1'});
 Object.assign(els['team-date'],{value:'2026-10-12'});
 Object.assign(els['team-region'],{value:'mn'});
 const mounted=UI.mount({doc,win,client});
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
 assert.match(h.els['team-notice'].textContent,/revision 1/);
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
