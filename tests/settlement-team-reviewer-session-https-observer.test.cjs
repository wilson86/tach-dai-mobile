'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createReviewerSessionObserver}=require('../team-settlement/reviewer-session-https-observer.cjs');
test('strict TLS, bounded exact endpoint and sanitized response',async()=>{
  const token='X'.repeat(43),ca=Buffer.from('fixture-ca');let options;
  const request=(value,callback)=>{options=value;const req=new EventEmitter();req.end=()=>{const res=new EventEmitter();res.statusCode=401;res.setEncoding=()=>{};callback(res);queueMicrotask(()=>{res.emit('data','{"error":"AUTH_SESSION_INVALID"}');res.emit('end');});};req.destroy=()=>req.emit('error',Error(token));return req;};
  const observe=createReviewerSessionObserver({ca,request});const result=await observe({method:'GET',path:'/v1/session',bearer:token});
  assert.equal(result.status,401);assert.equal(options.rejectUnauthorized,true);assert.equal(options.hostname,'192.168.0.148');assert.equal(options.timeout,5000);assert.equal(options.ca,ca);assert.ok(!JSON.stringify(result).includes(token));
});
test('errors never expose diagnostic secrets',async()=>{
  const request=()=>{throw Error('synthetic-secret')};const observe=createReviewerSessionObserver({ca:Buffer.from('ca'),request});
  await assert.rejects(observe({method:'GET',path:'/v1/session',bearer:'x'.repeat(43)}),e=>e.message==='REVIEWER_HTTPS_UNVERIFIED');
});
test('timeout fails closed even when destroy emits no error',async()=>{
  const request=()=>{const req=new EventEmitter();req.end=()=>req.emit('timeout');req.destroy=()=>{};return req;};
  const observe=createReviewerSessionObserver({ca:Buffer.from('ca'),request});
  await assert.rejects(observe({method:'GET',path:'/v1/session',bearer:'x'.repeat(43)}),/REVIEWER_HTTPS_UNVERIFIED/);
});
