'use strict';
// REVIEW FIXTURE ONLY. Not a production signer, database verifier, or grant.
// A true backend-only key origin and secure storage are NOT established by JS.
const crypto = require('node:crypto');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HEX16 = /^[a-f0-9]{16}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const RECEIPT = /^draft_[a-f0-9]{32}$/;
const PURPOSE = 'kts-receipt-read-v2';
const reject = () => { throw Error('TEAM_RECEIPT_V2_PROOF_DENIED'); };
function validKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) reject();
}
function validSession(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) ||
    s.server_verified !== true || s.membership_active !== true ||
    !['admin', 'operator'].includes(s.role) ||
    !HEX32.test(s.session_handle) || !ID.test(s.workspace_id) ||
    !ID.test(s.user_id)) reject();
}
function validKeys(keys) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 30 ||
    keys.some((k, i) => typeof k !== 'string' || !RECEIPT.test(k) ||
      (i > 0 && keys[i - 1] >= k))) reject();
}
function validSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0) reject();
}
function canonical(fields) {
  return Buffer.from(fields.map(f => {
    const x = String(f);
    return Buffer.byteLength(x, 'utf8') + ':' + x;
  }).join(''), 'utf8');
}
function envelopeBytes(e) {
  return canonical([PURPOSE, e.key_id, e.session_handle, e.workspace_id,
    e.user_id, e.keys.length, ...e.keys, e.nonce, e.issued_at, e.expires_at]);
}
function validateEnvelope(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) ||
    !HEX16.test(e.key_id) || !HEX32.test(e.session_handle) ||
    !ID.test(e.workspace_id) || !ID.test(e.user_id) || !HEX32.test(e.nonce)) reject();
  validKeys(e.keys);
  validSeconds(e.issued_at);
  validSeconds(e.expires_at);
  if (e.expires_at <= e.issued_at || e.expires_at - e.issued_at > 30 ||
    !/^[a-f0-9]{64}$/.test(e.proof || '')) reject();
}
function signForReview({ backendKey, keyId, verifiedSession, keys, nonce, nowSeconds, ttlSeconds = 20 } = {}) {
  validKey(backendKey);
  validSession(verifiedSession);
  validKeys(keys);
  if (!HEX16.test(keyId) || !HEX32.test(nonce)) reject();
  validSeconds(nowSeconds);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 30 ||
    !Number.isSafeInteger(nowSeconds + ttlSeconds)) reject();
  const e = {
    key_id: keyId, session_handle: verifiedSession.session_handle,
    workspace_id: verifiedSession.workspace_id, user_id: verifiedSession.user_id,
    keys: [...keys], nonce, issued_at: nowSeconds, expires_at: nowSeconds + ttlSeconds
  };
  const proof = crypto.createHmac('sha256', backendKey).update(envelopeBytes(e)).digest('hex');
  return Object.freeze({ ...e, keys: Object.freeze(e.keys), proof });
}
function verifyForReview({ verifierKey, envelope, expectedSession, nowSeconds } = {}) {
  validKey(verifierKey);
  validSession(expectedSession);
  validSeconds(nowSeconds);
  validateEnvelope(envelope);
  if (envelope.session_handle !== expectedSession.session_handle ||
    envelope.workspace_id !== expectedSession.workspace_id ||
    envelope.user_id !== expectedSession.user_id ||
    nowSeconds < envelope.issued_at || nowSeconds >= envelope.expires_at) reject();
  const digest = crypto.createHmac('sha256', verifierKey).update(envelopeBytes(envelope)).digest();
  const claimed = Buffer.from(envelope.proof, 'hex');
  if (claimed.length !== digest.length || !crypto.timingSafeEqual(digest, claimed)) reject();
  return Object.freeze({ verified: true, workspace_id: expectedSession.workspace_id,
    user_id: expectedSession.user_id, keys: Object.freeze([...envelope.keys]) });
}
module.exports = Object.freeze({ signForReview, verifyForReview });
