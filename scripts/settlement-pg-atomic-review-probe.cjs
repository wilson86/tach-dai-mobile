'use strict';
// Fresh synthetic PostgreSQL only; grants here are not production guidance.
const cp=require('node:child_process'),crypto=require('node:crypto');
const {createReviewProof}=require('../team-settlement/candidate/atomic-review-proof.cjs');
const [psql,port,cwd]=process.argv.slice(2);
if(!/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql)||!/^\d{2,5}$/.test(port)||!/^C:\\KTS-Settlement\\PG_SYNTHETIC_/i.test(cwd)||process.env.PGHOST!=='127.0.0.1')throw Error('REVIEW_SCOPE_DENIED');
const argv=['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_admin','-d','postgres'];
function run(sql,ok=true){const r=cp.spawnSync(psql,[...argv,'-c',sql],{cwd,env:process.env,encoding:'utf8',timeout:5000,windowsHide:true});if(r.error||(ok&&r.status!==0)||(!ok&&r.status===0))throw Error('REVIEW_SQL_UNEXPECTED '+String(r.stderr||'').slice(-500));return ok?String(r.stdout).trim():String(r.stderr||'')}
const operator='synthetic_token_'+('x'.repeat(32)),reviewer='synthetic_reviewer_'+('y'.repeat(32));
const hash=crypto.createHash('sha256').update(reviewer).digest('hex');
run(`INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at) VALUES('${hash}','user_2','group_a',clock_timestamp(),clock_timestamp()+interval '10 minutes')`);
run('GRANT EXECUTE ON FUNCTION kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text), kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text) TO synthetic_atomic_caller');
const expires=Math.floor(Date.now()/1000)+50;
function request(action,revision,event,key,digest){return {workspace_id:'group_a',partner_id:'customer_1',business_date:'2026-10-12',region:'mn',action,expected_revision:revision,event_id:event,idempotency_key:key,request_sha256:digest.repeat(64)}}
function invoke(token,req,nonce,purpose='write',ok=true){const p=createReviewProof(token,req,{nonce:nonce.repeat(32),expires,purpose});const fixed=`'${p.session_id}','${p.nonce}',${expires},'${p.proof}','group_a','customer_1','2026-10-12','mn','${req.action}',${req.expected_revision}`;const suffix=purpose==='write'?`,'${req.event_id}','${req.idempotency_key}','${req.request_sha256}'`:`,'${req.idempotency_key}','${req.request_sha256}'`;const name=purpose==='write'?'atomic_review_v1':'atomic_review_reconcile_v1';const out=run(`SET ROLE synthetic_atomic_caller; SELECT kts_team.${name}(${fixed}${suffix})`,ok);return ok?JSON.parse(out):out}
const submit=request('submit_review',5,'review_submit','review_submit_key','a');
let result=invoke(operator,submit,'1');if(result.state!=='PENDING_REVIEW'||String(result.new_revision)!=='6'||result.replayed!==false)throw Error('REVIEW_SUBMIT_INCORRECT');
const submitLookup=invoke(operator,{...submit,event_id:'lookup'},'2','lookup');if(submitLookup.classification!=='MATCHED_SERVER_RECEIPT'||submitLookup.event_id!=='review_submit')throw Error('REVIEW_SUBMIT_LOOKUP');
const approve=request('approve_review',6,'review_approve','review_approve_key','b');
const denied=invoke(operator,approve,'3','write',false);if(!denied.includes('TEAM_ROLE_DENIED'))throw Error('REVIEW_OPERATOR_APPROVAL_NOT_DENIED');
result=invoke(reviewer,approve,'4');if(result.state!=='REVIEWED'||String(result.new_revision)!=='7'||result.replayed!==false)throw Error('REVIEW_APPROVAL_INCORRECT');
const replay=invoke(reviewer,approve,'5');if(replay.replayed!==true||replay.event_id!=='review_approve')throw Error('REVIEW_REPLAY_INCORRECT');
const lookup=invoke(reviewer,{...approve,event_id:'lookup'},'6','lookup');if(lookup.classification!=='MATCHED_SERVER_RECEIPT'||lookup.event_id!=='review_approve')throw Error('REVIEW_APPROVAL_LOOKUP');
const facts=run("SELECT state||':'||revision::text||':'||submitted_by||':'||reviewed_by||':'||(SELECT count(*) FROM kts_team.scope_events WHERE event_id IN ('review_submit','review_approve'))::text||':'||(SELECT count(*) FROM kts_team.idempotency_receipts WHERE idempotency_key IN ('review_submit_key','review_approve_key'))::text FROM kts_team.scopes WHERE workspace_id='group_a' AND partner_id='customer_1'");
if(facts!=='REVIEWED:7:user_1:user_2:2:2')throw Error('REVIEW_FACTS_'+facts);
console.log('SYNTHETIC_ATOMIC_REVIEW_SUBMIT_APPROVE_REPLAY_RECONCILE_PASS state='+facts+' operator_approval=DENIED');
