'use strict';
// Direct file descriptors avoid waiting for EOF on pipes inherited by the server.
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
function startWithFileCapture(exe,args,{cwd,env,timeout,logPath}){
  const fd=fs.openSync(logPath,'wx',0o600);
  try {
    const r=spawnSync(exe,args,{cwd,env,timeout,windowsHide:true,stdio:['ignore',fd,fd]});
    return {ok:!r.error&&r.status===0,exit_code:r.status,problem:r.error?.code||null,signal:r.signal||null};
  } finally {fs.closeSync(fd);}
}
module.exports={startWithFileCapture};
