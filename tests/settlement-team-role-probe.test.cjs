'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {qualifyIsolatedPoolRoles}=require('../team-settlement/role-probe.cjs');

const auth={database_name:'synthetic_db',database_oid:'16384',server_address:'127.0.0.1/32',server_port:55434,postmaster_started:'1700000000.123456',server_in_recovery:false,
  role:'synthetic_auth',session_role:'synthetic_auth',auth_schema:true,event_read:false,
  credential_read:true,session_read:true,session_insert:true,session_revoke:true,
  team_schema:true,membership_read:true,membership_write_denied:true,
  financial_write_denied:true,direct_scope_write_denied:true,direct_audit_write_denied:true,direct_workspace_write_denied:true,
  draft_execute:false,review_function_present:true,review_execute:false,superuser:false,bypass_rls:false,role_memberships_present:false};
const ledger={database_name:'synthetic_db',database_oid:'16384',server_address:'127.0.0.1/32',server_port:55434,postmaster_started:'1700000000.123456',server_in_recovery:false,
  role:'synthetic_ledger',session_role:'synthetic_ledger',auth_schema:false,team_schema:true,event_read:true,
  draft_execute:true,review_function_present:true,review_execute:true,membership_write_denied:true,direct_scope_write_denied:true,direct_audit_write_denied:true,direct_workspace_write_denied:true,superuser:false,bypass_rls:false,role_memberships_present:false};
for(const name of ['atomic_review','atomic_review_lookup','atomic_draft','atomic_draft_lookup']){
  auth[`${name}_present`]=false;auth[`${name}_execute`]=false;
  ledger[`${name}_present`]=false;ledger[`${name}_execute`]=false;
}
function pool(info,{failConnect=false,failQuery=false}={}){
  const calls={connect:0,query:0,releases:[]};
  const instance={
    async query(sql){
      calls.query++;
      assert.match(sql,/current_user/);
      assert.match(sql,/pg_roles/);
      assert.match(sql,/to_regprocedure\('kts_team\.advance_review\(text,text,date,text,text,bigint,text,text,text\)'\)/);
      assert.match(sql,/AS review_execute/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'UPDATE'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'INSERT'\)/);
      assert.match(sql,/has_table_privilege\(current_user, 'kts_team\.scopes', 'TRUNCATE'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.memberships', 'INSERT'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.memberships', 'UPDATE'\)/);
      assert.match(sql,/has_table_privilege\(current_user, 'kts_team\.memberships', 'TRUNCATE'\)/);
      for(const name of ['atomic_review_v1','atomic_review_reconcile_v1','atomic_draft_v1','atomic_draft_reconcile_v1'])
        assert.ok(sql.includes(`to_regprocedure('kts_team.${name}(`),`missing ${name} probe`);
      for(const table of ['scope_events','idempotency_receipts','workspaces']){
        for(const privilege of ['INSERT','UPDATE'])assert.ok(sql.includes(`has_any_column_privilege(current_user, 'kts_team.${table}', '${privilege}')`));
        for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.ok(sql.includes(`has_table_privilege(current_user, 'kts_team.${table}', '${privilege}')`));
      }
      if(failQuery)throw Error('SYNTHETIC_DB_DOWN');
      return {rows:[info]};
    },
    release(destroy){calls.releases.push(destroy);}
  };
  return {pool:{async connect(){
    calls.connect++;
    if(failConnect)throw Error('SYNTHETIC_CONNECT_DOWN');
    return instance;
  }},calls};
}

