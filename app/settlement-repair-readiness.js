(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function deps() {
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    const parserReplay = global.KTS_SETTLEMENT_PARSER_REPLAY;
    if (!candidates || !regression) throw new Error('REPAIR_READINESS_DEPENDENCY_MISSING');
    return { candidates, regression, parserReplay };
  }
  function localAssessment(candidate, regressionApi) {
    const regression = regressionApi || deps().regression;
    try {
      const replay = regression.replayCase(candidate.case);
      const comparison = replay && replay.comparison || {};
      const exact = replay && replay.pass === true && comparison.safe_to_promote === true;
      const finalRow = comparison.totals && comparison.totals.final_net || null;
      return {
        candidate_id: String(candidate.id || ''),
        status: exact ? 'ENGINE_EXACT' : 'ENGINE_UNRESOLVED',
        exact,
        comparison_status: String(comparison.status || '').toUpperCase(),
        final_delta: finalRow && finalRow.delta != null ? finalRow.delta : null,
        engine_version: replay && replay.settlement && replay.settlement.engine_version || null,
        error: null
      };
    } catch (error) {
      return {
        candidate_id: String(candidate && candidate.id || ''),
        status: 'ENGINE_REPLAY_ERROR',
        exact: false,
        comparison_status: null,
        final_delta: null,
        engine_version: null,
        error: String(error && error.message || error)
      };
    }
  }
  function parserAssessment(result) {
    if (!result) return { status:'PARSER_NOT_CHECKED', ready:false, blocked:false, error:null };
    const state = String(result.resolution_state || '').toUpperCase();
    if (state === 'PARSER_REGRESSION_RISK') return { status:'PARSER_REGRESSION_RISK', ready:false, blocked:true, error:null };
    if (state === 'PARSER_PATH_ERROR' || /ERROR$/.test(String(result.status || '').toUpperCase())) return { status:'PARSER_ERROR', ready:false, blocked:true, error:result.error || null };
    if (result.human_review_ready === true && result.reference_match_exact === true) return { status:'READY_HUMAN_CONFIRM', ready:true, blocked:false, error:null };
    return { status:'PARSER_UNRESOLVED', ready:false, blocked:false, error:null };
  }
  function combineAssessment(local, parserResult) {
    const parser = parserAssessment(parserResult);
    let status = 'UNRESOLVED';
    let ready = false;
    if (local && local.status === 'ENGINE_REPLAY_ERROR') status = 'ENGINE_REPLAY_ERROR';
    else if (!local || local.exact !== true) status = 'UNRESOLVED';
    else if (!parserResult) status = 'ENGINE_EXACT_PARSER_UNCHECKED';
    else if (parser.blocked) status = parser.status;
    else if (parser.ready) { status = 'READY_HUMAN_CONFIRM'; ready = true; }
    else status = parser.status;
    return {
      candidate_id: local && local.candidate_id || parserResult && parserResult.candidate_id || '',
      status,
      ready_for_human_confirmation: ready,
      local: clone(local),
      parser: clone(parser),
      parser_result: parserResult ? clone(parserResult) : null
    };
  }
  function summarize(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const count = key => list.filter(x => x && x.status === key).length;
    return {
      total:list.length,
      ready:count('READY_HUMAN_CONFIRM'),
      unresolved:count('UNRESOLVED') + count('PARSER_UNRESOLVED'),
      parser_unchecked:count('ENGINE_EXACT_PARSER_UNCHECKED'),
      parser_risk:count('PARSER_REGRESSION_RISK'),
      errors:count('ENGINE_REPLAY_ERROR') + count('PARSER_ERROR')
    };
  }
  async function loadLocalQueue() {
    const d = deps();
    const pending = await d.candidates.listCandidates({ state:d.candidates.STATES.PENDING });
    return pending.map(candidate => ({ candidate, assessment:combineAssessment(localAssessment(candidate, d.regression), null) }));
  }
  async function checkParser(candidateId) {
    const d = deps();
    if (!d.parserReplay || typeof d.parserReplay.replayCandidateId !== 'function') throw new Error('REPAIR_READINESS_PARSER_REPLAY_UNAVAILABLE');
    const pending = await d.candidates.listCandidates({ state:d.candidates.STATES.PENDING });
    const candidate = pending.find(c => String(c.id || '') === String(candidateId || ''));
    if (!candidate) throw new Error('REPAIR_READINESS_CANDIDATE_NOT_FOUND:' + String(candidateId || ''));
    const local = localAssessment(candidate, d.regression);
    if (!local.exact) return { candidate, assessment:combineAssessment(local, null), parser_skipped:true };
    const parserResult = await d.parserReplay.replayCandidateId(candidate.id);
    return { candidate, assessment:combineAssessment(local, parserResult), parser_skipped:false };
  }
  function readinessReport(rows) {
    const items = (Array.isArray(rows) ? rows : []).map(row => ({
      candidate_id:String(row && row.candidate && row.candidate.id || row && row.assessment && row.assessment.candidate_id || ''),
      scope:clone(row && row.candidate && row.candidate.case && row.candidate.case.scope || null),
      status:String(row && row.assessment && row.assessment.status || 'UNKNOWN'),
      ready_for_human_confirmation:Boolean(row && row.assessment && row.assessment.ready_for_human_confirmation),
      local:clone(row && row.assessment && row.assessment.local || null),
      parser:clone(row && row.assessment && row.assessment.parser || null)
    }));
    return { format:'kts-repair-readiness-report-v1', generated_at:new Date().toISOString(), summary:summarize(items), items };
  }

  function installUi() {
    const doc = global.document, pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('repairReadinessPanel')) return;
    const card = doc.createElement('div'); card.className='card'; card.id='repairReadinessPanel';
    card.innerHTML = `<div class="section-title">Queue xác nhận sau sửa</div>
      <div class="hint">Tự replay engine hiện tại bằng evidence đã chụp. Chỉ khi engine đã MATCH_EXACT mới cho chạy kiểm parser hiện tại. Kết quả “Sẵn sàng xác nhận” vẫn <b>không tự xác nhận HIOSKT, không ghim golden, không dismiss candidate</b>.</div>
      <div class="row" style="margin-top:8px"><button id="repairReadinessRefresh" class="btn soft">Cập nhật queue</button><button id="repairReadinessExport" class="btn soft">Xuất báo cáo JSON</button></div>
      <div id="repairReadinessStatus" class="status"></div><div id="repairReadinessOutput" class="hint"></div>`;
    pane.appendChild(card);
    let rows = [];
    function status(text,kind){const el=doc.getElementById('repairReadinessStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    function label(a){
      return ({READY_HUMAN_CONFIRM:'SẴN SÀNG XÁC NHẬN',ENGINE_EXACT_PARSER_UNCHECKED:'ENGINE EXACT · CHƯA KIỂM PARSER',PARSER_REGRESSION_RISK:'CẢNH BÁO PARSER REGRESSION',PARSER_ERROR:'PARSER ERROR',ENGINE_REPLAY_ERROR:'ENGINE REPLAY ERROR',PARSER_UNRESOLVED:'PARSER CÒN LỆCH',UNRESOLVED:'CÒN LỆCH'})[a.status] || a.status;
    }
    function kind(a){return a.status==='READY_HUMAN_CONFIRM'?'ok':(a.status.includes('ERROR')||a.status==='PARSER_REGRESSION_RISK'||a.status==='UNRESOLVED'||a.status==='PARSER_UNRESOLVED')?'err':'warn';}
    function render(){
      const host=doc.getElementById('repairReadinessOutput');
      if(!rows.length){host.innerHTML='<div class="hint">Không có mismatch candidate đang chờ.</div>';status('Queue sạch.','ok');return;}
      host.innerHTML=rows.map((row,index)=>{const c=row.candidate,a=row.assessment,s=c.case&&c.case.scope||{};return `<div class="report-message" data-readiness-index="${index}"><div><span class="tag ${kind(a)}">${esc(label(a))}</span> <b>${esc(s.business_date||'')} ${esc(String(s.region||'').toUpperCase())}</b> · ${esc(s.partner_id||'')}</div><div class="hint">engine ${esc(a.local&&a.local.engine_version||'—')} · delta hiện tại ${esc(a.local&&a.local.final_delta!=null?a.local.final_delta:'—')}</div><div class="row" style="margin-top:6px">${a.local&&a.local.exact?`<button class="btn soft" data-action="check-parser" data-id="${esc(c.id)}">Kiểm parser hiện tại</button>`:''}<button class="btn soft" data-action="open-candidate" data-id="${esc(c.id)}">Mở candidate</button></div></div>`;}).join('');
      host.querySelectorAll('[data-action="check-parser"]').forEach(btn=>btn.addEventListener('click',async()=>{const id=btn.getAttribute('data-id');try{btn.disabled=true;status('Đang chạy raw_text → parser hiện tại → engine hiện tại…','warn');const checked=await checkParser(id);const i=rows.findIndex(x=>String(x.candidate.id)===String(id));if(i>=0)rows[i]=checked;render();status(checked.assessment.ready_for_human_confirmation?'Case đã exact cả engine + parser. Chỉ còn bước người vận hành xác nhận reference HIOSKT.':'Parser replay chưa đạt điều kiện xác nhận.','warn');}catch(e){status(String(e&&e.message||e),'err');}finally{btn.disabled=false;}}));
      host.querySelectorAll('[data-action="open-candidate"]').forEach(btn=>btn.addEventListener('click',()=>{const target=doc.querySelector(`[data-candidate="${String(btn.getAttribute('data-id')).replace(/"/g,'\\"')}"]`);if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:'center'});}));
      const sum=summarize(rows.map(x=>x.assessment));status(`${sum.total} candidate · ${sum.ready} sẵn sàng xác nhận · ${sum.parser_unchecked} engine exact/chưa kiểm parser · ${sum.unresolved} còn lệch · ${sum.parser_risk} parser risk · ${sum.errors} lỗi replay`,sum.ready&&sum.unresolved===0&&sum.parser_risk===0&&sum.errors===0?'ok':'warn');
    }
    async function refresh(){rows=await loadLocalQueue();render();return rows;}
    doc.getElementById('repairReadinessRefresh').addEventListener('click',()=>refresh().catch(e=>status(String(e&&e.message||e),'err')));
    doc.getElementById('repairReadinessExport').addEventListener('click',()=>{try{const report=readinessReport(rows);const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=doc.createElement('a');a.href=url;a.download='kts-repair-readiness-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Đã xuất báo cáo readiness đọc-only.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
    if(typeof global.addEventListener==='function')global.addEventListener('kts:regression-candidates-changed',()=>refresh().catch(()=>{}));
    refresh().catch(()=>{});
  }

  global.KTS_SETTLEMENT_REPAIR_READINESS = Object.freeze({
    version:'settlement-repair-readiness-v1',
    localAssessment, parserAssessment, combineAssessment, summarize,
    loadLocalQueue, checkParser, readinessReport
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window !== 'undefined' ? window : globalThis);
