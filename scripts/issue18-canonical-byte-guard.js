'use strict';
// Read-only raw-byte check for the three immutable Issue #18 KTS canonical JSON inputs.
// Match raw CRLF hashes recorded in KTS SharedBusinessEngine/BUILD_MANIFEST.json
// at exact KTS SHA b08cfafaabfd1b4e5a6cdab26a7938b4f13a1e51.
// Classification is diagnostic only: non-identical source bytes are BLOCKED.
// Do not rewrite checkout content, normalize bytes or skip the gate.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const EXPECTED=Object.freeze({
  'engine_spec.json':'333109382f81164bd0d6a6ecd13eb329ecdb1794b924ae34784fb19ef09e1a51',
  'calendar_authority.json':'d2945b65f5ec90712c26c2700c9221ff93a006f1fcd0a17e877a23688b73851d',
  'pwa_version_templates.json':'8ecdc609c2c6a62d7ad4c4690d857ed54d5e85416487ed7258ce1cfb21115083'
});
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function classifyRawBytes(bytes,expectedSha){
  if(!Buffer.isBuffer(bytes)||!/^[0-9a-f]{64}$/.test(expectedSha))throw Error('INVALID_BYTE_PROBE');
  const observed=sha256(bytes);
  if(observed===expectedSha)return {status:'MATCH',sha256:observed};
  const normalized=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
  const expanded=Buffer.from(bytes.toString('utf8').replace(/\r?\n/g,'\r\n'),'utf8');
  const onlyLineEnding=sha256(normalized)===expectedSha||
    sha256(expanded)===expectedSha;
  return {status:onlyLineEnding?'LINE_ENDING_DRIFT':'SOURCE_BYTES_DRIFT',
    sha256:observed};
}
function inspectCanonicalBytes(ktsRoot,safeFile,reader=fs.readFileSync,pins=EXPECTED){
  if(typeof safeFile!=='function'||typeof reader!=='function')throw Error('INVALID_BYTE_GUARD');
  const engine=path.join(ktsRoot,'SharedBusinessEngine'),rows=[];
  for(const [name,expected] of Object.entries(pins)){
    const file=safeFile(engine,name);
    const observed=classifyRawBytes(reader(file),expected);
    rows.push({name,expected_sha256:expected,...observed});
  }
  return {schema:'KTS_ISSUE18_CANONICAL_RAW_BYTES_V1',
    ok:rows.every(row=>row.status==='MATCH'),rows};
}
module.exports={EXPECTED,classifyRawBytes,inspectCanonicalBytes};
