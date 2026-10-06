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
  const UX_VERSION='1.0.5';

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

// Đá Vòng mobile result UX: never rely on Android text selection for wager
// operations. Group labels are presentation-only/non-selectable; each real wager
// row is a large tap target. This layer changes only selection/presentation.
;(function installDaVongTapSelectUx(){
  'use strict';
  if(typeof document==='undefined') return;
  const HEADER=/^────\s+(.+?)\s+đá\s+\((\d+)\)\s+────$/u;
  let groups=[];
  let rows=[];
  const selected=new Set();

  function status(text,kind=''){
    const el=document.getElementById('dvStatus');
    if(!el) return;
    el.textContent=text;
    el.className='status '+kind;
  }
  async function writeClipboard(text){
    if(!text) return false;
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true;}
    }catch(_){}
    const tmp=document.createElement('textarea');
    tmp.value=text;tmp.style.position='fixed';tmp.style.left='-9999px';
    document.body.appendChild(tmp);tmp.focus();tmp.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(_){}
    tmp.remove();return !!ok;
  }
  function parseDisplay(text){
    groups=[];rows=[];selected.clear();
    let current=null,rowNo=0,groupNo=0;
    for(const raw of String(text||'').split(/\r?\n/)){
      const line=raw.trim();
      if(!line){current=null;continue;}
      const m=line.match(HEADER);
      if(m){
        current={id:`g${++groupNo}`,type:'pair',key:m[1],rowIds:[]};
        groups.push(current);continue;
      }
      if(!current){current={id:`g${++groupNo}`,type:'plain',key:'',rowIds:[]};groups.push(current);}
      const row={id:`r${++rowNo}`,groupId:current.id,text:line,alive:true};
      rows.push(row);current.rowIds.push(row.id);
    }
  }
  function aliveRows(){return rows.filter(r=>r.alive)}
  function selectedRows(){return aliveRows().filter(r=>selected.has(r.id))}
  function aliveGroups(){return groups.filter(g=>g.rowIds.some(id=>{const r=rows.find(x=>x.id===id);return r&&r.alive;}))}
  function syncShadow(){const out=document.getElementById('dvOutput');if(out)out.value=aliveRows().map(r=>r.text).join('\n')}
  function toggleRow(id){const row=rows.find(r=>r.id===id);if(!row||!row.alive)return;selected.has(id)?selected.delete(id):selected.add(id);render();}
  function toggleGroup(id){
    const group=groups.find(g=>g.id===id);if(!group)return;
    const live=group.rowIds.filter(rowId=>{const r=rows.find(x=>x.id===rowId);return r&&r.alive;});
    const all=live.length&&live.every(rowId=>selected.has(rowId));
    for(const rowId of live){all?selected.delete(rowId):selected.add(rowId)}
    render();
  }
  function toggleAll(){
    const live=aliveRows();
    const all=live.length&&live.every(r=>selected.has(r.id));
    selected.clear();if(!all)for(const row of live)selected.add(row.id);
    render();
  }
  function render(){
    const list=document.getElementById('dvTapResultList');
    if(!list)return;
    list.replaceChildren();
    const live=aliveRows(), picked=selectedRows(), liveGroups=aliveGroups();
    if(!live.length){
      const empty=document.createElement('div');empty.className='dv-tap-empty';empty.textContent='Chưa có kết quả.';list.appendChild(empty);
    }
    for(const group of liveGroups){
      const section=document.createElement('section');section.className='dv-tap-group';
      const head=document.createElement('div');head.className='dv-tap-head';
      const groupRows=group.rowIds.map(id=>rows.find(r=>r.id===id)).filter(r=>r&&r.alive);
      const title=document.createElement('div');title.className='dv-tap-title';
      title.textContent=group.type==='pair'?`${group.key} đá · ${groupRows.length} tin`:`Tin thường · ${groupRows.length} tin`;
      const groupButton=document.createElement('button');groupButton.type='button';groupButton.className='dv-tap-group-btn';
      const groupAll=groupRows.length&&groupRows.every(r=>selected.has(r.id));
      groupButton.textContent=groupAll?'Bỏ chọn nhóm':'Chọn nhóm';groupButton.addEventListener('click',()=>toggleGroup(group.id));
      head.append(title,groupButton);section.appendChild(head);
      for(const row of groupRows){
        const button=document.createElement('button');button.type='button';button.className='dv-tap-row'+(selected.has(row.id)?' selected':'');
        button.setAttribute('aria-pressed',selected.has(row.id)?'true':'false');
        const mark=document.createElement('span');mark.className='dv-tap-mark';mark.textContent='✓';
        const text=document.createElement('span');text.className='dv-tap-text';text.textContent=row.text;
        button.append(mark,text);button.addEventListener('click',()=>toggleRow(row.id));section.appendChild(button);
      }
      list.appendChild(section);
    }
    const pairGroups=liveGroups.filter(g=>g.type==='pair').length;
    const label=document.getElementById('dvResultLabel');
    if(label)label.textContent=live.length?`Kết quả · ${live.length} tin${pairGroups?` · ${pairGroups} nhóm đá`:''}`:'Kết quả';
    const summary=document.getElementById('dvTapSummary');
    if(summary)summary.textContent=live.length?`Đã chọn ${picked.length}/${live.length}`:'Chưa có tin';
    const cut=document.getElementById('dvCutSelection');
    if(cut){cut.disabled=picked.length===0;cut.textContent=`Cắt đã chọn (${picked.length})`;}
    const all=document.getElementById('dvSelectAllOutput');
    if(all)all.textContent=(live.length&&picked.length===live.length)?'Bỏ chọn tất cả':'Chọn tất cả';
    syncShadow();
  }
  function rebuildFromDisplay(){
    const out=document.getElementById('dvOutput');
    if(!out)return;
    parseDisplay(out.value);render();
  }
  function replaceButton(id,handler){
    const old=document.getElementById(id);if(!old)return null;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',handler);return fresh;
  }
  function install(){
    const out=document.getElementById('dvOutput'),run=document.getElementById('dvRun'),clear=document.getElementById('dvClear');
    if(!out||!run)return;
    if(document.getElementById('dvTapResultList'))return;
    const style=document.createElement('style');style.id='dvTapSelectStyle';style.textContent=`
      #dvOutput{display:none!important}
      #dvTapResultList{display:grid;gap:10px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
      .dv-tap-summary{font-size:12px;font-weight:800;color:#667085;margin:-2px 0 8px;text-align:right;user-select:none;-webkit-user-select:none}
      .dv-tap-group{border:1px solid #d7dde7;border-radius:12px;overflow:hidden;background:#fff}
      .dv-tap-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#f2f5fa;font-weight:850;font-size:14px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
      .dv-tap-title{min-width:0}.dv-tap-group-btn{height:34px;border:0;border-radius:9px;padding:0 10px;background:#e4ebf5;color:#27364b;font-weight:800;white-space:nowrap}
      .dv-tap-row{width:100%;display:flex;align-items:center;gap:10px;border:0;border-top:1px solid #edf0f5;background:#fff;padding:13px 11px;text-align:left;color:#172033;font:15px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
      .dv-tap-row.selected{background:#eaf2ff}.dv-tap-mark{flex:0 0 24px;width:24px;height:24px;border:2px solid #9aa7b8;border-radius:7px;display:grid;place-items:center;color:transparent;background:#fff;font:900 15px/1 system-ui}.dv-tap-row.selected .dv-tap-mark{border-color:#0b57d0;background:#0b57d0;color:#fff}.dv-tap-text{min-width:0;overflow-wrap:anywhere}.dv-tap-empty{padding:18px 12px;border:1px dashed #d7dde7;border-radius:12px;color:#667085;text-align:center;font-size:13px}.dv-tap-cut:disabled{opacity:.45}
    `;document.head.appendChild(style);
    const summary=document.createElement('div');summary.id='dvTapSummary';summary.className='dv-tap-summary';summary.textContent='Chưa có tin';
    const list=document.createElement('div');list.id='dvTapResultList';list.setAttribute('aria-live','polite');
    out.parentNode.insertBefore(summary,out);out.parentNode.insertBefore(list,out);
    out.setAttribute('aria-hidden','true');out.tabIndex=-1;
    replaceButton('dvCutSelection',async()=>{
      const picked=selectedRows();if(!picked.length){status('Chưa chọn tin cần cắt. Chạm vào dòng cược để chọn.','err');return;}
      const payload=picked.map(r=>r.text).join('\n');
      if(!(await writeClipboard(payload))){status('Không thể ghi phần đã cắt vào bộ nhớ tạm. Tin chưa bị xóa.','err');return;}
      for(const row of picked)row.alive=false;selected.clear();
      const remaining=aliveRows().length;if(!remaining){const input=document.getElementById('dvInput');if(input)input.value='';}
      render();status(remaining?`Đã cắt + copy ${picked.length} tin · còn ${remaining} tin`:`Đã cắt + copy ${picked.length} tin · đã xóa tin gốc`,'ok');
    })?.classList.add('dv-tap-cut');
    replaceButton('dvSelectAllOutput',toggleAll);
    replaceButton('dvCopy',async()=>{const live=aliveRows();if(!live.length)return;const ok=await writeClipboard(live.map(r=>r.text).join('\n'));status(ok?`Đã copy ${live.length} tin kết quả`:'Không thể ghi bộ nhớ tạm.',ok?'ok':'err');});
    run.addEventListener('click',()=>Promise.resolve().then(rebuildFromDisplay));
    if(clear)clear.addEventListener('click',()=>{groups=[];rows=[];selected.clear();render();});
    list.addEventListener('selectstart',event=>event.preventDefault());
    rebuildFromDisplay();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
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
  function saved(){try{return sessionStorage.getItem(SESSION_KEY)||''}catch(_){return ''}}
  function persist(value){try{sessionStorage.setItem(SESSION_KEY,value)}catch(_){}}
  function activeMode(){return document.querySelector('.tab.active')?.dataset?.mode||'tach'}
  function sources(){
    const list=[];
    try{const el=document.getElementById('tachFrame')?.contentDocument?.getElementById('input');if(el)list.push({mode:'tach',el})}catch(_){}
    try{const el=document.getElementById('ngangFrame')?.contentDocument?.getElementById('input');if(el)list.push({mode:'ngang',el})}catch(_){}
    const dv=document.getElementById('dvInput');if(dv)list.push({mode:'davong',el:dv});
    return list;
  }
  function publish(value,origin){
    if(syncing)return;
    shared=String(value??'');persist(shared);syncing=true;
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
    if(!seen.has(el)){
      const now=String(el.value||'');
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
    setInterval(refresh,300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
