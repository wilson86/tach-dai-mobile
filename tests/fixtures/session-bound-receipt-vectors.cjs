'use strict';
// TEST DATA ONLY. This reproduces the review-only candidate envelope; it is
// deliberately not a production signer or a proof of backend authority.
const crypto=require('node:crypto');
function vector({bearer,workspace,nonce,expires,keys}={}){
 if(typeof bearer!=='string'||!/^synthetic_[A-Za-z0-9_-]{32,96}$/.test(bearer)||
    typeof workspace!=='string'||!/^synthetic_[a-z0-9_]{1,48}$/.test(workspace)||
    typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||
    !Number.isSafeInteger(expires)||expires<=0||!Array.isArray(keys)||
    keys.length<1||keys.length>30||keys.some(k=>typeof k!=='string'||!/^draft_[a-f0-9]{32}$/.test(k))||
    keys.some((k,i)=>i>0&&keys[i-1]>=k))throw Error('SYNTHETIC_VECTOR_INVALID');
 const sessionHash=crypto.createHash('sha256').update(bearer,'utf8').digest('hex');
 const sessionId=crypto.createHash('sha256').update(sessionHash,'utf8').digest('hex');
 const message=['kts-receipt-read-v1',sessionId,workspace,keys.join(','),nonce,String(expires)].join('|');
 const proof=crypto.createHmac('sha256',Buffer.from(sessionHash,'hex')).update(message,'utf8').digest('hex');
 return Object.freeze({session_id:sessionId,workspace_id:workspace,nonce,expires,keys:Object.freeze([...keys]),proof});
}
module.exports=Object.freeze({vector});
