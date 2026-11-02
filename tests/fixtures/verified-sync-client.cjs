'use strict';
// Positive dependencies for legacy client contract tests. The production client
// is unchanged by this helper. Raw API bypass/negative-identity tests live in
// settlement-team-client-review-findings.test.cjs and do not use this helper.
const Raw=require('../../app/settlement-team-sync-client.js');
function memory(){const data=new Map();return {data,get:k=>data.get(k)??null,set:(k,v)=>data.set(k,v),remove:k=>data.delete(k),keys:()=>[...data.keys()]};}
const held=new Set();
const lockManager={async request(key,options,callback){
  if(held.has(key))return callback(null);
  held.add(key);try{return await callback({name:key});}finally{held.delete(key);}
}};
function createSyncClient(options={}){
  const ctx={owner:'fake_operator',workspace:'group_a'};
  const supplied=Object.hasOwn(options,'storage')?options.storage:memory();
  if(supplied && !supplied.keys && typeof supplied.set==='function'){
    if(supplied.data instanceof Map)supplied.keys=()=>[...supplied.data.keys()];
    else {
      const keys=new Set(),set=supplied.set;
      supplied.set=(key,value)=>{const result=set(key,value);keys.add(key);return result;};
      supplied.keys=()=>[...keys];
    }
  }
  const network=options.fetchImpl;
  const client=Raw.createSyncClient({...options,storage:supplied,
    reviewLockManager:options.reviewLockManager||lockManager,
    fetchImpl:async(url,request)=>{
      if(url.endsWith('/v1/login')){
        const input=JSON.parse(request.body);ctx.owner=input.auth_subject;ctx.workspace=input.workspace_id;
      }
      // Real localhost HTTP integration tests use their actual auth service.
      if(!options.baseUrl && url==='/v1/session')return {status:200,ok:true,json:async()=>({
        server_verified:true,membership_active:true,user_id:ctx.owner,workspace_id:ctx.workspace,role:'operator'
      })};
      return network(url,request);
    }
  });
  return Object.freeze({...client,setSessionToken(token,workspace='group_a',opts={}){
    const owner=Object.hasOwn(opts,'accountId')?opts.accountId:'fake_operator';
    ctx.owner=owner;ctx.workspace=workspace;
    return client.setSessionToken(token,workspace,{...opts,accountId:owner});
  }});
}
module.exports=Object.freeze({...Raw,createSyncClient});
