'use strict';
// KTS Settlement: isolated disposable PostgreSQL migration/catalog qualification.
// No existing DB/service, no paid CI, no production change. Explicit --run required.
// Requires successful SHA-bound C: preflight from sibling script.
const fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process'),net=require('node:net');
const {startWithFileCapture}=require('./settlement-pg-start-capture.cjs');
const SQL=[
 'team-settlement/migrations/001_team_ledger.sql',
 'team-settlement/migrations/002_draft_transaction.sql',
 'team-settlement/migrations/003_auth_session.sql',
 'team-settlement/migrations/004_review_workflow.sql'
];
const ROOT='C:\\KTS-Settlement';
const ID='qa_admin';
function fail(code){throw Error(code)}
function realC(p){
 if(typeof p!=='string'||!path.win32.isAbsolute(p)||!/^C:[\\/]/i.test(p)||
    p.startsWith('\\\\'))fail('TEAM_PG_C_ONLY');
 const normalized=path.win32.normalize(p);
 const out=path.win32.normalize(fs.realpathSync(normalized));
 if(!/^C:\\/i.test(out)||out.startsWith('\\\\'))fail('TEAM_PG_C_REPARSE');
 return out;
}
function exec(exe,args,cwd,env={},timeout=60000){
 const r=cp.spawnSync(exe,args,{cwd,env:{...process.env,...env},
  encoding:'utf8',timeout,windowsHide:true,maxBuffer:2*1024*1024});
 return {ok:!r.error&&r.status===0,exit_code:r.status,
  output:String(r.stdout||'').slice(-12000),
  error:String(r.stderr||'').slice(-3000),
  problem:r.error?.code||null};
}
function verifiedCommand(exe,args,cwd,env,timeout){
 const result=exec(exe,args,cwd,env,timeout);
 if(!result.ok)fail('TEAM_PG_COMMAND_FAILED');
 return result.output.trim();
}
async function availablePort(){
 const server=net.createServer();
 return await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;
   server.close(err=>err?reject(err):resolve(p));
  });
 });
}
async function main(){
 if(process.platform!=='win32')fail('TEAM_PG_WINDOWS_REQUIRED');
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--run'||
    !/^--expected-sha=[a-f0-9]{40}$/.test(args[1]))fail('TEAM_PG_EXPLICIT_RUN_AND_SHA_REQUIRED');
 const expected=args[1].split('=')[1];
 const root=realC(path.resolve(__dirname,'..'));
 const projectRoot=realC(ROOT);
 if(!root.toLowerCase().startsWith((projectRoot+'\\').toLowerCase())||
    root.toLowerCase()===projectRoot.toLowerCase())fail('TEAM_PG_ISOLATED_CHECKOUT_REQUIRED');
 if(verifiedCommand('git',['rev-parse','HEAD'],root)!==expected)fail('TEAM_PG_SOURCE_DRIFT');
 if(realC(verifiedCommand('git',['rev-parse','--show-toplevel'],root)).toLowerCase()!==root.toLowerCase())
   fail('TEAM_PG_REPO_ROOT_MISMATCH');
 if(verifiedCommand('git',['status','--porcelain','--untracked-files=no'],root)!=='')
   fail('TEAM_PG_TRACKED_SOURCE_DIRTY');
 for(const name of SQL){const f=realC(path.join(root,name));
  if(!f.toLowerCase().startsWith((root+'\\').toLowerCase())||
     !fs.statSync(f).isFile())fail('TEAM_PG_SQL_SOURCE_INVALID');}
 const admit=path.join(root,'.qa-evidence','pg-isolated-preflight','PREFLIGHT_'+expected+'.json');
 if(!fs.existsSync(admit)||fs.lstatSync(admit).isSymbolicLink())
   fail('TEAM_PG_PREFLIGHT_RECEIPT_REQUIRED');
 const p=JSON.parse(fs.readFileSync(admit,'utf8'));
 if(p.source_sha!==expected||p.platform!=='win32'||
    p.status!=='POSTGRES_BINARIES_ON_C_READY'||!Number.isSafeInteger(p.pg_major)||
    p.pg_major<15||p.postgres_started!==false||p.database_connected!==false)
   fail('TEAM_PG_PREFLIGHT_UNQUALIFIED');
 const pgDir=realC(p.pg_bindir);
 if(!pgDir.toLowerCase().startsWith('c:\\program files\\postgresql\\'))
   fail('TEAM_PG_BIN_NOT_APPROVED');
 const binaries=Object.fromEntries(['initdb','pg_ctl','psql','pg_config']
  .map(name=>[name,realC(path.join(pgDir,name+'.exe'))]));
 const expectedBin=realC(path.join('C:\\Program Files\\PostgreSQL',String(p.pg_major),'bin'));
 if(expectedBin.toLowerCase()!==pgDir.toLowerCase())
   fail('TEAM_PG_BIN_DIR_VERSION_MISMATCH');
 const version=verifiedCommand(binaries.pg_config,['--version'],root);
 const observed=/PostgreSQL\s+(\d+)(?:\.\d+)?/.exec(version);
 if(!observed||Number(observed[1])!==p.pg_major)
   fail('TEAM_PG_BIN_VERSION_INVALID');
 const runDir=path.join(projectRoot,'PG_SYNTHETIC_'+expected.slice(0,10)+'_'+
   Date.now()+'_'+crypto.randomBytes(4).toString('hex'));
 // Exclusive create: refuse any collision, junction or pre-existing PGDATA.
 fs.mkdirSync(runDir,{recursive:false});
 const resolved=realC(runDir);
 if(resolved.toLowerCase()!==runDir.toLowerCase())fail('TEAM_PG_RUN_DIR_REPARSE');
 const data=path.join(resolved,'fresh-pgdata'),serverLog=path.join(resolved,'server.log');
 const receiptPath=path.join(resolved,'qualification.json');
 const receipt={schema:'kts-settlement-pg-migration-v1',source_sha:expected,
  run_dir:resolved,started_at:new Date().toISOString(),pg_major:p.pg_major,
  postgres_started:false,postgres_stopped:false,
  migration_results:[],checks:{},status:'NOT_RUN',
  candidate_atomic_sql:'NOT_RUN',effective_role_grants:'NOT_RUN',
  concurrent_logout:'NOT_RUN',lost_commit:'NOT_RUN',
  write_block:'ENABLED',production_mutation:'NONE',cost_usd:0};
 let started=false;
 const password=crypto.randomBytes(36).toString('base64url');
 const tempSecret=path.join(resolved,'initdb-secret.tmp');
 const env={PGPASSWORD:password,PGHOST:'127.0.0.1',PGUSER:ID,PGDATABASE:'postgres',
  PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGOPTIONS:''};
 const psql=(extra,port,timeout=35000)=>exec(binaries.psql,
   ['-X','-w','-v','ON_ERROR_STOP=1','-A','-t','-h','127.0.0.1',
    '-p',String(port),'-U',ID,'-d','postgres',...extra],
   resolved,{...env,PGPORT:String(port)},timeout);
 try{
  fs.writeFileSync(tempSecret,password+'\n',{flag:'wx',mode:0o600});
  const init=exec(binaries.initdb,['-D',data,'--username='+ID,
     '--encoding=UTF8','--auth-host=scram-sha-256','--auth-local=scram-sha-256',
     '--pwfile='+tempSecret],resolved,{},70000);
  if(!init.ok)fail('TEAM_PG_INITDB_FAILED');
  // Known generated secret, always deleted; never preserve credential bytes.
  fs.unlinkSync(tempSecret);
  const port=await availablePort();
  receipt.port=port;
  fs.appendFileSync(path.join(data,'postgresql.conf'),
   "\nlisten_addresses = '127.0.0.1'\nport = "+port+
   "\nssl = off\nlogging_collector = off\n");
  fs.writeFileSync(path.join(data,'pg_hba.conf'),
   'host all all 127.0.0.1/32 scram-sha-256\n'+
   'host all all ::1/128 reject\n');
  const up=startWithFileCapture(binaries.pg_ctl,['-D',data,'-l',serverLog,'-w','-t','30','start'],
    {cwd:resolved,env:process.env,timeout:45000,logPath:path.join(resolved,'pgctl-start.log')});
  receipt.pg_ctl_start={exit_code:up.exit_code,problem:up.problem,signal:up.signal};
  if(!up.ok)fail('TEAM_PG_START_FAILED');
  started=true;receipt.postgres_started=true;
  for(const f of SQL){
   const r=psql(['-f',realC(path.join(root,f))],port,50000);
   receipt.migration_results.push({file:f,exit_code:r.exit_code,
    passed:r.ok,error:r.ok?null:r.error.slice(-1000)});
   if(!r.ok)fail('TEAM_PG_MIGRATION_FAILED');
  }
  const catalog=psql(['-c',`SELECT count(*) FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='kts_team'
      AND c.relname IN ('workspaces','memberships','counterparties',
       'scopes','scope_events','idempotency_receipts')
      AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity`],port);
  receipt.checks.force_rls_six=catalog.ok&&catalog.output.trim()==='6';
  const raw=psql(['-c',`SELECT count(*) FROM pg_catalog.pg_proc p
    WHERE p.oid IN (
      'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)'::regprocedure,
      'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'::regprocedure)
      AND p.prosecdef=false
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(
        COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')`],port);
  receipt.checks.raw_mutation_not_public=raw.ok&&raw.output.trim()==='2';
  // Execute existing restricted-role tenant reads against this fresh cluster.
  const smokePath=realC(path.join(root,'team-settlement/tests/postgres-smoke.sql'));
  if(!smokePath.toLowerCase().startsWith((root+'\\').toLowerCase()))fail('TEAM_PG_SQL_SOURCE_INVALID');
  const smoke=psql(['-f',smokePath],port,50000);
  receipt.checks.restricted_role_rls_smoke=smoke.ok&&smoke.output.includes('POSTGRES_TEAM_M0_SYNTHETIC_RLS_AND_IMMUTABILITY_PASS');
  // Save only bounded synthetic SQL evidence; never assert PASS from exit alone.
  // Individual stderr carries PostgreSQL NOTICE/SQLSTATE for the negative probe.
  receipt.synthetic_psql_evidence={
    tenant_read:{exit_code:smoke.exit_code,stdout_tail:smoke.output,
      stderr_tail:smoke.error,process_error:smoke.problem},
  };
  const writePath=realC(path.join(root,'team-settlement/tests/postgres-rls-denied-write.sql'));
  if(!writePath.toLowerCase().startsWith((root+'\\').toLowerCase()))fail('TEAM_PG_SQL_SOURCE_INVALID');
  const write=psql(['-f',writePath],port,50000);
  receipt.checks.restricted_role_cross_workspace_write_denied=write.ok&&
    write.output.includes('SYNTHETIC_CROSS_WORKSPACE_WRITE_DENIED')&&
    write.error.includes('SYNTHETIC_RLS_WRITE_DENIAL_SQLSTATE=42501');
  receipt.synthetic_psql_evidence.tenant_write={exit_code:write.exit_code,
    stdout_tail:write.output,stderr_tail:write.error,process_error:write.problem};
  receipt.status=receipt.checks.force_rls_six&&receipt.checks.raw_mutation_not_public?
   (receipt.checks.restricted_role_rls_smoke&&receipt.checks.restricted_role_cross_workspace_write_denied?
    'MIGRATIONS_AND_LIMITED_CATALOG_PASS':'BLOCKED_RLS_BEHAVIOR'):'BLOCKED_CATALOG_INVARIANT';
  // Review-only DDL admission: never execute candidate functions or grant access.
  // The database is synthetic and freshly initialized by THIS runner.
  receipt.atomic_ddl={status:'NOT_RUN',stages:[],catalog_owner_public_guard:false,
    execution_tests:'NOT_RUN',effective_grants:'NOT_RUN',concurrent_logout:'NOT_RUN',
    lost_commit:'NOT_RUN',receipt_reconciliation:'NOT_RUN'};
  if(receipt.status==='MIGRATIONS_AND_LIMITED_CATALOG_PASS'){
    for(const f of [
      'team-settlement/candidate/atomic-compile-bootstrap.sql',
      'team-settlement/candidate/atomic-review-v1.sql'
    ]){
      const sourcePath=realC(path.join(root,f));
      if(!sourcePath.toLowerCase().startsWith((root+'\\').toLowerCase())||
         !fs.statSync(sourcePath).isFile())fail('TEAM_PG_ATOMIC_SOURCE_INVALID');
      const result=psql(['-f',sourcePath],port,70000);
      receipt.atomic_ddl.stages.push({file:f,exit_code:result.exit_code,
        stdout_tail:result.output,stderr_tail:result.error,
        process_error:result.problem,passed:result.ok});
      if(!result.ok){
        receipt.atomic_ddl.status='BLOCKED_SQL_DDL';
        receipt.status='BLOCKED_ATOMIC_CANDIDATE_DDL';
        break;
      }
    }
    if(receipt.atomic_ddl.stages.length===2&&
       receipt.atomic_ddl.stages.every(s=>s.passed)){
      const catalog=psql(['-c',`SELECT count(*) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
    WHERE p.oid IN (
        pg_catalog.to_regprocedure('kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)'),
        pg_catalog.to_regprocedure('kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text)'),
        pg_catalog.to_regprocedure('kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text)'),
        pg_catalog.to_regprocedure('kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)'))
      AND r.rolname='kts_atomic_owner'
      AND p.prosecdef
      AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
      )`],port,35000);
      receipt.atomic_ddl.catalog_owner_public_guard=catalog.ok&&catalog.output.trim()==='4';
      receipt.atomic_ddl.catalog_exit_code=catalog.exit_code;
      receipt.atomic_ddl.catalog_stderr_tail=catalog.error;
      receipt.atomic_ddl.status=receipt.atomic_ddl.catalog_owner_public_guard?
        'DDL_ADMITTED_REVIEW_ONLY':'BLOCKED_OWNER_OR_PUBLIC_PRIVILEGE';
      receipt.status=receipt.atomic_ddl.catalog_owner_public_guard?
        'ATOMIC_DDL_REVIEW_ONLY_PASS':'BLOCKED_ATOMIC_CATALOG';
      if(receipt.atomic_ddl.catalog_owner_public_guard){
        const probePath=realC(path.join(root,'team-settlement/tests/postgres-atomic-runtime-probe.sql'));
        if(!probePath.toLowerCase().startsWith((root+'\\').toLowerCase())||!fs.statSync(probePath).isFile())
          fail('TEAM_PG_ATOMIC_PROBE_SOURCE_INVALID');
        const probe=psql(['-f',probePath],port,50000);
        receipt.atomic_runtime_probe={exit_code:probe.exit_code,stdout_tail:probe.output,
          stderr_tail:probe.error,process_error:probe.problem,
          passed:probe.ok&&probe.output.includes('SYNTHETIC_ATOMIC_DRAFT_SESSION_AND_GUC_PASS')&&
            probe.output.includes('SYNTHETIC_NONCE_REPLAY_AND_RECEIPT_LOOKUP_PASS')&&
            probe.output.includes('SYNTHETIC_CAS_IDEMPOTENCY_REVOKED_AND_UNKNOWN_PASS')};
        if(!receipt.atomic_runtime_probe.passed)receipt.status='BLOCKED_ATOMIC_RUNTIME_PROBE';
        if(receipt.atomic_runtime_probe.passed){
          const racePath=realC(path.join(root,'scripts/settlement-pg-atomic-logout-race.cjs'));
          if(!racePath.toLowerCase().startsWith((root+'\\').toLowerCase())||!fs.statSync(racePath).isFile())
            fail('TEAM_PG_RACE_SOURCE_INVALID');
          const race=exec(process.execPath,[racePath,binaries.psql,String(port),resolved],resolved,{...env,PGPORT:String(port)},30000);
          receipt.concurrent_logout={exit_code:race.exit_code,stdout_tail:race.output,stderr_tail:race.error,
            process_error:race.problem,passed:race.ok&&race.output.includes('SYNTHETIC_CONCURRENT_LOGOUT_BLOCKED_THEN_COMMITTED_PASS')&&
              race.output.includes('SYNTHETIC_CONCURRENT_LOGOUT_FIRST_DENIES_WRITE_PASS')&&
              race.output.includes('SYNTHETIC_MEMBERSHIP_REVOCATION_BOTH_ORDERINGS_PASS')&&
              race.output.includes('SYNTHETIC_ROLE_DOWNGRADE_FIRST_DENIES_WRITE_PASS')};
          if(!receipt.concurrent_logout.passed)receipt.status='BLOCKED_ATOMIC_LOGOUT_RACE';
          if(receipt.concurrent_logout.passed){
            const lostPath=realC(path.join(root,'scripts/settlement-pg-lost-commit-probe.cjs'));
            if(!lostPath.toLowerCase().startsWith((root+'\\').toLowerCase())||!fs.statSync(lostPath).isFile())
              fail('TEAM_PG_LOST_ACK_SOURCE_INVALID');
            const lost=exec(process.execPath,[lostPath,binaries.psql,String(port),resolved],resolved,{...env,PGPORT:String(port)},30000);
            receipt.lost_commit={exit_code:lost.exit_code,stdout_tail:lost.output,stderr_tail:lost.error,
              process_error:lost.problem,passed:lost.ok&&lost.output.includes('SYNTHETIC_COMMIT_ACK_DROPPED_AND_RECEIPT_RECONCILED_PASS')&&
                lost.output.includes('SYNTHETIC_COMMIT_REQUEST_DROPPED_ROLLBACK_UNKNOWN_PASS')};
            if(!receipt.lost_commit.passed)receipt.status='BLOCKED_ATOMIC_LOST_ACK';
            if(receipt.lost_commit.passed){
              const reviewPath=realC(path.join(root,'scripts/settlement-pg-atomic-review-probe.cjs'));
              if(!reviewPath.toLowerCase().startsWith((root+'\\').toLowerCase())||!fs.statSync(reviewPath).isFile())
                fail('TEAM_PG_REVIEW_PROBE_SOURCE_INVALID');
              const review=exec(process.execPath,[reviewPath,binaries.psql,String(port),resolved],resolved,{...env,PGPORT:String(port)},30000);
              receipt.atomic_review_probe={exit_code:review.exit_code,stdout_tail:review.output,stderr_tail:review.error,
                process_error:review.problem,passed:review.ok&&review.output.includes('SYNTHETIC_ATOMIC_REVIEW_SUBMIT_APPROVE_REPLAY_RECONCILE_PASS')};
              if(!receipt.atomic_review_probe.passed)receipt.status='BLOCKED_ATOMIC_REVIEW_PROBE';
            }
          }
        }
      }
    }
  }
 }catch(e){receipt.status='BLOCKED_'+String(e.message||'UNKNOWN').replace(/[^A-Z0-9_]/g,'').slice(0,70);}
 finally{
  // The only pg_ctl stop target is the newly initialized unique PGDATA.
  if(started||fs.existsSync(path.join(data,'postmaster.pid'))){
   const stop=exec(binaries.pg_ctl,['-D',data,'-m','immediate','-w','-t','30','stop'],resolved,{},45000);
   receipt.postgres_stopped=stop.ok;
   if(!stop.ok)receipt.status='BLOCKED_SERVER_STOP_FAILED_OPERATOR_ATTENTION';
  }
  if(fs.existsSync(tempSecret)){
   try{fs.unlinkSync(tempSecret);}catch(_){receipt.status='BLOCKED_SECRET_CLEANUP_FAILED';}
  }
  receipt.completed_at=new Date().toISOString();
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  process.stdout.write('PG_ISOLATED='+receipt.status+' SQL='+receipt.migration_results.length+
   '/4 STOPPED='+receipt.postgres_stopped+' RECEIPT='+receiptPath+'\n');
  if(receipt.status!=='ATOMIC_DDL_REVIEW_ONLY_PASS')process.exitCode=1;
 }
}
main().catch(e=>{process.stderr.write('PG_ISOLATED_PRECHECK_BLOCKED '+e.message+'\n');process.exitCode=2});
