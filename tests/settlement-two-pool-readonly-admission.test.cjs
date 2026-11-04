'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../team-settlement/two-pool-readonly-admission.cjs');
const roles=['synthetic_auth_login','synthetic_ledger_login'];
function row(role,kind){
 return {role,session_role:role,database_name:'postgres',server_address:'127.0.0.1',
  server_port:4932,postmaster_started:'2026-11-04 00:00:00+00',
  superuser:false,bypass_rls:false,has_role_memberships:false,
  default_acl_entries:0,create_auth_schema:false,create_team_schema:false,create_crypto_schema:false,
  raw_append_execute:false,raw_review_execute:false,any_financial_mutation:false,
  read_credentials:kind==='auth',read_sessions:kind==='auth',read_memberships:true,
  read_credentials_any_column:kind==='auth',read_sessions_any_column:kind==='auth',
  any_auth_mutation:kind==='auth',
  read_identity_user_id:true,read_identity_disabled_at:true,
  read_identity_auth_subject:kind==='auth',read_scope_events:kind==='ledger',
  read_receipts:kind==='ledger',read_scope_events_any_column:kind==='ledger',
  read_receipts_any_column:kind==='ledger',auth_read_workspaces:false,
  auth_read_counterparties:false,auth_read_scopes:false,insert_receipts:false,update_receipts:false,
  update_receipts_any_column:false,insert_scope_events:false,insert_scopes:false,
  update_scopes:false,update_scopes_any_column:false,update_memberships:false,
  insert_workspaces:false,insert_sessions:kind==='auth',insert_sessions_any_column:kind==='auth',revoke_sessions:kind==='auth',
  parameter_error_limit:'0',statement_log_mode:'none',error_statement_log_mode:'error'};
}
const fresh=()=>[row(roles[0],'auth'),row(roles[1],'ledger')];
function pools(ra,rl,events){
 const make=(name,r)=>({async connect(){events.push(name+':connect');
   return {async query(sql){
    events.push(name+':'+String(sql).slice(0,25));
    if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {command:sql,rows:[]};
    if(sql==='SET TRANSACTION READ ONLY')return {rows:[],command:'SET'};
    if(sql===A.AUDIT_SQL)return {rows:[r],command:'SELECT'};
    throw Error('UNEXPECTED_QUERY');
   },release(discard){events.push(name+':release:'+Boolean(discard))}};
  }});
 return [make('auth',ra),make('ledger',rl)];
}
test('two independent read-only pool probes produce evidence, NEVER release approval',async()=>{
 const [auth,ledger]=fresh(),events=[];
 const [authPool,ledgerPool]=pools(auth,ledger,events);
 const result=await A.inspectProposedPools({authPool,ledgerPool,
  authRole:roles[0],ledgerRole:roles[1],syntheticOnly:true});
 assert.equal(result.status,'SYNTHETIC_TWO_POOL_READ_ONLY_PROJECTION_PASS');
 assert.equal(result.production_qualified,false);
 assert.equal(result.write_block,'ENABLED');
 assert.equal(result.operational_pool_config,'NOT_VERIFIED');
 assert.equal(result.independent_security_signoff,'NOT_RUN');
 assert.equal(events.filter(x=>x.endsWith('SET TRANSACTION READ ONLY')).length,2);
 assert.equal(events.filter(x=>x.endsWith('COMMIT')).length,2);
 assert.ok(!events.some(x=>/(INSERT|DELETE|UPDATE|GRANT)/.test(x)));
});
test('reject bypassRLS, inherited membership and every direct money grant',()=>{
 const blockers=['superuser','bypass_rls','has_role_memberships','create_auth_schema',
   'create_team_schema','create_crypto_schema','raw_append_execute','raw_review_execute','any_financial_mutation','insert_receipts','update_receipts',
   'update_receipts_any_column','insert_scope_events','insert_scopes',
   'update_scopes','update_scopes_any_column','update_memberships','insert_workspaces'];
 for(const side of [0,1])for(const flag of blockers){
   const rs=fresh();rs[side][flag]=true;
   assert.throws(()=>A.assess(...rs,...roles),/TEAM_TWO_POOL_(?:ROLE_PRIVILEGED|DIRECT_MUTATION)/);
 }
});
test('audit projects all table and column mutation classes for each financial table',()=>{
 assert.ok(A.AUDIT_SQL.includes('host(inet_server_addr()) AS server_address'));
 for(const name of ['workspaces','memberships','counterparties','scopes','scope_events','idempotency_receipts','identities']){
  for(const verb of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
   assert.ok(A.AUDIT_SQL.includes(`has_table_privilege(current_user,'kts_team.${name}','${verb}')`));
  for(const verb of ['INSERT','UPDATE','REFERENCES'])
   assert.ok(A.AUDIT_SQL.includes(`has_any_column_privilege(current_user,'kts_team.${name}','${verb}')`));
 }
});
test('reject same pool, leaked auth credentials and unsafe log settings',async()=>{
 const [a,b]=fresh();
 assert.throws(()=>A.assess(a,{...b,read_credentials:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_credentials_any_column:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_sessions_any_column:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,server_port:5400},...roles),/DIFFERENT_SERVER/);
 assert.throws(()=>A.assess(a,{...b,default_acl_entries:2},...roles),/DEFAULT_ACL_REVIEW_REQUIRED/);
 assert.throws(()=>A.assess({...a,parameter_error_limit:'128'},b,...roles),/PG_LOGGING_SETTINGS_UNSAFE/);
 assert.throws(()=>A.assess({...a,role:'different_user'},b,...roles),/AUTHORITY_UNVERIFIED/);
 const [authPool]=pools(a,b,[]);
 await assert.rejects(A.inspectProposedPools({authPool,ledgerPool:authPool,
  authRole:roles[0],ledgerRole:roles[1],syntheticOnly:true}),/CONFIG_INVALID/);
 await assert.rejects(A.inspectProposedPools({authPool,ledgerPool:{connect(){}},
  authRole:roles[0],ledgerRole:roles[1],syntheticOnly:false}),/SYNTHETIC_ONLY/);
});
test('recovery access requires identities and ledger events without exposing events to auth',()=>{
 const [a,b]=fresh();
 assert.throws(()=>A.assess({...a,read_identity_auth_subject:false},b,...roles),/AUTH_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_identity_user_id:false},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_identity_disabled_at:false},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_identity_auth_subject:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,read_scope_events:false},...roles),/LEDGER_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess({...a,read_scope_events:true},b,...roles),/AUTH_MINIMUM_MISMATCH/);
 assert.throws(()=>A.assess(a,{...b,insert_sessions_any_column:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
});
test('Auth must not have even column-level receipt or event SELECT',()=>{
 const [auth,ledger]=fresh();
 for(const key of ['read_scope_events_any_column','read_receipts_any_column']){
  assert.throws(()=>A.assess({...auth,[key]:true},ledger,...roles),/AUTH_MINIMUM_MISMATCH/);
  const missing={...auth};delete missing[key];
  assert.throws(()=>A.assess(missing,ledger,...roles),/RESULT_MISSING/);
 }
 for(const table of ['scope_events','idempotency_receipts'])
  assert.ok(A.AUDIT_SQL.includes(`has_any_column_privilege(current_user,'kts_team.${table}','SELECT')`));
 assert.equal(A.assess(auth,ledger,...roles).production_qualified,false);
});
test('Auth denies table or column SELECT on workspaces, counterparties and scopes',()=>{
 const [auth,ledger]=fresh();
 for(const table of ['workspaces','counterparties','scopes']){
  const key=`auth_read_${table}`;
  assert.throws(()=>A.assess({...auth,[key]:true},ledger,...roles),/AUTH_MINIMUM_MISMATCH/);
  const missing={...auth};delete missing[key];
  assert.throws(()=>A.assess(missing,ledger,...roles),/RESULT_MISSING/);
  for(const fn of ['has_table_privilege','has_any_column_privilege'])
   assert.ok(A.AUDIT_SQL.includes(`${fn}(current_user,'kts_team.${table}','SELECT')`));
 }
 assert.equal(A.assess(auth,ledger,...roles).write_block,'ENABLED');
});
test('Ledger rejects any table or column mutation on Auth sessions and credentials',()=>{
 const [auth,ledger]=fresh();
 assert.throws(()=>A.assess(auth,{...ledger,any_auth_mutation:true},...roles),/LEDGER_MINIMUM_MISMATCH/);
 const missing={...ledger};delete missing.any_auth_mutation;
 assert.throws(()=>A.assess(auth,missing,...roles),/RESULT_MISSING/);
 for(const table of ['credentials','sessions']){
  for(const verb of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
   assert.ok(A.AUDIT_SQL.includes(`has_table_privilege(current_user,'kts_auth.${table}','${verb}')`));
  for(const verb of ['INSERT','UPDATE','REFERENCES'])
   assert.ok(A.AUDIT_SQL.includes(`has_any_column_privilege(current_user,'kts_auth.${table}','${verb}')`));
 }
 assert.equal(A.assess(auth,ledger,...roles).write_block,'ENABLED');
});
test('missing COMMIT command tag is fatal even for audit SELECT',async()=>{
 const [a,b]=fresh(),events=[];
 const [authPool,ledgerPool]=pools(a,b,events);
 const invalidPool={async connect(){
  const client=await authPool.connect();
  return {query(sql){return sql==='COMMIT'?Promise.resolve({rows:[]}):client.query(sql)},
   release(x){client.release(x)}};
 }};
 await assert.rejects(A.inspectProposedPools({authPool:invalidPool,ledgerPool,
  authRole:roles[0],ledgerRole:roles[1],syntheticOnly:true}),/TEAM_DB_COMMIT_NOT_COMMITTED/);
});
