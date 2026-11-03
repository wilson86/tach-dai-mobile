'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const crypto=require('node:crypto');
const {EXPECTED,classifyRawBytes,inspectCanonicalBytes}=require('../scripts/issue18-canonical-byte-guard.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('real immutable manifest defines all three independently pinned inputs',()=>{
  assert.deepEqual(Object.keys(EXPECTED),[
    'engine_spec.json','calendar_authority.json','pwa_version_templates.json'
  ]);
  assert.ok(Object.values(EXPECTED).every(h=>/^[0-9a-f]{64}$/.test(h)));
});
test('KTS b08 source manifest CRLF input hashes are pinned verbatim',()=>{
  assert.deepEqual(EXPECTED,{
    'engine_spec.json':'333109382f81164bd0d6a6ecd13eb329ecdb1794b924ae34784fb19ef09e1a51',
    'calendar_authority.json':'d2945b65f5ec90712c26c2700c9221ff93a006f1fcd0a17e877a23688b73851d',
    'pwa_version_templates.json':'8ecdc609c2c6a62d7ad4c4690d857ed54d5e85416487ed7258ce1cfb21115083'
  });
});
test('CRLF raw-byte contract permits only identical bytes',()=>{
  const lf=Buffer.from('{\n  "value": 1\n}\n');
  const crlf=Buffer.from(lf.toString('utf8').replace(/\n/g,'\r\n'));
  const pin=sha(crlf);
  assert.equal(classifyRawBytes(crlf,pin).status,'MATCH');
  assert.equal(classifyRawBytes(lf,pin).status,'LINE_ENDING_DRIFT');
  const changed=Buffer.from('{\r\n  "value": 2\r\n}\r\n');
  assert.equal(classifyRawBytes(changed,pin).status,'SOURCE_BYTES_DRIFT');
});
test('exact LF bytes pass and are never modified',()=>{
  const source=Buffer.from('{\n  "fixture": 1\n}\n');
  const copy=Buffer.from(source);
  assert.deepEqual(classifyRawBytes(source,sha(source)),{status:'MATCH',sha256:sha(source)});
  assert.deepEqual(source,copy);
});
test('Windows CRLF checkout is distinguished from changed canonical content',()=>{
  const source=Buffer.from('{\n  "fixture": 1\n}\n');
  const crlf=Buffer.from(source.toString('utf8').replace(/\n/g,'\r\n'));
  assert.equal(classifyRawBytes(crlf,sha(source)).status,'LINE_ENDING_DRIFT');
  assert.equal(classifyRawBytes(Buffer.from('{\n  "fixture": 2\n}\n'),sha(source)).status,'SOURCE_BYTES_DRIFT');
  assert.equal(classifyRawBytes(Buffer.from('not json\r\n'),sha(source)).status,'SOURCE_BYTES_DRIFT');
});
test('missing or malformed manifest SHA is never treated as match',()=>{
  assert.throws(()=>classifyRawBytes(Buffer.from('x'),'bad'),/INVALID_BYTE_PROBE/);
  assert.throws(()=>classifyRawBytes('not bytes','a'.repeat(64)),/INVALID_BYTE_PROBE/);
});
test('read-only three-input probe gates mismatched and CRLF paths',()=>{
  const base='C:\\KTS-QA\\issue18-review\\KTS';
  const names=Object.keys(EXPECTED);
  const fixtures=Object.fromEntries(names.map(name=>[name,Buffer.from(name+'\n')]));
  const pins=Object.fromEntries(names.map(name=>[name,sha(fixtures[name])]));
  const touched=[];
  const safeFile=(dir,name)=>{assert.equal(dir,path.join(base,'SharedBusinessEngine'));touched.push(name);return name};
  const read=file=>fixtures[file];
  const good=inspectCanonicalBytes(base,safeFile,read,pins);
  assert.equal(good.ok,true);
  assert.equal(good.rows.length,3);
  fixtures['engine_spec.json']=Buffer.from('engine_spec.json\r\n');
  const bad=inspectCanonicalBytes(base,safeFile,read,pins);
  assert.equal(bad.ok,false);
  assert.equal(bad.rows.find(x=>x.name==='engine_spec.json').status,'LINE_ENDING_DRIFT');
  assert.equal(touched.length,6);
});
