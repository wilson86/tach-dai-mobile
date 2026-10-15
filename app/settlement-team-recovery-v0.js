(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KtsTeamSyntheticRecoveryV0=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// ISOLATED, DEFAULT-OFF synthetic cryptography contract. NOT loaded by the PWA.
// No storage, download, network, login, queue-import or write side effects.
// A future UI must obtain verified user/workspace identity from the SERVER
// before calling open(), and must NEVER automatically submit opened entries.
const KIND='kts-team-synthetic-recovery-v0';
const ITERATIONS=310000;
const MAX_ITEMS=30;
const MAX_PLAINTEXT_BYTES=65536;
const MAX_ENVELOPE_BYTES=120000;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DRAFT_ID=/^draft_[0-9a-f]{32}$/;
const PARTNER=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
const B64=/^[A-Za-z0-9_-]+$/;
const coder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});

function deny(code){throw Error(code);}
function binding(actor){
  if(!actor||typeof actor!=='object'||Array.isArray(actor)||
     typeof actor.workspace_id!=='string'||!ID.test(actor.workspace_id)||
     typeof actor.user_id!=='string'||!ID.test(actor.user_id))
    deny('TEAM_RECOVERY_BINDING_INVALID');
  return {workspace_id:actor.workspace_id,user_id:actor.user_id};
}
function cryptoOrFail(provider){
  const c=provider||(typeof globalThis!=='undefined'&&globalThis.crypto);
  if(!c||typeof c.getRandomValues!=='function'||!c.subtle||
     typeof c.subtle.importKey!=='function'||typeof c.subtle.deriveKey!=='function')
    deny('TEAM_RECOVERY_CRYPTO_REQUIRED');
  return c;
}
function passphraseOrFail(value){
  // Dedicated recovery secret; NEVER reuse the browser login password.
  if(typeof value!=='string'||value.length<16||value.length>256||
     /[\r\n\u0000]/.test(value))deny('TEAM_RECOVERY_PASSPHRASE_INVALID');
  return value;
}
function deepFreeze(value){
  if(value!==null && typeof value==='object' && !Object.isFrozen(value)){
    for(const item of Object.values(value))deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
function toB64(bytes){
  let raw='';
  for(let i=0;i<bytes.length;i+=4096)
    raw+=String.fromCharCode(...bytes.subarray(i,i+4096));
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64(value){
  if(typeof value!=='string'||!B64.test(value)||value.length>MAX_ENVELOPE_BYTES)
    deny('TEAM_RECOVERY_FORMAT_INVALID');
  let raw;
  try{raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-value.length%4)%4));}
  catch(_){deny('TEAM_RECOVERY_FORMAT_INVALID');}
  const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  if(toB64(bytes)!==value)deny('TEAM_RECOVERY_FORMAT_INVALID');
  return bytes;
}
function validDay(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number);
  if(y<1||m<1||m>12)return false;
  const leap=y%4===0&&(y%100!==0||y%400===0);
  return d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
