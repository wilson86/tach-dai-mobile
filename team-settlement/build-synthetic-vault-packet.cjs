'use strict';
// Off-line, source-pinned handoff PACKET ONLY. It does not run a server,
// connect to a DB, issue TLS keys or deploy. Contains NO credentials or
// operational config, ONLY exact allowlisted fake-only browser assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cp=require('node:child_process');
const FILES=Object.freeze([
 ['settlement-team-manual-pilot.html','manual.html'],
 ['settlement-team-pilot.css','settlement-team-pilot.css'],
 ['settlement-team-review-audit.js','settlement-team-review-audit.js'],
 ['settlement-team-sync-client.js','settlement-team-sync-client.js'],
 ['settlement-team-pilot-ui.js','settlement-team-pilot-ui.js'],
 ['settlement-team-recovery-v0.js','settlement-team-recovery-v0.js'],
 ['settlement-team-recovery-idb-v0.js','settlement-team-recovery-idb-v0.js'],
 ['settlement-team-manual-checkpoint-v0.js','settlement-team-manual-checkpoint-v0.js'],
 ['settlement-team-manual-ui.js','settlement-team-manual-ui.js'],
 ['settlement-team-manual-start.js','settlement-team-manual-start.js']
]);
function deny(code){throw Error(code)}
function gitHead(root){
 return cp.execFileSync('git',['rev-parse','HEAD'],{
  cwd:root,encoding:'utf8',timeout:8000}).trim();
}
function buildSyntheticVaultPacket({root,outDir,sourceSha,syntheticOnly=false}={}){
 if(syntheticOnly!==true)deny('TEAM_VAULT_PACKET_DISABLED');
 if(typeof root!=='string'||typeof outDir!=='string'||
    !path.isAbsolute(root)||!path.isAbsolute(outDir)||
    !/^[a-f0-9]{40}$/.test(sourceSha||''))
  deny('TEAM_VAULT_PACKET_CONFIG_INVALID');
 const source=path.resolve(root),dest=path.resolve(outDir);
 if(dest===source||dest.startsWith(source+path.sep))
  deny('TEAM_VAULT_PACKET_DESTINATION_UNSAFE');
 if(gitHead(source)!==sourceSha)
  deny('TEAM_VAULT_PACKET_SOURCE_SHA_MISMATCH');
 if(fs.existsSync(dest))deny('TEAM_VAULT_PACKET_DESTINATION_EXISTS');
 // Fully verify every file before creating output. No source mutation,
 // symlink dereference, URL fetch, or automatic live application wiring.
 const prepared=FILES.map(([from,to])=>{
  const filename=path.join(source,'app',from),stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)
   deny('TEAM_VAULT_PACKET_ASSET_INVALID');
  const bytes=fs.readFileSync(filename);
  if(bytes.length!==stat.size)deny('TEAM_VAULT_PACKET_ASSET_CHANGED');
  return {from,to,bytes,
   size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 });
 fs.mkdirSync(dest,{recursive:false,mode:0o700});
 const manifest={
  schema:'kts-synthetic-vault-packet-v1',
  source_sha:sourceSha,
  fake_only:true,
  live_finance_ready:false,
  deploy_authorized:false,
  requires_approved_private_https:true,
  backend_credentials_included:false,
  tls_private_keys_included:false,
  allows_financial_draft_post:false,
  active_queue_persistence:'MEMORY_ONLY',
  restored_intents:'QUARANTINED_NO_AUTO_RETRY',
  files:prepared.map(x=>({path:x.to,bytes:x.size,sha256:x.sha256}))
 };
 for(const f of prepared)
  fs.writeFileSync(path.join(dest,f.to),f.bytes,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(dest,'MANIFEST.json'),
  JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return Object.freeze(manifest);
}
if(require.main===module){
 try{
  if(process.env.GITHUB_ACTIONS!=='true')
   deny('TEAM_VAULT_PACKET_CI_ONLY');
  const root=path.resolve(__dirname,'..');
  const out=process.env.KTS_VAULT_PACKET_DIR;
  const runner=process.env.RUNNER_TEMP;
  if(!out||!runner||!path.isAbsolute(out)||
     !path.resolve(out).startsWith(path.resolve(runner)+path.sep))
   deny('TEAM_VAULT_PACKET_DESTINATION_UNSAFE');
  const manifest=buildSyntheticVaultPacket({root,outDir:out,
   sourceSha:process.env.KTS_VAULT_SOURCE_SHA,syntheticOnly:true});
  process.stdout.write(JSON.stringify({status:'PASS_SYNTHETIC_PACKAGE',
   source_sha:manifest.source_sha,
   file_count:manifest.files.length,real_money_ready:false,
   deploy_authorized:false})+'\n');
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
module.exports=Object.freeze({buildSyntheticVaultPacket,FILES});
