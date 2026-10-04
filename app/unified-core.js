(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.KTS_UNIFIED=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CONTRACT='DX_NUMBER_PAIRS_PRESERVE_STATION_HEAD_V1';

  function literalDxCount(line){
    return Array.from(String(line||'').matchAll(/(?:^|\s)(?:dx|đx)(?=\s|\d)/giu)).length;
  }
  function sourceHead(line){
    const source=String(line||'').trim();
    const match=source.match(/^(.*?)(?=\b\d{1,4}\b)/u);
    return match?match[1].trim():'';
  }
  function numberPairLines(head,numbers,selector,stake){
    const nums=(numbers||[]).map(String);
    if(nums.length<2) throw Error('DA_VONG_NEEDS_AT_LEAST_TWO_NUMBERS');
    if(new Set(nums).size!==nums.length) throw Error('DA_VONG_DUPLICATE_NUMBER');
    const prefix=head?head+' ':'';
    const outputs=[];
    for(let i=0;i<nums.length;i++) for(let j=i+1;j<nums.length;j++) {
      outputs.push(`${prefix}${nums[i]} ${nums[j]} ${selector} ${stake}`);
    }
    return outputs;
  }
  function expandDxOnlyFallback(line){
    const source=String(line||'').trim();
    const dxCount=literalDxCount(source);
    if(!dxCount) return null;
    if(dxCount!==1) throw Error('DA_VONG_REQUIRES_ONE_DX_CLAUSE_PER_LINE');
    const match=source.match(/^(.*?)(\d{1,4}(?:[\s,;]+\d{1,4})+)\s*(dx|đx)\s*(\d+(?:[.,]\d+)?(?:n|d|đ)?)\s*$/iu);
    if(!match) throw Error('DA_VONG_EXPLICIT_STATION_MIXED_CLAUSE_NOT_SUPPORTED');
    const head=match[1].trim();
    const mixedSelector=/(?:^|\s)(?:dathang|dat|bao|blo|bl|lo|lô|duoi|đuôi|dau|đầu|dx|đx|da|đá|đa|dd|đđ|xc|b|d|x)(?=\s|\d)/iu;
    if(mixedSelector.test(head.replace(/^(?:mn|mt|mb|[234]d)\s+/i,''))) throw Error('DA_VONG_MIXED_CLAUSE_NOT_ALLOWED');
    const numbers=match[2].split(/[\s,;]+/).filter(Boolean);
    const outputs=numberPairLines(head,numbers,match[3],match[4]);
    return {outputs,head,groups:[{numbers,selector:match[3],stake:match[4],pair_count:outputs.length}]};
  }
  function requireApi(api){
    for(const name of ['normalizeInput','validateCheckOnlyLine','processLine']) {
      if(!api||typeof api[name]!=='function') throw Error(`DA_VONG_ENGINE_API_MISSING:${name}`);
    }
  }
  function expandDaVongLine(line,api,region,stations){
    requireApi(api);
    const source=String(api.normalizeInput(line)||'').trim();
    if(!source) return [];
    api.validateCheckOnlyLine(source,region,stations);
    if(!literalDxCount(source)) return api.processLine(source,region,stations);

    // Prefer the qualified Mobile parser's own chunk splitter when available.
    // This preserves normal clauses through canonical processing while only
    // projecting literal DX clauses into number pairs. Any unsupported DX
    // shape fails closed and clears the whole batch in transformDaVongText().
    if(typeof api.splitBetChunks==='function'){
      const head=sourceHead(source);
      const rest=head?source.slice(head.length).trim():source;
      const chunks=api.splitBetChunks(rest);
      if(Array.isArray(chunks)&&chunks.length){
        const outputs=[];
        let sawDx=false;
        for(const chunk of chunks){
          if(literalDxCount(chunk)){
            sawDx=true;
            const expanded=expandDxOnlyFallback(`${head?head+' ':''}${chunk}`);
            if(!expanded) throw Error('DA_VONG_DX_EXPANSION_MISSING');
            outputs.push(...expanded.outputs);
          }else{
            outputs.push(...api.processLine(`${head?head+' ':''}${chunk}`.trim(),region,stations));
          }
        }
        if(sawDx) return outputs;
      }
    }
    const expanded=expandDxOnlyFallback(source);
    if(!expanded) throw Error('DA_VONG_DX_EXPANSION_MISSING');
    return expanded.outputs;
  }
  function transformDaVongText(text,api,region,stations){
    requireApi(api);
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length) return {ok:false,output:'',outputs:[],error:'DA_VONG_TEXT_REQUIRED',contract:CONTRACT};
    const outputs=[];
    try{
      for(let i=0;i<lines.length;i++){
        const generated=expandDaVongLine(lines[i],api,region,stations);
        outputs.push(...generated);
      }
      return {ok:true,output:outputs.join('\n'),outputs,contract:CONTRACT,pair_lines:outputs.filter(x=>literalDxCount(x)>0).length};
    }catch(error){
      return {ok:false,output:'',outputs:[],error:String(error&&error.message||error),contract:CONTRACT};
    }
  }
  return {CONTRACT,literalDxCount,sourceHead,numberPairLines,expandDxOnlyFallback,expandDaVongLine,transformDaVongText};
});
