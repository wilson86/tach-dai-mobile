'use strict';
// SYNTHETIC DESIGN PROBE ONLY: not a production Auth service or secure key vault.
// Nothing here is called by runtime and no database/file/network is accessed.
const {signForReview} = require('./receipt-backend-proof-v2.cjs');
const KEY = /^draft_[a-f0-9]{32}$/;
const HEX16 = /^[a-f0-9]{16}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const deny = () => { throw Error('TEAM_RECEIPT_V2_AUTHORITY_DENIED'); };
function validateKeys(keys) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 30 ||
    keys.some((k, i) => typeof k !== 'string' || !KEY.test(k) ||
      (i && keys[i - 1] >= k))) deny();
}
async function issueForReview({auth, keyAuthority, nonceSource, bearerToken, keys, nowSeconds} = {}) {
  // An explicit authenticated callback boundary is required. A caller-supplied
  // actor/server_verified boolean does not meet this API contract.
  if (!auth || typeof auth.authorizeReceiptRead !== 'function' ||
    !keyAuthority || typeof keyAuthority.currentSigningKey !== 'function' ||
    typeof nonceSource !== 'function' ||
    typeof bearerToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(bearerToken) ||
    !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) deny();
  validateKeys(keys);
  let invocationCount = 0;
  let issuedProof;
  const signed = await auth.authorizeReceiptRead(bearerToken, async verifiedSession => {
    invocationCount++;
    if (invocationCount !== 1) deny();
    // Trust in verifiedSession depends ENTIRELY on real auth service behavior.
    if (!verifiedSession || verifiedSession.server_verified !== true ||
      verifiedSession.membership_active !== true ||
      !['operator','admin'].includes(verifiedSession.role) ||
      !HEX32.test(verifiedSession.session_handle || '')) deny();
    const material = await keyAuthority.currentSigningKey();
    if (!material || !Buffer.isBuffer(material.key) || material.key.length !== 32 ||
      !HEX16.test(material.keyId || '')) deny();
    const nonce = await nonceSource();
    if (typeof nonce !== 'string' || !HEX32.test(nonce)) deny();
    issuedProof = signForReview({backendKey:material.key, keyId:material.keyId,
      verifiedSession, keys, nonce, nowSeconds});
    return issuedProof;
  });
  if (invocationCount !== 1 || signed !== issuedProof ||
    !signed || !HEX32.test(signed.nonce || '') ||
    typeof signed.proof !== 'string' || !/^[a-f0-9]{64}$/.test(signed.proof) ||
    Object.prototype.hasOwnProperty.call(signed, 'key') ||
    Object.prototype.hasOwnProperty.call(signed, 'bearerToken')) deny();
  return signed;
}
module.exports = Object.freeze({issueForReview});
