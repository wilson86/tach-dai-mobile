'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createReceiptV2AuthBoundary}=require('../team-settlement/candidate/receipt-v2-auth-boundary.cjs');
const token='synthetic_'+'x'.repeat(40);
const workspace='synthetic_group_a', user='synthetic_user_a';
const session={session_handle:'b'.repeat(32),workspace_id:workspace,user_id:user};
const NOW=1793789000000;
function fixture({sessions=[session],freshSessions=sessions,role='operator',scoped=workspace,err=null}={}) {
  const sql=[];
  const db={transaction:async fn=>{
    sql.push('BEGIN');
    try {const x=await fn({query:async(text,params)=>{
      sql.push({text,params});
      if(err)throw Error(err);
      if(text.includes('FROM kts_auth.sessions'))return {rows:text.includes('clock_timestamp()')?freshSessions:sessions};
      if(text.includes("set_config('kts.workspace_id'"))return {rows:[{workspace_id:scoped}]};
      if(text.includes('FROM kts_team.memberships'))return {rows:role===null?[]:[{team_role:role}]};
      throw Error('UNEXPECTED_SQL');
    }});sql.push('COMMIT');return x;}catch(e){sql.push('ROLLBACK');throw e;}
  }};
  return {db,sql};
}
test('default off forbids any session or secret access',async()=>{
  const x=fixture();const b=createReceiptV2AuthBoundary({db:x.db});
  await assert.rejects(b.authorizeReceiptRead(token,()=>true),/NOT_ENABLED/);
  assert.deepEqual(x.sql,[]);
});
test('missing or changed session on DB-time recheck never reaches callback',async()=>{
 for(const freshSessions of [[],[{...session,session_handle:'d'.repeat(32)}],
   [{...session,user_id:'synthetic_other'}],[{...session,workspace_id:'synthetic_group_b'}]]){
  const x=fixture({freshSessions}),b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
  let called=false;await assert.rejects(b.authorizeReceiptRead(token,()=>{called=true}),/AUTH_DENIED/);
  assert.equal(called,false);assert.equal(x.sql.at(-1),'ROLLBACK');
 }
});
test('session missing on post-callback check rolls back and does not return callback result',async()=>{
 const freshSessions=[session],x=fixture({freshSessions});
 const b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
 let called=false;
 await assert.rejects(b.authorizeReceiptRead(token,()=>{called=true;freshSessions.pop();return 'synthetic_result';}),/AUTH_DENIED/);
 assert.equal(called,true);assert.equal(x.sql.at(-1),'ROLLBACK');
});
test('valid DB session, scoped active operator and callback in same transaction',async()=>{
  const x=fixture(),b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
  const obtained=await b.authorizeReceiptRead(token,actor=>{
    assert.equal(x.sql[0],'BEGIN');
    assert.equal(x.sql.some(z=>z==='COMMIT'),false);
    assert.equal(actor.session_handle,session.session_handle);
    assert.equal(actor.workspace_id,workspace);assert.equal(actor.user_id,user);
    assert.equal(actor.role,'operator');assert.equal(Object.isFrozen(actor),true);
    assert.equal('session_hash' in actor,false);return 'PROOF_READY';
  });
  assert.equal(obtained,'PROOF_READY');assert.equal(x.sql.at(-1),'COMMIT');
  assert.equal(x.sql.filter(z=>typeof z==='object').length,5);
  const first=x.sql.find(z=>typeof z==='object');
  assert.match(first.text,/FOR SHARE/);
  assert.equal(first.params[0],crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(first.params[1],new Date(NOW).toISOString());
  assert.match(x.sql.filter(z=>typeof z==='object').at(-3).text,/FOR SHARE OF m,i/);
  assert.match(x.sql.filter(z=>typeof z==='object').at(-1).text,/expires_at > pg_catalog\.clock_timestamp\(\)/);
});
test('missing, ambiguous, revoked and malformed sessions fail closed',async()=>{
  for(const sessions of [[],[session,session],[{...session,session_handle:'bad'}],
    [{...session,workspace_id:'?' }],[{...session,user_id:null}]]){
    const x=fixture({sessions}),b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
    let called=false;await assert.rejects(b.authorizeReceiptRead(token,()=>{called=true}),/AUTH_DENIED/);
    assert.equal(called,false);assert.equal(x.sql.at(-1),'ROLLBACK');
  }
});
test('viewer, absent membership, scope GUC mismatch and SQL failures deny',async()=>{
  for(const opts of [{role:'viewer'},{role:'reviewer'},{role:null},
    {scoped:'synthetic_group_b'},{err:'DB_OFFLINE'}]){
    const x=fixture(opts),b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
    let called=false;await assert.rejects(b.authorizeReceiptRead(token,()=>{called=true}));
    assert.equal(called,false);assert.equal(x.sql.at(-1),'ROLLBACK');
  }
});
test('invalid bearer, callback, clock and configuration never enter transaction',async()=>{
  const x=fixture();const b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
  for(const value of ['',null,'bad','Bearer '+token])
    await assert.rejects(b.authorizeReceiptRead(value,()=>true),/AUTH_DENIED/);
  await assert.rejects(b.authorizeReceiptRead(token,'not a callback'),/AUTH_DENIED/);
  assert.deepEqual(x.sql,[]);
  await assert.rejects(createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NaN})
    .authorizeReceiptRead(token,()=>true),/AUTH_DENIED/);
  assert.deepEqual(x.sql,[]);
  assert.throws(()=>createReceiptV2AuthBoundary({db:x.db,enabled:'yes'}),/AUTH_DENIED/);
});
test('failed backend signer callback rolls back Auth transaction',async()=>{
  const x=fixture(),b=createReceiptV2AuthBoundary({db:x.db,enabled:true,clock:()=>NOW});
  await assert.rejects(b.authorizeReceiptRead(token,()=>{throw Error('SIGNER_UNAVAILABLE')}),/SIGNER_UNAVAILABLE/);
  assert.equal(x.sql.at(-1),'ROLLBACK');
});
