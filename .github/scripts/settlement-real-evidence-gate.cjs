'use strict';

// Pure, read-only gate for a LOCAL-only manifest of historical settlement
// evidence. It NEVER authenticates HIOSKT or grants production authority.
const {readFileSync}=require('node:fs');
const REQUIRED_COUNT=65;
const FORMAT='kts-settlement-real-evidence-v1';
const FIELDS=Object.freeze(['xac','qua_co','payout','final']);
const SHA=/^[a-f0-9]{64}$/i;
const GIT_SHA=/^[a-f0-9]{40}$/i;

function exactDecimal(raw) {
  // Never coerce null, booleans, floating JS Numbers, empty strings or arrays.
  if(typeof raw!=='string'|| !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const neg=raw.startsWith('-');
  const body=raw.replace(/^[+-]/,'');
  const [whole,fraction='']=body.split('.');
  const digits=(whole+fraction).replace(/^0+(?=\d)/,'');
  if(digits.length>500||fraction.length>100)return null;
  let i=BigInt(digits||'0')*(neg?-1n:1n),scale=fraction.length;
  if(i===0n)return '0';
  while(scale>0&&i%10n===0n){i/=10n;scale--;}
  const sign=i<0n?'-':'',abs=(i<0n?-i:i).toString();
  if(scale===0)return sign+abs;
  const padded=abs.padStart(scale+1,'0');
  return sign+padded.slice(0,-scale)+'.'+padded.slice(-scale);
}

function auditEvidence(input, options={}) {
  const problems=[];
  const seen=new Set();
  let candidateDifferent=0, comparable=0;
  const expectedHead=String(options.expectedHead||'');
  const add=(reason)=>{if(problems.length<40)problems.push(reason);};
  const cases=input&&Array.isArray(input.cases)?input.cases:null;
  const observed=cases?cases.length:0;
  if(!input||typeof input!=='object'||Array.isArray(input)||input.format!==FORMAT)
    add('MANIFEST_FORMAT_MISSING_OR_INVALID');
  if(!cases)add('MANIFEST_CASES_MISSING');
  if(observed!==REQUIRED_COUNT)add('REAL_HISTORY_65_MANIFEST_INCOMPLETE');
  if(!GIT_SHA.test(String(input&&input.feature_head||'')))add('FEATURE_HEAD_NOT_PINNED');
  if(expectedHead&&String(input&&input.feature_head||'').toLowerCase()!==expectedHead.toLowerCase())
    add('FEATURE_HEAD_DIFFERS_FROM_GITHUB');
  for(let index=0;index<observed;index++){
    const record=cases[index],prefix='CASE_'+index+'_';
    if(!record||typeof record!=='object'||Array.isArray(record)){
      add(prefix+'INVALID');continue;
    }
    const id=record.case_id;
    if(typeof id!=='string'||!id.trim()||id.length>128)add(prefix+'ID_MISSING');
    else if(seen.has(id)){add(prefix+'DUPLICATE_ID');}
    else seen.add(id);
    const scope=record.scope||{};
    if(typeof scope.partner_id!=='string'||!scope.partner_id.trim()||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date||''))||
      !['mn','mt','mb'].includes(scope.region))
      add(prefix+'SCOPE_MISSING');
    const kts=record.kts||{},hioskt=record.hioskt||{};
    if(!SHA.test(String(kts.source_sha256||''))||typeof kts.source_ref!=='string'||!kts.source_ref.trim())
      add(prefix+'KTS_SOURCE_UNPROVEN');
    if(!SHA.test(String(hioskt.source_sha256||''))||typeof hioskt.source_ref!=='string'||!hioskt.source_ref.trim())
      add(prefix+'HIOSKT_SOURCE_UNPROVEN');
    if(kts.source_sha256&&hioskt.source_sha256&&
      String(kts.source_sha256).toLowerCase()===String(hioskt.source_sha256).toLowerCase())
      add(prefix+'SOURCE_INDEPENDENCE_NOT_ESTABLISHED');
    const left=kts.totals||{},right=hioskt.totals||{};
    let valid=true,difference=false;
    for(const field of FIELDS){
      const a=exactDecimal(left[field]),b=exactDecimal(right[field]);
      if(a===null||b===null){add(prefix+'MONEY_MISSING_OR_INVALID_'+field);valid=false;}
      else if(a!==b)difference=true;
    }
    if(valid){comparable++;if(difference)candidateDifferent++;}
    const link=record.mapping||{};
    if(link.method!=='operator_verified'||typeof link.review_ref!=='string'||!link.review_ref.trim())
      add(prefix+'MAPPING_UNCONFIRMED');
  }
  return {
    format:'kts-settlement-real-evidence-audit-v1',
    structure:problems.length?'INCOMPLETE':'COMPLETE_BUT_UNAUTHENTICATED',
    real_history_65_status:'BLOCKED',
    hioskt_oracle_status:'BLOCKED_INDEPENDENT_VERIFICATION_REQUIRED',
    monetary_mismatch_count:'NOT_COMPARABLE',
    release_readiness:'BLOCKED',
    case_count:observed,
    comparable_candidate_cases:comparable,
    candidate_difference_cases:problems.length===0?candidateDifferent:null,
    problems
  };
}

if(require.main===module){
  const [path,head]=process.argv.slice(2);
  let evidence=null;
  try {if(path)evidence=JSON.parse(readFileSync(path,'utf8'));}
  catch(_){ /* Do not print sensitive filenames or untrusted file content. */ }
  const report=auditEvidence(evidence,{expectedHead:head});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  // This structural checker does not establish independent monetary truth.
  process.exitCode=2;
}

module.exports={auditEvidence,exactDecimal,REQUIRED_COUNT,FORMAT};