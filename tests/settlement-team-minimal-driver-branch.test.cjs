'use strict';
// Executes the unchanged driver's workflow statements with disposable UI and
// SQL dependencies. This is offline control-flow evidence, not Android or SQL.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const driver='C:\\KTS-Settlement\\w20-2d63c84e\\android-chrome-cdp-workflow.cjs';
const source=fs.readFileSync(driver,'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
assert.equal(hash(source),'D76ADFAD82EBEC984187751FD963FD0F784CD303A8E1C3C008110FD7FC286F34');
const startMarker="    await login(credentials.operator,credentials.password,credentials.workspace_id,'operator');";
const endMarker="     const receipt={status:'PASS',mode:mode==='fixture'";
const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
assert.ok(start>=0&&end>start&&source.indexOf(startMarker,start+1)===-1,'driver workflow boundaries ambiguous');
const executable='(async()=>{let draftId=null,localEvidence=null;\n'+source.slice(start,end)+'\nreturn {draftId,localEvidence};})()';

async function exercise(failStage){
  const trace=[],items=[],files=new Map();
  const credentials={workspace_id:'fake_groupa_contract',operator:'fake_operator_contract',reviewer:'fake_reviewer_contract',password:'fixture-only'};
  const partner='fake_customer_contract',draftId='draft_0123456789abcdef0123456789abcdef';
  const local={id:draftId,status:'PENDING',workspace_id:credentials.workspace_id,account_id:credentials.operator,scope:{partner_id:partner,business_date:'2026-10-26',region:'mn'},payload:{synthetic:true,demo_message:'TEAM_PILOT_FAKE_DATA_ONLY'}};
  const evidence='C:\\offline-fixture\\android-ui';
  const ctx={mode:'live',minimalRlsLogout:true,credentials,evidence,evidenceItems:items,path,
    login:async(_u,_p,_w,who)=>{trace.push('login:'+who);},chooseScope:async()=>partner,
    clickVisible:async id=>{trace.push('click:'+id);},waitFor:async(_expression,code)=>{trace.push('wait:'+code);if(failStage===code)throw Error(code);},
    ui:async name=>({path:name,sha256:'fixture'}),screenshot:async name=>({path:name,sha256:'fixture'}),
    evalExpr:async()=>local,atomicJson:(file,value)=>files.set(file,JSON.stringify(value)),sha256:file=>hash(files.get(file)),
    sqlStage:async name=>{trace.push('sql:'+name);if(failStage===name)throw Error('FIXTURE_'+name);},
    sleep:async()=>{},call:async name=>{trace.push('cdp:'+name);},
    reloadAndRelogin:async()=>{trace.push('unexpected:reload');},expectWorkspaceDenied:async()=>{trace.push('unexpected:prior-qa');}
  };
  let error=null,result=null;try{result=await vm.runInNewContext(executable,ctx,{timeout:1000});}catch(e){error=e.message;}
  return {trace,items,result,error,files};
}
test('actual minimal workflow reaches RLS and observes the same logout boundary',async()=>{
  const r=await exercise();assert.equal(r.error,null);assert.equal(r.result.draftId,'draft_0123456789abcdef0123456789abcdef');
  const sql=r.trace.filter(x=>x.startsWith('sql:'));
  assert.deepEqual(sql,['sql:LOCAL_PENDING','sql:SYNC_COMMITTED','sql:SUBMITTED','sql:REVIEWED','sql:CROSS_WORKSPACE_RLS','sql:REVIEWER_SESSION_BEFORE_LOGOUT','sql:REVIEWER_SESSION_AFTER_LOGOUT']);
  const before=r.trace.indexOf('sql:REVIEWER_SESSION_BEFORE_LOGOUT'),after=r.trace.indexOf('sql:REVIEWER_SESSION_AFTER_LOGOUT');
  assert.ok(before<r.trace.lastIndexOf('click:team-logout')&&r.trace.lastIndexOf('click:team-logout')<r.trace.indexOf('wait:ANDROID_FINAL_LOGOUT_TIMEOUT')&&r.trace.indexOf('wait:ANDROID_FINAL_LOGOUT_TIMEOUT')<after);
  assert.equal(r.trace.filter(x=>x==='click:team-create').length,1);assert.equal(r.trace.filter(x=>x==='click:team-submit-review').length,1);assert.equal(r.trace.filter(x=>x==='click:team-approve-review').length,1);
  assert.ok(!r.trace.some(x=>x.startsWith('unexpected:')||x.startsWith('cdp:')));
  assert.ok([...r.files.values()].some(x=>JSON.parse(x).draft.id===r.result.draftId));
});
test('RLS failure stops before logout proof or success',async()=>{
  const r=await exercise('CROSS_WORKSPACE_RLS');assert.equal(r.error,'FIXTURE_CROSS_WORKSPACE_RLS');assert.ok(!r.trace.includes('sql:REVIEWER_SESSION_BEFORE_LOGOUT'));assert.ok(!r.trace.includes('sql:REVIEWER_SESSION_AFTER_LOGOUT'));
});
test('missing Android logout acknowledgement prevents after-logout SQL claim',async()=>{
  const r=await exercise('ANDROID_FINAL_LOGOUT_TIMEOUT');assert.equal(r.error,'ANDROID_FINAL_LOGOUT_TIMEOUT');assert.ok(r.trace.includes('sql:REVIEWER_SESSION_BEFORE_LOGOUT'));assert.ok(!r.trace.includes('sql:REVIEWER_SESSION_AFTER_LOGOUT'));
});
test('failed logout revocation observation cannot finish the workflow',async()=>{
  const r=await exercise('REVIEWER_SESSION_AFTER_LOGOUT');assert.equal(r.error,'FIXTURE_REVIEWER_SESSION_AFTER_LOGOUT');assert.equal(r.result,null);assert.ok(r.trace.includes('wait:ANDROID_FINAL_LOGOUT_TIMEOUT'));
});
