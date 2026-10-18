'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const required=['KTS_RUNTIME_DB','KTS_RUNTIME_BOOTSTRAP_USER','KTS_RUNTIME_AUTH_USER',
  'KTS_RUNTIME_LEDGER_USER','KTS_RUNTIME_BOOTSTRAP_PASSWORD',
  'KTS_RUNTIME_AUTH_PASSWORD','KTS_RUNTIME_LEDGER_PASSWORD'];
const configured=required.every(key=>typeof process.env[key]==='string'&&process.env[key]);
if(!configured){
  test.skip('real PostgreSQL membership/directory qualification requires explicit disposable runtime credentials',()=>{});
}else{
  const {Pool}=require('pg');
  const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
  const {hashPassword}=require('../team-settlement/auth-contract.cjs');
  const {createSyntheticBootstrapExecutor}=require('../team-settlement/synthetic-bootstrap-executor.cjs');
  const port=Number(process.env.KTS_RUNTIME_PORT||55433);
  const pool=(user,password)=>new Pool({host:'127.0.0.1',port,database:process.env.KTS_RUNTIME_DB,
    user,password,max:2,connectionTimeoutMillis:8000,query_timeout:10000,
    statement_timeout:8000,application_name:'kts_group_runtime_qualification'});
  test('disposable PostgreSQL qualifies separate roles, durable membership mutation and tenant directory',async()=>{
    const admin=pool(process.env.KTS_RUNTIME_BOOTSTRAP_USER,process.env.KTS_RUNTIME_BOOTSTRAP_PASSWORD);
    const auth=pool(process.env.KTS_RUNTIME_AUTH_USER,process.env.KTS_RUNTIME_AUTH_PASSWORD);
    const ledger=pool(process.env.KTS_RUNTIME_LEDGER_USER,process.env.KTS_RUNTIME_LEDGER_PASSWORD);
    const tag='rt'+Date.now().toString(36);
    const workspace=`fake_runtime_${tag}`,administrator=`fake_admin_${tag}`,
      member=`fake_member_${tag}`,partner=`fake_customer_${tag}`;
    const password='synthetic-runtime-password-16';
    try{
      const app=createIsolatedTeamPrototype({authPool:auth,ledgerPool:ledger,syntheticOnly:true});
      assert.deepEqual(await app.verifyPools(),{qualified:true,
        auth_role:process.env.KTS_RUNTIME_AUTH_USER,ledger_role:process.env.KTS_RUNTIME_LEDGER_USER});
      const identities=Array.from({length:10},(_,index)=>{
        const user_id=index===0?administrator:index===1?member:`fake_member_${tag}_${index+1}`;
        return {user_id,auth_subject:user_id,password_hash:hashPassword(password)};
      });
      const bootstrapDb={transaction:async work=>{
        const client=await admin.connect();
        try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}
        catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
        finally{client.release();}
      }};
      const bootstrap=createSyntheticBootstrapExecutor({db:bootstrapDb});
      const bootstrapResult=await bootstrap.apply({
        workspaces:[{workspace_id:workspace,display_name:'Runtime synthetic'}],identities,
        memberships:identities.map((identity,index)=>({workspace_id:workspace,user_id:identity.user_id,
          role:index===0?'admin':'operator'})),
        counterparties:[{workspace_id:workspace,partner_id:partner,partner_kind:'customer',display_name:'Runtime synthetic customer'},
          {workspace_id:workspace,partner_id:`fake_owner_${tag}`,partner_kind:'owner',display_name:'Runtime synthetic owner'}]
      });
      assert.equal(bootstrapResult.identity_count,10);
      const login=await app.auth.login({auth_subject:administrator,password,workspace_id:workspace});
      const actor=await app.auth.verifySession(login.session_token);
      assert.equal(actor.role,'admin');
      assert.deepEqual(await app.auth.manageMembership(actor,{workspace_id:workspace,user_id:member,role:'reviewer'}),
        {workspace_id:workspace,user_id:member,role:'reviewer',revoked_at:null});
      const rows=await app.ledger.listCounterparties(login.session_token,{kind:'customer',limit:10});
      assert.deepEqual(rows,[{workspace_id:workspace,partner_id:partner,partner_kind:'customer',display_name:'Runtime synthetic customer'}]);
      const stored=await admin.query('SELECT team_role FROM kts_team.memberships WHERE workspace_id=$1 AND user_id=$2',[workspace,member]);
      assert.equal(stored.rows[0].team_role,'reviewer');
    }finally{
      try{await admin.query('DELETE FROM kts_auth.sessions WHERE workspace_id=$1',[workspace]);}catch{}
      try{await admin.query('DELETE FROM kts_auth.credentials WHERE user_id IN ($1,$2)',[administrator,member]);}catch{}
      try{await admin.query('DELETE FROM kts_team.workspaces WHERE workspace_id=$1',[workspace]);}catch{}
      await Promise.allSettled([admin.end(),auth.end(),ledger.end()]);
    }
  });
}
