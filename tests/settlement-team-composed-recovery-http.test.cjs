'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');
const TOKEN='a'.repeat(43);
const scope={workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'};
const quarantined={id:'draft_'+'a'.repeat(32),status:'QUARANTINED',
 original_status:'PENDING',auto_retry:false,base_revision:0,scope,
 payload:{synthetic:true,memo:'NEVER_RETURN_PLAINTEXT'}};
const hash=digest({action:'create_draft',scope,expected_revision:0,payload:quarantined.payload});
const receipt={workspace_id:'group_a',idempotency_key:quarantined.id,
 request_sha256:hash,payload_sha256:hash,event_id:'fake_event_a',
 actor_user_id:'fake_operator',partner_id:scope.partner_id,
 business_date:scope.business_date,region:'mn',
 event_kind:'DRAFT_CREATED',scope_revision:1,feed_seq:'1'};
function pool(kind,records,notes,role='operator'){
 return {async connect(){
  notes.push(kind+':CONNECT');
  return {
   async query(sql,args){
    notes.push(kind+':'+sql.trim().split(/\s+/).slice(0,4).join(' '));
    if(['BEGIN','COMMIT','ROLLBACK','SET TRANSACTION READ ONLY'].includes(sql))
     return {rows:[],rowCount:0};
    if(sql.includes("set_config"))return {rows:[]};
    if(kind==='auth'&&sql.includes('FROM kts_auth.sessions'))
     return {rows:[{user_id:'fake_operator',workspace_id:'group_a'}]};
    if(sql.includes('FROM kts_team.memberships'))
     return {rows:[{team_role:role}]};
    if(kind==='ledger'&&sql.includes('FROM kts_team.idempotency_receipts')){
     assert.deepEqual(args,['group_a','fake_operator',[quarantined.id]]);
     return {rows:records};
    }
    throw Error('UNEXPECTED_SYNTHETIC_SQL_'+kind);
   },
   release(destroy){notes.push(kind+':RELEASE_'+Boolean(destroy));}
  };
 }};
}
async function call(host,body){
 const r=await fetch(host+'/v1/recovery/receipts/inspect',{
  method:'POST',headers:{authorization:'Bearer '+TOKEN,
   'content-type':'application/json'},
  body:JSON.stringify({explicit_consent:true,quarantined:[body]})});
 return {status:r.status,body:await r.json()};
}
async function trial({records=[receipt],role='operator'}={}){
 const notes=[];
 const app=createIsolatedTeamPrototype({syntheticOnly:true,
  syntheticRecoveryInspectEnabled:true,
  authPool:pool('auth',[],notes,role),
  ledgerPool:pool('ledger',records,notes,role)});
 assert.equal(notes.length,0);
 assert.equal(app.server.listening,false);
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const host='http://127.0.0.1:'+app.server.address().port;
 try{return {result:await call(host,quarantined),notes};}
 finally{await new Promise(ok=>app.server.close(ok));}
}
test('real prototype composition HTTP -> session -> READ ONLY ledger -> minimal matched result',async()=>{
 const {result,notes}=await trial();
 assert.equal(result.status,200);
 assert.deepEqual(result.body,{status:'REVIEW_ONLY',
  auto_send_enabled:false,all_receipts_verified:true,
  items:[{id:quarantined.id,classification:'MATCHED_SERVER_RECEIPT',
   auto_retry:false}]});
 const clean=JSON.stringify(result.body);
 for(const privateMarker of ['NEVER_RETURN_PLAINTEXT','request_sha256',
  'fake_event_a','session_hash','actor_user_id','feed_seq'])
  assert.equal(clean.includes(privateMarker),false);
 const ledger=notes.filter(x=>x.startsWith('ledger:'));
 assert.equal(ledger.filter(x=>x.includes('SET TRANSACTION READ')).length,1);
 assert.equal(ledger.filter(x=>x.includes('idempotency_receipts')).length,0);
 // Query starts with SELECT r.workspace_id, so test separately by sequence.
 assert.equal(ledger[0],'ledger:CONNECT');
 assert.equal(ledger[1],'ledger:BEGIN');
 assert.equal(ledger[2],'ledger:SET TRANSACTION READ ONLY');
 assert.ok(ledger.some(x=>x.startsWith('ledger:SELECT r.workspace_id')));
 assert.ok(!ledger.some(x=>/ledger:(INSERT|UPDATE|DELETE|SELECT kts_team\.append_draft)/.test(x)));
 assert.equal(ledger.at(-2),'ledger:COMMIT');
 assert.equal(ledger.at(-1),'ledger:RELEASE_false');
 assert.equal(notes.filter(x=>x==='auth:CONNECT').length,2);
});
test('same actual auth/repository composition keeps missing receipt unknown and no POST write',async()=>{
 const {result,notes}=await trial({records:[]});
 assert.equal(result.status,200);
 assert.equal(result.body.all_receipts_verified,false);
 assert.equal(result.body.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');
 assert.equal(result.body.items[0].auto_retry,false);
 assert.ok(!notes.some(x=>x.startsWith('ledger:INSERT ')||x.startsWith('ledger:UPDATE ')));
});
test('viewer role cannot read receipt despite valid token; ledger never touched',async()=>{
 const {result,notes}=await trial({role:'viewer'});
 assert.equal(result.status,403);
 assert.equal(result.body.items,undefined);
 assert.equal(notes.filter(x=>x==='ledger:CONNECT').length,0);
});
