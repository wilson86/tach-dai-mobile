'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');

function call(server,subject) {
  const body=JSON.stringify({auth_subject:subject,password:'synthetic-password-1',workspace_id:'group_a'});
  return new Promise((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:server.address().port,
      path:'/v1/login',method:'POST',headers:{
        'content-type':'application/json','content-length':Buffer.byteLength(body)}},response=>{
      let data=''; response.on('data',chunk=>data+=chunk);
      response.on('end',()=>resolve({status:response.statusCode,
        body:JSON.parse(data)}));
    });
    request.on('error',reject);request.end(body);
  });
}
function fakeAuth(login){
  const fail=()=>{throw Error('UNUSED_AUTH_ENDPOINT');};
  return {login,verifySession:fail,revokeSession:fail,
    manageMembership:fail,setIdentityDisabled:fail};
}
async function listen(auth,options,work){
  const server=createAuthHttpServer(auth,options);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await work(server);}
  finally{await new Promise(resolve=>server.close(resolve));}
}
test('parallel login attempts reserve capacity before async verifier resolves',async()=>{
  let entered=0;let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const auth=fakeAuth(async()=>{entered++;await gate;throw Error('SYNTHETIC_DENIED');});
  await listen(auth,{maxLoginAttempts:2,loginWindowMs:1000,clock:()=>1000},
    async server=>{
      const first=call(server,'one_subject');
      const second=call(server,'one_subject');
      // Wait only for the two synthetic verifier calls to begin.
      for(let i=0;i<100&&entered<2;i++)
        await new Promise(resolve=>setTimeout(resolve,5));
      assert.equal(entered,2);
      const extra=await call(server,'one_subject');
      assert.equal(extra.status,429);
      assert.equal(extra.body.error,'AUTH_RATE_LIMITED');
      assert.equal(entered,2);
      release();
      const results=await Promise.all([first,second]);
      assert.deepEqual(results.map(r=>r.status),[401,401]);
    });
});
test('unknown login subjects cannot grow limiter state past configured cap',async()=>{
  let now=1000,entered=0;
  const auth=fakeAuth(async()=>{entered++;throw Error('SYNTHETIC_DENIED');});
  await listen(auth,{maxLoginAttempts:5,maxLoginKeys:2,
      loginWindowMs:100,clock:()=>now},async server=>{
    assert.equal((await call(server,'unknown_1')).status,401);
    assert.equal((await call(server,'unknown_2')).status,401);
    assert.equal((await call(server,'unknown_3')).status,429);
    assert.equal(entered,2);
    now=1100;
    assert.equal((await call(server,'unknown_3')).status,401);
    assert.equal(entered,3);
  });
});

test('rotating synthetic usernames cannot bypass per-source attempt limit',async()=>{
  let now=1000,verified=0;
  const auth=fakeAuth(async()=>{verified++;throw Error('SYNTHETIC_DENIED');});
  await listen(auth,{maxLoginAttempts:8,maxLoginKeys:20,
    maxLoginSourceAttempts:3,loginWindowMs:100,clock:()=>now},async server=>{
    for(let i=0;i<3;i++)
      assert.equal((await call(server,'rotating_subject_'+i)).status,401);
    const rejected=await call(server,'rotating_subject_3');
    assert.equal(rejected.status,429);
    assert.equal(rejected.body.error,'AUTH_RATE_LIMITED');
    assert.equal(verified,3);
    now=1100;
    assert.equal((await call(server,'rotating_subject_3')).status,401);
    assert.equal(verified,4);
  });
});

test('successful logins cannot clear the aggregate source throttle',async()=>{
  let verified=0;
  const auth=fakeAuth(async()=>{verified++;return {session_token:'synthetic_token'};});
  await listen(auth,{maxLoginAttempts:5,maxLoginKeys:20,maxLoginSourceAttempts:2,
    clock:()=>1000},async server=>{
    assert.equal((await call(server,'successful_a')).status,200);
    assert.equal((await call(server,'successful_b')).status,200);
    assert.equal((await call(server,'successful_c')).status,429);
    assert.equal(verified,2);
  });
});
