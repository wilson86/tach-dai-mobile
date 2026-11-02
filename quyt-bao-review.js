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
  round:"CEIL_PER_STAKE",selectors:["b","bao","lo","lô","bl","blo"],forwardAuthorized:false};
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
function prepare(raw,options={}){
 if(typeof raw!=="string"||!raw.trim())throw Error("NO_RESULT_TO_PREPARE");
 if(options.customer!=="Quýt")throw Error("QUYT_NOT_SELECTED");
 if(options.inputStage!=="CANONICAL_UNADJUSTED_RESULT")throw Error("UNTRUSTED_TRANSFORM_STAGE");
 if(options.alreadyTransformed===true)throw Error("DOUBLE_TRANSFORM_HOLD");
 const rate=parseRate(options.rate===undefined?DEFAULT_RATE:options.rate);
 const hasSourceWitness=options.sourceText!==undefined;
 const originalStakeCount=hasSourceWitness
   ?assertOriginalStakeParity(options.sourceText,raw):0;
 if(options.requireSourceWitness===true&&!hasSourceWitness)
   throw Error("SOURCE_WITNESS_REQUIRED");
 if(/PHÁT HIỆN TIN SAI|XÁC NHẬN SỐ TRÙNG|(\[\[KTS_)|không nhận ra cú pháp|(?:^|\n)\s*(?:Tổng|Kết quả|Nhóm)\b/iu.test(raw))
  throw Error("NON_BET_RESULT_HOLD");
 let count=0;const evidence=[];
 const output=raw.replace(ALIAS_RE,(full,prefix,selector,space,amount,suffix,pos)=>{
   const after=rounded(amount,rate);
   count++;evidence.push({index:count,selector:selector.toLowerCase().replace(/\s+/gu," "),
     before:amount,after});
   return prefix+selector+space+after+suffix;
 });
 if(count===0)throw Error("NO_BAO_SELECTOR_IN_RESULT");
 // Do not treat transformations as approved transport.
 return Object.freeze({kind:CONTRACT.id,source:raw,preview:output,
    alteredOccurrences:count,receipts:evidence,rate:rate.normalized,
    sourceWitnessVerified:hasSourceWitness,originalStakeCount,
    sourceUnmodified:true,stage:"PREPARED_PREVIEW_ONLY",
    forwardAuthorized:false,alreadyTransformed:false});
}
const api=Object.freeze({CONTRACT,prepare,rounded,parseRate,assertOriginalStakeParity,DEFAULT_RATE});
if(typeof module==="object"&&module.exports)module.exports=api;
if(scope)scope.KTSQuytBaoReview=api;
})(typeof window!=="undefined"?window:undefined);
