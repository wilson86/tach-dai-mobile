"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const calendar = fs.readFileSync(path.join(root, "station_calendar.generated.js"), "utf8");
const businessEngine = fs.readFileSync(path.join(root, "business_engine.generated.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));

function loadRules() {
  const match = html.match(/<script>\s*([\s\S]*?)<\/script>/i);
  assert.ok(match, "index.html phải có script ứng dụng");
  const marker = 'loadSettings();';
  const source = match[1].slice(0, match[1].indexOf(marker));
  assert.ok(source.length > 0, "không tìm thấy phần rule tách/check");

  const elements = Object.create(null);
  const element = () => ({
    events: Object.create(null),
    addEventListener(type, handler) { this.events[type] = handler; },
    trigger(type) { return this.events[type]?.({ target: this }); },
    value: "",
    textContent: "",
    className: "",
    selectionStart: 0,
    selectionEnd: 0,
    style: {},
    focus() {},
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    remove() {}
  });
  const clipboard = {
    text: "",
    async writeText(value) { this.text = value; }
  };
  const context = {
    console,
    Set,
    Date,
    JSON,
    RegExp,
    String,
    Error,
    navigator: { clipboard },
    document: {
      getElementById(id) { return elements[id] || (elements[id] = element()); },
      createElement: element,
      body: { appendChild() {} },
      execCommand() { return true; }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${calendar}\n${businessEngine}\n${source}\nglobalThis.__rules={getSchedule,normalizeInput,preprocessChatText,validateCheckOnlyLine,processLine,distributeAmountExactly,auditMoneyConservation,run,cutSelectedOutput,triggerUndo:()=>document.getElementById("undoBtn").trigger("click"),getOutputRecords:()=>outputRecords.map(r=>({...r})),engine:KTS_BUSINESS_ENGINE,elements:{input:inputEl,output:outputEl,region:regionEl,date:dateEl,today:todayEl},clipboard:navigator.clipboard};`, context);
  return context.__rules;
}

function expectThrow(fn, expected) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  assert.ok(error, "phải báo lỗi");
  assert.match(error.message, expected);
}

async function main() {
const rules = loadRules();
const assertHalfUnitSplit=(amount,count)=>{
  const parts=rules.distributeAmountExactly(`${amount}n`,count).filter(Boolean);
  const units=parts.map(part=>{const m=part.match(/^(\d+)(?:[.,](\d+))?n$/u);assert.ok(m,`bad split token ${part}`);assert.ok(!m[2]||/^0*$/u.test(m[2])||/^50*$/u.test(m[2]),`quarter/other fraction ${part}`);return Number(m[1])*2+(m[2]&&!/^0*$/u.test(m[2])?1:0);});
  const source=Number(String(amount).replace(".5",""))*2+(String(amount).endsWith(".5")?1:0); assert.equal(units.reduce((a,b)=>a+b,0),source);
};
for(const amount of [1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,9,9.5,10,10.5,61]) for(const count of [2,3,4]) assertHalfUnitSplit(amount,count);
assert.deepEqual(Array.from(rules.distributeAmountExactly("7n",2)),["3.5n","3.5n"]);
assert.deepEqual(Array.from(rules.distributeAmountExactly("5.5n",2)),["2.5n","3n"]);
assert.deepEqual(Array.from(rules.distributeAmountExactly("2.5n",2)),["1n","1.5n"]);
assert.deepEqual(Array.from(rules.distributeAmountExactly("7n",3)),["2n","2.5n","2.5n"]);
expectThrow(()=>rules.distributeAmountExactly("5.25n",2),/SỐ TIỀN CHIA CHỈ ĐƯỢC PHÉP BƯỚC 0\.5/u);
const outputRecords = () => JSON.parse(JSON.stringify(rules.getOutputRecords()));
const saturday = new Date("2026-08-22T12:00:00");
const sunday = new Date("2026-08-23T12:00:00");
const monday = new Date("2026-08-24T12:00:00");
const mtSaturday = rules.getSchedule("mt", saturday);
const mnMonday = rules.getSchedule("mn", monday);
const mnFullAmountMonday = rules.getSchedule("mn", new Date("2026-09-07T12:00:00"));
const mnFullAmountSaturday = rules.getSchedule("mn", new Date("2026-09-12T12:00:00"));

// P1: normal generic 2d/3d/4d bets are full-stake exposure on every resolved station.
// This is deliberately unlike Tách Đài Ngang's horizontal amount allocation.
const mnStationExpansion = rules.getSchedule("mn", new Date("2026-09-05T12:00:00"));
const full2dLiveMismatch = Array.from(rules.processLine("2d 22 b10n dd30n", "mn", mnStationExpansion));
assert.deepEqual(full2dLiveMismatch, ["tp 22 b10n dd30n", "la 22 b10n dd30n"]);
assert.equal(rules.auditMoneyConservation("2d 22 b10n dd30n", full2dLiveMismatch).status, "PASS");
assert.ok(full2dLiveMismatch.every(x=>/b10n/.test(x)&&/dd30n/.test(x)));
const full3dB = Array.from(rules.processLine("3d 52 b20n", "mn", mnFullAmountMonday));
assert.deepEqual(full3dB, ["tp 52 b20n", "dt 52 b20n", "cm 52 b20n"]);
assert.equal(rules.auditMoneyConservation("3d 52 b20n", full3dB).status, "PASS");
const full3dMulti = Array.from(rules.processLine("3d 52 b20n dau30n duoi10n", "mn", mnFullAmountMonday));
assert.deepEqual(full3dMulti, ["tp 52 b20n dau30n duoi10n", "dt 52 b20n dau30n duoi10n", "cm 52 b20n dau30n duoi10n"]);
assert.equal(rules.auditMoneyConservation("3d 52 b20n dau30n duoi10n", full3dMulti).status, "PASS");
const full3dOdd = Array.from(rules.processLine("3d 952 b5n", "mn", mnFullAmountMonday));
assert.deepEqual(full3dOdd, ["tp 952 b5n", "dt 952 b5n", "cm 952 b5n"]);
assert.equal(rules.auditMoneyConservation("3d 952 b5n", full3dOdd).status, "PASS");
const full4d = Array.from(rules.processLine("4d 52 b20n dau30n duoi10n", "mn", mnFullAmountSaturday));
assert.deepEqual(full4d, ["tp 52 b20n dau30n duoi10n", "la 52 b20n dau30n duoi10n", "bp 52 b20n dau30n duoi10n", "hg 52 b20n dau30n duoi10n"]);
assert.equal(rules.auditMoneyConservation("4d 52 b20n dau30n duoi10n", full4d).status, "PASS");

// CASE 1: MT thứ Bảy, selector 3d và dx.
assert.deepEqual(
  Array.from(rules.processLine("3d 22 10 dx 5n", "mt", mtSaturday)),
  ["dn qn 22 10 dx 5n", "dn dno 22 10 dx 5n", "qn dno 22 10 dx 5n"]
);

// CASE 2: hai nhóm số/cược cùng selector 2d.
assert.deepEqual(
  Array.from(rules.processLine("2d 51 dd 60n 851 b5n xc 20n", "mt", mtSaturday)),
  ["dn 51 dd 60n", "qn 51 dd 60n", "dn 851 b5n xc 20n", "qn 851 b5n xc 20n"]
);

// CASE 3: +dna phải về dn, đồng thời giữ qn.
const case3 = rules.normalizeInput("Qn +dna 71 64 51 dx 2n");
assert.equal(case3, "qn dn 71 64 51 dx 2n");
assert.doesNotThrow(() => rules.validateCheckOnlyLine(case3, "mt", mtSaturday));

// CASE 3B: two explicit station exposures preserve full normal stake.
// DX/DA vẫn giữ nguyên cặp đài cụ thể.
assert.deepEqual(
  Array.from(rules.processLine("Dna +qn 17 b30n", "mt", mtSaturday)),
  ["dn 17 b30n", "qn 17 b30n"]
);
assert.deepEqual(
  Array.from(rules.processLine("Dna +qn 17 dx 2n", "mt", mtSaturday)),
  ["dn qn 17 dx 2n"]
);
assert.deepEqual(
  Array.from(rules.processLine("Dna +qn 17 da 2n", "mt", mtSaturday)),
  ["dn qn 17 da 2n"]
);
assert.deepEqual(
  Array.from(rules.processLine("Dna +qn 17 b30n da 2n", "mt", mtSaturday)),
  ["dn 17 b30n", "qn 17 b30n", "dn qn 17 da 2n"]
);

// Generic station expansion preserves every original selector amount exactly.
for(const stake of [1,2,3,4,5,7,9,10,61]){
  const outputs=Array.from(rules.processLine(`2d 51 dd ${stake}n`, "mt", mtSaturday));
  assert.deepEqual(outputs.map(x=>x.match(/dd (\d+)n/)[1]), [String(stake),String(stake)]);
  assert.equal(rules.auditMoneyConservation(`2d 51 dd ${stake}n`,outputs).status,"PASS");
}
const mobileMulti=Array.from(rules.processLine("2d 51 dd 7n da 2n xc 10n", "mt", mtSaturday));
assert.equal(rules.auditMoneyConservation("2d 51 dd 7n da 2n xc 10n",mobileMulti).status,"PASS");
assert.equal(rules.auditMoneyConservation("tp 12 da 2n",["tp 12 dat 2n"]).status,"PASS");

// CASE 4: alias chuẩn và tên đài đầy đủ có dấu/không dấu đều về mã chuẩn.
assert.equal(rules.normalizeInput("qn dn dno hue"), "qn dn dno hue");
assert.equal(rules.normalizeInput("ben tre bac lieu da nang dak nong quang ngai"), "bt bli dn dno qn");
assert.equal(rules.normalizeInput("Bến Tre Bạc Liêu Đà Nẵng Đắk Nông Quảng Ngãi"), "bt bli dn dno qn");
assert.equal(rules.normalizeInput("bl"), "bl");
assert.equal(rules.normalizeInput("Bạc Liêu"), "bli");
assert.doesNotThrow(() => rules.validateCheckOnlyLine("hue 71 dathang 2n", "mt", rules.getSchedule("mt", sunday)));

// P1: dots separating numeric betting tokens must be normalized before the
// canonical parser; decimal money after a bet remains intact.
const periodNumberCases = [
  "2d 868.879.299 xc 10n",
  "2d 868. 879. 299 xc 10n",
  "2d 868 .879 .299 xc 10n",
  "2d 868 . 879 . 299 xc 10n",
  "2d 868...879..299 xc 10n",
  "2d 868. 879 .299.252.729 .384 xc 10n"
];
for(const value of periodNumberCases){
  const normalized=rules.normalizeInput(value);
  assert.match(normalized, /^2d 868 879 299(?: 252 729 384)? xc 10n$/);
  assert.doesNotThrow(() => rules.validateCheckOnlyLine(normalized, "mn", mnMonday));
}
assert.equal(rules.normalizeInput("2d 12 b 10.50n"), "2d 12 b 10.50n");

// R25: BL is BAO LÔ (canonical LO), including plain Router/bridge input.
for(const selector of ["bl","BL","lo","lô"]){
  const line=`3d 50 ${selector} 200`;
  const normalized=rules.normalizeInput(line);
  assert.doesNotThrow(()=>rules.validateCheckOnlyLine(normalized,"mn",mnMonday));
  assert.equal(rules.auditMoneyConservation(normalized,Array.from(rules.processLine(normalized,"mn",mnMonday))).status,"PASS");
}
for(const line of ["3d 50.34.43 dx 10","3d 50. 34. 43 dx 10","3d 50 .34 .43 dx 10","3d 50 . 34 . 43 dx 10","3d 50...34..43 dx 10"]){
  const normalized=rules.normalizeInput(line);
  assert.equal(normalized,"3d 50 34 43 dx 10");
  assert.doesNotThrow(()=>rules.validateCheckOnlyLine(normalized,"mn",mnMonday));
}

// CASE 5: DAT là chuẩn cho một đài; da/đá/dathang chỉ là input tương thích.
function processSingleStationDat(line) {
  assert.doesNotThrow(() => rules.validateCheckOnlyLine(line, "mn", mnMonday));
  return Array.from(rules.processLine(line, "mn", mnMonday))[0];
}
assert.equal(processSingleStationDat("tp 31 91 b10n da 5n"), "tp 31 91 b10n dat 5n");
assert.equal(processSingleStationDat("tp 31 91 b10n đá 5n"), "tp 31 91 b10n dat 5n");
assert.equal(processSingleStationDat("tp 31 91 b10n dat 5n"), "tp 31 91 b10n dat 5n");
assert.equal(processSingleStationDat("tp 31 91 da5n"), "tp 31 91 dat5n");
assert.equal(processSingleStationDat("tp 31 91 dathang5n"), "tp 31 91 dat5n");
expectThrow(() => rules.validateCheckOnlyLine("tp 31 91 dx 5n", "mn", mnMonday), /1 đài 'tp' phải dùng 'dat', không dùng dx\/đx/);
assert.doesNotThrow(() => rules.validateCheckOnlyLine("tp dt 31 91 da 5n", "mn", mnMonday));
assert.doesNotThrow(() => rules.validateCheckOnlyLine("tp dt 31 91 dx 5n", "mn", mnMonday));
expectThrow(() => rules.validateCheckOnlyLine("tp dt 31 91 dat 5n", "mn", mnMonday), /2 đài 'tp dt' phải dùng 'da' hoặc 'dx', không dùng 'dat'/);
expectThrow(() => rules.validateCheckOnlyLine("2d 31 91 dat 5n", "mn", mnMonday), /2d phải dùng 'da' hoặc 'dx', không dùng 'dat'/);
expectThrow(() => rules.validateCheckOnlyLine("3d 31 91 dat 5n", "mn", mnMonday), /3d phải dùng 'da' hoặc 'dx', không dùng 'dat'/);
expectThrow(() => rules.validateCheckOnlyLine("4d 31 91 dat 5n", "mn", mnMonday), /4d phải dùng 'da' hoặc 'dx', không dùng 'dat'/);

// CASE 6 SHARED: tên khác bỏ tên/giữ nội dung; Vinh xóa cả block.
const chat = `[8/23/2026 5:31 PM] Hiền: 20 89 98 da 2n
79 58 97 da 2n
[8/23/2026 5:32 PM] Vinh: 1
88 99 b 5n
[8/23/2026 5:33 PM] Hiền: 25 52 50 da 2n
Trúc Thái:
Dna +qn 17 b30n
Quýt: 2d 51 dd 60n`;
assert.equal(
  rules.preprocessChatText(chat),
  "20 89 98 da 2n\n79 58 97 da 2n\n25 52 50 da 2n\ndn qn 17 b30n\n2d 51 dd 60n"
);
assert.equal(rules.preprocessChatText(`Hiền:
20 89 98 da 2n`), "20 89 98 da 2n");
assert.equal(rules.preprocessChatText(`Hiền: 20 89 98 da 2n`), "20 89 98 da 2n");
assert.equal(rules.preprocessChatText(`Vinh:
20 89 98 da 2n
79 58 97 da 2n`), "");
assert.equal(
  rules.preprocessChatText(`Hiền, [8/23/2026 5:31 PM]
20 89 b 2n
Vinh, [8/23/2026 5:32 PM]
11 22 b 3n
Quýt, [8/23/2026 5:33 PM]
30 40 dd 4n`),
  "20 89 b 2n\n30 40 dd 4n"
);

// CASE 7: MB thiếu loại cược.
expectThrow(() => rules.validateCheckOnlyLine("79 30n", "mb", rules.getSchedule("mb", saturday)), /thiếu loại cược/);

// CASE 8: MB chỉ kiểm tra và không tách đài.
const mbLine = "79 da 30n";
assert.doesNotThrow(() => rules.validateCheckOnlyLine(mbLine, "mb", rules.getSchedule("mb", saturday)));
assert.deepEqual(Array.from(rules.processLine(mbLine, "mb", rules.getSchedule("mb", saturday))), [mbLine]);

// CASE 9: Cut chỉ xóa tin gốc khi tất cả output của tin đó đã được CUT.
const ui = rules.elements;
ui.region.value = "mt";
ui.date.value = "2026-08-22";
ui.today.checked = false;
ui.input.value = "3d 22 10 dx 5n\n3d 64 51 dx 5n";
rules.run();
const firstOutput = "dn qn 22 10 dx 5n\ndn dno 22 10 dx 5n\nqn dno 22 10 dx 5n";
const secondOutput = "dn qn 64 51 dx 5n\ndn dno 64 51 dx 5n\nqn dno 64 51 dx 5n";
assert.equal(ui.output.value, `${firstOutput}\n${secondOutput}`);
assert.equal(outputRecords().length, 6);
assert.deepEqual(outputRecords().slice(0, 3).map(record => record.sourceLine), [1, 1, 1]);
assert.deepEqual(outputRecords().slice(3).map(record => record.sourceLine), [2, 2, 2]);

const initialInput = "3d 22 10 dx 5n\n3d 64 51 dx 5n";
const firstLines = firstOutput.split("\n");
const selectFirstVisibleOutput = () => {
  const end = ui.output.value.indexOf("\n");
  ui.output.selectionStart = 0;
  ui.output.selectionEnd = end === -1 ? ui.output.value.length : end;
};

// Cut 1/3: tin gốc vẫn còn nguyên.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[0]);
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[1]}\n${firstLines[2]}\n${secondOutput}`);
assert.equal(outputRecords().filter(record => record.alive).length, 5);
assert.deepEqual(outputRecords().map(record => record.sourceLine), [1, 1, 1, 2, 2, 2]);

// Cut 2/3: tin gốc vẫn còn nguyên.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[1]);
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[2]}\n${secondOutput}`);
assert.equal(outputRecords().filter(record => record.alive).length, 4);

// Cut 3/3: source đầu mới bị xóa, source sau được remap.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[2]);
assert.equal(ui.input.value, "3d 64 51 dx 5n");
assert.equal(ui.output.value, secondOutput);
assert.equal(outputRecords().length, 3);
assert.deepEqual(outputRecords().map(record => record.sourceLine), [1, 1, 1]);

// Undo bước cut cuối phải khôi phục source, output và mapping trước CUT.
rules.triggerUndo();
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[2]}\n${secondOutput}`);
assert.deepEqual(outputRecords().map(record => record.sourceLine), [1, 1, 1, 2, 2, 2]);

// Cut toàn bộ 3 output và Undo phải quay về đầy đủ sáu output records.
ui.input.value = initialInput;
rules.run();
ui.output.selectionStart = 0;
ui.output.selectionEnd = firstOutput.length;
await rules.cutSelectedOutput();
assert.equal(ui.input.value, "3d 64 51 dx 5n");
rules.triggerUndo();
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstOutput}\n${secondOutput}`);
assert.equal(outputRecords().length, 6);

// Nguồn có 2 output: CUT một phần vẫn giữ nguyên source.
ui.input.value = "2d 22 10 dd 5n";
rules.run();
assert.equal(ui.output.value, "dn 22 10 dd 5n\nqn 22 10 dd 5n");
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(ui.input.value, "2d 22 10 dd 5n");
assert.equal(ui.output.value, "qn 22 10 dd 5n");
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(ui.input.value, "");
assert.equal(ui.output.value, "");
assert.equal(outputRecords().length, 0);

// Input lặp, whitespace và tin sai phải giữ đúng ranh giới business rule.
ui.input.value = "  2d   22 10 dd 5n  \n2d 22 10 dd 5n";
rules.run();
assert.equal(ui.output.value, "dn 22 10 dd 5n\nqn 22 10 dd 5n\ndn 22 10 dd 5n\nqn 22 10 dd 5n");
ui.input.value = "3d 22 22 dx 5n";
rules.run();
assert.match(ui.output.value, /PHÁT HIỆN TIN SAI/);
assert.match(ui.output.value, /trùng số 22/);

// PWA audit: các file và version phải đồng bộ, paths tương đối cho GitHub Pages.
const appVersion = html.match(/const APP_VERSION = "([^"]+)"/);
assert.ok(appVersion, "thiếu APP_VERSION");
assert.equal(appVersion[1], version.version, "APP_VERSION và version.json lệch nhau");
assert.match(sw, new RegExp(`CACHE_NAME = "tach-dai-mobile-v${appVersion[1].replaceAll(".", "\\.")}(?:-[^"]+)?"`));
assert.match(html, new RegExp(`>v${appVersion[1].replaceAll(".", "\\.")}<`), "version hiển thị phải đồng bộ APP_VERSION");
assert.match(sw, new RegExp(`JSON\\.stringify\\(\\{version:"${appVersion[1].replaceAll(".", "\\.")}"\\}\\)`), "version fallback trong SW phải đồng bộ");
assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
assert.match(html, /serviceWorker\.register\("\.\/sw\.js", \{ scope: "\.\/" \}\)/);
assert.match(html, /fetch\("\.\/version\.json\?t=" \+ Date\.now\(\), \{[\s\S]*?cache: "no-store"/);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./index.html");
assert.equal(manifest.scope, "./");
assert.deepEqual(manifest.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
assert.match(sw, /self\.skipWaiting\(\)/);
assert.match(sw, /req\.mode === "navigate"/);
assert.match(sw, /caches\.match\("\.\/index\.html"\)/);
assert.ok(!/live xổ số/i.test(html), "không được có LIVE xổ số");

console.log("CORE RULES: PASS");
console.log("DAT RULE: PASS");
console.log("ALIASES: PASS");
console.log("CHAT FILTER + VINH DROP: PASS");
console.log("EXPLICIT 2-STATION v57: PASS");
console.log("MB CHECK: PASS");
console.log("CUT SYNC: PASS");
console.log("CUT 1/3: PASS");
console.log("CUT 2/3: PASS");
console.log("CUT 3/3: PASS");
console.log("UNDO SYNC: PASS");
console.log("PWA: PASS");
console.log("OFFLINE CACHE: PASS");
console.log("AUTO UPDATE: PASS");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
