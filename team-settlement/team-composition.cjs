'use strict';

// Safety-only composition seam for the 10–30-person future Team backend.
// No DB creation, no socket binding, no production or Telegram effects.
const {createPgTransactionAdapter}=require('./pg-transaction-adapter.cjs');
const {createPostgresAuthService}=require('./postgres-auth-service.cjs');
const {createPostgresLedgerRepository}=require('./postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('./server-ledger-api.cjs');
const {createRecoveryReconciliation}=require('./recovery-reconciliation.cjs');
const {createAuthHttpServer}=require('./auth-http-contract.cjs');
const {qualifyIsolatedPoolRoles}=require('./role-probe.cjs');

function createIsolatedTeamPrototype({
  authPool, ledgerPool, clock=()=>Date.now(), syntheticOnly=false,
  syntheticReviewEnabled=false,
  syntheticRecoveryInspectEnabled=false,
  syntheticMembershipAdminEnabled=false,
  syntheticAuthorizationDiagnostic=null
}={}){
  if(syntheticOnly!==true)throw new Error('TEAM_RELEASE_NOT_AUTHORIZED');
  if(!authPool || !ledgerPool || authPool===ledgerPool ||
     typeof authPool.connect!=='function' || typeof ledgerPool.connect!=='function')
    throw new Error('TEAM_DB_ROLES_NOT_ISOLATED');
  if(typeof clock!=='function')throw new Error('TEAM_CLOCK_INVALID');
  if(typeof syntheticReviewEnabled!=='boolean')throw Error('TEAM_REVIEW_CONFIG_INVALID');
  if(typeof syntheticRecoveryInspectEnabled!=='boolean')
    throw Error('TEAM_RECOVERY_CONFIG_INVALID');
  if(typeof syntheticMembershipAdminEnabled!=='boolean')
    throw Error('TEAM_MEMBERSHIP_ADMIN_CONFIG_INVALID');
  if(syntheticAuthorizationDiagnostic!==null&&typeof syntheticAuthorizationDiagnostic!=='function')
    throw Error('TEAM_AUTHORIZATION_DIAGNOSTIC_INVALID');
  const authDb=createPgTransactionAdapter({pool:authPool});
  const ledgerDb=createPgTransactionAdapter({pool:ledgerPool});
  const auth=createPostgresAuthService({db:authDb,clock});
  const unqualifiedRepository=createPostgresLedgerRepository({db:ledgerDb,
    syntheticAuthorizationDiagnostic});
  // The current split-connection session lock cannot protect a ledger commit
  // after auth connection loss. Deny writes even when a caller skips verifyPools.
  // This is a temporary safety block, not a working atomic mutation boundary.
  const denyUnqualifiedMutation=async()=>{throw Error('TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE');};
  const ledgerRepository=Object.freeze({...unqualifiedRepository,
    appendDraft:denyUnqualifiedMutation,appendDraftWithSessionProof:denyUnqualifiedMutation,
    reconcileDraftWithSessionProof:denyUnqualifiedMutation,advanceReview:denyUnqualifiedMutation,
    advanceReviewWithSessionProof:denyUnqualifiedMutation,
    reconcileReviewWithSessionProof:denyUnqualifiedMutation});
  const ledger=createServerLedgerApi({auth,repository:ledgerRepository,syntheticReviewEnabled,requireSessionLockForWrites:true});
  // A distinct, separately opted-in recovery inspector wires the actual
  // actor-scoped PostgreSQL READ ONLY receipt repository into the HTTP route.
  // Neither construction nor enabling the flag opens a port or database pool.
  const recoveryInspector=syntheticRecoveryInspectEnabled?
    createRecoveryReconciliation({auth,repository:ledgerRepository,
      syntheticOnly:true}):null;
  const server=createAuthHttpServer(auth,{
    ledger,clock,enableSyntheticReviewHttp:syntheticReviewEnabled,
    recoveryInspector,
    enableSyntheticRecoveryInspectHttp:syntheticRecoveryInspectEnabled,
    // Membership bootstrap is a separately controlled setup boundary. The
    // normal group application never exposes membership mutation routes.
    enableMembershipAdminHttp:syntheticMembershipAdminEnabled
  });
  // The caller controls when/how to listen. This candidate must NEVER
  // automatically expose a port or initialize an operational database.
  return Object.freeze({auth,ledgerRepository,ledger,server,
    // Never called during construction. Pre-pilot explicit read-only check.
    verifyPools:async()=>{
      await qualifyIsolatedPoolRoles({authPool,ledgerPool,syntheticOnly,requireReview:syntheticReviewEnabled});
      // Role separation alone cannot qualify this composition: session locking
      // and the ledger mutation currently use independent transactions. The
      // lock can disappear while a ledger commit is still in flight.
      throw new Error('TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE');
    }
  });
}
module.exports=Object.freeze({createIsolatedTeamPrototype});
