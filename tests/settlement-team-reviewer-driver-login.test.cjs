'use strict';
// Executes the actual driver login function with isolated CDP and HTTPS
// dependencies. No Android, listener or PostgreSQL is started.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync('C:\\KTS-Settlement\\w20-2d63c84e\\android-chrome-cdp-workflow.cjs','utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
assert.equal(hash(source),'8C0C211F224DFE3ED7101BEF46C235D66553EECDB70971FD0E743E62B55ECD4D');
const start=source.indexOf('    async function login(subject,password,workspace,role){');
const end=source.indexOf("    let dateControlMethod='NOT_USED'",start);
assert.ok(start>=0&&end>start);
const loginSource=source.slice(start,end);
async function run(revoke){
  const token='Z'.repeat(43),handlers=new Map(),files=new Map(),items=[];let active=true;
  const cdp={onEvent:(name,fn)=>handlers.set(name,fn),call:async()=>({base64Encoded:false,body:JSON.stringify({session_token:token})})};
  const fakeRequire=id=>id.endsWith('reviewer-session-https-observer.cjs')?{createReviewerSessionObserver:()=>async({bearer})=>{assert.equal(bearer,token);return active?{status:200,body:{user_id:'fake_reviewer',workspace_id:'fake_groupa_test',role:'reviewer'}}:{status:401,body:{error:'AUTH_SESSION_INVALID'}};}}:require(id);
  const ctx={mode:'live',minimalRlsLogout:true,reviewerProof:null,base:'https://192.168.0.148:9448',evidence:'C:\\fixture',evidenceItems:items,path,fs,Buffer,cdp,require:fakeRequire,
    sha256:file=>files.has(file)?hash(files.get(file)):hash(fs.readFileSync(file)),atomicJson:(file,value)=>files.set(file,JSON.stringify(value)),
    scrollTo:async()=>{},fill:async()=>{},call:async()=>{},waitFor:async()=>{},ui:async()=>({}),screenshot:async()=>{},
    clickSelector:async()=>{handlers.get('Network.responseReceived')({requestId:'one',response:{url:'https://192.168.0.148:9448/v1/login',status:200}});handlers.get('Network.loadingFinished')({requestId:'one'});}
  };
  const login=vm.runInNewContext(loginSource+'\nlogin',ctx);await login('fake_reviewer','fixture-password','fake_groupa_test','reviewer');
  assert.ok(ctx.reviewerProof);assert.equal(items.length,1);assert.ok(![...files.values()].join('').includes(token));
  if(revoke){active=false;const result=await ctx.reviewerProof.afterLogout({uiLogoutConfirmed:true});assert.equal(result.http_status,401);assert.ok(!JSON.stringify(result).includes(token));}
  else await assert.rejects(ctx.reviewerProof.afterLogout({uiLogoutConfirmed:true}),/REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED/);
}
test('actual Reviewer driver login binds the same token to before and after proof',async()=>run(true));
test('actual Reviewer driver login fails closed if session stays active',async()=>run(false));
