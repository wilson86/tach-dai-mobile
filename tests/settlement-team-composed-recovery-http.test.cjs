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
     return {rows:[],rowCount:0,command:sql};
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
test('unqualified composed read-only receipt inspection must fail closed',async()=>{
 const {result,notes}=await trial();
 assert.equal(result.status,503);
 assert.equal(result.body.error,'TEAM_RECOVERY_RECEIPT_UNVERIFIED');
 assert.equal(result.body.all_receipts_verified,undefined);
 assert.equal(result.body.items,undefined);
 assert.equal(notes.filter(x=>x==='ledger:CONNECT').length,0);
 assert.equal(notes.filter(x=>x.includes('idempotency_receipts')).length,0);
});
test('missing receipts are not treated as authoritative UNKNOWN from an unqualified Ledger',async()=>{
 const {result,notes}=await trial({records:[]});
 assert.equal(result.status,503);
 assert.equal(result.body.error,'TEAM_RECOVERY_RECEIPT_UNVERIFIED');
 assert.equal(result.body.items,undefined);
 assert.equal(notes.filter(x=>x==='ledger:CONNECT').length,0);
});
test('viewer role cannot read receipt despite valid token; ledger never touched',async()=>{
 const {result,notes}=await trial({role:'viewer'});
 assert.equal(result.status,403);
 assert.equal(result.body.items,undefined);
 assert.equal(notes.filter(x=>x==='ledger:CONNECT').length,0);
});
