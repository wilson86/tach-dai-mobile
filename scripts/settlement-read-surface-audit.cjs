'use strict';
// SOURCE DIAGNOSTIC ONLY. Detection is NOT security qualification.
// Never connect to PostgreSQL, change grants or treat a clean scan as isolation.
const fs = require('node:fs');
const path = require('node:path');
const FILES = Object.freeze([
  'team-settlement/postgres-ledger-repository.cjs',
  'team-settlement/postgres-auth-service.cjs'
]);
const TENANT_TABLES = new Set([
  'workspaces', 'memberships', 'identities', 'counterparties', 'scopes',
  'scope_events', 'idempotency_receipts', 'sessions', 'credentials'
]);
function scanSource(source, sourcePath) {
  if (typeof source !== 'string' || source.length < 10 ||
      typeof sourcePath !== 'string' || !FILES.includes(sourcePath))
    throw Error('TEAM_READ_SURFACE_SOURCE_INVALID');
  const lines = source.split(/\r?\n/);
  let method = 'MODULE_LEVEL';
  const observed = [];
  for (let i = 0; i < lines.length; i++) {
    const fn = lines[i].match(/^\s*async function ([a-zA-Z][a-zA-Z0-9_]*)\s*\(/);
    if (fn) method = fn[1];
    // A textual census, not a complete SQL parser or permission proof.
    const clause = /\b(?:FROM|JOIN)\s+(kts_team|kts_auth)\.([a-z_][a-z0-9_]*)\b/gi;
    for (const found of lines[i].matchAll(clause)) {
      if (!TENANT_TABLES.has(found[2]))
        throw Error('TEAM_READ_SURFACE_UNKNOWN_TABLE');
      observed.push(Object.freeze({source:sourcePath, method, line:i+1,
        table:found[1] + '.' + found[2]}));
    }
  }
  return Object.freeze(observed);
}
function evaluateSources(sources) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources) ||
      Object.keys(sources).length !== FILES.length ||
      FILES.some(p => !Object.hasOwn(sources, p)))
    throw Error('TEAM_READ_SURFACE_INPUT_INCOMPLETE');
  const records = FILES.flatMap(p => scanSource(sources[p], p));
  return Object.freeze({
    status: records.length ? 'BLOCKED_DIRECT_SQL_TENANT_READ' : 'REVIEW_REQUIRED_NO_STATIC_READS',
    observed_direct_read_clauses: records.length,
    exposed_methods: Object.freeze([...new Set(records.map(r => r.source+'::'+r.method))].sort()),
    records: Object.freeze(records),
    tenant_isolation_qualified: false,
    runtime_acl_qualified: false,
    production_qualified: false
  });
}
function auditRepository(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root))
    throw Error('TEAM_READ_SURFACE_ROOT_INVALID');
  const sources = Object.fromEntries(FILES.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
  return evaluateSources(sources);
}
if (require.main === module) {
  try {
    const result = auditRepository(path.join(__dirname,'..'));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if (result.status.startsWith('BLOCKED_')) process.exitCode = 2;
  } catch (e) {
    process.stderr.write(String(e.message || 'TEAM_READ_SURFACE_FAILED')+'\n');
    process.exitCode = 2;
  }
}
module.exports = Object.freeze({scanSource, evaluateSources, auditRepository, FILES});
