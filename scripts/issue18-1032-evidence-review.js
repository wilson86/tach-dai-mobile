'use strict';
// Read-only review of a previously captured, synthetic-only Windows Chrome receipt.
// Verifies evidence completeness, not a release oracle or independent reproduction.
// No npm, shell, network, browser control, file modification or production access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const PINS = Object.freeze({
  KTS: '79680f4dc65e07ddd17f90e448a2f4236d240452',
  Mobile: '5cd748700e60d5c682b77a8d99a9130faeb6102f',
  Ngang: 'f35245f537977cfde3399079122cd4e6f9d84725'
});
const ENGINE = '0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487';
const ORIGIN = 'http://127.0.0.1:8768/app/';
const SHOTS = Object.freeze([
  'syntax-tach.png', 'syntax-ngang.png', 'syntax-davong.png',
  'cut-before-f5.png', 'cut-after-f5.png', 'undo-after-f5.png',
  'cut-a-new-b-f5.png'
]);
const MARKERS = Object.freeze([
  'REAL_CHROME_SW', 'RUNTIME_ENGINE_AND_ALIAS',
  ...['tach','ngang','davong'].flatMap(m => [
    'VALID_HN_DUI_'+m, 'DUPLICATE_PHYSICAL_LINE_'+m, 'MIXED_INVALID_'+m
  ]),
  'CUT_ALL_BEFORE_F5', 'CUT_ALL_AFTER_F5', 'UNDO_AFTER_F5', 'CUT_A_NEW_B_F5'
]);

