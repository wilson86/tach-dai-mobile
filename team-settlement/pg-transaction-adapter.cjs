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
        typeof client.release !== 'function')
      throw new Error('TEAM_PG_CLIENT_INVALID');
    let began = false;
    let commitAttempted = false;
    let committed = false;
    let poisoned = false;
    let active = false;
    try {
      await client.query('BEGIN');
      began = true;
      active = true;
      const tx = Object.freeze({
        query(sql, args) {
          if (!active) throw new Error('TEAM_DB_TRANSACTION_CLOSED');
          if (typeof sql !== 'string' || !sql.trim()) throw new Error('TEAM_DB_QUERY_INVALID');
          if (args !== undefined && !Array.isArray(args)) throw new Error('TEAM_DB_PARAMS_INVALID');
          return client.query(sql, args);
        }
      });
      const result = await work(tx);
      active = false;
      commitAttempted = true;
      await client.query('COMMIT');
      committed = true;
      return result;
    } catch (error) {
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
      client.release(poisoned);
    }
  }
  return Object.freeze({ transaction });
}

module.exports = Object.freeze({ createPgTransactionAdapter });
