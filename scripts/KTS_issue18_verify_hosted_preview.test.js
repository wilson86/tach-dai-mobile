'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyHosted,checkUrl,canonicalRemotePath,assetNames}=require('./KTS_issue18_verify_hosted_preview.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const HOST='https://kts-issue18-isolated-preview.pages.dev/';
const shas={mobile:'f882330841a0e84d0f2ee29a75eed1cc1ae14b5b',ngang:'afc777d01ba2346b7eb3a322afe9bbebc6068fc0',stage:'7b224b1d40a0d5f1c76402f5df858bb14976062f972e3d8c8a59d58c4b9cfb53'};
const validHeaders={
  'content-security-policy':"default-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  'x-frame-options':'SAMEORIGIN','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'
};
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kts-remote-preview-')),tmp={};
 for(const f of assetNames){let b=Buffer.from('dummy: '+f);
  if(f==='Mobile/app/index.html')b=Buffer.from('<iframe id="ngangFrame" src="../../Ngang/"></iframe> BẢN THỬ NGHIỆM');
  if(f==='Mobile/app/sw.js')b=Buffer.from('// /Mobile/app');
  tmp[f]=b;
 }
 tmp['index.html']=Buffer.from('<h1>BẢN THỬ NGHIỆM</h1>');
 tmp['robots.txt']=Buffer.from('User-agent: *\nDisallow: /');
 tmp['_headers']=Buffer.from('/*\n  Content-Security-Policy: '+validHeaders['content-security-policy']+'\n');
 const manifest={schema:'KTS_ISSUE18_PREVIEW_EXPORT_V1',public_preview_only:true,release_authorized:false,
  target_origin_policy:'SEPARATE_ORIGIN_REQUIRED',mobile_sha:shas.mobile,ngang_sha:shas.ngang,
  stage_manifest_sha256:shas.stage,assets:Object.fromEntries(assetNames.map(f=>[f,sha(tmp[f])]))};
 tmp['KTS_PREVIEW_MANIFEST.json']=Buffer.from(JSON.stringify(manifest));
 for(const [f,b] of Object.entries(tmp)){const file=path.join(root,...f.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,b)}
 const serve=(url,options={})=>{
  const key=Object.keys(tmp).find(f=>new URL(canonicalRemotePath(f),HOST).href===url);
  assert.ok(key,'unrecognized fetch:'+url);assert.equal(options.redirect,'manual');
  return Promise.resolve(new Response(tmp[key],{status:200,headers:validHeaders}));
 };
 return {root,tmp,serve};
}
test('26? exact 24 origin-pinned assets with Cloudflare canonical index routes are verified',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const calls=[];const fetchImpl=async(u,o)=>{calls.push(u);return f.serve(u,o)};
 const r=await verifyHosted({origin:HOST,root:f.root,fetchImpl});
 assert.equal(r.status,'HOSTED_PREVIEW_SOURCE_AND_HEADERS_PASS');
 assert.equal(r.checked_files,24);assert.equal(r.sha_bound_asset_files,21);assert.equal(calls.length,24);
 for(const x of ['','Mobile/','Ngang/','Mobile/app/'])assert.ok(calls.includes(HOST+x),'canonical route '+x);
});
test('reject same origin, HTTP, lookalikes, external domains, credentials, URL path/query',()=>{
 for(const u of ['https://wilson86.github.io/','http://x.pages.dev/',
  'https://x.pages.dev.evil.com/','https://user:pass@x.pages.dev/',
  'https://x.pages.dev/Mobile/app/','https://x.pages.dev/?test=1','https://x.pages.dev:8443/']){
   assert.throws(()=>checkUrl(u),/HOSTED_PREVIEW_BLOCKED:/,u);
 }
});
test('reject wrong local staged file without any network call',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 fs.appendFileSync(path.join(f.root,'Ngang','index.html'),'t');let cnt=0;
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl:()=>{cnt++;throw Error('MUST_NOT_FETCH')}}),/LOCAL_ASSET_DRIFT/);
 assert.equal(cnt,0);
});
test('reject bogus source SHA in local manifest',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const p=path.join(f.root,'KTS_PREVIEW_MANIFEST.json');const j=JSON.parse(fs.readFileSync(p));j.mobile_sha='0'.repeat(40);fs.writeFileSync(p,JSON.stringify(j));
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl:f.serve}),/LOCAL_MANIFEST_NOT_SOURCE_PINNED/);
});
test('reject remote asset hash drift',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 let calls=0;const fetchImpl=async(u,o)=>{calls++;if(u===HOST+'Mobile/app/')return new Response('WRONG',{status:200,headers:validHeaders});return f.serve(u,o)};
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl}),/REMOTE_HASH_MISMATCH:Mobile\/app\/index.html/);
 assert.ok(calls>0);
});
test('reject remote redirect before sending money tests',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const fetchImpl=async(u,o)=>new Response(null,{status:302,headers:{location:'https://wilson86.github.io/'}});
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl}),/REMOTE_NOT_EXACT_200/);
});
test('reject preview missing CSP or off-origin frame policy',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const h={...validHeaders};delete h['content-security-policy'];
 const fetchImpl=async(u,o)=>new Response('x',{status:200,headers:h});
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl}),/CSP_MISSING/);
});
test('reject unknown resource and fake 200, no output or storage writes',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const fetchImpl=async(u,o)=>new Response('custom 404 SPA fallback',{status:200,headers:validHeaders});
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl}),/REMOTE_HASH_MISMATCH/);
});
test('reject permissive, duplicate, and unknown CSP source directives',()=>{
 const {enforceHeaders}=require('./KTS_issue18_verify_hosted_preview.js');
 for(const unsafe of [
   validHeaders['content-security-policy'].replace("connect-src 'self'","connect-src 'self' https://other.example"),
   validHeaders['content-security-policy'].replace("frame-src 'self'","frame-src 'self' https://wilson86.github.io"),
   validHeaders['content-security-policy']+'; connect-src *',
   validHeaders['content-security-policy'].replace("img-src 'self' data:","img-src *"),
 ])assert.throws(()=>enforceHeaders(new Headers({...validHeaders,'content-security-policy':unsafe})),/CSP_UNSAFE_DIRECTIVE/);
 assert.doesNotThrow(()=>enforceHeaders(new Headers(validHeaders)));
});
test('reject staged asset modified after validation but before hosted comparison',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 let modified=false;
 const fetchImpl=(url,options)=>{
   if(url===HOST+'Ngang/sw.js'){
     fs.writeFileSync(path.join(f.root,'Ngang','sw.js'),'injected AFTER validation');
     modified=true;
     return new Response('injected AFTER validation',{status:200,headers:validHeaders});
   }
   return f.serve(url,options);
 };
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl}),/REMOTE_HASH_MISMATCH:Ngang\/sw.js/);
 assert.equal(modified,true);
});