function requirePass(ok, code) { if (!ok) throw new Error('EVIDENCE_REVIEW_BLOCKED:' + code); }
function safeRegularFile(p) {
  const l = fs.lstatSync(p);
  requirePass(l.isFile() && !l.isSymbolicLink(), 'NOT_REGULAR_FILE');
  requirePass(path.resolve(fs.realpathSync.native(p)).toLowerCase() === path.resolve(p).toLowerCase(), 'FILE_REDIRECTED');
  return p;
}
function screenshotCheck(dir, names) {
  requirePass(Array.isArray(names) && names.length === SHOTS.length && new Set(names).size === names.length,
    'SCREENSHOT_COUNT_OR_DUPLICATION');
  requirePass(SHOTS.every(name => names.includes(name)), 'SCREENSHOT_NAME_MISMATCH');
  for (const name of SHOTS) {
    const p = path.join(dir, name);
    const data = fs.readFileSync(safeRegularFile(p));
    requirePass(data.length > 8 && data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
      'SCREENSHOT_PNG_INVALID:' + name);
  }
}
function inspect(receipt) {
  requirePass(receipt && typeof receipt === 'object', 'JSON_OBJECT_REQUIRED');
  requirePass(receipt.preview === ORIGIN, 'PREVIEW_ORIGIN_MISMATCH');
  for (const [name, sha] of Object.entries(PINS))
    requirePass(receipt.source?.[name] === sha, 'SOURCE_SHA_MISMATCH:' + name);
  requirePass(receipt.chrome === 'PASS_SCOPED_HEADLESS_CHROME', 'CHROME_NOT_PASS');
  requirePass(/^Chrome\/\d+\.\d+\.\d+\.\d+$/.test(receipt.chromeVersion || ''), 'BROWSER_VERSION_MISSING');
  requirePass(JSON.stringify(receipt.unifiedVersion || '').includes('1.0.32'), 'UNIFIED_VERSION_MISMATCH');
  requirePass(receipt.production === 'NO_GO' && receipt.android === 'NOT_RUN' && receipt.cost_usd === 0,
    'RELEASE_BOUNDARY_MISSING');
  requirePass(Array.isArray(receipt.checks), 'CHECKS_MISSING');
  const counted = new Map();
  for (const {label, value} of receipt.checks) {
    requirePass(typeof label === 'string' && value && typeof value === 'object', 'CHECK_MALFORMED');
    counted.set(label, (counted.get(label) || 0) + 1);
  }
  for (const name of MARKERS) requirePass(counted.get(name) === 1, 'MISSING_OR_DUPLICATE_CHECK:' + name);
  const get = name => receipt.checks.find(x => x.label === name).value;
  const sw = get('REAL_CHROME_SW');
  requirePass(sw.controller?.startsWith('http://127.0.0.1:8768/app/sw.js'), 'SW_CONTROLLER_MISMATCH');
  requirePass(Array.isArray(sw.cacheKeys) && sw.cacheKeys.length > 0, 'CACHE_EVIDENCE_MISSING');
  const runtime = get('RUNTIME_ENGINE_AND_ALIAS');
  requirePass(runtime.mobileSha === ENGINE && runtime.ngangSha === ENGINE, 'EXECUTED_ENGINE_SHA_MISMATCH');
  requirePass(runtime.mobileAlias === 'mb 43 b10n 98 duoi100n' &&
    runtime.ngangAlias === 'mb 43 b10n 98 duoi100n', 'EXECUTED_HN_DUI_MISMATCH');
  for (const m of ['tach','ngang','davong']) {
    const valid = get('VALID_HN_DUI_' + m);
    requirePass(Number.isInteger(valid.outputLines) && valid.outputLines > 0, 'VALID_OUTPUT_MISSING:' + m);
    const repeated = get('DUPLICATE_PHYSICAL_LINE_' + m);
    requirePass(Number.isInteger(repeated.outputLines) && repeated.outputLines >= 2, 'REPEATED_LINES_LOST:' + m);
    requirePass(get('MIXED_INVALID_' + m).rows === 0, 'PARTIAL_RESULT_EXPOSED:' + m);
  }
  requirePass(get('CUT_ALL_BEFORE_F5').rows === 0, 'CUT_BEFORE_F5_SURVIVORS');
  const after = get('CUT_ALL_AFTER_F5');
  requirePass(after.rows === 0 && after.mode === 'ngang', 'CUT_F5_REPLAY_OR_TAB_DRIFT');
  const undo = get('UNDO_AFTER_F5');
  requirePass(undo.originalRestored === true && typeof undo.output === 'string', 'UNDO_NOT_PROVEN');
  const rows = undo.output.split(/\r?\n/).filter(Boolean);
  requirePass(rows.length === 2 && rows.every(s => s === '2d 52 68 dx2.5n'), 'UNDO_AMOUNT_OR_COUNT_MISMATCH');
  const cross = get('CUT_A_NEW_B_F5');
  requirePass(cross.draftPersisted === true && cross.cutALedgerRows === 0, 'CROSS_MODE_B_OR_A_MISMATCH');
  return Object.freeze({
    status: 'PASS_SCOPED_RECEIPT_CONSISTENCY_ONLY',
    source: PINS, engine: ENGINE, chromeVersion: receipt.chromeVersion,
    checks: MARKERS.length, screenshots: SHOTS.length,
    chromeGuest: 'NOT_RUN', android: 'NOT_RUN', humanMoneyOracle: 'NOT_RUN',
    release: 'NO_GO', cost_usd: 0
  });
}
function admissibleDirectory(raw) {
  requirePass(process.platform === 'win32', 'WINDOWS_REQUIRED');
  requirePass(typeof raw === 'string' && path.win32.isAbsolute(raw), 'WINDOWS_ABSOLUTE_PATH_REQUIRED');
  const prefix = 'c:\\kts-qa\\issue18-hn-dui-20261101\\';
  const normalized = path.win32.normalize(raw).toLowerCase();
  requirePass(normalized.startsWith(prefix) && /^chrome-acceptance-[a-zA-Z0-9_-]+$/i.test(path.win32.basename(raw)),
    'OUTSIDE_AUTHORIZED_RECEIPT_FOLDER');
  requirePass(path.resolve(fs.realpathSync.native(raw)).toLowerCase() === path.resolve(raw).toLowerCase(),
    'RECEIPT_DIRECTORY_REDIRECTED');
  requirePass(fs.lstatSync(raw).isDirectory() && !fs.lstatSync(raw).isSymbolicLink(), 'DIRECTORY_NOT_SAFE');
  return raw;
}
function main(args) {
  requirePass(args.length === 2 && /^[a-f0-9]{64}$/.test(args[1]), 'USAGE: <receipt-dir> <known-sha256>');
  const folder = admissibleDirectory(args[0]), file = safeRegularFile(path.join(folder,'RESULT.json'));
  const blob = fs.readFileSync(file);
  requirePass(crypto.createHash('sha256').update(blob).digest('hex') === args[1], 'RECEIPT_SHA256_MISMATCH');
  const receipt = JSON.parse(blob.toString('utf8'));
  screenshotCheck(folder,receipt.screenshots);
  const profile = path.join(folder,'profile');
  requirePass(fs.lstatSync(profile).isDirectory() && !fs.lstatSync(profile).isSymbolicLink() &&
    path.resolve(fs.realpathSync.native(profile)).toLowerCase() === path.resolve(profile).toLowerCase(),
    'TEST_PROFILE_NOT_PRESERVED');
  const review = inspect(receipt);
  process.stdout.write(JSON.stringify({...review,receipt_sha256:args[1],review_type:'READ_ONLY_RECEIPT_AUDIT'},null,2)+'\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch(e) {
    console.error(e.message);process.exitCode=2;
  }
}
module.exports = {inspect,readOnly:true,MARKERS,SHOTS,admissibleDirectory};
