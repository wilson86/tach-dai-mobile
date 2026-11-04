'use strict';
// Read-only. Never executes npm, installs packages, loads pg, or connects to a DB.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const SCOPE='C:\\KTS-Settlement';
function fail(code){throw Error(code);}
function insideC(raw,{realpath=fs.realpathSync.native||fs.realpathSync}={}){
 if(typeof raw!=='string'||!path.win32.isAbsolute(raw)||
   !/^C:[\\/]/i.test(raw)||raw.startsWith('\\\\'))fail('PG_DRIVER_C_SCOPE_REQUIRED');
 const p=path.win32.normalize(realpath(path.win32.normalize(raw)));
 if(!p.toLowerCase().startsWith(SCOPE.toLowerCase()+'\\'))
   fail('PG_DRIVER_REPARSE_OR_OUTSIDE_PROJECT');
 return p;
}
function find({root,resolve=require.resolve,realpath}){
 const dir=insideC(root,{realpath});
 let entry;
 try{entry=resolve('pg',{paths:[dir]});}
 catch(e){
  if(e?.code==='MODULE_NOT_FOUND')return Object.freeze({
   status:'PG_MODULE_NOT_FOUND_IN_CHECKOUT',network:false,install:false,
   approval:'NOT_GRANTED',production_qualified:false});
  throw e;
 }
 const target=insideC(entry,{realpath});
 if(!target.toLowerCase().startsWith(dir.toLowerCase()+'\\'))
  fail('PG_DRIVER_OUTSIDE_APPROVED_CHECKOUT');
 let folder=path.win32.dirname(target);
 for(let n=0;n<9;n++){
  const pkg=path.win32.join(folder,'package.json');
  // lstat checks only the package.json link itself: never dereference a
  // symlink or junction into E:/F: before checking source provenance.
  let stat=null;
  try{stat=fs.lstatSync(pkg);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(stat){
   if(!stat.isFile()||stat.isSymbolicLink())fail('PG_DRIVER_PACKAGE_SYMLINK_UNREVIEWED');
   const p=JSON.parse(fs.readFileSync(pkg,'utf8'));
   if(p.name==='pg'){
    if(typeof p.version!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+/.test(p.version))
      fail('PG_DRIVER_VERSION_UNKNOWN');
    const hash=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    return Object.freeze({status:'PG_FOUND_REVIEW_REQUIRED',version:p.version,
      license:p.license||'UNKNOWN',entry_sha256:hash,
      transitive_dependencies:'NOT_REVIEWED',approval:'NOT_GRANTED',
      network:false,install:false,production_qualified:false});
   }
  }
  const up=path.win32.dirname(folder);
  if(up===folder||!up.toLowerCase().startsWith(dir.toLowerCase()+'\\'))break;
  folder=up;
 }
 fail('PG_DRIVER_METADATA_UNVERIFIED');
}
function main(argv=process.argv.slice(2)){
 if(process.platform!=='win32')fail('PG_DRIVER_WINDOWS_ONLY');
 if(argv.length!==2||argv[0]!=='--read-only'||
    !/^--expected-sha=[a-f0-9]{40}$/.test(argv[1]))fail('PG_DRIVER_SHA_REQUIRED');
 if(process.env.NODE_PATH)fail('PG_DRIVER_GLOBAL_NODE_PATH_UNREVIEWED');
 const dir=insideC(process.cwd());
 const git=(...args)=>cp.execFileSync('git',args,{
   cwd:dir,encoding:'utf8',timeout:10000,windowsHide:true}).trim();
 if(git('rev-parse','HEAD')!==argv[1].slice(15))fail('PG_DRIVER_HEAD_MISMATCH');
 if(git('status','--porcelain','--untracked-files=no'))
   fail('PG_DRIVER_TRACKED_TREE_DIRTY');
 const report=find({root:dir});
 process.stdout.write('PG_DRIVER_STATUS='+report.status+' '+JSON.stringify(report)+'\n');
 if(report.status!=='PG_FOUND_REVIEW_REQUIRED')process.exitCode=2;
}
if(require.main===module){
 try{main()}catch(e){process.stderr.write(String(e.message||'PG_DRIVER_BLOCKED')+'\n');process.exitCode=2;}
}
module.exports=Object.freeze({insideC,find});
