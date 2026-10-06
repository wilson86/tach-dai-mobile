(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

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

  function deriveState(message, settlement) {
    if (!message) return { code: 'UNKNOWN', label: 'Không rõ', kind: 'warn' };
    if (String(message.status || '') === 'cancelled') {
      return { code: 'CANCELLED', label: 'Đã hủy', kind: 'err' };
    }
    if (message.parser_error || String(message.status || '') === 'parser_error') {
      return { code: 'PARSER_ERROR', label: 'Lỗi parser', kind: 'err' };
    }
    if (settlement && settlement.scope_status === 'blocked') {
      return { code: 'BLOCKED', label: 'Bị chặn', kind: 'err' };
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
        const blocked = settlement && Array.isArray(settlement.blocked_reasons) ? settlement.blocked_reasons : [];
        return { message, settlement, state, blocked_reasons: blocked };
      });
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const pipeline = global.KTS_SETTLEMENT_PIPELINE;
    if (!doc || !store || !pipeline) return;

    const pane = doc.getElementById('pane-message');
    const inputCard = pane && pane.querySelector('.card');
    if (!pane || !inputCard || doc.getElementById('messageHistory')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="row" style="justify-content:space-between"><div class="section-title">Tin đã lưu</div><div class="row"><button id="refreshMessageHistory" class="btn soft">Làm mới</button><button id="recalcMessageScope" class="btn soft">Rà lại phạm vi</button></div></div><div id="messageHistoryStatus" class="status"></div><div id="messageHistory" class="hint">Chưa có tin trong phạm vi đang chọn.</div>';
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

    async function refresh() {
      const scope = currentScope();
      const host = doc.getElementById('messageHistory');
      if (!scope.partner_id || !/^\d{4}-\d{2}-\d{2}$/.test(scope.business_date) || !['mn','mt','mb'].includes(scope.region)) {
        if (host) host.innerHTML = '<div class="hint">Chọn đối tác, ngày và miền để xem tin.</div>';
        return [];
      }
      const messages = await store.getAll(store.STORES.messages);
      const settlements = await store.getAll(store.STORES.settlements);
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
        return `<div class="report-message" data-message-id="${esc(m.id)}"><div class="row" style="justify-content:space-between"><div><span class="tag ${stateClass}">${esc(row.state.label)}</span> <span class="hint">${esc(m.created_at || '')}</span></div><div class="row"><button class="btn soft" data-reuse-message="${esc(m.id)}">Nạp lại</button>${action}</div></div><div class="raw">${esc(m.raw_text || '')}</div>${reason ? `<div class="status ${stateClass}">${esc(reason)}</div>` : ''}</div>`;
      }).join('');
      host.querySelectorAll('[data-reuse-message]').forEach(btn => btn.addEventListener('click', () => {
        const row = rows.find(x => x.message.id === btn.dataset.reuseMessage);
        const text = doc.getElementById('messageText');
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
        if (typeof global.confirm === 'function' && !global.confirm(`Hủy tin này khỏi tính tiền?\n\n${row.message.raw_text || ''}\n\nTin vẫn được giữ trong lịch sử và có thể khôi phục.`)) return;
        setStatus('Đang hủy tin và tính lại phạm vi…', 'warn');
        try {
          const result = await pipeline.cancelMessage(id);
          setStatus(result.settlement && result.settlement.status === 'empty' ? 'Đã hủy tin. Phạm vi hiện không còn tin đang tính.' : 'Đã hủy tin và tính lại phạm vi.', 'ok');
          await refresh();
        } catch (error) { setStatus(`Hủy tin lỗi: ${String(error && error.message || error)}`, 'err'); }
      }));
      host.querySelectorAll('[data-restore-message]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.restoreMessage;
        setStatus('Đang khôi phục tin và tính lại phạm vi…', 'warn');
        try {
          await pipeline.restoreMessage(id);
          setStatus('Đã khôi phục tin và tính lại phạm vi.', 'ok');
          await refresh();
        } catch (error) { setStatus(`Khôi phục tin lỗi: ${String(error && error.message || error)}`, 'err'); }
      }));
      const activeCount = rows.filter(row => row.state.code !== 'CANCELLED').length;
      const cancelledCount = rows.length - activeCount;
      setStatus(`${activeCount} tin đang tính${cancelledCount ? ` · ${cancelledCount} tin đã hủy` : ''} · ${scope.region.toUpperCase()} ${scope.business_date}.`, 'ok');
      return rows;
    }

    async function recalc() {
      const scope = currentScope();
      if (!scope.partner_id) return setStatus('Chưa chọn đối tác.', 'err');
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
    for (const button of doc.querySelectorAll('.nav button[data-pane="message"]')) {
      button.addEventListener('click', () => refresh().catch(() => {}));
    }
  }

  global.KTS_SETTLEMENT_MESSAGE_HISTORY = Object.freeze({ version: 'message-history-v2-soft-cancel', scopeMatch, deriveState, buildRows });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
