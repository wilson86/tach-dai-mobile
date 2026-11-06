'use strict';
// KTS Quyt review-only: materialize remaining amounts from already-qualified
// canonical merged rows. NEVER reparse wagers or recompute the factor on Cut.
const QuytCutLedger=(()=>{
 const kinds=['b','da','xc','dd','dau','dui'];
 const fmtNumber=n=>String(n).replace('-',' ');
 const key=row=>row.kind+'|'+row.number;
 function derive(base,removedInput){
  if(!base||!Array.isArray(base.rows)||!Array.isArray(base.sections))throw Error('HOLD_LEDGER_BASE_INVALID');
  const removed=new Set(removedInput||[]);
  const originalKeys=new Set();
  for(const row of base.rows){
   const k=key(row);
   if(originalKeys.has(k)||!kinds.includes(row.kind)||!/^(?:[0-9]{2}(?:-[0-9]{2})?)$/u.test(row.number)||!/^[0-9]+$/u.test(row.adjusted))throw Error('HOLD_LEDGER_ROW_INVALID');
   originalKeys.add(k);
  }
  if([...removed].some(k=>!originalKeys.has(k)))throw Error('HOLD_LEDGER_UNKNOWN_CUT');
  const alive=base.rows.filter(r=>!removed.has(key(r)));
  const gone=base.rows.filter(r=>removed.has(key(r)));
  const total=rows=>rows.reduce((n,r)=>n+BigInt(r.adjusted),0n);
  const remaining=total(alive),cut=total(gone);
  if(total(base.rows)!==BigInt(base.total)||remaining+cut!==BigInt(base.total))throw Error('HOLD_LEDGER_MONEY_CONSERVATION');
  const grouped=[];
  for(const row of alive){
   const previous=grouped.at(-1);
   if(row.kind!=='da'&&previous&&previous.kind===row.kind&&previous.adjusted===row.adjusted)previous.numbers.push(row.number);
   else grouped.push({kind:row.kind,numbers:[row.number],adjusted:row.adjusted});
  }
  const lines=[];
  for(let i=0;i<grouped.length;i++){
   const item=grouped[i],prev=grouped[i-1];
   if(prev&&prev.kind!==item.kind)lines.push('');
   const line=item.numbers.map(fmtNumber).join(' ')+' '+item.kind+item.adjusted+'n.';
   if(item.kind==='dui'&&prev&&prev.kind==='dau'&&prev.numbers.length===1&&item.numbers.length===1&&prev.numbers[0]===item.numbers[0]){
    if(lines.at(-1)==='')lines.pop();
    lines[lines.length-1]=lines.at(-1).slice(0,-1)+' dui'+item.adjusted+'n.';
   }else lines.push(line);
  }
  const hn=base.pretty.startsWith('HN\n');
  const pretty=alive.length?(hn?'HN\n':'')+lines.join('\n'):'';
  const sections=base.sections.map(s=>{
   if(!kinds.includes(s.kind))throw Error('HOLD_LEDGER_SECTION_UNKNOWN');
   const list=grouped.filter(g=>g.kind===s.kind);
   const entries=list.map(g=>g.numbers.map(fmtNumber).join(' ')+' '+g.kind+g.adjusted+'n.');
   const sectionRows=alive.filter(row=>row.kind===s.kind);
   return {kind:s.kind,text:entries.length?(hn?'HN\n':'')+entries.join('\n'):'',total:total(sectionRows).toString(),count:sectionRows.length,supported:s.supported};
  });
  if(sections.reduce((n,s)=>n+BigInt(s.total),0n)!==remaining)throw Error('HOLD_LEDGER_SECTION_MISMATCH');
  return {pretty,sections,rows:alive,total:remaining.toString(),cutTotal:cut.toString(),cutCount:gone.length,sourceCount:base.sourceCount};
 }
 return Object.freeze({derive,key});
})();
