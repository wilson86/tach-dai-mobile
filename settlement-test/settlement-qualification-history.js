(function (global) {
  'use strict';

  const META_KEY = 'qualification_history_v1';
  const FORMAT = 'kts-qualification-evidence-v1';
  const READY = 'READY_FOR_PRODUCTION_REVIEW';
  const COMPONENTS = Object.freeze(['runtime','parser_backend','partners','messages','settlements','results','configs','regression_cases','candidates','qualification']);
  const GIT_BLOB_RE = /^[0-9a-f]{40}$/i;
  const SHA256_RE = /^[0-9a-f]{64}$/i;

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;'); }
  function validateBuildIdentity(identity) {
    if (!identity || identity.version !== 'settlement-build-identity-v1') throw new Error('QUALIFICATION_BUILD_IDENTITY_MISSING');
    if (identity.algorithm !== 'git-blob-sha1') throw new Error('QUALIFICATION_BUILD_IDENTITY_ALGORITHM_INVALID');
    const files = identity.critical_git_blobs;
    if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('QUALIFICATION_BUILD_IDENTITY_FILES_MISSING');
    const entries = Object.entries(files);
    if (entries.length < 15) throw new Error('QUALIFICATION_BUILD_IDENTITY_INCOMPLETE');
    for (const [path, hash] of entries) {
      if (!/^app\/.+\.(?:js|html)$/.test(String(path)) || !GIT_BLOB_RE.test(String(hash || ''))) throw new Error('QUALIFICATION_BUILD_IDENTITY_ENTRY_INVALID:' + String(path));
    }
    return identity;
  }
  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const qualification = global.KTS_SETTLEMENT_QUALIFICATION;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const parserProvider = global.KTS_SETTLEMENT_PARSER_PROVIDER;
    const buildIdentity = validateBuildIdentity(global.KTS_SETTLEMENT_BUILD_IDENTITY);
    if (!store || !qualification || !regression || !candidates || !parserProvider || typeof parserProvider.fetchIdentity !== 'function') throw new Error('QUALIFICATION_HISTORY_DEPENDENCY_MISSING');
    return { store, qualification, regression, candidates, parserProvider, buildIdentity };
  }
  function stable(value) {
    const store = global.KTS_SETTLEMENT_STORE;
    if (store && typeof store.stableStringify === 'function') return store.stableStringify(value);
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  async function sha256Hex(value) {
    if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) throw new Error('QUALIFICATION_SHA256_UNAVAILABLE');
    const bytes = new global.TextEncoder().encode(typeof value === 'string' ? value : stable(value));
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,'0')).join('');
  }
  // Role and active status affect settlement calculation and reporting. A
  // scoped partner change must invalidate any previous READY fingerprint.
  function semanticPartner(p) {
    return {id:p.id,name:p.name,role:p.role,active:p.active!==false};
  }
  function semanticMessage(m) {
    return { id:m.id, partner_id:m.partner_id, business_date:m.business_date, region:m.region, status:m.status, raw_text:m.raw_text, canonical_payload:clone(m.canonical_payload||null), canonical_version:m.canonical_version||null, parser_error:m.parser_error||null, config_snapshot:clone(m.config_snapshot||null) };
  }
  function semanticSettlement(s) {
    return { id:s.id, partner_id:s.partner_id, business_date:s.business_date, region:s.region, message_ids:clone(s.message_ids||[]), engine_version:s.engine_version||null, config_snapshot:clone(s.config_snapshot||null), lottery_result_snapshot:clone(s.lottery_result_snapshot||null), settlement_result:clone(s.settlement_result||null), category_rows:clone(s.category_rows||[]), detail_rows:clone(s.detail_rows||[]), message_breakdown:clone(s.message_breakdown||[]), scope_status:s.scope_status||null, blocked_reasons:clone(s.blocked_reasons||[]), reference_app_snapshot:clone(s.reference_app_snapshot||null), comparison_status:s.comparison_status||null };
  }
  function semanticResult(r) {
    return { id:r.id, business_date:r.business_date, region:r.region, source:r.source, status:r.status, complete:r.complete, coverage_complete:r.coverage_complete, verified:r.verified, verification_status:r.verification_status, verification_sources:clone(r.verification_sources||[]), verification_reason:r.verification_reason||null, verification_conflicts:clone(r.verification_conflicts||[]), expected_station_codes:clone(r.expected_station_codes||[]), stations:clone(r.stations||[]), fingerprint:r.fingerprint||null, provider_revision:r.provider_revision||null };
  }
  function semanticConfig(c) {
    return { id:c.id, partner_id:c.partner_id, version:c.version, effective_from_date:c.effective_from_date, region_pricing:clone(c.region_pricing||{}), region_terms:clone(c.region_terms||{}), dat_hit_mode:c.dat_hit_mode, dax_hit_mode:c.dax_hit_mode, mb_xien_234:Boolean(c.mb_xien_234), tinh_ui:Boolean(c.tinh_ui), total_percent:String(c.total_percent==null?'100':c.total_percent), refund_percent:String(c.refund_percent==null?'0':c.refund_percent), commission_type:c.commission_type };
  }
  function semanticParserBackendIdentity(value) {
    const input = value && value.identities ? value : null;
    if (!input || String(input.identity_contract || '') !== 'kts-parser-identity-v1') return null;
    const normalize = x => {
      if (!x || !SHA256_RE.test(String(x.identity_sha256 || ''))) return null;
      return {
        parser_version:String(x.parser_version || ''),
        identity_sha256:String(x.identity_sha256).toLowerCase(),
        parser_source_sha256:x.parser_source_sha256==null?null:String(x.parser_source_sha256).toLowerCase(),
        grammar_sha256:x.grammar_sha256==null?null:String(x.grammar_sha256).toLowerCase(),
        business_engine_sha256:x.business_engine_sha256==null?null:String(x.business_engine_sha256).toLowerCase()
      };
    };
    const mb=normalize(input.identities.mb), mnMt=normalize(input.identities.mn_mt);
    if (!mb || !mnMt) return null;
    return { api_version:String(input.api_version || ''), identity_contract:'kts-parser-identity-v1', identities:{mb,mn_mt:mnMt} };
  }
  function parserBackendFromQualification(q) {
    const gate=q&&q.parser_backend;
    const identity=semanticParserBackendIdentity(gate&&gate.live_identity);
    if (gate&&gate.met===true&&identity) return {status:'available',identity};
    return {status:'unavailable',error:String(gate&&gate.error||'PARSER_BACKEND_NOT_VERIFIED')};
  }
  async function currentParserBackendMaterial(parserProvider) {
    try {
      const live=await parserProvider.fetchIdentity();
      const identity=semanticParserBackendIdentity(live);
      if (!identity) return {status:'unavailable',error:'PARSER_BACKEND_IDENTITY_INVALID'};
      return {status:'available',identity};
    } catch (error) {
      return {status:'unavailable',error:String(error&&error.message||error||'PARSER_BACKEND_IDENTITY_UNAVAILABLE')};
    }
  }
  function qualificationCore(q) {
    const copy = clone(q || {});
    delete copy.generated_at;
    if (copy.repair_readiness) delete copy.repair_readiness.generated_at;
    return copy;
  }
  function runtimeSignature() {
    const buildIdentity = validateBuildIdentity(global.KTS_SETTLEMENT_BUILD_IDENTITY);
    const names = [
      ['engine','KTS_SETTLEMENT_ENGINE'], ['mb_rules','KTS_SETTLEMENT_MB_RULES'], ['category_map','KTS_SETTLEMENT_CATEGORY_MAP'],
      ['runtime','KTS_SETTLEMENT_RUNTIME'], ['evaluator','KTS_SETTLEMENT_EVALUATOR'], ['parser_provider','KTS_SETTLEMENT_PARSER_PROVIDER'],
      ['shadow','KTS_SETTLEMENT_SHADOW'], ['observation','KTS_SETTLEMENT_OBSERVATION'], ['regression_cases','KTS_SETTLEMENT_REGRESSION_CASES'],
      ['repair_readiness','KTS_SETTLEMENT_REPAIR_READINESS'], ['qualification','KTS_SETTLEMENT_QUALIFICATION'], ['result_service','KTS_RESULT_SERVICE']
    ];
    const modules = {};
    for (const [key, globalName] of names) {
      const api = global[globalName];
      modules[key] = api && api.version ? String(api.version) : null;
    }
    return { build_identity:clone(buildIdentity), modules };
  }
  function sortById(rows) { return rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''))); }
  function scopeKey(x) { return [String(x&&x.partner_id||''),String(x&&x.business_date||''),String(x&&x.region||'').toLowerCase()].join(':'); }
  function relevantConfigs(configs, activeMessages, options) {
    const partners = new Set(activeMessages.map(x=>String(x.partner_id||'')).filter(Boolean));
    const from = String(options&&options.from_date||''), to = String(options&&options.to_date||'');
    const out = [];
    for (const partner of partners) {
      const rows = configs.filter(c=>String(c.partner_id||'')===partner).sort((a,b)=>String(a.effective_from_date||'').localeCompare(String(b.effective_from_date||''))||Number(a.version||0)-Number(b.version||0));
      let baseline = null;
      for (const row of rows) {
        const d = String(row.effective_from_date||'');
        if ((!from || d < from) && (!to || d <= to)) baseline = row;
        if ((!from || d >= from) && (!to || d <= to)) out.push(row);
      }
      if (baseline) out.push(baseline);
    }
    return sortById(out.filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i));
  }
  async function collectMaterial(qualificationSnapshot, options, materialOptions) {
    const d = deps();
    const [messagesAll, settlementsAll, resultsAll, configsAll, partnersAll, pinned, candidateRows] = await Promise.all([
      d.store.getAll(d.store.STORES.messages), d.store.getAll(d.store.STORES.settlements),
      d.store.getAll(d.store.STORES.results), d.store.getAll(d.store.STORES.configs),
      d.store.getAll(d.store.STORES.partners), d.regression.listPinnedCases(), d.candidates.listCandidates()
    ]);
    const activeMessages = messagesAll.filter(m=>d.qualification.messageInWindow(m,options)).map(semanticMessage);
    const scopeSet = new Set((qualificationSnapshot&&qualificationSnapshot.observation&&qualificationSnapshot.observation.scopes||[]).map(scopeKey));
    const settlements = settlementsAll.filter(s=>scopeSet.has(scopeKey(s))).map(semanticSettlement);
    const dateRegions = new Set(activeMessages.map(m=>`${m.business_date}:${String(m.region||'').toLowerCase()}`));
    const results = resultsAll.filter(r=>dateRegions.has(`${r.business_date}:${String(r.region||'').toLowerCase()}`)).map(semanticResult);
    const configs = relevantConfigs(configsAll,activeMessages,options).map(semanticConfig);
    const partnerIds = new Set([...activeMessages,...settlements].map(x=>String(x.partner_id||'')).filter(Boolean));
    const partners = partnersAll.filter(p=>partnerIds.has(String(p.id||''))).map(semanticPartner);
    const parserBackend = materialOptions&&materialOptions.probe_parser_backend
      ? await currentParserBackendMaterial(d.parserProvider)
      : parserBackendFromQualification(qualificationSnapshot);
    return {
      runtime:runtimeSignature(), parser_backend:parserBackend,
      partners:sortById(partners), messages:sortById(activeMessages), settlements:sortById(settlements), results:sortById(results), configs:sortById(configs),
      regression_cases:sortById((pinned||[]).map(clone)), candidates:sortById((candidateRows||[]).map(c=>({ id:c.id, source_event_id:c.source_event_id, state:c.state, confirmation_note:c.confirmation_note||'', dismiss_reason:c.dismiss_reason||'', case:clone(c.case) }))),
      qualification:qualificationCore(qualificationSnapshot)
    };
  }
  async function componentFingerprints(material) {
    const out = {};
    for (const name of COMPONENTS) out[name] = await sha256Hex(material[name]);
    return out;
  }
  // Persist the full qualification window: partner and region filters also
  // contribute to the original SHA-256 input fingerprint. Older events without
  // these optional fields safely decode as unscoped; scoped older events stay
  // STALE rather than being declared CURRENT under a different filter.
  function qualificationOptionsFromEvent(e) {
    return {from_date:String(e&&e.from_date||''),to_date:String(e&&e.to_date||''),
      required_observation_days:String(e&&e.required_observation_days||''),
      partner_id:String(e&&e.partner_id||''),
      regions:Array.isArray(e&&e.regions)?e.regions.slice():[]};
  }
  async function overallFingerprint(options, components) {
    return sha256Hex({ format:'kts-qualification-input-v2-live-parser', options:{ from_date:String(options&&options.from_date||''), to_date:String(options&&options.to_date||''), required_observation_days:String(options&&options.required_observation_days||''), partner_id:String(options&&options.partner_id||''), regions:Array.isArray(options&&options.regions)?options.regions.slice().sort():[] }, components });
  }
  function changedComponents(previous, current) {
    if (!previous) return COMPONENTS.slice();
    return COMPONENTS.filter(name=>String(previous[name]||'')!==String(current[name]||''));
  }
  function classifyReadyValidity(lastReady, components, fingerprint, parserBackend) {
    if (!lastReady) return {status:'NO_READY_EVIDENCE',current:false,changed_components:[]};
    const changed=changedComponents(lastReady.component_fingerprints,components);
    if (!parserBackend || parserBackend.status!=='available') {
      if (!changed.includes('parser_backend')) changed.unshift('parser_backend');
      return {status:'READY_EVIDENCE_UNVERIFIABLE',current:false,changed_components:changed,parser_backend_error:String(parserBackend&&parserBackend.error||'PARSER_BACKEND_IDENTITY_UNAVAILABLE')};
    }
    const current=String(fingerprint)===String(lastReady.input_fingerprint_sha256||'');
    return {status:current?'READY_EVIDENCE_CURRENT':'READY_EVIDENCE_STALE',current,changed_components:changed,parser_backend_error:null};
  }
  // The local IndexedDB journal is not a trusted input. Broken ancestry,
  // missing/malformed records or authority escalation must never resurrect
  // an earlier READY merely because its component fingerprint still matches.
  // READY must agree with the dashboard's decision; a forged TRUE flag must
  // not override BLOCKED status, unexplained blockers or authority safety.
  function validateSnapshotDecision(q) {
    if(!q||typeof q!=='object'||Array.isArray(q))return {valid:false,reason:'SNAPSHOT_NOT_OBJECT'};
    if(typeof q.ready_for_production_review!=='boolean')return {valid:false,reason:'SNAPSHOT_READY_NOT_BOOLEAN'};
    if(q.production_enabled===true||q.merge_authorized===true)return {valid:false,reason:'SNAPSHOT_AUTHORITY_ESCALATION'};
    if(q.ready_for_production_review){
      if(q.qualification_state!==READY)return {valid:false,reason:'READY_STATE_CONTRADICTION'};
      if(!Array.isArray(q.blockers)||q.blockers.length!==0)return {valid:false,reason:'READY_HAS_BLOCKERS'};
      // The canonical dashboard computes READY from independent gates.
      // A missing gate is invalid for canonical snapshots; optional synthetic
      // legacy fixtures remain supported, but any provided failing gate blocks.
      const canonical=q.format==='kts-final-qualification-v2-live-parser';
      for(const [name,field] of [
        ['observation','promotion_ready'],['kqxs_verification','met'],
        ['parser_provenance','met'],['parser_backend','met'],
        ['regression_gate','met'],['candidate_gate','met'],
        ['feature_safety','met']
      ]){
        const gate=q[name];
        if((canonical||gate!=null)&&(!gate||gate[field]!==true))
          return {valid:false,reason:'READY_GATE_NOT_MET_'+name.toUpperCase()};
      }
      // Even a gate claiming "met:true" may contradict its own concrete
      // counters in mutable IndexedDB. Canonical READY requires the same
      // numeric invariants that make the dashboard gates true.
      if(canonical){
        const o=q.observation||{}, oc=o.counts||{};
        const kv=q.kqxs_verification||{}, pp=q.parser_provenance||{};
        const pb=q.parser_backend||{}, rg=q.regression_gate||{};
        const cg=q.candidate_gate||{}, fs=q.feature_safety||{};
        const pos=n=>Number.isInteger(n)&&n>0;
        const zero=n=>Number.isInteger(n)&&n===0;
        const exact=(total,good)=>pos(total)&&Number.isInteger(good)&&good===total;
        for(const [name,valid] of [
          ['observation',exact(oc.total,oc.exact)&&zero(oc.missing_scopes)&&(!Array.isArray(o.blockers)||o.blockers.length===0)],
          ['kqxs_verification',exact(kv.total,kv.verified)&&zero(kv.conflict)&&zero(kv.unverified)],
          ['parser_provenance',exact(pp.total,pp.known)&&zero(pp.unknown)&&zero(pp.invalid)&&zero(pp.parser_errors)&&zero(pp.missing_canonical)],
          ['parser_backend',exact(pb.total,pb.matched)&&zero(pb.mismatched)&&pb.unreachable===false],
          ['regression_gate',exact(rg.total,rg.passed)&&zero(rg.failed)],
          ['candidate_gate',(()=>{
            const promoted=cg.promoted==null?0:cg.promoted;
            const linked=cg.promoted_linked==null?0:cg.promoted_linked;
            const details=[cg.promoted_missing,cg.promoted_conflicting,
              cg.promoted_duplicate,cg.invalid];
            return zero(cg.pending)&&Number.isInteger(promoted)&&promoted>=0&&
              Number.isInteger(linked)&&linked===promoted&&
              details.every(n=>n==null||zero(n))&&
              (promoted===0||details.every(zero));
          })()],
          ['feature_safety',zero(fs.unsafe_count)]
        ]){
          if(!valid)return {valid:false,reason:'READY_GATE_EVIDENCE_CONTRADICTION_'+name.toUpperCase()};
        }
      }
    }else if(q.qualification_state===READY){
      return {valid:false,reason:'BLOCKED_STATE_CONTRADICTION'};
    }
    return {valid:true,reason:null};
  }
  function validateHistoryEvents(events) {
    if (!Array.isArray(events)) return {valid:false,reason:'EVENTS_NOT_ARRAY'};
    const ids=new Set();
    let prior=null,priorReady=null;
    for(let i=0;i<events.length;i++){
      const e=events[i];
      const fail=reason=>({valid:false,reason,index:i});
      if(!e||typeof e!=='object'||Array.isArray(e))return fail('MALFORMED_EVENT');
      if(e.format!==FORMAT)return fail('INVALID_FORMAT');
      if(typeof e.id!=='string'||!e.id||ids.has(e.id))return fail('INVALID_OR_DUPLICATE_ID');
      if(e.previous_event_id!==(prior?prior.id:null))return fail('BROKEN_EVENT_LINK');
      if(e.previous_ready_event_id!==(priorReady?priorReady.id:null))return fail('BROKEN_READY_LINK');
      if(typeof e.ready_for_production_review!=='boolean')return fail('INVALID_READY_FLAG');
      if(e.production_enabled!==false||e.merge_authorized!==false)return fail('AUTHORITY_ESCALATION');
      if(typeof e.input_fingerprint_sha256!=='string'||!e.input_fingerprint_sha256)return fail('MISSING_FINGERPRINT');
      if(!e.component_fingerprints||typeof e.component_fingerprints!=='object'||Array.isArray(e.component_fingerprints))return fail('MISSING_COMPONENTS');
      if(!e.qualification_snapshot||typeof e.qualification_snapshot!=='object'||Array.isArray(e.qualification_snapshot))return fail('MISSING_QUALIFICATION_SNAPSHOT');
      if(Boolean(e.qualification_snapshot.ready_for_production_review===true)!==e.ready_for_production_review)return fail('SNAPSHOT_READY_MISMATCH');
      const decision=validateSnapshotDecision(e.qualification_snapshot);
      if(!decision.valid)return fail(decision.reason);
      if(e.qualification_state!==e.qualification_snapshot.qualification_state)return fail('EVENT_SNAPSHOT_STATE_MISMATCH');
      if(stable(e.blockers)!==stable(e.qualification_snapshot.blockers||[]))return fail('EVENT_SNAPSHOT_BLOCKERS_MISMATCH');
      if(e.partner_id!=null&&typeof e.partner_id!=='string')return fail('EVENT_PARTNER_FILTER_INVALID');
      if(e.regions!=null&&(!Array.isArray(e.regions)||!e.regions.every(x=>typeof x==='string')))return fail('EVENT_REGIONS_FILTER_INVALID');
      // Only canonical events have a contractual SHA-256 component manifest.
      // Earlier synthetic/legacy evidence is handled independently above.
      // A missing component is corruption, never an unchanged zero hash.
      if(e.qualification_snapshot.format==='kts-final-qualification-v2-live-parser'){
        if(!SHA256_RE.test(e.input_fingerprint_sha256))return fail('CANONICAL_INPUT_SHA256_INVALID');
        for(const name of COMPONENTS){
          if(!SHA256_RE.test(e.component_fingerprints[name]))
            return fail('CANONICAL_COMPONENT_SHA256_INVALID:'+name);
        }
      }
      ids.add(e.id);
      prior=e;
      if(e.ready_for_production_review)priorReady=e;
    }
    return {valid:true,reason:null,index:-1};
  }
  function invalidHistoryVerdict(integrity) {
    return {status:'READY_EVIDENCE_UNVERIFIABLE',current:false,
      changed_components:['qualification_history'],parser_backend_error:null,
      history_error:'QUALIFICATION_HISTORY_INVALID_'+integrity.reason,
      history_error_index:integrity.index};
  }
  // Evidence is a state-machine timeline, not merely a matching content hash.
  // Any later BLOCKED qualification supersedes the preceding READY, even when
  // the source bytes subsequently revert to their original fingerprint.
  function classifyHistoryValidity(events, components, fingerprint, parserBackend) {
    const integrity=validateHistoryEvents(events);
    if(!integrity.valid)return invalidHistoryVerdict(integrity);
    const rows=events;
    let lastReadyIndex=-1;
    for(let i=rows.length-1;i>=0;i--){
      if(rows[i]&&rows[i].ready_for_production_review===true){lastReadyIndex=i;break;}
    }
    if(lastReadyIndex<0)return classifyReadyValidity(null,components,fingerprint,parserBackend);
    const verdict=classifyReadyValidity(rows[lastReadyIndex],components,fingerprint,parserBackend);
    const laterBlocked=rows.slice(lastReadyIndex+1).reverse()
      .find(event=>event&&event.ready_for_production_review===false);
    if(!laterBlocked)return verdict;
    return Object.assign({},verdict,{
      status:verdict.status==='READY_EVIDENCE_UNVERIFIABLE'
        ? verdict.status : 'READY_EVIDENCE_STALE',
      current:false,
      changed_components:[...new Set([...(verdict.changed_components||[]),'qualification_history'])],
      invalidated_by_blocked_qualification:true,
      invalidated_by_event_id:laterBlocked.id||null
    });
  }
  // A missing journal is a valid empty history, but a present malformed
  // metadata row is corruption. Never convert it into "no READY evidence".
  function validateJournalRow(row) {
    if(!row||typeof row!=='object'||Array.isArray(row)) return {valid:false,reason:'ROW_NOT_OBJECT'};
    if(row.key!==META_KEY) return {valid:false,reason:'ROW_KEY_MISMATCH'};
    if(row.version!==1) return {valid:false,reason:'ROW_VERSION_MISMATCH'};
    if(!Array.isArray(row.events)) return {valid:false,reason:'ROW_EVENTS_NOT_ARRAY'};
    return {valid:true,reason:null};
  }
  async function readRow() {
    const {store}=deps();
    const row=await store.get(store.STORES.metadata,META_KEY);
    return row==null?{key:META_KEY,version:1,events:[]}:row;
  }
  function txDone(tx) { return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('QUALIFICATION_HISTORY_TX_FAILED'));tx.onabort=()=>reject(tx.error||new Error('QUALIFICATION_HISTORY_TX_ABORTED'));}); }
  // Keep the history read + evidence append + write in one IndexedDB
  // readwrite transaction. Separate readRow()/writeRow() transactions lose
  // events if two tabs qualify concurrently with the same original history.
  async function appendQualificationEvent(qualificationSnapshot, options, components, fingerprint) {
    const {store}=deps();
    const db=await store.openDb();
    let saved=null, prepareError=null;
    try {
      const tx=db.transaction(store.STORES.metadata,'readwrite');
      const objectStore=tx.objectStore(store.STORES.metadata);
      const request=objectStore.get(META_KEY);
      request.onsuccess=()=>{
        try {
          const existing=request.result;
          // A damaged journal must not be silently reset or extended.
          // Validation happens inside the same IndexedDB readwrite transaction
          // used for the append, so concurrent writers cannot bypass it.
          if(existing!=null){
            const rowIntegrity=validateJournalRow(existing);
            if(!rowIntegrity.valid)throw new Error('QUALIFICATION_HISTORY_APPEND_REJECTED_'+rowIntegrity.reason);
            const integrity=validateHistoryEvents(existing.events);
            if(!integrity.valid)throw new Error('QUALIFICATION_HISTORY_APPEND_REJECTED_CORRUPT_JOURNAL:'+integrity.reason);
          }
          const row=existing?clone(existing):{key:META_KEY,version:1,events:[]};
          const event=buildEvidenceEvent(qualificationSnapshot,options,components,fingerprint,row.events);
          row.events.push(event);
          row.updated_at=event.observed_at;
          objectStore.put(row);
          saved=event;
        } catch (error) {
          prepareError=error;
          try { tx.abort(); } catch (_) { /* already aborted */ }
        }
      };
      try {
        await txDone(tx);
      } catch(error) {
        // IDB abort errors are generic. Surface the deterministic, validated
        // journal-corruption reason instead of losing it behind AbortError.
        throw prepareError||error;
      }
      if (!saved) throw prepareError||new Error('QUALIFICATION_HISTORY_APPEND_FAILED');
      return clone(saved);
    } finally { db.close(); }
  }
  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID==='function') return 'qualification_event_'+global.crypto.randomUUID();
    return 'qualification_event_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  }
  function buildEvidenceEvent(qualificationSnapshot, options, components, fingerprint, history) {
    const list=Array.isArray(history)?history:[];
    const previous=list.length?list[list.length-1]:null;
    const lastReady=[...list].reverse().find(x=>x&&x.ready_for_production_review===true)||null;
    const changesPrev=changedComponents(previous&&previous.component_fingerprints,components);
    const changesReady=changedComponents(lastReady&&lastReady.component_fingerprints,components);
    const ready=Boolean(qualificationSnapshot&&qualificationSnapshot.ready_for_production_review===true);
    const changedFromReady=Boolean(lastReady&&String(lastReady.input_fingerprint_sha256)!==String(fingerprint));
    return {
      format:FORMAT, id:makeId(), observed_at:new Date().toISOString(),
      from_date:String(options&&options.from_date||''), to_date:String(options&&options.to_date||''), required_observation_days:String(options&&options.required_observation_days||''),
      partner_id:String(options&&options.partner_id||''), regions:Array.isArray(options&&options.regions)?options.regions.slice():[],
      qualification_state:String(qualificationSnapshot&&qualificationSnapshot.qualification_state||'BLOCKED_SHADOW_QUALIFICATION'), ready_for_production_review:ready,
      input_fingerprint_sha256:fingerprint, component_fingerprints:clone(components),
      previous_event_id:previous&&previous.id||null, previous_ready_event_id:lastReady&&lastReady.id||null,
      changed_components_from_previous:changesPrev, changed_components_from_last_ready:changesReady,
      invalidates_previous_ready:Boolean(lastReady&&changedFromReady&&!ready),
      requalifies_after_change:Boolean(lastReady&&changedFromReady&&ready),
      production_enabled:false, merge_authorized:false,
      blockers:clone(qualificationSnapshot&&qualificationSnapshot.blockers||[]), qualification_snapshot:clone(qualificationSnapshot)
    };
  }
  async function recordQualification(qualificationSnapshot, options) {
    if (!qualificationSnapshot || typeof qualificationSnapshot!=='object') throw new Error('QUALIFICATION_SNAPSHOT_REQUIRED');
    const decision=validateSnapshotDecision(qualificationSnapshot);
    if(!decision.valid)throw new Error('QUALIFICATION_DECISION_INVALID_'+decision.reason);
    const material=await collectMaterial(qualificationSnapshot,options||{},{probe_parser_backend:false});
    if (qualificationSnapshot.ready_for_production_review===true && material.parser_backend.status!=='available') throw new Error('QUALIFICATION_READY_WITHOUT_PARSER_BACKEND_EVIDENCE');
    const components=await componentFingerprints(material);
    const fingerprint=await overallFingerprint(options||{},components);
    return appendQualificationEvent(qualificationSnapshot,options||{},components,fingerprint);
  }
  async function listEvents() {
    const row=await readRow();
    const integrity=validateJournalRow(row);
    if(!integrity.valid)throw new Error('QUALIFICATION_HISTORY_INVALID_'+integrity.reason);
    // Persisted array order is the authoritative append order; timestamp and
    // random ID sorting can reorder events created in the same millisecond.
    return row.events.map(clone);
  }
  async function checkLastReadyValidity() {
    let events;
    try {
      events=await listEvents();
    } catch(error) {
      const message=String(error&&error.message||error);
      if(!message.startsWith('QUALIFICATION_HISTORY_INVALID_ROW_'))throw error;
      return Object.assign({},invalidHistoryVerdict({reason:message.slice('QUALIFICATION_HISTORY_INVALID_'.length),index:-1}),{ready_event:null});
    }
    const integrity=validateHistoryEvents(events);
    if(!integrity.valid)return Object.assign({},invalidHistoryVerdict(integrity),{ready_event:null});
    const lastReady=[...events].reverse().find(x=>x.ready_for_production_review===true);
    if (!lastReady) return { status:'NO_READY_EVIDENCE', current:false, changed_components:[], ready_event:null };
    const options=qualificationOptionsFromEvent(lastReady);
    const material=await collectMaterial(lastReady.qualification_snapshot,options,{probe_parser_backend:true});
    const components=await componentFingerprints(material);
    const fingerprint=await overallFingerprint(options,components);
    const verdict=classifyHistoryValidity(events,components,fingerprint,material.parser_backend);
    return Object.assign({},verdict,{ready_event:clone(lastReady),current_fingerprint_sha256:fingerprint,current_parser_backend:clone(material.parser_backend)});
  }

  function installUi() {
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');
    if(!pane||doc.getElementById('qualificationHistoryPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='qualificationHistoryPanel';
    card.innerHTML=`<div class="section-title">Lịch sử qualification · bằng chứng cục bộ</div><div class="hint">Mỗi lần chạy gate cuối được append thành một mốc riêng với SHA-256 theo component. Runtime fingerprint gắn với manifest Git blob của các file settlement/KQXS trọng yếu và identity parser backend đang online. Lịch sử chỉ được nối thêm bởi ứng dụng, nhưng IndexedDB trên thiết bị vẫn có thể bị sửa hoặc xóa; đây không phải bằng chứng bất biến có chữ ký bên ngoài. READY cũ mất hiệu lực khi dữ liệu, parser hoặc qualification mới không còn hợp lệ.</div><div class="row" style="margin-top:8px"><button id="qualificationHistoryRefresh" class="btn soft">Nạp lịch sử</button><button id="qualificationHistoryCheck" class="btn soft">Kiểm hiệu lực READY gần nhất</button></div><div id="qualificationHistoryStatus" class="status"></div><div id="qualificationHistoryOutput" class="hint"></div>`;
    const anchor=doc.getElementById('finalQualificationPanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    function status(text,kind){const el=doc.getElementById('qualificationHistoryStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    async function render(){const events=await listEvents(),host=doc.getElementById('qualificationHistoryOutput');if(!events.length){host.innerHTML='<div class="hint">Chưa có mốc qualification nào được lưu.</div>';return events;}const integrity=validateHistoryEvents(events);if(!integrity.valid){host.textContent='Lịch sử lưu trên thiết bị không hợp lệ. Không tin cậy sự kiện READY.';status('LỊCH SỬ KHÔNG THỂ XÁC MINH: '+integrity.reason,'err');return events;}const rows=[...events].reverse().slice(0,20);host.innerHTML=rows.map(e=>`<div class="report-message"><div><span class="tag ${e.ready_for_production_review?'ok':'warn'}">${esc(e.qualification_state)}</span> <b>${esc(e.observed_at)}</b></div><div class="hint">${esc(e.from_date||'—')} → ${esc(e.to_date||'—')} · SHA ${esc(String(e.input_fingerprint_sha256||'').slice(0,16))}…</div><div class="hint">đổi từ lần trước: ${esc((e.changed_components_from_previous||[]).join(', ')||'không')} ${e.invalidates_previous_ready?'· READY cũ MẤT HIỆU LỰC':''}${e.requalifies_after_change?'· đã RE-QUALIFY':''}</div></div>`).join('');status(`${events.length} mốc qualification được giữ append-only trên thiết bị.`,'ok');return events;}
    doc.getElementById('qualificationHistoryRefresh').addEventListener('click',()=>render().catch(e=>status(String(e&&e.message||e),'err')));
    doc.getElementById('qualificationHistoryCheck').addEventListener('click',async()=>{try{status('Đang kiểm dữ liệu, critical code và parser backend hiện tại so với READY gần nhất…','warn');const v=await checkLastReadyValidity();if(v.status==='NO_READY_EVIDENCE')status('Chưa có READY evidence để kiểm.','warn');else if(v.status==='READY_EVIDENCE_UNVERIFIABLE')status(`READY KHÔNG THỂ XÁC MINH · ${v.history_error||v.parser_backend_error||'Chưa đủ bằng chứng'}. Không được dùng READY cũ.`, 'err');else if(v.current)status('READY gần nhất vẫn CURRENT: dữ liệu + critical code + parser backend identity chưa đổi.','ok');else status(`READY gần nhất đã STALE · thay đổi: ${v.changed_components.join(', ')||'unknown'}. Phải chạy qualification lại.`, 'err');}catch(e){status(String(e&&e.message||e),'err');}});
    if(typeof global.addEventListener==='function')global.addEventListener('kts:qualification-evidence-saved',()=>render().catch(()=>{}));
    render().catch(()=>{});
  }

  global.KTS_SETTLEMENT_QUALIFICATION_HISTORY=Object.freeze({
    version:'settlement-qualification-history-v3-live-parser-validity',META_KEY,FORMAT,COMPONENTS,
    validateBuildIdentity,sha256Hex,semanticPartner,semanticMessage,semanticSettlement,semanticResult,semanticConfig,semanticParserBackendIdentity,
    parserBackendFromQualification,currentParserBackendMaterial,qualificationCore,runtimeSignature,relevantConfigs,
    collectMaterial,componentFingerprints,qualificationOptionsFromEvent,overallFingerprint,changedComponents,classifyReadyValidity,validateSnapshotDecision,validateJournalRow,validateHistoryEvents,classifyHistoryValidity,buildEvidenceEvent,recordQualification,listEvents,checkLastReadyValidity
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);