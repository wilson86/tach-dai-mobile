/* KTS Quýt 1.067: candidate outbound presentation ONLY, never auto-send.
 * Canonical KTS policy uses CEIL per selector-bound stake. Existing engine
 * qualifies LO aliases, whereas this opt-in WIP also proposes B on explicit
 * operator selection. Backend must not apply a second transform.
 */
(function(scope){
"use strict";
const DEFAULT_RATE="1.067";
function parseRate(input=DEFAULT_RATE){
 if(typeof input!=="string"&&typeof input!=="number")throw Error("RATE_INVALID_TYPE");
 const raw=String(input).trim().replace(",",".");
 if(!/^\d{1,2}(?:\.\d{1,3})?$/u.test(raw))throw Error("RATE_INVALID_FORMAT");
 const parts=raw.split("."),den=10n**BigInt((parts[1]||"").length);
 const numerator=BigInt(parts.join(""));
 if(numerator<=0n||numerator>3n*den)throw Error("RATE_OUT_OF_RANGE");
 return Object.freeze({numerator,denominator:den,normalized:raw});
}
const CONTRACT={id:"QUYT_BAO_MULTIPLIER_CEIL_REVIEW_V1",customer:"Quýt",multiplier:"1.067",
  round:"CEIL_PER_AGGREGATED_EXPOSURE",selectors:["b","bao","lo","lô","bl","blo"],forwardAuthorized:false};
const ALIAS_RE=/(^|[\s,;])((?:bao[ \t]+lo|blo|bao|lô|lo|bl|b))([ \t]*)(\d+(?:[.,]\d+)?)(n)(?=$|[\s,;.])/giu;
function halfSafeDecimal(token){
 const m=/^(\d+)(?:[.,](\d+))?$/u.exec(token);
 if(!m)throw Error("STAKE_NOT_DECIMAL");
 const [whole,fract=""]= [m[1],m[2]||""];
 if(fract && !/^0*5?0*$/u.test(fract))throw Error("NON_HALF_UNIT_STAKE_HOLD");
 const den=10n**BigInt(fract.length);
 const numerator=BigInt(whole+fract);
 if((numerator*2n)%den!==0n)throw Error("NON_HALF_UNIT_STAKE_HOLD");
 const half=(numerator*2n)/den;
 if(half<=0n)throw Error("ZERO_STAKE_HOLD");
 return {num:BigInt(whole+fract),den:10n**BigInt(fract.length)};
}
function rounded(token,rate=DEFAULT_RATE){
 const {num,den}=halfSafeDecimal(token);
 const parsed=typeof rate==="object"&&rate?.numerator!==undefined?rate:parseRate(rate);
 const denominator=den*parsed.denominator;
 const n=(num*parsed.numerator+denominator-1n)/denominator;
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("STAKE_OVERFLOW");
 return n.toString();
}
function witnessAtoms(source){
 if(typeof source!=="string"||!source.trim())throw Error("MISSING_ORIGINAL_SOURCE_WITNESS");
 const found=[];
 source.replace(ALIAS_RE,(full,prefix,selector,space,amount,suffix)=>{
   const s=selector.toLowerCase().replace(/\\s+/gu," ").trim();
   const canonical=s==="b"?"B":"LO";
   const stake=halfSafeDecimal(amount);
   found.push([canonical,(stake.num*2n/stake.den).toString()]);
   return full;
 });
 if(!found.length)throw Error("SOURCE_WITNESS_NO_BAO_STAKES");
 return found;
}
function assertOriginalStakeParity(source,output){
 const before=witnessAtoms(source),after=witnessAtoms(output);
 if(before.length!==after.length)throw Error("AGGREGATED_OR_SPLIT_STAKES_HOLD");
 for(let i=0;i<before.length;i++)
   if(before[i][0]!==after[i][0]||before[i][1]!==after[i][1])
     throw Error("CHANGED_SOURCE_STAKES_HOLD");
 return before.length;
}
// Legacy per-atom transformer is disabled: it violates the operator-approved
// aggregate-before-rate money rule. All callers must supply verified grouping.
function prepare(raw,options={}){return prepareGrouped(raw,options)}

// USER-APPROVED ORDER: aggregate identical (station, number, canonical wager
// kind) stakes first, then apply CEIL(rate * aggregated stake) ONCE.
// Strict review-only adapter: never modify existing generated KTS engine.
const GROUP_SELECTOR=/((?:bao[ \t]+lo|blo|bao|lô|lo|bl|b|dd|d-d|dau|duoi|dui|đầu|đuôi))[ \t]*(\d+(?:[.,]\d+)?)n(?![\p{L}\p{N}])/giu;
function fmtHalf(units){
 if(!Number.isSafeInteger(units)||units<=0)throw Error("GROUP_STAKE_INVALID");
 return Math.floor(units/2).toString()+(units%2?".5":"");
}
function sourceExposures(text,cleanCore,region){
 if(!cleanCore||typeof cleanCore.parse!=="function")throw Error("CLEAN_CORE_REQUIRED");
 // Canonical parser validates the complete input; regex tags merely preserve
 // the B vs LO distinction that the WIP clean display aliases both to "b".
 const clauses=cleanCore.parse(text,{region});
 const matches=[...text.matchAll(GROUP_SELECTOR)];
 if(matches.length!==clauses.length)throw Error("CANONICAL_SELECTOR_PROVENANCE_HOLD");
 const map=new Map();
 for(let i=0;i<clauses.length;i++){
  const c=clauses[i],tag=matches[i][1].toLowerCase().replace(/\s+/gu,"");
  const kind=tag==="b"?"b":["bao","baolo","lô","lo","bl","blo"].includes(tag)?"lo":c.kind;
  if(!c.station)throw Error("STATION_REQUIRED_FOR_GROUPING");
  for(const n of c.numbers){
   const key=JSON.stringify([c.station,kind,n]);
   const before=map.get(key)?.half||0;
   if(!Number.isSafeInteger(before+c.half))throw Error("GROUP_STAKE_OVERFLOW");
   map.set(key,{station:c.station,kind,number:n,half:before+c.half});
  }
 }
 return {map,clauses,repeatBlocks:cleanCore.tandem(clauses)};
}
function prepareGrouped(output,options={}){
 if(options.customer!=="Quýt")throw Error("QUYT_NOT_SELECTED");
 if(options.inputStage!=="CANONICAL_UNADJUSTED_RESULT")throw Error("UNTRUSTED_TRANSFORM_STAGE");
 if(options.alreadyTransformed===true)throw Error("DOUBLE_TRANSFORM_HOLD");
 if(typeof options.sourceText!=="string"||!options.sourceText.trim())
   throw Error("SOURCE_WITNESS_REQUIRED");
 if(typeof output!=="string"||!output.trim()||/\[\[KTS_|PHÁT HIỆN TIN SAI|không nhận ra cú pháp/iu.test(output))
   throw Error("INVALID_CANONICAL_RESULT_HOLD");
 const rate=parseRate(options.rate===undefined?DEFAULT_RATE:options.rate);
 const clean=options.cleanCore;
 const region=options.region;
 const src=sourceExposures(options.sourceText,clean,region);
 const dest=sourceExposures(output,clean,region);
 // No silently split or changed money and no already-applied multiplier.
 if(src.map.size!==dest.map.size)throw Error("SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD");
 for(const [key,stake] of src.map){
  const other=dest.map.get(key);
  if(!other||other.half!==stake.half)throw Error("SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD");
 }
 // Reject changes to the original order, even when all amounts sum correctly.
 const sourceOrder=[...src.map.keys()],outputOrder=[...dest.map.keys()];
 for(let i=0;i<sourceOrder.length;i++)
  if(sourceOrder[i]!==outputOrder[i])throw Error("SOURCE_OUTPUT_ORDER_MISMATCH_HOLD");
 if(src.repeatBlocks.length&&options.repeatDecision!=="keep_all")
   throw Error("DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED");
 if(options.repeatDecision==="remove_copies")throw Error("QUYT_REPETITIONS_MUST_NOT_BE_DELETED");
 const grouped=[],receipts=[];
 let adjusted=0;
 for(const e of src.map.values()){
  const amount=fmtHalf(e.half),apply=e.kind==="b"||e.kind==="lo";
  const after=apply&&!options.exactOnly?rounded(amount,rate):amount;
  if(apply)adjusted++;
  receipts.push({station:e.station,selector:e.kind,number:e.number,before:amount,after});
  // Only group consecutive equal exposures; no reordering across other bets.
  const previous=grouped[grouped.length-1];
  if(previous && previous.station===e.station && previous.kind===e.kind && previous.amount===after)
   previous.numbers.push(e.number);
  else grouped.push({...e,amount:after,numbers:[e.number]});
 }
 if(!adjusted)throw Error("NO_BAO_SELECTOR_IN_RESULT");
 const normalized=grouped.map(e=>(options.omitRegion?"":e.station.toUpperCase()+" ")+
   e.numbers.join(" ")+" "+e.kind+e.amount+"n").join("\n");
 return Object.freeze({kind:"QUYT_BAO_AGGREGATE_THEN_MULTIPLY_REVIEW_V2",
  original:options.sourceText,source:output,preview:normalized,rate:rate.normalized,
  sourceWitnessVerified:true,groupedBeforeFactor:true,
  rawClauseCount:src.clauses.length,duplicateBlocks:src.repeatBlocks,
  aggregatedExposures:src.map.size,alteredOccurrences:adjusted,receipts,
  forwardAuthorized:false,stage:"PREPARED_PREVIEW_ONLY"});
}


// Review values retain exact fixed-point arithmetic; they are not transferable wagers.
function prepareExactGrouped(output,options={}){
 const checked=prepareGrouped(output,{...options,exactOnly:true}),factor=parseRate(options.rate===undefined?DEFAULT_RATE:options.rate);
 function exact(amount,apply){
  const stake=halfSafeDecimal(amount);let n=stake.num*(apply?factor.numerator:1n),d=stake.den*(apply?factor.denominator:1n);
  const whole=n/d;let rem=n%d,frac='';
  while(rem&&frac.length<8){rem*=10n;frac+=(rem/d).toString();rem%=d}
  if(rem)throw Error('EXACT_DECIMAL_UNREPRESENTABLE_HOLD');
  return whole.toString()+(frac?'.'+frac:'');
 }
 const receipts=checked.receipts.map(e=>({...e,exact:exact(e.before,e.selector==='b'||e.selector==='lo'),rounded:null,roundingPolicy:'HOLD_UNAPPROVED',transferAuthorized:false}));
 const preview=receipts.map(e=>(options.omitRegion?'':e.station.toUpperCase()+' ')+e.number+' '+e.selector+' '+e.before+'n → '+e.exact+'n (chính xác; chưa duyệt làm tròn)').join('\n');
 return Object.freeze({...checked,kind:'CUSTOMER_EXACT_REVIEW_V1',preview,receipts,roundedAmount:null,roundingPolicy:'HOLD_UNAPPROVED',forwardAuthorized:false});
}

const api=Object.freeze({CONTRACT,prepare,rounded,parseRate,assertOriginalStakeParity,prepareGrouped,prepareExactGrouped,sourceExposures,DEFAULT_RATE});
if(typeof module==="object"&&module.exports)module.exports=api;
if(scope)scope.KTSQuytBaoReview=api;
})(typeof window!=="undefined"?window:undefined);
