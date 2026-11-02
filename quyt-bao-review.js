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
function prepare(raw,options={}){
 if(typeof raw!=="string"||!raw.trim())throw Error("NO_RESULT_TO_PREPARE");
 if(options.customer!=="Quýt")throw Error("QUYT_NOT_SELECTED");
 if(options.inputStage!=="CANONICAL_UNADJUSTED_RESULT")throw Error("UNTRUSTED_TRANSFORM_STAGE");
 if(options.alreadyTransformed===true)throw Error("DOUBLE_TRANSFORM_HOLD");
 const rate=parseRate(options.rate===undefined?DEFAULT_RATE:options.rate);
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
    sourceUnmodified:true,stage:"PREPARED_PREVIEW_ONLY",
    forwardAuthorized:false,alreadyTransformed:false});
}
const api=Object.freeze({CONTRACT,prepare,rounded,parseRate,DEFAULT_RATE});
if(typeof module==="object"&&module.exports)module.exports=api;
if(scope)scope.KTSQuytBaoReview=api;
})(typeof window!=="undefined"?window:undefined);
