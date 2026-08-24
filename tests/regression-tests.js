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
  const marker = 'runBtn.addEventListener("click",run);';
  const source = match[1].slice(0, match[1].indexOf(marker));
  assert.ok(source.length > 0, "không tìm thấy phần rule tách/check");

  const element = () => ({ addEventListener() {}, value: "", textContent: "", className: "" });
  const context = {
    console,
    Set,
    Date,
    JSON,
    RegExp,
    String,
    Error,
    document: { getElementById: element }
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__rules={getSchedule,normalizeInput,preprocessChatText,validateCheckOnlyLine,processLine};`, context);
  return context.__rules;
}

function expectThrow(fn, expected) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  assert.ok(error, "phải báo lỗi");
  assert.match(error.message, expected);
}

const rules = loadRules();
const saturday = new Date("2026-08-22T12:00:00");
const sunday = new Date("2026-08-23T12:00:00");
const mtSaturday = rules.getSchedule("mt", saturday);

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

// CASE 5: lọc chat, bỏ toàn bộ tin của Vinh và header ngày/giờ/người gửi.
const chat = `[8/23/2026 5:31 PM] Hiền: 20 89 98 da 2n
79 58 97 da 2n
[8/23/2026 5:32 PM] Vinh: 1
[8/23/2026 5:32 PM] Hiền: 25 52 50 da 2n`;
assert.equal(
  rules.preprocessChatText(chat),
  "20 89 98 da 2n\n79 58 97 da 2n\n25 52 50 da 2n"
);

// CASE 6: MB thiếu loại cược.
expectThrow(() => rules.validateCheckOnlyLine("79 30n", "mb", rules.getSchedule("mb", saturday)), /thiếu loại cược/);

// CASE 7: MB chỉ kiểm tra và không tách đài.
const mbLine = "79 da 30n";
assert.doesNotThrow(() => rules.validateCheckOnlyLine(mbLine, "mb", rules.getSchedule("mb", saturday)));
assert.deepEqual(Array.from(rules.processLine(mbLine, "mb", rules.getSchedule("mb", saturday))), [mbLine]);

// PWA audit: các file và version phải đồng bộ, paths tương đối cho GitHub Pages.
const appVersion = html.match(/const APP_VERSION = "([^"]+)"/);
assert.ok(appVersion, "thiếu APP_VERSION");
assert.equal(appVersion[1], version.version, "APP_VERSION và version.json lệch nhau");
assert.match(sw, new RegExp(`CACHE_NAME = "tach-dai-mobile-v${appVersion[1].replaceAll(".", "\\.")}"`));
assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
assert.match(html, /serviceWorker\.register\("\.\/sw\.js", \{ scope: "\.\/" \}\)/);
assert.match(html, /fetch\("\.\/version\.json\?t=" \+ Date\.now\(\), \{[\s\S]*?cache: "no-store"/);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./index.html");
assert.equal(manifest.scope, "./");
assert.deepEqual(manifest.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
assert.match(sw, /self\.skipWaiting\(\)/);
assert.match(sw, /req\.mode === "navigate"/);
assert.ok(!/live xổ số/i.test(html), "không được có LIVE xổ số");

console.log("PASS: regression rules + PWA audit");
