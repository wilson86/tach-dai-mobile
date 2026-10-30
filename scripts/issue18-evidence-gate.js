'use strict';
// Offline, read-only evidence interpreter. Never approves production.
const fs=require('node:fs'),path=require('node:path');
const KTS='eec80f812ff0ab47109edcacc32f31eedaffca79';
const NGANG='6f47f7c6b073c5df25da55b2b8f3bcc61513da20';
const ENGINE='7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
const MARKERS=['ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS','ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS','ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS','ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS','ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS'];
function required(profile){
 if(profile.KTS_PYTESTS?.length!==2||profile.KTS_JS_TESTS?.length!==3||profile.MOBILE_TESTS?.length<27||profile.NGANG_TESTS?.length<15)throw Error('ALLOWLIST_CHANGED');
 return ['CANONICAL_INPUT_RAW_BYTE_PINS','CANONICAL_GENERATOR_CHECK','KTS_N035_ROUTER_SQLITE_AND_DESKTOP_OFFLINE',
 ...profile.KTS_JS_TESTS.map(x=>'KTS_JS_CROSS_SURFACE/'+x),'KTS_JS_LEGACY_LEDGER_RETENTION',
 ...profile.MOBILE_TESTS.map(x=>'MOBILE/'+x),...profile.NGANG_TESTS.map(x=>'NGANG/'+x),'FINAL_SOURCE_PINS'];
}
function judge(e,mobile,profile,chrome=false){
 const errors=[];const block=s=>errors.push(s);
 const s=e?.source||{},p=e?.preflight||{},b=e?.browser||{};
 if(!/^[a-f0-9]{40}$/.test(mobile||''))block('EXACT_MOBILE_PIN_REQUIRED');
 if(e?.schema!=='KTS_ISSUE18_LOCAL_EVIDENCE_V1'||e.read_only_source!==true||e.release!=='NO_GO'||e.cost_usd!==0)block('RECEIPT_SAFETY');
 if(s.kts!==KTS||s.ngang!==NGANG||s.mobile!==mobile)block('PIN_DRIFT');
 if(p.schema!=='KTS_ISSUE18_LOCAL_ADMISSION_V1'||p.status!=='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING'||p.release!=='NO_GO'||p.cost_usd!==0||p.android!=='NOT_RUN'||p.production!=='UNMODIFIED')block('GATE_A');
 if(JSON.stringify(p.source)!==JSON.stringify(s))block('NESTED_SOURCE_DRIFT');
 if(p.engine!==ENGINE||p.versions?.mobile!=='2.0.38'||p.versions?.ngang!=='1.0.37'||p.versions?.unified!=='1.0.27')block('ENGINE_VERSION');
 let names=[];try{names=required(profile)}catch(err){block('ALLOWLIST_CHANGED')}
 const rows=Array.isArray(p.checks)?p.checks:[];
 if(rows.length!==names.length||rows.some((x,i)=>x?.name!==names[i]))block('MISSING_OR_REORDERED_CHECKS');
 rows.forEach((r,i)=>{if(i===0?r?.ok!==true:r?.exitCode!==0||r?.error!=null||r?.signal!=null)block('FAILED_CHECK_'+String(r?.name||i))});
 if(chrome){
  if(b.status!=='LOCAL_CHROME_PASS_ANDROID_PENDING')block('CHROME_NOT_PASS');
  const sr=b.stage_receipt||{};
  if(sr.status!=='STAGE_SOURCE_BYTES_PASS'||sr.checked_assets!==21||sr.release_authorized!==false||sr.source_commit_sha?.mobile!==mobile||sr.source_commit_sha?.ngang!==NGANG)block('STAGE_DRIFT');
  const lines=String(b.stdout||'').split(/\r?\n/);
  if(!MARKERS.every(m=>lines.some(l=>l===m||l.startsWith(m+' '))))block('CHROME_MARKERS_MISSING');
 }else if(!['NOT_RUN','LOCAL_CHROME_PASS_ANDROID_PENDING'].includes(b.status))block('CHROME_BLOCKED');
 return {schema:'KTS_ISSUE18_REVIEW_GATE_V1',status:errors.length?'BLOCKED':(chrome?'GATE_A_B_EVIDENCE_PRESENT':'GATE_A_EVIDENCE_PRESENT'),errors,checks_expected:names.length,checks_seen:rows.length,windows_visual:'NOT_RUN',android:'NOT_RUN',release:'NO_GO',cost_usd:0};
}
function cli(a=process.argv.slice(2)){
 if(![4,5].includes(a.length)||a[0]!=='--receipt'||a[2]!=='--mobile-sha'||(a.length===5&&a[4]!=='--chrome'))throw Error('USAGE');
 const f=path.win32.resolve(a[1]);
 if(process.platform!=='win32'||!/^C:\\/i.test(f)||!f.toLowerCase().endsWith('.json'))throw Error('WINDOWS_C_ONLY');
 if(fs.lstatSync(f).isSymbolicLink()||!fs.statSync(f).isFile()||fs.realpathSync.native(f).toLowerCase()!==f.toLowerCase()||fs.statSync(f).size>4*1024*1024)throw Error('UNSAFE_RECEIPT_FILE');
 const e=JSON.parse(fs.readFileSync(f,'utf8'));
 if(e.evidence_file?.toLowerCase()!==f.toLowerCase())throw Error('RECEIPT_PATH_DRIFT');
 return judge(e,a[3],require('./issue18-production-preflight.js'),a.length===5);
}
if(require.main===module){try{const v=cli();console.log(JSON.stringify(v));if(v.status==='BLOCKED')process.exitCode=2}catch(e){console.error(JSON.stringify({status:'BLOCKED',error:String(e.message),release:'NO_GO'}));process.exitCode=2}}
module.exports={required,judge,cli};