test('explicit read-only pool role proof is not run when Team candidate is composed',async()=>{
  const a=pool(auth),l=pool(ledger);
  const app=createIsolatedTeamPrototype({
    authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
  });
  assert.deepEqual([a.calls.connect,l.calls.connect],[0,0]);
  assert.equal(app.server.listening,false);
  await assert.rejects(app.verifyPools(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  assert.deepEqual([a.calls.query,l.calls.query],[1,1]);
  assert.deepEqual(a.calls.releases,[false]);
  assert.deepEqual(l.calls.releases,[false]);
});

test('role probe rejects mismatched or unverifiable database endpoints',async()=>{
  const mutations=[
    {database_name:'other_db'},{database_oid:'16385'},
    {server_address:'127.0.0.2/32'},{server_port:55435},
    {postmaster_started:'1700000001.123456'},{server_in_recovery:true},
    {database_name:null},{database_oid:null},{server_address:null},
    {server_port:null},{postmaster_started:null},{server_in_recovery:null}
  ];
  for(const mutation of mutations){
    const a=pool(auth),l=pool({...ledger,...mutation});
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
  }
});

test('role probe rejects direct audit or workspace write grants and missing evidence',async()=>{
  for(const role of ['auth','ledger'])for(const field of ['direct_audit_write_denied','direct_workspace_write_denied'])
    for(const value of [false,null,undefined]){
      const a=pool(role==='auth'?{...auth,[field]:value}:auth);
      const l=pool(role==='ledger'?{...ledger,[field]:value}:ledger);
      await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
      assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
    }
});

test('atomic privilege inspection denies raw functions and never claims qualification',async()=>{
  const names=['atomic_review','atomic_review_lookup','atomic_draft','atomic_draft_lookup'];
  const baseAuth={...auth},baseLedger={...ledger,draft_execute:false,review_execute:false};
  for(const name of names){baseAuth[`${name}_present`]=true;baseAuth[`${name}_execute`]=false;
    baseLedger[`${name}_present`]=true;baseLedger[`${name}_execute`]=true;}
  let a=pool(baseAuth),l=pool(baseLedger);
  const observed=await qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,inspectAtomicCandidate:true});
  assert.equal(observed.qualified,false);assert.equal(observed.atomic_permissions_match,true);
  assert.equal(observed.reason,'TEAM_ATOMIC_FUNCTION_IDENTITY_UNVERIFIED');
  assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
  for(const bad of [{...baseLedger,draft_execute:true},{...baseLedger,review_execute:true},
    {...baseLedger,review_function_present:false},...names.map(name=>({...baseLedger,[`${name}_execute`]:false})),
    ...names.map(name=>({...baseLedger,[`${name}_present`]:false}))]){
    a=pool(baseAuth);l=pool(bad);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,inspectAtomicCandidate:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
  }
  for(const name of names){
    a=pool({...baseAuth,[`${name}_execute`]:true});l=pool(baseLedger);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,inspectAtomicCandidate:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    a=pool({...baseAuth,[`${name}_present`]:null});l=pool(baseLedger);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,inspectAtomicCandidate:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
  }
});

