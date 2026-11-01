'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {auditWindowsLedgerRole}=require('../team-settlement/windows-ledger-grant-psql.cjs');
const input={psql:'C:\\fixture\\psql.exe',database:'l20_db_a1',role:'l20_led_a1',password:'fixture-secret'};
const row={role:input.role,superuser:false,bypass_rls:false,scope_insert:true,scope_update:true,scope_delete:false,scope_truncate:false,scope_any_column_insert:true,scope_any_column_update:true,state_update:true,revision_update:true,reviewed_by_update:true,submitted_by_update:true,locked_at_update:true};
test('uses restricted role, loopback and classifies direct grants',async()=>{
  const output=await auditWindowsLedgerRole({...input,execute:(exe,args,options)=>{
    assert.equal(exe,input.psql);assert.equal(args[args.indexOf('-U')+1],input.role);assert.equal(args[args.indexOf('-h')+1],'127.0.0.1');assert.ok(!args.includes(input.password));assert.equal(options.env.PGPASSWORD,input.password);assert.ok(options.timeout<=30000);
    return {status:0,stdout:JSON.stringify(row)+'\n',stderr:'synthetic diagnostic'};
  }});
  assert.equal(output.status,'BLOCKED_DIRECT_SCOPE_MUTATION');assert.ok(!JSON.stringify(output).includes(input.password));
});
test('nonzero, timeout, bad rows and foreign role fail closed',async()=>{
  for(const result of [{status:1,stdout:'',stderr:input.password},{error:{code:'ETIMEDOUT'}},{status:0,stdout:'{}\n{}\n'},{status:0,stdout:JSON.stringify({...row,role:'other'})}])
    await assert.rejects(auditWindowsLedgerRole({...input,execute:()=>result}),e=>!e.message.includes(input.password));
});
