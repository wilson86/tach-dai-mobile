'use strict';
// Read-only raw-byte check for the three immutable Issue #18 KTS canonical JSON inputs.
// Do not normalize or rewrite a user's checkout: explain CRLF, block stale source.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const EXPECTED=Object.freeze({
  'engine_spec.json':'07e1eddd7e92d311e0c6a9319fc4bf7c7f4cc8d8768e0b604ecf37ced02cef1e',
  'calendar_authority.json':'edb384eadc4bb1bf9109727247776109fcc7d23835d7e8114076ff207bd5296d',
  'pwa_version_templates.json':'cb019c3b2d0e1662aab6be66919f2c3b0023376e2d55ff2c825b12599843466a'
});
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function classifyRawBytes(bytes,expectedSha){
  if(!Buffer.isBuffer(bytes)||!/^[0-9a-f]{64}$/.test(expectedSha))throw Error('INVALID_BYTE_PROBE');
  const observed=sha256(bytes);
  if(observed===expectedSha)return {status:'MATCH',sha256:observed};
  const normalized=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
  return {status:bytes.includes(Buffer.from('\r\n'))&&sha256(normalized)===expectedSha
      ?'CRLF_CHECKOUT':'SOURCE_BYTES_DRIFT',sha256:observed};
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
