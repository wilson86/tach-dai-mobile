'use strict';
// Only invoked by the SHA-bound synthetic runner after its fixture succeeds.
const cp=require('node:child_process'),crypto=require('node:crypto');
const [psql,port,cwd]=process.argv.slice(2);
if(!/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql)||!/^\d{2,5}$/.test(port)||!/^C:\\KTS-Settlement\\PG_SYNTHETIC_/i.test(cwd)||process.env.PGHOST!=='127.0.0.1')throw Error('RACE_SCOPE_DENIED');
const common=['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_admin','-d','postgres'];
const options={cwd,env:process.env,encoding:'utf8',timeout:5000,windowsHide:true};
function query(sql){const r=cp.spawnSync(psql,[...common,'-c',sql],options);if(r.status!==0||r.error)throw Error('RACE_QUERY_FAILED '+String(r.stderr||'').slice(-500));return String(r.stdout).trim()}
function worker(name){const p=cp.spawn(psql,common,{cwd,env:{...process.env,PGAPPNAME:name},windowsHide:true});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);let done=false,code;p.on('exit',x=>{done=true;code=x});return {p,get out(){return out},get err(){return err},get done(){return done},get code(){return code}}}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label,ms=6000){const until=Date.now()+ms;while(Date.now()<until){if(fn())return;await delay(50)}throw Error('RACE_TIMEOUT_'+label)}
function proof(event,key,nonce,revision=2){const hash='a'.repeat(64),sid=crypto.createHash('sha256').update(hash).digest('hex'),snapshot='{"synthetic":true}',expires=Math.floor(Date.now()/1000)+45,digest='d'.repeat(64),snap=crypto.createHash('sha256').update(snapshot).digest('hex');const msg=['kts-draft-v1',sid,'group_a','customer_1','2026-10-12','mn','edit_draft',String(revision),event,key,digest,snap,nonce,expires].join('|');const sig=crypto.createHmac('sha256',Buffer.from(hash,'hex')).update(msg).digest('hex');return `'${sid}','${nonce}',${expires},'${sig}','group_a','customer_1','2026-10-12','mn','edit_draft',${revision},'${event}','${key}','${digest}','${snapshot}'`}
async function main(){let a,b;try{
 query("UPDATE kts_auth.sessions SET revoked_at=NULL WHERE session_hash=repeat('a',64)");
 a=worker('kts_race_mutation');b=worker('kts_race_logout');
 a.p.stdin.write(`BEGIN; SET ROLE synthetic_atomic_caller; SELECT kts_team.atomic_draft_v1(${proof('race_event','race_key','7'.repeat(32))});\n\\echo MUTATION_LOCKED\n`);
 await waitFor(()=>a.out.includes('MUTATION_LOCKED')||a.done,'MUTATION');if(a.done)throw Error('RACE_MUTATION_EXIT '+a.err.slice(-500));
 b.p.stdin.write("UPDATE kts_auth.sessions SET revoked_at=clock_timestamp() WHERE session_hash=repeat('a',64);\n\\echo LOGOUT_DONE\n");
 let blocked=false;for(let i=0;i<60;i++){const n=query("SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='kts_race_logout' AND cardinality(pg_catalog.pg_blocking_pids(pid))>0");if(n==='1'){blocked=true;break}if(b.done||b.out.includes('LOGOUT_DONE'))break;await delay(50)}
 if(!blocked)throw Error('RACE_NO_OBSERVED_PG_BLOCKER');
 a.p.stdin.end('COMMIT;\n\\q\n');await waitFor(()=>a.done,'COMMIT');if(a.code!==0)throw Error('RACE_COMMIT_FAILED '+a.err.slice(-500));
 await waitFor(()=>b.out.includes('LOGOUT_DONE')||b.done,'LOGOUT');if(b.done&&!b.out.includes('LOGOUT_DONE'))throw Error('RACE_LOGOUT_FAILED '+b.err.slice(-500));b.p.stdin.end('\\q\n');await waitFor(()=>b.done,'LOGOUT_EXIT');if(b.code!==0)throw Error('RACE_LOGOUT_EXIT');
 const evidence=query("SELECT (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a' AND event_id='race_event' AND actor_user_id='user_1')::text||':'||(SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a' AND idempotency_key='race_key')::text||':'||(SELECT (revoked_at IS NOT NULL)::text FROM kts_auth.sessions WHERE session_hash=repeat('a',64))");
 if(evidence!=='1:1:true')throw Error('RACE_FINAL_STATE_'+evidence);
 console.log('SYNTHETIC_CONCURRENT_LOGOUT_BLOCKED_THEN_COMMITTED_PASS blocker_observed=true final='+evidence);
 query("UPDATE kts_auth.sessions SET revoked_at=NULL WHERE session_hash=repeat('a',64)");
 a=worker('kts_race_mutation_reverse');b=worker('kts_race_logout_reverse');
 b.p.stdin.write("BEGIN; UPDATE kts_auth.sessions SET revoked_at=clock_timestamp() WHERE session_hash=repeat('a',64);\n\\echo LOGOUT_LOCKED\n");
 await waitFor(()=>b.out.includes('LOGOUT_LOCKED')||b.done,'REVERSE_LOGOUT');if(b.done)throw Error('REVERSE_LOGOUT_EXIT '+b.err.slice(-500));
 a.p.stdin.write(`BEGIN; SET ROLE synthetic_atomic_caller; SELECT kts_team.atomic_draft_v1(${proof('reverse_event','reverse_key','8'.repeat(32),3)});\n\\echo UNEXPECTED_WRITE\n`);
 blocked=false;for(let i=0;i<60;i++){const n=query("SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='kts_race_mutation_reverse' AND cardinality(pg_catalog.pg_blocking_pids(pid))>0");if(n==='1'){blocked=true;break}if(a.done||a.out.includes('UNEXPECTED_WRITE'))break;await delay(50)}
 if(!blocked)throw Error('REVERSE_NO_OBSERVED_PG_BLOCKER');
 b.p.stdin.end('COMMIT;\n\\q\n');await waitFor(()=>b.done,'REVERSE_LOGOUT_COMMIT');if(b.code!==0)throw Error('REVERSE_LOGOUT_COMMIT_FAILED '+b.err.slice(-500));
 await waitFor(()=>a.done,'REVERSE_DENIAL');if(a.code===0||!a.err.includes('TEAM_ATOMIC_SESSION_INVALID')||a.out.includes('UNEXPECTED_WRITE'))throw Error('REVERSE_NOT_DENIED '+a.err.slice(-500));
 const reverse=query("SELECT (SELECT count(*) FROM kts_team.scope_events WHERE event_id='reverse_event')::text||':'||(SELECT count(*) FROM kts_team.idempotency_receipts WHERE idempotency_key='reverse_key')::text||':'||(SELECT (revoked_at IS NOT NULL)::text FROM kts_auth.sessions WHERE session_hash=repeat('a',64))");
 if(reverse!=='0:0:true')throw Error('REVERSE_FINAL_STATE_'+reverse);
 console.log('SYNTHETIC_CONCURRENT_LOGOUT_FIRST_DENIES_WRITE_PASS blocker_observed=true final='+reverse);
 }finally{for(const w of [a,b])if(w&&!w.done){w.p.stdin.end();w.p.kill()}}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
