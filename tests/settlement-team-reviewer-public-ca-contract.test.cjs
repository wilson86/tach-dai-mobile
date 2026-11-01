'use strict';
// Offline public-certificate verification only; no private key or listener.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const root='C:/KTS-Settlement/w20-2d63c84e/kts-settlement-private-ca-v1';
test('DER public CA converts to trusted PEM for the pinned server certificate',()=>{
  const der=fs.readFileSync(root+'/public/kts-settlement-private-root-ca-v1.cer');
  assert.equal(crypto.createHash('sha256').update(der).digest('hex').toUpperCase(),'D677164D7E16CEE0DF1993B4466E728E983B9FBD01F55AF78955E1622EC41149');
  const ca=new crypto.X509Certificate(der),pem=Buffer.from(ca.toString());
  const caFromPem=new crypto.X509Certificate(pem);
  const server=new crypto.X509Certificate(fs.readFileSync(root+'/server/kts-settlement-https-server.cert.pem'));
  assert.equal(caFromPem.fingerprint256,ca.fingerprint256);
  assert.equal(ca.ca,true);assert.equal(server.verify(caFromPem.publicKey),true);
  assert.equal(server.checkIP('192.168.0.148'),'192.168.0.148');
  assert.ok(server.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
});
