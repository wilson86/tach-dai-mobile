'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {captureReviewerLogin}=require('../team-settlement/reviewer-cdp-session-capture.cjs');
const base='https://192.168.0.148:9448';
function fixture(body){const handlers=new Map();return {handlers,onEvent:(name,fn)=>handlers.set(name,fn),call:async()=>({base64Encoded:false,body})};}
test('captures only the exact login response, in memory',async()=>{
  const token='x'.repeat(43),cdp=fixture(JSON.stringify({session_token:token}));const result=captureReviewerLogin({cdp,base,timeoutMs:500});
  cdp.handlers.get('Network.responseReceived')({requestId:'other',response:{url:base+'/other',status:200}});
  cdp.handlers.get('Network.responseReceived')({requestId:'one',response:{url:base+'/v1/login',status:200}});
  cdp.handlers.get('Network.loadingFinished')({requestId:'one'});assert.equal(await result,token);
});
test('malformed, duplicate and failed responses fail without disclosing body',async()=>{
  for(const kind of ['malformed','duplicate','failed']){
    const secret='synthetic-secret-marker',cdp=fixture(secret);const result=captureReviewerLogin({cdp,base,timeoutMs:500});
    cdp.handlers.get('Network.responseReceived')({requestId:'one',response:{url:base+'/v1/login',status:200}});
    if(kind==='duplicate')cdp.handlers.get('Network.responseReceived')({requestId:'two',response:{url:base+'/v1/login',status:200}});
    else if(kind==='failed')cdp.handlers.get('Network.loadingFailed')({requestId:'one'});
    else cdp.handlers.get('Network.loadingFinished')({requestId:'one'});
    await assert.rejects(result,e=>e.message==='REVIEWER_CDP_CAPTURE_UNVERIFIED'&&!e.message.includes(secret));
  }
});
