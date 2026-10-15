"use strict";
// Node-only regression for the third Unified mode; no browser, network or Telegram.
const assert = require("node:assert/strict");
const unified = require("../app/unified-core.js");

const api = {
  normalizeInput: text => String(text || "").trim(),
  validateCheckOnlyLine(line) {
    if (!/^(?:2d|3d)\s+\d+\s+b10n$/i.test(line))
      throw Error("INVALID_WAGER:" + line);
  },
  processLine: line => [line]
};

const original = "2d 52 b10n\n--//-----//--\n3d 43 b10n";
const result = unified.transformDaVongText(original, api, "mn", []);
assert.equal(result.ok, true, result.error);
assert.deepEqual(result.outputs, ["2d 52 b10n", "3d 43 b10n"]);
assert.equal(result.output, unified.transformDaVongText("2d 52 b10n\n3d 43 b10n", api, "mn", []).output);
const blank = unified.transformDaVongText("2d 52 b10n\n\n--//-----//--\n3d 43 b10n", api, "mn", []);
assert.equal(blank.ok, true, blank.error);
const only = unified.transformDaVongText("---//---\n////\n————", api, "mn", []);
assert.equal(only.ok, false);
assert.equal(only.error, "DA_VONG_TEXT_REQUIRED");
assert.equal(only.output, "");
const invalid = unified.transformDaVongText("2d 52 b10n\n--//oops//--", api, "mn", []);
assert.equal(invalid.ok, false);
assert.match(invalid.error, /LỖI dòng 2:/);
const physicallyMapped = unified.transformDaVongText("2d 52 b10n\n\n--//oops//--", api, "mn", []);
assert.equal(physicallyMapped.ok, false);
assert.match(physicallyMapped.error, /LỖI dòng 3:/);
assert.equal(invalid.output, "");
console.log("UNIFIED SEPARATOR REGRESSION: PASS");
