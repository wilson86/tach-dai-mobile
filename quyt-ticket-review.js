/* Issue #18: source-bound, review-only two-message merge. Never sends/Cuts/edits real money. */
(function(root){
'use strict';
const TYPES={b:'bao_lo',lo:'bao_lo',dd:'dd',da:'da',dau:'dau',duoi:'duoi',xc:'xc'};
const ORDER={bao_lo:0,da:1,dd:2,dau:3,duoi:4,xc:5}, LABEL={bao_lo:'b',da:'da',dd:'dd',dau:'dau',duoi:'dui',xc:'xc'};
function fail(code){throw Error(code)}
function decimal(num,den){
 if(den<=0n||num<0n)fail('DECIMAL_INVALID_HOLD');
 const whole=num/den;let remain=num%den;if(!remain)return whole.toString();
 let fract='';for(let i=0;remain&&i<12;i++){remain*=10n;fract+=(remain/den).toString();remain%=den}
 if(remain)fail('DECIMAL_NOT_EXACT_HOLD');
 return whole.toString()+'.'+fract;
}
function ticket(messages,options){
 if(!Array.isArray(messages)||!messages.length||!options||!options.cleanCore||typeof options.cleanCore.parse!=='function'||typeof options.rateParser!=='function')fail('TICKET_ARGUMENTS_HOLD');
 const market=String(options.market||'').toLowerCase(),date=String(options.businessDate||''),customerId=String(options.customerId||'');
 if(!['mb','mn','mt'].includes(market)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!customerId)fail('SCOPE_REQUIRED_HOLD');
 if(typeof options.multiply!=='boolean')fail('TOGGLE_REQUIRED_HOLD');
 if(options.multiply===true&&customerId!=='quyt')fail('CUSTOMER_MULTIPLIER_NOT_AUTHORIZED_HOLD');
 const tick=options.multiply,rate=options.rateParser(options.rate||'1.067');
 const known=new Map(),exposures=new Map(),sources=[];let seenLabel='',serial=0,placement=0;
 for(const source of messages){
  if(!source||typeof source.source_message_id!=='string'||!source.source_message_id||typeof source.original_text!=='string'||!source.original_text.trim()||source.customer_id!==customerId||source.market!==market||source.business_date!==date)fail('MESSAGE_SCOPE_HOLD');
  const key=source.source_message_id;
  if(known.has(key)){
   if(known.get(key).original_text!==source.original_text)fail('SOURCE_ID_REVISION_CONFLICT_HOLD');
   continue; // Exact retried ID is idempotent; equal content with DIFFERENT ID is a new wager.
  }
  known.set(key,source);sources.push({source_message_id:key,original_text:source.original_text});
  const m=/^\s*hn(?=\s)/iu.exec(source.original_text);
  let input=source.original_text;
  if(m){seenLabel='HN';input=input.slice(m[0].length).trimStart()}
  if(!input.trim())fail('NO_WAGER_AFTER_HEADER_HOLD');
  const clauses=options.cleanCore.parse(input,{region:market,businessDate:date,calendarAuthority:options.calendarAuthority});
  for(const clause of clauses){
   const kind=TYPES[clause.kind];if(!kind)fail('BET_TYPE_UNKNOWN_HOLD');
   if(kind==='xc')fail('XC_MONEY_AUTHORITY_HOLD');
   if(!clause.station||!Array.isArray(clause.numbers)||!Number.isSafeInteger(clause.half)||clause.half<=0)fail('CLAUSE_INVALID_HOLD');
   if(kind==='da'&&(market!=='mb'||clause.numbers.length!==2||clause.numbers[0]===clause.numbers[1]))fail('DA_PAIR_AUTHORITY_HOLD');
   const nums=kind==='da'?[clause.numbers.slice().sort().join('-')]:clause.numbers;
   for(const number of nums){
    if(!/^\d{2}(?:-\d{2})?$/.test(number))fail('NUMBER_WIDTH_HOLD');
    const id=JSON.stringify([customerId,market,clause.station,kind,number]);
    let row=exposures.get(id);
    if(!row){row={kind,station:clause.station,number,half:0n,first:serial++,peak:0n,peakOrder:0,provenance:[]};exposures.set(id,row)}
    const half=BigInt(clause.half);
    if(half>row.peak){row.peak=half;row.peakOrder=placement}
    placement++;row.half+=half;
    row.provenance.push({source_message_id:key,source_line:clause.line,amount:decimal(half,2n),selector:clause.kind});
   }
  }
 }
 if(!exposures.size)fail('NO_WAGERS_HOLD');
 const rows=[...exposures.values()].sort((a,b)=>ORDER[a.kind]-ORDER[b.kind]||(a.kind==='da'?a.first-b.first:a.half===b.half?a.peakOrder-b.peakOrder:a.half>b.half?-1:1));
 const totals=()=>({bao_lo:0n,da:0n,dd:0n,dau:0n,duoi:0n,xc:0n});
 const original=totals(),adjusted=totals(),den=2n*rate.denominator;
 for(const row of rows){
  original[row.kind]+=row.half;
  const factor=row.kind==='bao_lo'&&tick?rate.numerator:rate.denominator;
  row.original=decimal(row.half,2n);row.exact=decimal(row.half*factor,den);adjusted[row.kind]+=row.half*factor;
 }
 const originalTotals={},adjustedTotals={};
 for(const k of Object.keys(original)){originalTotals[k]=decimal(original[k],2n);adjustedTotals[k]=decimal(adjusted[k],den)}
 const sum=o=>Object.values(o).reduce((a,b)=>a+b,0n);
 const groups=[];
 for(const row of rows){
  const previous=groups[groups.length-1];
  if(row.kind!=='da'&&previous&&previous.kind===row.kind&&previous.station===row.station&&previous.amount===row.exact){previous.numbers.push(row.number)}
  else groups.push({kind:row.kind,station:row.station,amount:row.exact,numbers:[row.number]});
 }
 const lines=[];let prevKind='';
 for(let i=0;i<groups.length;i++){
  const g=groups[i];
  if(prevKind&&prevKind!==g.kind)lines.push('');
  const prior=groups[i-1];
  if(g.kind==='duoi'&&prior?.kind==='dau'&&prior.numbers.length===1&&g.numbers.length===1&&prior.numbers[0]===g.numbers[0]){
   if(lines[lines.length-1]==='')lines.pop();
   lines[lines.length-1]=lines[lines.length-1].slice(0,-1)+' dui'+g.amount+'n.';
  }else{lines.push(g.numbers.map(n=>n.replace('-',' ')).join(' ')+' '+LABEL[g.kind]+g.amount+'n.')}
  prevKind=g.kind;
 }
 return Object.freeze({status:'REVIEW_ONLY',market,businessDate:date,customerId,tick,rate:rate.normalized,
  sources,sourceCount:sources.length,rows:rows.map(({kind,station,number,original,exact,provenance})=>({kind,station,number,original,exact,provenance})),
  formatted:(seenLabel?'HN\n':'')+lines.join('\n'),originalTotals,adjustedTotals,totalOriginal:decimal(sum(original),2n),totalExact:decimal(sum(adjusted),den),
  forwardAuthorized:false,roundingPolicy:'HOLD_UNAPPROVED',backendCompatible:'NOT_VERIFIED'});
}
const api=Object.freeze({ticket,VERSION:'review-only-ticket-v1'});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.KTSQuytTicketReview=api;
})(typeof window!=='undefined'?window:undefined);
