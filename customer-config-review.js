/* Customer configuration adapter: one existing review storage key, no wager data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KTSCustomerConfig=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='KTS_REVIEW_CUSTOMERS_V1';
const defaults=()=>[{id:'hien',name:'Hiền',rate:'1,000',active:true,history:[]},{id:'quyt',name:'Quýt',rate:'1,067',active:true,history:[]}];
function validate(items,parseRate){
 if(!Array.isArray(items)||items.length>40)throw Error('STORAGE_INVALID');
 const ids=new Set();
 for(const p of items){
  if(typeof p?.id!=='string'||!/^(hien|quyt|customer-[a-z0-9-]+)$/u.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>50||typeof p.rate!=='string'||!Array.isArray(p.history))throw Error('STORAGE_INVALID');
  try{parseRate(p.rate);for(const h of p.history){if(!h||typeof h.rate!=='string'||typeof h.at!=='string')throw Error();parseRate(h.rate)}}catch(_){throw Error('STORAGE_INVALID')}
  ids.add(p.id);
 }
 if(!ids.has('hien')||!ids.has('quyt'))throw Error('STORAGE_INVALID');
 return JSON.parse(JSON.stringify(items));
}
function createStore(storage,parseRate){
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof parseRate!=='function')throw Error('STORAGE_UNAVAILABLE');
 return {read(){let raw;try{raw=storage.getItem(KEY)}catch(_){throw Error('STORAGE_UNAVAILABLE')}if(raw===null)return defaults();let data;try{data=JSON.parse(raw)}catch(_){throw Error('STORAGE_INVALID')}if(data?.version!==1)throw Error('STORAGE_INVALID');return validate(data.customers,parseRate)},write(items){const safe=validate(items,parseRate);try{storage.setItem(KEY,JSON.stringify({version:1,customers:safe}))}catch(_){throw Error('STORAGE_WRITE_FAILED')}}};
}
return {KEY,createStore};});
