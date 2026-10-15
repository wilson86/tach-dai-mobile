'use strict';
// CI-ONLY disposable encrypted fixture store. NEVER use for real device data.
// No production service or UI imports this module. No automatic deletion.
// Exclusive CREATE and OS fsync do not prove actual crash durability.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Recovery=require('../app/settlement-team-recovery-v0.js');
const {SLOT}=require('./recovery-vault.cjs');
const MAX_BYTES=120000;
function deny(code){throw Error(code);}
function safeChild(root,directory){
 const rel=path.relative(root,directory);
 return !!rel&&rel!=='.'&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);
}
async function createCiEncryptedFileStore({directory,syntheticOnly=false}={}){
 // Deliberately cannot be enabled with a caller-controlled flag alone.
 if(syntheticOnly!==true||process.env.GITHUB_ACTIONS!=='true'||
    !process.env.RUNNER_TEMP||typeof directory!=='string')
   deny('TEAM_CI_RECOVERY_STORE_DISABLED');
 const root=await fsp.realpath(process.env.RUNNER_TEMP);
 const resolved=path.resolve(directory);
 let real,st;
 try{real=await fsp.realpath(resolved);st=await fsp.lstat(resolved);}
 catch(_){deny('TEAM_CI_RECOVERY_DIRECTORY_INVALID');}
 if(real!==resolved||!safeChild(root,real)||!st.isDirectory()||
    (st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid()))
   deny('TEAM_CI_RECOVERY_DIRECTORY_INVALID');
 const file=path.join(real,SLOT+'.json');
 function keyGuard(slot){if(slot!==SLOT)deny('TEAM_CI_RECOVERY_SLOT_INVALID');}
 async function read(slot){
   keyGuard(slot);
   let fd;
   try{
     fd=await fsp.open(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   }catch(e){
     if(e.code==='ENOENT')return null;
     deny('TEAM_CI_RECOVERY_READ_FAILED');
   }
   try{
     const st=await fd.stat();
     if(!st.isFile()||st.nlink!==1||st.size<1||st.size>MAX_BYTES||
        (st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid()))
       deny('TEAM_CI_RECOVERY_FILE_INVALID');
     const text=await fd.readFile({encoding:'utf8'});
     if(Buffer.byteLength(text,'utf8')!==st.size)
       deny('TEAM_CI_RECOVERY_FILE_INVALID');
     // Validate canonical ciphertext envelope, NOT decrypt in the store.
     Recovery.parseEnvelope(text);
     return text;
   }finally{await fd.close();}
 }
 async function writeIfAbsent(slot,text){
   keyGuard(slot);
   if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_BYTES)
     deny('TEAM_CI_RECOVERY_CONTENT_INVALID');
   Recovery.parseEnvelope(text);
   let fd;
   try{
     fd=await fsp.open(file,
       fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
       fs.constants.O_NOFOLLOW,0o600);
   }catch(e){
     if(e.code==='EEXIST')return false;
     deny('TEAM_CI_RECOVERY_WRITE_FAILED');
   }
   // If a write/sync fails, leave the possibly partial file in place so
   // no subsequent backup can silently overwrite disputed evidence.
   try{
     await fd.writeFile(text,{encoding:'utf8'});
     await fd.sync();
   }finally{await fd.close();}
   const dirFd=await fsp.open(real,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
   try{await dirFd.sync();}
   finally{await dirFd.close();}
   return true;
 }
 return Object.freeze({read,writeIfAbsent});
}
module.exports=Object.freeze({createCiEncryptedFileStore,MAX_BYTES});
