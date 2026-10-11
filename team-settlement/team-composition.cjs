'use strict';

// Safety-only composition seam for the 10–30-person future Team backend.
// No DB creation, no socket binding, no production or Telegram effects.
const {createPgTransactionAdapter}=require('./pg-transaction-adapter.cjs');
const {createPostgresAuthService}=require('./postgres-auth-service.cjs');
const {createPostgresLedgerRepository}=require('./postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('./server-ledger-api.cjs');
const {createAuthHttpServer}=require('./auth-http-contract.cjs');

function createIsolatedTeamPrototype({
  authPool, ledgerPool, clock=()=>Date.now(), syntheticOnly=false
}={}){
  if(syntheticOnly!==true)throw new Error('TEAM_RELEASE_NOT_AUTHORIZED');
  if(!authPool || !ledgerPool || authPool===ledgerPool ||
     typeof authPool.connect!=='function' || typeof ledgerPool.connect!=='function')
    throw new Error('TEAM_DB_ROLES_NOT_ISOLATED');
  if(typeof clock!=='function')throw new Error('TEAM_CLOCK_INVALID');
  const authDb=createPgTransactionAdapter({pool:authPool});
  const ledgerDb=createPgTransactionAdapter({pool:ledgerPool});
  const auth=createPostgresAuthService({db:authDb,clock});
  const ledgerRepository=createPostgresLedgerRepository({db:ledgerDb});
  const ledger=createServerLedgerApi({auth,repository:ledgerRepository});
  const server=createAuthHttpServer(auth,{ledger,clock});
  // The caller controls when/how to listen. This candidate must NEVER
  // automatically expose a port or initialize an operational database.
  return Object.freeze({auth,ledgerRepository,ledger,server});
}
module.exports=Object.freeze({createIsolatedTeamPrototype});
