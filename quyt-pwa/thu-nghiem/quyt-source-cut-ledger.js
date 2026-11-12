'use strict';
// WILSON86 Quyt V4: source-line/bet Cut ledger. Money is recalculated ONLY by
// OfflineKTS.merge(), the canonical current-page engine, not by this module.
// Adapted from the isolated Quyt Cut/Undo preview's scoped ledger approach.
const QuytSourceCutLedger=(()=>{
 const keyRe=/^[1-9]\d*:\d+$/u;
 function verifyBase(base){
  if(!base||!Array.isArray(base.sourceEntries)||!Array.isArray(base.rows)||!base.sourceEntries.length)
   throw Error('HOLD_CUT_BASE_INVALID');
  const found=new Set();
  for(const entry of base.sourceEntries){
   if(!entry||typeof entry.id!=='string'||!keyRe.test(entry.id)||found.has(entry.id)||
      !Number.isInteger(entry.line)||entry.line<1||!/^[0-9]+(?:\.[0-9]+)?$/u.test(entry.stake)||
      !Array.isArray(entry.stations)||!entry.stations.length)throw Error('HOLD_CUT_SOURCE_PROVENANCE');
   found.add(entry.id);
  }
  for(const row of base.rows){
   if(!Array.isArray(row.sourceIds)||row.sourceIds.length===0||row.sourceIds.some(id=>!found.has(id)))
    throw Error('HOLD_CUT_ROW_PROVENANCE');
  }
  return found;
 }
 function calculate(base,raw,options,removedInput){
  const found=verifyBase(base);
  const removed=new Set(removedInput||[]);
  if(removed.size>found.size||[...removed].some(id=>typeof id!=='string'||!found.has(id)))
   throw Error('HOLD_CUT_UNKNOWN_SOURCE');
  const remaining=removed.size
   ?OfflineKTS.merge(raw,{...options,excludeBetIds:[...removed]})
   :base;
  if(base.sourceTotal!==remaining.sourceTotal||
     JSON.stringify(base.sourceEntries)!==JSON.stringify(remaining.sourceEntries))
   throw Error('HOLD_CUT_SOURCE_CHANGED');
  const before=BigInt(base.total),after=BigInt(remaining.total);
  const originalBefore=BigInt(base.original),originalAfter=BigInt(remaining.original);
  if(before<0n||after<0n||after>before||originalAfter<0n||originalAfter>originalBefore)
   throw Error('HOLD_CUT_MONEY_CONSERVATION');
  for(const row of remaining.rows){
   if(row.sourceIds.some(id=>removed.has(id)))throw Error('HOLD_CUT_STALE_ROW');
  }
  const cutOutput=before-after,cutOriginal=originalBefore-originalAfter;
  if(after+cutOutput!==before||originalAfter+cutOriginal!==originalBefore)
   throw Error('HOLD_CUT_MONEY_CONSERVATION');
  return Object.freeze({base,remaining,removed:[...removed],
   before:before.toString(),after:after.toString(),cutOutput:cutOutput.toString(),
   originalBefore:originalBefore.toString(),originalAfter:originalAfter.toString(),
   cutOriginal:cutOriginal.toString(),sourceCount:base.sourceCount});
 }
 return Object.freeze({calculate,verifyBase});
})();