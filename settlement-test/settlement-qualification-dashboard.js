(function (global) {
  'use strict';

  const HASH_RE = /^[0-9a-f]{64}$/i;
  const RESULT_PRIZE_COUNTS = Object.freeze({
    mn:Object.freeze({G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1}),
    mt:Object.freeze({G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1}),
    mb:Object.freeze({G7:4,G6:3,G5:6,G4:4,G3:6,G2:2,G1:1,DB:1})
  });
  function stationPrizeComplete(region,station){
    const expected=RESULT_PRIZE_COUNTS[String(region||'').toLowerCase()];
    if(!expected||!station||station.complete===false)return false;
    const prizes=station.prizes||{};
    return Object.entries(expected).every(([prize,count])=>{
      const found=Object.entries(prizes).find(([key])=>String(key).toUpperCase()===prize);
      const values=found?(Array.isArray(found[1])?found[1]:[found[1]]):[];
      return values.filter(v=>v!=null&&String(v).trim()!=='').length===count;
    });
  }
  function canonicalResultEvidence(scope,result){
    if(!result)return {status:'unverified',valid:false,reason:'KQXS_CANONICAL_RESULT_MISSING'};
    const date=String(scope&&scope.business_date||'').slice(0,10),region=String(scope&&scope.region||'').toLowerCase();
    if(String(result.business_date||'').slice(0,10)!==date||String(result.region||'').toLowerCase()!==region)return {status:'unverified',valid:false,reason:'KQXS_CANONICAL_SCOPE_MISMATCH'};
    const conflicts=Array.isArray(result.verification_conflicts)?result.verification_conflicts:[];
    const status=String(result.verification_status||'').toLowerCase();
    if(status==='conflict'||conflicts.length)return {status:'conflict',valid:false,reason:'KQXS_SOURCE_CONFLICT'};
    if(result.complete!==true||result.coverage_complete!==true)return {status:'unverified',valid:false,reason:'KQXS_CANONICAL_INCOMPLETE'};
    const sources=new Set((Array.isArray(result.verification_sources)?result.verification_sources:[]).map(x=>String(x||'').trim()).filter(Boolean));
    if(sources.size<2)return {status:'unverified',valid:false,reason:'KQXS_SOURCES_INSUFFICIENT'};
    const expected=Array.isArray(result.expected_station_codes)?result.expected_station_codes.map(x=>String(x||'').trim().toLowerCase()).filter(Boolean):[];
    const stations=Array.isArray(result.stations)?result.stations:[];
    const actual=stations.map(x=>String(x&&x.code||'').trim().toLowerCase()).filter(Boolean);
    const coverage=expected.length>0&&new Set(expected).size===expected.length&&new Set(actual).size===actual.length&&actual.length===expected.length&&expected.every(code=>actual.includes(code));
    if(!coverage)return {status:'unverified',valid:false,reason:'KQXS_COVERAGE_INCOMPLETE'};
    if(!stations.every(station=>stationPrizeComplete(region,station)))return {status:'unverified',valid:false,reason:'KQXS_PRIZE_DATA_INCOMPLETE'};
    if(!(result.verified===true||status==='verified'))return {status:'unverified',valid:false,reason:'KQXS_NOT_VERIFIED'};
    return {status:'verified',valid:true,reason:null};
  }
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
  function kqxsVerificationGate(observationSummary, results) {
    const scopes = observationSummary && Array.isArray(observationSummary.scopes) ? observationSummary.scopes : [];
    const resultMap=new Map((Array.isArray(results)?results:[]).map(row=>[`${String(row&&row.business_date||'').slice(0,10)}:${String(row&&row.region||'').toLowerCase()}`,row]));
    let verified = 0, conflict = 0, unverified = 0;
    const bad_scopes = [];
    for (const scope of scopes) {
      const status = String(scope && scope.result_verification_status || 'unverified').toLowerCase();
      const evidenceValid = scope && scope.result_verification_evidence_valid === true;
      const current=resultMap.get(`${String(scope&&scope.business_date||'').slice(0,10)}:${String(scope&&scope.region||'').toLowerCase()}`)||null;
      const currentEvidence=canonicalResultEvidence(scope,current);
      const settlementFingerprint=String(scope&&scope.result_fingerprint||'');
      const currentFingerprint=String(current&&current.fingerprint||'');
      const fingerprintMatch=Boolean(settlementFingerprint&&currentFingerprint&&settlementFingerprint===currentFingerprint);
      if (status === 'verified' && evidenceValid && currentEvidence.valid === true && fingerprintMatch) verified += 1;
      else {
        const isConflict=status==='conflict'||currentEvidence.status==='conflict';
        if (isConflict) conflict += 1; else unverified += 1;
        let reason=String(scope && scope.result_verification_reason || '');
        if(!reason&&status==='verified'&&!evidenceValid)reason='KQXS_STRICT_EVIDENCE_MISSING';
        if(!reason&&!currentEvidence.valid)reason=currentEvidence.reason;
        if(!reason&&!fingerprintMatch)reason='KQXS_SETTLEMENT_RESULT_DRIFT';
        if(!reason)reason='KQXS_NOT_VERIFIED';
        bad_scopes.push({
          partner_id:String(scope && scope.partner_id || ''),
          business_date:String(scope && scope.business_date || ''),
          region:String(scope && scope.region || '').toLowerCase(),
          verification_status:status,
          evidence_valid:evidenceValid,
          canonical_result_status:currentEvidence.status,
          fingerprint_match:fingerprintMatch,
          reason
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
  // Confirming HIOSKT once does not grant authority to silently delete
  // or rewrite the linked golden case. Every PROMOTED candidate must still
  // have exactly one matching, pinned regression case at qualification time.
  function candidateSummary(rows, goldenCases) {
    const list=Array.isArray(rows)?rows:[];
    const golden=Array.isArray(goldenCases)?goldenCases:[];
    const counts={pending:0,promoted:0,dismissed:0,invalid:0,
      promoted_linked:0,promoted_missing:0,promoted_conflicting:0,
      promoted_duplicate:0};
    const byId=new Map();
    for(const item of golden) {
      const id=item&&typeof item.id==='string'?item.id:'';
      if(!id)continue;
      const all=byId.get(id)||[];
      all.push(item);
      byId.set(id,all);
    }
    for(const item of list) {
      const state=String(item&&item.state||'').toLowerCase();
      if(state==='pending')counts.pending++;
      else if(state==='dismissed')counts.dismissed++;
      else if(state==='promoted') {
        counts.promoted++;
        const caseInput=item&&item.case;
        const id=caseInput&&typeof caseInput.id==='string'?caseInput.id:'';
        const matches=id?byId.get(id)||[]:[];
        if(!matches.length)counts.promoted_missing++;
        else if(matches.length!==1)counts.promoted_duplicate++;
        else if(JSON.stringify(matches[0])!==JSON.stringify(caseInput))
          counts.promoted_conflicting++;
        else counts.promoted_linked++;
      } else counts.invalid++;
    }
    return counts;
  }
  function combineQualification(input) {
    const x = input || {}, observation = x.observation || {}, regression = x.regression || {total:0,passed:0,failed:0}, candidates = x.candidates || {pending:0,promoted:0,dismissed:0};
    const kqxs = x.kqxs || {met:false,total:0,verified:0,conflict:0,unverified:0};
    const provenance = x.parser_provenance || {met:false,total:0,known:0,unknown:0,invalid:0,parser_errors:0,missing_canonical:0};
    const parserBackend = x.parser_backend || {met:false,total:0,matched:0,mismatched:0,unreachable:true,error:'NOT_CHECKED'};
    const features = x.feature_safety || {met:true,unsafe_count:0};
    const readiness = x.repair_readiness || {summary:{total:0,ready:0,blocked:0,all_ready:false},items:[]};
    const blockers = new Set(Array.isArray(observation.blockers) ? observation.blockers : []);
    // Every golden case must PASS. A zero failure counter with missing/unrun
    // cases is not evidence that the full regression suite succeeded.
    const regressionExact = Number.isInteger(regression.total) && regression.total > 0 &&
      Number.isInteger(regression.passed) && regression.passed === regression.total &&
      Number.isInteger(regression.failed) && regression.failed === 0;
    if (!(regression.total > 0)) blockers.add('NO_PINNED_REGRESSION_CASES');
    if (regression.failed > 0) blockers.add(`REGRESSION_FAILED:${regression.failed}/${regression.total}`);
    if (regression.total > 0 && !regressionExact) blockers.add(`REGRESSION_NOT_ALL_PASSED:${Number(regression.passed||0)}/${Number(regression.total||0)}`);
    const promoted=candidates.promoted==null?0:candidates.promoted;
    const linked=candidates.promoted_linked==null?0:candidates.promoted_linked;
    const linkIssues=[candidates.promoted_missing,candidates.promoted_conflicting,
      candidates.promoted_duplicate,candidates.invalid];
    const linkedCandidateProof=Number.isInteger(promoted)&&promoted>=0&&
      Number.isInteger(linked)&&linked===promoted&&
      linkIssues.every(n=>n==null||n===0)&&
      (promoted===0||linkIssues.every(n=>Number.isInteger(n)&&n===0));
    if (!linkedCandidateProof)
      blockers.add('PROMOTED_GOLDEN_EVIDENCE_UNLINKED');
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
    // Mirror the canonical journal evidence invariants before displaying
    // READY. Green boolean flags cannot override missing/contradictory counts.
    const pos=n=>Number.isInteger(n)&&n>0;
    const zero=n=>Number.isInteger(n)&&n===0;
    const exact=(total,good)=>pos(total)&&Number.isInteger(good)&&good===total;
    const oc=observation.counts||{};
    const checks=[
      ['observation',exact(oc.total,oc.exact)&&zero(oc.missing_scopes)&&(!Array.isArray(observation.blockers)||observation.blockers.length===0)],
      ['kqxs_verification',exact(kqxs.total,kqxs.verified)&&zero(kqxs.conflict)&&zero(kqxs.unverified)],
      ['parser_provenance',exact(provenance.total,provenance.known)&&zero(provenance.unknown)&&zero(provenance.invalid)&&zero(provenance.parser_errors)&&zero(provenance.missing_canonical)],
      ['parser_backend',exact(parserBackend.total,parserBackend.matched)&&zero(parserBackend.mismatched)&&parserBackend.unreachable===false],
      ['regression_gate',regressionExact],
      ['candidate_gate',zero(candidates.pending)&&linkedCandidateProof],
      ['feature_safety',zero(features.unsafe_count)]
    ];
    for(const [name,valid] of checks){
      if(!valid) blockers.add('READY_GATE_EVIDENCE_CONTRADICTION_'+name.toUpperCase());
    }
    const ready=observation.promotion_ready===true && regressionExact &&
      candidates.pending===0 && kqxs.met===true && provenance.met===true &&
      parserBackend.met===true && features.met===true && blockers.size===0 &&
      checks.every(([,valid])=>valid);
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
      regression_gate:{ total:Number(regression.total||0), passed:Number(regression.passed||0), failed:Number(regression.failed||0), met:regressionExact },
      candidate_gate:Object.assign({}, clone(candidates), { met:candidates.pending===0&&linkedCandidateProof }),
      repair_readiness:clone(readiness),
      feature_safety:clone(features),
      blockers:[...blockers]
    };
  }
  async function runQualification(options) {
    const d = deps(), o = options || {};
    const [settlements, messages, results, regressionSummary, candidateRows] = await Promise.all([
      d.store.getAll(d.store.STORES.settlements),
      d.store.getAll(d.store.STORES.messages),
      d.store.getAll(d.store.STORES.results),
      d.regression.runPinnedCases(),
      d.candidates.listCandidates()
    ]);
    const pinnedCases = Array.isArray(regressionSummary.results)
      ? regressionSummary.results.map(row=>row&&row.case).filter(Boolean) : [];
    const cs = candidateSummary(candidateRows,pinnedCases);
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
      kqxs:kqxsVerificationGate(observationSummary,results),
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
    normalizeWindow, messageInWindow, canonicalResultEvidence, kqxsVerificationGate, parserProvenanceGate, parserBackendGate,
    unverifiedFeatureGate, candidateSummary, combineQualification, runQualification
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window !== 'undefined' ? window : globalThis);
