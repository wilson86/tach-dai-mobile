'use strict';
// Pre-deployment trust check: all pinned settlement resources must match the
// exact candidate commit before GitHub Pages upload/deploy is possible.
const {readFileSync,existsSync,readdirSync}=require('node:fs');
const {resolve,join,extname}=require('node:path');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const root=resolve(__dirname,'../..');
const folder=join(root,'settlement-test');
const source=readFileSync(join(folder,'settlement-build-identity.js'),'utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox,{filename:'settlement-build-identity.js'});
const identity=sandbox.window.KTS_SETTLEMENT_BUILD_IDENTITY;
if(identity?.version!=='settlement-build-identity-v1'||identity.algorithm!=='git-blob-sha1')
  throw Error('PREDEPLOY_INVALID_BUILD_IDENTITY');
const pins=identity.critical_git_blobs;
const names=Object.keys(pins||{});
if(names.length<59)throw Error('PREDEPLOY_CRITICAL_MANIFEST_TOO_SMALL:'+names.length);
let checked=0;
for(const key of names){
  if(!/^app\/[a-zA-Z0-9_.-]+\.(js|html)$/.test(key))throw Error('PREDEPLOY_MANIFEST_KEY_INVALID:'+key);
  const file=join(folder,key.slice(4));
  if(!existsSync(file))throw Error('PREDEPLOY_CRITICAL_FILE_MISSING:'+key);
  const actual=execFileSync('git',['hash-object',file],{cwd:root,encoding:'utf8'}).trim();
  if(actual!==pins[key])throw Error('PREDEPLOY_CRITICAL_BLOB_MISMATCH:'+key);
  checked++;
}
const sw=readFileSync(join(folder,'sw.js'),'utf8');
const match=sw.match(/const CORE=\[([\s\S]*?)\];/);
if(!match)throw Error('PREDEPLOY_SW_CORE_MISSING');
const core=[...match[1].matchAll(/'((?:\.\/|\.\.\/)[^']+)'/g)].map(x=>x[1]);
if(core.length<60)throw Error('PREDEPLOY_SW_CORE_TOO_SMALL:'+core.length);
for(const item of core){
  const file=resolve(folder,item);
  if(!file.startsWith(root+'/')||!existsSync(file))
    throw Error('PREDEPLOY_SW_CACHE_ASSET_MISSING:'+item);
}
const jsFiles=readdirSync(folder).filter(name=>extname(name)==='.js');
if(jsFiles.length<50)throw Error('PREDEPLOY_JS_SURFACE_TOO_SMALL:'+jsFiles.length);
for(const file of jsFiles){
  const source=readFileSync(join(folder,file),'utf8');
  try{new vm.Script(source,{filename:file});}catch(e){throw Error('PREDEPLOY_JS_SYNTAX_ERROR:'+file+':'+e.message);}
}
console.log('PREDEPLOY_CRITICAL_BLOB_PINS='+checked);
console.log('PREDEPLOY_SW_CACHE_ASSETS='+core.length);
console.log('PREDEPLOY_JS_SYNTAX_FILES='+jsFiles.length);
console.log('PREDEPLOY_SOURCE_INTEGRITY=PASS');
