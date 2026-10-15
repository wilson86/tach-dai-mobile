'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),crypto=require('node:crypto');
const {buildSyntheticVaultPacket,FILES}=require(
 '../team-settlement/build-synthetic-vault-packet.cjs');
const root=path.join(__dirname,'..');
const sha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'kts-fake-vault-packet-'));}
test('strict default OFF and unmatched checkout SHA create no output',()=>{
 const home=temp(),out=path.join(home,'bundle');
 try{
  assert.throws(()=>buildSyntheticVaultPacket({
   root,outDir:out,sourceSha:sha}),/TEAM_VAULT_PACKET_DISABLED/);
  assert.equal(fs.existsSync(out),false);
  assert.throws(()=>buildSyntheticVaultPacket({root,outDir:out,
   syntheticOnly:true,sourceSha:'0'.repeat(40)}),
   /TEAM_VAULT_PACKET_SOURCE_SHA_MISMATCH/);
  assert.equal(fs.existsSync(out),false);
 }finally{fs.rmSync(home,{force:true,recursive:true});}
});
test('exact-head packet contains only ten immutable fake UI assets and manifest',()=>{
 const home=temp(),out=path.join(home,'bundle');
 try{
  const manifest=buildSyntheticVaultPacket({
   root,outDir:out,sourceSha:sha,syntheticOnly:true});
  assert.equal(manifest.source_sha,sha);
  assert.equal(manifest.files.length,10);
  assert.equal(manifest.fake_only,true);
  assert.equal(manifest.deploy_authorized,false);
  assert.equal(manifest.tls_private_keys_included,false);
  assert.equal(manifest.backend_credentials_included,false);
  assert.equal(manifest.allows_financial_draft_post,false);
  assert.deepEqual(fs.readdirSync(out).sort(),
   [...FILES.map(x=>x[1]),'MANIFEST.json'].sort());
  for(const item of manifest.files){
   const raw=fs.readFileSync(path.join(out,item.path));
   assert.equal(raw.length,item.bytes);
   assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),item.sha256);
  }
  const html=fs.readFileSync(path.join(out,'manual.html'),'utf8');
  assert.match(html,/SYNTHETIC ONLY/);
  for(const [,name] of FILES.filter(x=>x[1].endsWith('.js')||x[1].endsWith('.css')))
   assert.match(html,new RegExp(name.replaceAll('.','\\.')));
  assert.throws(()=>buildSyntheticVaultPacket({
   root,outDir:out,sourceSha:sha,syntheticOnly:true}),
   /TEAM_VAULT_PACKET_DESTINATION_EXISTS/);
 }finally{fs.rmSync(home,{force:true,recursive:true});}
});
test('a GitHub checkout is not a deployment destination and source tree is immutable',()=>{
 assert.throws(()=>buildSyntheticVaultPacket({root,
  outDir:path.join(root,'app','unsafe-bundle'),sourceSha:sha,syntheticOnly:true}),
  /TEAM_VAULT_PACKET_DESTINATION_UNSAFE/);
});
