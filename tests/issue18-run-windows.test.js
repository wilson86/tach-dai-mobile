'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseArgs,cOnly,run}=require('../scripts/issue18-run-windows.js');
test('default workspace and evidence are separate C: directories',()=>{
  assert.deepEqual(parseArgs([]),{'--workspace':'C:\\KTS-QA\\issue18-review','--evidence':'C:\\KTS-QA\\issue18-evidence'});
});
test('rejects duplicate, unknown and partial CLI overrides',()=>{
  assert.throws(()=>parseArgs(['--workspace','C:\\QA']),/USAGE/);
  assert.throws(()=>parseArgs(['--workspace','C:\\A','--workspace','C:\\B']),/USAGE/);
  assert.throws(()=>parseArgs(['--workspace','C:\\A','--unknown','C:\\B']),/USAGE/);
});
test('non-Windows runs cannot touch any checkout or evidence folder',()=>{
  if(process.platform!=='win32'){
    assert.throws(()=>cOnly('C:\\KTS-QA'),/C_ONLY/);
    assert.throws(()=>run([]),/C_ONLY/);
  }
});
