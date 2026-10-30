'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {canCleanupChromeProfile}=require('../scripts/issue18-chrome-isolated-smoke.js');

const base='/isolated/qa-temp';
const owned=path.join(base,'kts-issue18-headless-123456');
const fakeFs={
  lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false}),
  realpathSync:p=>p,
  readdirSync:()=>[]
};
test('FAILED Chrome must preserve its generated profile as unresolved evidence',()=>{
  assert.equal(canCleanupChromeProfile(false,owned,base,fakeFs),false);
  assert.equal(canCleanupChromeProfile(false,owned,base,{lstatSync:()=>{throw Error('should never stat failed profile')}}),false);
});
test('PASS only permits cleanup of exact owned first-level Chrome profile',()=>{
  assert.equal(canCleanupChromeProfile(true,owned,base,fakeFs),true);
  assert.equal(canCleanupChromeProfile(true,path.join(base,'other-profile'),base,fakeFs),false);
  assert.equal(canCleanupChromeProfile(true,path.join(base,'child','kts-issue18-headless-foo'),base,fakeFs),false);
  assert.equal(canCleanupChromeProfile(true,path.join(base,'kts-issue18-headless-foo','..','user-file'),base,fakeFs),false);
});
test('successful profile cleanup refuses nested symlinks, junctions and special entries',()=>{
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,readdirSync:dir=>dir===owned?[{
      name:'Downloads',isSymbolicLink:()=>true,isDirectory:()=>false,isFile:()=>false
    }]:[]
  }),false);
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,readdirSync:dir=>dir===owned?[{
      name:'session',isSymbolicLink:()=>false,isDirectory:()=>true,isFile:()=>false
    }]:[],
    realpathSync:dir=>dir===path.join(owned,'session')?'/outside/redirect':dir
  }),false);
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,readdirSync:dir=>dir===owned?[{
      name:'socket',isSymbolicLink:()=>false,isDirectory:()=>false,isFile:()=>false
    }]:[]
  }),false);
});
test('success cleanup refuses symlinks, nonfolders, redirected paths and unknown files',()=>{
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>true})
  }),false);
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,lstatSync:()=>({isDirectory:()=>false,isSymbolicLink:()=>false})
  }),false);
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    ...fakeFs,realpathSync:()=>'/outside/user-content'
  }),false);
  assert.equal(canCleanupChromeProfile(true,owned,base,{
    lstatSync:()=>{throw Error('permission denied');}
  }),false);
});


test('a failed initial Unified fetch closes loopback listener before any Chrome profile exists',async()=>{
  // Execute the exact checkout's Chrome entrypoint in a zero-IO VM.
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../scripts/issue18-chrome-isolated-smoke.js'),'utf8');
  const actions=[];
  const fakeServer={
    once(){return this;},
    listen(_port,_host,ready){actions.push('listen');ready();return this;},
    address(){return {port:45678};},
    close(done){actions.push('close');done();}
  };
  const dependencies={
    'node:fs':{
      statSync:()=>({isDirectory:()=>true}),realpathSync:p=>p,
      mkdtempSync:()=>{throw Error('PROFILE_MUST_NOT_BE_CREATED');}
    },
    'node:path':path,
    'node:os':{},
    'node:http':{createServer:()=>fakeServer},
    'node:child_process':{},
    'node:assert/strict':assert
  };
  const runtime={platform:process.platform,env:{},argv:[]};
  const sandbox={module:{exports:{}},process:runtime,
    require:name=>{
      if(!Object.hasOwn(dependencies,name))throw Error('UNEXPECTED_MODULE '+name);
      return dependencies[name];
    },
    fetch:async()=>({ok:false,status:404,text:async()=>''}),
    console:{error:()=>{}},
    setTimeout
  };
  vm.runInNewContext(source,sandbox,{filename:'issue18-chrome-isolated-smoke.js'});
  await assert.rejects(
    sandbox.module.exports.chromeSmoke('/isolated/no-unified'),
    /loopback server did not serve the real Unified HTML/
  );
  assert.deepEqual(actions,['listen','close']);
});
