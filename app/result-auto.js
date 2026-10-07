(function (global) {
  'use strict';

  const VIEW_MODE_KEY = 'kts_kqxs_view_mode_v1';
  const PENDING_SCOPES_KEY = 'kts_settlement_pending_result_scopes_v1';

  function validScope(scope) {
    return Boolean(scope && /^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date || '')) && ['mn','mt','mb'].includes(String(scope.region || '').toLowerCase()));
  }
  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function scopeKey(scope) { return `${scope.business_date}:${String(scope.region).toLowerCase()}`; }
  function readPendingScopes() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(PENDING_SCOPES_KEY);
      const rows = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) return [];
      const seen = new Set();
      return rows.map(x => ({ business_date:String(x && x.business_date || ''), region:String(x && x.region || '').toLowerCase() }))
        .filter(validScope).filter(x => { const key=scopeKey(x); if(seen.has(key)) return false; seen.add(key); return true; });
    } catch (_) { return []; }
  }
  function writePendingScopes(scopes) {
    const rows = (Array.isArray(scopes) ? scopes : []).filter(validScope);
    try { if (global.localStorage) global.localStorage.setItem(PENDING_SCOPES_KEY, JSON.stringify(rows)); } catch (_) {}
    return rows;
  }
  function rememberPendingScope(scope) {
    if (!validScope(scope)) return readPendingScopes();
    const rows = readPendingScopes();
    if (!rows.some(x => scopeKey(x) === scopeKey(scope))) rows.push({ business_date:String(scope.business_date), region:String(scope.region).toLowerCase() });
    return writePendingScopes(rows);
  }
  function forgetPendingScope(scope) {
    if (!validScope(scope)) return readPendingScopes();
    return writePendingScopes(readPendingScopes().filter(x => scopeKey(x) !== scopeKey(scope)));
  }
  function sameScope(a, b) {
    return Boolean(a && b && String(a.business_date) === String(b.business_date) && String(a.region).toLowerCase() === String(b.region).toLowerCase());
  }
  function pendingScopeNeedsResume(scope, snapshot, todayDate, wasRemembered) {
    if (!validScope(scope)) return false;
    const verified = snapshotVerified(snapshot);
    if (wasRemembered === true && String(scope.business_date) === String(todayDate || localToday())) return true;
    return !verified;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function normalizeViewMode(value) { return value === 'date' ? 'date' : 'realtime'; }
  function readViewMode() {
    try { return normalizeViewMode(global.localStorage && global.localStorage.getItem(VIEW_MODE_KEY)); }
    catch (_) { return 'realtime'; }
  }
  function writeViewMode(value) {
    const mode = normalizeViewMode(value);
    try { if (global.localStorage) global.localStorage.setItem(VIEW_MODE_KEY, mode); } catch (_) {}
    return mode;
  }
  function snapshotVerified(snapshot) {
    if (!snapshot || snapshot.complete !== true) return false;
    const claimed = snapshot.verified === true || String(snapshot.verification_status || '').toLowerCase() === 'verified';
    if (!claimed) return false;
    const sources = Array.isArray(snapshot.verification_sources)
      ? new Set(snapshot.verification_sources.map(x => String(x || '').trim()).filter(Boolean))
      : new Set();
    const conflicts = Array.isArray(snapshot.verification_conflicts) ? snapshot.verification_conflicts : [];
    const expected = Array.isArray(snapshot.expected_station_codes)
      ? snapshot.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const actual = Array.isArray(snapshot.stations)
      ? snapshot.stations.map(row => String(row && row.code || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return sources.size >= 2 && conflicts.length === 0 &&
      expected.length > 0 && new Set(expected).size === expected.length &&
      new Set(actual).size === actual.length && actual.length === expected.length &&
      expected.every(code => actual.includes(code));
  }
  function verificationConflict(snapshot) {
    return Boolean(snapshot && String(snapshot.verification_status || '').toLowerCase() === 'conflict');
  }
  function verificationDetails(snapshot) {
    const sources = Array.isArray(snapshot && snapshot.verification_sources) ? snapshot.verification_sources.map(String) : [];
    const conflicts = Array.isArray(snapshot && snapshot.verification_conflicts) ? snapshot.verification_conflicts.map(String) : [];
    return {
      sources,
      conflicts,
      reason: snapshot && snapshot.verification_reason ? String(snapshot.verification_reason) : ''
    };
  }

  function regionLabel(value) {
    const v = String(value || '').toLowerCase();
    return v === 'mn' ? 'Miền Nam' : v === 'mt' ? 'Miền Trung' : v === 'mb' ? 'Miền Bắc' : v.toUpperCase();
  }
  function sourceLabel(value) {
    const v = String(value || '').toLowerCase();
    if (v.includes('xosominhngoc')) return 'Xổ Số Minh Ngọc';
    if (v.includes('xskt')) return 'XSKT';
    return String(value || 'Nguồn dữ liệu');
  }
  function dateLabel(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || '');
  }
  function timeLabel(value) {
    const d = new Date(value || '');
    if (!Number.isFinite(d.getTime())) return '';
    try { return d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
    catch (_) { return d.toISOString().slice(11,19); }
  }
  function userResultState(snapshot) {
    if (verificationConflict(snapshot)) return { label:'CÓ LỆCH NGUỒN', kind:'err' };
    if (snapshotVerified(snapshot)) return { label:'ĐÃ ĐỐI CHIẾU 2 NGUỒN', kind:'ok' };
    if (snapshot && snapshot.complete) return { label:'ĐÃ ĐỦ KẾT QUẢ · ĐANG ĐỐI CHIẾU', kind:'warn' };
    return { label:'ĐANG CẬP NHẬT', kind:'live' };
  }

  function createManager(options) {
    const o = options || {};
    const resultService = o.resultService;
    const provider = o.provider;
    const store = o.store;
    const pipeline = o.pipeline;
    const intervalMs = Number(o.intervalMs || 90000);
    const today = typeof o.today === 'function' ? o.today : localToday;
    if (!resultService || typeof resultService.createPoller !== 'function') throw new Error('AUTO_RESULT_SERVICE_REQUIRED');
    if (!provider || typeof provider.fetchSnapshot !== 'function') throw new Error('AUTO_RESULT_PROVIDER_REQUIRED');
    if (!store || typeof store.saveResultSnapshot !== 'function') throw new Error('AUTO_RESULT_STORE_REQUIRED');
    if (!pipeline || typeof pipeline.recalculateDateRegion !== 'function') throw new Error('AUTO_RESULT_PIPELINE_REQUIRED');

    const jobs = new Map();

    function emit(name, detail) {
      if (typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
      try { global.dispatchEvent(new global.CustomEvent(name, { detail })); } catch (_) {}
    }

    async function ensureScope(input) {
      const scope = { business_date: String(input && input.business_date || ''), region: String(input && input.region || '').toLowerCase() };
      if (!validScope(scope)) throw new Error('AUTO_RESULT_SCOPE_REQUIRED');
      const key = scopeKey(scope);
      const existing = jobs.get(key);
      if (existing && existing.poller.getState().running) return existing.poller.getState();

      const confirmations = scope.business_date === today() ? 3 : 1;
      const poller = resultService.createPoller({
        fetchSnapshot: provider.fetchSnapshot,
        store,
        intervalMs,
        completeConfirmations: confirmations,
        onUpdate: (snapshot, meta) => {
          emit('kts:auto-result-update', { snapshot, meta, rows: null });
          Promise.resolve(pipeline.recalculateDateRegion({
            business_date: snapshot.business_date,
            region: snapshot.region,
            result_snapshot: snapshot
          })).then(rows => emit('kts:auto-result-recalculated', { snapshot, meta, rows })).catch(error => emit('kts:auto-result-error', { scope, error: String(error && error.message || error) }));
        },
        onStatus: info => emit('kts:auto-result-status', info)
      });
      jobs.set(key, { scope, poller });
      await poller.start(scope);
      return poller.getState();
    }

    function stopScope(input) {
      if (!validScope(input)) return false;
      const key = scopeKey(input);
      const job = jobs.get(key);
      if (!job) return false;
      job.poller.stop();
      jobs.delete(key);
      return true;
    }

    function stopAll() {
      for (const job of jobs.values()) job.poller.stop();
      jobs.clear();
    }

    function states() {
      return [...jobs.values()].map(job => ({ scope: Object.assign({}, job.scope), state: job.poller.getState() }));
    }

    return Object.freeze({ ensureScope, stopScope, stopAll, states });
  }

  function install() {
    const doc = global.document;
    const resultService = global.KTS_RESULT_SERVICE;
    const provider = global.KTS_RESULT_PROVIDER;
    const store = global.KTS_SETTLEMENT_STORE;
    const pipeline = global.KTS_SETTLEMENT_PIPELINE;
    if (!doc || !resultService || !provider || !store || !pipeline) return;
    if (global.KTS_RESULT_AUTO_MANAGER) return;

    const manager = createManager({ resultService, provider, store, pipeline, intervalMs: 90000 });
    global.KTS_RESULT_AUTO_MANAGER = manager;

    const messageStatus = doc.getElementById('messageStatus');
    let autoStatus = doc.getElementById('autoResultStatus');
    if (!autoStatus && messageStatus) {
      autoStatus = doc.createElement('div');
      autoStatus.id = 'autoResultStatus';
      autoStatus.className = 'status';
      messageStatus.insertAdjacentElement('afterend', autoStatus);
    }

    function setAutoStatus(text, kind) {
      if (!autoStatus) return;
      autoStatus.textContent = text || '';
      autoStatus.className = 'status ' + (kind || '');
    }

    function setResultStatus(text, kind) {
      const el = doc.getElementById('resultStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function currentScope() {
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      return { business_date: date ? String(date.value || '') : '', region: region ? String(region.value || '').toLowerCase() : '' };
    }

    function currentViewMode() {
      const select = doc.getElementById('resultViewMode');
      return normalizeViewMode(select ? select.value : readViewMode());
    }

    function renderSnapshot(snapshot, meta) {
      if (!snapshot || !snapshot.business_date || !snapshot.region) return;
      const scope = currentScope();
      const table = doc.getElementById('resultTable');
      if (!table || !sameScope(scope, snapshot)) return;

      const state = userResultState(snapshot);
      const verify = verificationDetails(snapshot);
      const shownSource = sourceLabel(snapshot.source);
      const sourceNames = verify.sources.length ? verify.sources.map(sourceLabel) : [shownSource];
      const updated = timeLabel(snapshot.fetched_at);
      const parts = [
        `<div class="kqxs-result-head"><span class="tag ${state.kind}">${esc(state.label)}</span><b>${esc(regionLabel(snapshot.region))} · ${esc(dateLabel(snapshot.business_date))}</b></div>`
      ];

      if (verificationConflict(snapshot)) {
        parts.push('<div class="status err">Hai nguồn kết quả đang lệch nhau. Hệ thống chưa dùng kết quả này để chốt tiền và sẽ tự kiểm tra lại.</div>');
      } else if (verify.reason && (String(verify.reason).startsWith('SOURCE_UNAVAILABLE:') || String(verify.reason).startsWith('SECONDARY_'))) {
        parts.push('<div class="status warn">Tạm thời mới đọc được một nguồn. Kết quả vẫn hiển thị để theo dõi nhưng sẽ chỉ được xác nhận khi nguồn còn lại khớp.</div>');
      }

      const order = snapshot.region === 'mb' ? ['DB','G1','G2','G3','G4','G5','G6','G7'] : ['G8','G7','G6','G5','G4','G3','G2','G1','DB'];
      for (const station of (snapshot.stations || [])) {
        parts.push(`<section class="kqxs-station-card"><div class="kqxs-station-head">${esc(station.name || station.code)}</div>`);
        for (const prize of order) {
          const values = ((station.prizes || {})[prize] || []);
          parts.push(`<div class="kqxs-prize-row ${prize === 'DB' ? 'kqxs-db' : ''}"><div class="kqxs-prize-label">${esc(prize)}</div><div class="kqxs-prize-values">${values.length ? esc(values.join(' · ')) : '<span class="hint">…</span>'}</div></div>`);
        }
        parts.push('</section>');
      }

      parts.push(`<details class="kqxs-source-detail"><summary>Nguồn và lần cập nhật</summary><div class="hint" style="margin-top:6px">Hiển thị từ <b>${esc(shownSource)}</b> · Đối chiếu: ${esc(sourceNames.join(' + '))}${updated ? ' · Cập nhật ' + esc(updated) : ''}</div></details>`);
      if (meta && meta.changed && meta.previous) parts.push('<div class="status warn">Kết quả vừa có thay đổi. Hệ thống đã lưu lịch sử và tự tính lại các tin liên quan.</div>');
      table.innerHTML = parts.join('');
    }

    async function renderStoredSelected(options) {
      const epoch = ++storedRenderEpoch;
      const o = options || {};
      const scope = currentScope();
      const table = doc.getElementById('resultTable');
      const stillCurrent = () => epoch === storedRenderEpoch && sameScope(scope, currentScope());
      if (!validScope(scope)) return null;
      const snapshot = await store.get(store.STORES.results, scopeKey(scope));
      if (!stillCurrent()) return null;
      if (snapshot) {
        renderSnapshot(snapshot, { cached: true });
        if (o.status !== false) {
          if (verificationConflict(snapshot)) {
            setResultStatus(`Hai nguồn kết quả ${regionLabel(scope.region)} ${dateLabel(scope.business_date)} đang lệch nhau · chưa dùng để chốt tiền.`, 'err');
          } else {
            const label = snapshot.complete ? 'Đã có kết quả đã lưu.' : 'Đã có kết quả đang cập nhật.';
            setResultStatus(`${label} ${regionLabel(scope.region)} ${dateLabel(scope.business_date)}.`, snapshot.complete ? 'ok' : 'warn');
          }
        }
        return snapshot;
      }
      if (table) table.innerHTML = '<div class="hint">Chưa có dữ liệu cho ngày/miền này.</div>';
      if (o.status !== false) setResultStatus(`Chưa có kết quả ${regionLabel(scope.region)} ${dateLabel(scope.business_date)}. Hệ thống sẽ tự cập nhật.`, 'warn');
      return null;
    }

    async function hasMessagesForScope(scope) {
      if (!validScope(scope)) return false;
      const all = await store.getAll(store.STORES.messages);
      return all.some(m => String(m.status || '').toLowerCase() !== 'cancelled' && String(m.business_date) === scope.business_date && String(m.region || '').toLowerCase() === scope.region);
    }

    let realtimeDisplayActive = false;
    let realtimeViewScope = null;
    let storedRenderEpoch = 0;
    let selectedFetchEpoch = 0;
    let realtimeViewEpoch = 0;

    async function resumePendingScopes() {
      const remembered = readPendingScopes();
      const rememberedKeys = new Set(remembered.map(scopeKey));
      const allMessages = await store.getAll(store.STORES.messages);
      const activeScopes = new Map();
      for (const message of allMessages) {
        if (String(message && message.status || '').toLowerCase() === 'cancelled') continue;
        const scope = { business_date:String(message && message.business_date || ''), region:String(message && message.region || '').toLowerCase() };
        if (validScope(scope)) activeScopes.set(scopeKey(scope), scope);
      }
      for (const scope of remembered) if (validScope(scope)) activeScopes.set(scopeKey(scope), scope);

      const resume = [];
      for (const [key, scope] of activeScopes) {
        const hasActiveMessage = allMessages.some(message =>
          String(message && message.status || '').toLowerCase() !== 'cancelled' &&
          String(message && message.business_date || '') === scope.business_date &&
          String(message && message.region || '').toLowerCase() === scope.region
        );
        if (!hasActiveMessage) continue;
        const snapshot = await store.get(store.STORES.results, key);
        if (!pendingScopeNeedsResume(scope, snapshot, localToday(), rememberedKeys.has(key))) continue;
        resume.push(scope);
      }
      writePendingScopes(resume);
      for (const scope of resume) manager.ensureScope(scope).catch(error => emit('kts:auto-result-error', { scope, error: String(error && error.message || error) }));
      return resume;
    }

    async function releaseViewScope(scope) {
      if (!validScope(scope)) return;
      try {
        if (!(await hasMessagesForScope(scope))) manager.stopScope(scope);
      } catch (_) {}
    }

    async function startRealtimeView() {
      const epoch = ++realtimeViewEpoch;
      const date = doc.getElementById('resultDate');
      if (date) date.value = localToday();
      const next = currentScope();
      const stillCurrent = () =>
        epoch === realtimeViewEpoch &&
        realtimeDisplayActive &&
        realtimeViewScope && sameScope(next, realtimeViewScope) &&
        sameScope(next, currentScope());
      if (!validScope(next)) return setResultStatus('Chưa chọn đủ ngày/miền KQXS.', 'err');
      const previous = realtimeViewScope;
      realtimeViewScope = Object.assign({}, next);
      realtimeDisplayActive = true;
      if (previous && !sameScope(previous, next)) await releaseViewScope(previous);
      await renderStoredSelected({ status: false });
      if (!stillCurrent()) return null;
      setResultStatus(`THỜI GIAN THẬT · ${next.region.toUpperCase()} ${next.business_date} · tự cập nhật 90 giây/lần.`, 'warn');
      try {
        await manager.ensureScope(next);
        return next;
      } catch (error) {
        if (stillCurrent()) setResultStatus(`Không bắt đầu được KQXS thời gian thật: ${String(error && error.message || error)}`, 'err');
        return null;
      }
    }

    async function stopRealtimeView() {
      realtimeViewEpoch += 1;
      const scope = realtimeViewScope || currentScope();
      realtimeDisplayActive = false;
      realtimeViewScope = null;
      const keepBackground = await hasMessagesForScope(scope).catch(() => false);
      if (!keepBackground) manager.stopScope(scope);
      setResultStatus(keepBackground
        ? 'Đã dừng hiển thị thời gian thật. Theo dõi nền vẫn chạy vì còn tin settlement dùng KQXS này.'
        : 'Đã dừng theo dõi KQXS thời gian thật.', '');
    }

    async function fetchSelectedDateOnce() {
      const epoch = ++selectedFetchEpoch;
      const scope = currentScope();
      const stillCurrent = () => epoch === selectedFetchEpoch && sameScope(scope, currentScope());
      if (!validScope(scope)) return setResultStatus('Chưa chọn đủ ngày/miền KQXS.', 'err');
      realtimeDisplayActive = false;
      realtimeViewEpoch += 1;
      setResultStatus(`Đang tải KQXS ${scope.region.toUpperCase()} ${scope.business_date} một lần…`, '');
      try {
        const raw = await provider.fetchSnapshot(scope);
        const snapshot = resultService.normalizeSnapshot(Object.assign({}, raw, scope));
        const saved = await store.saveResultSnapshot(snapshot);
        if (stillCurrent()) renderSnapshot(saved.snapshot || snapshot, saved);
        const rows = await pipeline.recalculateDateRegion({
          business_date: snapshot.business_date,
          region: snapshot.region,
          result_snapshot: saved.snapshot || snapshot
        });
        if (!stillCurrent()) return saved.snapshot || snapshot;
        const blocked = rows.filter(x => x && x.status === 'blocked').length;
        if (verificationConflict(snapshot)) {
          setResultStatus(`Theo ngày chọn · KQXS ${scope.region.toUpperCase()} ${scope.business_date} đang XUNG ĐỘT NGUỒN. Settlement đã được rà lại và fail-closed; KHÔNG chốt tiền.`, 'err');
        } else if (snapshot.complete) {
          setResultStatus(`Theo ngày chọn · đã tải đủ KQXS ${scope.region.toUpperCase()} ${scope.business_date}. ${rows.length} phạm vi settlement đã rà lại${blocked ? ` · ${blocked} đang fail-closed` : ''}.`, blocked ? 'warn' : 'ok');
        } else {
          setResultStatus(`Theo ngày chọn · snapshot này chưa đủ giải. Không tự polling; bấm “Tải ngày đã chọn” để kiểm tra lại.`, 'warn');
        }
      } catch (error) {
        if (!stillCurrent()) return null;
        await renderStoredSelected({ status: false }).catch(() => {});
        if (stillCurrent()) setResultStatus(`Không tải được KQXS ngày chọn: ${String(error && error.message || error)}. Nếu có snapshot cũ thì vẫn giữ nguyên.`, 'err');
        return null;
      }
    }

    function installViewModeUi() {
      const pane = doc.getElementById('pane-result');
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      const start = doc.getElementById('startResults');
      const stop = doc.getElementById('stopResults');
      if (!pane || !date || !region || !start || !stop) return;

      let selector = doc.getElementById('resultViewMode');
      if (!selector) {
        const card = pane.querySelector('.card');
        const controls = card && card.querySelector('.grid3');
        if (card && controls) {
          const wrap = doc.createElement('div');
          wrap.className = 'grid';
          wrap.id = 'resultViewChooser';
          wrap.style.marginBottom = '8px';
          wrap.innerHTML = '<div><label>Hiển thị KQXS</label><select id="resultViewMode"><option value="realtime">Thời gian thật</option><option value="date">Theo ngày chọn</option></select></div><div><label>Chế độ</label><input id="resultViewModeInfo" readonly></div>';
          card.insertBefore(wrap, controls);
          selector = doc.getElementById('resultViewMode');
        }
      }
      if (!selector) return;
      selector.value = readViewMode();

      const cycle = pane.querySelector('.grid3 input[readonly]');
      const info = doc.getElementById('resultViewModeInfo');

      async function applyMode(startNow) {
        const mode = writeViewMode(selector.value);
        selector.value = mode;
        if (mode === 'realtime') {
          date.value = localToday();
          date.disabled = true;
          start.textContent = 'Theo dõi thời gian thật';
          stop.disabled = false;
          if (cycle) cycle.value = '90 giây';
          if (info) info.value = 'Hôm nay · tự cập nhật';
          if (startNow) await startRealtimeView();
          else await renderStoredSelected({ status: false });
        } else {
          const previous = realtimeViewScope;
          realtimeDisplayActive = false;
          realtimeViewScope = null;
          if (previous) await releaseViewScope(previous);
          date.disabled = false;
          start.textContent = 'Tải ngày đã chọn';
          stop.disabled = true;
          if (cycle) cycle.value = '1 lần / yêu cầu';
          if (info) info.value = 'Lịch sử · chọn ngày';
          await renderStoredSelected();
        }
      }

      selector.addEventListener('change', () => applyMode(true).catch(error => setResultStatus(String(error && error.message || error), 'err')));
      date.addEventListener('change', () => {
        if (currentViewMode() === 'date') renderStoredSelected().catch(() => {});
      });
      region.addEventListener('change', () => {
        if (currentViewMode() === 'realtime') startRealtimeView().catch(() => {});
        else renderStoredSelected().catch(() => {});
      });

      start.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (currentViewMode() === 'realtime') startRealtimeView().catch(error => setResultStatus(String(error && error.message || error), 'err'));
        else fetchSelectedDateOnce().catch(error => setResultStatus(String(error && error.message || error), 'err'));
      }, true);
      stop.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (currentViewMode() === 'realtime') stopRealtimeView().catch(() => {});
      }, true);

      for (const button of doc.querySelectorAll('.nav button[data-pane="result"]')) {
        button.addEventListener('click', () => {
          if (currentViewMode() === 'realtime') startRealtimeView().catch(() => {});
          else renderStoredSelected().catch(() => {});
        });
      }

      applyMode(false).catch(() => {});
    }

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:settlement-message-saved', event => {
        const detail = event && event.detail || {};
        const scope = detail.scope || {};
        if (!validScope(scope)) return;
        rememberPendingScope(scope);
        setAutoStatus(`KQXS ${String(scope.region).toUpperCase()} ${scope.business_date}: đang tự theo dõi 90 giây/lần…`, 'warn');
        manager.ensureScope(scope).catch(error => {
          emit('kts:auto-result-error', { scope, error: String(error && error.message || error) });
        });
      });
      global.addEventListener('kts:auto-result-status', event => {
        const info = event.detail || {};
        const scope = info.scope || {};
        const label = `${regionLabel(scope.region)} ${dateLabel(scope.business_date)}`.trim();
        if (info.state === 'verified' || info.state === 'complete') forgetPendingScope(scope);
        if (info.state === 'fetching') setAutoStatus(`Kết quả ${label}: đang cập nhật…`, '');
        else if (info.state === 'waiting') setAutoStatus(`Kết quả ${label}: đang xổ · hệ thống tự kiểm tra lại.`, 'warn');
        else if (info.state === 'complete_waiting_confirmation') setAutoStatus(`Kết quả ${label}: đã đủ giải · đang kiểm tra lại độ ổn định.`, 'warn');
        else if (info.state === 'verification_pending') setAutoStatus(`Kết quả ${label}: đã đủ · đang đối chiếu nguồn còn lại.`, 'warn');
        else if (info.state === 'conflict') setAutoStatus(`Kết quả ${label}: hai nguồn đang lệch nhau · chưa chốt tiền.`, 'err');
        else if (info.state === 'complete') setAutoStatus(`Kết quả ${label}: đã đủ · đang chờ đối chiếu nguồn.`, 'ok');
        else if (info.state === 'verified') setAutoStatus(`Kết quả ${label}: Xổ Số Minh Ngọc + XSKT đã khớp.`, 'ok');
        else if (info.state === 'error') setAutoStatus(`Kết quả ${label}: tạm chưa cập nhật được · giữ dữ liệu gần nhất và sẽ tự thử lại.`, 'err');

        if (currentViewMode() === 'realtime' && realtimeDisplayActive && sameScope(scope, currentScope())) {
          if (info.state === 'fetching') setResultStatus('Đang cập nhật kết quả…', '');
          else if (info.state === 'waiting') setResultStatus('Đang xổ · hệ thống tự cập nhật.', 'warn');
          else if (info.state === 'complete_waiting_confirmation') setResultStatus(`Đã đủ kết quả · đang kiểm tra lại.`, 'warn');
          else if (info.state === 'verification_pending') setResultStatus('Đã đủ kết quả · đang đối chiếu nguồn thứ hai.', 'warn');
          else if (info.state === 'conflict') setResultStatus('Hai nguồn đang lệch nhau · chưa dùng để chốt tiền.', 'err');
          else if (info.state === 'complete') setResultStatus('Đã đủ kết quả · đang chờ đối chiếu nguồn.', 'ok');
          else if (info.state === 'verified') setResultStatus('Đã đối chiếu Xổ Số Minh Ngọc + XSKT · khớp.', 'ok');
          else if (info.state === 'error') setResultStatus(`Tạm chưa cập nhật được kết quả · vẫn giữ dữ liệu gần nhất.`, 'err');
        }
      });
      global.addEventListener('kts:auto-result-update', event => {
        const detail = event.detail || {};
        if (!detail.snapshot) return;
        if (currentViewMode() === 'date' || (realtimeDisplayActive && sameScope(detail.snapshot, currentScope()))) renderSnapshot(detail.snapshot, detail.meta || {});
      });
      global.addEventListener('kts:auto-result-error', event => {
        const detail = event.detail || {};
        setAutoStatus(`KQXS đã lưu nhưng tính lại settlement lỗi: ${detail.error || 'UNKNOWN'}`, 'err');
      });
      global.addEventListener('kts:settlement-message-activity-changed', event => {
        const scope = event && event.detail && event.detail.scope || {};
        if (!validScope(scope)) return;
        hasMessagesForScope(scope).then(hasActive => {
          if (hasActive) {
            rememberPendingScope(scope);
            return manager.ensureScope(scope);
          }
          forgetPendingScope(scope);
          manager.stopScope(scope);
          return null;
        }).catch(error => emit('kts:auto-result-error', { scope, error: String(error && error.message || error) }));
      });
      global.addEventListener('beforeunload', () => manager.stopAll());
    }

    installViewModeUi();
    resumePendingScopes().catch(() => {});
  }

  global.KTS_RESULT_AUTO = Object.freeze({
    version: 'result-auto-v11-stale-safe-view-requests',
    VIEW_MODE_KEY,
    PENDING_SCOPES_KEY,
    readPendingScopes,
    writePendingScopes,
    rememberPendingScope,
    forgetPendingScope,
    pendingScopeNeedsResume,
    createManager,
    validScope,
    normalizeViewMode,
    snapshotVerified,
    verificationConflict,
    verificationDetails,
    regionLabel,
    sourceLabel,
    dateLabel,
    userResultState
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
