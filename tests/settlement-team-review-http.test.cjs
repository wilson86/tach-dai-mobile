'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const A=require('../team-settlement/auth-contract.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const scope=Object.freeze({workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-14',region:'mn'});

async function fixture({enableHttp=false,enableService=false}={}){
 const auth=A.createAuthService({clock:()=>1000,sessionTtlMs:10000});
 for(const [name,role,workspace] of [
   ['writer','operator','group_a'],['checker','reviewer','group_a'],
   ['viewer','viewer','group_a'],['outsider','operator','group_b'],
   ['admin','admin','group_a']
 ]){
   auth.registerIdentity({user_id:name,auth_subject:name,password:'synthetic-'+name+'-password'});
   auth.setMembership({workspace_id:workspace,user_id:name,role});
 }
 const tokens={};
 for(const [name,workspace] of [
   ['writer','group_a'],['checker','group_a'],['viewer','group_a'],
   ['outsider','group_b'],['admin','group_a']
 ])tokens[name]=auth.login({auth_subject:name,
   password:'synthetic-'+name+'-password',workspace_id:workspace}).session_token;
 const writes=[];
 const repository={
   appendDraft:async()=>{throw Error('DRAFT_NOT_TESTED');},
   getScope:async()=>{throw Error('READ_NOT_TESTED');},
   advanceReview:async(actor,input)=>{
     writes.push({actor,input});
     return {event_id:'review_event',replayed:false,
       new_revision:input.expected_revision+1,feed_seq:writes.length,
       state:input.action==='submit_review'?'PENDING_REVIEW':'REVIEWED'};
   }
 };
 const ledger=createServerLedgerApi({auth,repository,eventId:()=> 'review_event',
   syntheticReviewEnabled:enableService});
 const server=createAuthHttpServer(auth,{ledger,enableSyntheticReviewHttp:enableHttp});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,tokens,writes,auth};
}
function send(server,{token,body,path='/v1/scopes/review',method='POST'}={}){
 const payload=body===undefined?null:JSON.stringify(body);
 return new Promise((resolve,reject)=>{
   const req=http.request({
     hostname:'127.0.0.1',port:server.address().port,method,path,
     headers:{...(token?{authorization:'Bearer '+token}:{}),
       ...(payload===null?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)})}
   },res=>{
     const chunks=[];res.on('data',data=>chunks.push(data));
     res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
   });
   req.on('error',reject);req.end(payload===null?undefined:payload);
 });
}
const args=(action='submit_review',expected_revision=1)=>({
 action,scope,expected_revision,idempotency_key:'synthetic_review_1'
});
test('review POST defaults to 404 even if internal synthetic service is available',async()=>{
 const x=await fixture({enableService:true});
 try{
   const r=await send(x.server,{token:x.tokens.writer,body:args()});
   assert.equal(r.status,404);assert.equal(r.body.error,'TEAM_ROUTE_NOT_ENABLED');
   assert.equal(x.writes.length,0);
 }finally{await new Promise(ok=>x.server.close(ok));}
});
test('review HTTP gated route rejects anonymous, client role spoof, cross-workspace, invalid actions',async()=>{
 const x=await fixture({enableService:true,enableHttp:true});
 try{
   assert.equal((await send(x.server,{body:args()})).status,401);
   for(const [who,body,expected] of [
     ['writer',{...args(),role:'admin'},422],
     ['writer',{...args(),offline:true},422],
     ['writer',{...args(),action:'close_scope'},422],
     ['writer',{...args(),action:'approve_review'},403],
     ['viewer',args(),403],
     ['outsider',args(),403],
     ['writer',{...args(),expected_revision:-1},422]
   ])assert.equal((await send(x.server,{token:x.tokens[who],body})).status,expected);
   assert.equal(x.writes.length,0);
 }finally{await new Promise(ok=>x.server.close(ok));}
});
test('synthetic operator submits, different reviewer approves only with authoritative complete receipt',async()=>{
 const x=await fixture({enableService:true,enableHttp:true});
 try{
   const submit=await send(x.server,{token:x.tokens.writer,body:args()});
   assert.equal(submit.status,200);
   assert.equal(submit.body.review_state,'PENDING_REVIEW');
   assert.equal(submit.body.new_revision,2);
   const approved=await send(x.server,{token:x.tokens.checker,
     body:{...args('approve_review',2),idempotency_key:'synthetic_review_2'}});
   assert.equal(approved.status,200);
   assert.equal(approved.body.review_state,'REVIEWED');
   assert.equal(approved.body.new_revision,3);
   assert.deepEqual(x.writes.map(w=>w.actor.user_id),['writer','checker']);
   assert.deepEqual(x.writes.map(w=>w.input.action),['submit_review','approve_review']);
   assert.equal(x.writes[0].input.scope.workspace_id,'group_a');
   assert.match(x.writes[1].input.request_sha256,/^[a-f0-9]{64}$/);
 }finally{await new Promise(ok=>x.server.close(ok));}
});
test('no synthetic HTTP endpoint available if service remains default disabled',async()=>{
 const x=await fixture({enableService:false,enableHttp:true});
 try{
   const r=await send(x.server,{token:x.tokens.writer,body:args()});
   assert.equal(r.status,503);assert.equal(r.body.error,'TEAM_REVIEW_NOT_VERIFIED');
   assert.equal(x.writes.length,0);
 }finally{await new Promise(ok=>x.server.close(ok));}
});
