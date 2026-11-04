'use strict';
// Git source identity for isolated Issue18 staging. Purely local/read-only.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');

function blocked(code,reason){
  const e=new Error('STAGING_BLOCKED ['+code+']: '+reason);
  e.code=code;
  throw e;
}
function readGit(dir,args){
  const result=cp.spawnSync('git',args,{
    cwd:dir,shell:false,encoding:'utf8',windowsHide:true,timeout:20000,
    maxBuffer:1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}
  });
  if(result.error||result.status!==0||result.signal)
    blocked('GIT_UNAVAILABLE','git '+args[0]+' failed: '+String(result.error?.message||result.stderr||result.signal||result.status).slice(0,240));
  return result.stdout.trim();
}
function verifyGitSource(root,expectedSha){
  if(!/^[a-f0-9]{40}$/.test(expectedSha||''))
    blocked('INVALID_SHA','Git SHA must be exact 40 lowercase hexadecimal characters');
  if(typeof root!=='string'||!path.isAbsolute(root)||!fs.existsSync(root))
    blocked('INVALID_ROOT','Git source must be an existing absolute directory');
  const resolved=path.resolve(root);
  if(fs.lstatSync(resolved).isSymbolicLink()||!fs.lstatSync(resolved).isDirectory()||
     fs.realpathSync(resolved)!==resolved)
    blocked('UNSAFE_ROOT','Git source root cannot be a symlink or junction');
  if(process.platform==='win32'&&!/^[cC]:\\/.test(resolved))
    blocked('C_ONLY','Git source must remain on C:');
  const dotgit=path.join(resolved,'.git');
  if(!fs.existsSync(dotgit)||!fs.lstatSync(dotgit).isDirectory()||
    fs.lstatSync(dotgit).isSymbolicLink()||fs.realpathSync(dotgit)!==dotgit)
    blocked('LINKED_WORKTREE','Use a normal self-contained Git checkout on C:');
  const actualRoot=path.resolve(readGit(resolved,['rev-parse','--show-toplevel']));
  if(actualRoot.toLowerCase()!==resolved.toLowerCase())
    blocked('WRONG_CHECKOUT','Git checkout root differs from expected source');
  const actual=readGit(resolved,['rev-parse','HEAD']);
  if(actual!==expectedSha)
    blocked('SOURCE_SHA_DRIFT','Expected '+expectedSha+' but found '+actual);
  if(readGit(resolved,['status','--porcelain','--untracked-files=all']))
    blocked('DIRTY_CHECKOUT','Source has modified or untracked files');
  return expectedSha;
}
module.exports={verifyGitSource};
