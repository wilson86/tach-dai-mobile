'use strict';
// Fail-closed CLI validation; no git, browser, workflow, production or network.
const test=require('node:test');
const assert=require('node:assert/strict');
const {argsOf,admission,KTS_PYTESTS,KTS_JS_TESTS,KTS_LEDGER_TEST,MOBILE_TESTS,NGANG_TESTS,safeFile}=require('../scripts/issue18-production-preflight.js');
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

test('release admission includes all audited regression tests but excludes live published fetch',()=>{
  assert.equal(MOBILE_TESTS.length,27);
  assert.equal(NGANG_TESTS.length,15);
  for(const tests of [MOBILE_TESTS,NGANG_TESTS]){
    assert.equal(new Set(tests).size,tests.length,'no duplicate execution');
    assert.ok(Object.isFrozen(tests),'audited test list cannot be changed at runtime');
    assert.ok(tests.every(item=>/^tests\/[a-z0-9.-]+\.js$/.test(item)));
    assert.ok(!tests.some(item=>item.includes('verify-published-artifact')),
      'external published endpoint must never be fetched by local preflight');
  }
  assert.ok(MOBILE_TESTS.includes('tests/issue18-run-windows.test.js'));
  assert.ok(MOBILE_TESTS.includes('tests/issue18-canonical-byte-guard.test.js'));
  assert.ok(!NGANG_TESTS.includes('tests/issue18-canonical-byte-guard.test.js'));
  assert.ok(!NGANG_TESTS.includes('tests/issue18-run-windows.test.js'),
    'Windows admission runner belongs only to Mobile checkout');
  for(const required of ['tests/source-output-cut-conservation.js',
    'tests/ledger-readable-working-ui.js','tests/source-copy-cut-actions.js']){
    assert.ok(MOBILE_TESTS.includes(required));
    assert.ok(NGANG_TESTS.includes(required));
  }
});

test('cross-surface JS admission is mandatory for N035 money and Cut/Undo ledger',()=>{
  assert.deepEqual([...KTS_JS_TESTS],[
    'KTSRouter/tests/test_n035_mode_specific_oracle.js',
    'KTSRouter/tests/test_duplicate_approval_ui_parity.js',
    'KTSRouter/tests/test_duplicate_cut_origin.js'
  ]);
  assert.equal(KTS_LEDGER_TEST,'KTSRouter/tests/test_legacy_ledger_retention.js');
  assert.ok(Object.isFrozen(KTS_JS_TESTS),'cross-surface test gate must remain immutable');
  assert.equal(new Set(KTS_JS_TESTS).size,KTS_JS_TESTS.length);
  assert.ok(KTS_JS_TESTS.every(p=>/^KTSRouter\/tests\/test_[a-z0-9_]+\.js$/.test(p)));
  assert.ok(!KTS_JS_TESTS.some(p=>/http|published|production|network/i.test(p)),
    'no live endpoint or transport test in offline admission');
});

test('safeFile admits a regular resolved test source without writing to disk',()=>{
  const path=require('node:path');
  const base=path.join(process.cwd(),'synthetic-source-root');
  const mock={
    existsSync:()=>true,
    lstatSync:()=>({isSymbolicLink:()=>false}),
    statSync:()=>({isFile:()=>true}),
    realpathSync:{native:p=>p}
  };
  assert.equal(safeFile(base,'tests/issue18-run-windows.test.js',mock),
    path.join(base,'tests/issue18-run-windows.test.js'));
});

test('safeFile refuses missing files, symlinks and parent junction traversal',()=>{
  const path=require('node:path');
  const base=path.join(process.cwd(),'synthetic-source-root');
  const clean={
    existsSync:()=>true,
    lstatSync:()=>({isSymbolicLink:()=>false}),
    statSync:()=>({isFile:()=>true}),
    realpathSync:{native:p=>p}
  };
  const target='tests/issue18-run-windows.test.js';
  assert.throws(()=>safeFile(base,target,{...clean,existsSync:()=>false}),/regular non-junction file/);
  assert.throws(()=>safeFile(base,target,{...clean,lstatSync:()=>({isSymbolicLink:()=>true})}),/regular non-junction file/);
  assert.throws(()=>safeFile(base,target,{...clean,realpathSync:{native:()=>path.join(base,'elsewhere',target)}}),
    /regular non-junction file/);
  assert.throws(()=>safeFile(base,target,{...clean,realpathSync:{native:()=> 'E:\\\\private-data\\\\'+target}}),
    /regular non-junction file/);
});

test('Router and Desktop N035 tests are offline source-bound only',()=>{
  assert.deepEqual([...KTS_PYTESTS],[
    'KTSRouter/tests/test_n035_router_no_send.py',
    'KTSRouter/tests/test_n035_desktop_oracle.py'
  ]);
  assert.ok(Object.isFrozen(KTS_PYTESTS));
  assert.ok(KTS_PYTESTS.every(path=>/^KTSRouter\/tests\/test_n035_[a-z_]+\.py$/.test(path)));
});
