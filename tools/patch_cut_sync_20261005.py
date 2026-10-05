from pathlib import Path
import json

# Root Tách Đài
p = Path('index.html')
s = p.read_text(encoding='utf-8')
anchor = '''  if(typeof textarea.setSelectionRange==="function") textarea.setSelectionRange(0,textarea.value.length);
  else if(typeof textarea.select==="function") textarea.select();
}'''
repl = '''  if(typeof textarea.setSelectionRange==="function") textarea.setSelectionRange(0,textarea.value.length);
  else if(typeof textarea.select==="function") textarea.select();
  if(textarea===outputEl) lastOutputSelection={start:0,end:textarea.value.length};
}'''
assert anchor in s, 'root selectAll anchor missing'
s = s.replace(anchor, repl, 1)
assert 'async function cutSelectedOutput(){\n  const indexes=' in s, 'root cut function anchor missing'
s = s.replace('async function cutSelectedOutput(){\n  const indexes=', 'async function cutSelectedOutput(){\n  rememberOutputSelection();\n  const indexes=', 1)
old = '''  await writeClipboardText(selectedText);

  const inputBefore=inputEl.value;'''
new = '''  const copied=await writeClipboardText(selectedText);
  if(!copied){
    setStatus("Không thể ghi phần đã cắt vào bộ nhớ tạm. Tin chưa bị xóa.","err");
    return;
  }

  const inputBefore=inputEl.value;'''
assert old in s, 'root clipboard anchor missing'
s = s.replace(old, new, 1)
s = s.replace('Đã cắt ${indexes.length} dòng • đã xóa tin gốc tương ứng', 'Đã cắt ${indexes.length} dòng • đã copy • đã xóa tin gốc tương ứng', 1)
s = s.replace('Đã cắt ${indexes.length} dòng • tin gốc vẫn giữ vì chưa cắt đủ', 'Đã cắt ${indexes.length} dòng • đã copy • tin gốc giữ đến khi cắt hết kết quả của tin đó', 1)
s = s.replace('2.0.19', '2.0.20')
p.write_text(s, encoding='utf-8')

vp = Path('version.json')
v = json.loads(vp.read_text(encoding='utf-8'))
v['version'] = '2.0.20'
v['updated'] = '2026-10-05'
v['notes'] = 'Cut writes clipboard before removing result/source, remembers Select All across button focus, and keeps source until all derived outputs are cut; business engine unchanged.'
vp.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sp = Path('sw.js')
sw = sp.read_text(encoding='utf-8')
assert 'tach-dai-mobile-v2.0.19' in sw, 'root cache anchor missing'
sw = sw.replace('tach-dai-mobile-v2.0.19', 'tach-dai-mobile-v2.0.20-cut-sync').replace('version:"2.0.19"', 'version:"2.0.20"')
sp.write_text(sw, encoding='utf-8')

