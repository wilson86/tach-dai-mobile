(function (global) {
  'use strict';

  function filename() {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const time = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
    return `kts-settlement-backup-${date}-${time}.json`;
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const pane = doc && doc.getElementById('pane-report');
    if (!doc || !store || !pane || doc.getElementById('settlementBackupPanel')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'settlementBackupPanel';
    card.innerHTML = `
      <div class="section-title">Sao lưu dữ liệu kế toán trên điện thoại</div>
      <div class="hint">Backup gồm đối tác, cấu hình theo ngày, tin gốc, KQXS/audit và settlement/shadow đã lưu. Khôi phục chỉ chạy khi bạn chủ động chọn file và bấm nút; mặc định gộp theo ID, không xóa toàn bộ dữ liệu đang có.</div>
      <div class="row" style="margin-top:8px"><button id="settlementExportBackup" class="btn soft">Xuất backup JSON</button></div>
      <div style="margin-top:10px"><label>File backup để khôi phục</label><input id="settlementImportFile" type="file" accept="application/json,.json"></div>
      <div class="row" style="margin-top:8px"><button id="settlementImportBackup" class="btn soft">Khôi phục / gộp backup</button></div>
      <div id="settlementBackupStatus" class="status"></div>`;
    pane.appendChild(card);

    const status = (text, kind) => {
      const el = doc.getElementById('settlementBackupStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    };

    doc.getElementById('settlementExportBackup').addEventListener('click', async () => {
      try {
        status('Đang tạo backup…', '');
        const payload = await store.exportAll();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = filename();
        doc.body.appendChild(a);
        a.click();
        a.remove();
        global.setTimeout(() => URL.revokeObjectURL(url), 1000);
        const total = Object.values(payload.stores || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
        status(`Đã xuất backup ${payload.version} · ${total} bản ghi.`, 'ok');
      } catch (e) {
        status('Xuất backup lỗi: ' + String(e && e.message || e), 'err');
      }
    });

    doc.getElementById('settlementImportBackup').addEventListener('click', async () => {
      const input = doc.getElementById('settlementImportFile');
      const file = input && input.files && input.files[0];
      if (!file) return status('Chọn file backup JSON trước.', 'warn');
      try {
        status('Đang kiểm tra và khôi phục backup…', '');
        const text = await file.text();
        const payload = JSON.parse(text);
        await store.importAll(payload, { replace: false });
        const total = Object.values(payload.stores || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
        status(`Đã gộp backup hợp lệ · ${total} bản ghi. Tải lại trang để mọi danh sách cập nhật.`, 'ok');
      } catch (e) {
        status('KHÔNG khôi phục: ' + String(e && e.message || e), 'err');
      }
    });
  }

  global.KTS_SETTLEMENT_BACKUP_UI = Object.freeze({ version: 'settlement-backup-ui-v1', filename });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
