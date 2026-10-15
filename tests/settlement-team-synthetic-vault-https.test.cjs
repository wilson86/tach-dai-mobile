'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PassThrough}=require('node:stream'),path=require('node:path');
const {createSyntheticVaultPilotHandler}=require('../team-settlement/synthetic-vault-https-handler.cjs');
const ROOT=path.join(__dirname,'..'),ORIGIN='https://pilot.example.invalid';
function fixture(approved=true){
 const calls=[];
 const backend={emit(ev,req,res){
  calls.push({ev,url:req.url,method:req.method});
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({status:'REVIEW_ONLY',
    auto_send_enabled:false,all_receipts_verified:false,items:[]}));
  return true;
 }};
 const pilot=createSyntheticVaultPilotHandler({rootDir:ROOT,backend,
  syntheticOnly:true,privatePilotApproved:approved,approvedOrigin:ORIGIN});
 return {pilot,calls};
}
function request(pilot,url,method='GET',overrides={}){
 return new Promise((resolve,reject)=>{
  const chunks=[];
  const response=new PassThrough();
  response.writeHead=(status,headers)=>{response.statusCode=status;response.meta=headers;};
  response.on('data',chunk=>chunks.push(chunk));
  response.on('end',()=>resolve({status:response.statusCode,
   headers:response.meta,body:Buffer.concat(chunks).toString('utf8')}));
  response.on('error',reject);
  pilot.handler({url,method,headers:{host:'pilot.example.invalid',...overrides.headers},
   socket:{encrypted:overrides.encrypted!==false}},response);
 });
}
test('refuses activation without exact separate pilot approval and HTTPS origin',()=>{
 const backend={emit(){throw Error('NO_BACKEND_CALL')}};
 for(const flags of [{},{syntheticOnly:true},{privatePilotApproved:true}]){
  assert.throws(()=>createSyntheticVaultPilotHandler({
   rootDir:ROOT,backend,approvedOrigin:ORIGIN,...flags
  }),/TEAM_PRIVATE_PILOT_NOT_AUTHORIZED/);
 }
 for(const origin of ['http://pilot.example.invalid',ORIGIN+'/bad',
  'https://pilot.example.invalid:8787','https://user:pass@pilot.example.invalid']){
  assert.throws(()=>createSyntheticVaultPilotHandler({
   rootDir:ROOT,backend,approvedOrigin:origin,
   syntheticOnly:true,privatePilotApproved:true
  }),/TEAM_PRIVATE_ORIGIN_INVALID/);
 }
});
test('handler never opens a port and serves only exact fake manual HTML/JS/CSS',async()=>{
 const {pilot,calls}=fixture();
 assert.equal(typeof pilot.listen,'undefined');
 assert.equal(pilot.servesRealMoney,false);
 assert.equal(pilot.allowsFinancialDraftPost,false);
 const r=await request(pilot,'/manual.html');
 assert.equal(r.status,200);
 assert.match(r.body,/SYNTHETIC ONLY/);
 assert.match(r.body,/team-manual-review/);
 assert.equal(r.headers['cache-control'],'no-store');
 assert.equal(r.headers['x-content-type-options'],'nosniff');
 for(const file of ['/settlement-team-manual-ui.js','/settlement-team-sync-client.js',
  '/settlement-team-pilot.css']){
  const found=await request(pilot,file);
  assert.equal(found.status,200,file);
 }
 assert.deepEqual(calls,[]);
});
test('no plaintext HTTP, foreign Origin, paths, financial draft/admin/review POSTs',async()=>{
 const {pilot,calls}=fixture();
 assert.equal((await request(pilot,'/manual.html','GET',{encrypted:false})).status,403);
 assert.equal((await request(pilot,'/manual.html','GET',
  {headers:{host:'hostile.example.invalid'}})).status,403);
 assert.equal((await request(pilot,'/v1/login','POST',
  {headers:{origin:'https://hostile.example.invalid'}})).status,403);
 for(const bad of ['/','/settlement.html','/v1/scopes/drafts',
  '/v1/admin/memberships','/v1/scopes/review','/v1/changes',
  '/manual.html?unsafe=1','/%2e%2e/private','//manual.html',
  '/settlement-team-manual-ui.js/../x']){
  const response=await request(pilot,bad,'POST');
  assert.equal(response.status,404,bad);
 }
 assert.deepEqual(calls,[]);
});
test('only narrowly approved synthetic identity/login/logout and read-only receipt endpoint can delegate',async()=>{
 const {pilot,calls}=fixture();
 for(const [url,method] of [
  ['/v1/session','GET'],['/v1/login','POST'],
  ['/v1/logout','POST'],['/v1/recovery/receipts/inspect','POST']
 ]){
  const r=await request(pilot,url,method,{headers:{origin:ORIGIN}});
  assert.equal(r.status,200,url);assert.equal(JSON.parse(r.body).auto_send_enabled,false);
 }
 assert.deepEqual(calls.map(x=>x.method+' '+x.url),[
  'GET /v1/session','POST /v1/login','POST /v1/logout',
  'POST /v1/recovery/receipts/inspect'
 ]);
});
