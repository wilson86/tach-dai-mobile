(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.KTS_UNIFIED=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CONTRACT='DX_DA_NUMBER_PAIRS_CONTEXTUAL_V2';
  const PAIR_RE=/^(.*?)(\d{1,4}(?:[\s,;]+\d{1,4})+)\s*(dx|đx|da|đá|đa)\s*(\d+(?:[.,]\d+)?(?:n|d|đ)?)\s*$/iu;

  function literalDxCount(line){
    return Array.from(String(line||'').matchAll(/(?:^|\s)(?:dx|đx)(?=\s|\d)/giu)).length;
  }
  function sourceHead(line){
    const source=String(line||'').trim();
    const match=source.match(/^(.*?)(?=\b\d{1,4}\b)/u);
    return match?match[1].trim():'';
  }
  function parsePairClause(line){
    const match=String(line||'').trim().match(PAIR_RE);
    if(!match) return null;
    return {
      source:String(line||'').trim(),
      head:match[1].trim(),
      numbers:match[2].split(/[\s,;]+/).filter(Boolean),
      selector:match[3],
      stake:match[4],
    };
  }
  function selectorIsDx(selector){return /^(?:dx|đx)$/iu.test(String(selector||''))}
  function selectorIsDa(selector){return /^(?:da|đá|đa)$/iu.test(String(selector||''))}
  function usesPairSemantics(parsed,region){
    if(!parsed) return false;
    if(selectorIsDx(parsed.selector)) return true;
    if(!selectorIsDa(parsed.selector)) return false;
    if(String(region||'').toLowerCase()==='mb') return true;
    return /^(?:2d|3d)(?:\s|$)/iu.test(String(parsed.head||''));
  }
  function validateTwoDigitNumbers(numbers){
    const nums=(numbers||[]).map(String);
    const invalid=nums.filter(x=>!/^\d{2}$/u.test(x));
    if(!invalid.length) return;
    const suggestion=nums.map(x=>/^\d$/u.test(x)?x.padStart(2,'0'):x).join(' ');
    throw Error(`Số đá phải đủ 2 chữ số: ${invalid.join(' ')} → nhập ${suggestion}`);
  }
  function numberPairData(head,numbers,selector,stake){
    const nums=(numbers||[]).map(String);
    if(nums.length<2) throw Error('DA_VONG_NEEDS_AT_LEAST_TWO_NUMBERS');
    if(new Set(nums).size!==nums.length) throw Error('DA_VONG_DUPLICATE_NUMBER');
    const prefix=head?head+' ':'';
    const outputs=[], groups=[];
    for(let i=0;i<nums.length-1;i++){
      const lines=[];
      for(let j=i+1;j<nums.length;j++){
        const line=`${prefix}${nums[i]} ${nums[j]} ${selector} ${stake}`;
        lines.push(line); outputs.push(line);
      }
      groups.push({key:nums[i],count:lines.length,lines});
    }
    return {outputs,groups};
  }
  function numberPairLines(head,numbers,selector,stake){
    return numberPairData(head,numbers,selector,stake).outputs;
  }
  function expandDxOnlyFallback(line){
    const parsed=parsePairClause(line);
    if(!parsed||!selectorIsDx(parsed.selector)) return null;
    validateTwoDigitNumbers(parsed.numbers);
    const pair=numberPairData(parsed.head,parsed.numbers,parsed.selector,parsed.stake);
    return {outputs:pair.outputs,head:parsed.head,groups:pair.groups,numbers:parsed.numbers,selector:parsed.selector,stake:parsed.stake};
  }
  function requireApi(api){
    for(const name of ['normalizeInput','validateCheckOnlyLine','processLine']) {
      if(!api||typeof api[name]!=='function') throw Error(`DA_VONG_ENGINE_API_MISSING:${name}`);
    }
  }
  function splitSourceChunks(source,api){
    const head=sourceHead(source);
    const rest=head?source.slice(head.length).trim():source;
    if(typeof api.splitBetChunks==='function'){
      const chunks=api.splitBetChunks(rest);
      if(Array.isArray(chunks)&&chunks.length){
        return chunks.map(chunk=>`${head?head+' ':''}${String(chunk||'').trim()}`.trim());
      }
    }
    return [source];
  }
  function expandDaVongLineDetailed(line,api,region,stations){
    requireApi(api);
    const source=String(api.normalizeInput(line)||'').trim();
    if(!source) return {outputs:[],blocks:[],pair_lines:0};
    const chunks=splitSourceChunks(source,api);

    // Pair-width validation runs before canonical validation so the operator gets
    // the precise 01/02/... correction instead of a generic parser error.
    for(const full of chunks){
      const parsed=parsePairClause(full);
      if(parsed&&usesPairSemantics(parsed,region)) validateTwoDigitNumbers(parsed.numbers);
    }

    api.validateCheckOnlyLine(source,region,stations);
    const outputs=[], blocks=[];
    let pairLines=0;
    for(const full of chunks){
      const parsed=parsePairClause(full);
      if(parsed&&usesPairSemantics(parsed,region)){
        const pair=numberPairData(parsed.head,parsed.numbers,parsed.selector,parsed.stake);
        outputs.push(...pair.outputs);
        pairLines+=pair.outputs.length;
        for(const group of pair.groups) blocks.push({type:'pair',key:group.key,count:group.count,lines:group.lines});
      }else{
        const normal=api.processLine(full,region,stations)||[];
        outputs.push(...normal);
        if(normal.length) blocks.push({type:'plain',lines:normal.map(String)});
      }
    }
    return {outputs,blocks,pair_lines:pairLines};
  }
  function expandDaVongLine(line,api,region,stations){
    return expandDaVongLineDetailed(line,api,region,stations).outputs;
  }
  function renderBlocks(blocks){
    const sections=[];
    for(const block of blocks||[]){
      if(block.type==='pair'){
        sections.push(`──── ${block.key} đá (${block.count}) ────\n${(block.lines||[]).join('\n')}`);
      }else if(block.type==='plain'&&(block.lines||[]).length){
        sections.push(block.lines.join('\n'));
      }
    }
    return sections.join('\n\n');
  }
  function transformDaVongText(text,api,region,stations){
    requireApi(api);
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length) return {ok:false,output:'',display_output:'',outputs:[],error:'DA_VONG_TEXT_REQUIRED',contract:CONTRACT};
    const outputs=[], blocks=[];
    let pairLines=0;
    try{
      for(let i=0;i<lines.length;i++){
        try{
          const generated=expandDaVongLineDetailed(lines[i],api,region,stations);
          outputs.push(...generated.outputs);
          blocks.push(...generated.blocks);
          pairLines+=generated.pair_lines;
        }catch(error){
          throw Error(`LỖI dòng ${i+1}: ${String(error&&error.message||error)}`);
        }
      }
      const pairBlocks=blocks.filter(x=>x.type==='pair');
      return {
        ok:true,
        output:outputs.join('\n'),
        display_output:renderBlocks(blocks),
        outputs,
        blocks,
        contract:CONTRACT,
        pair_lines:pairLines,
        group_count:pairBlocks.length,
        group_counts:pairBlocks.map(x=>x.count),
      };
    }catch(error){
      return {ok:false,output:'',display_output:'',outputs:[],blocks:[],error:String(error&&error.message||error),contract:CONTRACT,pair_lines:0,group_count:0,group_counts:[]};
    }
  }
  return {CONTRACT,literalDxCount,sourceHead,parsePairClause,usesPairSemantics,validateTwoDigitNumbers,numberPairData,numberPairLines,expandDxOnlyFallback,expandDaVongLine,transformDaVongText,renderBlocks};
});

