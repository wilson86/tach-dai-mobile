'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {qualifyIsolatedPoolRoles}=require('../team-settlement/role-probe.cjs');

const auth={role:'synthetic_auth',auth_schema:true,event_read:false,
  credential_read:true,session_read:true,session_insert:true,session_revoke:true,
  team_schema:true,membership_read:true,membership_write_denied:true,
  financial_write_denied:true,direct_scope_write_denied:true,
  draft_execute:false,superuser:false,bypass_rls:false,role_memberships_present:false};
const ledger={role:'synthetic_ledger',auth_schema:false,event_read:true,
  draft_execute:true,membership_write_denied:true,direct_scope_write_denied:true,superuser:false,bypass_rls:false,role_memberships_present:false};
function pool(info,{failConnect=false,failQuery=false}={}){
  const calls={connect:0,query:0,releases:[]};
  const instance={
    async query(sql){
      calls.query++;
      assert.match(sql,/current_user/);
      assert.match(sql,/pg_roles/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'UPDATE'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'INSERT'\)/);
      assert.match(sql,/has_table_privilege\(current_user, 'kts_team\.scopes', 'TRUNCATE'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.memberships', 'INSERT'\)/);
      assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.memberships', 'UPDATE'\)/);
      assert.match(sql,/has_table_privilege\(current_user, 'kts_team\.memberships', 'TRUNCATE'\)/);
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
  const result=await app.verifyPools();
  assert.deepEqual(result,{qualified:true,auth_role:'synthetic_auth',ledger_role:'synthetic_ledger'});
  assert.deepEqual([a.calls.query,l.calls.query],[1,1]);
  assert.deepEqual(a.calls.releases,[false]);
  assert.deepEqual(l.calls.releases,[false]);
});

test('same role, overprivileged role, and cross-domain role privileges are denied',async()=>{
  for(const bad of [
    {...ledger,role:auth.role},
    {...ledger,auth_schema:true},
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
