'use strict';

// Transactional application seam for a private synthetic bootstrap plan.
// It never creates a pool, opens a database, writes a file, logs a verifier,
// or accepts plaintext credentials. The caller must inject a reviewed,
// disposable bootstrap transaction adapter.
const {buildSyntheticBootstrapPlan,summarizeSyntheticBootstrap}=require('./synthetic-bootstrap-plan.cjs');
function fail(code){throw Error(code);}
function rows(result){if(!result||!Array.isArray(result.rows))fail('TEAM_BOOTSTRAP_DB_RESULT_INVALID');return result.rows;}
function receipt(result,fields,code){
  const resultRows=rows(result);
  if(resultRows.length!==1||fields.some(([key,value])=>resultRows[0]?.[key]!==value))fail(code);
}
function createSyntheticBootstrapExecutor({db}={}){
  if(!db||typeof db.transaction!=='function')fail('TEAM_BOOTSTRAP_DB_REQUIRED');
  async function apply(plan){
    const checked=buildSyntheticBootstrapPlan(plan);
    return db.transaction(async tx=>{
      if(!tx||typeof tx.query!=='function')fail('TEAM_BOOTSTRAP_DB_TRANSACTION_INVALID');
      for(const workspace of checked.workspaces){
        const result=await tx.query(
          'INSERT INTO kts_team.workspaces(workspace_id,display_name) VALUES($1,$2) RETURNING workspace_id',
          [workspace.workspace_id,workspace.display_name]);
        receipt(result,[['workspace_id',workspace.workspace_id]],'TEAM_BOOTSTRAP_WORKSPACE_RECEIPT_INVALID');
      }
      for(const identity of checked.identities){
        const result=await tx.query(
          'INSERT INTO kts_team.identities(user_id,auth_subject) VALUES($1,$2) RETURNING user_id',
          [identity.user_id,identity.auth_subject]);
        receipt(result,[['user_id',identity.user_id]],'TEAM_BOOTSTRAP_IDENTITY_RECEIPT_INVALID');
      }
      for(const identity of checked.identities){
        const result=await tx.query(
          'INSERT INTO kts_auth.credentials(user_id,password_hash) VALUES($1,$2) RETURNING user_id',
          [identity.user_id,identity.password_hash]);
        receipt(result,[['user_id',identity.user_id]],'TEAM_BOOTSTRAP_CREDENTIAL_RECEIPT_INVALID');
      }
      for(const membership of checked.memberships){
        const result=await tx.query(
          'INSERT INTO kts_team.memberships(workspace_id,user_id,team_role) VALUES($1,$2,$3) RETURNING workspace_id,user_id,team_role',
          [membership.workspace_id,membership.user_id,membership.role]);
        receipt(result,[['workspace_id',membership.workspace_id],['user_id',membership.user_id],['team_role',membership.role]],
          'TEAM_BOOTSTRAP_MEMBERSHIP_RECEIPT_INVALID');
      }
      for(const counterparty of checked.counterparties){
        const result=await tx.query(
          'INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name) VALUES($1,$2,$3,$4) RETURNING workspace_id,partner_id,partner_kind',
          [counterparty.workspace_id,counterparty.partner_id,counterparty.partner_kind,counterparty.display_name]);
        receipt(result,[['workspace_id',counterparty.workspace_id],['partner_id',counterparty.partner_id],['partner_kind',counterparty.partner_kind]],
          'TEAM_BOOTSTRAP_COUNTERPARTY_RECEIPT_INVALID');
      }
      // Return only the redacted aggregate, never subjects or password verifiers.
      return summarizeSyntheticBootstrap(checked);
    });
  }
  return Object.freeze({apply});
}
module.exports=Object.freeze({createSyntheticBootstrapExecutor});
