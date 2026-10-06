(function(global){
  'use strict';
  const FORMAT='kts-preproduction-review-receipt-v1';
  const MODE='PORTABLE_FINGERPRINT_ONLY';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,bundleApi=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE;
    if(!qualification||typeof qualification.sha256Hex!=='function'||!bundleApi||typeof bundleApi.verifyBundle!=='function')throw new Error('PREPRODUCTION_RECEIPT_DEPENDENCY_MISSING');
    return {qualification,bundleApi};
  }
  function receiptWithoutIntegrity(receipt){const copy=clone(receipt||{});delete copy.integrity;return copy;}
  function authorityValid(a){return Boolean(a&&a.fingerprint_only===true&&a.read_only===true&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.production_approval_recorded===false);}
  function qualificationRefs(bundle){return (bundle&&bundle.qualification_evidence||[]).map(x=>({event_id:String(x&&x.event&&x.event.id||''),event_sha256:String(x&&x.event_sha256||'')})).sort((a,b)=>a.event_id.localeCompare(b.event_id));}
  function packageRefs(bundle){return (bundle&&bundle.index&&bundle.index.packages||[]).map(x=>({package_payload_sha256:String(x.package_payload_sha256||''),source_qualification_event_id:String(x.source_qualification_event_id||'')})).sort((a,b)=>a.package_payload_sha256.localeCompare(b.package_payload_sha256));}
  async function buildReceipt(bundle){
    const {qualification,bundleApi}=deps();const verified=await bundleApi.verifyBundle(bundle);if(!verified.valid)throw new Error('PREPRODUCTION_RECEIPT_BUNDLE_INVALID:'+verified.errors.join('|'));
    const buildIdentity=clone(bundle.exporter_build_identity||null),receipt={
      format:FORMAT,mode:MODE,issued_at:new Date().toISOString(),
      authority:{fingerprint_only:true,read_only:true,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,production_approval_recorded:false},
      bundle:{bundle_sha256:String(bundle.integrity&&bundle.integrity.bundle_sha256||''),event_count:Number(bundle.chain&&bundle.chain.event_count||0),head_event_id:String(bundle.chain&&bundle.chain.head_event_id||''),head_event_sha256:String(bundle.chain&&bundle.chain.head_event_sha256||'')},
      qualification_refs:qualificationRefs(bundle),package_refs:packageRefs(bundle),
      exporter_build_identity_sha256:await qualification.sha256Hex(buildIdentity)
    };
    receipt.integrity={algorithm:'sha256',receipt_sha256:await qualification.sha256Hex(receiptWithoutIntegrity(receipt))};
    const self=await verifyReceipt(receipt);if(!self.valid)throw new Error('PREPRODUCTION_RECEIPT_SELF_VERIFY_FAILED:'+self.errors.join('|'));return receipt;
  }
  async function verifyReceipt(receipt){
    const {qualification}=deps(),errors=[];
    if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return {valid:false,errors:['PREPRODUCTION_RECEIPT_REQUIRED']};
    if(String(receipt.format)!==FORMAT)errors.push('PREPRODUCTION_RECEIPT_FORMAT_INVALID');
    if(String(receipt.mode)!==MODE)errors.push('PREPRODUCTION_RECEIPT_MODE_INVALID');
    if(!authorityValid(receipt.authority))errors.push('PREPRODUCTION_RECEIPT_AUTHORITY_INVALID');
    for(const x of [receipt.bundle&&receipt.bundle.bundle_sha256,receipt.bundle&&receipt.bundle.head_event_sha256,receipt.exporter_build_identity_sha256])if(!SHA256_RE.test(String(x||'')))errors.push('PREPRODUCTION_RECEIPT_REFERENCE_SHA_INVALID');
    for(const q of receipt.qualification_refs||[])if(!q.event_id||!SHA256_RE.test(String(q.event_sha256||'')))errors.push('PREPRODUCTION_RECEIPT_QUALIFICATION_REF_INVALID');
    for(const p of receipt.package_refs||[])if(!SHA256_RE.test(String(p.package_payload_sha256||''))||!p.source_qualification_event_id)errors.push('PREPRODUCTION_RECEIPT_PACKAGE_REF_INVALID');
    const expected=receipt.integrity&&receipt.integrity.receipt_sha256;
    if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_RECEIPT_SHA_INVALID');else if(!same(await qualification.sha256Hex(receiptWithoutIntegrity(receipt)),expected))errors.push('PREPRODUCTION_RECEIPT_SHA_MISMATCH');
    return {valid:errors.length===0,errors,receipt_sha256:String(expected||'')};
  }
  async function verifyReceiptAgainstBundle(receipt,bundle){
    const {qualification,bundleApi}=deps(),errors=[];const r=await verifyReceipt(receipt),b=await bundleApi.verifyBundle(bundle);
    if(!r.valid)errors.push(...r.errors);if(!b.valid)errors.push(...b.errors.map(x=>'BUNDLE:'+x));
    if(r.valid&&b.valid){
      if(!same(receipt.bundle.bundle_sha256,bundle.integrity.bundle_sha256))errors.push('PREPRODUCTION_RECEIPT_BUNDLE_SHA_MISMATCH');
      if(Number(receipt.bundle.event_count)!==Number(bundle.chain.event_count)||!same(receipt.bundle.head_event_id,bundle.chain.head_event_id)||!same(receipt.bundle.head_event_sha256,bundle.chain.head_event_sha256))errors.push('PREPRODUCTION_RECEIPT_CHAIN_HEAD_MISMATCH');
      if(await qualification.sha256Hex(receipt.qualification_refs)!==await qualification.sha256Hex(qualificationRefs(bundle)))errors.push('PREPRODUCTION_RECEIPT_QUALIFICATION_REFS_MISMATCH');
      if(await qualification.sha256Hex(receipt.package_refs)!==await qualification.sha256Hex(packageRefs(bundle)))errors.push('PREPRODUCTION_RECEIPT_PACKAGE_REFS_MISMATCH');
      if(!same(receipt.exporter_build_identity_sha256,await qualification.sha256Hex(bundle.exporter_build_identity||null)))errors.push('PREPRODUCTION_RECEIPT_BUILD_IDENTITY_MISMATCH');
    }
    return {valid:errors.length===0,errors,receipt:r,bundle:b};
  }
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionReceiptPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionReceiptPanel';card.innerHTML=`<div class="section-title">Portable evidence receipt</div><div class="hint">Receipt chỉ chứa fingerprint của bundle/chain/qualification/package/build identity. Không chứa settlement, KQXS hay review payload và không cấp quyền production.</div><div style="margin-top:8px"><label>Portable bundle JSON</label><input id="preproductionReceiptBundle" type="file" accept=".json,application/json"></div><div class="row" style="margin-top:8px"><button id="preproductionReceiptExport" class="btn soft">Tạo receipt</button></div><div style="margin-top:8px"><label>Receipt JSON</label><input id="preproductionReceiptFile" type="file" accept=".json,application/json"></div><div class="row" style="margin-top:8px"><button id="preproductionReceiptVerify" class="btn primary">Verify receipt + bundle</button></div><div id="preproductionReceiptStatus" class="status"></div><div id="preproductionReceiptOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionReviewBundlePanel')||doc.getElementById('preproductionReviewHistoryPanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    const status=(t,k)=>{const el=doc.getElementById('preproductionReceiptStatus');el.textContent=t||'';el.className='status '+(k||'');};
    async function read(id){const f=doc.getElementById(id).files&&doc.getElementById(id).files[0];if(!f)throw new Error('PREPRODUCTION_RECEIPT_FILE_REQUIRED:'+id);return JSON.parse(await f.text());}
    doc.getElementById('preproductionReceiptExport').addEventListener('click',async()=>{try{const bundle=await read('preproductionReceiptBundle'),receipt=await buildReceipt(bundle),blob=new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='kts-preproduction-receipt-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Receipt SHA '+receipt.integrity.receipt_sha256.slice(0,16)+'… · fingerprint only.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preproductionReceiptVerify').addEventListener('click',async()=>{try{const [bundle,receipt]=await Promise.all([read('preproductionReceiptBundle'),read('preproductionReceiptFile')]),v=await verifyReceiptAgainstBundle(receipt,bundle);doc.getElementById('preproductionReceiptOutput').innerHTML=`<div class="status ${v.valid?'ok':'err'}">${v.valid?'VALID':'TAMPERED'}</div>`+(v.errors||[]).map(x=>`<div class="hint">${esc(x)}</div>`).join('');status(v.valid?'Receipt khớp chính xác bundle. Không cấp quyền production.':'Receipt/bundle không khớp.',v.valid?'ok':'err');}catch(e){status(String(e&&e.message||e),'err');}});
  }
  global.KTS_SETTLEMENT_PREPRODUCTION_RECEIPT=Object.freeze({version:'settlement-preproduction-receipt-v1',FORMAT,MODE,receiptWithoutIntegrity,authorityValid,qualificationRefs,packageRefs,buildReceipt,verifyReceipt,verifyReceiptAgainstBundle});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
