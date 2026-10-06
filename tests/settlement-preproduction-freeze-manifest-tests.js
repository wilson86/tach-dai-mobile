'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
(async()=>{
  function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
  const sha=async v=>crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
  const build={version:'settlement-build-identity-v1',algorithm:'git-blob-sha1',business_engine_sha256:'a'.repeat(64),critical_git_blobs:{'b.js':'2'.repeat(40),'a.js':'1'.repeat(40)}};
  const ctx={console,Date,JSON,KTS_SETTLEMENT_BUILD_IDENTITY:build,KTS_SETTLEMENT_QUALIFICATION_HISTORY:{sha256Hex:sha},globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-preproduction-freeze-manifest.js','utf8'),ctx);
  const F=ctx.KTS_SETTLEMENT_PREPRODUCTION_FREEZE_MANIFEST;assert(F);assert.strictEqual(F.version,'settlement-preproduction-freeze-manifest-v1');const m=await F.buildFreezeManifest();assert.strictEqual(m.status,'PREPRODUCTION_CODE_FREEZE_MANIFEST_CURRENT');assert.strictEqual(m.authority.production_authorized,false);assert.strictEqual(m.policy.critical_change_invalidates_existing_evidence,true);assert.strictEqual(m.build.critical_file_count,2);assert.strictEqual(m.build.critical_files[0].path,'a.js');let v=await F.verifyFreezeManifest(m,{require_current:true});assert.strictEqual(v.valid,true);
  const outer=JSON.parse(JSON.stringify(m));outer.policy.freeze_is_not_production_approval=false;v=await F.verifyFreezeManifest(outer,{require_current:true});assert.strictEqual(v.valid,false);assert(v.errors.includes('PREPRODUCTION_FREEZE_SHA_MISMATCH'));
  ctx.KTS_SETTLEMENT_BUILD_IDENTITY={...build,critical_git_blobs:{...build.critical_git_blobs,'c.js':'3'.repeat(40)}};v=await F.verifyFreezeManifest(m,{require_current:true});assert.strictEqual(v.valid,false);assert(v.errors.some(x=>x.includes('CRITICAL_FILES_MISMATCH')||x.includes('BUILD_IDENTITY_MISMATCH')));
  console.log('settlement-preproduction-freeze-manifest-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
