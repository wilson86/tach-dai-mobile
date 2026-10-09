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
    const pipeline = global.KTS_SETTLEMENT_PIPELINE;
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

    let backupBusy = false;
    const setBackupBusy = value => {
      backupBusy = Boolean(value);
      for (const id of ['settlementExportBackup','settlementImportBackup','settlementImportFile']) {
        const el = doc.getElementById(id);
        if (el) el.disabled = backupBusy;
      }
    };

    const status = (text, kind) => {
      const el = doc.getElementById('settlementBackupStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    };
    const scopeKey = scope => `${scope.partner_id}:${scope.business_date}:${scope.region}`;
    const validScope = scope => Boolean(
      scope && scope.partner_id &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date || '')) &&
      ['mn','mt','mb'].includes(String(scope.region || '').toLowerCase())
    );

    async function recalculateImportedScopes(payload) {
      if (!pipeline || typeof pipeline.settleScope !== 'function') throw new Error('IMPORT_RECALC_PIPELINE_UNAVAILABLE');
      const stores = payload && payload.stores || {};
      const incomingMessages = Array.isArray(stores[store.STORES.messages]) ? stores[store.STORES.messages] : [];
      const incomingSettlements = Array.isArray(stores[store.STORES.settlements]) ? stores[store.STORES.settlements] : [];
      const incomingResults = Array.isArray(stores[store.STORES.results]) ? stores[store.STORES.results] : [];
      const incomingConfigs = Array.isArray(stores[store.STORES.configs]) ? stores[store.STORES.configs] : [];

      const directScopes = new Set();
      for (const row of incomingMessages) {
        if (String(row && row.status || '').toLowerCase() === 'cancelled') continue;
        const scope = {
          partner_id:String(row && row.partner_id || ''),
          business_date:String(row && row.business_date || ''),
          region:String(row && row.region || '').toLowerCase()
        };
        if (validScope(scope)) directScopes.add(scopeKey(scope));
      }
      for (const row of incomingSettlements) {
        if (String(row && row.scope_status || '').toLowerCase() === 'empty') continue;
        const scope = {
          partner_id:String(row && row.partner_id || ''),
          business_date:String(row && row.business_date || ''),
          region:String(row && row.region || '').toLowerCase()
        };
        if (validScope(scope)) directScopes.add(scopeKey(scope));
      }

      const resultScopes = new Set(incomingResults.map(row =>
        `${String(row && row.business_date || '')}:${String(row && row.region || '').toLowerCase()}`
      ));
      const configStarts = new Map();
      for (const row of incomingConfigs) {
        const partnerId=String(row && row.partner_id || '');
        const start=String(row && (row.effective_from_date || row.effective_from) || '').slice(0,10);
        if(!partnerId || !/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
        if(!configStarts.has(partnerId)) configStarts.set(partnerId,[]);
        configStarts.get(partnerId).push(start);
      }

      const allMessages = await store.getAll(store.STORES.messages);
      const scopes = new Map();
      for (const message of allMessages) {
        if (String(message && message.status || '').toLowerCase() === 'cancelled') continue;
        const scope = {
          partner_id:String(message && message.partner_id || ''),
          business_date:String(message && message.business_date || ''),
          region:String(message && message.region || '').toLowerCase()
        };
        if (!validScope(scope)) continue;
        const direct = directScopes.has(scopeKey(scope));
        const resultChanged = resultScopes.has(`${scope.business_date}:${scope.region}`);
        const starts = configStarts.get(scope.partner_id) || [];
        const configChanged = starts.some(start => scope.business_date >= start);
        if (direct || resultChanged || configChanged) scopes.set(scopeKey(scope), scope);
      }

      let blocked = 0;
      for (const scope of scopes.values()) {
        let outcome;
        try {
          outcome = await pipeline.settleScope(scope);
        } catch (error) {
          blocked += 1;
          // Re-read rather than reuse the pre-import loop snapshot: another
          // tab may have edited, cancelled or added a bet since that read.
          const currentMessages = (await store.getAll(store.STORES.messages)).filter(message =>
            String(message && message.status || '').toLowerCase() !== 'cancelled' &&
            String(message && message.partner_id || '') === scope.partner_id &&
            String(message && message.business_date || '') === scope.business_date &&
            String(message && message.region || '').toLowerCase() === scope.region
          );
          const reason = 'IMPORT_RECALC_FAILED:' + String(error && error.message || error);
          const zero = {
            scope_status:'blocked', blocked:true, blocked_reasons:[reason],
            total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0,
            direction:'HOA',category_totals:{},category_rows:[],detail_rows:[],message_breakdown:[]
          };
          // Never clobber another tab's newer monetary settlement on the
          // exceptional recovery path. The normal pipeline already uses
          // the same cross-store atomic revalidation contract.
          if (typeof store.saveSettlementIfScopeUnchanged !== 'function')
            throw new Error('IMPORT_RECALC_ATOMIC_BLOCK_REQUIRED');
          const [config, result, partner, priorSettlement] = await Promise.all([
            store.resolveConfigForDate(scope.partner_id, scope.business_date).catch(() => null),
            store.get(store.STORES.results, `${scope.business_date}:${scope.region}`),
            store.get(store.STORES.partners, scope.partner_id),
            store.get(store.STORES.settlements,
              `scope:${scope.partner_id}:${scope.business_date}:${scope.region}`)
          ]);
          const attempted = await store.saveSettlementIfScopeUnchanged({
            id:`scope:${scope.partner_id}:${scope.business_date}:${scope.region}`,
            partner_id:scope.partner_id,
            message_ids:currentMessages.map(message => message.id),
            business_date:scope.business_date,
            region:scope.region,
            config_snapshot:null,
            lottery_result_snapshot:null,
            result_snapshot:zero,
            settlement_result:zero,
            detail_rows:[],
            category_rows:[],
            message_breakdown:[],
            scope_status:'blocked',
            blocked_reasons:[reason],
            comparison_status:'blocked'
          }, { messages:currentMessages, config, result, partner, settlement:priorSettlement });
          if (!attempted || attempted.superseded || !attempted.saved)
            throw new Error('IMPORT_RECALC_BLOCK_SUPERSEDED:' + scopeKey(scope));
        }
        // A superseded calculation has committed nothing; it is never a
        // successful recalculation and must not be masked by fallback writes.
        if (outcome && outcome.status === 'blocked') blocked += 1;
        if (outcome && (!['blocked','empty','complete_unverified','provisional']
          .includes(outcome.status) || !outcome.settlement))
          throw new Error('IMPORT_RECALC_SCOPE_NOT_COMMITTED:' + scopeKey(scope));
      }
      return { scope_count:scopes.size, blocked_count:blocked };
    }


    doc.getElementById('settlementExportBackup').addEventListener('click', async () => {
      if (backupBusy) return status('Một thao tác sao lưu/khôi phục đang chạy. Chờ hoàn tất rồi thử lại.', 'warn');
      setBackupBusy(true);
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
      } finally {
        setBackupBusy(false);
      }
    });

    doc.getElementById('settlementImportBackup').addEventListener('click', async () => {
      if (backupBusy) return status('Một thao tác sao lưu/khôi phục đang chạy. Chờ hoàn tất rồi thử lại.', 'warn');
      const input = doc.getElementById('settlementImportFile');
      const file = input && input.files && input.files[0];
      if (!file) return status('Chọn file backup JSON trước.', 'warn');
      setBackupBusy(true);
      let backupCommitted=false;
      try {
        status('Đang kiểm tra và khôi phục backup…', '');
        const text = await file.text();
        const payload = JSON.parse(text);
        if (!pipeline || typeof pipeline.settleScope !== 'function') throw new Error('IMPORT_RECALC_PIPELINE_UNAVAILABLE');
        const validation = await store.importAll(payload, { replace: false });
        backupCommitted=true;
        status('Đã gộp dữ liệu · đang tính lại các phạm vi bị ảnh hưởng…', 'warn');
        const recalculated = await recalculateImportedScopes(payload);
        const inserted = Object.values(validation.inserted_counts || validation.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
        const skipped = Object.values(validation.skipped_existing_counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
        const suffix = recalculated.blocked_count
          ? ` · ${recalculated.blocked_count} phạm vi đang bị chặn, chưa dùng để chốt`
          : '';
        status(`Đã gộp backup an toàn · thêm ${inserted} bản ghi mới${skipped ? ` · giữ nguyên ${skipped} bản ghi đã có trên máy` : ''} · đã tính lại ${recalculated.scope_count} phạm vi${suffix}. Tải lại trang để cập nhật danh sách.`, recalculated.blocked_count ? 'warn' : 'ok');
      } catch (e) {
        const reason=String(e && e.message || e);
        if(backupCommitted){
          // ImportAll already COMMITTED; reporting "not restored" would
          // mislead the operator into repeating an import with partial recalc.
          status('ĐÃ GỘP dữ liệu backup, nhưng tính lại settlement chưa hoàn tất: '+
            reason+'. Không chốt tiền; kiểm tra phạm vi bị chặn trước khi thao tác tiếp.', 'err');
        }else if(reason.startsWith('IMPORT_PROTECTED_EVIDENCE_COLLISION:')){
          status('KHÔNG gộp backup: bằng chứng xác nhận HIOSKT hoặc lịch sử QA '+
            'khác với dữ liệu đang lưu. Không có dữ liệu nào bị ghi đè. '+
            'Xuất backup hiện tại để đối chiếu thủ công trước khi khôi phục.', 'err');
        }else{
          status('KHÔNG khôi phục: '+reason, 'err');
        }
      } finally {
        setBackupBusy(false);
      }
    });
  }

  global.KTS_SETTLEMENT_BACKUP_UI = Object.freeze({ version: 'settlement-backup-ui-v6-atomic-import-recalc', filename });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
