'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createPostgresAuthService,tokenHash}=require('../team-settlement/postgres-auth-service.cjs');
const {hashPassword}=require('../team-settlement/auth-contract.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');

function fakeDatabase(){
  const data={
    identities:new Map([['demo_login',{user_id:'user_a',disabled_at:null,
      password_hash:hashPassword('synthetic-private-password',Buffer.alloc(16,0x51))}],
      ['member_login',{user_id:'user_b',disabled_at:null,
        password_hash:hashPassword('synthetic-member-password',Buffer.alloc(16,0x52))}]]),
    members:new Map([['group_a:user_a',{team_role:'operator',revoked_at:null}]]),
    sessions:new Map()
  };
  const history=[];
  const db={transaction:async work=>{
    let workspaceId=null;
    return work({query:async(sql,args=[])=>{
      history.push({sql,args});
      if(sql.includes("set_config('kts.workspace_id'")){workspaceId=args[0];return {rows:[]};}
      if(sql.includes('FROM kts_team.identities i')&&sql.includes('kts_auth.credentials')){
        if(workspaceId!==args[1])throw Error('AUTH_DB_TENANT_NOT_SET');
        const identity=data.identities.get(args[0]);
        const membership=identity&&data.members.get(args[1]+':'+identity.user_id);
        return {rows:identity&&membership&&membership.revoked_at===null?
          [{...identity,team_role:membership.team_role}]:[]};
      }
      if(sql.includes('INSERT INTO kts_auth.sessions')){
        const [hash,userId,ws,issued,expiry]=args;
        if(data.sessions.has(hash))throw Error('DUPLICATE_SESSION_HASH');
        data.sessions.set(hash,{user_id:userId,workspace_id:ws,issued_at:issued,
          expires_at:expiry,revoked_at:null});
        return {rows:[{session_hash:hash}]};
      }
      if(sql.includes('INSERT INTO kts_team.memberships')){
        const [targetWorkspace,userId,role,revokedAt]=args;
        if(workspaceId!==targetWorkspace)throw Error('AUTH_DB_TENANT_NOT_SET');
        const identity=[...data.identities.values()].find(x=>x.user_id===userId);
        if(!identity)return {rows:[]};
        const revokedAtMs=revokedAt===null?null:new Date(revokedAt).getTime();
        data.members.set(targetWorkspace+':'+userId,{team_role:role,revoked_at:revokedAtMs});
        return {rows:[{workspace_id:targetWorkspace,user_id:userId,team_role:role,revoked_at:revokedAtMs}]};
      }
      if(sql.includes('FROM kts_auth.sessions')){
        const session=data.sessions.get(args[0]);
        return {rows:session&&session.revoked_at===null &&
          new Date(session.expires_at)>new Date(args[1])?
          [{user_id:session.user_id,workspace_id:session.workspace_id}]:[]};
      }
      if(sql.includes('FROM kts_team.memberships m')&&!sql.includes('kts_auth.credentials')){
        const membership=data.members.get(args[0]+':'+args[1]);
        const identity=[...data.identities.values()].find(x=>x.user_id===args[1]);
        if(workspaceId!==args[0])throw Error('AUTH_DB_TENANT_NOT_SET');
        return {rows:membership&&membership.revoked_at===null&&identity&&
          identity.disabled_at===null?[{team_role:membership.team_role}]:[]};
      }
      if(sql.includes('UPDATE kts_auth.sessions')){
        const current=data.sessions.get(args[0]);
        if(current&&current.revoked_at===null){current.revoked_at=new Date().toISOString();return {rowCount:1,rows:[]};}
        return {rowCount:0,rows:[]};
      }
      throw Error('UNEXPECTED_AUTH_QUERY');
    }});
  }};
  return {db,data,history};
}
function httpCall(server,{path,method='GET',token,body}={}){
  const raw=body===undefined?null:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,
      headers:{...(token?{authorization:'Bearer '+token}:{}),
        ...(raw?{'content-type':'application/json','content-length':Buffer.byteLength(raw)}:{})}
    },response=>{
      let data='';response.on('data',chunk=>data+=chunk);
      response.on('end',()=>resolve({status:response.statusCode,body:data?JSON.parse(data):null}));
    });
    request.on('error',reject);
    request.end(raw||undefined);
  });
}
const credentials={auth_subject:'demo_login',password:'synthetic-private-password',workspace_id:'group_a'};
test('persisted session survives auth service re-instantiation, hashes bearer, supports revoke',async()=>{
  const f=fakeDatabase();
  const first=createPostgresAuthService({db:f.db,clock:()=>1000,sessionTtlMs:100000});
  const signed=await first.login(credentials);
  assert.match(signed.session_token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.data.sessions.size,1);
  assert.equal(f.data.sessions.has(signed.session_token),false);
  assert.equal(f.data.sessions.has(tokenHash(signed.session_token)),true);
  assert.equal(JSON.stringify(f.history).includes(signed.session_token),false);
  const afterRestart=createPostgresAuthService({db:f.db,clock:()=>1000,sessionTtlMs:100000});
  const actor=await afterRestart.verifySession(signed.session_token);
  assert.equal(actor.user_id,'user_a');
  assert.equal(actor.role,'operator');
  await assert.rejects(afterRestart.verifySession(signed.session_token,'group_b'),/AUTH_WORKSPACE_DENIED/);
  assert.equal(await afterRestart.revokeSession(signed.session_token),true);
  await assert.rejects(first.verifySession(signed.session_token),/AUTH_SESSION_INVALID/);
  assert.equal(await afterRestart.revokeSession(signed.session_token),false);
});
test('server session denies stale active membership, disabled identity and expiration',async()=>{
  const f=fakeDatabase();
  const a=createPostgresAuthService({db:f.db,clock:()=>1000,sessionTtlMs:10000});
  const signed=await a.login(credentials);
  f.data.members.get('group_a:user_a').team_role='viewer';
  assert.equal((await a.verifySession(signed.session_token)).role,'viewer');
  f.data.members.get('group_a:user_a').revoked_at=1000;
  await assert.rejects(a.verifySession(signed.session_token),/AUTH_SESSION_REVOKED/);
  await assert.rejects(a.login(credentials),/AUTH_LOGIN_DENIED/);
  f.data.members.get('group_a:user_a').revoked_at=null;
  f.data.identities.get('demo_login').disabled_at=1000;
  await assert.rejects(a.verifySession(signed.session_token),/AUTH_SESSION_REVOKED/);
  await assert.rejects(a.login(credentials),/AUTH_LOGIN_DENIED/);
  f.data.identities.get('demo_login').disabled_at=null;
  const late=createPostgresAuthService({db:f.db,clock:()=>20000,sessionTtlMs:10000});
  await assert.rejects(late.verifySession(signed.session_token),/AUTH_SESSION_INVALID/);
});
test('login fails closed on missing account and wrong password without issuing a session',async()=>{
  const f=fakeDatabase(),a=createPostgresAuthService({db:f.db,clock:()=>1000});
  for(const input of [{...credentials,password:'synthetic-wrong-password'},
    {...credentials,auth_subject:'unknown_login'}]){
    await assert.rejects(a.login(input),/AUTH_LOGIN_DENIED/);
  }
  assert.equal(f.data.sessions.size,0);
});
test('async persisted auth interoperates with read-only HTTP route and session revocation',async()=>{
  const f=fakeDatabase(),auth=createPostgresAuthService({db:f.db,clock:()=>1000});
  const repository={
    appendDraft:async()=>{throw Error('TEAM_DRAFT_NOT_QUALIFIED');},
    getScope:async(actor,scope)=>({...scope,revision:1,state:'DRAFT',user_id:actor.user_id})
  };
  const ledger=createServerLedgerApi({auth,repository});
  const server=createAuthHttpServer(auth,{ledger});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const login=await httpCall(server,{path:'/v1/login',method:'POST',body:credentials});
    assert.equal(login.status,200);
    const token=login.body.session_token;
    const before=await httpCall(server,{path:'/v1/scopes/customer_1/2026-10-12/mn',token});
    assert.equal(before.status,200);
    assert.equal(before.body.workspace_id,'group_a');
    assert.equal(before.body.user_id,'user_a');
    const session=await httpCall(server,{path:'/v1/session',token});
    assert.equal(session.status,200);
    assert.equal(session.body.role,'operator');
    const admin=await httpCall(server,{path:'/v1/admin/memberships',method:'POST',token,body:{}});
    assert.equal(admin.status,404);
    assert.equal(admin.body.error,'TEAM_ROUTE_NOT_ENABLED');
    assert.equal((await httpCall(server,{path:'/v1/logout',method:'POST',token})).status,204);
    assert.equal((await httpCall(server,{path:'/v1/session',token})).status,401);
    assert.equal((await httpCall(server,{path:'/v1/scopes/customer_1/2026-10-12/mn',token})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('durable admin changes only an existing same-workspace membership and rechecks admin role',async()=>{
  const f=fakeDatabase();
  f.data.members.get('group_a:user_a').team_role='admin';
  const auth=createPostgresAuthService({db:f.db,clock:()=>1000});
  const signed=await auth.login(credentials);
  const actor=await auth.verifySession(signed.session_token);
  const changed=await auth.manageMembership(actor,{
    workspace_id:'group_a',user_id:'user_b',role:'reviewer'
  });
  assert.deepEqual(changed,{workspace_id:'group_a',user_id:'user_b',role:'reviewer',revoked_at:null});
  assert.equal(f.data.members.get('group_a:user_b').team_role,'reviewer');
  await assert.rejects(auth.manageMembership(actor,{
    workspace_id:'group_a',user_id:'user_a',role:'viewer'
  }),/AUTH_SELF_ADMIN_CHANGE_DENIED/);
  await assert.rejects(auth.manageMembership(actor,{
    workspace_id:'group_b',user_id:'user_b',role:'viewer'
  }),/AUTH_WORKSPACE_DENIED/);
  await assert.rejects(auth.manageMembership(actor,{
    workspace_id:'group_a',user_id:'missing_user',role:'viewer'
  }),/AUTH_DATABASE_RESULT_INVALID/);
  f.data.members.get('group_a:user_a').team_role='operator';
  await assert.rejects(auth.manageMembership(actor,{
    workspace_id:'group_a',user_id:'user_b',role:'viewer'
  }),/AUTH_ROLE_DENIED/);
  assert.throws(()=>auth.setIdentityDisabled(actor,'group_a','user_b',1000),/AUTH_ADMIN_UNAVAILABLE/);
});

test('durable membership update denies an ambiguous SQL receipt',async()=>{
  const db={transaction:async work=>work({query:async(sql,args)=>{
    if(sql.includes('set_config'))return {rows:[]};
    if(sql.includes('FROM kts_team.memberships m'))return {rows:[{team_role:'admin'}]};
    if(sql.includes('INSERT INTO kts_team.memberships'))return {rows:[
      {workspace_id:'group_a',user_id:'user_b',team_role:'viewer',revoked_at:null},
      {workspace_id:'group_a',user_id:'user_b',team_role:'viewer',revoked_at:null}
    ]};
    throw Error('UNEXPECTED_QUERY');
  }})};
  const auth=createPostgresAuthService({db});
  await assert.rejects(auth.manageMembership({server_verified:true,membership_active:true,
    user_id:'admin_a',workspace_id:'group_a',role:'admin'},
    {workspace_id:'group_a',user_id:'user_b',role:'viewer'}),/AUTH_DATABASE_RESULT_INVALID/);
});

test('async scrypt verifier matches approved policy without synchronous per-login event-loop blocking',async()=>{
  const {hashPassword,verifyPasswordAsync}=require('../team-settlement/auth-contract.cjs');
  const encoded=hashPassword('synthetic-safe-password',Buffer.alloc(16,0x63));
  assert.equal(await verifyPasswordAsync('synthetic-safe-password',encoded),true);
  assert.equal(await verifyPasswordAsync('synthetic-incorrect-password',encoded),false);
  assert.equal(await verifyPasswordAsync('synthetic-safe-password','scrypt-v1$1,8,1$bad$bad'),false);
});

test('durable login does not issue a bearer when INSERT RETURNING receipt is absent or forged',async()=>{
  for(const returned of [{rows:[]},{rows:[{session_hash:'0'.repeat(64)}]},
      {rows:[{session_hash:'a'.repeat(64)},{session_hash:'b'.repeat(64)}]},
      {rows:null}]){
    const syntheticHash=hashPassword('synthetic-private-password',Buffer.alloc(16,0x51));
    let writes=0;
    const db={transaction:async work=>work({query:async(sql,args)=>{
      if(sql.includes('set_config'))return {rows:[]};
      if(sql.includes('FROM kts_team.identities i'))return {rows:[{
        user_id:'user_a',disabled_at:null,password_hash:syntheticHash,team_role:'operator'}]};
      if(sql.includes('INSERT INTO kts_auth.sessions')){writes++;return returned;}
      throw Error('UNEXPECTED_QUERY');
    }})};
    const auth=createPostgresAuthService({db,clock:()=>1000});
    await assert.rejects(auth.login(credentials),/AUTH_DATABASE_RESULT_INVALID/);
    assert.equal(writes,1);
  }
});

test('session revocation rejects impossible multi-row database acknowledgement',async()=>{
  const db={transaction:async work=>work({query:async()=>{
    return {rowCount:2};
  }})};
  const auth=createPostgresAuthService({db});
  await assert.rejects(auth.revokeSession('x'.repeat(43)),/AUTH_DATABASE_RESULT_INVALID/);
});
