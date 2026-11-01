'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {auditLedgerScopeGrants}=require('./ledger-scope-grant-audit.cjs');

// The password is supplied only through the child environment. Neither psql
// output nor failure diagnostics are exposed until parsed and classified.
async function auditWindowsLedgerRole({psql, database, role, password, timeoutMs=10000, execute=spawnSync}={}){
  if(!path.win32.isAbsolute(psql||'')||!/^l20_db_[a-f0-9]{1,32}$/.test(database||'')||
     !/^l20_led_[a-f0-9]{1,32}$/.test(role||'')||typeof password!=='string'||!password||
     !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000||typeof execute!=='function')throw Error('WINDOWS_LEDGER_AUDIT_CONFIG_INVALID');
  return auditLedgerScopeGrants({syntheticOnly:true,expectedRole:role,query:async sql=>{
    const args=['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55434','-U',role,'-d',database,'-c',`SELECT row_to_json(a)::text FROM (${sql}) AS a`];
    const result=execute(psql,args,{encoding:'utf8',windowsHide:true,timeout:timeoutMs,maxBuffer:65536,env:{...process.env,PGPASSWORD:password}});
    if(result.error||result.status!==0||typeof result.stdout!=='string')throw Error('PSQL_UNVERIFIED');
    const lines=result.stdout.split(/\r?\n/).filter(x=>x.trim());
    if(lines.length!==1)throw Error('PSQL_ROW_COUNT_INVALID');
    return {rows:[JSON.parse(lines[0])]};
  }});
}
module.exports=Object.freeze({auditWindowsLedgerRole});
