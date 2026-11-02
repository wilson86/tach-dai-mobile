'use strict';
// Actual HTTP handler, server API and durable-auth JS; SQL is a synthetic
// transaction fixture. No socket, PostgreSQL, Android or live pilot is started.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {createPostgresAuthService}=require('../team-settlement/postgres-auth-service.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');

function dispatch(server,{method,path,token,body}){
  const payload=body===undefined?[]:[Buffer.from(JSON.stringify(body))];
  const req=Readable.from(payload);req.method=method;req.url=path;
  req.headers=token?{authorization:`Bearer ${token}`}:{ };
  req.socket={remoteAddress:'127.0.0.1'};
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('FIXTURE_HTTP_TIMEOUT')),3000);
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},
      end(data){clearTimeout(timeout);resolve({status:this.status,body:data?String(data):''});}};
    try{server.emit('request',req,res);}catch(e){clearTimeout(timeout);reject(e);}
  });
}

test('durable write mode rejects auth without the session-lock callback',()=>{
  const auth={verifySession:async()=>({})};
  const repository={appendDraft:async()=>({}),getScope:async()=>({})};
  assert.throws(()=>createServerLedgerApi({auth,repository,requireSessionLockForWrites:true}),/TEAM_SERVER_API_CONFIG_INVALID/);
});

test('reviewer logout invalidates later review API replay through actual JS boundaries',async()=>{
  const token='R'.repeat(43),hash=crypto.createHash('sha256').update(token).digest('hex');
  let revoked=false,reviewWrites=0;
  const db={transaction:async work=>work({query:async(sql,values)=>{
    if(sql.includes('FROM kts_auth.sessions')){
      assert.equal(values[0],hash);return {rows:revoked?[]:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};
    }
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('UPDATE kts_auth.sessions')){
      assert.equal(values[0],hash);const rowCount=revoked?0:1;revoked=true;return {rowCount};
    }
    if(sql.includes('set_config'))return {rows:[]};
    throw Error('UNEXPECTED_AUTH_FIXTURE_QUERY');
  }})};
  const auth=createPostgresAuthService({db,clock:()=>1000});
  const repository={appendDraft:async()=>{throw Error('UNEXPECTED_DRAFT');},getScope:async()=>{throw Error('UNEXPECTED_READ');},
    advanceReview:async(actor,input)=>{reviewWrites++;assert.equal(actor.user_id,'fake_reviewer');
      return {event_id:input.event_id,replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'};}};
  const ledger=createServerLedgerApi({auth,repository,syntheticReviewEnabled:true,eventId:()=> 'fake_event_review'});
  const server=createAuthHttpServer(auth,{ledger,enableSyntheticReviewHttp:true});
  assert.equal(server.listening,false);
  const body={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
  const forged=await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body:{...body,actor_user_id:'fake_admin'}});
  assert.equal(forged.status,422);
  const crossGroup=await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body:{...body,scope:{...body.scope,workspace_id:'fake_other'}}});
  assert.equal(crossGroup.status,403);
  assert.equal(reviewWrites,0,'forged actor and workspace must not reach repository');
  assert.equal((await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body})).status,200);
  assert.equal(reviewWrites,1);
  assert.equal((await dispatch(server,{method:'POST',path:'/v1/logout',token})).status,204);
  assert.equal((await dispatch(server,{method:'GET',path:'/v1/session',token})).status,401);
  assert.equal((await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body})).status,401);
  assert.equal((await dispatch(server,{method:'POST',path:'/v1/logout',token})).status,401);
  assert.equal(reviewWrites,1,'revoked session must not reach repository');
  assert.equal(server.listening,false);
});

