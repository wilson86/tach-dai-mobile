(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function deps() {
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const parser = global.KTS_SETTLEMENT_PARSER_PROVIDER;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!candidates || !runtime || !parser || !regression) throw new Error('PARSER_REPLAY_DEPENDENCY_MISSING');
    return { candidates, runtime, parser, regression };
  }
  function scopeFromCandidate(candidate) {
    const s = candidate && candidate.case && candidate.case.scope || {};
    if (!s.partner_id || !s.business_date || !s.region) throw new Error('PARSER_REPLAY_SCOPE_REQUIRED');
    return { partner_id:String(s.partner_id), business_date:String(s.business_date), region:String(s.region).toLowerCase() };
  }
  function stakeCanonical(v) {
    const text = String(v == null ? '' : v).trim().replace(',', '.');
    const n = Number(text);
    return Number.isFinite(n) ? String(n) : text;
  }
  function parserIdentityHash(payload) {
    const identity = payload && payload.parser_identity;
    const value = identity && identity.identity_sha256;
    return value ? String(value).toLowerCase() : null;
  }
  function parserIdentitySummary(payload) {
    const identity = payload && payload.parser_identity || null;
    return identity ? {
      parser_version:String(identity.parser_version || payload.parser_version || ''),
      identity_sha256:identity.identity_sha256 == null ? null : String(identity.identity_sha256).toLowerCase(),
      parser_source_sha256:identity.parser_source_sha256 == null ? null : String(identity.parser_source_sha256).toLowerCase(),
      grammar_sha256:identity.grammar_sha256 == null ? null : String(identity.grammar_sha256).toLowerCase(),
      business_engine_sha256:identity.business_engine_sha256 == null ? null : String(identity.business_engine_sha256).toLowerCase()
    } : null;
  }
  function canonicalShape(payload, requestedRegion) {
    const p = payload || {};
    const region = String(p.region || requestedRegion || '').toLowerCase();
    return {
      region,
      legs: (Array.isArray(p.legs) ? p.legs : []).map(leg => ({
        code: String(leg && leg.code || '').toUpperCase(),
        values: Array.isArray(leg && leg.values) ? leg.values.map(String) : [],
        stake: stakeCanonical(leg && leg.stake),
        action: String(leg && leg.action || '').toLowerCase(),
        position: leg && leg.position != null ? String(leg.position).toLowerCase() : null,
        station_codes: Array.isArray(leg && leg.station_codes) ? leg.station_codes.map(x => String(x).toLowerCase()) : [],
        inherited_values: Boolean(leg && leg.inherited_values)
      }))
    };
  }
  function canonicalDiff(captured, current, requestedRegion) {
    const a = canonicalShape(captured, requestedRegion), b = canonicalShape(current, requestedRegion), out = [];
    if (a.region !== b.region) out.push({ path:'region', captured:a.region, current:b.region });
    if (a.legs.length !== b.legs.length) out.push({ path:'legs.length', captured:a.legs.length, current:b.legs.length });
    const fields = ['code','values','stake','action','position','station_codes','inherited_values'];
    const count = Math.max(a.legs.length, b.legs.length);
    for (let i=0;i<count;i++) {
      if (!a.legs[i] || !b.legs[i]) continue;
      for (const field of fields) {
        const av = a.legs[i][field], bv = b.legs[i][field];
        if (JSON.stringify(av) !== JSON.stringify(bv)) out.push({ path:`legs[${i}].${field}`, captured:clone(av), current:clone(bv) });
      }
    }
    return out;
  }
  function comparisonIssues(comparison) {
    const out = [], c = comparison || {};
    for (const [field,row] of Object.entries(c.totals || {})) {
      const status = String(row && row.status || '').toUpperCase();
      if (status && !['MATCH_EXACT','NOT_COMPARABLE'].includes(status)) out.push({ kind:'total', code:null, field, status, local:row.local, reference:row.reference, delta:row.delta });
    }
    for (const cat of (c.categories || [])) {
      for (const [field,row] of Object.entries(cat && cat.fields || {})) {
        const status = String(row && row.status || '').toUpperCase();
        if (status && !['MATCH_EXACT','NOT_COMPARABLE'].includes(status)) out.push({ kind:'category', code:String(cat.code || '').toUpperCase(), field, status, local:row.local, reference:row.reference, delta:row.delta });
      }
    }
    return out;
  }
  function replayExact(replay) { return Boolean(replay && replay.pass && replay.comparison && replay.comparison.safe_to_promote === true); }
  function finalExact(replay) {
    const settled = replay && replay.settlement && replay.settlement.settlement_result || null;
    if (!settled) return null;
    if (settled.exact && settled.exact.final_net != null) return String(settled.exact.final_net);
    return settled.final_net == null ? null : String(settled.final_net);
  }
  function replaySummary(replay, error) {
    if (error) return { status:'REPLAY_ERROR', reference_match_exact:false, current_engine_version:null, final_exact:null, current_final_delta:null, current_issues:[], error:String(error && error.message || error) };
    const comparison = replay && replay.comparison || {};
    const finalRow = comparison.totals && comparison.totals.final_net || null;
    return {
      status:String(comparison.status || (replayExact(replay) ? 'MATCH_EXACT' : 'UNVERIFIED')).toUpperCase(),
      reference_match_exact:replayExact(replay),
      current_engine_version:replay && replay.settlement && replay.settlement.engine_version || null,
      final_exact:finalExact(replay),
      current_final_delta:finalRow && finalRow.delta != null ? finalRow.delta : null,
      current_issues:comparisonIssues(comparison),
      error:null
    };
  }
  function classifyResolution(baseline, changedCount, parserPath) {
    if (!baseline || baseline.error) return 'BASELINE_REPLAY_ERROR';
    if (!parserPath || parserPath.error) return 'PARSER_PATH_ERROR';
    const a = baseline.reference_match_exact === true, b = parserPath.reference_match_exact === true, changed = Number(changedCount || 0) > 0;
    if (a && b) return changed ? 'BOTH_PATHS_EXACT_CANONICAL_CHANGED' : 'ENGINE_PATH_EXACT_PARSER_UNCHANGED';
    if (a && !b) return 'PARSER_REGRESSION_RISK';
    if (!a && b) return changed ? 'PARSER_CHANGE_RESOLVES_REFERENCE' : 'REPLAY_INCONSISTENCY';
    return changed ? 'PARSER_CHANGED_UNRESOLVED' : 'PARSER_UNCHANGED_UNRESOLVED';
  }
  async function replayCandidate(candidate, event, apis) {
    if (!candidate || !candidate.case) throw new Error('PARSER_REPLAY_CANDIDATE_REQUIRED');
    const scope = scopeFromCandidate(candidate), d = apis || deps(), nextCase = clone(candidate.case);
    let baselineReplay = null, baselineError = null;
    try { baselineReplay = d.regression.replayCase(candidate.case); } catch (error) { baselineError = error; }
    const baseline = replaySummary(baselineReplay, baselineError);
    const messages = Array.isArray(nextCase.messages) ? nextCase.messages : [], messageResults = [];
    let changed = 0, errors = 0, buildChanged = 0, buildUnknown = 0;
    for (const message of messages) {
      const id = String(message && message.id || '');
      if (String(message && message.status || '').toLowerCase() === 'cancelled') { messageResults.push({ message_id:id, status:'SKIPPED_CANCELLED', changed:false, differences:[], parser_build_changed:null }); continue; }
      const raw = String(message && message.raw_text || '').trim();
      if (!raw) { errors += 1; messageResults.push({ message_id:id, status:'PARSER_REPLAY_ERROR', changed:null, differences:[], parser_build_changed:null, error:'PARSER_REPLAY_RAW_TEXT_REQUIRED' }); continue; }
      try {
        const current = await d.parser.fetchCanonical(raw, scope.region, scope.business_date);
        const differences = canonicalDiff(message.canonical_payload, current, scope.region), isChanged = differences.length > 0;
        const capturedIdentity = parserIdentityHash(message.canonical_payload), currentIdentity = parserIdentityHash(current);
        const parserBuildChanged = capturedIdentity && currentIdentity ? capturedIdentity !== currentIdentity : null;
        if (parserBuildChanged === true) buildChanged += 1;
        if (parserBuildChanged == null) buildUnknown += 1;
        if (isChanged) changed += 1;
        messageResults.push({ message_id:id, status:isChanged ? 'CANONICAL_CHANGED' : 'CANONICAL_UNCHANGED', changed:isChanged, differences,
          captured_parser_version:message.canonical_payload && message.canonical_payload.parser_version || null,
          current_parser_version:current && current.parser_version || null,
          captured_parser_identity:parserIdentitySummary(message.canonical_payload), current_parser_identity:parserIdentitySummary(current), parser_build_changed:parserBuildChanged,
          captured_canonical:canonicalShape(message.canonical_payload, scope.region), current_canonical:canonicalShape(current, scope.region) });
        message.canonical_payload = clone(current);
      } catch (error) { errors += 1; messageResults.push({ message_id:id, status:'PARSER_REPLAY_ERROR', changed:null, differences:[], parser_build_changed:null, error:String(error && error.message || error) }); }
    }
    const base = { format:'kts-parser-replay-v3-provenance', diagnostic_only:true, candidate_id:String(candidate.id || ''), source_event_id:String(candidate.source_event_id || event && event.id || ''), scope,
      parser_endpoint:typeof d.parser.endpoint === 'function' ? d.parser.endpoint() : null, message_count:messages.length, changed_message_count:changed, parser_build_changed_count:buildChanged, parser_identity_unknown_count:buildUnknown, error_count:errors, messages:messageResults,
      captured_comparison_status:String(event && event.comparison_status || event && event.comparison && event.comparison.status || '').toUpperCase(), captured_canonical_path:baseline };
    if (errors) return Object.assign(base, { status:'PARSER_REPLAY_ERROR', resolution_state:'PARSER_PATH_ERROR', human_review_ready:false, reference_match_exact:false, comparison:null, current_issues:[], current_final_delta:null, parser_path_final_exact:null, money_path_changed:null, error:'PARSER_REPLAY_MESSAGE_ERRORS:' + errors });
    let replay = null, replayError = null;
    try { replay = d.regression.replayCase(nextCase); } catch (error) { replayError = error; }
    const parserPath = replaySummary(replay, replayError);
    if (replayError) return Object.assign(base, { status:'PARSER_ENGINE_REPLAY_ERROR', resolution_state:'PARSER_PATH_ERROR', human_review_ready:false, reference_match_exact:false, comparison:null, current_issues:[], current_final_delta:null, parser_path_final_exact:null, money_path_changed:null, error:parserPath.error });
    const exact = parserPath.reference_match_exact;
    const status = changed ? (exact ? 'CANONICAL_CHANGED_REPLAY_EXACT' : 'CANONICAL_CHANGED_STILL_MISMATCH') : (exact ? 'CANONICAL_UNCHANGED_ENGINE_EXACT' : 'CANONICAL_UNCHANGED_STILL_MISMATCH');
    const resolutionState = classifyResolution(baseline, changed, parserPath);
    const aFinal = baseline.final_exact, bFinal = parserPath.final_exact;
    return Object.assign(base, {
      status, resolution_state:resolutionState,
      human_review_ready:exact && !['REPLAY_INCONSISTENCY','BASELINE_REPLAY_ERROR','PARSER_REGRESSION_RISK'].includes(resolutionState),
      reference_match_exact:exact,
      current_engine_version:parserPath.current_engine_version,
      comparison:clone(replay && replay.comparison || {}), current_issues:parserPath.current_issues, current_final_delta:parserPath.current_final_delta,
      parser_path_final_exact:bFinal, money_path_changed:aFinal != null && bFinal != null ? aFinal !== bFinal : null,
      replayed_case:nextCase, error:null
    });
  }
  async function candidateAndEvent(candidateId) {
    const d = deps(), pending = await d.candidates.listCandidates({ state:d.candidates.STATES.PENDING });
    const candidate = pending.find(c => String(c.id || '') === String(candidateId || ''));
    if (!candidate) throw new Error('PARSER_REPLAY_CANDIDATE_NOT_FOUND:' + String(candidateId || ''));
    const scope = scopeFromCandidate(candidate), history = await d.runtime.getHistory(scope);
    const event = (history || []).find(row => String(row.id || '') === String(candidate.source_event_id || ''));
    if (!event) throw new Error('PARSER_REPLAY_EVIDENCE_NOT_FOUND:' + String(candidate.source_event_id || ''));
    return { candidate, event };
  }
  async function replayCandidateId(candidateId) { const pair = await candidateAndEvent(candidateId); return replayCandidate(pair.candidate, pair.event); }
  async function replayGroup(candidateIds) {
    const results = [];
    for (const id of (candidateIds || [])) {
      try { results.push(await replayCandidateId(id)); }
      catch (error) { results.push({ format:'kts-parser-replay-v3-provenance', diagnostic_only:true, candidate_id:String(id), status:'PARSER_REPLAY_ERROR', resolution_state:'PARSER_PATH_ERROR', human_review_ready:false, reference_match_exact:false, error:String(error && error.message || error), messages:[], current_issues:[] }); }
    }
    return { format:'kts-parser-replay-group-v3-provenance', total:results.length, exact:results.filter(x=>x.reference_match_exact).length, ready_for_human_review:results.filter(x=>x.human_review_ready).length, parser_regression_risks:results.filter(x=>x.resolution_state==='PARSER_REGRESSION_RISK').length, parser_build_changed_cases:results.filter(x=>Number(x.parser_build_changed_count||0)>0).length, parser_identity_unknown_cases:results.filter(x=>Number(x.parser_identity_unknown_count||0)>0).length, errors:results.filter(x=>/ERROR$/.test(String(x.status||''))).length, results };
  }

  function installUi() {
    const doc = global.document, pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('parserReplayPanel')) return;
    const card = doc.createElement('div'); card.className='card'; card.id='parserReplayPanel';
    card.innerHTML = `<div class="section-title">Parser replay · raw text → parser hiện tại</div><div class="hint">Chỉ chạy khi bấm nút. So 2 đường: <b>canonical đã chụp → engine hiện tại</b> và <b>raw_text → parser hiện tại → engine hiện tại</b>. Có thêm SHA identity để biết parser build nào tạo canonical; build đổi nhưng canonical/tiền không đổi chỉ là provenance, không tự coi là mismatch. Không ghi settlement, không dismiss candidate, không xác nhận HIOSKT.</div><div id="parserReplayStatus" class="status"></div><div id="parserReplayControls" class="hint">Mở một nhóm mismatch trước.</div><div id="parserReplayOutput" class="hint"></div>`;
    pane.appendChild(card); let activeIds=[];
    function status(text,kind){const el=doc.getElementById('parserReplayStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    function shortHash(v){return v?String(v).slice(0,12):'unknown';}
    function resolutionText(state){return ({ENGINE_PATH_EXACT_PARSER_UNCHANGED:'Engine hiện tại đã sửa case; parser không đổi canonical.',BOTH_PATHS_EXACT_CANONICAL_CHANGED:'Cả canonical cũ và parser hiện tại đều khớp tiền; parser có thay đổi semantic canonical.',PARSER_CHANGE_RESOLVES_REFERENCE:'Canonical cũ vẫn lệch nhưng đường parser hiện tại đã khớp HIOSKT.',PARSER_REGRESSION_RISK:'CẢNH BÁO: canonical cũ + engine hiện tại khớp nhưng parser hiện tại làm case lệch lại.',PARSER_CHANGED_UNRESOLVED:'Parser đã đổi canonical nhưng case vẫn lệch.',PARSER_UNCHANGED_UNRESOLVED:'Parser không đổi canonical và case vẫn lệch.',REPLAY_INCONSISTENCY:'Cùng canonical nhưng hai replay cho kết quả không nhất quán; fail-closed.',BASELINE_REPLAY_ERROR:'Không replay được canonical evidence cũ.',PARSER_PATH_ERROR:'Không replay được đường parser hiện tại.'})[state]||state;}
    function renderResult(row){
      if(/ERROR$/.test(String(row.status||'')))return `<div class="report-message"><span class="tag err">${esc(row.status)}</span> <b>${esc(row.candidate_id)}</b><div class="status err">${esc(row.error||'unknown')}</div></div>`;
      const ok=row.reference_match_exact, risk=row.resolution_state==='PARSER_REGRESSION_RISK';
      const msg=(row.messages||[]).map(m=>{if(m.status==='SKIPPED_CANCELLED')return `<div class="hint">${esc(m.message_id)} · đã hủy · bỏ qua</div>`;if(m.status==='PARSER_REPLAY_ERROR')return `<div class="status err">${esc(m.message_id)} · ${esc(m.error)}</div>`;const diff=m.differences&&m.differences.length?`<details><summary class="hint">Canonical thay đổi ${m.differences.length} field</summary><div class="raw">${esc(JSON.stringify(m.differences,null,2))}</div></details>`:'<div class="hint">Canonical không đổi.</div>';const oldHash=m.captured_parser_identity&&m.captured_parser_identity.identity_sha256,newHash=m.current_parser_identity&&m.current_parser_identity.identity_sha256,build=m.parser_build_changed===null?'identity cũ chưa có':(m.parser_build_changed?'BUILD CHANGED':'same build');return `<div class="report-message"><b>${esc(m.message_id)}</b> · ${m.changed?'<span class="tag warn">CANONICAL CHANGED</span>':'<span class="tag ok">CANONICAL UNCHANGED</span>'}<div class="hint">parser ${esc(m.captured_parser_version||'—')} [${esc(shortHash(oldHash))}] → ${esc(m.current_parser_version||'—')} [${esc(shortHash(newHash))}] · ${esc(build)}</div>${diff}</div>`;}).join('');
      const issues=row.current_issues&&row.current_issues.length?`<details><summary class="hint">Field còn lệch (${row.current_issues.length})</summary><div class="raw">${esc(JSON.stringify(row.current_issues,null,2))}</div></details>`:'<div class="hint">Không còn field tiền lệch trên đường parser hiện tại.</div>';
      const cls=risk?'err':(row.human_review_ready?'ok':'warn');
      return `<div class="report-message"><div>${ok?'<span class="tag ok">PARSER + ENGINE · MATCH_EXACT</span>':`<span class="tag err">${esc(row.status)}</span>`} <b>${esc(row.scope&&row.scope.business_date||'')} ${esc(String(row.scope&&row.scope.region||'').toUpperCase())}</b></div><div class="status ${cls}">${esc(row.resolution_state)} · ${esc(resolutionText(row.resolution_state))}</div><div class="hint">canonical đổi ${row.changed_message_count}/${row.message_count} tin · parser build đổi ${row.parser_build_changed_count} · identity chưa có ${row.parser_identity_unknown_count} · captured path final ${esc(row.captured_canonical_path&&row.captured_canonical_path.final_exact||'—')} → parser path final ${esc(row.parser_path_final_exact||'—')} · tiền đổi theo parser: ${row.money_path_changed===null?'—':(row.money_path_changed?'CÓ':'KHÔNG')}</div><div class="hint">endpoint ${esc(row.parser_endpoint||'—')}</div>${msg}${issues}<div class="hint">Diagnostic only. ${row.human_review_ready?'Case đủ để người vận hành xem xét xử lý candidate, nhưng hệ thống không tự xử lý.':'Candidate tiếp tục PENDING.'}</div></div>`;
    }
    async function run(ids){if(!ids.length)return;status('Đang gọi parser hiện tại và replay 2 đường…','warn');const result=await replayGroup(ids);doc.getElementById('parserReplayOutput').innerHTML=result.results.map(renderResult).join('');status(`Parser replay xong ${result.total} case · MATCH_EXACT ${result.exact} · sẵn sàng human review ${result.ready_for_human_review} · parser regression risk ${result.parser_regression_risks} · build đổi ${result.parser_build_changed_cases} · identity cũ chưa có ${result.parser_identity_unknown_cases} · lỗi ${result.errors}. Không ghi dữ liệu nghiệp vụ.`,result.errors||result.parser_regression_risks?'warn':(result.ready_for_human_review===result.total?'ok':'warn'));if(card.scrollIntoView)card.scrollIntoView({behavior:'smooth',block:'start'});}
    function renderControls(){const host=doc.getElementById('parserReplayControls');if(!activeIds.length){host.textContent='Mở một nhóm mismatch trước.';return;}const endpoint=global.KTS_SETTLEMENT_PARSER_PROVIDER&&global.KTS_SETTLEMENT_PARSER_PROVIDER.endpoint?global.KTS_SETTLEMENT_PARSER_PROVIDER.endpoint():'—';host.innerHTML=`<div class="hint">${activeIds.length} candidate · parser endpoint: ${esc(endpoint)}</div><div class="row" style="margin-top:6px"><button id="parserReplayGroup" class="btn soft">Replay parser cả nhóm</button></div>`+activeIds.map((id,i)=>`<div class="row" style="margin-top:5px"><span class="hint" style="flex:1">${esc(id)}</span><button class="btn soft" data-parser-replay-one="${i}">Replay parser</button></div>`).join('');doc.getElementById('parserReplayGroup').addEventListener('click',()=>run(activeIds.slice()).catch(e=>status(String(e&&e.message||e),'err')));host.querySelectorAll('[data-parser-replay-one]').forEach(btn=>btn.addEventListener('click',()=>{const id=activeIds[Number(btn.getAttribute('data-parser-replay-one'))];run(id?[id]:[]).catch(e=>status(String(e&&e.message||e),'err'));}));}
    if(typeof global.addEventListener==='function')global.addEventListener('kts:repair-open',event=>{activeIds=(event&&event.detail&&event.detail.candidate_ids||[]).map(String);doc.getElementById('parserReplayOutput').innerHTML='';renderControls();status('Đã nạp nhóm. Parser chưa được gọi; bấm Replay khi cần kiểm tra parser hiện tại.','warn');});
  }

  global.KTS_SETTLEMENT_PARSER_REPLAY=Object.freeze({version:'settlement-parser-replay-v3-provenance',parserIdentityHash,parserIdentitySummary,canonicalShape,canonicalDiff,comparisonIssues,replaySummary,classifyResolution,replayCandidate,candidateAndEvent,replayCandidateId,replayGroup});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window !== 'undefined' ? window : globalThis);
