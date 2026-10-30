'use strict';
// Issue #18: operator-invoked, read-only local admission. No production or network.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');

const EXPECTED_VERSIONS=Object.freeze({mobile:'2.0.38',ngang:'1.0.37',unified:'1.0.27'});
// Explicit allowlists, audited for no network, production writes or paid runner.
// The Ngang published-artifact verifier is intentionally EXCLUDED (live fetch).
const KTS_PYTESTS=Object.freeze([
  'KTSRouter/tests/test_n035_router_no_send.py',
  'KTSRouter/tests/test_n035_desktop_oracle.py'
]);
// Cross-surface JavaScript oracle: a Python PASS alone cannot qualify PWA
// money, single-number DX, Cut/reload or saved ledger behavior.
// These tests consume ONLY the three checked-out Git source trees.
const KTS_JS_TESTS=Object.freeze([
  'KTSRouter/tests/test_n035_mode_specific_oracle.js',
  'KTSRouter/tests/test_duplicate_approval_ui_parity.js',
  'KTSRouter/tests/test_duplicate_cut_origin.js'
]);
const KTS_LEDGER_TEST='KTSRouter/tests/test_legacy_ledger_retention.js';
const MOBILE_TESTS=Object.freeze([
  'tests/davong-checkbox-ui-parity.js',
  'tests/davong-source-line-cut-provenance.js',
  'tests/duplicate-selector-tests.js',
  'tests/grouped-checkbox-results.js',
  'tests/issue18-build-local-stage.test.js',
  'tests/issue18-git-source-pin.test.js',
  'tests/issue18-production-preflight.test.js',
  'tests/issue18-run-windows.test.js',
  'tests/issue18-verify-stage.test.js',
  'tests/ledger-app-identity-isolation.js',
  'tests/ledger-readable-working-ui.js',
  'tests/mb-leading-dot-chat-envelope.js',
  'tests/mb-leading-dot-davong-parity.js',
  'tests/realtime-arbitrary-row-cut.contract.js',
  'tests/regression-tests.js',
  'tests/release-review-asset-consistency.js',
  'tests/semantic-number-group-checkbox.js',
  'tests/source-copy-cut-actions.js',
  'tests/source-output-cut-conservation.js',
  'tests/source-pane-after-result-cut.js',
  'tests/unified-child-select-all-dedup.js',
  'tests/unified-ledger-mode-local-cross-frame.js',
  'tests/unified-offline-engine-cache.js',
  'tests/unified-separator-regression.js',
  'tests/unified-static-tests.js',
  'tests/unified-versioned-ux-cache.js'
]);
const NGANG_TESTS=Object.freeze([
  'tests/duplicate-selector-tests.js',
  'tests/dx-number-pair-operator-oracle.js',
  'tests/grouped-checkbox-results.js',
  'tests/issue18-sw-cache-isolation.test.js',
  'tests/ledger-app-identity-isolation.js',
  'tests/ledger-readable-working-ui.js',
  'tests/mb-leading-dot-chat-envelope.js',
  'tests/ngang-money-boundary-matrix.js',
  'tests/realtime-arbitrary-row-cut.contract.js',
  'tests/regression-tests.js',
  'tests/release-review-asset-consistency.js',
  'tests/semantic-number-group-checkbox.js',
  'tests/source-copy-cut-actions.js',
  'tests/source-output-cut-conservation.js',
  'tests/source-pane-after-result-cut.js'
]);
const ISSUE18_ENGINE='7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea';
function block(code,detail){const error=new Error(String(detail||code));error.code=code;throw error;}
function argsOf(words){
  const wanted=['--workspace','--kts-sha','--mobile-sha','--ngang-sha'];
  if(words.length!==8)block('USAGE','Provide --workspace ABS_C_PATH and all three exact GitHub commit SHAs.');
  const args=Object.create(null);
  for(let i=0;i<words.length;i+=2){
    if(!wanted.includes(words[i])||!words[i+1]||Object.hasOwn(args,words[i]))
      block('USAGE','Unknown, duplicate or empty argument '+words[i]);
    args[words[i]]=words[i+1];
  }
  if(wanted.some(key=>!args[key]))block('USAGE','Missing a required parameter');
  for(const k of wanted.slice(1))if(!/^[a-f0-9]{40}$/.test(args[k]))block('USAGE','Invalid commit SHA for '+k);
  return args;
}
function verifyWindowsWorkspace(raw){
  if(process.platform!=='win32')block('WINDOWS_REQUIRED','Run on authorized Windows C: test host, not a cloud runner.');
  if(!path.win32.isAbsolute(raw)||!/^c:\\/i.test(raw))block('C_ONLY','Workspace must be an absolute C: path.');
  const full=path.win32.resolve(raw);
  if(!fs.existsSync(full)||fs.lstatSync(full).isSymbolicLink())block('WORKSPACE_MISSING','Clean C: workspace not found or symlink.');
  const real=fs.realpathSync.native(full);
  if(path.win32.normalize(real).toLowerCase()!==path.win32.normalize(full).toLowerCase())
    block('JUNCTION_REFUSED','Workspace resolves through a junction/symlink.');
  return full;
}
function verifyFolder(root,folder){
  const p=path.join(root,folder);
  if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink())block('MISSING_REPO',folder);
  const real=fs.realpathSync.native(p);
  if(path.win32.normalize(real).toLowerCase()!==path.win32.normalize(p).toLowerCase())
    block('JUNCTION_REFUSED',folder);
  return p;
}
function processReadOnly(binary,argv,cwd,timeout=120000){
  const r=cp.spawnSync(binary,argv,{cwd,encoding:'utf8',shell:false,windowsHide:true,timeout,
    maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PIP_NO_INDEX:'1',PYTEST_DISABLE_PLUGIN_AUTOLOAD:'1',PYTEST_ADDOPTS:'',GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}});
  return {exitCode:r.status,signal:r.signal||null,error:r.error?String(r.error.message):null,
    stdout:String(r.stdout||'').slice(-5000),stderr:String(r.stderr||'').slice(-5000)};
}
function verifiedRepo(dir,expectedSha){
  // Disallow linked Git worktrees or .git indirections pointing to E:/F:.
  // A fresh isolated clone on C: has a normal local .git directory.
  const gitdir=path.join(dir,'.git');
  if(!fs.existsSync(gitdir)||!fs.lstatSync(gitdir).isDirectory()||
     fs.lstatSync(gitdir).isSymbolicLink()||
     path.win32.normalize(fs.realpathSync.native(gitdir)).toLowerCase()!==
       path.win32.normalize(gitdir).toLowerCase())
    block('LINKED_GIT_REFUSED','Use a normal clean clone with .git on C:, not a linked worktree.');
  const root=processReadOnly('git',['rev-parse','--show-toplevel'],dir);
  if(root.exitCode!==0||!root.stdout.trim())block('GIT_ROOT_UNAVAILABLE',dir);
  if(path.win32.normalize(root.stdout.trim()).toLowerCase()!==path.win32.normalize(dir).toLowerCase())
    block('NESTED_OR_WRONG_REPO',dir);
  const head=processReadOnly('git',['rev-parse','HEAD'],dir);
  if(head.exitCode!==0||head.stdout.trim()!==expectedSha)
    block('SOURCE_DRIFT',dir+' expected '+expectedSha+' actual '+head.stdout.trim());
  const dirty=processReadOnly('git',['status','--porcelain','--untracked-files=all'],dir);
  if(dirty.exitCode!==0||dirty.stdout.trim())block('DIRTY_SOURCE',dir+' contains local changes or unknown files');
}
function safeFile(root,relative){
  const file=path.join(root,relative);
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||
     path.win32.normalize(fs.realpathSync.native(file)).toLowerCase()!==
       path.win32.normalize(file).toLowerCase())
    block('UNSAFE_SOURCE_FILE',relative+' must be a regular non-junction file in the pinned checkout');
  return file;
}
function jsonAt(folder,filename){return JSON.parse(fs.readFileSync(safeFile(folder,filename),'utf8'));}
function admission(options,runCommand=processReadOnly){
  const root=verifyWindowsWorkspace(options['--workspace']);
  // Fixture scripts may create disposable files under os.tmpdir(). Do not
  // permit that side effect on E:/F:, junctions, or an unknown temp drive.
  const temp=os.tmpdir();
  if(!path.win32.isAbsolute(temp)||!/^c:\\/i.test(temp)||
     !fs.existsSync(temp)||fs.lstatSync(temp).isSymbolicLink()||
     path.win32.normalize(fs.realpathSync.native(temp)).toLowerCase()!==
       path.win32.normalize(temp).toLowerCase())
    block('TEMP_NOT_C_ONLY','Node fixture temp directory must resolve directly to C:.');
  const dirs={kts:verifyFolder(root,'KTS'),mobile:verifyFolder(root,'Mobile'),ngang:verifyFolder(root,'Ngang')};
  verifiedRepo(dirs.kts,options['--kts-sha']);
  verifiedRepo(dirs.mobile,options['--mobile-sha']);
  verifiedRepo(dirs.ngang,options['--ngang-sha']);
  const m=jsonAt(dirs.mobile,'version.json'),n=jsonAt(dirs.ngang,'version.json'),
    u=jsonAt(dirs.mobile,'app/version.json');
  if(m.version!==EXPECTED_VERSIONS.mobile||n.version!==EXPECTED_VERSIONS.ngang||
     u.version!==EXPECTED_VERSIONS.unified)
    block('VERSION_DRIFT','Candidate Mobile/Ngang/Unified version mismatch');
  if([m,n,u].some(v=>v.business_engine_sha256!==ISSUE18_ENGINE))
    block('ENGINE_DRIFT','One or more candidate engine SHA fields mismatch');
  const result={schema:'KTS_ISSUE18_LOCAL_ADMISSION_V1',source:{
    kts:options['--kts-sha'],mobile:options['--mobile-sha'],ngang:options['--ngang-sha']
  },versions:EXPECTED_VERSIONS,engine:ISSUE18_ENGINE,checks:[],chrome:'NOT_RUN',
    android:'NOT_RUN',production:'UNMODIFIED',release:'NO_GO',cost_usd:0};
  const py=runCommand('python',['-B','KTSRouter/scripts/build_shared_business_engine.py','--check',
    '--workspace-root',root],dirs.kts,180000);
  result.checks.push({name:'CANONICAL_GENERATOR_CHECK',...py});
  if(py.exitCode!==0||py.error){result.status='BLOCKED_GENERATOR';return result;}
  // Approved offline N035 Router/SQLite no-send and Desktop station-scope oracle.
  // Do not run historical scripts with hard-coded E: HTML paths, live runtime,
  // networked published checks, or external pytest plugins.
  for(const file of KTS_PYTESTS){
    const target=path.join(dirs.kts,file);
    if(!fs.existsSync(target)||fs.lstatSync(target).isSymbolicLink())
      block('MISSING_TEST','KTS/'+file);
  }
  const kts=runCommand('python',['-B','-m','pytest','-q','-p','no:cacheprovider',
    ...KTS_PYTESTS],dirs.kts,180000);
  result.checks.push({name:'KTS_N035_ROUTER_SQLITE_AND_DESKTOP_OFFLINE',...kts});
  if(kts.exitCode!==0||kts.error){result.status='BLOCKED_KTS_OFFLINE';return result;}
  // Run genuine generated-PWA and Unified entrypoints from the pinned three
  // checkout tree; each test is synthetic and non-transporting.
  for(const file of KTS_JS_TESTS){
    safeFile(dirs.kts,file);
    const r=runCommand(process.execPath,[file],dirs.kts,120000);
    result.checks.push({name:'KTS_JS_CROSS_SURFACE/'+file,...r});
    if(r.exitCode!==0||r.error||r.signal){
      result.status='BLOCKED_KTS_JS_PARITY';return result;
    }
  }
  // Legacy ledger rollback is an explicit operator safety criterion.
  // Two positional HTML paths are required by this existing isolated test.
  safeFile(dirs.kts,KTS_LEDGER_TEST);
  const mobileHtml=safeFile(dirs.mobile,'index.html');
  const ngangHtml=safeFile(dirs.ngang,'index.html');
  const ledger=runCommand(process.execPath,[KTS_LEDGER_TEST,mobileHtml,ngangHtml],dirs.kts,120000);
  result.checks.push({name:'KTS_JS_LEGACY_LEDGER_RETENTION',...ledger});
  if(ledger.exitCode!==0||ledger.error||ledger.signal){
    result.status='BLOCKED_KTS_LEDGER';return result;
  }
  for(const [name,dir,tests] of [
    ['MOBILE',dirs.mobile,MOBILE_TESTS],['NGANG',dirs.ngang,NGANG_TESTS]
  ])for(const test of tests){
    const actual=path.join(dir,test);
    if(!fs.existsSync(actual)||fs.lstatSync(actual).isSymbolicLink())
      block('MISSING_TEST',name+'/'+test);
    const r=runCommand(process.execPath,[test],dir,90000);
    result.checks.push({name:name+'/'+test,...r});
    if(r.exitCode!==0||r.error){result.status='BLOCKED_FOCUSED_TEST';return result;}
  }
  // Detect source races, test-induced writes, or replacement after the initial
  // SHA gate. No PASS if exact checked source was changed during admission.
  try {
    verifiedRepo(dirs.kts,options['--kts-sha']);
    verifiedRepo(dirs.mobile,options['--mobile-sha']);
    verifiedRepo(dirs.ngang,options['--ngang-sha']);
    const latest=[jsonAt(dirs.mobile,'version.json'),jsonAt(dirs.ngang,'version.json'),
      jsonAt(dirs.mobile,'app/version.json')];
    if(latest[0].version!==m.version||latest[1].version!==n.version||
       latest[2].version!==u.version||
       latest.some(x=>x.business_engine_sha256!==ISSUE18_ENGINE))
      block('POSTFLIGHT_VERSION_DRIFT','Candidate version/engine changed during QA');
    result.checks.push({name:'FINAL_SOURCE_PINS',exitCode:0,
      stdout:'All 3 exact SHAs, clean checkouts, and version/engine identities preserved',
      stderr:'',error:null,signal:null});
  }catch(e){
    result.status='BLOCKED_POSTFLIGHT_DRIFT';
    result.checks.push({name:'FINAL_SOURCE_PINS',exitCode:2,
      stdout:'',stderr:String(e.message||e),error:e.code||'SOURCE_DRIFT',signal:null});
    return result;
  }
  result.status='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING';
  return result;
}
if(require.main===module){
  try {
    const result=admission(argsOf(process.argv.slice(2)));
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING')process.exitCode=2;
  }catch(e){
    console.error(JSON.stringify({status:'BLOCKED_PREFLIGHT',code:e.code||'UNKNOWN',
      detail:String(e.message||e),cost_usd:0,release:'NO_GO'}));
    process.exitCode=2;
  }
}
module.exports={argsOf,admission,KTS_PYTESTS,KTS_JS_TESTS,KTS_LEDGER_TEST,MOBILE_TESTS,NGANG_TESTS};
