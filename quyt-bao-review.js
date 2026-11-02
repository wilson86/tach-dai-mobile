/* KTS Quýt 1.067: candidate outbound presentation ONLY, never auto-send.
 * Canonical KTS policy uses CEIL per selector-bound stake. Existing engine
 * qualifies LO aliases, whereas this opt-in WIP also proposes B on explicit
 * operator selection. Backend must not apply a second transform.
 */
(function(scope){
"use strict";
const MULTIPLIER_NUMERATOR=1067n, MULTIPLIER_DENOMINATOR=1000n;
const CONTRACT={id:"QUYT_BAO_MULTIPLIER_CEIL_REVIEW_V1",customer:"Quýt",multiplier:"1.067",
  round:"CEIL_PER_STAKE",selectors:["b","bao","lo","lô","bl","blo"],forwardAuthorized:false};
const ALIAS_RE=/(^|[\s,;])((?:bao[ \t]+lo|blo|bao|lô|lo|bl|b))([ \t]*)(\d+(?:[.,]\d+)?)(n)(?=$|[\s,;.])/giu;
function halfSafeDecimal(token){
 const m=/^(\d+)(?:[.,](\d+))?$/u.exec(token);
 if(!m)throw Error("STAKE_NOT_DECIMAL");
 const [whole,fract=""]= [m[1],m[2]||""];
 if(fract && !/^0*5?0*$/u.test(fract))throw Error("NON_HALF_UNIT_STAKE_HOLD");
 const half=BigInt(whole)*2n+(fract.includes("5")?1n:0n);
 if(half<=0n)throw Error("ZERO_STAKE_HOLD");
 return {num:BigInt(whole+fract),den:10n**BigInt(fract.length)};
}
function rounded(token){
 const {num,den}=halfSafeDecimal(token);
 const denominator=den*MULTIPLIER_DENOMINATOR;
 const n=(num*MULTIPLIER_NUMERATOR+denominator-1n)/denominator;
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("STAKE_OVERFLOW");
 return n.toString();
}
function prepare(raw,options={}){
 if(typeof raw!=="string"||!raw.trim())throw Error("NO_RESULT_TO_PREPARE");
 if(options.customer!=="Quýt")throw Error("QUYT_NOT_SELECTED");
 if(options.inputStage!=="CANONICAL_UNADJUSTED_RESULT")throw Error("UNTRUSTED_TRANSFORM_STAGE");
 if(options.alreadyTransformed===true)throw Error("DOUBLE_TRANSFORM_HOLD");
 if(/PHÁT HIỆN TIN SAI|XÁC NHẬN SỐ TRÙNG|(\[\[KTS_)|không nhận ra cú pháp|(?:^|\n)\s*(?:Tổng|Kết quả|Nhóm)\b/iu.test(raw))
  throw Error("NON_BET_RESULT_HOLD");
 let count=0;const evidence=[];
 const output=raw.replace(ALIAS_RE,(full,prefix,selector,space,amount,suffix,pos)=>{
   const after=rounded(amount);
   count++;evidence.push({index:count,selector:selector.toLowerCase().replace(/\s+/gu," "),
     before:amount,after});
   return prefix+selector+space+after+suffix;
 });
 if(count===0)throw Error("NO_BAO_SELECTOR_IN_RESULT");
 // Do not treat transformations as approved transport.
 return Object.freeze({kind:CONTRACT.id,source:raw,preview:output,
    alteredOccurrences:count,receipts:evidence,
    sourceUnmodified:true,stage:"PREPARED_PREVIEW_ONLY",
    forwardAuthorized:false,alreadyTransformed:false});
}
const api=Object.freeze({CONTRACT,prepare,rounded});
if(typeof module==="object"&&module.exports)module.exports=api;
if(scope)scope.KTSQuytBaoReview=api;
})(typeof window!=="undefined"?window:undefined);
