'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
test('review request remains bound to original validated scope across authentication await',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 let post;const data=new Map();
 const storage={get:k=>data.get(k)??null,set:(k,v)=>data.set(k,v),keys:()=>[...data.keys()]};
 const reviewLockManager={request:async(_key,_opts,callback)=>callback({})};
 const client=createSyncClient({storage,reviewLockManager,fetchImpl:async(url,options)=>{
  if(url==='/v1/session'){await gate;return {ok:true,status:200,json:async()=>({server_verified:true,membership_active:true,user_id:'user_a',workspace_id:'group_a',role:'operator'})};}
  if(url==='/v1/scopes/review'){post=JSON.parse(options.body);return {ok:false,status:503,json:async()=>({})};}
  throw Error('UNEXPECTED_REQUEST');
 }});
 client.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
 const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};
 const pending=client.reviewScope('submit_review',scope,1);
 scope.partner_id='fake_partner_2';release();
 const result=await pending;
 assert.equal(result.status,'NEEDS_RECONCILIATION');
 assert.equal(post.scope.partner_id,'fake_partner_1');
 assert.equal(result.scope.partner_id,'fake_partner_1');
 const marker=JSON.parse([...data.values()][0]);
 assert.deepEqual(JSON.parse(marker.target),['submit_review','group_a','fake_partner_1','2026-11-05','mn',1]);
 assert.equal(post.idempotency_key,marker.idempotency_key);
});