test('reviewer session transaction remains open through review fixture transaction',async()=>{
  const token='S'.repeat(43);let revoked=false,ledgerCalled=false;
  const authDb={transaction:async work=>{try{return await work({query:async sql=>{
    if(sql.includes('FROM kts_auth.sessions'))return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_AUTH_QUERY');
  }});}finally{revoked=true;}}};
  const ledgerDb={transaction:async work=>{assert.equal(revoked,false);return work({query:async sql=>{
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('kts_team.advance_review')){ledgerCalled=true;return {rows:[{result:{event_id:'fake_review',replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};}
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_LEDGER_QUERY');
  }});}};
  const auth=createPostgresAuthService({db:authDb,clock:()=>1000});
  const repository=createPostgresLedgerRepository({db:ledgerDb});
  const ledger=createServerLedgerApi({auth,repository,syntheticReviewEnabled:true,eventId:()=> 'fake_review'});
  const server=createAuthHttpServer(auth,{ledger,enableSyntheticReviewHttp:true});
  const body={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
  const result=await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body});
  assert.equal(result.status,200);assert.equal(revoked,true);
  assert.equal(ledgerCalled,true);assert.equal(server.listening,false);
});

test('synthetic lock model serializes concurrent logout after review transaction',async()=>{
  let revoked=false,held=false,unlock,signalLedger,finishLedger,signalRevoke,writes=0;
  const unlocked=new Promise(resolve=>{unlock=resolve;});
  const ledgerStarted=new Promise(resolve=>{signalLedger=resolve;});
  const ledgerMayFinish=new Promise(resolve=>{finishLedger=resolve;});
  const revokeStarted=new Promise(resolve=>{signalRevoke=resolve;});
  const db={transaction:async work=>{let owns=false;try{return await work({query:async sql=>{
    if(sql.includes('FROM kts_auth.sessions')){
      assert.match(sql,/FOR SHARE/);if(revoked)return {rows:[]};held=true;owns=true;
      return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};
    }
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('UPDATE kts_auth.sessions')){signalRevoke();if(held)await unlocked;revoked=true;return {rowCount:1};}
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_AUTH_QUERY');
  }});}finally{if(owns){held=false;unlock();}}}};
  const auth=createPostgresAuthService({db,clock:()=>1000});
  const ledgerDb={transaction:async work=>work({query:async sql=>{
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('kts_team.advance_review')){signalLedger();await ledgerMayFinish;assert.equal(revoked,false);writes++;return {rows:[{result:{event_id:'fake_review',replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};}
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_LEDGER_QUERY');
  }})};
  const repository=createPostgresLedgerRepository({db:ledgerDb});
  const ledger=createServerLedgerApi({auth,repository,syntheticReviewEnabled:true,eventId:()=> 'fake_review'});
  const server=createAuthHttpServer(auth,{ledger,enableSyntheticReviewHttp:true});const token='Q'.repeat(43);
  const body={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
  const write=dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body});
  await ledgerStarted;
  const logout=dispatch(server,{method:'POST',path:'/v1/logout',token});
  await revokeStarted;assert.equal(held,true);assert.equal(revoked,false);
  finishLedger();assert.equal((await write).status,200);assert.equal((await logout).status,204);
  assert.equal((await dispatch(server,{method:'POST',path:'/v1/scopes/review',token,body})).status,401);
  assert.equal(writes,1);assert.equal(server.listening,false);
});

test('session transaction is released after a ledger error in the fixture',async()=>{
  let held=false,revoked=false;
  const db={transaction:async work=>{let owns=false;try{return await work({query:async sql=>{
    if(sql.includes('FROM kts_auth.sessions')){held=true;owns=true;return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('UPDATE kts_auth.sessions')){assert.equal(held,false);revoked=true;return {rowCount:1};}
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_AUTH_QUERY');
  }});}finally{if(owns)held=false;}}};
  const auth=createPostgresAuthService({db,clock:()=>1000});
  const repository={appendDraft:async()=>{},getScope:async()=>{},advanceReview:async()=>{assert.equal(held,true);throw Error('SYNTHETIC_LEDGER_FAILURE');}};
  const api=createServerLedgerApi({auth,repository,syntheticReviewEnabled:true,requireSessionLockForWrites:true});
  const token='E'.repeat(43),body={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_key'};
  await assert.rejects(api.advanceReview(token,body),/SYNTHETIC_LEDGER_FAILURE/);
  assert.equal(held,false);assert.equal(await auth.revokeSession(token),true);assert.equal(revoked,true);
});
