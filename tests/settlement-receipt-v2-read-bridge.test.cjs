'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReceiptV2ReadBridge}=require('../team-settlement/candidate/receipt-v2-read-bridge.cjs');
const {createReceiptV2TrustedSigner}=require('../team-settlement/candidate/receipt-v2-trusted-signer.cjs');
const token='token_'+'x'.repeat(40),key='draft_'+'1'.repeat(32);
const issuedAt=1793789000000;
const actor=Object.freeze({server_verified:true,membership_active:true,role:'operator',
  session_handle:'a'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'});
function receipt(){return {workspace_id:actor.workspace_id,idempotency_key:key,
  request_sha256:'b'.repeat(64),event_id:'event_1',actor_user_id:actor.user_id,
  partner_id:'partner_1',business_date:'2026-11-04',region:'mb',
  scope_revision:'1',feed_seq:'1',event_kind:'DRAFT_CREATED',payload_sha256:'c'.repeat(64)};}
function harness({dbRows=[receipt()],dbError=null,latencyBefore=0,latencyDuring=0,
   afterCommit=0,disabled=false}={}){
  let t=issuedAt,signCalls=0,queryCalls=0,txnCalls=0;
  const signer=createReceiptV2TrustedSigner({enabled:true,clock:()=>t,
    auth:{authorizeReceiptRead:async (_token,cb)=>cb(actor)},
    keyProvider:{currentSigningKey:async()=>({key_id:'d'.repeat(16),
      secret_bytes:Buffer.alloc(32,7),activated_at_ms:issuedAt-10000,
      stop_signing_at_ms:issuedAt+100000,stop_verify_at_ms:issuedAt+150000,revoked_at_ms:null})},
    nonceSource:()=>Buffer.alloc(16,3)});
  const trustedSigner={signReceiptRead:async args=>{signCalls++;return signer.signReceiptRead(args)}};
  const ledgerDb={transaction:async cb=>{
    txnCalls++;t+=latencyBefore;
    let result=await cb({query:async(sql,params)=>{
      queryCalls++;
      assert.equal(typeof sql,'string');
      assert.match(sql,/FROM kts_team\.candidate_receipt_read_v2\(/);
      assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\b/i);
      assert.equal(params.length,9);
      assert.equal(params[2],actor.workspace_id);
      if(dbError)throw dbError;
      t+=latencyDuring;
      return {rows:dbRows};
    }});
    t+=afterCommit;return result;
  }};
  const bridge=createReceiptV2ReadBridge({signer:trustedSigner,ledgerDb,clock:()=>t,enabled:!disabled});
  return {bridge,metrics:()=>({signCalls,queryCalls,txnCalls})};
}
test('default OFF and invalid configuration never run queries',async()=>{
  const f=harness({disabled:true});
  await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/NOT_ENABLED/);
  assert.deepEqual(f.metrics(),{signCalls:0,queryCalls:0,txnCalls:0});
  assert.throws(()=>createReceiptV2ReadBridge({enabled:true}),/READ_UNQUALIFIED/);
});
test('backend signer + SQL function-only query + verified receipt (no financial write)',async()=>{
  const f=harness();const rows=await f.bridge.lookup({bearerToken:token,keys:[key]});
  assert.equal(rows.length,1);assert.deepEqual(rows[0],receipt());
  assert.equal(Object.isFrozen(rows),true);assert.equal(Object.isFrozen(rows[0]),true);
  assert.deepEqual(f.metrics(),{signCalls:1,queryCalls:1,txnCalls:1});
  assert.equal('sync_status' in rows[0],false);
});
test('cross-tenant / wrong user / duplicate / extra result are rejected',async()=>{
  for(const rows of [[{...receipt(),workspace_id:'alien'}],
    [{...receipt(),actor_user_id:'stranger'}],
    [receipt(),receipt()]]){
    const f=harness({dbRows:rows});
    await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/READ_UNQUALIFIED/);
    assert.equal(f.metrics().queryCalls,1);
  }
});
test('empty SQL rows are allowed as UNKNOWN outcome, never SYNCED',async()=>{
  const f=harness({dbRows:[]});const rows=await f.bridge.lookup({bearerToken:token,keys:[key]});
  assert.deepEqual(rows,[]);assert.ok(Object.isFrozen(rows));
});
test('connection acquisition latency causes stale proof denial BEFORE SQL query',async()=>{
  const f=harness({latencyBefore:31000});
  await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/READ_UNQUALIFIED/);
  assert.equal(f.metrics().queryCalls,0);
});
test('SQL or COMMIT delay beyond TTL rejects proof with no auto-retry',async()=>{
  for(const opts of [{latencyDuring:31000},{afterCommit:31000}]){
    const f=harness(opts);
    await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/READ_UNQUALIFIED/);
    assert.equal(f.metrics().queryCalls,1);assert.equal(f.metrics().txnCalls,1);
  }
});
test('SQL error remains a failure, no automatic replay',async()=>{
  const f=harness({dbError:Error('TEAM_DB_COMMIT_OUTCOME_UNKNOWN')});
  await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/TEAM_DB_COMMIT_OUTCOME_UNKNOWN/);
  assert.deepEqual(f.metrics(),{signCalls:1,queryCalls:1,txnCalls:1});
});
test('reject unexpected receipt column, bad event, and impossible date',async()=>{
  for(const bad of [
    {...receipt(),extra_debug_field:'unexpected'},
    {...receipt(),event_kind:'UNKNOWN_KIND'},
    {...receipt(),business_date:'2026-02-30'},
    {...receipt(),business_date:'2026-13-10'}
  ]){
    const f=harness({dbRows:[bad]});
    await assert.rejects(f.bridge.lookup({bearerToken:token,keys:[key]}),/READ_UNQUALIFIED/);
  }
});
