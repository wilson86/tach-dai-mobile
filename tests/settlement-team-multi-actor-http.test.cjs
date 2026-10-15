'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const A = require('../team-settlement/auth-contract.cjs');
const { createLedgerApi } = require('../team-settlement/ledger-api-contract.cjs');
const { createAuthHttpServer } = require('../team-settlement/auth-http-contract.cjs');

const SCOPE = Object.freeze({
  workspace_id:'group_a',partner_id:'fake_partner_1',
  business_date:'2026-10-12',region:'mn'
});
function request(server,method,path,token,body) {
  const data=body===undefined?null:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=http.request({
      hostname:'127.0.0.1',port:server.address().port,method,path,
      headers:{
        ...(token?{authorization:'Bearer '+token}:{}),
        ...(data===null?{}:{'content-type':'application/json','content-length':Buffer.byteLength(data)})
      }
    },res=>{
      const parts=[];
      res.on('data',v=>parts.push(v));
      res.on('end',()=>resolve({status:res.statusCode,
        body:JSON.parse(Buffer.concat(parts).toString('utf8'))}));
    });
    req.on('error',reject);req.end(data===null?undefined:data);
  });
}
function authFixture() {
  const auth=A.createAuthService({clock:()=>1000,sessionTtlMs:10000});
  for(const [user,workspace] of [
    ['writer_a','group_a'],['writer_b','group_a'],['outsider','group_b']
  ]) {
    auth.registerIdentity({user_id:user,auth_subject:user,
      password:'synthetic-'+user+'-password'});
    auth.setMembership({workspace_id:workspace,user_id:user,role:'operator'});
  }
  const token=user=>auth.login({auth_subject:user,
    password:'synthetic-'+user+'-password',
    workspace_id:user==='outsider'?'group_b':'group_a'}).session_token;
  return {auth,token,ledger:createLedgerApi({auth,clock:()=>1000})};
}
test('two distinct authenticated synthetic users race same scope: one CAS commit, one conflict',async()=>{
  const {auth,token,ledger}=authFixture();
  const first=token('writer_a'),second=token('writer_b');
  assert.notEqual(first,second);
  const server=createAuthHttpServer(auth,{ledger:{
    appendDraft:(tk,body)=>ledger.mutateDraft(tk,body),
    getScope:(tk,scope)=>ledger.getScope(tk,scope)
  }});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    const data=uid=>({scope:SCOPE,expected_revision:0,
      idempotency_key:'fake_req_'+uid,payload:{synthetic:true,uid}});
    const [a,b]=await Promise.all([
      request(server,'POST','/v1/scopes/drafts',first,data('a')),
      request(server,'POST','/v1/scopes/drafts',second,data('b'))
    ]);
    assert.deepEqual([a.status,b.status].sort((x,y)=>x-y),[200,409]);
    const winner=a.status===200?{token:first,body:data('a'),receipt:a.body}:
      {token:second,body:data('b'),receipt:b.body};
    assert.equal((a.status===409?a.body:b.body).sync_status,'CONFLICT');
    const replay=await request(server,'POST','/v1/scopes/drafts',winner.token,winner.body);
    assert.equal(replay.status,200);
    assert.equal(replay.body.replayed,true);
    assert.equal(replay.body.event_id,winner.receipt.event_id);
    assert.equal(ledger.getEvents(first,SCOPE).length,1);
    const scope=await request(server,'GET','/v1/scopes/fake_partner_1/2026-10-12/mn',second);
    assert.equal(scope.status,200);
    assert.equal(scope.body.revision,1);
  } finally {await new Promise(ok=>server.close(ok));}
});
test('second workspace bearer cannot read or write first workspace draft',async()=>{
  const {auth,token,ledger}=authFixture();
  const own=token('writer_a'),foreign=token('outsider');
  const server=createAuthHttpServer(auth,{ledger:{
    appendDraft:(tk,body)=>ledger.mutateDraft(tk,body),
    getScope:(tk,scope)=>ledger.getScope(tk,scope)
  }});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    const saved=await request(server,'POST','/v1/scopes/drafts',own,
      {scope:SCOPE,expected_revision:0,idempotency_key:'fake_req_cross_1',payload:{synthetic:true}});
    assert.equal(saved.status,200);
    const denied=await request(server,'POST','/v1/scopes/drafts',foreign,
      {scope:SCOPE,expected_revision:1,idempotency_key:'fake_req_cross_2',
        role:'admin',payload:{synthetic:true}});
    assert.equal(denied.status,403);
    assert.equal(denied.body.error,'TEAM_WORKSPACE_DENIED');
    const read=await request(server,'GET','/v1/scopes/fake_partner_1/2026-10-12/mn',foreign);
    assert.equal(read.status,404);
    assert.equal(ledger.getEvents(own,SCOPE).length,1);
  } finally {await new Promise(ok=>server.close(ok));}
});
test('revoked second user is denied while first authenticated user remains active',async()=>{
  const {auth,token,ledger}=authFixture();
  const first=token('writer_a'),second=token('writer_b');
  const server=createAuthHttpServer(auth,{ledger:{
    appendDraft:(tk,body)=>ledger.mutateDraft(tk,body),
    getScope:(tk,scope)=>ledger.getScope(tk,scope)
  }});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    const saved=await request(server,'POST','/v1/scopes/drafts',first,
      {scope:SCOPE,expected_revision:0,idempotency_key:'fake_req_revoke_1',payload:{synthetic:true}});
    assert.equal(saved.status,200);
    auth.setMembership({workspace_id:'group_a',user_id:'writer_b',
      role:'operator',revoked_at:1000});
    const blocked=await request(server,'GET','/v1/scopes/fake_partner_1/2026-10-12/mn',second);
    assert.equal(blocked.status,401);
    const active=await request(server,'GET','/v1/scopes/fake_partner_1/2026-10-12/mn',first);
    assert.equal(active.status,200);
    assert.equal(active.body.revision,1);
  } finally {await new Promise(ok=>server.close(ok));}
});
test('change route blocks workspace-spoofing and ambiguous cursor queries before touching provider',async()=>{
  const {auth,token}=authFixture();let delegated=0;
  const server=createAuthHttpServer(auth,{ledger:{
    getChanges:async()=>{delegated++;return {items:[],next_cursor:null,sync_status:'SYNCED'};}
  }});
  const bearer=token('writer_a');
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    for(const path of [
      '/v1/changes_other','/v1/changes/extra',
      '/v1/changes?workspace_id=group_b',
      '/v1/changes?role=admin','/v1/changes?cursor=x&cursor=y',
      '/v1/changes?limit=1&limit=2'
    ]) {
      const result=await request(server,'GET',path,bearer);
      assert.ok([404,422].includes(result.status),path);
    }
    assert.equal(delegated,0);
    const allowed=await request(server,'GET','/v1/changes?limit=2',bearer);
    assert.equal(allowed.status,200);
    assert.equal(delegated,1);
  }finally{await new Promise(ok=>server.close(ok));}
});
