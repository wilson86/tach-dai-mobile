'use strict';
const {readFileSync, existsSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {resolve, join, basename}=require('node:path');
const root=resolve(__dirname,'../..');
const feature=join(root,'_feature_authority','app');
const deploy=join(root,'settlement-test');
const authority='2f7e84ba109b1226381e858fcd3ba4ffcd90b1d5';
if(!existsSync(feature))throw new Error('PINNED_FEATURE_CHECKOUT_MISSING');
const commit=execFileSync('git',['-C',join(root,'_feature_authority'),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(commit!==authority)throw new Error('FEATURE_AUTHORITY_SHA_MISMATCH:'+commit);
const source=readFileSync(join(feature,'settlement-build-identity.js'),'utf8');
const target=readFileSync(join(deploy,'settlement-build-identity.js'),'utf8');
if(source!==target)throw new Error('BUILD_IDENTITY_MANIFEST_MISMATCH');
const m=source.match(/critical\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
if(!m)throw new Error('CRITICAL_MANIFEST_MISSING');
const records=[...m[1].matchAll(/'(app\/[^']+)':'([0-9a-f]{40})'/g)].map(x=>({path:x[1],sha:x[2]}));
if(records.length<62)throw new Error('CRITICAL_MANIFEST_TOO_SMALL:'+records.length);
const hash=path=>execFileSync('git',['hash-object',path],{cwd:root,encoding:'utf8'}).trim();
const checked=new Set();let mismatches=[];
for(const {path,sha} of records){
  const name=basename(path);
  const f=join(feature,name),d=join(deploy,name);
  if(!existsSync(f)||!existsSync(d)){mismatches.push(name+':missing');continue;}
  const featureBlob=hash(f),deployBlob=hash(d);
  if(featureBlob!==sha||deployBlob!==sha){
    mismatches.push(name+':feature='+featureBlob+':deploy='+deployBlob+':pinned='+sha);
  }
  checked.add(name);
}
console.log('CRITICAL_SOURCE_MANIFEST_COUNT='+records.length);
console.log('CRITICAL_MANIFEST_PARITY='+ (mismatches.length?'FAIL':'PASS'));
const sw=readFileSync(join(feature,'sw.js'),'utf8');
const core=sw.match(/const CORE=\[([\s\S]*?)\];/);
if(!core)throw new Error('SW_CORE_NOT_FOUND');
const listed=[...core[1].matchAll(/'\.\/([^']+)'/g)].map(x=>x[1]);
const runtime=[...new Set(listed.filter(name=>
   (name==='settlement.html'||name==='sw.js'||/^(settlement-|result-).*\.js$/.test(name))
))];
for(const name of runtime){
  if(checked.has(name))continue;
  const f=join(feature,name),d=join(deploy,name);
  if(!existsSync(f)||!existsSync(d)){mismatches.push(name+':missing');continue;}
  if(hash(f)!==hash(d))mismatches.push(name+':runtime-content-diff');
  checked.add(name);
}
const workerSource=readFileSync(join(deploy,'sw.js'),'utf8');
if(workerSource!==sw)mismatches.push('sw.js:worker-parity-diff');
console.log('SETTLEMENT_RUNTIME_FILES_CHECKED='+checked.size);
const featureCacheVersion=sw.match(/const CACHE=.*?(v\d+\.\d+\.\d+-[a-z0-9-]+)/)?.[1]||null;
const cacheVersionMatch=Boolean(featureCacheVersion&&workerSource===sw&&workerSource.includes(featureCacheVersion));
console.log('WORKER_CACHE_VERSION_MATCH='+String(cacheVersionMatch));
if(!cacheVersionMatch)mismatches.push('sw.js:cache-version-mismatch');
if(mismatches.length){
  console.error('PARITY_MISMATCH_COUNT='+mismatches.length);
  console.error(mismatches.slice(0,30).join('\n'));
  process.exitCode=1;
}else{
  console.log('SETTLEMENT_FEATURE_DEPLOY_PARITY=PASS');
}
