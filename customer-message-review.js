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
 return Object.freeze({read,add});
}
const api=Object.freeze({KEY,createStore});if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.KTSReviewSourceMessages=api;
})(typeof window!=="undefined"?window:undefined);
