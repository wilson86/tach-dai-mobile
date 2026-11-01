'use strict';
// Execute the original driver login against actual auth and proof modules,
// with synthetic CDP/HTTPS transport. No network socket or database is used.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {Readable,EventEmitter}=require('node:stream');
const {createAuthService}=require('../team-settlement/auth-contract.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const {createReviewerSessionObserver}=require('../team-settlement/reviewer-session-https-observer.cjs');
const source=fs.readFileSync('C:\\KTS-Settlement\\w20-2d63c84e\\android-chrome-cdp-workflow.cjs','utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
assert.equal(hash(source),'8C0C211F224DFE3ED7101BEF46C235D66553EECDB70971FD0E743E62B55ECD4D');
const start=source.indexOf('    async function login(subject,password,workspace,role){'),end=source.indexOf("    let dateControlMethod='NOT_USED'",start);
assert.ok(start>=0&&end>start);const loginSource=source.slice(start,end);
function invoke(server,method,url,{body,bearer}={}){return new Promise(resolve=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.url=url;req.headers=bearer?{authorization:'Bearer '+bearer}:{};req.socket={remoteAddress:'127.0.0.1'};
  server.emit('request',req,{writeHead(status){this.status=status;},end(data){resolve({status:this.status,body:data?JSON.parse(data):null});}});
});}
async function exercise(revoke){
  const auth=createAuthService({clock:()=>1000,sessionTtlMs:1000});auth.registerIdentity({user_id:'fake_reviewer',auth_subject:'fake_reviewer',password:'synthetic-password-1'});auth.setMembership({workspace_id:'fake_groupa_test',user_id:'fake_reviewer',role:'reviewer'});
  const server=createAuthHttpServer(auth,{clock:()=>1000});const session=await invoke(server,'POST','/v1/login',{body:{auth_subject:'fake_reviewer',password:'synthetic-password-1',workspace_id:'fake_groupa_test'}});assert.equal(session.status,200);let token=session.body.session_token;
  const handlers=new Map(),files=new Map(),items=[];const cdp={onEvent:(n,f)=>handlers.set(n,f),call:async()=>({base64Encoded:false,body:JSON.stringify(session.body)})};
  const fakeRequest=(options,callback)=>{assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.authorization,'Bearer '+token);const req=new EventEmitter();req.end=async()=>{const answer=await invoke(server,'GET','/v1/session',{bearer:token});const res=new EventEmitter();res.statusCode=answer.status;res.setEncoding=()=>{};callback(res);res.emit('data',JSON.stringify(answer.body));res.emit('end');};req.destroy=()=>{};return req;};
  const fakeRequire=id=>id.endsWith('reviewer-session-https-observer.cjs')?{createReviewerSessionObserver:({ca})=>createReviewerSessionObserver({ca,request:fakeRequest})}:require(id);
  const ctx={mode:'live',minimalRlsLogout:true,reviewerProof:null,base:'https://192.168.0.148:9448',evidence:'C:\\fixture',evidenceItems:items,path,fs,Buffer,cdp,require:fakeRequire,
    sha256:file=>files.has(file)?hash(files.get(file)):hash(fs.readFileSync(file)),atomicJson:(file,value)=>files.set(file,JSON.stringify(value)),scrollTo:async()=>{},fill:async()=>{},call:async()=>{},waitFor:async()=>{},ui:async()=>({}),screenshot:async()=>{},
    clickSelector:async()=>{handlers.get('Network.responseReceived')({requestId:'one',response:{url:'https://192.168.0.148:9448/v1/login',status:200}});handlers.get('Network.loadingFinished')({requestId:'one'});}};
  const login=vm.runInNewContext(loginSource+'\nlogin',ctx);await login('fake_reviewer','synthetic-password-1','fake_groupa_test','reviewer');
  if(revoke){assert.equal((await invoke(server,'POST','/v1/logout',{bearer:token})).status,204);const proof=await ctx.reviewerProof.afterLogout({uiLogoutConfirmed:true});assert.equal(proof.http_status,401);assert.ok(!JSON.stringify(proof).includes(token));}
  else await assert.rejects(ctx.reviewerProof.afterLogout({uiLogoutConfirmed:true}),/REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED/);
  assert.ok(![...files.values()].join('').includes(token));token=null;
}
test('driver proof, HTTPS observer and actual auth handler agree on revocation',async()=>exercise(true));
test('same integrated path rejects a session that was not revoked',async()=>exercise(false));