test('refuse unexpected private artifacts, including nested files, before network',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const extra=path.join(f.root,'Mobile','private-user-tickets.json');
 fs.writeFileSync(extra,'SYNTHETIC_SECRET');
 let fetches=0;
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl:()=>{fetches++;throw Error('unexpected network')}}),/EXPORT_INVENTORY_MISMATCH/);
 assert.equal(fetches,0);
});
test('refuse absent _headers as an incomplete public deployment package',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 fs.unlinkSync(path.join(f.root,'_headers'));
 let fetches=0;
 await assert.rejects(()=>verifyHosted({origin:HOST,root:f.root,fetchImpl:()=>{fetches++;throw Error('unexpected network')}}),/EXPORT_INVENTORY_MISMATCH/);
 assert.equal(fetches,0);
});
test('reject missing inline script, style, image and base CSP directives',()=>{
 const {enforceHeaders}=require('./KTS_issue18_verify_hosted_preview.js');
 for(const drop of ['script-src','style-src','img-src','base-uri']){
   const csp=validHeaders['content-security-policy'].split('; ').filter(x=>!x.startsWith(drop+' ')).join('; ');
   assert.throws(()=>enforceHeaders(new Headers({...validHeaders,'content-security-policy':csp})),new RegExp('CSP_MISSING:'+drop));
 }
});
