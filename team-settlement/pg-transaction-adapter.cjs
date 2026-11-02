'use strict';

// M1 isolated transaction adapter seam for an injected, operator-reviewed
// node-postgres Pool. This module creates no network connection by itself,
// has no production credentials and never talks to Router/Telegram.
function createPgTransactionAdapter({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function')
    throw new Error('TEAM_PG_POOL_REQUIRED');

  async function transaction(work) {
    if (typeof work !== 'function') throw new Error('TEAM_DB_WORK_REQUIRED');
    const client = await pool.connect();
    if (!client || typeof client.query !== 'function' ||
        typeof client.release !== 'function') {
      // A pool may return a malformed client; if it can be released, destroy
      // it immediately rather than leaking a checked-out connection.
      try { client?.release?.(true); } catch { /* preserve invalid-client error */ }
      throw new Error('TEAM_PG_CLIENT_INVALID');
    }
    let began = false;
    let commitAttempted = false;
    let committed = false;
    let poisoned = false;
    let active = false;
    let failed = false;
    const pending = new Set();
    try {
      await client.query('BEGIN');
      began = true;
      active = true;
      const tx = Object.freeze({
        query(sql, args) {
          if (!active) throw new Error('TEAM_DB_TRANSACTION_CLOSED');
          if (typeof sql !== 'string' || !sql.trim()) throw new Error('TEAM_DB_QUERY_INVALID');
          if (args !== undefined && !Array.isArray(args)) throw new Error('TEAM_DB_PARAMS_INVALID');
          const result = client.query(sql, args);
          if (result && typeof result.then === 'function') {
            pending.add(result);
            // Observe settle without replacing/rejecting the caller's promise.
            // Detached SQL must never allow a premature financial COMMIT.
            void result.then(() => pending.delete(result),
              () => pending.delete(result));
          }
          return result;
        }
      });
      const result = await work(tx);
      active = false;
      if (pending.size > 0) {
        // A caller returned while SQL was still running. Roll back and
        // destroy the connection instead of committing a partial operation.
        poisoned = true;
        throw new Error('TEAM_DB_UNAWAITED_QUERY');
      }
      commitAttempted = true;
      let commitResult;
      try {
        commitResult = await client.query('COMMIT');
      } catch (cause) {
        // A lost acknowledgement does not establish whether COMMIT reached
        // the server. Preserve the cause internally; do not claim rollback.
        throw new Error('TEAM_DB_COMMIT_OUTCOME_UNKNOWN', { cause });
      }
      // PostgreSQL can answer COMMIT with the ROLLBACK command tag when the
      // transaction was already aborted. A successful round trip alone is not
      // evidence that the mutation committed. A missing or unexpected tag
      // must fail closed, including for injected adapters.
      if (!commitResult || commitResult.command !== 'COMMIT')
        throw new Error('TEAM_DB_COMMIT_NOT_COMMITTED');
      committed = true;
      return result;
    } catch (error) {
      failed = true;
      active = false;
      if (began && !committed) {
        try { await client.query('ROLLBACK'); }
        catch { poisoned = true; }
      } else {
        poisoned = true;
      }
      // Never reuse a connection after a failed BEGIN or ambiguous COMMIT,
      // even when rollback appears to succeed.
      if (!began || commitAttempted) poisoned = true;
      throw error;
    } finally {
      // A rolled-back/failed transaction is never silently reused on
      // an uncertain connection. Release(true) destroys node-postgres client.
      try { client.release(poisoned); }
      catch (cause) {
        // A cleanup exception after COMMIT must never look like a known
        // mutation failure. Preserve the original transaction error otherwise.
        if (committed) throw new Error('TEAM_DB_COMMIT_OUTCOME_UNKNOWN', {cause});
        if (!failed) throw cause;
      }
    }
  }
  return Object.freeze({ transaction });
}

module.exports = Object.freeze({ createPgTransactionAdapter });
