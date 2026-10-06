(function(global){
  'use strict';

  const META_KEY='preproduction_review_history_v1';
  const FORMAT='kts-preproduction-review-history-event-v1';
  const SHA256_RE=/^[0-9a-f]{64}$/i;
  const STATES=Object.freeze({CURRENT:'CURRENT',STALE:'STALE',TAMPERED:'TAMPERED',UNVERIFIABLE:'UNVERIFIABLE'});

  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function same(a,b){return String(a==null?'':a)===String(b==null?'':b);}
  function deps(){
    const store=global.KTS_SETTLEMENT_STORE,qualification=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY,review=global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW;
    if(!store||!qualification||!review||typeof review.inspectPackage!=='function'||typeof review.verifyHumanReviewRecord!=='function')throw new Error('PREPRODUCTION_REVIEW_HISTORY_DEPENDENCY_MISSING');
    return {store,qualification,review};
  }
  function eventWithoutIntegrity(event){const copy=clone(event||{});delete copy.integrity;return copy;}
  function makeId(){if(global.crypto&&typeof global.crypto.randomUUID==='function')return 'preprod_review_event_'+global.crypto.randomUUID();return 'preprod_review_event_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
  function authorityValid(a){return Boolean(a&&a.evidence_only===true&&a.read_only_review===true&&a.production_enabled===false&&a.merge_authorized===false&&a.deploy_authorized===false&&a.mutates_settlement===false&&a.production_approval_recorded===false);}
  async function readRow(){const {store}=deps();const row=await store.get(store.STORES.metadata,META_KEY);return row&&Array.isArray(row.events)?row:{key:META_KEY,version:1,events:[]};}
  function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('PREPRODUCTION_REVIEW_HISTORY_TX_FAILED'));tx.onabort=()=>reject(tx.error||new Error('PREPRODUCTION_REVIEW_HISTORY_TX_ABORTED'));});}
  async function writeRow(row){const {store}=deps(),db=await store.openDb();try{const tx=db.transaction(store.STORES.metadata,'readwrite');tx.objectStore(store.STORES.metadata).put(clone(row));await txDone(tx);}finally{db.close();}return row;}

  async function verifyQualificationLink(pkg){
    const {qualification}=deps();
    const source=pkg&&pkg.source_ready_event||{},events=await qualification.listEvents();
    const match=(events||[]).find(x=>String(x&&x.id||'')===String(source.id||''));
    if(!match)return {status:'UNVERIFIABLE',error:'QUALIFICATION_SOURCE_EVENT_NOT_FOUND'};
    if(match.ready_for_production_review!==true||String(match.qualification_state)!=='READY_FOR_PRODUCTION_REVIEW')return {status:'TAMPERED',error:'QUALIFICATION_SOURCE_EVENT_NOT_READY'};
    if(!same(match.input_fingerprint_sha256,source.input_fingerprint_sha256))return {status:'TAMPERED',error:'QUALIFICATION_SOURCE_FINGERPRINT_MISMATCH'};
    for(const name of qualification.COMPONENTS||[]){if(!same(match.component_fingerprints&&match.component_fingerprints[name],source.component_fingerprints&&source.component_fingerprints[name]))return {status:'TAMPERED',error:'QUALIFICATION_SOURCE_COMPONENT_MISMATCH:'+name};}
    return {status:'VERIFIED',event_id:String(match.id),input_fingerprint_sha256:String(match.input_fingerprint_sha256||'')};
  }

  async function verifyPackageRecordLink(pkg,record){
    const {review}=deps(),errors=[];
    const packageCheck=await review.inspectPackage(pkg);
    if(!packageCheck.valid)errors.push('PACKAGE_INVALID:'+packageCheck.errors.join('|'));
    const recordCheck=await review.verifyHumanReviewRecord(record);
    if(!recordCheck.valid)errors.push('REVIEW_RECORD_INVALID:'+recordCheck.errors.join('|'));
    if(!same(record&&record.package&&record.package.package_payload_sha256,pkg&&pkg.integrity&&pkg.integrity.payload_sha256))errors.push('REVIEW_PACKAGE_SHA_MISMATCH');
    if(!same(record&&record.package&&record.package.source_ready_event_id,pkg&&pkg.source_ready_event&&pkg.source_ready_event.id))errors.push('REVIEW_SOURCE_EVENT_MISMATCH');
    if(!same(record&&record.package&&record.package.input_fingerprint_sha256,pkg&&pkg.manifest&&pkg.manifest.input_fingerprint_sha256))errors.push('REVIEW_INPUT_FINGERPRINT_MISMATCH');
    const packaged=record&&record.verification&&record.verification.packaged||{};
    if(packaged.payload_sha256&&!same(packaged.payload_sha256,pkg&&pkg.integrity&&pkg.integrity.payload_sha256))errors.push('REVIEW_RECOMPUTED_PACKAGE_SHA_MISMATCH');
    return {valid:errors.length===0,errors,package_check:packageCheck,record_check:recordCheck};
  }

  async function buildEvent(pkg,record,previous,sequence,qualificationLink){
    const {qualification}=deps();
    const manifest=pkg&&pkg.manifest||{};
    const event={
      format:FORMAT,id:makeId(),sequence:Number(sequence||1),recorded_at:new Date().toISOString(),
      authority:{evidence_only:true,read_only_review:true,production_enabled:false,merge_authorized:false,deploy_authorized:false,mutates_settlement:false,production_approval_recorded:false},
      qualification_link:{source_event_id:String(pkg&&pkg.source_ready_event&&pkg.source_ready_event.id||''),status:String(qualificationLink&&qualificationLink.status||'UNVERIFIABLE'),input_fingerprint_sha256:String(pkg&&pkg.source_ready_event&&pkg.source_ready_event.input_fingerprint_sha256||'')},
      package_link:{format:String(pkg&&pkg.format||''),package_payload_sha256:String(pkg&&pkg.integrity&&pkg.integrity.payload_sha256||''),input_fingerprint_sha256:String(manifest.input_fingerprint_sha256||''),component_fingerprints:clone(manifest.component_fingerprints||{})},
      review_link:{record_sha256:String(record&&record.integrity&&record.integrity.record_sha256||''),verdict:String(record&&record.verification&&record.verification.verdict||'UNVERIFIABLE'),reviewed_at:String(record&&record.reviewed_at||''),reviewer:String(record&&record.human&&record.human.reviewer||'')},
      context:{scope:clone(pkg&&pkg.scope||{}),qualification_snapshot:clone(pkg&&pkg.qualification_snapshot||{}),component_fingerprints:clone(manifest.component_fingerprints||{})},
      record:clone(record),
      previous_event_id:previous?String(previous.id||''):null,
      previous_event_sha256:previous?String(previous.integrity&&previous.integrity.event_sha256||''):null
    };
    for(const name of qualification.COMPONENTS||[]){if(!SHA256_RE.test(String(event.package_link.component_fingerprints[name]||'')))throw new Error('PREPRODUCTION_REVIEW_HISTORY_COMPONENT_SHA_INVALID:'+name);}
    event.integrity={algorithm:'sha256',event_sha256:await qualification.sha256Hex(eventWithoutIntegrity(event))};
    return event;
  }

  async function verifyEvent(event,previous,index){
    const {qualification,review}=deps(),errors=[];
    if(!event||String(event.format)!==FORMAT)errors.push('EVENT_FORMAT_INVALID');
    if(Number(event&&event.sequence)!==Number(index)+1)errors.push('EVENT_SEQUENCE_INVALID');
    if(!authorityValid(event&&event.authority))errors.push('EVENT_AUTHORITY_INVALID');
    if(previous){if(!same(event.previous_event_id,previous.id))errors.push('EVENT_PREVIOUS_ID_MISMATCH');if(!same(event.previous_event_sha256,previous.integrity&&previous.integrity.event_sha256))errors.push('EVENT_PREVIOUS_SHA_MISMATCH');}
    else if(event&&(event.previous_event_id!=null||event.previous_event_sha256!=null))errors.push('EVENT_GENESIS_LINK_INVALID');
    const sha=event&&event.integrity&&event.integrity.event_sha256;
    if(!SHA256_RE.test(String(sha||'')))errors.push('EVENT_SHA_INVALID');
    else if(!same(await qualification.sha256Hex(eventWithoutIntegrity(event)),sha))errors.push('EVENT_SHA_MISMATCH');
    const recordCheck=await review.verifyHumanReviewRecord(event&&event.record);
    if(!recordCheck.valid)errors.push('EVENT_REVIEW_RECORD_INVALID:'+recordCheck.errors.join('|'));
    if(!same(event&&event.review_link&&event.review_link.record_sha256,event&&event.record&&event.record.integrity&&event.record.integrity.record_sha256))errors.push('EVENT_REVIEW_SHA_LINK_MISMATCH');
    if(!same(event&&event.package_link&&event.package_link.package_payload_sha256,event&&event.record&&event.record.package&&event.record.package.package_payload_sha256))errors.push('EVENT_PACKAGE_SHA_LINK_MISMATCH');
    if(!same(event&&event.qualification_link&&event.qualification_link.source_event_id,event&&event.record&&event.record.package&&event.record.package.source_ready_event_id))errors.push('EVENT_QUALIFICATION_LINK_MISMATCH');
    return {valid:errors.length===0,errors};
  }

  async function verifyChain(events){
    const rows=Array.isArray(events)?events:[],errors=[];
    for(let i=0;i<rows.length;i++){const checked=await verifyEvent(rows[i],i?rows[i-1]:null,i);if(!checked.valid)errors.push({index:i,id:String(rows[i]&&rows[i].id||''),errors:checked.errors});}
    return {valid:errors.length===0,errors,count:rows.length,head_event_sha256:rows.length?String(rows[rows.length-1].integrity&&rows[rows.length-1].integrity.event_sha256||''):null};
  }

  async function appendReview(pkg,record){
    const link=await verifyPackageRecordLink(pkg,record);if(!link.valid)throw new Error('PREPRODUCTION_REVIEW_HISTORY_LINK_INVALID:'+link.errors.join('|'));
    const qualificationLink=await verifyQualificationLink(pkg);
    if(qualificationLink.status==='TAMPERED')throw new Error('PREPRODUCTION_REVIEW_HISTORY_QUALIFICATION_LINK_TAMPERED:'+qualificationLink.error);
    const row=await readRow(),chain=await verifyChain(row.events);if(!chain.valid)throw new Error('PREPRODUCTION_REVIEW_HISTORY_CHAIN_TAMPERED');
    const previous=row.events.length?row.events[row.events.length-1]:null,event=await buildEvent(pkg,record,previous,row.events.length+1,qualificationLink);
    row.events.push(event);row.updated_at=new Date().toISOString();await writeRow(row);
    return clone(event);
  }

  async function listEvents(){const row=await readRow(),chain=await verifyChain(row.events);return {events:clone(row.events),chain};}

  async function checkEventValidity(event){
    const {qualification}=deps();
    const eventCheck=await verifyEvent(event,null,Number(event&&event.sequence||1)-1).catch(e=>({valid:false,errors:[String(e&&e.message||e)]}));
    if(!eventCheck.valid)return {status:STATES.TAMPERED,current:false,changed_components:[],errors:eventCheck.errors};
    const original=String(event&&event.review_link&&event.review_link.verdict||'UNVERIFIABLE');
    if(original==='TAMPERED')return {status:STATES.TAMPERED,current:false,changed_components:[],errors:['ORIGINAL_REVIEW_TAMPERED']};
    if(original==='UNVERIFIABLE')return {status:STATES.UNVERIFIABLE,current:false,changed_components:[],errors:['ORIGINAL_REVIEW_UNVERIFIABLE']};
    if(original==='STALE')return {status:STATES.STALE,current:false,changed_components:clone(event&&event.record&&event.record.verification&&event.record.verification.changed_components||[]),errors:['ORIGINAL_REVIEW_STALE']};
    const qLinkEvents=await qualification.listEvents(),source=(qLinkEvents||[]).find(x=>String(x&&x.id||'')===String(event&&event.qualification_link&&event.qualification_link.source_event_id||''));
    if(!source)return {status:STATES.UNVERIFIABLE,current:false,changed_components:[],errors:['QUALIFICATION_SOURCE_EVENT_NOT_FOUND']};
    if(!same(source.input_fingerprint_sha256,event.qualification_link.input_fingerprint_sha256))return {status:STATES.TAMPERED,current:false,changed_components:['qualification'],errors:['QUALIFICATION_SOURCE_FINGERPRINT_MISMATCH']};
    try{
      const material=await qualification.collectMaterial(event.context.qualification_snapshot,event.context.scope,{probe_parser_backend:true});
      if(!material.parser_backend||material.parser_backend.status!=='available')return {status:STATES.UNVERIFIABLE,current:false,changed_components:['parser_backend'],errors:[String(material.parser_backend&&material.parser_backend.error||'PARSER_BACKEND_IDENTITY_UNAVAILABLE')]};
      const components=await qualification.componentFingerprints(material),fingerprint=await qualification.overallFingerprint(event.context.scope,components),changed=(qualification.COMPONENTS||[]).filter(n=>!same(components[n],event.package_link.component_fingerprints&&event.package_link.component_fingerprints[n]));
      const current=same(fingerprint,event.package_link.input_fingerprint_sha256)&&changed.length===0;
      return {status:current?STATES.CURRENT:STATES.STALE,current,changed_components:changed,errors:current?[]:['REVIEW_CURRENT_STATE_CHANGED'],current_input_fingerprint_sha256:fingerprint};
    }catch(e){return {status:STATES.UNVERIFIABLE,current:false,changed_components:[],errors:[String(e&&e.message||e)]};}
  }

  async function checkLatestValidity(){
    const listed=await listEvents();if(!listed.chain.valid)return {status:STATES.TAMPERED,current:false,chain:listed.chain,event:null,errors:['PREPRODUCTION_REVIEW_HISTORY_CHAIN_TAMPERED']};
    if(!listed.events.length)return {status:'NO_REVIEW_EVIDENCE',current:false,chain:listed.chain,event:null,errors:[]};
    const event=listed.events[listed.events.length-1],validity=await checkEventValidity(event);return Object.assign({},validity,{chain:listed.chain,event:clone(event)});
  }

  function installUi(){
    const doc=global.document,pane=doc&&doc.getElementById('pane-report');if(!pane||doc.getElementById('preproductionReviewHistoryPanel'))return;
    const card=doc.createElement('div');card.className='card';card.id='preproductionReviewHistoryPanel';
    card.innerHTML=`<div class="section-title">Review chain-of-custody · append-only</div><div class="hint">Nạp đúng dry-run package và human review record tương ứng để pin vào chuỗi evidence. Mỗi mốc nối SHA với mốc trước và qualification source; chỉ ghi metadata review, không sửa settlement, không merge/deploy/production.</div><div class="grid" style="margin-top:8px"><div><label>Dry-run package JSON</label><input id="preproductionHistoryPackage" type="file" accept=".json,application/json"></div><div><label>Human review record JSON</label><input id="preproductionHistoryRecord" type="file" accept=".json,application/json"></div></div><div class="row" style="margin-top:8px"><button id="preproductionHistoryAppend" class="btn primary">Xác minh + pin evidence</button><button id="preproductionHistoryRefresh" class="btn soft">Nạp lịch sử</button><button id="preproductionHistoryCheck" class="btn soft">Kiểm review gần nhất</button></div><div id="preproductionHistoryStatus" class="status"></div><div id="preproductionHistoryOutput" class="hint"></div>`;
    const anchor=doc.getElementById('preproductionReviewPanel')||doc.getElementById('preproductionPackagePanel')||doc.getElementById('qualificationHistoryPanel');pane.insertBefore(card,anchor&&anchor.nextSibling||pane.firstChild);
    const status=(text,kind)=>{const el=doc.getElementById('preproductionHistoryStatus');el.textContent=text||'';el.className='status '+(kind||'');};
    async function fileJson(id){const input=doc.getElementById(id),file=input.files&&input.files[0];if(!file)throw new Error('PREPRODUCTION_REVIEW_HISTORY_FILE_REQUIRED:'+id);return JSON.parse(await file.text());}
    async function render(){const listed=await listEvents(),host=doc.getElementById('preproductionHistoryOutput');if(!listed.chain.valid){host.innerHTML='<div class="status err">CHAIN TAMPERED</div>';status('Review history chain không còn hợp lệ. Không được append thêm evidence.','err');return;}const rows=[...listed.events].reverse().slice(0,20);host.innerHTML=rows.length?rows.map(e=>`<div class="report-message"><div><span class="tag">#${esc(e.sequence)}</span> <b>${esc(e.review_link&&e.review_link.verdict||'—')}</b> · ${esc(e.recorded_at)}</div><div class="hint">qualification: ${esc(e.qualification_link&&e.qualification_link.source_event_id||'—')}</div><div class="hint">package SHA ${esc(String(e.package_link&&e.package_link.package_payload_sha256||'').slice(0,16))}… · review SHA ${esc(String(e.review_link&&e.review_link.record_sha256||'').slice(0,16))}… · event SHA ${esc(String(e.integrity&&e.integrity.event_sha256||'').slice(0,16))}…</div></div>`).join(''):'<div class="hint">Chưa có human review evidence được pin.</div>';status(`${listed.events.length} review evidence · chain ${listed.chain.valid?'VALID':'INVALID'}.`,'ok');}
    doc.getElementById('preproductionHistoryAppend').addEventListener('click',async event=>{const btn=event.currentTarget;try{btn.disabled=true;status('Đang verify package + human record + qualification link + SHA chain…','warn');const pkg=await fileJson('preproductionHistoryPackage'),record=await fileJson('preproductionHistoryRecord'),saved=await appendReview(pkg,record);status('Đã pin review evidence #'+saved.sequence+' · event SHA '+String(saved.integrity.event_sha256).slice(0,16)+'… Không có production mutation.','ok');await render();}catch(e){status(String(e&&e.message||e),'err');}finally{btn.disabled=false;}});
    doc.getElementById('preproductionHistoryRefresh').addEventListener('click',()=>render().catch(e=>status(String(e&&e.message||e),'err')));
    doc.getElementById('preproductionHistoryCheck').addEventListener('click',async()=>{try{status('Đang kiểm toàn SHA chain + qualification source + runtime/data/parser hiện tại…','warn');const v=await checkLatestValidity();const kind=v.status==='CURRENT'?'ok':v.status==='UNVERIFIABLE'||v.status==='NO_REVIEW_EVIDENCE'?'warn':'err';status(v.status+(v.changed_components&&v.changed_components.length?' · changed: '+v.changed_components.join(', '):'')+'. Review evidence không cấp quyền production.',kind);}catch(e){status(String(e&&e.message||e),'err');}});
    render().catch(()=>{});
  }

  global.KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY=Object.freeze({version:'settlement-preproduction-review-history-v1',META_KEY,FORMAT,STATES,eventWithoutIntegrity,authorityValid,verifyQualificationLink,verifyPackageRecordLink,buildEvent,verifyEvent,verifyChain,appendReview,listEvents,checkEventValidity,checkLatestValidity});
  if(global.document&&global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installUi,{once:true});else if(global.document)installUi();
})(typeof window!=='undefined'?window:globalThis);
