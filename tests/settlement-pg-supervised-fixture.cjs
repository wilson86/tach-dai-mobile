'use strict';
// Disposable process tree, never a PostgreSQL or HTTP process.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const child=cp.spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{detached:true,stdio:'ignore',windowsHide:true});
fs.writeFileSync(path.join(process.argv[2],'fixture-grandchild.json'),JSON.stringify({pid:child.pid}));
child.unref();setTimeout(()=>process.exit(0),4000);
