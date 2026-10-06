(function(global){
  'use strict';

  const FORMAT='kts-preproduction-dry-run-package-v1';
  const MODE='DRY_RUN_ONLY';
  const SHA256_RE=/^[0-9a-f]{64}$/i;

  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');}
  function deps(){
    const history=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
    if(!history||typeof history.checkLastReadyValidity!=='function'||typeof history.collectMaterial!=='function'||typeof history.componentFingerprints!=='function'||typeof history.overallFingerprint!=='function'||typeof history.sha256Hex!=='function')throw new Error('PREPRODUCTION_QUALIFICATION_HISTORY_UNAVAILABLE');
    return {history};
  }
  function scopeFromReadyEvent(event){
    return {
      from_date:String(event&&event.from_date||''),
      to_date:String(event&&event.to_date||''),
      required_observation_days:String(event&&event.required_observation_days||''),
      partner_id:String(event&&event.partner_id||''),
      regions:Array.isArray(event&&event.regions)?event.regions.map(x=>String(x).toLowerCase()).sort():[]
    };
  }
  function counts(material){
    const m=material||{};
    return {
      messages:Array.isArray(m.messages)?m.messages.length:0,
      settlements:Array.isArray(m.settlements)?m.settlements.length:0,
      results:Array.isArray(m.results)?m.results.length:0,
      configs:Array.isArray(m.configs)?m.configs.length:0,
      regression_cases:Array.isArray(m.regression_cases)?m.regression_cases.length:0,
      candidates:Array.isArray(m.candidates)?m.candidates.length:0
    };
  }
  function payloadWithoutIntegrity(pkg){
    const copy=clone(pkg||{});
    delete copy.integrity;
    return copy;
  }
  function assertCurrentReadyValidity(validity){
    const status=String(validity&&validity.status||'NO_READY_EVIDENCE');
    if(status==='NO_READY_EVIDENCE')throw new Error('PREPRODUCTION_READY_EVIDENCE_REQUIRED');
    if(status==='READY_EVIDENCE_UNVERIFIABLE')throw new Error('PREPRODUCTION_READY_EVIDENCE_UNVERIFIABLE:'+String(validity&&validity.parser_backend_error||'UNKNOWN'));
    if(status!=='READY_EVIDENCE_CURRENT'||validity.current!==true){
      const changed=Array.isArray(validity&&validity.changed_components)?validity.changed_components.join(','):'unknown';
      throw new Error('PREPRODUCTION_READY_EVIDENCE_STALE:'+changed);
    }
    const ready=validity.ready_event;
    if(!ready||ready.ready_for_production_review!==true||String(ready.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW')throw new Error('PREPRODUCTION_READY_EVENT_INVALID');
    return ready;
  }
  function assertDryRunAuthority(pkg){
    const a=pkg&&pkg.authority||{};
    if(pkg&&pkg.mode!==MODE)throw new Error('PREPRODUCTION_MODE_INVALID');
    if(a.dry_run_only!==true||a.production_enabled!==false||a.merge_authorized!==false||a.deploy_authorized!==false||a.mutates_settlement!==false)throw new Error('PREPRODUCTION_AUTHORITY_INVALID');
    return true;
  }
  async function verifyPackage(pkg){
    const {history}=deps();
    const errors=[];
    const add=e=>errors.push(String(e));
    if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))return {valid:false,errors:['PREPRODUCTION_PACKAGE_REQUIRED']};
    if(String(pkg.format)!==FORMAT)add('PREPRODUCTION_FORMAT_INVALID');
    try{assertDryRunAuthority(pkg);}catch(e){add(e&&e.message||e);}
    const source=pkg.source_ready_event||{}, q=pkg.qualification_snapshot||{}, material=pkg.evidence_material||{}, manifest=pkg.manifest||{}, integrity=pkg.integrity||{};
    if(source.ready_for_production_review!==true||String(source.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW')add('PREPRODUCTION_SOURCE_READY_INVALID');
    if(q.ready_for_production_review!==true||String(q.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW')add('PREPRODUCTION_QUALIFICATION_NOT_READY');
    if(q.production_enabled!==false||q.merge_authorized!==false)add('PREPRODUCTION_QUALIFICATION_AUTHORITY_INVALID');
    if(Array.isArray(q.blockers)&&q.blockers.length)add('PREPRODUCTION_QUALIFICATION_HAS_BLOCKERS');
    if(!material.parser_backend||material.parser_backend.status!=='available')add('PREPRODUCTION_PARSER_BACKEND_NOT_AVAILABLE');
    if(!SHA256_RE.test(String(integrity.payload_sha256||'')))add('PREPRODUCTION_PAYLOAD_SHA256_INVALID');
    let payloadSha=null;
    try{
      payloadSha=await history.sha256Hex(payloadWithoutIntegrity(pkg));
      if(String(payloadSha)!==String(integrity.payload_sha256||''))add('PREPRODUCTION_PAYLOAD_SHA256_MISMATCH');
    }catch(e){add('PREPRODUCTION_PAYLOAD_HASH_ERROR:'+String(e&&e.message||e));}
    let components=null,inputFingerprint=null;
    try{
      components=await history.componentFingerprints(material);
      for(const name of history.COMPONENTS||[]){
        if(String(components[name]||'')!==String(manifest.component_fingerprints&&manifest.component_fingerprints[name]||''))add('PREPRODUCTION_COMPONENT_MISMATCH:'+name);
      }
      inputFingerprint=await history.overallFingerprint(pkg.scope||{},components);
      if(String(inputFingerprint)!==String(manifest.input_fingerprint_sha256||''))add('PREPRODUCTION_INPUT_FINGERPRINT_MISMATCH');
      if(String(inputFingerprint)!==String(source.input_fingerprint_sha256||''))add('PREPRODUCTION_SOURCE_FINGERPRINT_MISMATCH');
    }catch(e){add('PREPRODUCTION_COMPONENT_VERIFY_ERROR:'+String(e&&e.message||e));}
    try{
      const runtimeBuild=material&&material.runtime&&material.runtime.build_identity;
      const manifestBuild=manifest&&manifest.build_identity;
      if(await history.sha256Hex(runtimeBuild)!==await history.sha256Hex(manifestBuild))add('PREPRODUCTION_BUILD_IDENTITY_MISMATCH');
      if(await history.sha256Hex(material&&material.parser_backend)!==await history.sha256Hex(manifest&&manifest.parser_backend))add('PREPRODUCTION_PARSER_IDENTITY_MISMATCH');
    }catch(e){add('PREPRODUCTION_MANIFEST_VERIFY_ERROR:'+String(e&&e.message||e));}
    return {valid:errors.length===0,errors,payload_sha256:payloadSha,input_fingerprint_sha256:inputFingerprint,component_fingerprints:components};
  }
  async function buildPackage(){
    const {history}=deps();
    const validity=await history.checkLastReadyValidity();
    const ready=assertCurrentReadyValidity(validity);
    const scope=scopeFromReadyEvent(ready);
    const material=await history.collectMaterial(ready.qualification_snapshot,scope,{probe_parser_backend:true});
    if(!material.parser_backend||material.parser_backend.status!=='available')throw new Error('PREPRODUCTION_PARSER_BACKEND_NOT_AVAILABLE');
    const componentFingerprints=await history.componentFingerprints(material);
    const inputFingerprint=await history.overallFingerprint(scope,componentFingerprints);
    if(String(inputFingerprint)!==String(ready.input_fingerprint_sha256||''))throw new Error('PREPRODUCTION_READY_FINGERPRINT_CHANGED_DURING_BUILD');
    const q=clone(ready.qualification_snapshot||{});
    if(q.ready_for_production_review!==true||String(q.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW'||(Array.isArray(q.blockers)&&q.blockers.length))throw new Error('PREPRODUCTION_QUALIFICATION_NOT_READY');
    if(q.production_enabled!==false||q.merge_authorized!==false)throw new Error('PREPRODUCTION_QUALIFICATION_AUTHORITY_INVALID');
    const pkg={
      format:FORMAT,
      mode:MODE,
      generated_at:new Date().toISOString(),
      authority:{dry_run_only:true,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false},
      scope,
      source_ready_event:{
        id:String(ready.id||''),observed_at:String(ready.observed_at||''),qualification_state:String(ready.qualification_state||''),ready_for_production_review:true,
        input_fingerprint_sha256:String(ready.input_fingerprint_sha256||''),component_fingerprints:clone(ready.component_fingerprints||{}),blockers:clone(ready.blockers||[])
      },
      manifest:{
        input_fingerprint_sha256:inputFingerprint,
        component_fingerprints:clone(componentFingerprints),
        build_identity:clone(material.runtime&&material.runtime.build_identity||null),
        parser_backend:clone(material.parser_backend),
        runtime_modules:clone(material.runtime&&material.runtime.modules||{}),
        evidence_counts:counts(material),
        ready_validity_status:String(validity.status||''),
        current_at_generation:validity.current===true
      },
      qualification_snapshot:q,
      evidence_material:clone(material)
    };
    assertDryRunAuthority(pkg);
    pkg.integrity={algorithm:'sha256',payload_sha256:await history.sha256Hex(payloadWithoutIntegrity(pkg))};
    const verification=await verifyPackage(pkg);
    if(!verification.valid)throw new Error('PREPRODUCTION_PACKAGE_SELF_VERIFY_FAILED:'+verification.errors.join('|'));
    return pkg;
  }
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');
    if(!pane||doc.getElementById('preproductionPackagePanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionPackagePanel';
    card.innerHTML=`<div class="section-title">Pre-production dry-run package</div><div class="hint">Đóng gói READY evidence + dữ liệu qualification + critical code identity + parser backend identity thành một JSON có SHA-256 tự kiểm. Chỉ là gói dry-run để review: không deploy, không merge main, không bật production và không sửa tiền.</div><div class="row" style="margin-top:8px"><button id="preproductionPackageBuild" class="btn primary">Tạo + tự kiểm gói</button><button id="preproductionPackageExport" class="btn soft" disabled>Tải JSON</button></div><div id="preproductionPackageStatus" class="status"></div><div id="preproductionPackageOutput" class="hint"></div>`;
    const anchor=doc.getElementById('qualificationHistoryPanel')||doc.getElementById('finalQualificationPanel');
    pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    let latest=null;
    function status(text,kind){const el=doc.getElementById('preproductionPackageStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    function render(pkg){const m=pkg.manifest||{},c=m.evidence_counts||{},hash=pkg.integrity&&pkg.integrity.payload_sha256||'';doc.getElementById('preproductionPackageOutput').innerHTML=`<div class="status ok">PACKAGE VERIFIED · DRY_RUN_ONLY</div><div class="hint">READY event: ${esc(pkg.source_ready_event&&pkg.source_ready_event.id||'—')} · input SHA ${esc(String(m.input_fingerprint_sha256||'').slice(0,16))}…</div><div class="hint">package SHA-256: <b>${esc(hash)}</b></div><div class="hint">evidence: ${c.messages||0} tin · ${c.settlements||0} settlement · ${c.results||0} KQXS · ${c.configs||0} config · ${c.regression_cases||0} golden</div><div class="hint">production_enabled=false · merge_authorized=false · deploy_authorized=false</div>`;}
    doc.getElementById('preproductionPackageBuild').addEventListener('click',async event=>{const btn=event.currentTarget;try{btn.disabled=true;doc.getElementById('preproductionPackageExport').disabled=true;status('Đang kiểm READY hiện tại + parser backend + fingerprint toàn bộ evidence…','warn');latest=await buildPackage();render(latest);doc.getElementById('preproductionPackageExport').disabled=false;status('Gói dry-run đã tự kiểm PASS. Có thể tải JSON để review; chưa có thao tác production nào.','ok');}catch(e){latest=null;status(String(e&&e.message||e),'err');}finally{btn.disabled=false;}});
    doc.getElementById('preproductionPackageExport').addEventListener('click',async()=>{try{if(!latest)throw new Error('PREPRODUCTION_PACKAGE_REQUIRED');const verification=await verifyPackage(latest);if(!verification.valid)throw new Error('PREPRODUCTION_PACKAGE_VERIFY_FAILED:'+verification.errors.join('|'));const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='kts-preproduction-dry-run-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Đã xuất gói dry-run đã verify SHA-256. Không có deploy/merge/production mutation.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
  }

  global.KTS_SETTLEMENT_PREPRODUCTION_PACKAGE=Object.freeze({
    version:'settlement-preproduction-package-v1',FORMAT,MODE,scopeFromReadyEvent,counts,payloadWithoutIntegrity,assertCurrentReadyValidity,assertDryRunAuthority,verifyPackage,buildPackage
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