function verifiedJson(value,depth=0){
  if(depth>12)deny('TEAM_RECOVERY_DRAFT_INVALID');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){
    if(value.length>16384)deny('TEAM_RECOVERY_DRAFT_INVALID');
    return value;
  }
  if(typeof value==='number'){
    if(!Number.isFinite(value))deny('TEAM_RECOVERY_DRAFT_INVALID');
    return value;
  }
  if(typeof value!=='object')deny('TEAM_RECOVERY_DRAFT_INVALID');
  if(Array.isArray(value)){
    if(value.length>200)deny('TEAM_RECOVERY_DRAFT_INVALID');
    return value.map(x=>verifiedJson(x,depth+1));
  }
  if(Object.getPrototypeOf(value)!==Object.prototype &&
     Object.getPrototypeOf(value)!==null)deny('TEAM_RECOVERY_DRAFT_INVALID');
  const keys=Object.keys(value);
  if(keys.length>100)deny('TEAM_RECOVERY_DRAFT_INVALID');
  const result={};
  for(const key of keys){
    if(key==='__proto__'||key==='constructor'||key==='prototype'||key.length>128)
      deny('TEAM_RECOVERY_DRAFT_INVALID');
    result[key]=verifiedJson(value[key],depth+1);
  }
  return result;
}
function sanitizeDrafts(drafts,actor){
  if(!Array.isArray(drafts)||drafts.length<1||drafts.length>MAX_ITEMS)
    deny('TEAM_RECOVERY_DRAFT_INVALID');
  const ids=new Set();
  const items=drafts.map(row=>{
    // v0 only stores the canonical create_draft HTTP intent. An edit_draft
    // would use a DIFFERENT server request SHA, but v0 carries no action
    // field after decryption: never silently relabel it as create_draft.
    const keys=row&&typeof row==='object'&&!Array.isArray(row)?
      Object.keys(row):[];
    const allowed=['id','status','scope','base_revision','payload','error','action'];
    const scopeKeys=row&&row.scope&&typeof row.scope==='object'&&
      !Array.isArray(row.scope)?Object.keys(row.scope):[];
    const requiredScope=['workspace_id','partner_id','business_date','region'];
    if(!row||typeof row!=='object'||Array.isArray(row)||
       (Object.getPrototypeOf(row)!==Object.prototype&&
        Object.getPrototypeOf(row)!==null)||
       keys.some(key=>!allowed.includes(key))||
       (row.action!==undefined&&row.action!=='create_draft')||
       (row.error!==undefined&&typeof row.error!=='string')||
       scopeKeys.length!==requiredScope.length||
       scopeKeys.some(key=>!requiredScope.includes(key))||
       !DRAFT_ID.test(row.id)||ids.has(row.id)||
       !['PENDING','CONFLICT','BLOCKED'].includes(row.status)||
       !Number.isSafeInteger(row.base_revision)||row.base_revision<0||
       !Number.isSafeInteger(row.base_revision+1)||
       row.server_result!==undefined||!row.scope||
       row.scope.workspace_id!==actor.workspace_id||
       typeof row.scope.partner_id!=='string'||!PARTNER.test(row.scope.partner_id)||
       !validDay(row.scope.business_date)||
       !['mn','mt','mb'].includes(row.scope.region)||
       !row.payload||typeof row.payload!=='object'||Array.isArray(row.payload)||
       row.payload.synthetic!==true)
      deny('TEAM_RECOVERY_DRAFT_INVALID');
    ids.add(row.id);
    return {
      id:row.id,original_status:row.status,
      scope:{
        workspace_id:actor.workspace_id,partner_id:row.scope.partner_id,
        business_date:row.scope.business_date,region:row.scope.region
      },
      base_revision:row.base_revision,payload:verifiedJson(row.payload)
    };
  });
  return items;
}
function aad(actor){
  return coder.encode(JSON.stringify([KIND,actor.workspace_id,actor.user_id]));
}
async function keyFor(c,secret,salt){
  const material=await c.subtle.importKey('raw',coder.encode(secret),
    'PBKDF2',false,['deriveKey']);
  return c.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',
    salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},
  false,['encrypt','decrypt']);
}
async function seal({drafts,actor,passphrase,cryptoProvider}={}){
  const who=binding(actor),secret=passphraseOrFail(passphrase);
  const items=sanitizeDrafts(drafts,who);
  const plaintext=coder.encode(JSON.stringify({kind:KIND,items}));
  if(plaintext.length>MAX_PLAINTEXT_BYTES)deny('TEAM_RECOVERY_SIZE_LIMIT');
  const c=cryptoOrFail(cryptoProvider);
  const salt=c.getRandomValues(new Uint8Array(16));
  const iv=c.getRandomValues(new Uint8Array(12));
  const key=await keyFor(c,secret,salt);
  let encrypted;
  try{encrypted=new Uint8Array(await c.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:aad(who),tagLength:128},key,plaintext));}
  catch(_){deny('TEAM_RECOVERY_ENCRYPT_FAILED');}
  return Object.freeze({kind:KIND,version:0,
    cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,
    salt:toB64(salt),iv:toB64(iv),ciphertext:toB64(encrypted)});
}
const ENVELOPE_KEYS=Object.freeze(['kind','version','cipher','kdf',
  'iterations','salt','iv','ciphertext']);
