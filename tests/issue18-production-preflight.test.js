'use strict';
// Fail-closed CLI validation; no git, browser, workflow, production or network.
const test=require('node:test');
const assert=require('node:assert/strict');
const {argsOf,admission}=require('../scripts/issue18-production-preflight.js');
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
const good=['--workspace','C:\\KTS-QA\\issue18',
  '--kts-sha',a,'--mobile-sha',b,'--ngang-sha',c];
test('parses required SHA-pinned worktree arguments',()=>{
  const result=argsOf(good);
  assert.equal(result['--workspace'],'C:\\KTS-QA\\issue18');
  assert.equal(result['--kts-sha'],a);
  assert.equal(result['--ngang-sha'],c);
});
test('refuses missing SHA, malformed SHA, duplicated keys, extra options',()=>{
  assert.throws(()=>argsOf(good.slice(0,-2)),/Provide/);
  assert.throws(()=>argsOf(good.map(x=>x===b?'b'.repeat(39):x)),/Invalid commit SHA/);
  assert.throws(()=>argsOf([...good.slice(0,6),'--kts-sha',c]),/duplicate/i);
  assert.throws(()=>argsOf([...good.slice(0,6),'--unknown',c]),/Unknown/i);
});
test('E: drive is never admitted as a test workspace',()=>{
  const values={...argsOf(good),'--workspace':'E:\\production'};
  assert.throws(()=>admission(values),/Windows C: test host|absolute C: path/);
});
