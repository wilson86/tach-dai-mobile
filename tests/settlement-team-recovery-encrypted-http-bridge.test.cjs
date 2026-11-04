'use strict';
// End-to-end SYNTHETIC contract only: encrypted quarantine -> localhost HTTP
// -> authenticated server -> injected read-only ledger receipt query.
// Not an actual PostgreSQL test, browser-persistence test or production route.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {createSyntheticRecoveryVault}=require('../team-settlement/recovery-vault.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');

const TOKEN='a'.repeat(43),SECRET='synthetic-independent-recovery-secret';
const scope={workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'};
const draft={id:'draft_'+'b'.repeat(32),status:'PENDING',scope,
 base_revision:0,payload:{synthetic:true,note:'PRIVATE_SYNTHETIC_PAYLOAD_ONLY'}};
const sha=digest({action:'create_draft',scope,expected_revision:0,payload:draft.payload});
const originalReceipt={workspace_id:'group_a',idempotency_key:draft.id,
 request_sha256:sha,payload_sha256:sha,event_id:'fake_saved_event_1',
 actor_user_id:'fake_operator',partner_id:scope.partner_id,
 business_date:scope.business_date,region:scope.region,
 scope_revision:1,feed_seq:'1',event_kind:'DRAFT_CREATED'};
function makePool(kind,recordRows,trace,roleState){
 return {async connect(){
  trace.push(kind+':connect');
  return {async query(sql,args){
   const head=String(sql).trim().split(/\s+/).slice(0,4).join(' ');
   trace.push(kind+':'+head);
   if(['BEGIN','COMMIT','ROLLBACK','SET TRANSACTION READ ONLY'].includes(sql))
     return {rows:[],rowCount:0};
   if(String(sql).includes('set_config('))return {rows:[]};
   if(kind==='auth'&&String(sql).includes('FROM kts_auth.sessions'))
     return roleState.active?{rows:[{user_id:'fake_operator',workspace_id:'group_a'}]}:{rows:[]};
   if(String(sql).includes('FROM kts_team.memberships'))
     return {rows:[{team_role:roleState.role}]};
   if(kind==='ledger'&&String(sql).includes('FROM kts_team.idempotency_receipts')){
     assert.deepEqual(args,['group_a','fake_operator',[draft.id]]);
     return {rows:recordRows};
   }
   throw Error('UNEXPECTED_SYNTHETIC_SQL');
  },release(destroy){trace.push(kind+':release:'+String(Boolean(destroy)));}};
 }};
}
async function runCase({records=[originalReceipt],active=true}={}){
 const trace=[],slot=new Map(),roleState={role:'operator',active};
 const app=createIsolatedTeamPrototype({syntheticOnly:true,
  syntheticRecoveryInspectEnabled:true,
  authPool:makePool('auth',[],trace,roleState),
  ledgerPool:makePool('ledger',records,trace,roleState)});
 const vault=createSyntheticRecoveryVault({syntheticOnly:true,auth:app.auth,
  cryptoProvider:webcrypto,store:{
   async read(key){return slot.get(key)??null},
   async writeIfAbsent(key,value){if(slot.has(key))return false;slot.set(key,value);return true}
  }});
 assert.equal(app.server.listening,false);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.server.address().port;
 try{
  if(!active) {
    await assert.rejects(vault.save({sessionToken:TOKEN,passphrase:SECRET,
      drafts:[draft],explicitConsent:true}),/AUTH_SESSION_INVALID/);
    assert.equal(trace.filter(x=>x.startsWith('ledger:')).length,0);
    return {status:'DENIED',trace};
  }
  const saved=await vault.save({sessionToken:TOKEN,passphrase:SECRET,
    drafts:[draft],explicitConsent:true});
  assert.equal(saved.durability,'UNVERIFIED');
  assert.equal(saved.auto_send_enabled,false);
  const restored=await vault.inspect({sessionToken:TOKEN,passphrase:SECRET,
    explicitConsent:true});
  assert.equal(restored.status,'QUARANTINED');
  assert.equal(restored.auto_send_enabled,false);
  assert.equal(restored.requires_server_receipt_review,true);
  assert.equal(restored.items.length,1);
  assert.equal(restored.items[0].id,draft.id);
  assert.equal(restored.items[0].auto_retry,false);
  const response=await fetch(origin+'/v1/recovery/receipts/inspect',{
   method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},
   body:JSON.stringify({explicit_consent:true,quarantined:restored.items})
  });
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.status,'REVIEW_ONLY');
  assert.equal(body.auto_send_enabled,false);
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].id,draft.id);
  assert.equal(body.items[0].auto_retry,false);
  assert.equal(body.all_receipts_verified,records.length===1);
  assert.equal(body.items[0].classification,records.length?
    'MATCHED_SERVER_RECEIPT':'UNVERIFIED_NOT_SAFE_TO_RETRY');
  const serialized=JSON.stringify(body);
  for(const secret of [SECRET,'PRIVATE_SYNTHETIC_PAYLOAD_ONLY','fake_saved_event_1',
      'request_sha256','payload_sha256','feed_seq','session_hash'])
    assert.equal(serialized.includes(secret),false,'sensitive response leaked '+secret);
  const ledger=trace.filter(x=>x.startsWith('ledger:'));
  assert.equal(ledger.filter(x=>x==='ledger:SET TRANSACTION READ ONLY').length,1);
  assert.equal(ledger[0],'ledger:connect');
  assert.equal(ledger[1],'ledger:BEGIN');
  assert.equal(ledger[2],'ledger:SET TRANSACTION READ ONLY');
  assert.ok(ledger.some(x=>x.startsWith('ledger:SELECT r.workspace_id')));
  assert.ok(!ledger.some(x=>/ledger:(INSERT|UPDATE|DELETE|TRUNCATE)/.test(x)));
  assert.equal(ledger.at(-2),'ledger:COMMIT');
  await assert.rejects(app.ledgerRepository.appendDraft({},{}),
    /TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  return {status:body.items[0].classification,trace};
 } finally {await new Promise(resolve=>app.server.close(resolve));}
}
test('encrypted quarantine to localhost HTTP verified synthetic receipt: no write or secrets',async()=>{
 const res=await runCase();
 assert.equal(res.status,'MATCHED_SERVER_RECEIPT');
});
test('encrypted quarantine to HTTP missing receipt remains UNKNOWN and unretryable',async()=>{
 const res=await runCase({records:[]});
 assert.equal(res.status,'UNVERIFIED_NOT_SAFE_TO_RETRY');
});
test('revoked synthetic session cannot create recovery backup or touch ledger',async()=>{
 const res=await runCase({active:false});
 assert.equal(res.status,'DENIED');
});
