(function (global) {
  'use strict';

  const HEADER_ALIASES = Object.freeze({
    business_date: ['business_date', 'date', 'ngay'],
    partner: ['partner', 'partner_id', 'partner_name', 'doi_tac'],
    region: ['region', 'mien'],
    xac: ['xac'],
    qua_co: ['qua_co', 'qua'],
    payout: ['payout', 'tra_trung', 'tra'],
    hoi: ['hoi', 'refund'],
    final: ['final', 'thu_bu', 'thubu']
  });
  const REQUIRED = Object.freeze(['business_date', 'partner', 'region', 'xac', 'qua_co', 'payout', 'final']);

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  function settlementFingerprint(store, settlement) {
    const s = settlement || {};
    const core = {
      id: s.id || null,
      updated_at: s.updated_at || null,
      scope_status: s.scope_status || null,
      engine_version: s.engine_version || null,
      config_snapshot: s.config_snapshot || null,
      lottery_result_snapshot: s.lottery_result_snapshot || null,
      settlement_result: s.settlement_result || s.result_snapshot || null,
      category_rows: s.category_rows || [],
      message_ids: s.message_ids || (s.message_id ? [s.message_id] : [])
    };
    return store && typeof store.stableStringify === 'function' ? store.stableStringify(core) : stableStringify(core);
  }
  function cleanHeader(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function canonicalHeader(v) {
    const key = cleanHeader(v);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) return canonical;
    }
    return null;
  }
  function normalizeRegion(v) {
    const r = String(v || '').trim().toLowerCase();
    if (['mn', 'mt', 'mb'].includes(r)) return r;
    throw new Error('BATCH_REGION_REQUIRED:' + String(v || ''));
  }
  function decimalString(v, field) {
    if (v == null || String(v).trim() === '') {
      if (field === 'hoi') return '0';
      throw new Error('BATCH_TOTAL_REQUIRED:' + field);
    }
    const s = String(v).trim();
    if (s.includes(',')) throw new Error('BATCH_DECIMAL_COMMA_UNSUPPORTED:' + field);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) throw new Error('BATCH_TOTAL_INVALID:' + field);
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error('BATCH_TOTAL_INVALID:' + field);
    return s;
  }

  function parseJson(raw) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('BATCH_JSON_ARRAY_REQUIRED');
    return parsed.map((row, index) => Object.assign({ _row: index + 1 }, row || {}));
  }

  function parseTsv(raw) {
    const lines = String(raw || '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error('BATCH_TSV_HEADER_AND_ROWS_REQUIRED');
    const rawHeaders = lines[0].split('\t');
    const headers = rawHeaders.map(canonicalHeader);
    for (const required of REQUIRED) {
      if (!headers.includes(required)) throw new Error('BATCH_HEADER_REQUIRED:' + required);
    }
    const seen = new Set();
    for (const header of headers.filter(Boolean)) {
      if (seen.has(header)) throw new Error('BATCH_HEADER_DUPLICATE:' + header);
      seen.add(header);
    }
    return lines.slice(1).map((line, index) => {
      const cells = line.split('\t');
      const row = { _row: index + 2 };
      headers.forEach((header, i) => { if (header) row[header] = cells[i] == null ? '' : cells[i].trim(); });
      return row;
    });
  }

  function parseInput(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('BATCH_INPUT_REQUIRED');
    return text.startsWith('[') ? parseJson(text) : parseTsv(text);
  }

  function partnerToken(row) {
    return row.partner != null ? row.partner : row.partner_id != null ? row.partner_id : row.partner_name;
  }
  function resolvePartner(partners, token) {
    const q = String(token || '').trim();
    if (!q) throw new Error('BATCH_PARTNER_REQUIRED');
    const byId = (partners || []).filter(p => String(p.id || '') === q);
    if (byId.length === 1) return byId[0];
    const lower = q.toLocaleLowerCase('vi-VN');
    const byName = (partners || []).filter(p => String(p.name || '').trim().toLocaleLowerCase('vi-VN') === lower);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) throw new Error('BATCH_PARTNER_AMBIGUOUS:' + q);
    throw new Error('BATCH_PARTNER_NOT_FOUND:' + q);
  }

  function normalizeRow(row, partners) {
    const businessDate = String(row.business_date != null ? row.business_date : row.date != null ? row.date : row.ngay || '').slice(0, 10);
    if (!validDate(businessDate)) throw new Error('BATCH_DATE_REQUIRED');
    const partner = resolvePartner(partners, partnerToken(row));
    const region = normalizeRegion(row.region != null ? row.region : row.mien);
    const totalsIn = row.totals && typeof row.totals === 'object' ? row.totals : row;
    const totals = {
      xac: decimalString(totalsIn.xac, 'xac'),
      qua_co: decimalString(totalsIn.qua_co != null ? totalsIn.qua_co : totalsIn.qua, 'qua_co'),
      payout: decimalString(totalsIn.payout != null ? totalsIn.payout : totalsIn.tra_trung != null ? totalsIn.tra_trung : totalsIn.tra, 'payout'),
      hoi: decimalString(totalsIn.hoi != null ? totalsIn.hoi : totalsIn.refund, 'hoi'),
      final: decimalString(totalsIn.final != null ? totalsIn.final : totalsIn.thu_bu != null ? totalsIn.thu_bu : totalsIn.thubu, 'final')
    };
    const categories = row.categories == null ? [] : clone(row.categories);
    if (!Array.isArray(categories)) throw new Error('BATCH_CATEGORIES_ARRAY_REQUIRED');
    return {
      row_number: Number(row._row || 0),
      partner_id: String(partner.id),
      partner_name: String(partner.name || partner.id),
      business_date: businessDate,
      region,
      reference_snapshot: {
        source: 'HIOSKT_BATCH',
        totals,
        categories
      }
    };
  }

  function scopeId(row) { return `scope:${row.partner_id}:${row.business_date}:${row.region}`; }
  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const shadow = global.KTS_SETTLEMENT_SHADOW;
    if (!store || !runtime || !shadow) throw new Error('BATCH_DEPENDENCY_MISSING');
    return { store, runtime, shadow };
  }

  async function preview(raw) {
    const d = deps();
    const partners = await d.store.getAll(d.store.STORES.partners);
    const parsed = parseInput(raw);
    if (!parsed.length) throw new Error('BATCH_ROWS_REQUIRED');
    const rows = [];
    const errors = [];
    const scopeSeen = new Set();
    for (const source of parsed) {
      try {
        const row = normalizeRow(source, partners);
        const id = scopeId(row);
        if (scopeSeen.has(id)) throw new Error('BATCH_SCOPE_DUPLICATE:' + id);
        scopeSeen.add(id);
        const settlement = await d.store.get(d.store.STORES.settlements, id);
        if (!settlement) throw new Error('BATCH_SETTLEMENT_NOT_FOUND:' + id);
        if (String(settlement.scope_status || '').toLowerCase() === 'blocked') throw new Error('BATCH_SETTLEMENT_BLOCKED:' + id);
        const comparison = d.shadow.compareSettlement(settlement, row.reference_snapshot);
        rows.push(Object.assign({}, row, {
          scope_id: id,
          settlement_fingerprint: settlementFingerprint(d.store, settlement),
          comparison: clone(comparison)
        }));
      } catch (error) {
        errors.push({ row_number: Number(source && source._row || 0), error: String(error && error.message || error) });
      }
    }
    return {
      format: 'kts-shadow-batch-preview-v2-stale-guard',
      raw: String(raw || ''),
      previewed_at: new Date().toISOString(),
      rows,
      errors,
      ready: errors.length === 0 && rows.length > 0,
      counts: {
        total: parsed.length,
        ready: rows.length,
        errors: errors.length,
        exact: rows.filter(r => r.comparison && r.comparison.status === 'MATCH_EXACT').length,
        display_only: rows.filter(r => r.comparison && r.comparison.status === 'MATCH_DISPLAY_ONLY').length,
        mismatch: rows.filter(r => r.comparison && r.comparison.status === 'MISMATCH').length,
        incomplete: rows.filter(r => r.comparison && r.comparison.status === 'INCOMPLETE_REFERENCE').length
      }
    };
  }

  async function preflight(previewResult) {
    const d = deps();
    const p = previewResult || {};
    if (!p.ready || !Array.isArray(p.rows) || !p.rows.length) throw new Error('BATCH_PREVIEW_REQUIRED');
    if (Array.isArray(p.errors) && p.errors.length) throw new Error('BATCH_PREVIEW_HAS_ERRORS');
    const checked = [];
    for (const row of p.rows) {
      if (!row.settlement_fingerprint) throw new Error('BATCH_PREVIEW_FINGERPRINT_REQUIRED:' + row.scope_id);
      const current = await d.store.get(d.store.STORES.settlements, row.scope_id);
      if (!current) throw new Error('BATCH_SETTLEMENT_NOT_FOUND:' + row.scope_id);
      if (String(current.scope_status || '').toLowerCase() === 'blocked') throw new Error('BATCH_SETTLEMENT_BLOCKED:' + row.scope_id);
      const currentFingerprint = settlementFingerprint(d.store, current);
      if (currentFingerprint !== row.settlement_fingerprint) throw new Error('BATCH_PREVIEW_STALE_SCOPE:' + row.scope_id);
      checked.push({ scope_id: row.scope_id, settlement_fingerprint: currentFingerprint });
    }
    return checked;
  }

  async function apply(previewResult) {
    const d = deps();
    const p = previewResult || {};
    await preflight(p);
    const results = [];
    for (const row of p.rows) {
      try {
        const saved = await d.runtime.compareAndSave({
          partner_id: row.partner_id,
          business_date: row.business_date,
          region: row.region,
          trigger: 'BATCH_COMPARE',
          reason: 'operator:shadow-batch',
          reference_snapshot: clone(row.reference_snapshot)
        });
        results.push({
          scope_id: row.scope_id,
          partner_id: row.partner_id,
          business_date: row.business_date,
          region: row.region,
          comparison_status: saved && saved.comparison && saved.comparison.status || 'UNKNOWN'
        });
      } catch (error) {
        const e = new Error(`BATCH_APPLY_PARTIAL:${results.length}/${p.rows.length}:${String(error && error.message || error)}`);
        e.applied_results = clone(results);
        e.failed_scope_id = row.scope_id;
        throw e;
      }
    }
    return {
      format: 'kts-shadow-batch-apply-v2-stale-guard',
      total: results.length,
      exact: results.filter(x => x.comparison_status === 'MATCH_EXACT').length,
      display_only: results.filter(x => x.comparison_status === 'MATCH_DISPLAY_ONLY').length,
      mismatch: results.filter(x => x.comparison_status === 'MISMATCH').length,
      results
    };
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function installUi() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('shadowBatchPanel')) return;
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'shadowBatchPanel';
    card.innerHTML = `
      <div class="section-title">Đối chiếu HIOSKT hàng loạt</div>
      <div class="hint">Dán nhiều scope một lần. Hệ thống chỉ cho áp dụng khi <b>toàn bộ dòng preview hợp lệ</b>. Trước khi ghi sẽ kiểm tra lại tất cả scope; nếu KQXS, cấu hình hoặc tiền đã đổi sau preview thì batch bị chặn và phải preview lại. TSV dùng dấu TAB, số thập phân dùng dấu chấm.</div>
      <details style="margin-top:7px"><summary class="hint">Mẫu TSV</summary><div class="raw" style="margin-top:6px">business_date\tpartner\tregion\txac\tqua_co\tpayout\thoi\tfinal\n2026-09-22\tHiền\tmn\t288\t218.88\t4650\t0\t-4431.12</div></details>
      <textarea id="shadowBatchInput" style="min-height:120px;margin-top:8px" placeholder="business_date[TAB]partner[TAB]region[TAB]xac[TAB]qua_co[TAB]payout[TAB]hoi[TAB]final"></textarea>
      <div class="row" style="margin-top:8px"><button id="shadowBatchPreview" class="btn soft">Kiểm tra trước</button><button id="shadowBatchApply" class="btn primary" disabled>Áp dụng toàn bộ</button></div>
      <div id="shadowBatchStatus" class="status"></div><div id="shadowBatchOutput" class="hint"></div>`;
    pane.appendChild(card);
    let lastPreview = null;

    function setStatus(text, kind) {
      const el = doc.getElementById('shadowBatchStatus');
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }
    function render(p) {
      const host = doc.getElementById('shadowBatchOutput');
      const lines = [];
      for (const row of p.rows || []) {
        const st = row.comparison && row.comparison.status || 'UNKNOWN';
        const cls = st === 'MATCH_EXACT' ? 'ok' : st === 'MISMATCH' ? 'err' : 'warn';
        lines.push(`<div class="report-message"><span class="tag ${cls}">${esc(st)}</span> <b>${esc(row.business_date)} ${esc(row.region.toUpperCase())}</b> · ${esc(row.partner_name)}</div>`);
      }
      for (const err of p.errors || []) lines.push(`<div class="report-message"><span class="tag err">LỖI DÒNG ${esc(err.row_number || '?')}</span> ${esc(err.error)}</div>`);
      host.innerHTML = `<div>Scope hợp lệ <b>${p.counts.ready}</b>/${p.counts.total} · exact <b>${p.counts.exact}</b> · lệch <b>${p.counts.mismatch}</b> · chỉ khớp hiển thị <b>${p.counts.display_only}</b>.</div>${lines.join('')}`;
    }

    doc.getElementById('shadowBatchPreview').addEventListener('click', async () => {
      try {
        const raw = doc.getElementById('shadowBatchInput').value;
        lastPreview = await preview(raw);
        render(lastPreview);
        doc.getElementById('shadowBatchApply').disabled = !lastPreview.ready;
        setStatus(lastPreview.ready ? 'Preview hợp lệ. Có thể áp dụng nếu dữ liệu scope không đổi.' : 'Có dòng lỗi; chưa ghi bất kỳ đối chiếu nào.', lastPreview.ready ? 'ok' : 'err');
      } catch (error) {
        lastPreview = null;
        doc.getElementById('shadowBatchApply').disabled = true;
        setStatus(String(error && error.message || error), 'err');
      }
    });

    doc.getElementById('shadowBatchInput').addEventListener('input', () => {
      if (!lastPreview) return;
      if (String(doc.getElementById('shadowBatchInput').value) !== String(lastPreview.raw)) {
        lastPreview = null;
        doc.getElementById('shadowBatchApply').disabled = true;
        setStatus('Nội dung đã thay đổi. Bấm Kiểm tra trước lại.', 'warn');
      }
    });

    doc.getElementById('shadowBatchApply').addEventListener('click', async () => {
      try {
        if (!lastPreview || String(doc.getElementById('shadowBatchInput').value) !== String(lastPreview.raw)) throw new Error('BATCH_PREVIEW_STALE');
        doc.getElementById('shadowBatchApply').disabled = true;
        const result = await apply(lastPreview);
        setStatus(`Đã lưu ${result.total} scope · exact ${result.exact} · lệch ${result.mismatch} · chỉ khớp hiển thị ${result.display_only}.`, result.mismatch ? 'err' : result.display_only ? 'warn' : 'ok');
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:shadow-saved', { detail: { batch: true, results: result.results } }));
        }
        lastPreview = null;
      } catch (error) {
        const message = String(error && error.message || error);
        if (message.includes('BATCH_PREVIEW_STALE_SCOPE') || message.includes('BATCH_APPLY_PARTIAL')) {
          lastPreview = null;
          doc.getElementById('shadowBatchApply').disabled = true;
        }
        setStatus(message, 'err');
      }
    });
  }

  global.KTS_SETTLEMENT_SHADOW_BATCH = Object.freeze({
    version: 'settlement-shadow-batch-v2-stale-guard',
    parseInput,
    resolvePartner,
    normalizeRow,
    scopeId,
    settlementFingerprint,
    preview,
    preflight,
    apply
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else if (global.document) installUi();
})(typeof window !== 'undefined' ? window : globalThis);