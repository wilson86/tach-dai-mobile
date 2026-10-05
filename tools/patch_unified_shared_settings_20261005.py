from pathlib import Path
import json
import re

app_path = Path('app/index.html')
s = app_path.read_text(encoding='utf-8')

assert 'Unified 1.0.3' in s
s = s.replace('Unified 1.0.3', 'Unified 1.0.4', 1)

css_anchor = ".contract{padding:9px 10px;border-radius:10px;background:#eef8f3;color:#05603a;font-weight:750;font-size:12px;margin-bottom:10px}\n"
assert css_anchor in s
s = s.replace(css_anchor, css_anchor + ".shared-settings{margin-bottom:9px}.shared-settings .schedule{margin-bottom:0}.mode-settings-legacy{display:none!important}\n", 1)

head_anchor = '  <div class="head"><div class="title">KTS Tách Đài <span style="font-size:12px;color:#667085;font-weight:650">Unified 1.0.4</span></div><div class="badge">PC tắt vẫn chạy</div></div>\n'
assert head_anchor in s
shared_html = '''  <div id="sharedSettings" class="card shared-settings">
    <div class="controls">
      <div><label class="small" for="sharedRegion">Miền dùng chung</label><select id="sharedRegion"><option value="mn">Miền Nam</option><option value="mt">Miền Trung</option><option value="mb">Miền Bắc</option></select></div>
      <div><label class="small" for="sharedDate">Ngày dùng chung</label><input id="sharedDate" type="date"></div>
    </div>
    <label class="today"><input id="sharedToday" type="checkbox" checked> Hôm nay</label>
    <div id="sharedSchedule" class="schedule">Đang nạp lịch dùng chung…</div>
  </div>
'''
s = s.replace(head_anchor, head_anchor + shared_html, 1)

s, n = re.subn(
    r'<div class="card">(\s*<div class="controls">\s*<div><label class="small" for="dvRegion">)',
    r'<div id="dvLegacySettings" class="card mode-settings-legacy">\1',
    s,
    count=1,
)
assert n == 1, 'Đá Vòng legacy settings card not found'

js_anchor = "function parseLocalDate(v){return new Date(`${v}T12:00:00`)}\n"
assert js_anchor in s
shared_js = r'''
const SHARED_SETTINGS_KEY='kts_unified_shared_settings_v1';
function sharedState(){
  const region=$('sharedRegion').value;
  const today=$('sharedToday').checked;
  const date=$('sharedDate').value||localDateISO();
  return {region:['mn','mt','mb'].includes(region)?region:'mn',date,today};
}
function hideChildModeSettings(frameId,state){
  try{
    const frame=$(frameId), doc=frame&&frame.contentDocument;
    if(!doc) return;
    const region=doc.getElementById('region'), date=doc.getElementById('date'), today=doc.getElementById('today');
    if(!region||!date||!today) return;
    const card=region.closest('.card'), controls=region.closest('.controls');
    if(region.parentElement) region.parentElement.style.display='none';
    if(date.parentElement) date.parentElement.style.display='none';
    const todayLabel=today.closest('label'); if(todayLabel) todayLabel.style.display='none';
    const schedule=doc.getElementById('schedule'); if(schedule) schedule.style.display='none';
    if(frameId==='tachFrame'){
      const mb=doc.getElementById('mbSplitControl');
      if(mb&&state.region==='mb'){
        if(card) card.style.display='block';
        if(controls) controls.style.gridTemplateColumns='1fr';
        mb.style.display='block';
      }else if(card){card.style.display='none';}
    }else if(card){card.style.display='none';}
  }catch(_){}
}
function syncFrameSettings(frameId,state){
  try{
    const frame=$(frameId), win=frame&&frame.contentWindow, doc=frame&&frame.contentDocument;
    if(!win||!doc) return;
    const region=doc.getElementById('region'), date=doc.getElementById('date'), today=doc.getElementById('today');
    if(!region||!date||!today) return;
    region.value=state.region;
    today.checked=state.today;
    date.value=state.date;
    if(typeof win.updateUI==='function') win.updateUI();
    hideChildModeSettings(frameId,state);
  }catch(_){}
}
function syncHiddenDaVong(state){
  $('dvRegion').value=state.region;
  $('dvToday').checked=state.today;
  $('dvDate').value=state.date;
  $('dvDate').disabled=state.today;
  updateDvSchedule();
}
function updateSharedSchedule(){
  const out=$('sharedSchedule');
  if(!out) return;
  try{
    const state=sharedState(), w=engine(), d=parseLocalDate(state.date), stations=w.getSchedule(state.region,d)||[];
    const day=['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][d.getDay()];
    const label={mn:'Miền Nam',mt:'Miền Trung',mb:'Miền Bắc'}[state.region];
    const names=stations.map((x,i)=>`${x[1]||x[0]} (${i<2?'chính':'phụ'})`).join(' - ');
    out.textContent=`${label} · ${day} · ${names||'Miền Bắc'}`;
  }catch(_){out.textContent='Đang nạp lịch dùng chung…';}
}
function syncSharedSettings(){
  const date=$('sharedDate'), today=$('sharedToday');
  if(today.checked){date.value=localDateISO();date.disabled=true;}
  else{date.disabled=false;if(!date.value)date.value=localDateISO();}
  const state=sharedState();
  try{localStorage.setItem(SHARED_SETTINGS_KEY,JSON.stringify(state));}catch(_){}
  syncHiddenDaVong(state);
  syncFrameSettings('tachFrame',state);
  syncFrameSettings('ngangFrame',state);
  updateSharedSchedule();
}
function loadSharedSettings(){
  const date=$('sharedDate'), region=$('sharedRegion'), today=$('sharedToday');
  date.value=localDateISO();
  try{
    const raw=localStorage.getItem(SHARED_SETTINGS_KEY)||localStorage.getItem('tachDaiMobileSettings')||'{}';
    const saved=JSON.parse(raw);
    if(['mn','mt','mb'].includes(saved.region)) region.value=saved.region;
    if(typeof saved.today==='boolean') today.checked=saved.today;
    if(saved.date) date.value=saved.date;
  }catch(_){}
  syncSharedSettings();
}
'''
s = s.replace(js_anchor, js_anchor + shared_js, 1)

