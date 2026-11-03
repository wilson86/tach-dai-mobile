'use strict';
// Synthetic runner only: lose a COMMIT acknowledgement at a loopback proxy.
const cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
const {createDraftProof}=require('../team-settlement/candidate/atomic-draft-proof.cjs');
const [psql,port,cwd]=process.argv.slice(2);
if(!/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql)||!/^\d{2,5}$/.test(port)||!/^C:\\KTS-Settlement\\PG_SYNTHETIC_/i.test(cwd)||process.env.PGHOST!=='127.0.0.1'||process.env.PGSSLMODE!=='disable')throw Error('LOST_ACK_SCOPE_DENIED');
const base=['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1'];
const auth=['-U','qa_admin','-d','postgres'];
function query(sql){const r=cp.spawnSync(psql,[...base,'-p',port,...auth,'-c',sql],{cwd,env:process.env,encoding:'utf8',timeout:5000,windowsHide:true});if(r.error||r.status!==0)throw Error('LOST_ACK_QUERY_FAILED '+String(r.stderr||'').slice(-500));return String(r.stdout).trim()}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label){const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await delay(30)}throw Error('LOST_ACK_TIMEOUT_'+label)}
async function main(){let client,proxy;const sockets=[];let armed=false,dropped=false;try{
 const token='synthetic_token_'+('x'.repeat(32)),sessionHash=crypto.createHash('sha256').update(token).digest('hex');
 query(`INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at) VALUES('${sessionHash}','user_1','group_a',clock_timestamp(),clock_timestamp()+interval '10 minutes')`);
 const req={workspace_id:'group_a',partner_id:'customer_1',business_date:'2026-10-12',region:'mn',action:'edit_draft',expected_revision:3,event_id:'lost_event',idempotency_key:'lost_key',request_sha256:'e'.repeat(64),snapshot_text:'{"synthetic":true}'};
 const expires=Math.floor(Date.now()/1000)+50,write=createDraftProof(token,req,{nonce:'9'.repeat(32),expires});
 const lookup=createDraftProof(token,{...req,event_id:'lookup'},{nonce:'b'.repeat(32),expires,purpose:'lookup'});
 const args=`'${write.session_id}','${write.nonce}',${expires},'${write.proof}','group_a','customer_1','2026-10-12','mn','edit_draft',3,'lost_event','lost_key','${req.request_sha256}','${req.snapshot_text}'`;
 proxy=net.createServer(down=>{const up=net.connect(Number(port),'127.0.0.1');sockets.push(down,up);down.on('error',()=>{});up.on('error',()=>{});down.pipe(up);let buf=Buffer.alloc(0);up.on('data',chunk=>{if(!armed){down.write(chunk);return}buf=Buffer.concat([buf,chunk]);while(buf.length>=5){const len=buf.readUInt32BE(1),size=1+len;if(len<4||size>1024*1024)throw Error('LOST_ACK_PROTOCOL_INVALID');if(buf.length<size)break;const frame=buf.subarray(0,size);buf=buf.subarray(size);if(frame[0]===67&&frame.subarray(5).toString('utf8')==='COMMIT\0'){dropped=true;down.destroy();up.destroy();return}down.write(frame)}})});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
 const proxyPort=String(proxy.address().port);client=cp.spawn(psql,[...base,'-p',proxyPort,...auth],{cwd,env:process.env,windowsHide:true});let out='',err='',done=false,exit=null;client.stdout.on('data',x=>out+=x);client.stderr.on('data',x=>err+=x);client.on('exit',x=>{done=true;exit=x});
 client.stdin.write(`BEGIN; SET ROLE synthetic_atomic_caller; SELECT kts_team.atomic_draft_v1(${args});\n\\echo MUTATION_PENDING_COMMIT\n`);
 await waitFor(()=>out.includes('MUTATION_PENDING_COMMIT')||done,'MUTATION');if(done)throw Error('LOST_ACK_MUTATION_FAILED '+err.slice(-500));
 armed=true;client.stdin.end('COMMIT;\n\\q\n');await waitFor(()=>done,'CLIENT_EXIT');
 if(!dropped||exit===0)throw Error('LOST_ACK_NOT_OBSERVED');
 const evidence=query("SELECT (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a' AND event_id='lost_event' AND actor_user_id='user_1')::text||':'||(SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a' AND idempotency_key='lost_key')::text");
 if(evidence!=='1:1')throw Error('LOST_ACK_FINAL_STATE_'+evidence);
 const look=`'${lookup.session_id}','${lookup.nonce}',${expires},'${lookup.proof}','group_a','customer_1','2026-10-12','mn','edit_draft',3,'lost_key','${req.request_sha256}','${req.snapshot_text}'`;
 const result=JSON.parse(query(`SET ROLE synthetic_atomic_caller; SELECT kts_team.atomic_draft_reconcile_v1(${look})`));
 if(result.classification!=='MATCHED_SERVER_RECEIPT'||result.event_id!=='lost_event'||String(result.new_revision)!=='4')throw Error('LOST_ACK_RECONCILIATION_FAILED');
 console.log('SYNTHETIC_COMMIT_ACK_DROPPED_AND_RECEIPT_RECONCILED_PASS client_exit='+exit+' event_receipt='+evidence+' revision=4 node_sql_hmac=PASS');
 }finally{if(client&&client.exitCode===null){client.stdin.end();client.kill()}for(const s of sockets)s.destroy();if(proxy)await new Promise(r=>proxy.close(r))}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