function checkedEnvelope(envelope){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
     (Object.getPrototypeOf(envelope)!==Object.prototype &&
      Object.getPrototypeOf(envelope)!==null)||
     Object.keys(envelope).length!==ENVELOPE_KEYS.length)
    deny('TEAM_RECOVERY_FORMAT_INVALID');
  const canonical={};
  for(const name of ENVELOPE_KEYS){
    const field=Object.getOwnPropertyDescriptor(envelope,name);
    if(!field||!Object.prototype.hasOwnProperty.call(field,'value'))
      deny('TEAM_RECOVERY_FORMAT_INVALID');
    canonical[name]=field.value;
  }
  if(Object.keys(envelope).some(name=>!ENVELOPE_KEYS.includes(name))||
     canonical.kind!==KIND||canonical.version!==0||
     canonical.cipher!=='AES-256-GCM'||canonical.kdf!=='PBKDF2-SHA256'||
     canonical.iterations!==ITERATIONS||
     JSON.stringify(canonical).length>MAX_ENVELOPE_BYTES)
    deny('TEAM_RECOVERY_FORMAT_INVALID');
  const salt=fromB64(canonical.salt),iv=fromB64(canonical.iv),
    cipher=fromB64(canonical.ciphertext);
  if(salt.length!==16||iv.length!==12||cipher.length<17||
     cipher.length>MAX_PLAINTEXT_BYTES+16)
    deny('TEAM_RECOVERY_FORMAT_INVALID');
  return {canonical,salt,iv,cipher};
}
function serializeEnvelope(envelope){
  return JSON.stringify(checkedEnvelope(envelope).canonical);
}
function parseEnvelope(text){
  if(typeof text!=='string'||text.length>MAX_ENVELOPE_BYTES)
    deny('TEAM_RECOVERY_FORMAT_INVALID');
  let parsed;
  try{parsed=JSON.parse(text);}
  catch(_){deny('TEAM_RECOVERY_FORMAT_INVALID');}
  // Canonical roundtrip rejects duplicate keys, reordered fields and trailing
  // content, before expensive PBKDF2 and before a recovery decision exists.
  const canonical=checkedEnvelope(parsed).canonical;
  if(JSON.stringify(canonical)!==text)deny('TEAM_RECOVERY_FORMAT_INVALID');
  return Object.freeze(canonical);
}
async function open({envelope,actor,passphrase,cryptoProvider}={}){
  const who=binding(actor),secret=passphraseOrFail(passphrase);
  const {salt,iv,cipher}=checkedEnvelope(envelope);
  const c=cryptoOrFail(cryptoProvider);
  const key=await keyFor(c,secret,salt);
  let content;
  try{
    const bytes=new Uint8Array(await c.subtle.decrypt({
      name:'AES-GCM',iv,additionalData:aad(who),tagLength:128},key,cipher));
    if(bytes.length>MAX_PLAINTEXT_BYTES)deny('TEAM_RECOVERY_SIZE_LIMIT');
    content=JSON.parse(decoder.decode(bytes));
  }catch(_){deny('TEAM_RECOVERY_AUTH_FAILED');}
  if(!content||typeof content!=='object'||Array.isArray(content)||
     Object.keys(content).sort().join('|')!=='items|kind'||
     content.kind!==KIND||!Array.isArray(content.items))
    deny('TEAM_RECOVERY_DRAFT_INVALID');
  const recoveredKeys='base_revision|id|original_status|payload|scope';
  const reconstructed=content.items.map(x=>{
    if(!x||typeof x!=='object'||Array.isArray(x)||
       Object.keys(x).sort().join('|')!==recoveredKeys)
      deny('TEAM_RECOVERY_DRAFT_INVALID');
    return {id:x.id,status:x.original_status,scope:x.scope,
      base_revision:x.base_revision,payload:x.payload};
  });
  const items=sanitizeDrafts(reconstructed,who).map(item=>deepFreeze({
    ...item,status:'QUARANTINED',auto_retry:false
  }));
  // Absolutely no auto-resume path. Reauthenticate + reconcile original
  // server receipt/idempotency before a future reviewed import may exist.
  return Object.freeze({status:'QUARANTINED',needs_server_reauthentication:true,
    needs_manual_receipt_reconciliation:true,auto_send_enabled:false,
    items:Object.freeze(items)});
}
return Object.freeze({seal,open,serializeEnvelope,parseEnvelope,KIND,ITERATIONS,MAX_ITEMS});
}));
