'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const actor={server_verified:true,membership_active:true,user_id:'user_a',workspace_id:'group_a',role:'operator'};
const cursor=(seq,workspace='group_a')=>Buffer.from(JSON.stringify({feed_seq:String(seq),workspace_id:workspace})).toString('base64url');
const item=(seq,workspace='group_a')=>({workspace_id:workspace,event_id:'event_'+seq,feed_seq:String(seq)});
function make(page){return createServerLedgerApi({auth:{verifySession:async()=>actor},repository:{appendDraft:async()=>{},getScope:async()=>{},getChanges:async()=>page}});}
test('feed API rejects foreign tenants, gaps, malformed pages and wrong cursors',async()=>{
 const valid={items:[item(1)],next_cursor:cursor(1),has_more:false,sync_status:'SYNCED'};
 for(const page of [null,{...valid,items:[item(1,'group_b')]},
  {...valid,items:[item(2)]},{...valid,next_cursor:cursor(2)},
  {...valid,next_cursor:cursor(1,'group_b')},{...valid,has_more:'false'},
  {...valid,items:[item(1),item(1)],next_cursor:cursor(1)},
  {...valid,sync_status:'PENDING'},{...valid,items:[],next_cursor:cursor(1)}])
  await assert.rejects(make(page).getChanges('token',{limit:2}),/TEAM_FEED_RESPONSE_UNVERIFIED/);
 assert.deepEqual(await make(valid).getChanges('token',{limit:2}),valid);
 const second={items:[item(2)],next_cursor:cursor(2),has_more:false,sync_status:'SYNCED'};
 assert.deepEqual(await make(second).getChanges('token',{limit:2,cursor:cursor(1)}),second);
});
test('actual HTTP feed route redacts foreign page and preserves valid page',async()=>{
 let page={items:[item(1,'group_b')],next_cursor:cursor(1,'group_b'),has_more:false,sync_status:'SYNCED'};
 const auth={login:async()=>{},verifySession:async()=>actor,revokeSession:async()=>true};
 const repository={appendDraft:async()=>{},getScope:async()=>{},getChanges:async()=>page};
 const server=createAuthHttpServer(auth,{ledger:createServerLedgerApi({auth,repository})});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const url=`http://127.0.0.1:${server.address().port}/v1/changes?limit=2`;
  const request=()=>fetch(url,{headers:{authorization:'Bearer '+'a'.repeat(43)}});
  const bad=await request();assert.equal(bad.status,500);
  assert.deepEqual(await bad.json(),{error:'TEAM_BACKEND_UNAVAILABLE'});
  page={items:[item(1)],next_cursor:cursor(1),has_more:false,sync_status:'SYNCED'};
  const good=await request();assert.equal(good.status,200);assert.deepEqual(await good.json(),page);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
