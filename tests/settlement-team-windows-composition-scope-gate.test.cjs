'use strict';
// Executes the actual Windows checkout's composition and role probe against
// mock pool connections. It does not open a socket or connect to PostgreSQL.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='C:\\KTS-Settlement\\android-pilot-stage-a-52f860a\\tach-dai-mobile-b2-group-app';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
assert.equal(hash(path.join(root,'team-settlement','role-probe.cjs')),'E49A7EA006487DBBE46F1F55E9B52A0C8566C8B6584E447B83197115C1C4DE6D');
assert.equal(hash(path.join(root,'team-settlement','team-composition.cjs')),'A7955AD7450B657B2D50CF06AF45F27DC015AD0F9AD6017B965095DDE2915A55');
const {createIsolatedTeamPrototype}=require(path.join(root,'team-settlement','team-composition.cjs'));
const auth={role:'synthetic_auth',auth_schema:true,event_read:false,credential_read:true,session_read:true,session_insert:true,session_revoke:true,team_schema:true,membership_read:true,membership_write_denied:true,financial_write_denied:true,direct_scope_write_denied:true,draft_execute:false,superuser:false,bypass_rls:false,role_memberships_present:false};
const ledger={role:'synthetic_ledger',auth_schema:false,event_read:true,draft_execute:true,membership_write_denied:true,direct_scope_write_denied:true,superuser:false,bypass_rls:false,role_memberships_present:false};
function pool(row){const releases=[];return {releases,pool:{connect:async()=>({query:async sql=>{assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'UPDATE'\)/);assert.match(sql,/has_any_column_privilege\(current_user, 'kts_team\.scopes', 'INSERT'\)/);assert.match(sql,/has_table_privilege\(current_user, 'kts_team\.scopes', 'TRUNCATE'\)/);return {rows:[row]};},release:destroy=>releases.push(destroy)})}};}
for(const allowed of [true,false])test(`Windows composition ${allowed?'accepts denied writes':'rejects ledger scope grant'}`,async()=>{
  const a=pool(auth),l=pool({...ledger,direct_scope_write_denied:allowed});
  const app=createIsolatedTeamPrototype({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true});assert.equal(app.server.listening,false);
  if(allowed){const result=await app.verifyPools();assert.equal(result.qualified,true);assert.deepEqual(l.releases,[false]);}
  else{await assert.rejects(app.verifyPools(),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);assert.deepEqual(a.releases,[true]);assert.deepEqual(l.releases,[true]);}
});
for(const role of ['auth','ledger'])for(const evidence of [false,null,'missing'])test(`Windows composition rejects ${role} scope evidence ${evidence}`,async()=>{
  const aRow={...auth},lRow={...ledger},target=role==='auth'?aRow:lRow;
  if(evidence==='missing')delete target.direct_scope_write_denied;else target.direct_scope_write_denied=evidence;
  const a=pool(aRow),l=pool(lRow);const app=createIsolatedTeamPrototype({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true});
  await assert.rejects(app.verifyPools(),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);
  assert.equal(app.server.listening,false);assert.deepEqual(a.releases,[true]);assert.deepEqual(l.releases,[true]);
});
for(const role of ['auth','ledger'])for(const value of [true,null,'missing'])test(`Windows composition rejects ${role} unaudited membership ${value}`,async()=>{
  const aRow={...auth},lRow={...ledger},target=role==='auth'?aRow:lRow;
  if(value==='missing')delete target.role_memberships_present;else target.role_memberships_present=value;
  const a=pool(aRow),l=pool(lRow);const app=createIsolatedTeamPrototype({authPool:a.pool,ledgerPool:l.pool,syntheticOnly:true});
  await assert.rejects(app.verifyPools(),/TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED/);assert.equal(app.server.listening,false);assert.deepEqual(a.releases,[true]);assert.deepEqual(l.releases,[true]);
});
