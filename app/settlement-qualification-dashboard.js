(function (global) {
  'use strict';

  const HASH_RE = /^[0-9a-f]{64}$/i;
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;'); }
  function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function scopeKey(v) { return [String(v && v.partner_id || ''), String(v && v.business_date || ''), String(v && v.region || '').toLowerCase()].join(':'); }
  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const observation = global.KTS_SETTLEMENT_OBSERVATION;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const readiness = global.KTS_SETTLEMENT_REPAIR_READINESS;
    const parserProvider = global.KTS_SETTLEMENT_PARSER_PROVIDER;
    if (!store || !observation || !regression || !candidates || !readiness || !parserProvider) throw new Error('QUALIFICATION_DEPENDENCY_MISSING');
    return { store, observation, regression, candidates, readiness, parserProvider };
  }
  function normalizeWindow(options) {
    const o = options || {};
    const from = String(o.from_date || '').slice(0,10), to = String(o.to_date || '').slice(0,10);
    if (from && !validDate(from)) throw new Error('QUALIFICATION_FROM_DATE_INVALID');
    if (to && !validDate(to)) throw new Error('QUALIFICATION_TO_DATE_INVALID');
    if (from && to && from > to) throw new Error('QUALIFICATION_DATE_RANGE_INVALID');
    return { from_date:from, to_date:to, regions:Array.isArray(o.regions)?o.regions.map(x=>String(x).toLowerCase()):[], partner_id:o.partner_id?String(o.partner_id):'' };
  }
  function messageInWindow(message, options) {
    const o = normalizeWindow(options), date = String(message && message.business_date || '');
    if (!validDate(date)) return false;
    if (o.from_date && date < o.from_date) return false;
    if (o.to_date && date > o.to_date) return false;
    if (o.partner_id && String(message.partner_id || '') !== o.partner_id) return false;
    if (o.regions.length && !o.regions.includes(String(message.region || '').toLowerCase())) return false;
    return String(message && message.status || '').toLowerCase() !== 'cancelled';
  }
  function kqxsVerificationGate(observationSummary) {
    const scopes = observationSummary && Array.isArray(observationSummary.scopes) ? observationSummary.scopes : [];
    let verified = 0, conflict = 0, unverified = 0;
    const bad_scopes = [];
    for (const scope of scopes) {
      const status = String(scope && scope.result_verification_status || 'unverified').toLowerCase();
      const evidenceValid = scope && scope.result_verification_evidence_valid === true;
      if (status === 'verified' && evidenceValid) verified += 1;
      else {
        if (status === 'conflict') conflict += 1; else unverified += 1;
        bad_scopes.push({
          partner_id:String(scope && scope.partner_id || ''),
          business_date:String(scope && scope.business_date || ''),
          region:String(scope && scope.region || '').toLowerCase(),
          verification_status:status,
          evidence_valid:evidenceValid,
          reason:String(scope && scope.result_verification_reason || (status === 'verified' ? 'KQXS_STRICT_EVIDENCE_MISSING' : 'KQXS_NOT_VERIFIED'))
        });
      }
    }
    return { total:scopes.length, verified, conflict, unverified, bad_scopes, met:scopes.length > 0 && verified === scopes.length };
  }
  function parserProvenanceGate(messages, options) {
    const active = (Array.isArray(messages) ? messages : []).filter(m => messageInWindow(m, options));
    let known = 0, unknown = 0, invalid = 0, parser_errors = 0, missing_canonical = 0;
    const bad_messages = [];
    for (const message of active) {
      const id = String(message && message.id || '');
      if (message && message.parser_error) {
        parser_errors += 1; bad_messages.push({ id, reason:'PARSER_ERROR' }); continue;
      }
      const canonical = message && message.canonical_payload;
      if (!canonical) {
        missing_canonical += 1; bad_messages.push({ id, reason:'CANONICAL_MISSING' }); continue;
      }
      const identity = canonical.parser_identity;
      const hash = identity && identity.identity_sha256;
      if (hash == null || hash === '') {
        unknown += 1; bad_messages.push({ id, reason:'PARSER_IDENTITY_UNKNOWN' }); continue;
      }
      if (!HASH_RE.test(String(hash))) {
        invalid += 1; bad_messages.push({ id, reason:'PARSER_IDENTITY_INVALID' }); continue;
      }
      known += 1;
    }
    return {
      total:active.length, known, unknown, invalid, parser_errors, missing_canonical, bad_messages,
      met:active.length > 0 && known === active.length
    };
  }
  async function parserBackendGate(messages, options, parserProvider) {
    const active = (Array.isArray(messages) ? messages : []).filter(m => messageInWindow(m, options));
    if (!active.length) return { met:false, total:0, matched:0, mismatched:0, unreachable:false, error:'NO_ACTIVE_MESSAGES', bad_messages:[], live_identity:null };
    let live;
    try {
      live = await parserProvider.fetchIdentity();
    } catch (error) {
      return {
        met:false, total:active.length, matched:0, mismatched:active.length, unreachable:true,
        error:String(error && error.message || error || 'PARSER_BACKEND_IDENTITY_UNAVAILABLE'),
        bad_messages:active.map(m=>({id:String(m && m.id || ''),reason:'PARSER_BACKEND_IDENTITY_UNAVAILABLE'})), live_identity:null
      };
    }
    let matched = 0;
    const bad_messages = [];
    for (const message of active) {
      const id = String(message && message.id || '');
      const region = String(message && message.region || '').toLowerCase();
      const identityKey = region === 'mb' ? 'mb' : (region === 'mn' || region === 'mt' ? 'mn_mt' : '');
      const stored = message && message.canonical_payload && message.canonical_payload.parser_identity;
      const liveIdentity = identityKey && live && live.identities && live.identities[identityKey];
      const storedHash = stored && stored.identity_sha256 ? String(stored.identity_sha256).toLowerCase() : '';
      const liveHash = liveIdentity && liveIdentity.identity_sha256 ? String(liveIdentity.identity_sha256).toLowerCase() : '';
      if (identityKey && HASH_RE.test(storedHash) && HASH_RE.test(liveHash) && storedHash === liveHash) matched += 1;
      else bad_messages.push({ id, region, identity_key:identityKey || null, stored_identity_sha256:storedHash || null, live_identity_sha256:liveHash || null, reason:'PARSER_BACKEND_IDENTITY_MISMATCH' });
    }
    return {
      met:active.length > 0 && matched === active.length,
      total:active.length,
      matched,
      mismatched:active.length - matched,
      unreachable:false,
      error:null,
      bad_messages,
      live_identity:clone(live)
    };
  }
  function unverifiedFeatureGate(settlements, observationSummary) {
    const scopes = new Set((observationSummary && observationSummary.scopes || []).map(scopeKey));
    const unsafe = [];
    for (const row of (Array.isArray(settlements) ? settlements : [])) {
      if (!scopes.has(scopeKey(row))) continue;
      const configUi = row && row.config_snapshot && row.config_snapshot.tinh_ui === true;
      const categoryUi = (row && row.category_rows || []).some(x => String(x && x.code || '').toUpperCase() === 'UI');
      if (configUi || categoryUi) unsafe.push({ partner_id:String(row.partner_id || ''), business_date:String(row.business_date || ''), region:String(row.region || '').toLowerCase(), config_tinh_ui:configUi, ui_category_present:categoryUi });
    }
    return { met:unsafe.length === 0, unsafe_scopes:unsafe, unsafe_count:unsafe.length };
  }
  function candidateSummary(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return {
      pending:list.filter(x=>String(x && x.state || '').toLowerCase()==='pending').length,
      promoted:list.filter(x=>String(x && x.state || '').toLowerCase()==='promoted').length,
      dismissed:list.filter(x=>String(x && x.state || '').toLowerCase()==='dismissed').length
    };
  }
  function combineQualification(input) {
    const x = input || {}, observation = x.observation || {}, regression = x.regression || {total:0,passed:0,failed:0}, candidates = x.candidates || {pending:0,promoted:0,dismissed:0};
    const kqxs = x.kqxs || {met:false,total:0,verified:0,conflict:0,unverified:0};
    const provenance = x.parser_provenance || {met:false,total:0,known:0,unknown:0,invalid:0,parser_errors:0,missing_canonical:0};
    const parserBackend = x.parser_backend || {met:false,total:0,matched:0,mismatched:0,unreachable:true,error:'NOT_CHECKED'};
    const features = x.feature_safety || {met:true,unsafe_count:0};
    const readiness = x.repair_readiness || {summary:{total:0,ready:0,blocked:0,all_ready:false},items:[]};
    const blockers = new Set(Array.isArray(observation.blockers) ? observation.blockers : []);
    if (!(regression.total > 0)) blockers.add('NO_PINNED_REGRESSION_CASES');
    if (regression.failed > 0) blockers.add(`REGRESSION_FAILED:${regression.failed}/${regression.total}`);
    if (candidates.pending > 0) {
      const rs = readiness.summary || {};
      if (rs.total > 0 && rs.ready === rs.total) blockers.add(`OPERATOR_CONFIRMATION_PENDING:${candidates.pending}`);
      else blockers.add(`REPAIR_NOT_READY:${Number(rs.ready||0)}/${candidates.pending}`);
    }
    if (!kqxs.met) blockers.add(`KQXS_NOT_FULLY_VERIFIED:${Number(kqxs.verified||0)}/${Number(kqxs.total||0)}`);
    if (!provenance.met) blockers.add(`PARSER_PROVENANCE_INCOMPLETE:${Number(provenance.known||0)}/${Number(provenance.total||0)}`);
    if (!parserBackend.met) {
      if (parserBackend.unreachable) blockers.add('PARSER_BACKEND_IDENTITY_UNAVAILABLE');
      else blockers.add(`PARSER_BACKEND_IDENTITY_MISMATCH:${Number(parserBackend.matched||0)}/${Number(parserBackend.total||0)}`);
    }
    if (!features.met) blockers.add(`UNVERIFIED_UI_FEATURE_ACTIVE:${Number(features.unsafe_count||0)}`);
    const ready = observation.promotion_ready === true && regression.total > 0 && regression.failed === 0 && candidates.pending === 0 && kqxs.met === true && provenance.met === true && parserBackend.met === true && features.met === true;
    return {
      format:'kts-final-qualification-v2-live-parser',
      generated_at:new Date().toISOString(),
      qualification_state:ready ? 'READY_FOR_PRODUCTION_REVIEW' : 'BLOCKED_SHADOW_QUALIFICATION',
      ready_for_production_review:ready,
      production_enabled:false,
      merge_authorized:false,
      observation:clone(observation),
      kqxs_verification:clone(kqxs),
      parser_provenance:clone(provenance),
      parser_backend:clone(parserBackend),
      regression_gate:{ total:Number(regression.total||0), passed:Number(regression.passed||0), failed:Number(regression.failed||0), met:regression.total>0&&regression.failed===0 },
      candidate_gate:Object.assign({}, clone(candidates), { met:candidates.pending===0 }),
      repair_readiness:clone(readiness),
      feature_safety:clone(features),
      blockers:[...blockers]
    };
  }
  async function runQualification(options) {
    const d = deps(), o = options || {};
    const [settlements, messages, regressionSummary, candidateRows] = await Promise.all([
      d.store.getAll(d.store.STORES.settlements),
      d.store.getAll(d.store.STORES.messages),
      d.regression.runPinnedCases(),
      d.candidates.listCandidates()
    ]);
    const cs = candidateSummary(candidateRows);
    const observationSummary = d.observation.buildObservation(settlements, {
      from_date:o.from_date,
      to_date:o.to_date,
      required_observation_days:o.required_observation_days,
      partner_id:o.partner_id,
      regions:o.regions,
      messages,
      regression_summary:regressionSummary,
      candidate_summary:cs
    });
    let readinessRows = await d.readiness.loadLocalQueue();
    if (o.check_parser !== false && readinessRows.length) readinessRows = await d.readiness.checkParserRows(readinessRows, o.on_progress);
    const readinessReport = d.readiness.readinessReport(readinessRows);
    const backendGate = await parserBackendGate(messages, o, d.parserProvider);
    return combineQualification({
      observation:observationSummary,
      regression:regressionSummary,
      candidates:cs,
      kqxs:kqxsVerificationGate(observationSummary),
      parser_provenance:parserProvenanceGate(messages, o),
      parser_backend:backendGate,
      feature_safety:unverifiedFeatureGate(settlements, observationSummary),
      repair_readiness:readinessReport
    });
  }

  function installUi() {
    const doc = global.document, pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('finalQualificationPanel')) return;
    const card = doc.createElement('div'); card.className='card'; card.id='finalQualificationPanel';
    card.innerHTML = `<div class="section-title">Qualification cuối · một gate duy nhất</div>
      <div class="hint">Gom Shadow coverage + HIOSKT exact + KQXS 2 nguồn + parser provenance + parser backend đang chạy + golden regression + candidate/repair + feature chưa xác minh. Chỉ tạo trạng thái <b>READY_FOR_PRODUCTION_REVIEW</b>; tuyệt đối không tự bật production, merge main, xác nhận HIOSKT hay ghi lại tiền.</div>
      <div class="row" style="margin-top:8px"><button id="finalQualificationRun" class="btn primary">Chạy gate cuối + kiểm parser</button><button id="finalQualificationExport" class="btn soft">Xuất snapshot JSON</button><button id="finalQualificationCandidates" class="btn soft">Mở queue xác nhận</button></div>
      <div id="finalQualificationStatus" class="status"></div><div id="finalQualificationOutput" class="hint"></div>`;
    pane.insertBefore(card, pane.firstChild);
    let latest = null;
    function status(text,kind){const el=doc.getElementById('finalQualificationStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    function gateRow(name, met, detail) { return `<tr><td><b>${esc(name)}</b></td><td class="${met?'ok':'err'}">${met?'PASS':'BLOCK'}</td><td>${esc(detail)}</td></tr>`; }
    function render(q) {
      const obs=q.observation||{}, oc=obs.counts||{}, kg=q.kqxs_verification||{}, pg=q.parser_provenance||{}, pb=q.parser_backend||{}, rg=q.regression_gate||{}, cg=q.candidate_gate||{}, fs=q.feature_safety||{}, rr=q.repair_readiness&&q.repair_readiness.summary||{};
      const shadowMet=obs.promotion_ready===true;
      const parserBackendDetail=pb.unreachable?`không đọc được identity backend · ${pb.error||'unknown'}`:`${pb.matched||0}/${pb.total||0} tin trùng parser backend hiện tại · lệch ${pb.mismatched||0}`;
      const rows=[
        gateRow('Shadow + thời gian quan sát',shadowMet,`${obs.exact_days||0} ngày exact · ${oc.exact||0}/${oc.total||0} scope exact · thiếu ${oc.missing_scopes||0}`),
        gateRow('KQXS cross-source',kg.met===true,`${kg.verified||0}/${kg.total||0} scope verified · conflict ${kg.conflict||0} · unverified ${kg.unverified||0}`),
        gateRow('Parser provenance',pg.met===true,`${pg.known||0}/${pg.total||0} tin có identity SHA · unknown ${pg.unknown||0} · error ${pg.parser_errors||0}`),
        gateRow('Parser backend hiện tại',pb.met===true,parserBackendDetail),
        gateRow('Golden regression',rg.met===true,`${rg.passed||0}/${rg.total||0} PASS · fail ${rg.failed||0}`),
        gateRow('Mismatch candidate',cg.met===true,`pending ${cg.pending||0} · promoted ${cg.promoted||0} · dismissed ${cg.dismissed||0}`),
        gateRow('Repair readiness',!(cg.pending>0) || (rr.total>0&&rr.ready===rr.total),cg.pending>0?`${rr.ready||0}/${rr.total||0} kỹ thuật sẵn sàng cho operator confirm`:'không còn pending candidate'),
        gateRow('Rule chưa xác minh',fs.met===true,fs.met?'Tính Ủi chưa xác minh không hoạt động trong scope qualification':`${fs.unsafe_count||0} scope đang bật/dùng Tính Ủi`)
      ].join('');
      const cls=q.ready_for_production_review?'ok':'err';
      const title=q.ready_for_production_review?'READY_FOR_PRODUCTION_REVIEW':'BLOCKED_SHADOW_QUALIFICATION';
      doc.getElementById('finalQualificationOutput').innerHTML=`<div class="status ${cls}">${esc(title)}</div><div class="hint">production_enabled = false · merge_authorized = false</div><div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Gate</th><th>Kết quả</th><th>Chi tiết</th></tr></thead><tbody>${rows}</tbody></table></div>${q.blockers.length?`<div class="status warn">Blocker: ${esc(q.blockers.join(' · '))}</div>`:'<div class="status ok">Không còn blocker kỹ thuật trong cửa sổ qualification đã chọn. Vẫn cần review thủ công trước mọi quyết định production.</div>'}`;
      status(q.ready_for_production_review?'Gate kỹ thuật sạch. Chỉ đủ điều kiện để REVIEW production; chưa bật production.':`Còn ${q.blockers.length} blocker. Không được promotion.`,q.ready_for_production_review?'ok':'warn');
    }
    function observationOptions() {
      const byId=id=>doc.getElementById(id);
      return {
        from_date:byId('observationFrom')&&byId('observationFrom').value || '',
        to_date:byId('observationTo')&&byId('observationTo').value || '',
        required_observation_days:byId('observationDays')&&byId('observationDays').value || '',
        check_parser:true,
        on_progress:p=>status(`Qualification: parser ${p.index}/${p.total} · ${p.candidate_id||'—'} · ${p.status}`,'warn')
      };
    }
    function emitCompleted(qualification, options) {
      if (typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
      global.dispatchEvent(new global.CustomEvent('kts:qualification-completed', { detail: {
        qualification: clone(qualification),
        options: {
          from_date: String(options && options.from_date || ''),
          to_date: String(options && options.to_date || ''),
          required_observation_days: String(options && options.required_observation_days || ''),
          partner_id: String(options && options.partner_id || ''),
          regions: Array.isArray(options && options.regions) ? options.regions.slice() : []
        }
      }}));
    }
    doc.getElementById('finalQualificationRun').addEventListener('click',async event=>{const btn=event.currentTarget;try{btn.disabled=true;status('Đang chạy toàn bộ qualification gate…','warn');const options=observationOptions();latest=await runQualification(options);render(latest);emitCompleted(latest,options);}catch(e){status(String(e&&e.message||e),'err');}finally{btn.disabled=false;}});
    doc.getElementById('finalQualificationExport').addEventListener('click',()=>{try{if(!latest)throw new Error('QUALIFICATION_SNAPSHOT_REQUIRED');const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='kts-final-qualification-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Đã xuất snapshot qualification đọc-only.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('finalQualificationCandidates').addEventListener('click',()=>{const target=doc.getElementById('repairReadinessPanel')||doc.getElementById('regressionCandidatePanel');if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:'start'});});
  }

  global.KTS_SETTLEMENT_QUALIFICATION = Object.freeze({
    version:'settlement-qualification-dashboard-v4-strict-kqxs-evidence',
    normalizeWindow, messageInWindow, kqxsVerificationGate, parserProvenanceGate, parserBackendGate,
    unverifiedFeatureGate, candidateSummary, combineQualification, runQualification
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window !== 'undefined' ? window : globalThis);