# Unified shell + Đá Vòng
ap = Path('app/index.html')
a = ap.read_text(encoding='utf-8')
a = a.replace('<iframe id="tachFrame" class="frame" src="../" title="Tách Đài 3 Miền"></iframe>', '<iframe id="tachFrame" class="frame" src="../" title="Tách Đài 3 Miền" allow="clipboard-write"></iframe>')
a = a.replace('<iframe id="ngangFrame" class="frame" src="https://wilson86.github.io/tach-dai-ngang/" title="Tách Đài Ngang 3 Miền"></iframe>', '<iframe id="ngangFrame" class="frame" src="https://wilson86.github.io/tach-dai-ngang/" title="Tách Đài Ngang 3 Miền" allow="clipboard-write"></iframe>')
old = "function selectAllText(el){if(!el)return;el.focus();if(typeof el.setSelectionRange==='function')el.setSelectionRange(0,String(el.value||'').length)}"
new = """let dvLastSelection={start:0,end:0};
function rememberDvSelection(){const el=$('dvOutput'),a=el.selectionStart??0,b=el.selectionEnd??a;if(b>a)dvLastSelection={start:a,end:b}}
function selectAllText(el){if(!el)return;el.focus();if(typeof el.setSelectionRange==='function')el.setSelectionRange(0,String(el.value||'').length);if(el===$('dvOutput'))dvLastSelection={start:0,end:String(el.value||'').length}}
async function writeDvClipboardText(text){if(!text)return false;try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true}}catch(_){}const tmp=document.createElement('textarea');tmp.value=text;tmp.style.position='fixed';tmp.style.left='-9999px';document.body.appendChild(tmp);tmp.focus();tmp.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}tmp.remove();return !!ok;}"""
assert old in a, 'unified selectAll anchor missing'
a = a.replace(old, new, 1)
old = "$('dvCutSelection').addEventListener('click',()=>{const el=$('dvOutput'),a=el.selectionStart,b=el.selectionEnd;if(!(b>a)){setDvStatus('Chưa chọn phần kết quả cần cắt.','err');return}el.value=el.value.slice(0,a)+el.value.slice(b);el.setSelectionRange(a,a);const count=bettingPayloadFromDisplay(el.value).split(/\\r?\\n/).filter(Boolean).length;$('dvResultLabel').textContent=`Kết quả (${count})`;setDvStatus(`Đã cắt phần chọn · còn ${count} tin`,'ok')});"
new = """$('dvOutput').addEventListener('select',rememberDvSelection);
$('dvOutput').addEventListener('mouseup',rememberDvSelection);
$('dvOutput').addEventListener('touchend',()=>setTimeout(rememberDvSelection,0));
$('dvCutSelection').addEventListener('pointerdown',rememberDvSelection);
$('dvCutSelection').addEventListener('touchstart',rememberDvSelection,{passive:true});
$('dvCutSelection').addEventListener('click',async()=>{const el=$('dvOutput');rememberDvSelection();let a=dvLastSelection.start,b=dvLastSelection.end;const ca=el.selectionStart??0,cb=el.selectionEnd??ca;if(cb>ca){a=ca;b=cb}if(!(b>a)){setDvStatus('Chưa chọn phần kết quả cần cắt.','err');return}const selectedPayload=bettingPayloadFromDisplay(el.value.slice(a,b));if(!selectedPayload){setDvStatus('Phần chọn không có tin cược để cắt.','err');return}const copied=await writeDvClipboardText(selectedPayload);if(!copied){setDvStatus('Không thể ghi phần đã cắt vào bộ nhớ tạm. Tin chưa bị xóa.','err');return}el.value=el.value.slice(0,a)+el.value.slice(b);el.setSelectionRange(a,a);dvLastSelection={start:0,end:0};const count=bettingPayloadFromDisplay(el.value).split(/\\r?\\n/).filter(Boolean).length;if(count===0)$('dvInput').value='';$('dvResultLabel').textContent=`Kết quả (${count})`;setDvStatus(count===0?'Đã cắt + copy · đã xóa tin gốc':'Đã cắt + copy · tin gốc giữ đến khi cắt hết kết quả của tin đó','ok')});"""
assert old in a, 'unified cut anchor missing'
a = a.replace(old, new, 1)
oldcopy = "$('dvCopy').addEventListener('click',async()=>{const text=bettingPayloadFromDisplay($('dvOutput').value);if(!text)return;try{await navigator.clipboard.writeText(text);setDvStatus('Đã copy kết quả cược (không kèm gạch phân nhóm)','ok')}catch(_){const el=$('dvOutput'),old=el.value;el.removeAttribute('readonly');el.value=text;el.select();document.execCommand('copy');el.value=old;el.setAttribute('readonly','');setDvStatus('Đã copy kết quả cược (không kèm gạch phân nhóm)','ok')}});"
newcopy = "$('dvCopy').addEventListener('click',async()=>{const text=bettingPayloadFromDisplay($('dvOutput').value);if(!text)return;const ok=await writeDvClipboardText(text);setDvStatus(ok?'Đã copy kết quả cược (không kèm gạch phân nhóm)':'Không thể ghi bộ nhớ tạm.',ok?'ok':'err')});"
assert oldcopy in a, 'unified copy anchor missing'
a = a.replace(oldcopy, newcopy, 1).replace('Unified 1.0.2', 'Unified 1.0.3')
ap.write_text(a, encoding='utf-8')

avp = Path('app/version.json')
av = json.loads(avp.read_text(encoding='utf-8'))
av['version'] = '1.0.3'
av['updated'] = '2026-10-05'
for x in ['cut_copies_clipboard','cut_clears_source_when_complete','iframe_clipboard_write_permission']:
    if x not in av.setdefault('ux', []): av['ux'].append(x)
avp.write_text(json.dumps(av, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

acp = Path('app/unified-core.js')
ac = acp.read_text(encoding='utf-8')
assert "const UX_VERSION='1.0.2';" in ac, 'unified core version anchor missing'
acp.write_text(ac.replace("const UX_VERSION='1.0.2';", "const UX_VERSION='1.0.3';"), encoding='utf-8')

asw = Path('app/sw.js')
aws = asw.read_text(encoding='utf-8')
assert "const CACHE='kts-tach-unified-v1.0.2-da-vong-final-6ce6';" in aws, 'unified cache anchor missing'
asw.write_text(aws.replace("const CACHE='kts-tach-unified-v1.0.2-da-vong-final-6ce6';", "const CACHE='kts-tach-unified-v1.0.3-cut-sync-6ce6';"), encoding='utf-8')

# Update only affected static contract assertions.
ut = Path('tests/unified-static-tests.js')
u = ut.read_text(encoding='utf-8')
u = u.replace("assert.equal(version.version,'1.0.2');", "assert.equal(version.version,'1.0.3');")
u = u.replace("assert.match(sw,/kts-tach-unified-v1\\.0\\.2-da-vong-final-6ce6/);", "assert.match(sw,/kts-tach-unified-v1\\.0\\.3-cut-sync-6ce6/);")
u += '\nassert.match(app,/allow="clipboard-write"/);\nassert.match(app,/writeDvClipboardText/);\nassert.match(app,/Không thể ghi phần đã cắt vào bộ nhớ tạm/);\n'
ut.write_text(u, encoding='utf-8')
