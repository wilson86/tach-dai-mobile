'use strict';
// NOT A SERVER. Restricted preapproved synthetic-only HTTPS request-handler
// seam for physical-phone *vault and receipt review* qualification. Its
// constructor never opens a port, constructs TLS, reads keys, starts a DB,
// or changes any operational service. Real money and draft POST are denied.
const fs=require('node:fs'),path=require('node:path');
const ASSETS=Object.freeze({
 '/manual.html':'settlement-team-manual-pilot.html',
 '/settlement-team-pilot.css':'settlement-team-pilot.css',
 '/settlement-team-review-audit.js':'settlement-team-review-audit.js',
 '/settlement-team-sync-client.js':'settlement-team-sync-client.js',
 '/settlement-team-pilot-ui.js':'settlement-team-pilot-ui.js',
 '/settlement-team-recovery-v0.js':'settlement-team-recovery-v0.js',
 '/settlement-team-recovery-idb-v0.js':'settlement-team-recovery-idb-v0.js',
 '/settlement-team-manual-checkpoint-v0.js':'settlement-team-manual-checkpoint-v0.js',
 '/settlement-team-manual-ui.js':'settlement-team-manual-ui.js',
 '/settlement-team-manual-start.js':'settlement-team-manual-start.js'
});
const READ_API=new Set(['/v1/session']);
const MUTATING_TRANSPORT_ONLY=new Set(['/v1/login','/v1/logout',
 '/v1/recovery/receipts/inspect']);
function error(code){throw Error(code)}
function parseApprovedOrigin(value){
 let u;
 try{u=new URL(value);}catch(_){error('TEAM_PRIVATE_ORIGIN_INVALID')}
 if(typeof value!=='string'||value!==u.origin||
    u.protocol!=='https:'||u.username||u.password||u.hash||u.search||
    u.port==='8787'||!u.hostname)
   error('TEAM_PRIVATE_ORIGIN_INVALID');
 return u;
}
function createSyntheticVaultPilotHandler({
 rootDir,backend,approvedOrigin,syntheticOnly=false,privatePilotApproved=false
}={}){
 if(syntheticOnly!==true||privatePilotApproved!==true)
  error('TEAM_PRIVATE_PILOT_NOT_AUTHORIZED');
 if(typeof rootDir!=='string'||!path.isAbsolute(rootDir)||
    !backend||typeof backend.emit!=='function')
  error('TEAM_PRIVATE_PILOT_CONFIG_INVALID');
 const origin=parseApprovedOrigin(approvedOrigin).origin;
 const app=path.join(rootDir,'app');
 function response(res,status,body){
  res.writeHead(status,{'cache-control':'no-store',
   'content-type':'text/plain; charset=utf-8',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'content-security-policy':"default-src 'none'",
   'permissions-policy':'camera=(), microphone=(), geolocation=()'});
  res.end(body);
 }
 // Fixed allowlist, intentionally no /v1/scopes/drafts and no admin/review
 // mutation. All API calls still use authentic synthetic backend auth.
 function handler(req,res){
  if(!req||!res||req.socket?.encrypted!==true){
   response(res,403,'TEAM_PRIVATE_PILOT_HTTPS_REQUIRED');return;
  }
  // Exact approved host and browser Origin, not a user-supplied workspace.
  // No wildcard DNS, proxy forwarding, CORS or cookie authorization.
  if(req.headers?.host!==new URL(origin).host||
     (req.headers.origin&&req.headers.origin!==origin)){
   response(res,403,'TEAM_PRIVATE_PILOT_ORIGIN_DENIED');return;
  }
  const url=req.url;
  if(typeof url!=='string'||url.includes('?')||url.includes('#')||
     url.includes('%')||url.includes('\\')||url.includes('//')){
   response(res,404,'TEAM_PRIVATE_PILOT_PATH_DENIED');return;
  }
  if(req.method==='GET'&&Object.hasOwn(ASSETS,url)){
   const filename=ASSETS[url],absolute=path.join(app,filename);
   let stat;
   try{stat=fs.lstatSync(absolute);}catch(_){
    response(res,404,'TEAM_PRIVATE_PILOT_ASSET_MISSING');return;
   }
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024){
    response(res,404,'TEAM_PRIVATE_PILOT_ASSET_DENIED');return;
   }
   const contentType=filename.endsWith('.html')?'text/html; charset=utf-8':
     filename.endsWith('.css')?'text/css; charset=utf-8':
     'text/javascript; charset=utf-8';
   res.writeHead(200,{'content-type':contentType,
    'content-length':stat.size,'cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'cross-origin-resource-policy':'same-origin',
    'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'"});
   const stream=fs.createReadStream(absolute);
   stream.on('error',()=>res.destroy());
   stream.pipe(res);return;
  }
  if((req.method==='GET'&&READ_API.has(url))||
     (req.method==='POST'&&MUTATING_TRANSPORT_ONLY.has(url))){
   if(backend.emit('request',req,res)!==true&&!res.headersSent)
    response(res,503,'TEAM_PRIVATE_PILOT_BACKEND_NOT_READY');
   return;
  }
  // Intentionally block financial draft POST even when the user clicks the
  // existing pilot's Sync button. The approved phone pilot here only proves
  // fake-data manual encrypted backup and READ-ONLY receipt inspection.
  response(res,404,'TEAM_PRIVATE_PILOT_ROUTE_DISABLED');
 }
 return Object.freeze({handler,approvedOrigin:origin,
  allowedStaticAssets:Object.freeze(Object.keys(ASSETS)),
  servesRealMoney:false,allowsFinancialDraftPost:false});
}
module.exports=Object.freeze({createSyntheticVaultPilotHandler});
