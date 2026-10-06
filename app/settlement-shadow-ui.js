(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function money(v) {
    const n = Number(v);
    return Number.isFinite(n) ? new Intl.NumberFormat('vi-VN',{maximumFractionDigits:6}).format(n) : '—';
  }
  function when(v) {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toLocaleString('vi-VN') : String(v);
  }
  function value(id) { const el = global.document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function status(text, kind) { const el=global.document.getElementById('shadowStatus'); if(!el)return; el.textContent=text||''; el.className='status '+(kind||''); }
  function fieldLabel(field) {
    return ({total_xac:'XÁC',total_qua_co:'QUA CÒ',total_payout:'TRẢ TRÚNG',refund_amount:'HỒI',final_net:'THU/BÙ',xac:'XÁC',qua_co:'QUA CÒ',hit_units:'TRÚNG',payout:'TRẢ'})[field] || field;
  }

  function install() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!pane || !runtime || doc.getElementById('shadowPanel')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'shadowPanel';
    card.innerHTML = `
      <div class="section-title">Đối chiếu HIOSKT · Shadow</div>
      <div class="hint">Nhập số HIOSKT cho đúng khách/ngày/miền. Chỉ <b>khớp chính xác</b> đủ XÁC + QUA CÒ + TRẢ TRÚNG + THU/BÙ mới đủ điều kiện promotion. Khớp số hiển thị 1 số lẻ chưa được xem là đủ.</div>
      <div class="grid3" style="margin-top:8px">
        <div><label>Miền</label><select id="shadowRegion"><option value="mn">Miền Nam</option><option value="mt">Miền Trung</option><option value="mb">Miền Bắc</option></select></div>
        <div><label>XÁC HIOSKT</label><input id="shadowXac" inputmode="decimal"></div>
        <div><label>QUA CÒ HIOSKT</label><input id="shadowQuaCo" inputmode="decimal"></div>
        <div><label>TRẢ TRÚNG HIOSKT</label><input id="shadowPayout" inputmode="decimal"></div>
        <div><label>HỒI HIOSKT (nếu có)</label><input id="shadowRefund" inputmode="decimal"></div>
        <div><label>THU/BÙ cuối HIOSKT</label><input id="shadowFinal" inputmode="decimal"></div>
      </div>
      <details style="margin-top:8px"><summary class="hint">Chi tiết category HIOSKT (tùy chọn nhưng nên nhập khi có lệch)</summary>
        <label style="margin-top:8px">JSON array, ví dụ [{"code":"DAT","xac":72,"qua_co":54.72,"hit_units":4,"payout":3000}]</label>
        <textarea id="shadowCategories" style="min-height:90px" placeholder='[{"code":"DAT","xac":72,"qua_co":54.72,"hit_units":4,"payout":3000}]'></textarea>
      </details>
      <div class="row" style="margin-top:8px"><button id="shadowCompare" class="btn primary">So với HIOSKT + lưu</button><button id="shadowLoad" class="btn soft">Nạp lần đối chiếu đã lưu</button><button id="shadowHistoryLoad" class="btn soft">Lịch sử đối chiếu</button></div>
      <div class="row" style="margin-top:8px"><button id="shadowPinRegression" class="btn soft">Ghim case regression</button><button id="shadowRunRegression" class="btn soft">Kiểm tra case đã ghim</button><button id="shadowExportRegression" class="btn soft">Xuất case CI</button></div>
      <div id="shadowStatus" class="status"></div>
      <div id="shadowRegressionStatus" class="status"></div>
      <div id="shadowRegressionOutput" class="hint"></div>
      <div id="shadowOutput" class="hint"></div>
      <details id="shadowHistoryPanel" style="margin-top:8px"><summary class="hint"><b>Lịch sử Shadow / evidence</b> · append-only</summary><div id="shadowHistoryOutput" class="hint" style="margin-top:7px">Chưa tải lịch sử.</div></details>`;
    pane.appendChild(card);

    function scope() {
      const partner = doc.getElementById('reportPartner');
      const date = doc.getElementById('reportDate');
      if (!partner || !partner.value) throw new Error('Chưa chọn đối tác ở phần Báo cáo.');
      if (!date || !date.value) throw new Error('Chưa chọn ngày ở phần Báo cáo.');
      return { partner_id: partner.value, business_date: date.value, region: value('shadowRegion') };
    }

    function regressionStatus(text, kind) {
      const el = doc.getElementById('shadowRegressionStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function renderDiagnostics(diagnostics) {
      if (!diagnostics) return '';
      if (diagnostics.category_reference_missing && diagnostics.status === 'MISMATCH') {
        return '<div class="status warn">Đã thấy lệch tổng nhưng chưa có chi tiết category HIOSKT. Nhập category để hệ thống chỉ đúng loại cược/tin gây lệch.</div>';
      }
      if (!diagnostics.category_issues || !diagnostics.category_issues.length) return '';
      return `<div class="status err">Khoanh vùng lệch:</div>${diagnostics.category_issues.map(issue => {
        const fields = (issue.fields || []).map(f => `${esc(fieldLabel(f.field))}: KTS ${money(f.local)} · HIOSKT ${money(f.reference)} · lệch ${money(f.delta)}`).join('<br>');
        const messages = (issue.messages || []).length
          ? `<div style="margin-top:5px"><b>Tin liên quan:</b>${issue.messages.map(m => `<div class="raw" style="margin-top:4px">${esc(m.raw_text || m.id)}</div>`).join('')}</div>`
          : '<div class="hint" style="margin-top:5px">Chưa ánh xạ được tin cụ thể; xem category và detail rows.</div>';
        return `<div class="report-message"><div><b>${esc(issue.code)}</b> <span class="tag err">${esc(issue.status)}</span></div><div class="hint" style="margin-top:4px">${fields}</div>${messages}</div>`;
      }).join('')}`;
    }

    function render(comparison, diagnostics) {
      const out = doc.getElementById('shadowOutput');
      if (!comparison) { out.innerHTML=''; return; }
      const cls = comparison.status === 'MATCH_EXACT' ? 'ok' : comparison.status === 'MISMATCH' ? 'err' : 'warn';
      const labels = {
        MATCH_EXACT:'KHỚP CHÍNH XÁC', MATCH_DISPLAY_ONLY:'CHỈ KHỚP SỐ HIỂN THỊ', MISMATCH:'LỆCH TIỀN', INCOMPLETE_REFERENCE:'THIẾU SỐ HIOSKT'
      };
      const rows=[];
      for(const [field,r] of Object.entries(comparison.totals||{})) rows.push(`<tr><td>${esc(fieldLabel(field))}</td><td>${money(r.local)}</td><td>${money(r.reference)}</td><td>${money(r.delta)}</td><td>${esc(r.status)}</td></tr>`);
      const categoryRows=(comparison.categories||[]).map(c=>{
        const bad=Object.entries(c.fields||{}).filter(([,r])=>r.status!=='MATCH_EXACT').map(([field,r])=>`${esc(fieldLabel(field))}: ${money(r.local)} / ${money(r.reference)} (${money(r.delta)})`).join('<br>');
        return `<tr><td>${esc(c.code)}</td><td>${esc(c.status)}</td><td>${bad||'—'}</td></tr>`;
      }).join('');
      out.innerHTML=`<div class="status ${cls}">${esc(labels[comparison.status]||comparison.status)}${comparison.safe_to_promote?' · ĐỦ ĐIỀU KIỆN SHADOW':' · CHƯA ĐỦ ĐIỀU KIỆN'}</div>`+
        `<div class="result-grid"><table><thead><tr><th>Trường</th><th>KTS</th><th>HIOSKT</th><th>Lệch</th><th>Trạng thái</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`+
        (categoryRows ? `<details open style="margin-top:7px"><summary class="hint"><b>So category</b></summary><div class="result-grid"><table><thead><tr><th>Loại</th><th>Trạng thái</th><th>Trường lệch</th></tr></thead><tbody>${categoryRows}</tbody></table></div></details>` : '')+
        renderDiagnostics(diagnostics);
    }

    function renderHistory(events) {
      const host = doc.getElementById('shadowHistoryOutput');
      if (!host) return;
      const rows = Array.isArray(events) ? events.slice().reverse() : [];
      if (!rows.length) {
        host.innerHTML = '<div class="hint">Chưa có evidence đối chiếu cho scope này.</div>';
        return;
      }
      host.innerHTML = `<div class="hint">${rows.length} mốc evidence. Các lần tự tính lại giống hệt liên tiếp được khử trùng để không phình lịch sử.</div>` + rows.slice(0, 30).map((event, index) => {
        const comp = event.comparison || {};
        const local = event.local_snapshot && event.local_snapshot.settlement_result || {};
        const ref = event.reference_snapshot && event.reference_snapshot.totals || {};
        const finalCmp = comp.totals && comp.totals.final_net || null;
        const cls = event.comparison_status === 'MATCH_EXACT' ? 'ok' : event.comparison_status === 'MISMATCH' ? 'err' : 'warn';
        const verify = event.local_snapshot && event.local_snapshot.result_verification_status || 'unverified';
        return `<div class="report-message"><div class="row" style="justify-content:space-between"><div><b>#${rows.length-index}</b> <span class="tag ${cls}">${esc(event.comparison_status)}</span> <span class="tag">${esc(event.trigger || 'UNKNOWN')}</span></div><span class="hint">${esc(when(event.observed_at))}</span></div>`+
          `<div class="hint" style="margin-top:4px">THU/BÙ KTS <b>${money(local.final_net)}</b> · HIOSKT <b>${money(ref.final)}</b> · lệch <b>${money(finalCmp && finalCmp.delta)}</b> · KQXS ${esc(verify)} · engine ${esc(event.local_snapshot && event.local_snapshot.engine_version || '—')} · config v${esc(event.local_snapshot && event.local_snapshot.config_version == null ? '—' : event.local_snapshot.config_version)}</div>`+
          `${event.reason ? `<div class="hint">Lý do: ${esc(event.reason)}</div>` : ''}</div>`;
      }).join('');
    }

    function renderRegressionRun(summary) {
      const host = doc.getElementById('shadowRegressionOutput');
      if (!host) return;
      if (!summary || !summary.total) {
        host.innerHTML = '<div class="hint">Chưa có case regression nào được ghim trên máy này.</div>';
        return;
      }
      host.innerHTML = summary.results.map(row => {
        const c = row.case || {};
        const s = c.scope || {};
        const cls = row.pass ? 'ok' : 'err';
        const label = row.pass ? 'PASS' : 'FAIL';
        const detail = row.error || (row.comparison ? row.comparison.status : 'UNKNOWN');
        return `<div class="report-message"><span class="tag ${cls}">${label}</span> <b>${esc(s.business_date || '')} ${esc(String(s.region || '').toUpperCase())}</b> · ${esc(c.id || '')}<div class="hint">${esc(detail)}</div></div>`;
      }).join('');
    }

    async function loadDiagnostics(s) {
      if (typeof runtime.getDiagnostics !== 'function') return null;
      try {
        const loaded = await runtime.getDiagnostics(s);
        return loaded && loaded.diagnostics || null;
      } catch (_) { return null; }
    }

    async function refreshHistory(s) {
      if (typeof runtime.getHistory !== 'function') return [];
      const events = await runtime.getHistory(s);
      renderHistory(events);
      return events;
    }

    doc.getElementById('shadowCompare').addEventListener('click', async () => {
      try {
        const s=scope();
        let categories=[];
        const raw=value('shadowCategories');
        if(raw){ categories=JSON.parse(raw); if(!Array.isArray(categories)) throw new Error('Category JSON phải là array.'); }
        const result=await runtime.compareAndSave(Object.assign({},s,{
          trigger:'MANUAL_COMPARE',
          reason:'operator:shadow-ui',
          reference_snapshot:{source:'HIOSKT_MANUAL',totals:{xac:value('shadowXac'),qua_co:value('shadowQuaCo'),payout:value('shadowPayout'),hoi:value('shadowRefund'),final:value('shadowFinal')},categories}
        }));
        const diagnostics=await loadDiagnostics(s);
        render(result.comparison, diagnostics);
        await refreshHistory(s).catch(() => {});
        status(result.comparison.safe_to_promote?'Đã lưu đối chiếu exact. Scope này đạt gate shadow hiện tại.':'Đã lưu đối chiếu. Chưa được promotion nếu còn thiếu/khớp hiển thị/lệch.',result.comparison.safe_to_promote?'ok':result.comparison.status==='MISMATCH'?'err':'warn');
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:shadow-saved', { detail: Object.assign({}, s, { comparison_status: result.comparison.status }) }));
        }
      }catch(e){status(String(e.message||e),'err');}
    });

    doc.getElementById('shadowLoad').addEventListener('click', async () => {
      try {
        const s=scope();
        const saved=await runtime.getComparison(s);
        if(!saved||!saved.reference){status('Chưa có đối chiếu HIOSKT đã lưu cho scope này.','warn');render(null);await refreshHistory(s).catch(()=>{});return;}
        const t=saved.reference.totals||{};
        doc.getElementById('shadowXac').value=t.xac==null?'':t.xac;
        doc.getElementById('shadowQuaCo').value=t.qua_co==null?'':t.qua_co;
        doc.getElementById('shadowPayout').value=t.payout==null?'':t.payout;
        doc.getElementById('shadowRefund').value=t.hoi==null?'':t.hoi;
        doc.getElementById('shadowFinal').value=t.final==null?'':t.final;
        doc.getElementById('shadowCategories').value=saved.reference.categories&&saved.reference.categories.length?JSON.stringify(saved.reference.categories,null,2):'';
        const diagnostics=await loadDiagnostics(s);
        render(saved.comparison, diagnostics);
        await refreshHistory(s).catch(() => {});
        status('Đã nạp lần đối chiếu đã lưu.','ok');
      }catch(e){status(String(e.message||e),'err');}
    });

    doc.getElementById('shadowHistoryLoad').addEventListener('click', async () => {
      try {
        const s = scope();
        const events = await refreshHistory(s);
        const panel = doc.getElementById('shadowHistoryPanel');
        if (panel) panel.open = true;
        status(events.length ? `Đã nạp ${events.length} mốc evidence Shadow.` : 'Scope này chưa có lịch sử Shadow.', events.length ? 'ok' : 'warn');
      } catch (e) { status(String(e.message || e), 'err'); }
    });

    doc.getElementById('shadowPinRegression').addEventListener('click', async () => {
      try {
        if (!regression) throw new Error('REGRESSION_MODULE_NOT_LOADED');
        const s = scope();
        const events = await runtime.getHistory(s);
        if (!events.length) throw new Error('Chưa có evidence Shadow để ghim.');
        const event = events[events.length - 1];
        const c = await regression.caseFromEvidence(event, { note:'Pinned from Shadow UI' });
        await regression.pinCase(c);
        const replay = regression.replayCase(c);
        regressionStatus(`Đã ghim ${c.id}. Replay hiện tại: ${replay.pass ? 'PASS' : 'FAIL ' + replay.comparison.status}.`, replay.pass ? 'ok' : 'warn');
      } catch (e) { regressionStatus(String(e.message || e), 'err'); }
    });

    doc.getElementById('shadowRunRegression').addEventListener('click', async () => {
      try {
        if (!regression) throw new Error('REGRESSION_MODULE_NOT_LOADED');
        const summary = await regression.runPinnedCases();
        renderRegressionRun(summary);
        regressionStatus(summary.total ? `${summary.passed}/${summary.total} case regression PASS.` : 'Chưa có case regression đã ghim.', summary.total && summary.failed === 0 ? 'ok' : 'warn');
      } catch (e) { regressionStatus(String(e.message || e), 'err'); }
    });

    doc.getElementById('shadowExportRegression').addEventListener('click', async () => {
      try {
        if (!regression) throw new Error('REGRESSION_MODULE_NOT_LOADED');
        const cases = await regression.listPinnedCases();
        if (!cases.length) throw new Error('Chưa có case regression đã ghim để xuất.');
        const bundle = regression.exportBundle(cases);
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
        a.href = url;
        a.download = `kts-shadow-regression-${stamp}.json`;
        doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        regressionStatus(`Đã xuất ${cases.length} case. File này có thể đưa vào bộ CI regression.`, 'ok');
      } catch (e) { regressionStatus(String(e.message || e), 'err'); }
    });
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
