'use strict';
// Synthetic caller login only; fixed password belongs solely to the ephemeral test cluster.
const cp=require('node:child_process');const {createDraftProof}=require('../team-settlement/candidate/atomic-draft-proof.cjs');const [psql,port,cwd]=process.argv.slice(2);
if(!/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql)||!/^\d{2,5}$/.test(port)||!/^C:\\KTS-Settlement\\PG_SYNTHETIC_/i.test(cwd)||process.env.PGHOST!=='127.0.0.1')throw Error('CALLER_SCOPE_DENIED');
const args=['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',port,'-U','synthetic_atomic_caller','-d','postgres'];
function run(sql){const r=cp.spawnSync(psql,[...args,'-c',sql],{cwd,env:{...process.env,PGPASSWORD:'synthetic_fixture_only_password_7291'},encoding:'utf8',timeout:5000,windowsHide:true});if(r.error)throw Error('CALLER_PROCESS_FAILED');return r}
const who=run("SELECT session_user||':'||current_user||':'||(SELECT rolsuper::text||':'||rolbypassrls::text FROM pg_roles WHERE rolname=current_user)");
if(who.status!==0||who.stdout.trim()!=='synthetic_atomic_caller:synthetic_atomic_caller:false:false')throw Error('CALLER_IDENTITY_INVALID');
const cases=[['owner','SET ROLE kts_atomic_owner'],['direct',"UPDATE kts_team.scopes SET revision=99 WHERE workspace_id='group_b'"],['raw',"SELECT set_config('kts.workspace_id','group_b',false),set_config('kts.actor_user_id','user_2',false); SELECT kts_team.append_draft('group_b','customer_1','2026-10-12','mn',1,'forged_event','forged_key',repeat('f',64),'{}'::jsonb)"]];
for(const [label,sql] of cases){const r=run(sql);if(r.status===0||!r.stderr.includes('42501'))throw Error('CALLER_DENIAL_FAILED_'+label+' exit='+r.status+' stderr='+r.stderr.slice(-300));}
const token='synthetic_auth_user_'+('z'.repeat(32)),expires=Math.floor(Date.now()/1000)+45;
const req={workspace_id:'group_a',partner_id:'customer_1',business_date:'2026-10-12',region:'mn',action:'edit_draft',expected_revision:2,event_id:'authenticated_event',idempotency_key:'authenticated_key',request_sha256:'b'.repeat(64),snapshot_text:'{"synthetic":true}'};
const p=createDraftProof(token,req,{nonce:'e'.repeat(32),expires});
const call=`'${p.session_id}','${p.nonce}',${expires},'${p.proof}','group_a','customer_1','2026-10-12','mn','edit_draft',2,'authenticated_event','authenticated_key','${req.request_sha256}','${req.snapshot_text}'`;
const positive=run(`BEGIN; SELECT kts_team.atomic_draft_v1(${call}); ROLLBACK`);
if(positive.status!==0)throw Error('CALLER_POSITIVE_FAILED '+positive.stderr.slice(-300));
const result=JSON.parse(positive.stdout.trim());if(result.event_id!=='authenticated_event'||String(result.new_revision)!=='3')throw Error('CALLER_POSITIVE_MISMATCH');
console.log('SYNTHETIC_AUTHENTICATED_CALLER_OWNER_DIRECT_RAW_DENIED_PASS role_non_superuser=true sqlstate=42501 cases=3 positive_draft=PASS rollback_requested=true');
