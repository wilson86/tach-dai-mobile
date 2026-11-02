/* KTS Clean & Aggregate review-only WIP; no parser, money-engine or source edits. */
(function(root){
"use strict";
const ALIAS={b:"b",blo:"b",lo:"b",bao:"b",dd:"dd","d-d":"dd",dau:"dau","đầu":"dau",dui:"duoi",duoi:"duoi","đuôi":"duoi"};
const REGION={hn:"mb",mb:"mb",mn:"mn",mt:"mt"};
const kindRx=/^(?:d-d|đầu|đuôi|duoi|dau|dui|blo|bao|dd|lo|b)/iu;
const unitRx=/^(\d+(?:[.,]\d+)?)n(?![\p{L}\p{N}])/iu;
const labelRx=/^(hn|mb|mn|mt)(?![\p{L}\p{N}])/iu;
const numberRx=/^\d{2}(?!\d)/u;
const MAX_CLAUSES=500;
function fail(code,at){throw Error(code+(at===undefined?"":" @"+at))}
function units(token){
 const match=unitRx.exec(token);if(!match||match[0].length!==token.length)fail("STAKE_INVALID");
 const n=match[1].replace(",",".");const [whole,fraction=""]=n.split(".");
 if(fraction!=="" && fraction!=="0"&&fraction!=="5")fail("ONLY_HALF_POINTS");
 const half=Number(whole)*2+(fraction==="5"?1:0);
 if(!Number.isSafeInteger(half)||half<=0)fail("STAKE_OVERFLOW_OR_ZERO");
 return half;
}
function fmt(half){return Math.floor(half/2)+(half%2?".5":"")}
function lex(raw){
 if(typeof raw!=="string"||!raw.trim())fail("EMPTY_MESSAGE");
 const out=[];let i=0,ln=1;
 const text=raw.toLowerCase();
 while(i<text.length){
  if(/[\s;|]/u.test(text[i])||text[i]==="."||text[i]===","){
   if(text[i]==="\n")ln++;i++;continue;
  }
  const suffix=text.slice(i);
  let m=unitRx.exec(suffix),type="amount";
  if(!m){m=labelRx.exec(suffix);type="station"}
  if(!m){m=kindRx.exec(suffix);type="selector"}
  if(!m){m=numberRx.exec(suffix);type="number"}
  if(!m)fail("UNRECOGNIZED_FRAGMENT",i);
  // Prevent swallowing a selector prefix in an unknown word (e.g. duix).
  if(type==="selector"&&/[\p{L}]/u.test(suffix[m[0].length]||""))fail("UNKNOWN_SELECTOR",i);
  out.push({type,value:m[0],offset:i,physicalLine:ln});
  i+=m[0].length;
  if(out.length>20000)fail("TOKEN_LIMIT");
 }
 return out;
}
function parse(raw,options={}){
 const external=options.region?REGION[String(options.region).toLowerCase()]:null;
 if(options.region&&!external)fail("REGION_INVALID");
 const tokens=lex(raw),clauses=[];
 let station=external,group=[],previous=[],waiting=false;
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t.type==="station"){
   if(group.length&&!waiting)fail("STATION_INTERRUPTS_GROUP",t.offset);
   station=REGION[t.value];if(external&&station!==external)fail("REGION_CONFLICT",t.offset);
   group=[];previous=[];waiting=false;continue;
  }
  if(t.type==="number"){
   if(waiting){group=[];previous=[];waiting=false}
   if(group.includes(t.value))fail("DUPLICATE_NUMBER_WITHIN_GROUP",t.offset);
   group.push(t.value);continue;
  }
  if(t.type==="selector"){
   const numbers=group.length?group:previous;
   if(!numbers.length)fail("SELECTOR_WITHOUT_NUMBERS",t.offset);
   const amount=tokens[++i];
   if(!amount||amount.type!=="amount")fail("SELECTOR_WITHOUT_AMOUNT",t.offset);
   const half=units(amount.value),kind=ALIAS[t.value];
   if(!kind)fail("UNKNOWN_SELECTOR",t.offset);
   clauses.push({station,numbers:[...numbers],kind,half,line:t.physicalLine,offset:t.offset});
   if(clauses.length>MAX_CLAUSES)fail("CLAUSE_LIMIT");
   previous=[...numbers];group=[];waiting=true;continue;
  }
  fail("AMOUNT_WITHOUT_SELECTOR",t.offset);
 }
 if(group.length||!clauses.length)fail("INCOMPLETE_TAIL");
 return clauses;
}
function fingerprint(c){return JSON.stringify([c.station,c.numbers,c.kind,c.half])}
function tandem(clauses){
 const xs=clauses.map(fingerprint),result=[];let cursor=0;
 const coveredSecond=new Set();
 while(cursor<xs.length){
  let found=0;
  for(let len=Math.floor((xs.length-cursor)/2);len>0;len--){
   let same=true;for(let j=0;j<len;j++)if(xs[cursor+j]!==xs[cursor+len+j]){same=false;break}
   if(same){found=len;break}
  }
  if(found){
   result.push({first:cursor+1,second:cursor+found+1,length:found});
   for(let j=0;j<found;j++)coveredSecond.add(cursor+found+j);
   cursor+=2*found;
  }else cursor++;
 }
 // Separated identical wagers may mean a second order OR a paste copy.
 // They must not bypass the operator-confirmation gate.
 const firstSeen=new Map();
 for(let i=0;i<xs.length;i++){
  if(!firstSeen.has(xs[i])){firstSeen.set(xs[i],i);continue}
  const first=firstSeen.get(xs[i]);
  if(!coveredSecond.has(i)&&i>first+1)
   result.push({first:first+1,second:i+1,length:1,nonAdjacent:true});
 }
 return result;
}
function preview(raw,options={}){
 const decision=options.repeatDecision||"ask_operator";
 if(!["ask_operator","keep_all","remove_copies"].includes(decision))fail("DUPLICATE_DECISION_INVALID");
 const clauses=parse(raw,options),repeated=tandem(clauses);
 if(decision==="remove_copies"&&(!repeated.length||typeof options.decisionReference!=="string"||!options.decisionReference.trim()))
  fail("EXPLICIT_COPY_REMOVAL_DECISION_REQUIRED");
 if(decision==="remove_copies"&&repeated.some(t=>t.nonAdjacent))fail("NON_ADJACENT_PASTE_MANUAL_SOURCE_REVIEW_REQUIRED");
 const excluded=new Set();
 if(decision==="remove_copies")for(const t of repeated)for(let j=0;j<t.length;j++)excluded.add(t.second+j-1);
 const rawTotals={b:0,dd:0,dau:0,duoi:0},totals={b:0,dd:0,dau:0,duoi:0};
 const exposures=new Map();
 for(let i=0;i<clauses.length;i++){
  const c=clauses[i];
  const rawStake=c.half*c.numbers.length;
  if(!Number.isSafeInteger(rawStake+rawTotals[c.kind]))fail("TOTAL_OVERFLOW");
  rawTotals[c.kind]+=rawStake;
  if(excluded.has(i))continue;
  for(const n of c.numbers){
   const key=JSON.stringify([c.station,c.kind,n]);
   const before=exposures.get(key)?.half||0;
   if(!Number.isSafeInteger(before+c.half))fail("EXPOSURE_OVERFLOW");
   exposures.set(key,{station:c.station,kind:c.kind,number:n,half:before+c.half});
  }
 }
 const groups=[];
 for(const e of exposures.values()){
  if(!Number.isSafeInteger(totals[e.kind]+e.half))fail("TOTAL_OVERFLOW");
  totals[e.kind]+=e.half;
  const previous=groups[groups.length-1];
  // Preserve first-seen wager order, never coalesce across another number.
  if(previous && previous.station===e.station && previous.kind===e.kind && previous.half===e.half)
   previous.numbers.push(e.number);
  else groups.push({station:e.station,kind:e.kind,half:e.half,numbers:[e.number]});
 }
 const missing=clauses.some(c=>!c.station),needsDecision=repeated.length>0&&decision==="ask_operator";
 const needsReview=missing||needsDecision;
 const lines=groups.map(x=>(options.omitRegion?"":(x.station?x.station.toUpperCase()+" ":""))+
  x.numbers.join(" ")+" "+x.kind+fmt(x.half)+"n");
 if(options.omitRegion&&(missing||new Set(clauses.map(c=>c.station)).size!==1||!options.region))
  fail("BARE_OUTPUT_REQUIRES_SINGLE_EXPLICIT_REGION");
 for(const kind of Object.keys(rawTotals)){
  if(decision!=="remove_copies"&&rawTotals[kind]!==totals[kind])fail("POINT_CONSERVATION_FAILED");
 }
 const halfsum=obj=>Object.values(obj).reduce((a,b)=>{
  if(!Number.isSafeInteger(a+b))fail("SUM_OVERFLOW");return a+b;
 },0);
 return {status:needsReview?"HOLD_REVIEW":"REVIEW_ONLY",
  normalized:lines.join("\n"),originalText:raw,rawClauses:clauses.length,
  keptClauses:clauses.length-excluded.size,removedClauses:excluded.size,
  repeated,uniqueExposures:exposures.size,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,fmt(v)])),
  rawTotals:Object.fromEntries(Object.entries(rawTotals).map(([k,v])=>[k,fmt(v)])),
  total:fmt(halfsum(totals)),rawTotal:fmt(halfsum(rawTotals)),
  repeatDecision:decision,requiresConfirmation:needsDecision,
  missingRegion:missing,forwardAuthorized:false,sourceLines:raw.split(/\r?\n/).length};
}
const api=Object.freeze({parse,preview,tandem,VERSION:"review-only-1"});
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.KTSCleanAggregate=api;
})(typeof window!=="undefined"?window:undefined);