test('legacy probe denies exposed atomic functions and missing catalog evidence',async()=>{
  for(const name of ['atomic_review','atomic_review_lookup','atomic_draft','atomic_draft_lookup']){
    for(const role of ['auth','ledger']){
      const aRow={...auth,[`${name}_present`]:true},lRow={...ledger,[`${name}_present`]:true};
      (role==='auth'?aRow:lRow)[`${name}_execute`]=true;
      await assert.rejects(qualifyIsolatedPoolRoles({authPool:pool(aRow).pool,ledgerPool:pool(lRow).pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    }
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:pool({...auth,[`${name}_present`]:undefined}).pool,ledgerPool:pool(ledger).pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
  }
});

test('same role, overprivileged role, and cross-domain role privileges are denied',async()=>{
  for(const bad of [
    {...ledger,role:auth.role},
    {...ledger,session_role:'privileged_login'},
    {...ledger,session_role:null},
    {...ledger,auth_schema:true},
    {...ledger,team_schema:false},
    {...ledger,superuser:true},
    {...ledger,bypass_rls:true},
    {...ledger,role_memberships_present:true},
    {...ledger,role_memberships_present:null},
    {...ledger,event_read:false},
    {...ledger,draft_execute:false},
    {...ledger,membership_write_denied:false},
    {...ledger,direct_scope_write_denied:false},
    {...ledger,direct_scope_write_denied:null}
  ]){
    const a=pool(auth),l=pool(bad);
    await assert.rejects(qualifyIsolatedPoolRoles({
      authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
    }),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);
    assert.deepEqual(l.calls.releases,[true]);
  }
});

test('auth role cannot read ledger events, execute drafts, or bypass RLS',async()=>{
  for(const bad of [
    {...auth,auth_schema:false},
    {...auth,session_role:'privileged_login'},
    {...auth,session_role:null},
    {...auth,event_read:true},
    {...auth,draft_execute:true},
    {...auth,membership_write_denied:false},
    {...auth,financial_write_denied:false},
    {...auth,direct_scope_write_denied:false},
    {...auth,direct_scope_write_denied:null},
    {...auth,bypass_rls:true},
    {...auth,role_memberships_present:true},
    {...auth,role_memberships_present:null},
    {...auth,superuser:true}
  ]){
    const a=pool(bad),l=pool(ledger);
    await assert.rejects(qualifyIsolatedPoolRoles({
      authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
    }),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);
    assert.deepEqual(l.calls.releases,[true]);
  }
});

test('missing direct-scope privilege evidence rejects each role and destroys both clients',async()=>{
  for(const missing of ['auth','ledger']){
    const aRow={...auth},lRow={...ledger};delete (missing==='auth'?aRow:lRow).direct_scope_write_denied;
    const a=pool(aRow),l=pool(lRow);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
  }
});

test('missing session login identity fails closed for either pool',async()=>{
  for(const missing of ['auth','ledger']){
    const aRow={...auth},lRow={...ledger};delete (missing==='auth'?aRow:lRow).session_role;
    const a=pool(aRow),l=pool(lRow);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
  }
});

test('review execution requires an available function and ledger privilege, but never auth privilege',async()=>{
  for(const [aRow,lRow] of [[{...auth,review_execute:true},ledger],
    [auth,{...ledger,review_execute:false}],
    [{...auth,review_function_present:false},{...ledger,review_function_present:false,review_execute:false}],
    [auth,{...ledger,review_execute:null}]]){
    const a=pool(aRow),l=pool(lRow);
    await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,requireReview:true}),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);assert.deepEqual(l.calls.releases,[true]);
  }
  const a=pool(auth),l=pool(ledger);
  assert.equal((await qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true,requireReview:true})).qualified,true);
  const disabledAuth=pool({...auth,review_function_present:false}),disabledLedger=pool({...ledger,review_function_present:false,review_execute:false});
  assert.equal((await qualifyIsolatedPoolRoles({authPool:disabledAuth.pool,ledgerPool:disabledLedger.pool,syntheticOnly:true})).qualified,true);
  const composedAuth=pool(auth),composedLedger=pool({...ledger,review_execute:false});
  const app=createIsolatedTeamPrototype({authPool:composedAuth.pool,ledgerPool:composedLedger.pool,syntheticOnly:true,syntheticReviewEnabled:true});
  await assert.rejects(app.verifyPools(),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
});

test('both pools and a synthetic qualification flag are required',async()=>{
  const a=pool(auth),l=pool(ledger);
  await assert.rejects(qualifyIsolatedPoolRoles({authPool:a.pool,ledgerPool:l.pool}),
    /TEAM_RELEASE_NOT_AUTHORIZED/);
  await assert.rejects(qualifyIsolatedPoolRoles({
    authPool:a.pool,ledgerPool:a.pool,syntheticOnly:true
  }),/TEAM_DB_ROLES_NOT_ISOLATED/);
  assert.equal(a.calls.connect,0);
});

test('a failed second connect destroys the already acquired auth client',async()=>{
  const a=pool(auth),l=pool(ledger,{failConnect:true});
  await assert.rejects(qualifyIsolatedPoolRoles({
    authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
  }),/SYNTHETIC_CONNECT_DOWN/);
  assert.deepEqual(a.calls.releases,[true]);
});

test('failed verification query destroys both clients without promoting role proof',async()=>{
  const a=pool(auth),l=pool(ledger,{failQuery:true});
  await assert.rejects(qualifyIsolatedPoolRoles({
    authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
  }),/SYNTHETIC_DB_DOWN/);
  assert.deepEqual(a.calls.releases,[true]);
  assert.deepEqual(l.calls.releases,[true]);
});

test('auth must have session and tenant-scoped membership privileges to qualify',async()=>{
  for(const absent of ['credential_read','session_read','session_insert','session_revoke',
    'team_schema','membership_read','membership_write_denied','financial_write_denied']){
    const a=pool({...auth,[absent]:false}),l=pool(ledger);
    await assert.rejects(qualifyIsolatedPoolRoles({
      authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true
    }),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
    assert.deepEqual(a.calls.releases,[true]);
    assert.deepEqual(l.calls.releases,[true]);
  }
});
