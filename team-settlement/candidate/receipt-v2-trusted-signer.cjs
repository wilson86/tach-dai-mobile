'use strict';
// NOT A DEPLOYED SIGNER. Default-off integration candidate. Never provide a
// browser-facing route. The keyProvider MUST be an independently protected
// backend secret authority; injecting a fake provider is NOT key custody.
const crypto = require('node:crypto');
const IDENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HEX16 = /^[a-f0-9]{16}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const RECEIPT = /^draft_[a-f0-9]{32}$/;
const PURPOSE = 'kts-receipt-read-v2';
function deny() { throw Error('TEAM_RECEIPT_V2_SIGNER_DENIED'); }
function validKeys(keys) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 30) deny();
  for (let i=0; i<keys.length; i++) {
    if (typeof keys[i] !== 'string' || !RECEIPT.test(keys[i]) ||
        (i>0 && keys[i-1] >= keys[i])) deny();
  }
  return Object.freeze([...keys]);
}
function validActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor) ||
      actor.server_verified !== true || actor.membership_active !== true ||
      !['operator','admin'].includes(actor.role) ||
      typeof actor.session_handle !== 'string' || !HEX32.test(actor.session_handle) ||
      typeof actor.workspace_id !== 'string' || !IDENT.test(actor.workspace_id) ||
      typeof actor.user_id !== 'string' || !IDENT.test(actor.user_id)) deny();
}
function canonical(fields) {
  return Buffer.from(fields.map(value => {
    const text = String(value);
    return Buffer.byteLength(text,'utf8')+':'+text;
  }).join(''),'utf8');
}
function createReceiptV2TrustedSigner({auth,keyProvider,clock=()=>Date.now(),
  nonceSource=()=>crypto.randomBytes(16),enabled=false}={}) {
  if (typeof enabled !== 'boolean' || typeof clock !== 'function' ||
      typeof nonceSource !== 'function') deny();
  // When disabled, no collaborator is required and no secret can be retrieved.
  if (enabled && (!auth || typeof auth.authorizeReceiptRead !== 'function' ||
      !keyProvider || typeof keyProvider.currentSigningKey !== 'function')) deny();
  async function signReceiptRead({bearerToken,keys,ttlSeconds=20}={}) {
    if (!enabled) throw Error('TEAM_RECEIPT_V2_SIGNER_NOT_ENABLED');
    if (typeof bearerToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(bearerToken) ||
        !Number.isSafeInteger(ttlSeconds) || ttlSeconds<1 || ttlSeconds>30) deny();
    const ordered = validKeys(keys);
    // Only a server-side DB-backed Auth boundary may grant actor authority.
    // No bearer or bearer-derived signing key enters the secret provider.
    let callbackCount=0;
    let created=null;
    const reply=await auth.authorizeReceiptRead(bearerToken,async actor => {
      callbackCount++;
      if (callbackCount!==1) deny();
      validActor(actor);
      const now = clock();
      if (!Number.isSafeInteger(now) || now<0) deny();
      const seconds = Math.floor(now/1000);
      if (!Number.isSafeInteger(seconds+ttlSeconds)) deny();
      const expiration = seconds+ttlSeconds;
      const fetched = await keyProvider.currentSigningKey();
      if (!fetched || typeof fetched !== 'object' ||
          typeof fetched.key_id !== 'string' || !HEX16.test(fetched.key_id) ||
          !Buffer.isBuffer(fetched.secret_bytes) || fetched.secret_bytes.length!==32 ||
          !Number.isSafeInteger(fetched.activated_at_ms) ||
          !Number.isSafeInteger(fetched.stop_signing_at_ms) ||
          !Number.isSafeInteger(fetched.stop_verify_at_ms) ||
          fetched.revoked_at_ms !== null ||
          fetched.activated_at_ms > now || fetched.stop_signing_at_ms <= now ||
          fetched.stop_verify_at_ms <= expiration*1000) deny();
      // Always copy and zeroize the temporary secret; never modify the provider's
      // long-lived secret or include it in a return value, log or error message.
      const localSecret=Buffer.from(fetched.secret_bytes);
      try {
        const nonce=nonceSource();
        if (!Buffer.isBuffer(nonce) || nonce.length!==16) deny();
        const nonceText=nonce.toString('hex');
        const fields=[PURPOSE,fetched.key_id,actor.session_handle,
          actor.workspace_id,actor.user_id,ordered.length,...ordered,nonceText,seconds,expiration];
        const proof=crypto.createHmac('sha256',localSecret)
          .update(canonical(fields)).digest('hex');
        created=Object.freeze({key_id:fetched.key_id,
          session_handle:actor.session_handle,workspace_id:actor.workspace_id,
          user_id:actor.user_id,keys:ordered,nonce:nonceText,
          issued_at:seconds,expires_at:expiration,proof});
        return created;
      } finally { localSecret.fill(0); }
    });
    // A substituted Auth adapter may not skip the signer or rewrite its result.
    if (callbackCount!==1 || reply!==created) deny();
    return reply;
  }
  return Object.freeze({signReceiptRead});
}
module.exports=Object.freeze({createReceiptV2TrustedSigner});
