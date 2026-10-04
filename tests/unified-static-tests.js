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

// Existing literal DX behavior remains intact.
{
  const result=U.transformDaVongText('3d 12 32 42 52 dx5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,[
    '3d 12 32 dx 5n','3d 12 42 dx 5n','3d 12 52 dx 5n',
    '3d 32 42 dx 5n','3d 32 52 dx 5n','3d 42 52 dx 5n',
  ]);
  assert.equal(result.pair_lines,6);
  assert.deepEqual(result.group_counts,[3,2,1]);
}

// One-digit pair numbers fail closed with an explicit zero-pad suggestion.
{
  const result=U.transformDaVongText('3d 1 2 3 4 dx 5n',api(),'mt',[]);
  assert.equal(result.ok,false);
  assert.deepEqual(result.outputs,[]);
  assert.match(result.error,/LỖI dòng 1/);
  assert.match(result.error,/01 02 03 04/);
}

// Correctly padded numbers are valid and generate C(4,2)=6.
{
  const result=U.transformDaVongText('3d 01 02 03 04 dx 5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.equal(result.outputs.length,6);
  assert.equal(result.pair_lines,6);
}

// MB DA is a deliberate Đá Vòng override, full stake per pair.
{
  const result=U.transformDaVongText('68 86 28 da 5n',api(),'mb',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,['68 86 da 5n','68 28 da 5n','86 28 da 5n']);
  assert.deepEqual(result.group_counts,[2,1]);
}

// MT 3d/2d DA uses pair semantics in explicit Đá Vòng mode and never halves stake.
for(const head of ['3d','2d']){
  const result=U.transformDaVongText(`${head} 68 86 28 da 5n`,api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,[`${head} 68 86 da 5n`,`${head} 68 28 da 5n`,`${head} 86 28 da 5n`]);
  assert.doesNotMatch(result.output,/2[.,]5n/);
}

// Single explicit station DA remains canonical DAT/straight behavior.
{
  const result=U.transformDaVongText('hue 68 86 da 5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.outputs,['CANON:hue 68 86 da 5n']);
  assert.equal(result.pair_lines,0);
}

// Seven two-digit numbers -> 21 lines, grouped 6..1, no reverse duplicates.
{
  const result=U.transformDaVongText('3d 68 86 28 12 53 63 65 dx 5n',api(),'mt',[]);
  assert.equal(result.ok,true);
  assert.equal(result.outputs.length,21);
  assert.deepEqual(result.group_counts,[6,5,4,3,2,1]);
  assert.equal(new Set(result.outputs).size,21);
  assert.ok(result.outputs.includes('3d 68 86 dx 5n'));
  assert.ok(!result.outputs.includes('3d 86 68 dx 5n'));
  assert.match(result.display_output,/──── 68 đá \(6\) ────/u);
  assert.match(result.display_output,/──── 86 đá \(5\) ────/u);
  assert.ok(result.outputs.every(line=>!line.includes('────')));
}

// Mixed canonical + DX clauses stay atomic and retain canonical normal output.
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
    '3d 12 32 dx 5n','3d 12 42 dx 5n','3d 32 42 dx 5n',
  ]);
}

// Duplicate numbers and any later bad source line fail the entire batch.
{
  const duplicate=U.transformDaVongText('3d 12 12 42 dx5n',api(),'mt',[]);
  assert.equal(duplicate.ok,false); assert.deepEqual(duplicate.outputs,[]); assert.match(duplicate.error,/DA_VONG_DUPLICATE_NUMBER/);
  const atomic=U.transformDaVongText('12 b10n\nBAD\n3d 12 32 42 dx5n',api(),'mt',[]);
  assert.equal(atomic.ok,false); assert.deepEqual(atomic.outputs,[]);
}

const root=path.resolve(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'business_engine.generated.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'app','sw.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(root,'app','version.json'),'utf8'));
assert.match(engine,/ENGINE_SHA256: 6ce6fca5adbaaf7604e21ac91e0fcb7759201b53afd0d7d1d5ef2a9bf546837c/);
assert.match(app,/data-mode="tach"/);
assert.match(app,/data-mode="ngang"/);
assert.match(app,/data-mode="davong"/);
assert.match(app,/KTS_BUSINESS_ENGINE\.ENGINE_SHA256/);
assert.match(app,/https:\/\/wilson86\.github\.io\/tach-dai-ngang\//);
assert.match(app,/id="dvSelectAllInput"/);
assert.match(app,/id="dvCutSelection"/);
assert.match(app,/id="dvSelectAllOutput"/);
assert.match(app,/Kết quả \(\$\{result\.outputs\.length\}\)/);
assert.equal(version.version,'1.0.2');
assert.equal(version.business_engine_sha256,'6ce6fca5adbaaf7604e21ac91e0fcb7759201b53afd0d7d1d5ef2a9bf546837c');
assert.equal(version.contract,U.CONTRACT);
assert.match(sw,/kts-tach-unified-v1\.0\.2-da-vong-final-6ce6/);
assert.match(sw,/skipWaiting\(\)/);
assert.match(sw,/clients\.claim\(\)/);
assert.match(sw,/cache\.put\(req,copy\)|cache\.put\(req, copy\)/);
assert.doesNotMatch(sw,/cache\.put\("\.\/index\.html", copy\)/);
console.log('UNIFIED STATIC CONTRACT: PASS');