// Browser-only UX patch for the unified Mobile app. Business rules above stay
// isolated from UI decoration: this adds Select All controls to embedded split
// modes and prevents auto-validation from stealing source selection while typing.
;(function installUnifiedMobileUx(){
  'use strict';
  if(typeof document==='undefined') return;
  const UX_VERSION='1.0.2';

  function selectAllText(el){
    if(!el) return;
    try{el.focus({preventScroll:true})}catch(_){el.focus()}
    if(typeof el.setSelectionRange==='function') el.setSelectionRange(0,String(el.value||'').length);
  }
  function makeButton(doc,id,target){
    if(!doc||!target||doc.getElementById(id)) return null;
    const button=doc.createElement('button');
    button.id=id; button.type='button'; button.className='secondary'; button.textContent='Chọn tất cả';
    button.addEventListener('click',()=>selectAllText(target));
    return button;
  }
  function installButtons(doc,inputId,outputId,inputButtonId,outputButtonId){
    const input=doc.getElementById(inputId), output=doc.getElementById(outputId);
    if(input){
      const actions=input.closest('.card')?.querySelector('.actions');
      const button=makeButton(doc,inputButtonId,input);
      if(actions&&button) actions.appendChild(button);
    }
    if(output){
      const actions=output.closest('.card')?.querySelector('.actions');
      const button=makeButton(doc,outputButtonId,output);
      if(actions&&button) actions.insertBefore(button,actions.firstChild);
    }
  }
  function installEmbeddedFrame(frame,prefix){
    try{
      const w=frame&&frame.contentWindow, doc=frame&&frame.contentDocument;
      if(!w||!doc) return;
      const input=doc.getElementById('input');
      if(typeof w.selectLine==='function'&&!w.__KTS_UNIFIED_KEEP_INPUT_SELECTION_V1__){
        const original=w.selectLine;
        w.selectLine=function(textarea,lineNo){
          if(textarea===input&&doc.activeElement===input) return;
          return original.call(w,textarea,lineNo);
        };
        w.__KTS_UNIFIED_KEEP_INPUT_SELECTION_V1__=true;
      }
      installButtons(doc,'input','output',`${prefix}SelectAllInput`,`${prefix}SelectAllOutput`);
    }catch(_){/* same github.io origin expected; UI decoration fails closed */}
  }
  function attachFrame(id,prefix){
    const frame=document.getElementById(id);
    if(!frame) return;
    frame.addEventListener('load',()=>installEmbeddedFrame(frame,prefix));
    try{if(frame.contentDocument&&frame.contentDocument.readyState!=='loading') installEmbeddedFrame(frame,prefix)}catch(_){}
  }
  function install(){
    const version=document.querySelector('.title span');
    if(version&&/Unified\s+/i.test(version.textContent||'')) version.textContent=`Unified ${UX_VERSION}`;
    installButtons(document,'dvInput','dvOutput','dvSelectAllInput','dvSelectAllOutput');
    attachFrame('tachFrame','ktsTach');
    attachFrame('ngangFrame','ktsNgang');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
