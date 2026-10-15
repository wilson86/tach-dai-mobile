'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const {webcrypto}=require('node:crypto');
const {createCiEncryptedFileStore}=require('../team-settlement/ci-recovery-file-store.cjs');
const {createSyntheticRecoveryVault,SLOT}=require('../team-settlement/recovery-vault.cjs');
const CI=process.env.GITHUB_ACTIONS==='true'&&!!process.env.RUNNER_TEMP;
const TOKEN='a'.repeat(43),SECRET='disposable-ci-recovery-secret-synthetic';
const ACTOR={server_verified:true,membership_active:true,user_id:'fake_operator',
 workspace_id:'group_a',role:'operator'};
const draft=()=>({id:'draft_'+'a'.repeat(32),status:'PENDING',
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'},base_revision:0,
 payload:{synthetic:true,description:'synthetic-fixture-do-not-publish'}});
async function inTemp(run){
 const dir=await fsp.mkdtemp(path.join(process.env.RUNNER_TEMP,'kts-ci-vault-'));
 try{return await run(dir);}
 finally{await fsp.rm(dir,{recursive:true,force:true});}
}
const vault=store=>createSyntheticRecoveryVault({syntheticOnly:true,
 store,cryptoProvider:webcrypto,auth:{async verifySession(t){
 assert.equal(t,TOKEN);return ACTOR;}}});
test('CI-only sandbox refuses use outside disposable GitHub test runner',async()=>{
 await assert.rejects(createCiEncryptedFileStore({directory:'/',syntheticOnly:true}),
  /TEAM_CI_RECOVERY_DIRECTORY_INVALID|TEAM_CI_RECOVERY_STORE_DISABLED/);
 await assert.rejects(createCiEncryptedFileStore({directory:'/does-not-exist'}),
  /TEAM_CI_RECOVERY_STORE_DISABLED/);
});
test('two processes observe identical ciphertext in CI disposable directory, never plaintext', {skip:!CI},async()=>{
 await inTemp(async dir=>{
  const store=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  const receipt=await vault(store).save({sessionToken:TOKEN,passphrase:SECRET,
    drafts:[draft()],explicitConsent:true});
  assert.equal(receipt.status,'ENCRYPTED_ADAPTER_ACK');
  assert.equal(receipt.durability,'UNVERIFIED');
  assert.equal(receipt.auto_send_enabled,false);
  const file=path.join(dir,SLOT+'.json');
  const meta=await fsp.lstat(file);
  assert.equal(meta.mode&0o077,0);
  assert.equal(meta.nlink,1);
  const bytes=await fsp.readFile(file,'utf8');
  for(const s of [SECRET,TOKEN,'fake_partner_1','synthetic-fixture-do-not-publish'])
    assert.equal(bytes.includes(s),false);
  const child=cp.execFileSync(process.execPath,['-e',`
  const x=require(${JSON.stringify(path.resolve(__dirname,'../team-settlement/ci-recovery-file-store.cjs'))});
  x.createCiEncryptedFileStore({directory:process.env.KTS_CI_VAULT_DIR,syntheticOnly:true})
  .then(s=>s.read('synthetic-team-recovery-v0')).then(t=>process.stdout.write(t))
  .catch(e=>{process.stderr.write(e.message);process.exitCode=2;});
  `],{encoding:'utf8',env:{...process.env,KTS_CI_VAULT_DIR:dir},maxBuffer:140000});
  assert.equal(child,bytes);
  const second=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  const restored=await vault(second).inspect({sessionToken:TOKEN,
    passphrase:SECRET,explicitConsent:true});
  assert.equal(restored.status,'QUARANTINED');
  assert.equal(restored.auto_send_enabled,false);
  assert.equal(restored.items[0].id,draft().id);
  assert.equal(restored.items[0].auto_retry,false);
  assert.equal(await second.writeIfAbsent(SLOT,bytes),false);
  assert.equal(await fsp.readFile(file,'utf8'),bytes);
 });
});
test('concurrent exclusive create succeeds for exactly one synthetic encrypted envelope',{skip:!CI},async()=>{
 await inTemp(async dir=>{
  const Recovery=require('../app/settlement-team-recovery-v0.js');
  const ciphertext=Recovery.serializeEnvelope(await Recovery.seal({
   actor:ACTOR,passphrase:SECRET,drafts:[draft()],cryptoProvider:webcrypto}));
  const s=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  const results=await Promise.all(Array.from({length:12},()=>s.writeIfAbsent(SLOT,ciphertext)));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(results.filter(x=>x===false).length,11);
  assert.equal(await s.read(SLOT),ciphertext);
 });
});
test('truncated ciphertext and symlink attack fail rather than hiding or following it',{skip:!CI},async()=>{
 await inTemp(async dir=>{
  const s=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  const file=path.join(dir,SLOT+'.json');
  await fsp.writeFile(file,'{not-json}',{mode:0o600});
  await assert.rejects(s.read(SLOT),/TEAM_RECOVERY_FORMAT_INVALID/);
  await assert.rejects(s.writeIfAbsent(SLOT,'no'),/TEAM_RECOVERY_FORMAT_INVALID/);
 });
 await inTemp(async dir=>{
  const target=path.join(dir,'target');
  await fsp.writeFile(target,'forbidden',{mode:0o600});
  await fsp.symlink(target,path.join(dir,SLOT+'.json'));
  const s=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  await assert.rejects(s.read(SLOT),/TEAM_CI_RECOVERY_READ_FAILED/);
  assert.equal(await fsp.readFile(target,'utf8'),'forbidden');
 });
});
test('wrong slot and insecure permissions fail closed',{skip:!CI},async()=>{
 await inTemp(async dir=>{
  const s=await createCiEncryptedFileStore({directory:dir,syntheticOnly:true});
  await assert.rejects(s.read('../outside'),/TEAM_CI_RECOVERY_SLOT_INVALID/);
  await assert.rejects(s.writeIfAbsent('../outside','abc'),/TEAM_CI_RECOVERY_SLOT_INVALID/);
  await fsp.writeFile(path.join(dir,SLOT+'.json'),'bad',{mode:0o644});
  await assert.rejects(s.read(SLOT),/TEAM_CI_RECOVERY_FILE_INVALID/);
 });
});