old_tail = """$('dvRegion').addEventListener('change',updateDvSchedule);
$('dvDate').value=localDateISO();
$('dvDate').addEventListener('change',()=>{$('dvToday').checked=false;$('dvDate').disabled=false;updateDvSchedule()});
$('dvToday').addEventListener('change',updateToday);
$('tachFrame').addEventListener('load',()=>{updateDvSchedule();try{const w=engine();if(w.KTS_BUSINESS_ENGINE.ENGINE_SHA256===EXPECTED_ENGINE)setDvStatus('Engine 6ce6 đã sẵn sàng.','ok')}catch(e){setDvStatus(String(e.message||e),'err')}});
updateToday();"""
new_tail = """$('sharedRegion').addEventListener('change',syncSharedSettings);
$('sharedDate').addEventListener('change',()=>{$('sharedToday').checked=false;syncSharedSettings()});
$('sharedToday').addEventListener('change',syncSharedSettings);
$('tachFrame').addEventListener('load',()=>{syncSharedSettings();try{const w=engine();if(w.KTS_BUSINESS_ENGINE.ENGINE_SHA256===EXPECTED_ENGINE)setDvStatus('Engine 6ce6 đã sẵn sàng.','ok')}catch(e){setDvStatus(String(e.message||e),'err')}});
$('ngangFrame').addEventListener('load',syncSharedSettings);
loadSharedSettings();"""
assert old_tail in s, 'Unified settings event block not found'
s = s.replace(old_tail, new_tail, 1)

app_path.write_text(s, encoding='utf-8')

version_path=Path('app/version.json')
v=json.loads(version_path.read_text(encoding='utf-8'))
v['version']='1.0.4'
v['updated']='2026-10-05'
for item in ['shared_region_date_across_modes','shared_schedule_across_modes','hide_duplicate_mode_settings']:
    if item not in v.setdefault('ux',[]): v['ux'].append(item)
version_path.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

sw_path=Path('app/sw.js')
sw=sw_path.read_text(encoding='utf-8')
assert "const CACHE='kts-tach-unified-v1.0.3-cut-sync-6ce6';" in sw
sw=sw.replace("const CACHE='kts-tach-unified-v1.0.3-cut-sync-6ce6';","const CACHE='kts-tach-unified-v1.0.4-shared-settings-6ce6';",1)
sw_path.write_text(sw,encoding='utf-8')

test_path=Path('tests/unified-static-tests.js')
t=test_path.read_text(encoding='utf-8')
assert "assert.equal(version.version,'1.0.3');" in t
assert r"assert.match(sw,/kts-tach-unified-v1\.0\.3-cut-sync-6ce6/);" in t
t=t.replace("assert.equal(version.version,'1.0.3');","assert.equal(version.version,'1.0.4');",1)
t=t.replace(r"assert.match(sw,/kts-tach-unified-v1\.0\.3-cut-sync-6ce6/);",r"assert.match(sw,/kts-tach-unified-v1\.0\.4-shared-settings-6ce6/);",1)
t += """
assert.match(app,/id=\"sharedRegion\"/);
assert.match(app,/id=\"sharedDate\"/);
assert.match(app,/id=\"sharedToday\"/);
assert.match(app,/id=\"sharedSchedule\"/);
assert.match(app,/syncFrameSettings\('tachFrame'/);
assert.match(app,/syncFrameSettings\('ngangFrame'/);
assert.match(app,/id=\"dvLegacySettings\" class=\"card mode-settings-legacy\"/);
"""
test_path.write_text(t,encoding='utf-8')
