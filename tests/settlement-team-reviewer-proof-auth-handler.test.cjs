'use strict';
// Exercises the real auth HTTP handler in memory; no socket is bound.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createAuthService}=require('../team-settlement/auth-contract.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const {createReviewerLogoutHttpProof}=require('../team-settlement/reviewer-logout-http-proof.cjs');
function invoke(server,method,url,{body,bearer}={}){
  return new Promise(resolve=>{
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.url=url;req.headers=bearer?{authorization:'Bearer '+bearer}:{};req.socket={remoteAddress:'127.0.0.1'};
    const res={writeHead(status){this.status=status;},end(data){resolve({status:this.status,body:data?JSON.parse(data):null});}};
    server.emit('request',req,res);
  });
}
for(const revoke of [true,false])test(`actual auth handler ${revoke?'revokes':'rejects unrevoked proof'}`,async()=>{
  const auth=createAuthService({clock:()=>1000,sessionTtlMs:1000});
  auth.registerIdentity({user_id:'fake_reviewer',auth_subject:'fake_reviewer',password:'synthetic-password-1'});
  auth.setMembership({workspace_id:'fake_workspace',user_id:'fake_reviewer',role:'reviewer'});
  const server=createAuthHttpServer(auth,{clock:()=>1000});
  const login=await invoke(server,'POST','/v1/login',{body:{auth_subject:'fake_reviewer',password:'synthetic-password-1',workspace_id:'fake_workspace'}});
  assert.equal(login.status,200);let token=login.body.session_token;
  const proof=createReviewerLogoutHttpProof({expectedWorkspace:'fake_workspace',expectedReviewer:'fake_reviewer',observeSession:({bearer})=>invoke(server,'GET','/v1/session',{bearer})});
  const before=await proof.beforeLogout(token);
  if(revoke){const result=await invoke(server,'POST','/v1/logout',{bearer:token});assert.equal(result.status,204);const after=await proof.afterLogout({uiLogoutConfirmed:true});assert.equal(after.http_status,401);assert.ok(!JSON.stringify({before,after}).includes(token));}
  else await assert.rejects(proof.afterLogout({uiLogoutConfirmed:true}),/REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED/);
  token=null;
});
