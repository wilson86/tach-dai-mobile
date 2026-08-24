"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
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
  vm.runInContext(`${source}\nglobalThis.__rules={getSchedule,normalizeInput,preprocessChatText,validateCheckOnlyLine,processLine,run,cutSelectedOutput,triggerUndo:()=>document.getElementById("undoBtn").trigger("click"),getOutputRecords:()=>outputRecords.map(r=>({...r})),elements:{input:inputEl,output:outputEl,region:regionEl,date:dateEl,today:todayEl},clipboard:navigator.clipboard};`, context);
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
const outputRecords = () => JSON.parse(JSON.stringify(rules.getOutputRecords()));
const saturday = new Date("2026-08-22T12:00:00");
const sunday = new Date("2026-08-23T12:00:00");
const monday = new Date("2026-08-24T12:00:00");
const mtSaturday = rules.getSchedule("mt", saturday);
const mnMonday = rules.getSchedule("mn", monday);

// CASE 1: MT thứ Bảy, selector 3d và dx.
assert.deepEqual(
  Array.from(rules.processLine("3d 22 10 dx 5n", "mt", mtSaturday)),
  ["2d 22 10 dx 5n", "dn dno 22 10 dx 5n", "qn dno 22 10 dx 5n"]
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

// CASE 4: tên đài đầy đủ phải dùng đúng alias, không đổi mã đã quy ước.
assert.equal(rules.normalizeInput("Quảng Ngãi"), "qn");
assert.equal(rules.normalizeInput("Đà Nẵng"), "dn");
assert.equal(rules.normalizeInput("Đắk Nông"), "dno");
assert.equal(rules.normalizeInput("Huế"), "hue");
assert.doesNotThrow(() => rules.validateCheckOnlyLine("hue 71 dathang 2n", "mt", rules.getSchedule("mt", sunday)));

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

// CASE 6: lọc chat, bỏ toàn bộ tin của Vinh và header ngày/giờ/người gửi.
const chat = `[8/23/2026 5:31 PM] Hiền: 20 89 98 da 2n
79 58 97 da 2n
[8/23/2026 5:32 PM] Vinh: 1
[8/23/2026 5:32 PM] Hiền: 25 52 50 da 2n`;
assert.equal(
  rules.preprocessChatText(chat),
  "20 89 98 da 2n\n79 58 97 da 2n\n25 52 50 da 2n"
);

// CASE 7: MB thiếu loại cược.
expectThrow(() => rules.validateCheckOnlyLine("79 30n", "mb", rules.getSchedule("mb", saturday)), /thiếu loại cược/);

// CASE 8: MB chỉ kiểm tra và không tách đài.
const mbLine = "79 da 30n";
assert.doesNotThrow(() => rules.validateCheckOnlyLine(mbLine, "mb", rules.getSchedule("mb", saturday)));
assert.deepEqual(Array.from(rules.processLine(mbLine, "mb", rules.getSchedule("mb", saturday))), [mbLine]);

// CASE 9: Cut kết quả phải đồng bộ Input, Output, mapping và Undo.
const ui = rules.elements;
ui.region.value = "mt";
ui.date.value = "2026-08-22";
ui.today.checked = false;
ui.input.value = "3d 22 10 dx 5n\n3d 64 51 dx 2n";
rules.run();
const firstOutput = "2d 22 10 dx 5n\ndn dno 22 10 dx 5n\nqn dno 22 10 dx 5n";
const secondOutput = "2d 64 51 dx 2n\ndn dno 64 51 dx 2n\nqn dno 64 51 dx 2n";
assert.equal(ui.output.value, `${firstOutput}\n${secondOutput}`);
assert.equal(outputRecords().length, 6);
assert.deepEqual(outputRecords().slice(0, 3).map(record => record.sourceLine), [1, 1, 1]);
assert.deepEqual(outputRecords().slice(3).map(record => record.sourceLine), [2, 2, 2]);

const initialInput = "3d 22 10 dx 5n\n3d 64 51 dx 2n";
const firstLines = firstOutput.split("\n");
const selectFirstVisibleOutput = () => {
  const end = ui.output.value.indexOf("\n");
  ui.output.selectionStart = 0;
  ui.output.selectionEnd = end === -1 ? ui.output.value.length : end;
};

// Cut 1/3: chỉ bỏ một output, source input phải còn.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[0]);
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[1]}\n${firstLines[2]}\n${secondOutput}`);
assert.equal(outputRecords().filter(record => record.alive).length, 5);

// Cut 2/3: source input vẫn còn vì còn một output của source đó.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[1]);
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[2]}\n${secondOutput}`);
assert.equal(outputRecords().filter(record => record.alive).length, 4);

// Cut 3/3: khi hết toàn bộ output của source đầu, source input mới bị xóa/remap.
selectFirstVisibleOutput();
await rules.cutSelectedOutput();
assert.equal(rules.clipboard.text, firstLines[2]);
assert.equal(ui.input.value, "3d 64 51 dx 2n");
assert.equal(ui.output.value, secondOutput);
assert.equal(outputRecords().length, 3);
assert.deepEqual(outputRecords().map(record => record.sourceLine), [1, 1, 1]);

// Undo bước cut cuối phải khôi phục source đầu và mapping trước đó.
rules.triggerUndo();
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstLines[2]}\n${secondOutput}`);
assert.equal(outputRecords().length, 6);

// Cut toàn bộ 3 output và Undo phải quay về đầy đủ sáu output records.
rules.run();
ui.output.selectionStart = 0;
ui.output.selectionEnd = firstOutput.length;
await rules.cutSelectedOutput();
assert.equal(ui.input.value, "3d 64 51 dx 2n");
rules.triggerUndo();
assert.equal(ui.input.value, initialInput);
assert.equal(ui.output.value, `${firstOutput}\n${secondOutput}`);
assert.equal(outputRecords().length, 6);

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
console.log("CHAT FILTER: PASS");
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
