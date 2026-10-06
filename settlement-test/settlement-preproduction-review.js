(function(global){
  'use strict';

  const PACKAGE_FORMAT='kts-preproduction-dry-run-package-v1';
  const REVIEW_FORMAT='kts-preproduction-human-review-record-v1';
  const REVIEW_MODE='READ_ONLY_HUMAN_REVIEW';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  const VERDICTS=Object.freeze({
    CURRENT:'CURRENT',
    STALE:'STALE',
    TAMPERED:'TAMPERED',
    UNVERIFIABLE:'UNVERIFIABLE'
  });

  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function deps(){
    const history=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
    if(!history||typeof history.sha256Hex!=='function'||typeof history.componentFingerprints!=='function'||typeof history.overallFingerprint!=='function'||typeof history.collectMaterial!=='function')throw new Error('PREPRODUCTION_REVIEW_HISTORY_UNAVAILABLE');
    return {history};
  }
  function payloadWithoutIntegrity(pkg){
    const copy=clone(pkg||{});
    delete copy.integrity;
    return copy;
  }
  function recordWithoutIntegrity(record){
    const copy=clone(record||{});
    delete copy.integrity;
    return copy;
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
  function sameText(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function checklistEntry(id,label,status,detail){return {id,label,status,detail:String(detail||'')};}
  function authorityErrors(pkg){
    const errors=[],a=pkg&&pkg.authority||{};
    if(String(pkg&&pkg.mode||'')!=='DRY_RUN_ONLY')errors.push('PREPRODUCTION_REVIEW_MODE_INVALID');
    if(a.dry_run_only!==true||a.production_enabled!==false||a.merge_authorized!==false||a.deploy_authorized!==false||a.mutates_settlement!==false)errors.push('PREPRODUCTION_REVIEW_AUTHORITY_INVALID');
    return errors;
  }
  function changedComponents(history,previous,current){
    const names=Array.isArray(history.COMPONENTS)?history.COMPONENTS:[];
    return names.filter(name=>!sameText(previous&&previous[name],current&&current[name]));
  }
  async function inspectPackage(pkg){
    const {history}=deps();
    const errors=[],checks=[];
    const fail=(id,label,detail)=>{errors.push(String(detail));checks.push(checklistEntry(id,label,'FAIL',detail));};
    const pass=(id,label,detail)=>checks.push(checklistEntry(id,label,'PASS',detail));
    if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)){
      fail('package-object','Package JSON hợp lệ','PREPRODUCTION_REVIEW_PACKAGE_REQUIRED');
      return {valid:false,errors,checklist:checks,recomputed:{}};
    }
    if(String(pkg.format)!==PACKAGE_FORMAT)fail('package-format','Đúng package format','PREPRODUCTION_REVIEW_FORMAT_INVALID');
    else pass('package-format','Đúng package format',PACKAGE_FORMAT);

    const authErrors=authorityErrors(pkg);
    if(authErrors.length)fail('authority-lock','Authority khóa dry-run',authErrors.join('|'));
    else pass('authority-lock','Authority khóa dry-run','production=false · merge=false · deploy=false · mutation=false');

    const source=pkg.source_ready_event||{},q=pkg.qualification_snapshot||{},material=pkg.evidence_material||{},manifest=pkg.manifest||{},integrity=pkg.integrity||{};
    if(source.ready_for_production_review!==true||String(source.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW')fail('source-ready','Source READY evidence','PREPRODUCTION_REVIEW_SOURCE_READY_INVALID');
    else pass('source-ready','Source READY evidence',String(source.id||'READY'));
    if(q.ready_for_production_review!==true||String(q.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW'||q.production_enabled!==false||q.merge_authorized!==false||(Array.isArray(q.blockers)&&q.blockers.length))fail('qualification-snapshot','Qualification snapshot sạch','PREPRODUCTION_REVIEW_QUALIFICATION_INVALID');
    else pass('qualification-snapshot','Qualification snapshot sạch','READY_FOR_PRODUCTION_REVIEW');
    if(String(manifest.ready_validity_status||'')!=='READY_EVIDENCE_CURRENT'||manifest.current_at_generation!==true)fail('generation-validity','READY còn CURRENT lúc đóng gói','PREPRODUCTION_REVIEW_GENERATION_VALIDITY_INVALID');
    else pass('generation-validity','READY còn CURRENT lúc đóng gói','READY_EVIDENCE_CURRENT');
    if(!material.parser_backend||material.parser_backend.status!=='available')fail('packaged-parser','Parser backend trong evidence khả dụng','PREPRODUCTION_REVIEW_PACKAGED_PARSER_UNAVAILABLE');
    else pass('packaged-parser','Parser backend trong evidence khả dụng','available');

    let payloadSha=null;
    if(!SHA256_RE.test(String(integrity.payload_sha256||'')))fail('payload-sha','Payload SHA-256 hợp lệ','PREPRODUCTION_REVIEW_PAYLOAD_SHA_INVALID');
    else{
      try{
        payloadSha=await history.sha256Hex(payloadWithoutIntegrity(pkg));
        if(!sameText(payloadSha,integrity.payload_sha256))fail('payload-sha','Payload SHA-256 khớp','PREPRODUCTION_REVIEW_PAYLOAD_SHA_MISMATCH');
        else pass('payload-sha','Payload SHA-256 khớp',payloadSha);
      }catch(e){fail('payload-sha','Payload SHA-256 recompute','PREPRODUCTION_REVIEW_PAYLOAD_HASH_ERROR:'+String(e&&e.message||e));}
    }

    let components=null,inputFingerprint=null;
    try{
      components=await history.componentFingerprints(material);
      const mismatches=[];
      for(const name of history.COMPONENTS||[]){
        if(!sameText(components[name],manifest.component_fingerprints&&manifest.component_fingerprints[name]))mismatches.push(name);
      }
      if(mismatches.length)fail('component-fingerprints','Component fingerprints khớp evidence','PREPRODUCTION_REVIEW_COMPONENT_MISMATCH:'+mismatches.join(','));
      else pass('component-fingerprints','Component fingerprints khớp evidence',(history.COMPONENTS||[]).length+' components');

      const sourceMismatches=[];
      for(const name of history.COMPONENTS||[]){
        if(!sameText(components[name],source.component_fingerprints&&source.component_fingerprints[name]))sourceMismatches.push(name);
      }
      if(sourceMismatches.length)fail('source-components','Source READY component fingerprints khớp','PREPRODUCTION_REVIEW_SOURCE_COMPONENT_MISMATCH:'+sourceMismatches.join(','));
      else pass('source-components','Source READY component fingerprints khớp','matched');

      inputFingerprint=await history.overallFingerprint(pkg.scope||{},components);
      if(!sameText(inputFingerprint,manifest.input_fingerprint_sha256))fail('input-fingerprint','Input fingerprint khớp manifest','PREPRODUCTION_REVIEW_INPUT_FINGERPRINT_MISMATCH');
      else pass('input-fingerprint','Input fingerprint khớp manifest',inputFingerprint);
      if(!sameText(inputFingerprint,source.input_fingerprint_sha256))fail('source-fingerprint','Input fingerprint khớp source READY','PREPRODUCTION_REVIEW_SOURCE_FINGERPRINT_MISMATCH');
      else pass('source-fingerprint','Input fingerprint khớp source READY',inputFingerprint);
    }catch(e){fail('component-fingerprints','Recompute component/input fingerprints','PREPRODUCTION_REVIEW_COMPONENT_VERIFY_ERROR:'+String(e&&e.message||e));}

    try{
      const runtimeBuild=material&&material.runtime&&material.runtime.build_identity;
      const manifestBuild=manifest&&manifest.build_identity;
      if(typeof history.validateBuildIdentity==='function')history.validateBuildIdentity(manifestBuild);
      if(!sameText(await history.sha256Hex(runtimeBuild),await history.sha256Hex(manifestBuild)))fail('build-identity','Critical build identity khớp evidence','PREPRODUCTION_REVIEW_BUILD_IDENTITY_MISMATCH');
      else pass('build-identity','Critical build identity khớp evidence','matched');
      if(!sameText(await history.sha256Hex(material&&material.parser_backend),await history.sha256Hex(manifest&&manifest.parser_backend)))fail('parser-identity','Parser identity khớp evidence','PREPRODUCTION_REVIEW_PARSER_IDENTITY_MISMATCH');
      else pass('parser-identity','Parser identity khớp evidence','matched');
    }catch(e){fail('identity-manifest','Build/parser manifest kiểm được','PREPRODUCTION_REVIEW_MANIFEST_VERIFY_ERROR:'+String(e&&e.message||e));}

    const expectedCounts=counts(material),actualCounts=manifest.evidence_counts||{};
    const countMismatch=Object.keys(expectedCounts).filter(k=>Number(expectedCounts[k])!==Number(actualCounts[k]));
    if(countMismatch.length)fail('evidence-counts','Evidence counts khớp material','PREPRODUCTION_REVIEW_EVIDENCE_COUNT_MISMATCH:'+countMismatch.join(','));
    else pass('evidence-counts','Evidence counts khớp material','matched');

    return {valid:errors.length===0,errors,checklist:checks,recomputed:{payload_sha256:payloadSha,input_fingerprint_sha256:inputFingerprint,component_fingerprints:components,evidence_counts:expectedCounts}};
  }

  async function reviewPackage(pkg){
    const {history}=deps();
    const inspection=await inspectPackage(pkg);
    if(!inspection.valid){
      return {
        verdict:VERDICTS.TAMPERED,
        package_valid:false,
        changed_components:[],
        checklist:inspection.checklist,
        errors:inspection.errors,
        packaged:clone(inspection.recomputed),
        current:null
      };
    }
    const manifest=pkg.manifest||{};
    try{
      const currentMaterial=await history.collectMaterial(pkg.qualification_snapshot||{},pkg.scope||{},{probe_parser_backend:true});
      if(!currentMaterial||!currentMaterial.parser_backend||currentMaterial.parser_backend.status!=='available'){
        const error=String(currentMaterial&&currentMaterial.parser_backend&&currentMaterial.parser_backend.error||'PARSER_BACKEND_IDENTITY_UNAVAILABLE');
        return {
          verdict:VERDICTS.UNVERIFIABLE,
          package_valid:true,
          changed_components:['parser_backend'],
          checklist:inspection.checklist.concat([checklistEntry('current-parser','Live parser backend xác minh được','UNVERIFIABLE',error)]),
          errors:['PREPRODUCTION_REVIEW_CURRENT_PARSER_UNVERIFIABLE:'+error],
          packaged:clone(inspection.recomputed),
          current:{parser_backend:clone(currentMaterial&&currentMaterial.parser_backend||null),input_fingerprint_sha256:null,component_fingerprints:null}
        };
      }
      const currentComponents=await history.componentFingerprints(currentMaterial);
      const currentFingerprint=await history.overallFingerprint(pkg.scope||{},currentComponents);
      const changed=changedComponents(history,manifest.component_fingerprints||{},currentComponents);
      const exact=sameText(currentFingerprint,manifest.input_fingerprint_sha256)&&sameText(currentFingerprint,pkg.source_ready_event&&pkg.source_ready_event.input_fingerprint_sha256)&&changed.length===0;
      const checklist=inspection.checklist.concat([
        checklistEntry('current-parser','Live parser backend xác minh được','PASS','available'),
        checklistEntry('current-components','Current component fingerprints so với package',exact?'PASS':'FAIL',changed.length?changed.join(', '):'matched'),
        checklistEntry('current-input','Current input fingerprint so với package',exact?'PASS':'FAIL',currentFingerprint)
      ]);
      return {
        verdict:exact?VERDICTS.CURRENT:VERDICTS.STALE,
        package_valid:true,
        changed_components:changed,
        checklist,
        errors:exact?[]:['PREPRODUCTION_REVIEW_PACKAGE_STALE:'+String(changed.join(',')||'fingerprint')],
        packaged:clone(inspection.recomputed),
        current:{input_fingerprint_sha256:currentFingerprint,component_fingerprints:clone(currentComponents),parser_backend:clone(currentMaterial.parser_backend)}
      };
    }catch(e){
      const message=String(e&&e.message||e||'CURRENT_STATE_UNAVAILABLE');
      return {
        verdict:VERDICTS.UNVERIFIABLE,
        package_valid:true,
        changed_components:[],
        checklist:inspection.checklist.concat([checklistEntry('current-state','Current runtime/data recompute','UNVERIFIABLE',message)]),
        errors:['PREPRODUCTION_REVIEW_CURRENT_STATE_UNVERIFIABLE:'+message],
        packaged:clone(inspection.recomputed),
        current:null
      };
    }
  }

  async function buildHumanReviewRecord(pkg,review,human){
    const {history}=deps();
    if(!review||!Object.values(VERDICTS).includes(String(review.verdict||'')))throw new Error('PREPRODUCTION_REVIEW_RESULT_REQUIRED');
    const h=human||{};
    const record={
      format:REVIEW_FORMAT,
      mode:REVIEW_MODE,
      reviewed_at:new Date().toISOString(),
      authority:{
        read_only:true,
        technical_review_only:true,
        production_enabled:false,
        merge_authorized:false,
        deploy_authorized:false,
        mutates_settlement:false,
        production_approval_recorded:false
      },
      package:{
        format:String(pkg&&pkg.format||''),
        source_ready_event_id:String(pkg&&pkg.source_ready_event&&pkg.source_ready_event.id||''),
        package_payload_sha256:String(pkg&&pkg.integrity&&pkg.integrity.payload_sha256||''),
        input_fingerprint_sha256:String(pkg&&pkg.manifest&&pkg.manifest.input_fingerprint_sha256||'')
      },
      verification:{
        verdict:String(review.verdict),
        package_valid:review.package_valid===true,
        changed_components:clone(review.changed_components||[]),
        errors:clone(review.errors||[]),
        checklist:clone(review.checklist||[]),
        packaged:clone(review.packaged||null),
        current:clone(review.current||null)
      },
      human:{
        reviewer:String(h.reviewer||'').trim(),
        note:String(h.note||'').trim(),
        acknowledgement:'TECHNICAL_REVIEW_RECORDED',
        authorization_effect:'NONE'
      }
    };
    record.integrity={algorithm:'sha256',record_sha256:await history.sha256Hex(recordWithoutIntegrity(record))};
    return record;
  }

  async function verifyHumanReviewRecord(record){
    const {history}=deps();
    const errors=[];
    if(!record||typeof record!=='object'||Array.isArray(record))return {valid:false,errors:['PREPRODUCTION_HUMAN_REVIEW_RECORD_REQUIRED']};
    if(String(record.format)!==REVIEW_FORMAT)errors.push('PREPRODUCTION_HUMAN_REVIEW_FORMAT_INVALID');
    if(String(record.mode)!==REVIEW_MODE)errors.push('PREPRODUCTION_HUMAN_REVIEW_MODE_INVALID');
    const a=record.authority||{};
    if(a.read_only!==true||a.technical_review_only!==true||a.production_enabled!==false||a.merge_authorized!==false||a.deploy_authorized!==false||a.mutates_settlement!==false||a.production_approval_recorded!==false)errors.push('PREPRODUCTION_HUMAN_REVIEW_AUTHORITY_INVALID');
    const expected=record.integrity&&record.integrity.record_sha256;
    if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_HUMAN_REVIEW_SHA_INVALID');
    else{
      const actual=await history.sha256Hex(recordWithoutIntegrity(record));
      if(!sameText(actual,expected))errors.push('PREPRODUCTION_HUMAN_REVIEW_SHA_MISMATCH');
    }
    return {valid:errors.length===0,errors};
  }

  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');
    if(!pane||doc.getElementById('preproductionReviewPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionReviewPanel';
    card.innerHTML=`<div class="section-title">Independent pre-production package review</div>
      <div class="hint">Nạp lại JSON dry-run đã xuất. Verifier này không gọi self-verify của package: nó recompute SHA/component fingerprint từ evidence, rồi so với runtime/data/parser hiện tại. Chỉ tạo biên bản review kỹ thuật read-only; không deploy, không merge và không bật production.</div>
      <div style="margin-top:8px"><label>JSON package</label><input id="preproductionReviewFile" type="file" accept=".json,application/json"></div>
      <div class="row" style="margin-top:8px"><button id="preproductionReviewRun" class="btn primary" disabled>Kiểm độc lập</button><button id="preproductionReviewExport" class="btn soft" disabled>Xuất human review record</button></div>
      <div class="grid" style="margin-top:8px"><div><label>Người review (tuỳ chọn)</label><input id="preproductionReviewer" placeholder="Tên người review"></div><div><label>Ghi chú (tuỳ chọn)</label><input id="preproductionReviewNote" placeholder="Ghi chú review kỹ thuật"></div></div>
      <div id="preproductionReviewStatus" class="status"></div><div id="preproductionReviewOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionPackagePanel')||doc.getElementById('qualificationHistoryPanel')||doc.getElementById('finalQualificationPanel');
    pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    let loaded=null,lastReview=null;
    const fileInput=doc.getElementById('preproductionReviewFile'),runBtn=doc.getElementById('preproductionReviewRun'),exportBtn=doc.getElementById('preproductionReviewExport');
    function status(text,kind){const el=doc.getElementById('preproductionReviewStatus');el.textContent=text||'';el.className='status '+(kind||'');}
    function render(review){
      const host=doc.getElementById('preproductionReviewOutput'),verdict=String(review&&review.verdict||'UNVERIFIABLE');
      const kind=verdict==='CURRENT'?'ok':verdict==='STALE'||verdict==='TAMPERED'?'err':'warn';
      const changed=(review&&review.changed_components||[]).join(', ')||'không';
      host.innerHTML=`<div class="status ${kind}">${esc(verdict)}</div><div class="hint">changed components: ${esc(changed)}</div>`+
        (review&&review.checklist||[]).map(x=>`<div class="report-message"><b>${esc(x.status)}</b> · ${esc(x.label)}<div class="hint">${esc(x.detail)}</div></div>`).join('')+
        `<div class="hint" style="margin-top:8px">Biên bản sinh ra luôn khóa production_enabled=false · merge_authorized=false · deploy_authorized=false · production_approval_recorded=false.</div>`;
    }
    fileInput.addEventListener('change',async()=>{
      loaded=null;lastReview=null;runBtn.disabled=true;exportBtn.disabled=true;doc.getElementById('preproductionReviewOutput').innerHTML='';
      try{
        const file=fileInput.files&&fileInput.files[0];if(!file)throw new Error('PREPRODUCTION_REVIEW_FILE_REQUIRED');
        loaded=JSON.parse(await file.text());runBtn.disabled=false;status('Đã nạp JSON. Bấm “Kiểm độc lập” để recompute và so current state.','warn');
      }catch(e){status(String(e&&e.message||e),'err');}
    });
    runBtn.addEventListener('click',async event=>{
      const btn=event.currentTarget;
      try{
        btn.disabled=true;exportBtn.disabled=true;status('Đang recompute package SHA/component + runtime/data/parser hiện tại…','warn');
        lastReview=await reviewPackage(loaded);render(lastReview);exportBtn.disabled=false;
        const kind=lastReview.verdict==='CURRENT'?'ok':lastReview.verdict==='UNVERIFIABLE'?'warn':'err';
        status('Independent review verdict: '+lastReview.verdict+'. Đây chỉ là review kỹ thuật, không cấp quyền production.',kind);
      }catch(e){lastReview=null;status(String(e&&e.message||e),'err');}
      finally{btn.disabled=false;}
    });
    exportBtn.addEventListener('click',async()=>{
      try{
        if(!loaded||!lastReview)throw new Error('PREPRODUCTION_REVIEW_RESULT_REQUIRED');
        const record=await buildHumanReviewRecord(loaded,lastReview,{reviewer:doc.getElementById('preproductionReviewer').value,note:doc.getElementById('preproductionReviewNote').value});
        const verified=await verifyHumanReviewRecord(record);if(!verified.valid)throw new Error('PREPRODUCTION_HUMAN_REVIEW_SELF_VERIFY_FAILED:'+verified.errors.join('|'));
        const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');
        a.href=url;a.download='kts-preproduction-human-review-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
        status('Đã xuất human review record read-only. Không có deploy/merge/production mutation.','ok');
      }catch(e){status(String(e&&e.message||e),'err');}
    });
  }

  global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW=Object.freeze({
    version:'settlement-preproduction-review-v1',
    PACKAGE_FORMAT,REVIEW_FORMAT,REVIEW_MODE,VERDICTS,
    payloadWithoutIntegrity,recordWithoutIntegrity,counts,authorityErrors,inspectPackage,reviewPackage,buildHumanReviewRecord,verifyHumanReviewRecord
  });
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});
  else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
