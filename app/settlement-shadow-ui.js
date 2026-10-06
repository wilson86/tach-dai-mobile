(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function money(v) {
    const n = Number(v);
    return Number.isFinite(n) ? new Intl.NumberFormat('vi-VN',{maximumFractionDigits:6}).format(n) : '—';
  }
  function value(id) { const el = global.document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function status(text, kind) { const el=global.document.getElementById('shadowStatus'); if(!el)return; el.textContent=text||''; el.className='status '+(kind||''); }

  function install() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
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
      <details style="margin-top:8px"><summary class="hint">Chi tiết category HIOSKT (tùy chọn)</summary>
        <label style="margin-top:8px">JSON array, ví dụ [{"code":"DAT","xac":72,"qua_co":54.72,"hit_units":4,"payout":3000}]</label>
        <textarea id="shadowCategories" style="min-height:90px" placeholder='[{"code":"DAT","xac":72,"qua_co":54.72,"hit_units":4,"payout":3000}]'></textarea>
      </details>
      <div class="row" style="margin-top:8px"><button id="shadowCompare" class="btn primary">So với HIOSKT + lưu</button><button id="shadowLoad" class="btn soft">Nạp lần đối chiếu đã lưu</button></div>
      <div id="shadowStatus" class="status"></div>
      <div id="shadowOutput" class="hint"></div>`;
    pane.appendChild(card);

    function scope() {
      const partner = doc.getElementById('reportPartner');
      const date = doc.getElementById('reportDate');
      if (!partner || !partner.value) throw new Error('Chưa chọn đối tác ở phần Báo cáo.');
      if (!date || !date.value) throw new Error('Chưa chọn ngày ở phần Báo cáo.');
      return { partner_id: partner.value, business_date: date.value, region: value('shadowRegion') };
    }

    function render(comparison) {
      const out = doc.getElementById('shadowOutput');
      if (!comparison) { out.innerHTML=''; return; }
      const cls = comparison.status === 'MATCH_EXACT' ? 'ok' : comparison.status === 'MISMATCH' ? 'err' : 'warn';
      const labels = {
        MATCH_EXACT:'KHỚP CHÍNH XÁC', MATCH_DISPLAY_ONLY:'CHỈ KHỚP SỐ HIỂN THỊ', MISMATCH:'LỆCH TIỀN', INCOMPLETE_REFERENCE:'THIẾU SỐ HIOSKT'
      };
      const rows=[];
      for(const [field,r] of Object.entries(comparison.totals||{})) rows.push(`<tr><td>${esc(field)}</td><td>${money(r.local)}</td><td>${money(r.reference)}</td><td>${money(r.delta)}</td><td>${esc(r.status)}</td></tr>`);
      out.innerHTML=`<div class="status ${cls}">${esc(labels[comparison.status]||comparison.status)}${comparison.safe_to_promote?' · ĐỦ ĐIỀU KIỆN SHADOW':' · CHƯA ĐỦ ĐIỀU KIỆN'}</div>`+
        `<table><thead><tr><th>Trường</th><th>KTS</th><th>HIOSKT</th><th>Lệch</th><th>Trạng thái</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }

    doc.getElementById('shadowCompare').addEventListener('click', async () => {
      try {
        const s=scope();
        let categories=[];
        const raw=value('shadowCategories');
        if(raw){ categories=JSON.parse(raw); if(!Array.isArray(categories)) throw new Error('Category JSON phải là array.'); }
        const result=await runtime.compareAndSave(Object.assign({},s,{reference_snapshot:{source:'HIOSKT_MANUAL',totals:{xac:value('shadowXac'),qua_co:value('shadowQuaCo'),payout:value('shadowPayout'),hoi:value('shadowRefund'),final:value('shadowFinal')},categories}}));
        render(result.comparison);
        status(result.comparison.safe_to_promote?'Đã lưu đối chiếu exact. Scope này đạt gate shadow hiện tại.':'Đã lưu đối chiếu. Chưa được promotion nếu còn thiếu/khớp hiển thị/lệch.',result.comparison.safe_to_promote?'ok':result.comparison.status==='MISMATCH'?'err':'warn');
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:shadow-saved', { detail: Object.assign({}, s, { comparison_status: result.comparison.status }) }));
        }
      }catch(e){status(String(e.message||e),'err');}
    });

    doc.getElementById('shadowLoad').addEventListener('click', async () => {
      try {
        const saved=await runtime.getComparison(scope());
        if(!saved||!saved.reference){status('Chưa có đối chiếu HIOSKT đã lưu cho scope này.','warn');render(null);return;}
        const t=saved.reference.totals||{};
        doc.getElementById('shadowXac').value=t.xac==null?'':t.xac;
        doc.getElementById('shadowQuaCo').value=t.qua_co==null?'':t.qua_co;
        doc.getElementById('shadowPayout').value=t.payout==null?'':t.payout;
        doc.getElementById('shadowRefund').value=t.hoi==null?'':t.hoi;
        doc.getElementById('shadowFinal').value=t.final==null?'':t.final;
        doc.getElementById('shadowCategories').value=saved.reference.categories&&saved.reference.categories.length?JSON.stringify(saved.reference.categories,null,2):'';
        render(saved.comparison);
        status('Đã nạp lần đối chiếu đã lưu.','ok');
      }catch(e){status(String(e.message||e),'err');}
    });
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
