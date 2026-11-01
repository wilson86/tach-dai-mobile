'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('../app/settlement-team-sync-client.js');
const {createReviewerLogoutHttpProof}=require('../team-settlement/reviewer-logout-http-proof.cjs');
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});

for(const revoke of [true,false])test(`same synthetic client session: logout ${revoke?'revoked':'not revoked'}`,async()=>{
  const token='F'.repeat(43),saved=new Map();let captured=null,active=true;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value),remove:key=>saved.delete(key)};
  const fetchImpl=async(url,options)=>{
    if(url.endsWith('/v1/login')){captured=token;return response(200,{session_token:token,expires_at:'2099-01-01T00:00:00Z'});}
    if(url.endsWith('/v1/logout')){assert.equal(options.headers.authorization,'Bearer '+token);if(revoke)active=false;return response(204,{});}
    throw Error('UNEXPECTED_REQUEST');
  };
  const client=Sync.createSyncClient({storage,fetchImpl,baseUrl:'https://team.example.test'});
  await client.login('fake_reviewer','fixture-password','fake_workspace');
  const proof=createReviewerLogoutHttpProof({expectedWorkspace:'fake_workspace',expectedReviewer:'fake_reviewer',observeSession:async({bearer})=>{
    assert.equal(bearer,token);
    return active?{status:200,body:{user_id:'fake_reviewer',workspace_id:'fake_workspace',role:'reviewer'}}:{status:401,body:{error:'AUTH_SESSION_INVALID'}};
  }});
  const before=await proof.beforeLogout(captured);captured=null;
  await client.logout();assert.equal(client.snapshot().authenticated,false);
  if(revoke){const after=await proof.afterLogout({uiLogoutConfirmed:true});assert.equal(after.revoked_session_denied,true);assert.ok(!JSON.stringify({before,after}).includes(token));}
  else await assert.rejects(proof.afterLogout({uiLogoutConfirmed:true}),/REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED/);
  assert.ok(!JSON.stringify([...saved]).includes(token));
});
