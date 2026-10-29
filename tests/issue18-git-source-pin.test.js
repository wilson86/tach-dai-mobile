'use strict';
// Local synthetic Git checkout only; never contacts GitHub or a customer repo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verifyGitSource}=require('../scripts/issue18-git-source-pin.js');
function git(root,...args){
  const r=spawnSync('git',args,{cwd:root,shell:false,encoding:'utf8',
    windowsHide:true,timeout:20000,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
  assert.equal(r.status,0,(r.stderr||r.error?.message||'Git process failed'));
  return r.stdout.trim();
}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kts-issue18-gitpin-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  git(dir,'init','-q');
  fs.writeFileSync(path.join(dir,'synthetic.txt'),'synthetic-only');
  git(dir,'add','synthetic.txt');
  git(dir,'-c','user.name=KTS Fixture','-c','user.email=kts-fixture@invalid.test',
    'commit','-q','-m','synthetic source pin fixture');
  return {dir,sha:git(dir,'rev-parse','HEAD')};
}
test('accepts one exact SHA from clean isolated local Git checkout',t=>{
  const {dir,sha}=fixture(t);
  assert.equal(verifyGitSource(dir,sha),sha);
});
test('rejects changed HEAD, dirty source and untracked local files',t=>{
  const {dir,sha}=fixture(t);
  assert.throws(()=>verifyGitSource(dir,'0'.repeat(40)),/SOURCE_SHA_DRIFT/);
  fs.appendFileSync(path.join(dir,'synthetic.txt'),'\nDRIFT');
  assert.throws(()=>verifyGitSource(dir,sha),/DIRTY_CHECKOUT/);
  fs.writeFileSync(path.join(dir,'untracked.test'),'NO CUSTOMER DATA');
  assert.throws(()=>verifyGitSource(dir,sha),/DIRTY_CHECKOUT/);
});
test('rejects malformed SHA, non-Git folder or linked .git marker',t=>{
  const {dir}=fixture(t);
  assert.throws(()=>verifyGitSource(dir,'not-sha'),/INVALID_SHA/);
  const noGit=fs.mkdtempSync(path.join(os.tmpdir(),'kts-issue18-nogit-'));
  t.after(()=>fs.rmSync(noGit,{recursive:true,force:true}));
  assert.throws(()=>verifyGitSource(noGit,'a'.repeat(40)),/LINKED_WORKTREE/);
});
