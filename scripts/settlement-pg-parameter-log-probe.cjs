'use strict';
// Controlled extended-protocol logging observation; synthetic markers only.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const [psql,port,cwd]=process.argv.slice(2);
if(!/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql)||!/^\d{2,5}$/.test(port)||!/^C:\\KTS-Settlement\\PG_SYNTHETIC_/i.test(cwd)||process.env.PGHOST!=='127.0.0.1')throw Error('LOG_PROBE_SCOPE_DENIED');
const log=path.join(cwd,'server.log');
function run(mode,marker){
 const start=fs.statSync(log).size;
 const input=`SET log_min_error_statement=error; SET log_parameter_max_length_on_error=${mode};\nSELECT $1::text, 1 / (length($1::text)-length($1::text))\n\\bind '${marker}'\n\\g\n`;
 const r=cp.spawnSync(psql,['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','qa_admin','-d','postgres'],{cwd,env:process.env,input,encoding:'utf8',timeout:10000,windowsHide:true});
 if(r.error||r.status===0||!String(r.stderr).includes('division by zero'))throw Error('LOG_PROBE_EXPECTED_ERROR_MISSING');
 const content=fs.readFileSync(log).subarray(start).toString('utf8');
 return {exit:r.status,marker_logged:content.includes(marker),statement_logged:content.includes('SELECT $1::text')};
}
const disabled=run(0,'SYNTHETIC_DISABLED_PARAMETER_6C329E');
const enabled=run(128,'SYNTHETIC_ENABLED_PARAMETER_81B740');
if(!disabled.statement_logged||disabled.marker_logged||!enabled.statement_logged||!enabled.marker_logged)throw Error('LOG_PROBE_OBSERVATION_MISMATCH '+JSON.stringify({disabled,enabled}));
console.log('SYNTHETIC_EXTENDED_PROTOCOL_ERROR_LOG_OBSERVATION_PASS '+JSON.stringify({disabled,enabled}));
