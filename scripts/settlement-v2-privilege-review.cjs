'use strict';
// Static blocker detector. This file neither connects to PostgreSQL nor
// qualifies a V2 verifier, and must never be used as release approval.
const fs = require('node:fs');
const path = require('node:path');
function evaluateCandidate(sql, decision) {
  if (typeof sql !== 'string' || typeof decision !== 'string' ||
      sql.length < 100 || decision.length < 100)
    throw Error('SETTLEMENT_V2_REVIEW_INPUT_INVALID');
  // PostgreSQL 16 SELECT docs: ALL four row-lock modes require UPDATE
  // privilege on at least one column of each locked table (plus SELECT).
  // Parse within a single SQL statement to avoid conflating unrelated locks.
  const rowLockPattern = /\bFOR\s+(NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)(?:\s+OF\s+[A-Za-z_][A-Za-z_0-9]*(?:\s*,\s*[A-Za-z_][A-Za-z_0-9]*)*)?\s*$/i;
  function lockMode(table) {
    const fromTable = new RegExp('\\bFROM\\s+' + table.replaceAll('.', '\\.') + '\\b', 'i');
    for (const statement of sql.split(';')) {
      if (!fromTable.test(statement)) continue;
      const found = rowLockPattern.exec(statement.trim());
      if (found) return found[1].replace(/\s+/g, ' ').toUpperCase();
    }
    return null;
  }
  const sessionLockMode = lockMode('kts_auth.sessions');
  const membershipLockMode = lockMode('kts_team.memberships');
  const sessionLock = sessionLockMode !== null;
  const membershipLock = membershipLockMode !== null;
  const selectOnly = /has only necessary schema USAGE, column SELECT and audited/i.test(decision);
  const issues = [];
  if (selectOnly && (sessionLock || membershipLock)) {
    issues.push('ANY_ROW_LOCK_MODE_REQUIRES_UPDATE_PRIVILEGE');
    if (sessionLockMode === 'SHARE' || membershipLockMode === 'SHARE')
      issues.push('FOR_SHARE_REQUIRES_UPDATE_PRIVILEGE_ON_LOCKED_TABLES');
    issues.push('DECLARED_SELECT_ONLY_OWNER_CONFLICTS_WITH_ROW_LOCKS');
  }
  if (!sessionLock || !membershipLock)
    issues.push('STRICT_REVOCATION_ROW_LOCKS_NOT_PROVEN');
  if (!/receipt_v2_verifier_keys/.test(sql) ||
      !/SQL verifier.*NOT_RUN|NOT_EXECUTED|NOT_RUN/.test(decision))
    issues.push('CUSTODY_OR_DB_QUALIFICATION_EVIDENCE_MISSING');
  // A zero-issue static scan is STILL not approval to apply DDL or enable writes.
  return Object.freeze({verdict:'BLOCKED_REVIEW_REQUIRED',
    session_lock_detected:sessionLock,membership_lock_detected:membershipLock,
    session_lock_mode:sessionLockMode,membership_lock_mode:membershipLockMode,
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
