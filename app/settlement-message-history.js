(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function num(v) { const n = Number(v == null ? 0 : v); return Number.isFinite(n) ? n : 0; }
  function money(v) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(num(v)); }

  function scopeMatch(row, scope) {
    return Boolean(row && scope &&
      String(row.partner_id || '') === String(scope.partner_id || '') &&
      String(row.business_date || '') === String(scope.business_date || '') &&
      String(row.region || '').toLowerCase() === String(scope.region || '').toLowerCase());
  }

  function settlementForMessage(message, settlements) {
    return (settlements || []).find(s => {
      const ids = Array.isArray(s.message_ids) ? s.message_ids : (s.message_id ? [s.message_id] : []);
      return ids.includes(message.id);
    }) || null;
  }

  function settlementForScope(scope, settlements) {
    if (!scope) return null;
    const expected = `scope:${scope.partner_id}:${scope.business_date}:${String(scope.region || '').toLowerCase()}`;
    return (settlements || []).find(s => s.id === expected) ||
      (settlements || []).find(s => scopeMatch(s, scope)) || null;
  }

  function friendlyReason(reason) {
    const text = String(reason || '');
    if (text.includes('NO_CONFIG_FOR_BUSINESS_DATE')) return 'Chưa có thiết lập giá cho ngày này.';
    if (text.includes('KQXS_NOT_AVAILABLE')) return 'Chưa có kết quả xổ số cho ngày này.';
    if (text.includes('PRICE_MISSING:mt:')) return 'Miền Trung chưa có bảng giá riêng. Mở Thiết lập và lưu bảng giá MT.';
    if (text.includes('PRICE_MISSING:mn:')) return 'Miền Nam chưa có bảng giá cho cách đánh này.';
    if (text.includes('PRICE_MISSING:mb:')) return 'Miền Bắc chưa có bảng giá cho cách đánh này.';
    if (text.startsWith('PENDING_PARSER:')) return 'Có tin chưa đọc được cú pháp.';
    return text;
  }

  const CODE_LABELS = Object.freeze({
    '2CB':'2C lô','2CD':'2C ĐĐ','2CB7':'2C 7 lô','2CB8':'2C 8 lô',
    DAT:'Đá thẳng',DAX:'Đá xuyên','3CB':'3C lô','3CB7':'3C 7 lô',
    '3CDD':'3C ĐĐ','3CXC':'3C xỉu chủ','4C':'4C',
    MB_XIEN2:'Xiên 2',MB_XIEN3:'Xiên 3',MB_XIEN4:'Xiên 4',UI:'Ủi'
  });

  function canonicalSummary(message) {
    const canonical = message && message.canonical_payload;
    const legs = canonical && Array.isArray(canonical.legs) ? canonical.legs : [];
    return legs.map(leg => {
      const stations = Array.isArray(leg.station_codes) && leg.station_codes.length
        ? leg.station_codes.map(x => String(x).toUpperCase()).join('+') + ' · '
        : '';
      const code = String(leg.code || '').toUpperCase();
      const label = CODE_LABELS[code] || code;
      const numbers = Array.isArray(leg.values) ? leg.values.map(String).join(' ') : '';
      const position = leg.position ? ' ' + String(leg.position).toUpperCase() : '';
      const stake = leg.stake == null ? '' : ' · ' + String(leg.stake) + 'n';
      return (stations + numbers + ' ' + label + position + stake).trim();
    }).filter(Boolean).join(' | ');
  }

  function deriveState(message, settlement) {
    if (!message) return { code: 'UNKNOWN', label: 'Không rõ', kind: 'warn' };
    if (String(message.status || '').toLowerCase() === 'cancelled') {
      return { code: 'CANCELLED', label: 'Đã hủy', kind: 'err' };
    }
    if (message.parser_error || String(message.status || '') === 'parser_error') {
      return { code: 'PARSER_ERROR', label: 'Lỗi parser', kind: 'err' };
    }
    if (settlement && settlement.scope_status === 'blocked') {
      return { code: 'BLOCKED', label: 'Chưa tính', kind: 'err' };
    }
    if (settlement && settlement.scope_status === 'provisional') {
      return { code: 'PROVISIONAL', label: 'Tạm tính', kind: 'warn' };
    }
    if (settlement && settlement.scope_status === 'complete_unverified') {
      return { code: 'UNVERIFIED', label: 'Đã tính · chờ đối chiếu', kind: 'warn' };
    }
    if (String(message.status || '') === 'parsed_waiting_result') {
      return { code: 'WAITING_RESULT', label: 'Chờ KQXS', kind: 'warn' };
    }
    return { code: 'SAVED', label: 'Đã lưu', kind: 'ok' };
  }

  function buildRows(scope, messages, settlements) {
    return (messages || [])
      .filter(m => scopeMatch(m, scope))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .map(message => {
        const settlement = settlementForMessage(message, settlements);
        const state = deriveState(message, settlement);
        const blocked = settlement && Array.isArray(settlement.blocked_reasons) ? settlement.blocked_reasons.map(friendlyReason) : [];
        return { message, settlement, state, blocked_reasons: blocked };
      });
  }

  const RESULT_PRIZE_COUNTS = Object.freeze({
    mn:Object.freeze({G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1}),
    mt:Object.freeze({G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1}),
    mb:Object.freeze({G7:4,G6:3,G5:6,G4:4,G3:6,G2:2,G1:1,DB:1})
  });
  function resultStationComplete(region, station) {
    const expected=RESULT_PRIZE_COUNTS[String(region||'').toLowerCase()];
    if(!expected) return false;
    const prizes=station&&station.prizes||{};
    return Object.entries(expected).every(([prize,count])=>{
      const found=Object.entries(prizes).find(([key])=>String(key).toUpperCase()===prize);
      const values=found ? (Array.isArray(found[1]) ? found[1] : [found[1]]) : [];
      return values.filter(v=>v!=null&&String(v).trim()!=='').length===count;
    });
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
    const region=String(snapshot.region||'').toLowerCase();
    const prizeDataValid=Array.isArray(snapshot.stations) && snapshot.stations.length>0 &&
      snapshot.stations.every(station=>resultStationComplete(region,station));
    return sources.size >= 2 && conflicts.length === 0 &&
      expected.length > 0 && new Set(expected).size === expected.length &&
      new Set(actual).size === actual.length && actual.length === expected.length &&
      expected.every(code => actual.includes(code)) && prizeDataValid;
  }

  function buildScopeSummary(scope, messages, settlements, resultSnapshot) {
    const scoped = (messages || []).filter(m => scopeMatch(m, scope));
    const active = scoped.filter(m => String(m.status || '').toLowerCase() !== 'cancelled');
    const cancelled = scoped.length - active.length;
    const parserErrors = active.filter(m => m.parser_error || String(m.status || '') === 'parser_error').length;
    const settlement = settlementForScope(scope, settlements);
    const result = settlement && (settlement.settlement_result || settlement.result_snapshot) || {};
    const comparison = String(settlement && settlement.comparison_status || '').toUpperCase();
    const resultAvailable = Boolean(resultSnapshot);
    const resultComplete = Boolean(resultSnapshot && resultSnapshot.complete);
    const resultVerified = snapshotVerified(resultSnapshot);

    let state = { code: 'WAITING_RESULT', label: 'CHỜ KQXS', kind: 'warn' };
    if (!active.length) state = { code: 'EMPTY', label: 'CHƯA CÓ TIN ĐANG TÍNH', kind: '' };
    else if (parserErrors || (settlement && settlement.scope_status === 'blocked')) state = { code: 'BLOCKED', label: 'CHƯA TÍNH', kind: 'err' };
    else if (!resultAvailable) state = { code: 'WAITING_RESULT', label: 'CHỜ KQXS', kind: 'warn' };
    else if (!resultComplete || (settlement && settlement.scope_status === 'provisional')) state = { code: 'PROVISIONAL', label: 'TẠM TÍNH', kind: 'warn' };
    else if (comparison === 'MATCH_EXACT') state = { code: 'MATCH_EXACT', label: 'KHỚP EXACT', kind: 'ok' };
    else if (comparison === 'MISMATCH') state = { code: 'MISMATCH', label: 'LỆCH SHADOW', kind: 'err' };
    else if (comparison === 'MATCH_DISPLAY_ONLY') state = { code: 'MATCH_DISPLAY_ONLY', label: 'CHỈ KHỚP HIỂN THỊ', kind: 'warn' };
    else state = { code: 'UNVERIFIED', label: 'ĐÃ TÍNH · CHỜ ĐỐI CHIẾU', kind: 'warn' };

    const finalNet = num(result.final_net);
    return {
      scope: Object.assign({}, scope),
      counts: { total: scoped.length, active: active.length, cancelled, parser_errors: parserErrors },
      state,
      kqxs: {
        available: resultAvailable,
        complete: resultComplete,
        verified: resultVerified,
        label: !resultAvailable ? 'CHƯA CÓ KQ' : resultVerified ? 'ĐÃ XÁC MINH' : resultComplete ? 'ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU' : 'ĐANG RA KQ'
      },
      totals: {
        xac: num(result.total_xac), qua_co: num(result.total_qua_co), payout: num(result.total_payout),
        refund_amount: num(result.refund_amount), final_net: finalNet,
        direction: finalNet > 0 ? 'THU' : finalNet < 0 ? 'BÙ' : 'HÒA'
      },
      blocked_reasons: settlement && Array.isArray(settlement.blocked_reasons) ? settlement.blocked_reasons.map(friendlyReason) : []
    };
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const pipeline = global.KTS_SETTLEMENT_PIPELINE;
    if (!doc || !store || !pipeline) return;

    let scopeMutationBusy = false;
    let refreshEpoch = 0;

    function setScopeMutationBusy(value) {
      scopeMutationBusy = Boolean(value);
      for (const button of doc.querySelectorAll('[data-cancel-message],[data-restore-message],#recalcMessageScope')) {
        button.disabled = scopeMutationBusy;
      }
    }

    function beginScopeMutation(label) {
      if (scopeMutationBusy) {
        setStatus(`Đang ${label || 'xử lý'} một thao tác khác trong phạm vi. Chờ hoàn tất rồi thử lại.`, 'warn');
        return false;
      }
      setScopeMutationBusy(true);
      return true;
    }

    const pane = doc.getElementById('pane-message');
    const inputCard = pane && pane.querySelector('.card');
    if (!pane || !inputCard || doc.getElementById('messageHistory')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="row" style="justify-content:space-between"><div class="section-title">Phạm vi đang làm</div><button id="refreshMessageHistory" class="btn soft">Làm mới</button></div><div id="messageScopeSummary" class="hint">Chưa có dữ liệu.</div><div class="row" style="justify-content:space-between;margin-top:10px"><div class="section-title" style="margin:0">Tin đã lưu</div><button id="recalcMessageScope" class="btn soft">Rà lại phạm vi</button></div><div id="messageHistoryStatus" class="status"></div><div id="messageHistory" class="hint">Chưa có tin trong phạm vi đang chọn.</div>';
    inputCard.insertAdjacentElement('afterend', card);

    function currentScope() {
      const partner = doc.getElementById('partnerSelect');
      const date = doc.getElementById('messageDate');
      const region = doc.getElementById('messageRegion');
      return {
        partner_id: partner ? String(partner.value || '') : '',
        business_date: date ? String(date.value || '') : '',
        region: region ? String(region.value || '').toLowerCase() : ''
      };
    }

    function setStatus(text, kind) {
      const el = doc.getElementById('messageHistoryStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function renderSummary(summary) {
      const host = doc.getElementById('messageScopeSummary');
      if (!host) return;
      const stateClass = summary.state.kind || '';
      const total = summary.totals;
      const blocked = summary.blocked_reasons.length ? `<div class="status err">${esc(summary.blocked_reasons.join(' · '))}</div>` : '';
      host.innerHTML = `<div class="row" style="justify-content:space-between"><div><span class="tag ${stateClass}">${esc(summary.state.label)}</span> <span class="tag ${summary.kqxs.verified ? 'ok' : 'warn'}">${esc(summary.kqxs.label)}</span></div><div class="hint">${summary.counts.active} tin đang tính${summary.counts.cancelled ? ` · ${summary.counts.cancelled} đã hủy` : ''}${summary.counts.parser_errors ? ` · ${summary.counts.parser_errors} lỗi parser` : ''}</div></div>` +
        `<div style="margin-top:7px">XÁC <span class="money">${money(total.xac)}</span> · QUA CÒ <span class="money">${money(total.qua_co)}</span> · TRẢ <span class="money">${money(total.payout)}</span> · HỒI <span class="money">${money(total.refund_amount)}</span></div>` +
        `<div class="status ${total.direction === 'THU' ? 'ok' : total.direction === 'BÙ' ? 'err' : ''}">${esc(total.direction)} ${money(Math.abs(total.final_net))}</div>${blocked}`;
    }

    async function refresh() {
      const epoch = ++refreshEpoch;
      const scope = currentScope();
      const host = doc.getElementById('messageHistory');
      const stillCurrent = () => epoch === refreshEpoch && scopeMatch(scope, currentScope());
      if (!scope.partner_id || !/^\d{4}-\d{2}-\d{2}$/.test(scope.business_date) || !['mn','mt','mb'].includes(scope.region)) {
        if (host) host.innerHTML = '<div class="hint">Chọn đối tác, ngày và miền để xem tin.</div>';
        return [];
      }
      const [messages, settlements, resultSnapshot] = await Promise.all([
        store.getAll(store.STORES.messages), store.getAll(store.STORES.settlements),
        store.get(store.STORES.results, `${scope.business_date}:${scope.region}`)
      ]);
      if (!stillCurrent()) return [];
      renderSummary(buildScopeSummary(scope, messages, settlements, resultSnapshot));
      const rows = buildRows(scope, messages, settlements);
      if (!host) return rows;
      if (!rows.length) {
        host.innerHTML = '<div class="hint">Chưa có tin trong phạm vi đang chọn.</div>';
        setStatus('', '');
        return rows;
      }
      host.innerHTML = rows.map(row => {
        const m = row.message;
        const cancelled = row.state.code === 'CANCELLED';
        const stateClass = row.state.kind === 'err' ? 'err' : row.state.kind === 'ok' ? 'ok' : 'warn';
        const reason = cancelled ? 'Tin này được giữ để audit nhưng không tham gia tính tiền.' : (m.parser_error || row.blocked_reasons.join(' · '));
        const action = cancelled
          ? `<button class="btn soft" data-restore-message="${esc(m.id)}">Khôi phục</button>`
          : `<button class="btn danger" data-cancel-message="${esc(m.id)}">Hủy tin</button>`;
        const parsed = !m.parser_error && m.canonical_payload ? canonicalSummary(m) : '';
        return `<div class="report-message" data-message-id="${esc(m.id)}"><div class="row" style="justify-content:space-between"><div><span class="tag ${stateClass}">${esc(row.state.label)}</span> <span class="hint">${esc(m.created_at || '')}</span></div><div class="row"><button class="btn soft" data-reuse-message="${esc(m.id)}">Nạp lại</button>${action}</div></div><div class="raw">${esc(m.raw_text || '')}</div>${parsed ? `<div class="hint" style="margin-top:5px"><b>Hệ thống đã đọc:</b> ${esc(parsed)}</div>` : ''}${reason ? `<div class="status ${stateClass}">${esc(reason)}</div>` : ''}</div>`;
      }).join('');
      host.querySelectorAll('[data-reuse-message]').forEach(btn => btn.addEventListener('click', () => {
        const row = rows.find(x => x.message.id === btn.dataset.reuseMessage);
        const text = doc.getElementById('messageText');
        if (row && !scopeMatch(row.message, currentScope())) {
          setStatus('Phạm vi đã đổi. Danh sách cũ không còn được dùng; đang tải lại.', 'warn');
          refresh().catch(() => {});
          return;
        }
        if (row && text) {
          text.value = row.message.raw_text || '';
          text.focus();
          setStatus('Đã nạp tin cũ vào ô nhập. Bấm “Lưu + tính” sẽ tạo một tin mới; tin cũ không bị sửa.', 'warn');
        }
      }));
      host.querySelectorAll('[data-cancel-message]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.cancelMessage;
        const row = rows.find(x => x.message.id === id);
        if (!row) return;
        if (!scopeMatch(row.message, currentScope())) {
          setStatus('Phạm vi đã đổi. Không hủy tin từ danh sách cũ.', 'warn');
          refresh().catch(() => {});
          return;
        }
        if (typeof global.confirm === 'function' && !global.confirm(`Hủy tin này khỏi tính tiền?\n\n${row.message.raw_text || ''}\n\nTin vẫn được giữ trong lịch sử và có thể khôi phục.`)) return;
        if (!beginScopeMutation('hủy/khôi phục')) return;
        setStatus('Đang hủy tin và tính lại phạm vi…', 'warn');
        try {
          const result = await pipeline.cancelMessage(id);
          if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            global.dispatchEvent(new global.CustomEvent('kts:settlement-message-activity-changed', { detail:{ scope:{
              business_date:String(row.message.business_date || ''), region:String(row.message.region || '').toLowerCase()
            }}}));
          }
          setStatus(result.settlement && result.settlement.status === 'empty' ? 'Đã hủy tin. Phạm vi hiện không còn tin đang tính.' : 'Đã hủy tin và tính lại phạm vi.', 'ok');
          await refresh();
        } catch (error) {
          setStatus(`Hủy tin lỗi: ${String(error && error.message || error)}`, 'err');
        } finally {
          setScopeMutationBusy(false);
        }
      }));
      host.querySelectorAll('[data-restore-message]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.restoreMessage;
        const row = rows.find(x => x.message.id === id);
        if (!row) return;
        if (!scopeMatch(row.message, currentScope())) {
          setStatus('Phạm vi đã đổi. Không khôi phục tin từ danh sách cũ.', 'warn');
          refresh().catch(() => {});
          return;
        }
        if (!beginScopeMutation('hủy/khôi phục')) return;
        setStatus('Đang khôi phục tin và tính lại phạm vi…', 'warn');
        try {
          await pipeline.restoreMessage(id);
          const restored = row;
          if (restored && typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            global.dispatchEvent(new global.CustomEvent('kts:settlement-message-activity-changed', { detail:{ scope:{
              business_date:String(restored.message.business_date || ''), region:String(restored.message.region || '').toLowerCase()
            }}}));
          }
          setStatus('Đã khôi phục tin và tính lại phạm vi.', 'ok');
          await refresh();
        } catch (error) {
          setStatus(`Khôi phục tin lỗi: ${String(error && error.message || error)}`, 'err');
        } finally {
          setScopeMutationBusy(false);
        }
      }));
      const activeCount = rows.filter(row => row.state.code !== 'CANCELLED').length;
      const cancelledCount = rows.length - activeCount;
      setStatus(`${activeCount} tin đang tính${cancelledCount ? ` · ${cancelledCount} tin đã hủy` : ''} · ${scope.region.toUpperCase()} ${scope.business_date}.`, 'ok');
      return rows;
    }

    async function recalc() {
      const scope = currentScope();
      if (!scope.partner_id) return setStatus('Chưa chọn đối tác.', 'err');
      if (!beginScopeMutation('rà lại')) return;
      setStatus('Đang rà lại parser/config/KQXS của phạm vi…', '');
      try {
        const result = await pipeline.settleScope(scope);
        if (result.status === 'blocked') setStatus(`Phạm vi đang fail-closed: ${result.reason || 'BLOCKED'}`, 'err');
        else if (result.status === 'provisional') setStatus('Đã rà lại · settlement đang TẠM TÍNH vì KQXS chưa hoàn tất.', 'warn');
        else if (result.status === 'complete_unverified') setStatus('Đã rà lại · tiền đã tính, đang chờ đối chiếu HIOSKT.', 'ok');
        else if (result.status === 'empty') setStatus('Phạm vi không còn tin đang tính.', 'warn');
        else setStatus(`Đã rà lại: ${result.status}.`, 'ok');
        await refresh();
      } catch (error) {
        setStatus(`Rà lại lỗi: ${String(error && error.message || error)}`, 'err');
      } finally {
        setScopeMutationBusy(false);
      }
    }

    const refreshBtn = doc.getElementById('refreshMessageHistory');
    const recalcBtn = doc.getElementById('recalcMessageScope');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh().catch(e => setStatus(String(e.message || e), 'err')));
    if (recalcBtn) recalcBtn.addEventListener('click', recalc);

    for (const id of ['partnerSelect','messageDate','messageRegion']) {
      const el = doc.getElementById(id);
      if (el) el.addEventListener('change', () => refresh().catch(() => {}));
    }
    const messageStatus = doc.getElementById('messageStatus');
    if (messageStatus && typeof global.MutationObserver === 'function') {
      const observer = new global.MutationObserver(() => refresh().catch(() => {}));
      observer.observe(messageStatus, { childList: true, characterData: true, subtree: true });
    }
    if (typeof global.addEventListener === 'function') {
      for (const eventName of ['kts:auto-result-update','kts:auto-result-recalculated']) {
        global.addEventListener(eventName, event => {
          const detail = event && event.detail || {};
          const snapshot = detail.snapshot || {};
          const scope = currentScope();
          if (String(snapshot.business_date || '') === scope.business_date && String(snapshot.region || '').toLowerCase() === scope.region) refresh().catch(() => {});
        });
      }
    }
    for (const button of doc.querySelectorAll('.nav button[data-pane="message"]')) {
      button.addEventListener('click', () => refresh().catch(() => {}));
    }
  }

  global.KTS_SETTLEMENT_MESSAGE_HISTORY = Object.freeze({
    version: 'message-history-v9-prize-complete-kqxs', scopeMatch, settlementForScope, friendlyReason, canonicalSummary, deriveState, snapshotVerified, buildRows, buildScopeSummary
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
