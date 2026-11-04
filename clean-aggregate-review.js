/* KTS Clean & Aggregate review-only WIP; no parser, money-engine or source edits. */
(function(root){
"use strict";
const ALIAS={b:"b",blo:"lo",lo:"lo",bao:"lo","bao lo":"lo",bl:"lo","lô":"lo",dd:"dd","d-d":"dd",dau:"dau","đầu":"dau",dui:"duoi","đui":"duoi",duoi:"duoi","đuôi":"duoi",da:"da","đá":"da",dat:"da",dathang:"da",xc:"xc",x:"xc"};
const REGION={hn:"mb",mb:"mb",mn:"mn",mt:"mt"};
const kindRx=/^(?:d-d|đầu|đuôi|duoi|dau|dui|đui|dathang|dat|đá|da|xc|bao[ \t]+lo|blo|bao|lô|bl|dd|lo|b|x)/iu;
const unitRx=/^(\d+(?:[.,]\d+)?)n(?![\p{L}\p{N}])/iu;
const labelRx=/^(hn|mb|mn|mt)(?![\p{L}\p{N}])/iu;
const numberRx=/^\d{2,4}(?!\d)/u;
const MAX_CLAUSES=500;
const EXPECTED_ENGINE="0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487";
// Read-only station admissions must be bound to the generated day/engine authority.
function stationCodes(options,market){
 if(market!=="mn"&&market!=="mt")return [];
 const date=String(options.businessDate||"");
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))return [];
 const [year,month,day]=date.split("-").map(Number),d=new Date(year,month-1,day,12);
 if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return [];
 const calendar=options.calendarAuthority||(typeof globalThis!=="undefined"?globalThis.KTS_STATION_CALENDAR:null);
 if(!calendar||calendar.schema!=="KTS_STATION_SCHEDULE_AUTHORITY_V1"||
   calendar.engine_sha256!==EXPECTED_ENGINE)return [];
 const rows=calendar[market.toUpperCase()]?.[String(d.getDay())];
 return Array.isArray(rows)?rows.map(row=>String(row?.[0]||"").toLowerCase()).filter(code=>/^[a-z]{1,5}$/u.test(code)):[];
}

