'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresAuthService,tokenHash}=require('../team-settlement/postgres-auth-service.cjs');
const {hashPassword}=require('../team-settlement/auth-contract.cjs');
const PASS='synthetic-handle-password';
const creds={auth_subject:'synthetic_subject',password:PASS,workspace_id:'synthetic_group_a'};
function fakeDb({badReceipt=false,missingMigration=false}={}){
  const seen=[];
  const verifier=hashPassword(PASS,Buffer.alloc(16,0x36));
  return {
    seen,
    db:{transaction:async work=>work({query:async(sql,args=[])=>{
      seen.push({sql,args});
      if(sql.includes("set_config('kts.workspace_id'"))return {rows:[]};
      if(sql.includes('FROM kts_team.identities i') && sql.includes('kts_auth.credentials'))
        return {rows:[{user_id:'synthetic_actor',disabled_at:null,password_hash:verifier,team_role:'operator'}]};
      if(sql.includes('INSERT INTO kts_auth.sessions')){
        if(missingMigration && sql.includes('session_handle'))throw Error('column session_handle does not exist');
        const hash=args[0], v2=sql.includes('session_handle');
        return {rows:[{session_hash:hash,
          ...(v2?{session_handle:badReceipt?'0'.repeat(32):args[1]}:{})}]};
      }
      throw Error('SYNTHETIC_SQL_UNKNOWN');
    }})}
  };
}
test('default-off Auth login is byte-contract compatible: legacy SQL and response',async()=>{
  const f=fakeDb(),auth=createPostgresAuthService({db:f.db,clock:()=>1000});
  const receipt=await auth.login(creds);
  assert.deepEqual(Object.keys(receipt).sort(),['expires_at','session_token']);
  const insert=f.seen.find(q=>q.sql.includes('INSERT INTO kts_auth.sessions'));
  assert.ok(insert);
  assert.doesNotMatch(insert.sql,/session_handle/);
  assert.equal(insert.args.length,5);
  assert.equal(insert.args[0],tokenHash(receipt.session_token));
  assert.ok(!JSON.stringify(f.seen).includes(receipt.session_token));
});
test('opt-in issues independent random indexed handle but never returns it to client',async()=>{
  const f=fakeDb(),auth=createPostgresAuthService({db:f.db,
    clock:()=>1000,receiptV2SessionHandleEnabled:true});
  const a=await auth.login(creds),b=await auth.login(creds);
  for(const response of [a,b])assert.deepEqual(Object.keys(response).sort(),['expires_at','session_token']);
  const inserts=f.seen.filter(q=>q.sql.includes('INSERT INTO kts_auth.sessions'));
  assert.equal(inserts.length,2);
  const [first,second]=inserts.map(q=>{
    assert.match(q.sql,/RETURNING session_hash,session_handle/);
    assert.equal(q.args.length,6);
    assert.match(q.args[1],/^[a-f0-9]{32}$/);
    return q.args[1];
  });
  assert.notEqual(first,second);
  assert.notEqual(first,tokenHash(a.session_token).slice(0,32));
  assert.notEqual(second,tokenHash(b.session_token).slice(0,32));
  assert.equal(inserts[0].args[0],tokenHash(a.session_token));
  assert.equal(inserts[1].args[0],tokenHash(b.session_token));
  assert.ok(!JSON.stringify(a).includes(first));
});
test('missing migration or mismatching SQL handle blocks issuance',async()=>{
  for(const opts of [{missingMigration:true},{badReceipt:true}]){
    const f=fakeDb(opts),auth=createPostgresAuthService({db:f.db,
      clock:()=>1000,receiptV2SessionHandleEnabled:true});
    await assert.rejects(auth.login(creds));
  }
});
test('feature flag must be boolean; invalid credentials do not generate a handle',async()=>{
  const f=fakeDb();
  assert.throws(()=>createPostgresAuthService({db:f.db,
    receiptV2SessionHandleEnabled:'true'}),/AUTH_PERSISTENCE_CONFIG_INVALID/);
  const auth=createPostgresAuthService({db:f.db,
    clock:()=>1000,receiptV2SessionHandleEnabled:true});
  await assert.rejects(auth.login({...creds,password:'incorrect'}),/AUTH_LOGIN_DENIED/);
  assert.equal(f.seen.some(q=>q.sql.includes('INSERT INTO kts_auth.sessions')),false);
});
