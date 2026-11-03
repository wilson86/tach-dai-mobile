/* Review-only source message store: never dispatch, mutate wagers, or infer identity. */
(function(root){
"use strict";
const KEY="KTS_REVIEW_SOURCE_MESSAGES_V1";
function createStore(storage){
 function read(){
  const raw=storage.getItem(KEY); if(raw===null)return [];
  let value;try{value=JSON.parse(raw)}catch(_){throw Error("MESSAGE_STORAGE_CORRUPT_HOLD")}
  if(!Array.isArray(value))throw Error("MESSAGE_STORAGE_CORRUPT_HOLD");
  const ids=new Set();
  for(const item of value){
   if(!item||typeof item!=="object"||typeof item.source_message_id!=="string"||!item.source_message_id||ids.has(item.source_message_id)||typeof item.customer_id!=="string"||!item.customer_id||typeof item.original_text!=="string"||!item.original_text.trim()||typeof item.source_system!=="string"||!item.source_system||typeof item.received_at!=="string"||!item.received_at||typeof item.market!=="string"||!item.market||typeof item.business_date!=="string"||!item.business_date)throw Error("MESSAGE_STORAGE_CORRUPT_HOLD");
   ids.add(item.source_message_id);
  }
  return value;
 }
 function add(item){
  const current=read();
  if(!item||typeof item.source_message_id!=="string"||!item.source_message_id||typeof item.customer_id!=="string"||!item.customer_id||typeof item.original_text!=="string"||!item.original_text.trim()||typeof item.source_system!=="string"||!item.source_system||typeof item.received_at!=="string"||!item.received_at||typeof item.market!=="string"||!item.market||typeof item.business_date!=="string"||!item.business_date)throw Error("MESSAGE_METADATA_REQUIRED_HOLD");
  const existing=current.find(x=>x.source_message_id===item.source_message_id);
  if(existing){
   for(const key of ["customer_id","original_text","source_system","market","business_date","source_timestamp","source_revision"])if((existing[key]??null)!==(item[key]??null))throw Error("SOURCE_REVISION_CONFLICT_HOLD");
   return {status:"ALREADY_PRESENT",message:existing};
  }
  const entry={source_message_id:item.source_message_id,customer_id:item.customer_id,source_system:item.source_system,source_timestamp:item.source_timestamp??null,source_revision:item.source_revision??null,received_at:item.received_at,original_text:item.original_text,market:item.market,business_date:item.business_date,message_status:"RAW_SOURCE",original_lines:item.original_text.split(/\n/).map((text,i)=>({line:i+1,text}))};
  try{storage.setItem(KEY,JSON.stringify([...current,entry]))}catch(_){throw Error("MESSAGE_STORAGE_WRITE_HOLD")}
  return {status:"ADDED",message:entry};
 }
 // All UI writers on this origin must serialize the full read/modify/write.
 function addLocked(item,locks){
  if(!locks||typeof locks.request!=="function")throw Error("MESSAGE_LOCK_UNAVAILABLE_HOLD");
  return locks.request("KTS_REVIEW_SOURCE_MESSAGES_V1_WRITE",{mode:"exclusive"},()=>add(item));
 }
 return Object.freeze({read,add,addLocked});
}

// Aggregate independently identified original messages. This is a review-only
// calculator: it cannot produce an authorized transfer or rounded amount.
function aggregate(messages,options){
 if(!Array.isArray(messages)||!messages.length||!options||!options.customerId||!options.market||!options.businessDate)throw Error("MISSING_SCOPE_HOLD");
 const {core,cleanCore}=options;if(!core||!cleanCore)throw Error("CORE_REQUIRED_HOLD");
 const factor=core.parseRate(options.rate), ids=new Set(),grouped=new Map();
 for(const message of messages){
  if(!message||message.customer_id!==options.customerId||message.market!==options.market||message.business_date!==options.businessDate||message.message_status!=="RAW_SOURCE"||!message.source_message_id||ids.has(message.source_message_id))throw Error("SOURCE_SCOPE_OR_ID_HOLD");
  ids.add(message.source_message_id);
  if(/(^|\n)\s*\|[^\n]*\d|\.\./u.test(message.original_text))throw Error("MALFORMED_PREFIX_HOLD");
  const parsed=core.sourceExposures(message.original_text,cleanCore,options.market);
  if(parsed.repeatBlocks.length)throw Error("DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED");
  const tags=[...message.original_text.matchAll(/((?:bao[ \t]+lo|blo|bao|lô|lo|bl|b|dd|d-d|dau|duoi|dui|đầu|đuôi))[ \t]*(\d+(?:[.,]\d+)?)n(?![\p{L}\p{N}])/giu)];
  if(tags.length!==parsed.clauses.length)throw Error("SOURCE_PROVENANCE_HOLD");
  for(let i=0;i<parsed.clauses.length;i++){
   const c=parsed.clauses[i],tag=tags[i][1].toLowerCase().replace(/\s+/gu,"");
   const kind=tag==="b"?"b":["bao","baolo","lô","lo","bl","blo"].includes(tag)?"lo":c.kind;
   if(!c.station)throw Error("STATION_REQUIRED_HOLD");
   for(const number of c.numbers){
    const key=JSON.stringify([c.station,kind,number]);let entry=grouped.get(key);
    if(!entry){entry={station:c.station,kind,number,half:0,provenance:[]};grouped.set(key,entry)}
    if(!Number.isSafeInteger(entry.half+c.half))throw Error("GROUP_STAKE_OVERFLOW");
    entry.half+=c.half;entry.provenance.push({source_message_id:message.source_message_id,line:c.line,half:c.half,selector:tags[i][1]});
   }
  }
 }
 for(const e of grouped.values())if(e.kind==="b"&&grouped.has(JSON.stringify([e.station,"lo",e.number])))throw Error("B_LO_AUTHORITY_HOLD");
 function decimal(n,d){let out=(n/d).toString(),r=n%d,f="";while(r&&f.length<8){r*=10n;f+=(r/d).toString();r%=d}if(r)throw Error("EXACT_DECIMAL_HOLD");return out+(f?"."+f:"")}
 const order={b:0,lo:0,dd:2,dau:4,duoi:5};
 const entries=[...grouped.values()].sort((a,b)=>(order[a.kind]??99)-(order[b.kind]??99));
 for(const e of entries){e.original=decimal(BigInt(e.half),2n);const apply=e.kind==="b"||e.kind==="lo";e.exact=decimal(BigInt(e.half)*(apply?factor.numerator:1n),2n*(apply?factor.denominator:1n));e.rounded=null;}
 return Object.freeze({entries,rate:factor.normalized,roundingPolicy:"HOLD_UNAPPROVED",forwardAuthorized:false});
}

const api=Object.freeze({KEY,createStore,aggregate});if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.KTSReviewSourceMessages=api;
})(typeof window!=="undefined"?window:undefined);
