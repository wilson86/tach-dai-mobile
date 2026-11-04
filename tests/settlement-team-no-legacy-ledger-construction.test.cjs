'use strict';
// Focused native Node test of the REAL current composition source, using only
// injected dependencies. No PostgreSQL, ports, credentials, CI or production.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../team-settlement/team-composition.cjs'),'utf8');

function loadComposition(state){
  const stubs={
    './pg-transaction-adapter.cjs':{createPgTransactionAdapter:({pool})=>({pool})},
    './postgres-auth-service.cjs':{createPostgresAuthService:()=>({verifySession:async()=>null})},
    './server-ledger-api.cjs':{createServerLedgerApi:({repository})=>({repository})},
    './recovery-reconciliation.cjs':{createRecoveryReconciliation:({repository})=>({repository})},
    './auth-http-contract.cjs':{createAuthHttpServer:()=>({listening:false,address:()=>null})},
    './role-probe.cjs':{qualifyIsolatedPoolRoles:async()=>({qualified:true})}
  };
  const fakeRequire=name=>{
    if(name==='./postgres-ledger-repository.cjs'){
      state.legacyRepoImports++;
      throw Error('LEGACY_LEDGER_REPO_MUST_NOT_IMPORT');
    }
    if(!Object.hasOwn(stubs,name))throw Error('UNEXPECTED_DEPENDENCY_'+name);
    return stubs[name];
  };
  const localModule={exports:{}};
  const wrapper=vm.runInNewContext('(function(require,module){'+source+'\n})');
  wrapper(fakeRequire,localModule);
  return localModule.exports.createIsolatedTeamPrototype;
}
const readMethods=['getScope','listCounterparties','getChanges','lookupRecoveryReceipts'];
const mutationMethods=['appendDraft','appendDraftWithSessionProof',
  'reconcileDraftWithSessionProof','advanceReview','advanceReviewWithSessionProof',
  'reconcileReviewWithSessionProof'];

test('composition does not import or construct unqualified direct-SQL Ledger repository',()=>{
  const state={legacyRepoImports:0,connects:0};
  const create=loadComposition(state);
  const pool=()=>({async connect(){state.connects++;throw Error('SQL_CONTACT_UNEXPECTED')}});
  const app=create({authPool:pool(),ledgerPool:pool(),syntheticOnly:true});
  assert.equal(state.legacyRepoImports,0);
  assert.equal(state.connects,0);
  assert.equal(app.server.listening,false);
  assert.deepEqual(Object.keys(app.ledgerRepository).sort(),[...readMethods,...mutationMethods].sort());
});

test('all repository methods fail closed even if verifyPools was never called',async()=>{
  const state={legacyRepoImports:0,connects:0};
  const create=loadComposition(state);
  const pool=()=>({async connect(){state.connects++;throw Error('SQL_CONTACT_UNEXPECTED')}});
  const app=create({authPool:pool(),ledgerPool:pool(),syntheticOnly:true,
    syntheticReviewEnabled:true,syntheticRecoveryInspectEnabled:true});
  for(const method of readMethods){
    await assert.rejects(app.ledgerRepository[method](),/TENANT_READ_BOUNDARY_UNAVAILABLE/);
  }
  for(const method of mutationMethods){
    await assert.rejects(app.ledgerRepository[method](),/ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  }
  assert.equal(state.legacyRepoImports,0);
  assert.equal(state.connects,0);
  assert.equal(app.server.listening,false);
});

test('review-only composition refuses live mode without touching a Pool',()=>{
  const state={legacyRepoImports:0,connects:0};
  const create=loadComposition(state);
  const pool=()=>({async connect(){state.connects++;throw Error('SQL_CONTACT_UNEXPECTED')}});
  assert.throws(()=>create({authPool:pool(),ledgerPool:pool()}),/RELEASE_NOT_AUTHORIZED/);
  assert.equal(state.connects,0);
});
