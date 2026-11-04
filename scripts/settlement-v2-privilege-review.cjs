'use strict';
// Static blocker detector. This file neither connects to PostgreSQL nor
// qualifies a V2 verifier, and must never be used as release approval.
const fs = require('node:fs');
const path = require('node:path');
function evaluateCandidate(sql, decision) {
  if (typeof sql !== 'string' || typeof decision !== 'string' ||
      sql.length < 100 || decision.length < 100)
    throw Error('SETTLEMENT_V2_REVIEW_INPUT_INVALID');
  const sessionLock = /FROM\s+kts_auth\.sessions[\s\S]{0,350}?FOR SHARE\s*;/i.test(sql);
  const membershipLock = /FROM\s+kts_team\.memberships[\s\S]{0,450}?FOR SHARE OF m,i\s*;/i.test(sql);
  const selectOnly = /has only necessary schema USAGE, column SELECT and audited/i.test(decision);
  const issues = [];
  if (sessionLock && membershipLock && selectOnly) {
    issues.push('FOR_SHARE_REQUIRES_UPDATE_PRIVILEGE_ON_LOCKED_TABLES');
    issues.push('DECLARED_SELECT_ONLY_OWNER_CONFLICTS_WITH_ROW_LOCKS');
  }
  if (!/receipt_v2_verifier_keys/.test(sql) ||
      !/SQL verifier.*NOT_RUN|NOT_EXECUTED|NOT_RUN/.test(decision))
    issues.push('CUSTODY_OR_DB_QUALIFICATION_EVIDENCE_MISSING');
  // A zero-issue static scan is STILL not approval to apply DDL or enable writes.
  return Object.freeze({verdict:'BLOCKED_REVIEW_REQUIRED',
    session_lock_detected:sessionLock,membership_lock_detected:membershipLock,
    declaration_select_only:selectOnly,issues:Object.freeze(issues),
    postgres_executed:false,tenant_isolation_approved:false,
    independent_review_approved:false,production_ready:false});
}
function auditCheckout(root) {
  const sql = fs.readFileSync(path.join(root,'team-settlement/candidate/session-bound-receipt-read-v2.sql'),'utf8');
  const decision = fs.readFileSync(path.join(root,'docs/settlement-team/RECEIPT_V2_KEY_OWNER_REVOCATION_SECURITY_DECISION_20261104.md'),'utf8');
  return evaluateCandidate(sql,decision);
}
if (require.main === module) {
  try {
    const result = auditCheckout(path.join(__dirname,'..'));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(err) {
    process.stderr.write('SETTLEMENT_V2_REVIEW_UNQUALIFIED: '+err.message+'\n');
  }
  // Always deny even if upstream source shape changes (fail closed).
  process.exitCode = 2;
}
module.exports = Object.freeze({evaluateCandidate,auditCheckout});