function fail(code,at,line,selector){throw Error(code+(at===undefined?"":" @"+at)+(line===undefined?"":" line="+line)+(selector?" selector="+selector:""))}
function units(token){
 const match=unitRx.exec(token);if(!match||match[0].length!==token.length)fail("STAKE_INVALID");
 const n=match[1].replace(",",".");const [whole,fraction=""]=n.split(".");
 if(fraction!=="" && fraction!=="0"&&fraction!=="5")fail("ONLY_HALF_POINTS");
 const half=Number(whole)*2+(fraction==="5"?1:0);
 if(!Number.isSafeInteger(half)||half<=0)fail("STAKE_OVERFLOW_OR_ZERO");
 return half;
}
function fmt(half){return Math.floor(half/2)+(half%2?".5":"")}
function lex(raw,options={}){
 const region=options.region?REGION[String(options.region).toLowerCase()]:null;
 const codes=stationCodes(options,region);
 if(typeof raw!=="string"||!raw.trim())fail("EMPTY_MESSAGE");
 const out=[];let i=0,ln=1;
 const text=raw.toLowerCase();
 while(i<text.length){
  if(/[\s;|]/u.test(text[i])||text[i]==="."||text[i]===","){
   if(text[i]==="\n")ln++;i++;continue;
  }
  const suffix=text.slice(i);
  let m=unitRx.exec(suffix),type="amount";
  if(!m){m=labelRx.exec(suffix);type="region"}
  if(!m&&codes.length){
   const named=/^([a-z]{1,5})(?![\p{L}\p{N}])/iu.exec(suffix);
   if(named&&codes.includes(named[1])){m=named;type="named_station"}
  }
  if(!m){m=kindRx.exec(suffix);type="selector"}
  if(!m){m=numberRx.exec(suffix);type="number"}
  if(!m)fail("UNRECOGNIZED_FRAGMENT",i,ln);
  // Prevent swallowing a selector prefix in an unknown word (e.g. duix).
  if(type==="selector"&&/[\p{L}]/u.test(suffix[m[0].length]||""))fail("UNKNOWN_SELECTOR",i,ln);
  if(type==="selector"&&/^\s*\d+(?:[.,]\d+)?(?![\p{L}\p{N}.,])/u.test(suffix.slice(m[0].length)))
   fail("MISSING_UNIT_HOLD",i,ln,m[0]);
  out.push({type,value:m[0],offset:i,physicalLine:ln});
  i+=m[0].length;
  if(out.length>20000)fail("TOKEN_LIMIT");
 }
 return out;
}
function parse(raw,options={}){
 const external=options.region?REGION[String(options.region).toLowerCase()]:null;
 if(options.region&&!external)fail("REGION_INVALID");
 const tokens=lex(raw,options),clauses=[];
 let market=external,station=external==="mb"?"mb":null,group=[],previous=[],waiting=false;
 let lastStationLine=0;
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t.type==="region"){
   if(group.length&&!waiting)fail("STATION_INTERRUPTS_GROUP",t.offset);
   market=REGION[t.value];if(external&&market!==external)fail("REGION_CONFLICT",t.offset);
   station=market==="mb"?"mb":null;lastStationLine=0;
   group=[];previous=[];waiting=false;continue;
  }
  if(t.type==="named_station"){
   if(market!=="mn"&&market!=="mt")fail("STATION_REGION_INVALID_HOLD",t.offset,t.physicalLine);
   if(group.length&&!waiting)fail("STATION_INTERRUPTS_GROUP",t.offset,t.physicalLine);
   if(station&&lastStationLine===t.physicalLine)
    fail("MULTI_STATION_REVIEW_HOLD",t.offset,t.physicalLine);
   station=t.value;lastStationLine=t.physicalLine;
   group=[];previous=[];waiting=false;continue;
  }
  if(t.type==="number"){
   // Only MB can omit a station at the start of the ticket. A region marker
   // ("mn"/"mt") is NOT a station name, and must never make a wager eligible
   // for review-money grouping. The canonical Tách engine validates real
   // station aliases against the selected day's calendar; this review-only
   // tokenizer does not yet implement that contract and MUST fail closed.
   if((market==="mn"||market==="mt")&&!station)
    fail("STATION_NAME_REQUIRED_HOLD",t.offset,t.physicalLine);
   if(waiting){group=[];previous=[];waiting=false}
   if(group.includes(t.value))fail("DUPLICATE_NUMBER_WITHIN_GROUP",t.offset);
   group.push(t.value);continue;
  }
  if(t.type==="selector"){
   const numbers=group.length?group:previous;
   if(!numbers.length)fail("SELECTOR_WITHOUT_NUMBERS",t.offset);
   if((market==="mn"||market==="mt")&&!station)
    fail("STATION_NAME_REQUIRED_HOLD",t.offset,t.physicalLine);
   const amount=tokens[++i];
   if(!amount||amount.type!=="amount")fail("SELECTOR_WITHOUT_AMOUNT",t.offset,t.physicalLine,t.value);
   const half=units(amount.value),kind=ALIAS[t.value.replace(/\s+/gu," ")];
   if(!kind)fail("UNKNOWN_SELECTOR",t.offset);
   // Longer XC numbers may be recognized for diagnosis only; do not extend
   // the approved two-digit grouping rules to other selectors.
   if(kind!=="xc"&&numbers.some(value=>value.length!==2))fail("NUMBER_WIDTH_AUTHORITY_HOLD",t.offset,t.physicalLine,kind);
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
 const unsupported=clauses.find(c=>c.kind==="da"||c.kind==="xc");
 if(unsupported)fail("MONEY_AUTHORITY_HOLD",unsupported.offset,unsupported.line,unsupported.kind);
 if(decision==="remove_copies"&&(!repeated.length||typeof options.decisionReference!=="string"||!options.decisionReference.trim()))
  fail("EXPLICIT_COPY_REMOVAL_DECISION_REQUIRED");
 if(decision==="remove_copies"&&repeated.some(t=>t.nonAdjacent))fail("NON_ADJACENT_PASTE_MANUAL_SOURCE_REVIEW_REQUIRED");
 const excluded=new Set();
 if(decision==="remove_copies")for(const t of repeated)for(let j=0;j<t.length;j++)excluded.add(t.second+j-1);
 const rawTotals={b:0,lo:0,dd:0,dau:0,duoi:0},totals={b:0,lo:0,dd:0,dau:0,duoi:0};
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
