'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {canCleanupChromeProfile}=require('../scripts/issue18-chrome-isolated-smoke.js');

const base='/isolated/qa-temp';
const owned=path.join(base,'kts-issue18-headless-123456');
const fakeFs={
  lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false}),
  realpathSync:p=>p
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
