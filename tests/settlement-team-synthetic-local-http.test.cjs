'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {test}=require('node:test');
const http=require('node:http');
const {createSyntheticLocalTeamHttp}=require('../team-settlement/synthetic-local-team-http.cjs');

function request(url,options={}){return fetch(url,options).then(async response=>({
 status:response.status,headers:response.headers,body:await response.text()}));}
async function withServer(work){
 let delegated=0;
 const app=http.createServer((req,res)=>{delegated++;res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"AUTH_ROUTE_NOT_FOUND"}');});
 const server=createSyntheticLocalTeamHttp({appServer:app,appDir:path.join(__dirname,'../app')});
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
 try{await work('http://127.0.0.1:'+server.address().port,()=>delegated);}
 finally{await new Promise(ok=>server.close(ok));app.closeAllConnections?.();}
}
test('local synthetic wrapper serves only allowlisted same-origin assets',async()=>{
 await withServer(async(base,calls)=>{
  const page=await request(base+'/settlement-team-pilot.html?synthetic_review_ui=1');
  assert.equal(page.status,200);assert.equal(page.headers.get('x-kts-synthetic-local'),'true');
  assert.match(page.body,/SYNTHETIC ONLY/);
  const post=await request(base+'/settlement-team-pilot.html',{method:'POST'});
  assert.equal(post.status,405);
  const hidden=await request(base+'/not-an-asset.js');
  assert.equal(hidden.status,404);assert.equal(calls(),1);
 });
});
test('local synthetic wrapper rejects malformed construction',()=>{
 assert.throws(()=>createSyntheticLocalTeamHttp({appServer:http.createServer(),appDir:'relative'}),/TEAM_LOCAL_APP_DIR_REQUIRED/);
 assert.throws(()=>createSyntheticLocalTeamHttp({appServer:{},appDir:path.resolve(__dirname,'../app')}),/TEAM_LOCAL_APP_SERVER_REQUIRED/);
});
