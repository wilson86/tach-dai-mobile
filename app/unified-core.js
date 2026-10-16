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
  function isStandaloneSeparator(line){
    // Same standalone-divider contract as both PWA modes and the Router bridge.
    return /^[\-—–_/\\|]{3,}$/u.test(String(line||'').trim());
  }
  function transformDaVongText(text,api,region,stations){
    requireApi(api);
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim());
    if(!lines.some(line=>line && !isStandaloneSeparator(line))) return {ok:false,output:'',display_output:'',outputs:[],error:'DA_VONG_TEXT_REQUIRED',contract:CONTRACT};
    const outputs=[], blocks=[];
    let pairLines=0;
    try{
      for(let i=0;i<lines.length;i++){
        if(!lines[i] || isStandaloneSeparator(lines[i])) continue;
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
  const UX_VERSION='1.0.20';

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
    // Modern embedded PWAs own these actions. Their output select-all operates
    // on grouped checkbox rows, not on the (hidden) legacy text area. Injecting
    // a second select-all would bypass the selected wager rows.
    const nativeInput=doc.getElementById('selectAllInputBtn');
    const nativeOutput=doc.getElementById('selectAllOutputBtn');
    if(nativeInput) doc.getElementById(inputButtonId)?.remove();
    if(nativeOutput) doc.getElementById(outputButtonId)?.remove();
    if(input&&!nativeInput){
      const actions=input.closest('.card')?.querySelector('.actions');
      const button=makeButton(doc,inputButtonId,input);
      if(actions&&button) actions.appendChild(button);
    }
    if(output&&!nativeOutput&&!doc.getElementById('resultGroups')){
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

// Đá Vòng: same checkbox-group and readable working-source model as the two
// embedded split modes. This is a mode-local presentation/selection ledger;
// the DA/DX pair expansion and monetary engine above are unchanged.
;(function installDaVongCheckboxUx(){
  'use strict';
  if(typeof document==='undefined')return;
  const HEADER=/^────\s+(.+?)\s+đá\s+\((\d+)\)\s+────$/u;
  const STORAGE='KTS_DAVONG_WORKING_ROWS_V1';
  const SCHEMA='KTS_DAVONG_WORKING_ROWS_V1';
  const ENGINE='046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb';
  const $=id=>document.getElementById(id);
  let groups=[],rows=[],origin='',ledgerActive=false;
  let sourceRegion='',sourceDate='',skipRebuild=false,originalChatText='',normalizingChat=false;
  const selected=new Set(),undoStack=[],selectionBindings=[];
  const live=()=>rows.filter(r=>r.alive);
  const picked=()=>live().filter(r=>selected.has(r.id));
  const byId=id=>rows.find(r=>r.id===id);
  const currentRegion=()=>String($('dvRegion')?.value||'');
  const currentDate=()=>String($('dvDate')?.value||'');
  const safeText=text=>String(text||'');
  function status(value,kind=''){
    const el=$('dvStatus');if(!el)return;
    el.textContent=value;el.className='status '+kind;
  }
  async function copy(text){
    if(!text)return false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}}catch(_){}
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';
    ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(_){}ta.remove();return ok;
  }
  function validateLedger(data){
    return !!data&&data.schema===SCHEMA&&data.app==='tach-dai-davong'&&
      data.engine===ENGINE&&data.region===currentRegion()&&data.date===currentDate()&&
      typeof data.origin==='string'&&(data.raw_original===undefined||typeof data.raw_original==='string')&&
      Array.isArray(data.rows)&&Array.isArray(data.groups)&&
      data.rows.every(r=>typeof r.id==='string'&&typeof r.text==='string'&&
        typeof r.groupId==='string'&&typeof r.alive==='boolean'&&r.text.length<4096)&&
      data.rows.length<=10000&&data.groups.length<=10000&&
      data.groups.every(g=>g&&/^g[0-9]+$/.test(g.id)&&
        (g.type==='pair'||g.type==='plain')&&typeof g.key==='string'&&
        Array.isArray(g.rowIds)&&g.rowIds.length<=10000)&&
      new Set(data.rows.map(r=>r.id)).size===data.rows.length&&
      new Set(data.groups.map(g=>g.id)).size===data.groups.length&&
      data.rows.every(r=>/^r[0-9]+$/.test(r.id)&&
        data.groups.some(g=>g.id===r.groupId&&g.rowIds.includes(r.id)))&&
      data.groups.every(g=>g.rowIds.every(id=>
        data.rows.some(r=>r.id===id&&r.groupId===g.id)));
  }
  function serial(){
    return {schema:SCHEMA,app:'tach-dai-davong',engine:ENGINE,origin,
      region:sourceRegion,date:sourceDate,raw_original:originalChatText||origin,
      rows:rows.map(r=>({...r})),groups:groups.map(g=>({...g,rowIds:g.rowIds.slice()})),
      undo:undoStack.slice(-30)};
  }
  function persist(){
    try{
      if(ledgerActive&&live().length)localStorage.setItem(STORAGE,JSON.stringify(serial()));
      else localStorage.removeItem(STORAGE);
    }catch(_){}
  }
  function snapshot(){
    undoStack.push({origin,input:safeText($('dvInput')?.value),output:safeText($('dvOutput')?.value),
      rows:rows.map(r=>({...r})),groups:groups.map(g=>({...g,rowIds:g.rowIds.slice()})),
      selected:[...selected],ledgerActive,sourceRegion,sourceDate,originalChatText});
    if(undoStack.length>30)undoStack.shift();
  }
  function notifyRawChanged(){
    const el=$('dvInput');
    if(!el||typeof el.dispatchEvent!=='function'||typeof Event!=='function')return;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function restore(){
    const old=undoStack.pop();if(!old){status('Chưa có thao tác để hoàn tác.','err');return;}
    origin=old.origin;sourceRegion=old.sourceRegion;sourceDate=old.sourceDate;
    originalChatText=old.originalChatText||'';
    rows=old.rows.map(r=>({...r}));
    groups=old.groups.map(g=>({...g,rowIds:g.rowIds.slice()}));
    selected.clear();for(const id of old.selected)selected.add(id);
    ledgerActive=old.ledgerActive;
    $('dvInput').value=old.input;
    render();persist();
    if(!ledgerActive)notifyRawChanged();
    status('Đã hoàn tác · khôi phục nguồn và kết quả','ok');
  }
  function beforeChatNormalize(raw,clean){
    if(safeText(raw)===safeText(clean))return;
    snapshot(); // Undo always restores the exact copied chat text.
    originalChatText=safeText(raw);
    $('dvInput').value=safeText(clean);
    normalizingChat=true;
    try{notifyRawChanged()}finally{normalizingChat=false}
  }
  function parse(text){
    const nextGroups=[],nextRows=[];
    let current=null,n=0,g=0;
    for(const part of safeText(text).split(/\r?\n/)){
      const value=part.trim();if(!value){current=null;continue;}
      const header=value.match(HEADER);
      if(header){
        current={id:'g'+(++g),type:'pair',key:header[1],rowIds:[]};
        nextGroups.push(current);continue;
      }
      if(!current){current={id:'g'+(++g),type:'plain',key:'',rowIds:[]};nextGroups.push(current);}
      const row={id:'r'+(++n),groupId:current.id,text:value,alive:true};
      nextRows.push(row);current.rowIds.push(row.id);
    }
    groups=nextGroups;rows=nextRows;selected.clear();
  }
  function activeGroups(){return groups.filter(g=>g.rowIds.some(id=>byId(id)?.alive))}
  function checkbox(label,value,change,aria){
    const input=document.createElement('input');input.type='checkbox';
    input.checked=value;input.setAttribute('aria-label',aria);
    input.addEventListener('change',()=>change(input.checked));
    label.appendChild(input);return input;
  }
  function syncSelection(){
    // Checkbox taps must never replace a focused checkbox or scroll the page.
    for(const binding of selectionBindings){
      if(binding.row){
        const active=selected.has(binding.row.id);
        binding.box.checked=active;
        binding.label.className='dv-checkbox-row'+(active?' checked':'');
      }else{
        const eligible=binding.rows.filter(r=>r.alive);
        const every=eligible.length>0&&eligible.every(r=>selected.has(r.id));
        const some=eligible.some(r=>selected.has(r.id));
        binding.box.checked=every;
        binding.box.indeterminate=!every&&some;
      }
    }
    const liveRows=live(),chosen=picked(),active=activeGroups();
    const summary=$('dvTapSummary');
    if(summary)summary.textContent='Đã chọn '+chosen.length+'/'+liveRows.length+
      ' kết quả · '+active.length+' nhóm';
    const cut=$('dvCutSelection');
    if(cut){cut.disabled=chosen.length===0;cut.textContent='Cắt đã chọn ('+chosen.length+')';}
    const all=$('dvSelectAllOutput');
    if(all)all.textContent=liveRows.length&&chosen.length===liveRows.length?'Bỏ chọn tất cả':'Chọn tất cả';
    const select=$('dvWorkingSelect');
    if(select)select.textContent=liveRows.length&&chosen.length===liveRows.length?'Bỏ chọn tất cả':'Chọn tất cả';
    for(const id of ['dvWorkingCopy','dvWorkingCut']){
      const button=$(id);if(button)button.disabled=chosen.length===0;
    }
  }
  function toggleAll(){
    const all=live(),everything=all.length&&all.every(r=>selected.has(r.id));
    selected.clear();if(!everything)for(const r of all)selected.add(r.id);
    syncSelection();
  }
  function toggleGroup(group,checked){
    for(const id of group.rowIds){if(!byId(id)?.alive)continue;
      if(checked)selected.add(id);else selected.delete(id)}
    syncSelection();
  }
  function groupList(container,prefix,showGroups){
    container.replaceChildren();
    const active=activeGroups();
    if(!live().length){
      const empty=document.createElement('div');empty.className='dv-checkbox-empty';
      empty.textContent='Chưa có kết quả.';container.appendChild(empty);return;
    }
    for(const [i,group] of active.entries()){
      const groupRows=group.rowIds.map(byId).filter(r=>r&&r.alive);
      const section=document.createElement('section');section.className='dv-checkbox-group';
      const head=document.createElement('label');head.className='dv-checkbox-head';
      const every=groupRows.every(r=>selected.has(r.id));
      const some=groupRows.some(r=>selected.has(r.id));
      const headBox=checkbox(head,every,v=>toggleGroup(group,v),
        'Chọn cả nhóm '+(i+1));
      headBox.indeterminate=!every&&some;
      selectionBindings.push({box:headBox,rows:groupRows});
      const title=document.createElement('span');title.className='dv-checkbox-title';
      title.textContent='Nhóm '+(i+1)+' · '+groupRows.length+' kết quả'+
        (group.type==='pair'?' · '+group.key+' đá':' · Tin thường');
      head.appendChild(title);section.appendChild(head);
      for(const row of groupRows){
        const label=document.createElement('label');label.className='dv-checkbox-row';
        if(selected.has(row.id))label.className+=' checked';
        const rowBox=checkbox(label,selected.has(row.id),v=>{
          if(v)selected.add(row.id);else selected.delete(row.id);
          syncSelection();
        },'Chọn kết quả '+row.text);
        selectionBindings.push({box:rowBox,row,label});
        const text=document.createElement('span');text.textContent=row.text;
        label.appendChild(text);section.appendChild(label);
      }
      container.appendChild(section);
    }
  }
  function render(){
    selectionBindings.length=0;
    const liveRows=live(),pickedRows=picked(),active=activeGroups();
    groupList($('dvTapResultList'),'result',true);
    const summary=$('dvTapSummary');
    if(summary)summary.textContent='Đã chọn '+pickedRows.length+'/'+liveRows.length+
      ' kết quả · '+active.length+' nhóm';
    const title=$('dvResultLabel');
    if(title)title.textContent=liveRows.length?'Kết quả':'Kết quả';
    const cut=$('dvCutSelection');
    if(cut){cut.disabled=pickedRows.length===0;cut.textContent='Cắt đã chọn ('+pickedRows.length+')';}
    const select=$('dvSelectAllOutput');
    if(select)select.textContent=liveRows.length&&pickedRows.length===liveRows.length?'Bỏ chọn tất cả':'Chọn tất cả';
    const result=$('dvOutput');
    if(result)result.value=liveRows.map(r=>r.text).join('\n');
    const panel=$('dvWorkingPanel');
    if(panel){
      panel.style.display=ledgerActive&&liveRows.length?'':'none';
      $('dvInput').style.display=ledgerActive&&liveRows.length?'none':'';
      for(const id of ['dvSourceCopy','dvSourceCut','dvSelectAllInput'])
        $(id).style.display=ledgerActive&&liveRows.length?'none':'';
      if(ledgerActive&&liveRows.length){
        groupList($('dvWorkingRows'),'source',true);
        $('dvWorkingOrigin').textContent=originalChatText||origin;
        $('dvWorkingSelect').textContent=liveRows.length&&pickedRows.length===liveRows.length?'Bỏ chọn tất cả':'Chọn tất cả';
        $('dvWorkingCopy').disabled=pickedRows.length===0;
        $('dvWorkingCut').disabled=pickedRows.length===0;
      }
    }
    $('dvUndo').disabled=undoStack.length===0;
  }
  async function cut(){
    const marked=picked();
    if(!marked.length){status('Chọn các dòng kết quả cần Cắt.','err');return;}
    if(!(await copy(marked.map(r=>r.text).join('\n')))){
      status('Copy thất bại · chưa Cắt và chưa thay đổi nguồn.','err');return;
    }
    snapshot();
    for(const row of marked)row.alive=false;
    selected.clear();ledgerActive=true;
    if(!origin)origin=safeText($('dvInput').value);
    sourceRegion=currentRegion();sourceDate=currentDate();
    const left=live().length;
    if(!left){ledgerActive=false;$('dvInput').value='';}
    persist();render();
    if(!left)notifyRawChanged();
    status('Đã cắt '+marked.length+' dòng · còn '+left+' dòng cược','ok');
  }
  async function copyResult(){
    const selectedRows=picked(),pick=selectedRows.length?selectedRows:live();
    if(!pick.length)return;
    const ok=await copy(pick.map(r=>r.text).join('\n'));
    status(ok?'Đã copy '+pick.length+' dòng kết quả':'Không thể copy kết quả.',ok?'ok':'err');
  }
  function beforeRun(){
    if(ledgerActive&&live().length&&
        $('dvInput').value===origin&&currentRegion()===sourceRegion&&currentDate()===sourceDate){
      skipRebuild=true;render();status('Đã giữ nguyên kết quả còn lại; không sinh lại cược đã cắt.','ok');
      return true;
    }
    ledgerActive=false;persist();return false;
  }
  function rebuild(){
    if(skipRebuild){skipRebuild=false;render();return;}
    origin=safeText($('dvInput').value);
    sourceRegion=currentRegion();sourceDate=currentDate();
    ledgerActive=false;parse($('dvOutput').value);
    persist();render();
  }
  function maybeRestore(){
    let data;try{data=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){return;}
    if(!validateLedger(data))return;
    const value=$('dvInput').value;
    let shared='';try{shared=sessionStorage.getItem('KTS_UNIFIED_SHARED_INPUT_V1')||''}catch(_){}
    if(value&&value!==data.origin)return;
    if(shared&&shared!==data.origin)return;
    origin=data.origin;sourceRegion=data.region;sourceDate=data.date;
    originalChatText=data.raw_original||'';
    rows=data.rows.map(r=>({...r}));groups=data.groups.map(g=>({...g,rowIds:g.rowIds.slice()}));
    selected.clear();ledgerActive=true;$('dvInput').value=origin;
    undoStack.splice(0,undoStack.length);
    if(Array.isArray(data.undo))for(const old of data.undo.slice(-30)){
      if(old&&typeof old.input==='string'&&typeof old.origin==='string'&&
         Array.isArray(old.rows)&&Array.isArray(old.groups)&&Array.isArray(old.selected))
        undoStack.push(old);
    }
    render();
  }
  function swap(id,cb){
    const old=$(id);if(!old)return;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);
    fresh.addEventListener('click',cb);return fresh;
  }
  function init(){
    const result=$('dvOutput'),run=$('dvRun'),input=$('dvInput');
    if(!result||!run||$('dvTapResultList'))return;
    const style=document.createElement('style');
    style.textContent=[
      '#dvOutput{display:none!important}',
      '.dv-checkbox-results{display:grid;gap:10px}',
      '.dv-checkbox-summary{font-size:12px;font-weight:800;color:#475467;text-align:right;margin:5px 0 9px}',
      '.dv-checkbox-group{border:1px solid #d7dde7;background:#fff;border-radius:12px;overflow:hidden}',
      '.dv-checkbox-head,.dv-checkbox-row{display:flex;align-items:center;gap:11px;padding:12px 11px}',
      '.dv-checkbox-head{background:#eef3fb;font-size:13px;font-weight:800}',
      '.dv-checkbox-row{border-top:1px solid #e8edf4;font:15px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.dv-checkbox-row.checked{background:#eaf2ff}',
      '.dv-checkbox-row span,.dv-checkbox-head span{min-width:0}',
      '.dv-checkbox-head input,.dv-checkbox-row input{width:23px;height:23px;flex:0 0 23px;margin:0;accent-color:#0b57d0}',
      '.dv-checkbox-empty{padding:16px;color:#667085}',
      '.dv-working{padding:10px;margin:10px 0;border:1px solid #b7d1ed;border-radius:12px;background:#f5f9ff}',
      '.dv-working-title{font-size:14px;font-weight:800;margin-bottom:8px}',
      '.dv-working-note{color:#52647b;font-size:12px;margin-bottom:10px}',
      '.dv-working details{font-size:12px;margin-top:10px}',
      '.dv-working pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;padding:9px;border-radius:8px}'
    ].join('\n');
    document.head.appendChild(style);
    const summary=document.createElement('div');summary.id='dvTapSummary';summary.className='dv-checkbox-summary';
    const resultList=document.createElement('div');resultList.id='dvTapResultList';resultList.className='dv-checkbox-results';
    result.parentNode.insertBefore(summary,result);
    result.parentNode.insertBefore(resultList,result);
    result.setAttribute('aria-hidden','true');result.tabIndex=-1;
    const panel=document.createElement('div');panel.id='dvWorkingPanel';panel.className='dv-working';
    panel.innerHTML='<div class="dv-working-title">Phần cược còn lại — đã tách</div>'+
      '<div class="dv-working-note">Chọn dòng để Copy/Cắt; đây là kết quả đã tách, không phải tin khách.</div>'+
      '<div id="dvWorkingRows" class="dv-checkbox-results"></div>'+
      '<div class="actions"><button type="button" class="action secondary" id="dvWorkingSelect">Chọn tất cả</button>'+
      '<button type="button" class="action secondary" id="dvWorkingCopy">Copy đã chọn</button>'+
      '<button type="button" class="action secondary" id="dvWorkingCut">Cắt đã chọn</button></div>'+
      '<details><summary>Xem tin gốc ban đầu</summary><pre id="dvWorkingOrigin"></pre>'+
      '<button type="button" class="action secondary" id="dvCopyOriginal">Copy tin gốc</button></details>';
    input.parentNode.insertBefore(panel,input.nextSibling);
    swap('dvCutSelection',cut);
    swap('dvSelectAllOutput',toggleAll);
    swap('dvCopy',copyResult);
    $('dvUndo').addEventListener('click',restore);
    $('dvWorkingSelect').addEventListener('click',toggleAll);
    $('dvWorkingCut').addEventListener('click',cut);
    $('dvWorkingCopy').addEventListener('click',async()=>{
      const arr=picked();if(!arr.length)return;
      const ok=await copy(arr.map(x=>x.text).join('\n'));
      status(ok?'Đã copy '+arr.length+' dòng cược còn lại':'Không thể copy.',ok?'ok':'err');
    });
    $('dvCopyOriginal').addEventListener('click',async()=>{
      const ok=await copy(originalChatText||origin);
      status(ok?'Đã copy tin gốc':'Không thể copy tin gốc.',ok?'ok':'err');
    });
    $('dvSourceCopy').addEventListener('click',async()=>{
      const a=input.selectionStart??0,b=input.selectionEnd??0;
      const value=a<b?input.value.slice(a,b):input.value;
      const ok=await copy(value);
      status(ok?'Đã copy tin nguồn':'Không thể copy tin nguồn.',ok?'ok':'err');
    });
    $('dvSourceCut').addEventListener('click',async()=>{
      const text=input.value,a=input.selectionStart??0,b=input.selectionEnd??a;
      if(b<=a){status('Hãy bôi đen dòng nguồn cần Cắt.','err');return;}
      const start=text.lastIndexOf('\n',a-1)+1,found=text.indexOf('\n',b-1);
      const end=found<0?text.length:found;
      const pickedText=text.slice(start,end);
      if(!pickedText.trim()){status('Chưa chọn dòng cược.','err');return;}
      if(!(await copy(pickedText))){status('Copy thất bại · chưa Cắt.','err');return;}
      snapshot();
      input.value=text.slice(0,start)+text.slice(found<0?text.length:found+1);
      origin=input.value;originalChatText='';ledgerActive=false;persist();
      notifyRawChanged();
      // A normal source Cut is a legitimate new source message. Recompute
      // immediately without treating its result as an exact-row ledger.
      run.click();
    });
    const clear=$('dvClear');
    if(clear)clear.addEventListener('click',()=>{groups=[];rows=[];selected.clear();origin='';originalChatText='';ledgerActive=false;persist();render();});
    run.addEventListener('click',()=>Promise.resolve().then(rebuild));
    input.addEventListener('input',()=>{
      if(!normalizingChat)originalChatText='';
      if(ledgerActive){ledgerActive=false;persist();render();}
    });
    maybeRestore();render();
    window.KTS_DV_UI={beforeRun,beforeClear:snapshot,beforeChatNormalize};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

// Unified source-input authority: Tách Đài, Tách Ngang and Đá Vòng share the
// same raw source text on phone and desktop browsers. Result state remains
// mode-local; only the operator's source text is synchronized.
;(function installUnifiedSharedInput(){
  'use strict';
  if(typeof document==='undefined') return;
  const SESSION_KEY='KTS_UNIFIED_SHARED_INPUT_V1';
  let shared='';
  let syncing=false;
  const seen=new WeakMap();
  const frameTokens=new WeakMap();
  const modeLocalLedger=new Map();
  const isExactLedger=value=>String(value||'').trim().startsWith('[[KTS_EXACT_OUTPUT_LEDGER_V1]]');
  function saved(){try{return sessionStorage.getItem(SESSION_KEY)||''}catch(_){return ''}}
  function persist(value){try{sessionStorage.setItem(SESSION_KEY,value)}catch(_){}}
  function activeMode(){return document.querySelector('.tab.active')?.dataset?.mode||'tach'}
  function sources(){
    const list=[];
    try{const frame=document.getElementById('tachFrame'),el=frame?.contentDocument?.getElementById('input');if(el)list.push({mode:'tach',el,win:frame.contentWindow})}catch(_){}
    try{const frame=document.getElementById('ngangFrame'),el=frame?.contentDocument?.getElementById('input');if(el)list.push({mode:'ngang',el,win:frame.contentWindow})}catch(_){}
    const dv=document.getElementById('dvInput');if(dv)list.push({mode:'davong',el:dv});
    return list;
  }
  function publish(value,origin){
    if(syncing)return;
    const text=String(value??'');
    const originItem=sources().find(item=>item.el===origin);
    // Exact-output ledgers are mode-local state, never shared source text.
    // Propagating one would overwrite a sibling's valid raw message.
    if(isExactLedger(text)){
      if(originItem)modeLocalLedger.set(originItem.mode,text);
      seen.set(origin,text);
      return;
    }
    if(originItem)modeLocalLedger.delete(originItem.mode);
    shared=text;persist(shared);syncing=true;
    try{
      for(const item of sources()){
        if(item.el!==origin&&String(item.el.value||'')!==shared)item.el.value=shared;
        seen.set(item.el,String(item.el.value||''));
      }
    }finally{syncing=false}
  }
  function attach(item){
    const el=item.el;
    if(!el.__KTS_UNIFIED_SHARED_INPUT_V1__){
      el.addEventListener('input',()=>publish(el.value,el));
      el.addEventListener('change',()=>publish(el.value,el));
      el.__KTS_UNIFIED_SHARED_INPUT_V1__=true;
    }
    // Only a readable same-origin child can receive this ephemeral token. The
    // event is therefore local/authenticated and never crosses origins.
    if(item.win&&!item.win.__KTS_UNIFIED_WORKING_SOURCE_V1__){
      const token=`kts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      frameTokens.set(item.win,token);item.win.__KTS_UNIFIED_FRAME_TOKEN__=token;
      item.win.addEventListener('kts:working-source',event=>{
        const detail=event?.detail;
        if(detail?.schema!=="KTS_WORKING_SOURCE_V1"||detail.token!==frameTokens.get(item.win))return;
        publish(String(detail.value??''),el);
      });
      item.win.__KTS_UNIFIED_WORKING_SOURCE_V1__=true;
    }
    if(!seen.has(el)){
      const now=String(el.value||'');
      if(isExactLedger(now)){
        modeLocalLedger.set(item.mode,now);seen.set(el,now);return;
      }
      if(!shared&&now)publish(now,el);else if(now!==shared)el.value=shared;
      seen.set(el,String(el.value||''));
    }
  }
  function refresh(){
    const list=sources();for(const item of list)attach(item);
    const mode=activeMode();
    const ordered=[...list.filter(x=>x.mode===mode),...list.filter(x=>x.mode!==mode)];
    for(const item of ordered){
      const now=String(item.el.value||''),before=seen.get(item.el);
      if(before!==undefined&&now!==before){publish(now,item.el);break;}
    }
  }
  function install(){
    shared=saved();refresh();
    for(const id of ['tachFrame','ngangFrame'])document.getElementById(id)?.addEventListener('load',()=>setTimeout(refresh,0));
    document.querySelector('.tabs')?.addEventListener('click',()=>setTimeout(refresh,0));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
