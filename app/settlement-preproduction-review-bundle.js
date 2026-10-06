(function(global){
  'use strict';

  const FORMAT='kts-preproduction-review-bundle-v1';
  const MODE='PORTABLE_EVIDENCE_ONLY';
  const SHA256_RE=/^[0-9a-f]{64}$/i;

  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){
    const qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
    const reviewHistory=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY;
    if(!qualification||!reviewHistory||typeof qualification.sha256Hex!=='function'||typeof qualification.listEvents!=='function'||typeof reviewHistory.listEvents!=='function'||typeof reviewHistory.verifyChain!=='function')throw new Error('PREPRODUCTION_REVIEW_BUNDLE_DEPENDENCY_MISSING');
    return {qualification,reviewHistory};
  }
  function bundleWithoutIntegrity(bundle){const copy=clone(bundle||{});delete copy.integrity;return copy;}
  function authorityValid(a){return Boolean(a&&a.portable_evidence_only===true&&a.read_only===true&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.production_approval_recorded===false&&a.import_mutates_local_history===false);}
  function compactReviewIndex(event){return {
    sequence:Number(event&&event.sequence||0),
    id:String(event&&event.id||''),
    event_sha256:String(event&&event.integrity&&event.integrity.event_sha256||''),
    previous_event_sha256:event&&event.previous_event_sha256==null?null:String(event.previous_event_sha256),
    source_qualification_event_id:String(event&&event.qualification_link&&event.qualification_link.source_event_id||''),
    package_payload_sha256:String(event&&event.package_link&&event.package_link.package_payload_sha256||''),
    review_record_sha256:String(event&&event.review_link&&event.review_link.record_sha256||''),
    verdict:String(event&&event.review_link&&event.review_link.verdict||''),
    recorded_at:String(event&&event.recorded_at||'')
  };}
  function packageIndexFromEvents(events){
    const out=[],seen=new Set();
    for(const event of events||[]){
      const p=event&&event.package_link||{},key=String(p.package_payload_sha256||'');
      if(!key||seen.has(key))continue;seen.add(key);
      out.push({package_payload_sha256:key,input_fingerprint_sha256:String(p.input_fingerprint_sha256||''),source_qualification_event_id:String(event&&event.qualification_link&&event.qualification_link.source_event_id||'')});
    }
    return out;
  }
  async function qualificationEvidence(sourceIds,qualificationEvents,qualification){
    const byId=new Map((qualificationEvents||[]).map(x=>[String(x&&x.id||''),x])),out=[];
    for(const id of sourceIds){
      const event=byId.get(id);if(!event)throw new Error('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_SOURCE_MISSING:'+id);
      out.push({event:clone(event),event_sha256:await qualification.sha256Hex(event)});
    }
    return out;
  }
  async function buildBundle(){
    const {qualification,reviewHistory}=deps();
    const listed=await reviewHistory.listEvents();
    if(!listed||!listed.chain||listed.chain.valid!==true)throw new Error('PREPRODUCTION_REVIEW_BUNDLE_REVIEW_CHAIN_TAMPERED');
    const events=clone(listed.events||[]);if(!events.length)throw new Error('PREPRODUCTION_REVIEW_BUNDLE_REVIEW_EVIDENCE_REQUIRED');
    const sourceIds=[...new Set(events.map(e=>String(e&&e.qualification_link&&e.qualification_link.source_event_id||'')).filter(Boolean))];
    const qEvents=await qualification.listEvents();
    const qEvidence=await qualificationEvidence(sourceIds,qEvents,qualification);
    const indexes=events.map(compactReviewIndex);
    const head=events[events.length-1];
    const bundle={
      format:FORMAT,mode:MODE,exported_at:new Date().toISOString(),
      authority:{portable_evidence_only:true,read_only:true,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,production_approval_recorded:false,import_mutates_local_history:false},
      content_policy:{contains_settlement_store:false,contains_message_store:false,contains_result_store:false,contains_package_payload:false,contains_review_evidence_events:true,contains_linked_qualification_events:true},
      chain:{event_count:events.length,genesis_event_id:String(events[0].id||''),head_event_id:String(head.id||''),head_event_sha256:String(head.integrity&&head.integrity.event_sha256||'')},
      review_events:events,
      qualification_evidence:qEvidence,
      index:{reviews:indexes,packages:packageIndexFromEvents(events)},
      exporter_build_identity:clone(global.KTS_SETTLEMENT_BUILD_IDENTITY||null)
    };
    bundle.integrity={algorithm:'sha256',bundle_sha256:await qualification.sha256Hex(bundleWithoutIntegrity(bundle))};
    const verified=await verifyBundle(bundle);if(!verified.valid)throw new Error('PREPRODUCTION_REVIEW_BUNDLE_SELF_VERIFY_FAILED:'+verified.errors.join('|'));
    return bundle;
  }
  async function verifyBundle(bundle){
    const {qualification,reviewHistory}=deps();
    const errors=[];
    if(!bundle||typeof bundle!=='object'||Array.isArray(bundle))return {valid:false,errors:['PREPRODUCTION_REVIEW_BUNDLE_REQUIRED'],chain:null};
    if(String(bundle.format)!==FORMAT)errors.push('PREPRODUCTION_REVIEW_BUNDLE_FORMAT_INVALID');
    if(String(bundle.mode)!==MODE)errors.push('PREPRODUCTION_REVIEW_BUNDLE_MODE_INVALID');
    if(!authorityValid(bundle.authority))errors.push('PREPRODUCTION_REVIEW_BUNDLE_AUTHORITY_INVALID');
    const policy=bundle.content_policy||{};
    if(policy.contains_settlement_store!==false||policy.contains_message_store!==false||policy.contains_result_store!==false||policy.contains_package_payload!==false||policy.contains_review_evidence_events!==true||policy.contains_linked_qualification_events!==true)errors.push('PREPRODUCTION_REVIEW_BUNDLE_CONTENT_POLICY_INVALID');
    const expected=bundle.integrity&&bundle.integrity.bundle_sha256;
    if(!SHA256_RE.test(String(expected||'')))errors.push('PREPRODUCTION_REVIEW_BUNDLE_SHA_INVALID');
    else{const actual=await qualification.sha256Hex(bundleWithoutIntegrity(bundle));if(!same(actual,expected))errors.push('PREPRODUCTION_REVIEW_BUNDLE_SHA_MISMATCH');}

    const events=Array.isArray(bundle.review_events)?bundle.review_events:[];
    const chain=await reviewHistory.verifyChain(events).catch(e=>({valid:false,errors:[String(e&&e.message||e)],count:events.length,head_event_sha256:null}));
    if(!chain.valid)errors.push('PREPRODUCTION_REVIEW_BUNDLE_CHAIN_INVALID');
    const declared=bundle.chain||{};
    if(Number(declared.event_count)!==events.length)errors.push('PREPRODUCTION_REVIEW_BUNDLE_EVENT_COUNT_MISMATCH');
    if(events.length){
      if(!same(declared.genesis_event_id,events[0].id))errors.push('PREPRODUCTION_REVIEW_BUNDLE_GENESIS_MISMATCH');
      const head=events[events.length-1];
      if(!same(declared.head_event_id,head.id)||!same(declared.head_event_sha256,head.integrity&&head.integrity.event_sha256))errors.push('PREPRODUCTION_REVIEW_BUNDLE_HEAD_MISMATCH');
    }

    const idx=bundle.index&&Array.isArray(bundle.index.reviews)?bundle.index.reviews:[];
    if(idx.length!==events.length)errors.push('PREPRODUCTION_REVIEW_BUNDLE_INDEX_COUNT_MISMATCH');
    for(let i=0;i<Math.min(idx.length,events.length);i++){
      const expectedIndex=compactReviewIndex(events[i]),actualIndex=idx[i]||{};
      for(const key of Object.keys(expectedIndex)){if(!same(expectedIndex[key],actualIndex[key])){errors.push('PREPRODUCTION_REVIEW_BUNDLE_INDEX_MISMATCH:'+i+':'+key);break;}}
    }

    const qEvidence=Array.isArray(bundle.qualification_evidence)?bundle.qualification_evidence:[],qById=new Map();
    for(const item of qEvidence){
      const event=item&&item.event||{},id=String(event.id||'');
      if(!id||qById.has(id)){errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_DUPLICATE_OR_MISSING_ID');continue;}
      const digest=await qualification.sha256Hex(event);
      if(!SHA256_RE.test(String(item.event_sha256||''))||!same(digest,item.event_sha256))errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_SHA_MISMATCH:'+id);
      if(event.ready_for_production_review!==true||String(event.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW'||event.production_enabled!==false||event.merge_authorized!==false)errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_NOT_READY:'+id);
      qById.set(id,event);
    }
    const requiredIds=new Set();
    for(const event of events){
      const sourceId=String(event&&event.qualification_link&&event.qualification_link.source_event_id||'');requiredIds.add(sourceId);
      const q=qById.get(sourceId);
      if(!q){errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_LINK_MISSING:'+sourceId);continue;}
      if(!same(q.input_fingerprint_sha256,event.qualification_link&&event.qualification_link.input_fingerprint_sha256))errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_FINGERPRINT_MISMATCH:'+sourceId);
      for(const name of qualification.COMPONENTS||[]){if(!same(q.component_fingerprints&&q.component_fingerprints[name],event.package_link&&event.package_link.component_fingerprints&&event.package_link.component_fingerprints[name])){errors.push('PREPRODUCTION_REVIEW_BUNDLE_QUALIFICATION_COMPONENT_MISMATCH:'+sourceId+':'+name);break;}}
    }
    for(const id of qById.keys())if(!requiredIds.has(id))errors.push('PREPRODUCTION_REVIEW_BUNDLE_UNUSED_QUALIFICATION_EVIDENCE:'+id);

    const packageIndex=packageIndexFromEvents(events),declaredPackages=bundle.index&&Array.isArray(bundle.index.packages)?bundle.index.packages:[];
    if(await qualification.sha256Hex(packageIndex)!==await qualification.sha256Hex(declaredPackages))errors.push('PREPRODUCTION_REVIEW_BUNDLE_PACKAGE_INDEX_MISMATCH');
    return {valid:errors.length===0,errors,chain:clone(chain),bundle_sha256:String(expected||''),head_event_sha256:events.length?String(events[events.length-1].integrity&&events[events.length-1].integrity.event_sha256||''):null};
  }
  async function compareWithLocalHistory(bundle){
    const {reviewHistory}=deps();
    const verified=await verifyBundle(bundle);if(!verified.valid)return {status:'TAMPERED',bundle_valid:false,errors:verified.errors};
    const local=await reviewHistory.listEvents();
    if(!local.chain.valid)return {status:'LOCAL_CHAIN_TAMPERED',bundle_valid:true,errors:['LOCAL_REVIEW_CHAIN_TAMPERED']};
    const imported=bundle.review_events||[],localEvents=local.events||[];
    if(!localEvents.length)return {status:'LOCAL_CHAIN_ABSENT',bundle_valid:true,errors:[]};
    const bundleHead=String(imported[imported.length-1].integrity&&imported[imported.length-1].integrity.event_sha256||''),localHead=String(localEvents[localEvents.length-1].integrity&&localEvents[localEvents.length-1].integrity.event_sha256||'');
    if(same(bundleHead,localHead))return {status:'LOCAL_CHAIN_MATCH',bundle_valid:true,errors:[]};
    const localHashes=new Set(localEvents.map(e=>String(e&&e.integrity&&e.integrity.event_sha256||''))),bundleHashes=new Set(imported.map(e=>String(e&&e.integrity&&e.integrity.event_sha256||'')));
    if(localHashes.has(bundleHead))return {status:'LOCAL_CHAIN_AHEAD',bundle_valid:true,errors:[]};
    if(bundleHashes.has(localHead))return {status:'BUNDLE_CHAIN_AHEAD',bundle_valid:true,errors:[]};
    return {status:'CHAIN_DIVERGED',bundle_valid:true,errors:['PORTABLE_AND_LOCAL_REVIEW_CHAINS_DIVERGED']};
  }
  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionReviewBundlePanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionReviewBundlePanel';
    card.innerHTML=`<div class="section-title">Portable pre-production review bundle</div><div class="hint">Xuất review evidence chain + qualification evidence liên quan thành một JSON nhỏ, không chứa settlement/message/KQXS store và không chứa package payload. Máy khác có thể nạp file để recompute SHA, verify chain và cross-link mà không ghi vào IndexedDB.</div><div class="row" style="margin-top:8px"><button id="preproductionBundleExport" class="btn soft">Xuất portable bundle</button></div><div style="margin-top:8px"><label>Portable bundle JSON</label><input id="preproductionBundleFile" type="file" accept=".json,application/json"></div><div class="row" style="margin-top:8px"><button id="preproductionBundleVerify" class="btn primary">Verify độc lập</button><button id="preproductionBundleCompare" class="btn soft">So với local chain</button></div><div id="preproductionBundleStatus" class="status"></div><div id="preproductionBundleOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionReviewHistoryPanel')||doc.getElementById('preproductionReviewPanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    const status=(text,kind)=>{const el=doc.getElementById('preproductionBundleStatus');el.textContent=text||'';el.className='status '+(kind||'');};
    async function fileBundle(){const input=doc.getElementById('preproductionBundleFile'),file=input.files&&input.files[0];if(!file)throw new Error('PREPRODUCTION_REVIEW_BUNDLE_FILE_REQUIRED');return JSON.parse(await file.text());}
    doc.getElementById('preproductionBundleExport').addEventListener('click',async()=>{try{status('Đang đóng gói portable review evidence…','warn');const bundle=await buildBundle(),blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='kts-preproduction-review-bundle-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);status('Đã xuất portable bundle · SHA '+String(bundle.integrity.bundle_sha256).slice(0,16)+'… · không chứa settlement store/package payload.','ok');}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preproductionBundleVerify').addEventListener('click',async()=>{try{const bundle=await fileBundle(),v=await verifyBundle(bundle),host=doc.getElementById('preproductionBundleOutput');host.innerHTML=`<div class="status ${v.valid?'ok':'err'}">${v.valid?'VALID':'TAMPERED'}</div><div class="hint">events: ${esc(v.chain&&v.chain.count||0)} · head ${esc(String(v.head_event_sha256||'').slice(0,16))}…</div>`+(v.errors||[]).map(x=>`<div class="hint">${esc(x)}</div>`).join('');status(v.valid?'Portable bundle tự verify PASS. Không cấp quyền production.':'Portable bundle không hợp lệ.',''+(v.valid?'ok':'err'));}catch(e){status(String(e&&e.message||e),'err');}});
    doc.getElementById('preproductionBundleCompare').addEventListener('click',async()=>{try{const bundle=await fileBundle(),v=await compareWithLocalHistory(bundle),kind=['LOCAL_CHAIN_MATCH','LOCAL_CHAIN_AHEAD','BUNDLE_CHAIN_AHEAD','LOCAL_CHAIN_ABSENT'].includes(v.status)?'ok':'err';status(v.status+'. So sánh này không import hay sửa local history.',''+kind);}catch(e){status(String(e&&e.message||e),'err');}});
  }

  global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE=Object.freeze({version:'settlement-preproduction-review-bundle-v1',FORMAT,MODE,bundleWithoutIntegrity,authorityValid,compactReviewIndex,packageIndexFromEvents,buildBundle,verifyBundle,compareWithLocalHistory});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
