'use strict';
// WILSON86 review-only local CUT: filter canonical rounded rows; never reparse or remultiply.
const QuytCutAudit=(()=>{
 const storageKey='KTS_QUYT_V21_CUT_AUDIT_SCOPE_V1';
 const kinds=new Set(['b','dd','dau','dui','da','dx','xc']);
 const rawRe=/^\d+(?:\.\d{1,3})?$/u,integerRe=/^\d+$/u;
 const milli=s=>{if(!rawRe.test(String(s)))throw Error('HOLD_CUT_RAW_MONEY');const [n,f='']=String(s).split('.');return BigInt(n)*1000n+BigInt(f.padEnd(3,'0'))};
 const key=row=>{
  if(!row||!kinds.has(row.kind)||typeof row.station!=='string'||!/^(?:\d{2,3}|\d{2}-\d{2})$/u.test(String(row.number)))throw Error('HOLD_CUT_KEY_INVALID');
  return JSON.stringify([row.station,row.kind,row.number]);
 };
 function derive(base,cuts){
  if(!base||!Array.isArray(base.rows)||!Array.isArray(base.sections)||!integerRe.test(String(base.total))||
     !Array.isArray(cuts)||cuts.length>5000||cuts.some(k=>typeof k!=='string')||
     new Set(cuts).size!==cuts.length)throw Error('HOLD_CUT_BASE_OR_SET_INVALID');
  const present=new Set();let originalTotal=0n;
  for(const r of base.rows){
   const id=key(r);
   if(present.has(id)||!integerRe.test(String(r.adjusted))||!rawRe.test(String(r.raw))||
      typeof r.factorApplied!=='boolean'||!Array.isArray(r.sources)||r.sources.length<1)throw Error('HOLD_CUT_ROW_INVALID');
   present.add(id);originalTotal+=BigInt(r.adjusted);
   let fromSources=0n;
   for(const e of r.sources){
    if(!Number.isSafeInteger(e.line)||e.line<1||typeof e.text!=='string'||typeof e.time!=='string'||!rawRe.test(String(e.money)))throw Error('HOLD_CUT_PROVENANCE_INVALID');
    fromSources+=milli(e.money);
   }
   if(fromSources!==milli(r.raw))throw Error('HOLD_CUT_ORIGINAL_MONEY_MISMATCH');
  }
  if(originalTotal!==BigInt(base.total)||cuts.some(k=>!present.has(k)))throw Error('HOLD_CUT_BASE_MISMATCH');
  const set=new Set(cuts),rows=base.rows.filter(r=>!set.has(key(r))),removed=base.rows.filter(r=>set.has(key(r)));
  const sum=rs=>rs.reduce((n,r)=>n+BigInt(r.adjusted),0n);
  const remains=sum(rows),gone=sum(removed);
  if(remains+gone!==originalTotal)throw Error('HOLD_CUT_MONEY_CONSERVATION');
  const sections=base.sections.map(s=>{
   if(!kinds.has(s.kind))throw Error('HOLD_CUT_KIND_INVALID');
   const members=rows.filter(r=>r.kind===s.kind);
   return {...s,total:sum(members).toString(),count:members.length,
    text:members.map(r=>(r.station?r.station+' ':'')+r.number.replace('-',' ')+' '+r.kind+r.adjusted+'n.').join('\n')};
  });
  if(sections.reduce((n,s)=>n+BigInt(s.total),0n)!==remains)throw Error('HOLD_CUT_SECTION_MISMATCH');
  return {...base,rows,sections,total:remains.toString(),cutTotal:gone.toString(),
   cutCount:removed.length,baseTotal:originalTotal.toString(),removedRows:removed};
 }
 const scope=(raw,customer,market,day,tick,rate)=>{
  if(typeof raw!=='string'||raw.length>60000)throw Error('HOLD_CUT_SCOPE_INVALID');
  return JSON.stringify([raw,customer,market,day,Boolean(tick),rate]);
 };
 return Object.freeze({key,derive,scope,storageKey});
})();