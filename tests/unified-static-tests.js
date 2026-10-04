'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const U=require('../app/unified-core.js');

function api(overrides={}){
  return {
    normalizeInput:s=>String(s||'').trim().replace(/\s+/g,' '),
    validateCheckOnlyLine:s=>{if(String(s).includes('BAD')) throw Error('SOURCE_INVALID')},
    processLine:s=>[`CANON:${s}`],
    splitBetChunks:rest=>[rest],
    ...overrides,
  };
}

{
  const result=U.transformDaVongText('3d 12 32 42 52 dx5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,[
    '3d 12 32 dx 5n',
    '3d 12 42 dx 5n',
    '3d 12 52 dx 5n',
    '3d 32 42 dx 5n',
    '3d 32 52 dx 5n',
    '3d 42 52 dx 5n',
  ]);
  assert.equal(result.pair_lines,6);
}

{
  const result=U.transformDaVongText('kh kt 12 32 42 đx2,5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,[
    'kh kt 12 32 đx 2,5n',
    'kh kt 12 42 đx 2,5n',
    'kh kt 32 42 đx 2,5n',
  ]);
}

{
  const mixedApi=api({
    splitBetChunks:rest=>{
      assert.equal(rest,'12 32 42 b10n dx5n');
      return ['12 32 42 b10n','12 32 42 dx5n'];
    },
    processLine:s=>[`NORMAL:${s}`],
  });
  const result=U.transformDaVongText('3d 12 32 42 b10n dx5n',mixedApi,'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,[
    'NORMAL:3d 12 32 42 b10n',
    '3d 12 32 dx 5n',
    '3d 12 42 dx 5n',
    '3d 32 42 dx 5n',
  ]);
}

{
  const result=U.transformDaVongText('3d 12 12 42 dx5n',api(),'mt',[]);
  assert.equal(result.ok,false);
  assert.equal(result.output,'');
  assert.deepEqual(result.outputs,[]);
  assert.match(result.error,/DA_VONG_DUPLICATE_NUMBER/);
}

{
  const result=U.transformDaVongText('12 b10n\nBAD\n3d 12 32 42 dx5n',api(),'mt',[]);
  assert.equal(result.ok,false);
  assert.equal(result.output,'');
  assert.deepEqual(result.outputs,[]);
}

{
  const result=U.transformDaVongText('12 b10n',api(),'mb',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,['CANON:12 b10n']);
}

const root=path.resolve(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'business_engine.generated.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(root,'app','version.json'),'utf8'));
assert.match(engine,/ENGINE_SHA256: 6ce6fca5adbaaf7604e21ac91e0fcb7759201b53afd0d7d1d5ef2a9bf546837c/);
assert.match(app,/data-mode="tach"/);
assert.match(app,/data-mode="ngang"/);
assert.match(app,/data-mode="davong"/);
assert.match(app,/KTS_BUSINESS_ENGINE\.ENGINE_SHA256/);
assert.match(app,/https:\/\/wilson86\.github\.io\/tach-dai-ngang\//);
assert.equal(version.business_engine_sha256,'6ce6fca5adbaaf7604e21ac91e0fcb7759201b53afd0d7d1d5ef2a9bf546837c');
assert.equal(version.contract,U.CONTRACT);
assert.match(sw,/cache\.put\(req, copy\)/);
assert.doesNotMatch(sw,/cache\.put\("\.\/index\.html", copy\)/);
console.log('UNIFIED STATIC CONTRACT: PASS');
