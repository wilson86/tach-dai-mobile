'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');

const sql=readFileSync(resolve(__dirname,'../team-settlement/migrations/001_team_ledger.sql'),'utf8');
const adr=readFileSync(resolve(__dirname,'../docs/settlement-team/ARCHITECTURE_30_USERS.md'),'utf8');
const model=readFileSync(resolve(__dirname,'../docs/settlement-team/THREAT_MODEL.md'),'utf8');
const api=readFileSync(resolve(__dirname,'../docs/settlement-team/API_CONTRACT.md'),'utf8');

test('team database is separate and migration explicitly not deployed',()=>{
  assert(sql.includes('CREATE SCHEMA IF NOT EXISTS kts_team'));
  assert(sql.includes('BEGIN;')&&sql.includes('COMMIT;'));
  assert(!sql.includes('kts_router.sqlite3'));
  assert(adr.includes('Not approved for live finance'));
  assert(adr.includes('not run')||adr.includes('not deployed'));
});
test('tenant-scoped composite keys and server-isolated membership',()=>{
  for(const entity of ['workspaces','identities','memberships','counterparties','scopes','scope_events','idempotency_receipts'])
    assert(sql.includes('CREATE TABLE IF NOT EXISTS kts_team.'+entity),entity);
  for(const entity of ['workspaces','memberships','counterparties','scopes','scope_events','idempotency_receipts']){
    assert(sql.includes('ALTER TABLE kts_team.'+entity+' ENABLE ROW LEVEL SECURITY'),entity);
    assert(sql.includes('ALTER TABLE kts_team.'+entity+' FORCE ROW LEVEL SECURITY'),entity);
  }
  assert(sql.includes("workspace_id = current_setting('kts.workspace_id', true)"));
  assert(sql.includes('PRIMARY KEY (workspace_id,partner_id,business_date,region)'));
  assert(sql.includes('UNIQUE (workspace_id,partner_id,business_date,region,scope_revision)'));
  assert(sql.includes('PRIMARY KEY (workspace_id,idempotency_key)'));
});
test('append-only protections and strict role contracts are present',()=>{
  assert(sql.includes('TEAM_AUDIT_APPEND_ONLY'));
  assert(sql.includes('BEFORE UPDATE OR DELETE ON kts_team.scope_events'));
  assert(sql.includes('BEFORE UPDATE OR DELETE ON kts_team.idempotency_receipts'));
  assert(sql.includes("team_role IN ('admin','operator','reviewer','viewer')"));
  assert(sql.includes("partner_kind IN ('customer','owner')"));
  assert(!sql.includes('PASSWORD =') && !sql.includes('KTS_ROUTER'));
  const draftMigration=readFileSync(resolve(__dirname,'../team-settlement/migrations/002_draft_transaction.sql'),'utf8');
  assert(draftMigration.includes('REVOKE ALL ON FUNCTION kts_team.append_draft'));
  assert(draftMigration.includes('FROM PUBLIC;'));
  assert(draftMigration.includes('AND i.disabled_at IS NULL'));
  assert(draftMigration.includes('AND m.revoked_at IS NULL'));
  assert(draftMigration.includes('TEAM_REVISION_CONFLICT'));
  assert(draftMigration.includes('TEAM_IDEMPOTENCY_CONFLICT'));
  assert(model.includes('Thirty-client')||model.includes('Thirty-client test'));
});
test('approval and offline reject are called out in API',()=>{
  assert(api.includes('Idempotency-Key'));
  assert(api.includes('TEAM_REVISION_CONFLICT'));
  assert(api.includes('server session'));
  assert(adr.includes('KQXS'));
  assert(adr.includes('ROLLBACK'));
  assert(model.includes('30 authenticated identities'));
});
