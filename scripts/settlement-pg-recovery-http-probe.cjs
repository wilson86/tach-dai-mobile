'use strict';
// Disposable synthetic cluster only. Invoked by the SHA-pinned supervised runner.
// This probe never accepts a remote host or an existing PostgreSQL data directory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');
const {inspectProposedPools}=require('../team-settlement/two-pool-readonly-admission.cjs');
const {observeSyntheticTenantGucExposure}=require('../team-settlement/tenant-guc-observation.cjs');
const DRIVER='C:\\KTS-Settlement\\w20-2d63c84e\\pg-driver-offline-20261104';
const LOCK='BEA68A0C1FD5508BD35BCD41841A11850ED3842FD7294B30B77925795C2EDD1E';
async function main(){
 const [port,root]=process.argv.slice(2);
 if(process.platform!=='win32'||!/^[0-9]{2,5}$/.test(port||'')||
   !/^C:\\KTS-Settlement\\PG_SYNTHETIC_[a-f0-9]{10}_[0-9]+_[a-f0-9]{8}$/i.test(root||'')||
   process.env.PGHOST!=='127.0.0.1'||process.env.PGUSER!=='qa_admin'||!process.env.PGPASSWORD)
   throw Error('RECOVERY_PROBE_SCOPE_DENIED');
 const actual=fs.realpathSync(root), expected=fs.realpathSync(path.join(root,'fresh-pgdata'));
 if(actual.toLowerCase()!==root.toLowerCase()||!expected.toLowerCase().startsWith(actual.toLowerCase()+'\\'))
   throw Error('RECOVERY_PROBE_ROOT_MISMATCH');
 if(crypto.createHash('sha256').update(fs.readFileSync(path.join(DRIVER,'package-lock.json'))).digest('hex').toUpperCase()!==LOCK)
   throw Error('RECOVERY_PROBE_DRIVER_LOCK_MISMATCH');
 const {Pool}=require(path.join(DRIVER,'node_modules','pg'));
 const base={host:'127.0.0.1',port:Number(port),database:'postgres',connectionTimeoutMillis:5000,max:2};
 const admin=new Pool({...base,user:'qa_admin',password:process.env.PGPASSWORD});
 let authPool,ledgerPool,server;
 try{
  const directory=(await admin.query('SHOW data_directory')).rows[0].data_directory;
  if(fs.realpathSync(directory).toLowerCase()!==expected.toLowerCase())throw Error('RECOVERY_PROBE_DATABASE_ROOT_MISMATCH');
  const authPass=crypto.randomBytes(24).toString('hex'),ledgerPass=crypto.randomBytes(24).toString('hex');
  await admin.query(`CREATE ROLE synthetic_recovery_auth LOGIN PASSWORD '${authPass}' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE synthetic_recovery_ledger LOGIN PASSWORD '${ledgerPass}' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA kts_auth,kts_team TO synthetic_recovery_auth;
GRANT SELECT ON kts_auth.credentials,kts_auth.sessions TO synthetic_recovery_auth;
GRANT INSERT (session_hash,user_id,workspace_id,issued_at,expires_at), UPDATE (revoked_at) ON kts_auth.sessions TO synthetic_recovery_auth;
GRANT SELECT (user_id,disabled_at,auth_subject) ON kts_team.identities TO synthetic_recovery_auth;
GRANT SELECT (workspace_id,user_id,team_role,revoked_at) ON kts_team.memberships TO synthetic_recovery_auth;
GRANT USAGE ON SCHEMA kts_team,kts_auth TO synthetic_recovery_ledger;
GRANT SELECT (user_id,disabled_at) ON kts_team.identities TO synthetic_recovery_ledger;
GRANT SELECT (workspace_id,user_id,team_role,revoked_at) ON kts_team.memberships TO synthetic_recovery_ledger;
GRANT SELECT ON kts_team.scope_events,kts_team.idempotency_receipts TO synthetic_recovery_ledger;
ALTER ROLE synthetic_recovery_auth SET log_parameter_max_length_on_error=0;
ALTER ROLE synthetic_recovery_ledger SET log_parameter_max_length_on_error=0;`);
  authPool=new Pool({...base,user:'synthetic_recovery_auth',password:authPass});
  ledgerPool=new Pool({...base,user:'synthetic_recovery_ledger',password:ledgerPass});
  const projected=await inspectProposedPools({authPool,ledgerPool,authRole:'synthetic_recovery_auth',ledgerRole:'synthetic_recovery_ledger',syntheticOnly:true});
  assert.equal(projected.production_qualified,false);
  const token=crypto.randomBytes(32).toString('base64url');
  const scope={workspace_id:'group_a',partner_id:'fake_recovery_partner',business_date:'2026-10-15',region:'mn'};
  const payload={synthetic:true},id='draft_'+crypto.randomBytes(16).toString('hex');
  const hash=digest({action:'create_draft',scope,expected_revision:0,payload});
  await admin.query("INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name) VALUES('group_a',$1,'customer','synthetic')",[scope.partner_id]);
  await admin.query("INSERT INTO kts_team.scopes(workspace_id,partner_id,business_date,region,state,revision) VALUES('group_a',$1,$2,'mn','DRAFT',1)",[scope.partner_id,scope.business_date]);
  const seq=(await admin.query("UPDATE kts_team.workspaces SET feed_seq=feed_seq+1 WHERE workspace_id='group_a' RETURNING feed_seq")).rows[0].feed_seq;
  await admin.query("INSERT INTO kts_team.scope_events(workspace_id,event_id,partner_id,business_date,region,scope_revision,feed_seq,actor_user_id,event_kind,payload_sha256,result_snapshot) VALUES('group_a','synthetic_recovery_event',$1,$2,'mn',1,$3,'user_1','DRAFT_CREATED',$4,'{}')",[scope.partner_id,scope.business_date,seq,hash]);
  await admin.query("INSERT INTO kts_team.idempotency_receipts(workspace_id,idempotency_key,request_sha256,event_id) VALUES('group_a',$1,$2,'synthetic_recovery_event')",[id,hash]);
  await admin.query("INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at) VALUES($1,'user_1','group_a',now(),now()+interval '10 minutes')",[crypto.createHash('sha256').update(token).digest('hex')]);
  const app=createIsolatedTeamPrototype({authPool,ledgerPool,syntheticOnly:true,syntheticRecoveryInspectEnabled:true});
  server=app.server;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const origin='http://127.0.0.1:'+server.address().port;
  const intent={id,status:'QUARANTINED',auto_retry:false,original_status:'PENDING',base_revision:0,scope,payload};
  async function inspect(item){const r=await fetch(origin+'/v1/recovery/receipts/inspect',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({explicit_consent:true,quarantined:[item]})});return {status:r.status,body:await r.json()};}
  const matched=await inspect(intent);assert.equal(matched.status,200);assert.equal(matched.body.items[0].classification,'MATCHED_SERVER_RECEIPT');assert.equal(matched.body.items[0].auto_retry,false);
  // Security negative tests on the SAME real PostgreSQL + two LOGIN HTTP path:
  // the server must reject a different workspace and altered receipt digest.
  const crossTenant=await inspect({...intent,scope:{...scope,workspace_id:'group_b'}});
  assert.equal(crossTenant.status,422);
  assert.equal(crossTenant.body.error,'TEAM_RECOVERY_QUARANTINE_REQUIRED');
  const tampered=await inspect({...intent,payload:{synthetic:true,tampered:true}});
  assert.equal(tampered.status,503);
  assert.equal(tampered.body.error,'TEAM_RECOVERY_RECEIPT_UNVERIFIED');
  for(const response of [matched,crossTenant,tampered]){
    const reply=JSON.stringify(response.body);
    for(const sensitive of [token,hash,scope.partner_id,'session_hash','request_sha256',
      'payload_sha256','actor_user_id','feed_seq','synthetic_recovery_event'])
      assert.equal(reply.includes(sensitive),false,'HTTP_PRIVATE_FIELD_LEAK');
  }
  const missing=await inspect({...intent,id:'draft_'+crypto.randomBytes(16).toString('hex')});assert.equal(missing.status,200);assert.equal(missing.body.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');assert.equal(missing.body.auto_send_enabled,false);
  await app.auth.revokeSession(token);const revoked=await inspect(intent);assert.equal(revoked.status,401);
  await assert.rejects(app.ledgerRepository.appendDraft(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  const counts=await admin.query("SELECT (SELECT count(*) FROM kts_team.scope_events WHERE event_id='synthetic_recovery_event')::int AS events,(SELECT count(*) FROM kts_team.idempotency_receipts WHERE idempotency_key=$1)::int AS receipts",[id]);
  assert.deepEqual(counts.rows[0],{events:1,receipts:1});
  // Deliberate defense-in-depth threat-model probe: this same independent
  // ledger LOGIN has table SELECT rights and can set the untrusted custom GUC.
  // It does not authorize or change production, and must not print row values.
  const tenantGuc=await observeSyntheticTenantGucExposure({pool:ledgerPool,syntheticOnly:true});
  assert.equal(tenantGuc.status,'SYNTHETIC_CALLER_WRITABLE_GUC_EXPOSURE_OBSERVED');
  assert.equal(tenantGuc.production_qualified,false);
  process.stdout.write('SYNTHETIC_CALLER_WRITABLE_GUC_EXPOSURE_OBSERVED operational_authority=BLOCKED direct_db_role_trust=NOT_VERIFIED\n');
  process.stdout.write('SYNTHETIC_TWO_LOGIN_HTTP_PG_RECOVERY_PASS matched=1 unknown=1 revoked=1 cross_tenant_denied=1 tampered_receipt_denied=1 private_reply_redacted=1 auto_retry=false events=1 receipts=1 write_block=ENABLED\n');
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  if(authPool)await authPool.end();if(ledgerPool)await ledgerPool.end();await admin.end();
 }
}
if(require.main===module)main().catch(e=>{process.stderr.write('RECOVERY_PROBE_FAILED '+String(e.code||e.message).replace(/[^A-Za-z0-9_]/g,'').slice(0,100)+'\n');process.exitCode=1});
