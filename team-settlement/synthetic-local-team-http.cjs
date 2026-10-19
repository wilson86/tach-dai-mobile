'use strict';

// Local-only composition wrapper for a bounded synthetic Windows trial.  It
// does not create database pools or bind a socket: its caller must provide an
// already composed synthetic app server and explicitly choose 127.0.0.1.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

const ASSETS=Object.freeze(new Map([
  ['/settlement-team-pilot.html','settlement-team-pilot.html'],
  ['/settlement-team-pilot.css','settlement-team-pilot.css'],
  ['/settlement-team-review-audit.js','settlement-team-review-audit.js'],
  ['/settlement-team-sync-client.js','settlement-team-sync-client.js'],
  ['/settlement-team-pilot-ui.js','settlement-team-pilot-ui.js'],
  ['/settlement-team-pilot-start.js','settlement-team-pilot-start.js']
]));
function fail(code){throw Error(code);}
function type(file){
 if(file.endsWith('.html'))return 'text/html; charset=utf-8';
 if(file.endsWith('.css'))return 'text/css; charset=utf-8';
 return 'text/javascript; charset=utf-8';
}
function createSyntheticLocalTeamHttp({appServer,appDir}={}){
 if(!appServer||typeof appServer.emit!=='function'||typeof appServer.listen!=='function')
   fail('TEAM_LOCAL_APP_SERVER_REQUIRED');
 if(typeof appDir!=='string'||!path.isAbsolute(appDir))fail('TEAM_LOCAL_APP_DIR_REQUIRED');
 for(const file of ASSETS.values()){
  const candidate=path.join(appDir,file);
  if(!fs.statSync(candidate).isFile())fail('TEAM_LOCAL_ASSET_MISSING');
 }
 return http.createServer((req,res)=>{
  let parsed;
  try{parsed=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400).end();return;}
  const file=ASSETS.get(parsed.pathname);
  if(file){
   if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405,{'allow':'GET, HEAD','cache-control':'no-store'}).end();return;
   }
   const body=fs.readFileSync(path.join(appDir,file));
   res.writeHead(200,{'content-type':type(file),'cache-control':'no-store',
    'content-length':String(body.length),'x-kts-synthetic-local':'true'});
   if(req.method==='GET')res.end(body);else res.end();
   return;
  }
  // API routes are delegated unchanged to the reviewed auth/ledger HTTP
  // contract.  Unknown static paths reach that contract and fail closed.
  appServer.emit('request',req,res);
 });
}
module.exports=Object.freeze({ASSETS,createSyntheticLocalTeamHttp});
