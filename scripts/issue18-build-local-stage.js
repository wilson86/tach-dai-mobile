'use strict';
// Build an isolated, loopback-only Unified fixture. Never changes the source trees.
const fs = require('node:fs');
const path = require('node:path');

const MOBILE_FILES = [
  'index.html', 'sw.js', 'version.json', 'manifest.webmanifest',
  'business_engine.generated.js', 'station_calendar.generated.js',
  'icon-192.png', 'icon-512.png', 'app/index.html', 'app/sw.js',
  'app/version.json', 'app/unified-core.js', 'app/manifest.webmanifest'
];
const NGANG_FILES = [
  'index.html', 'sw.js', 'version.json', 'manifest.webmanifest',
  'business_engine.generated.js', 'station_calendar.generated.js'
];
const NANG_IFRAME = /(<iframe\b[^>]*\bid="ngangFrame"[^>]*\bsrc=")[^"]+("[^>]*>)/g;
function fail(message) { throw new Error('STAGING_BLOCKED: ' + message); }
function inside(folder, target) { return target === folder || target.startsWith(folder + path.sep); }
function checkedFile(root, relative) {
  const file = path.join(root, relative);
  if (!inside(root, file) || !inside(root, fs.realpathSync(file)) || fs.lstatSync(file).isSymbolicLink())
    fail('unsafe source path: ' + relative);
  return file;
}
function isolatedUnifiedHtml(source) {
  let seen = 0;
  const html = source.replace(NANG_IFRAME, (whole, prefix, suffix) => {
    seen++;
    if (!whole.includes('src="https://wilson86.github.io/tach-dai-ngang/"'))
      fail('unknown Ngang iframe source');
    return prefix + '../../Ngang/' + suffix;
  });
  if (seen !== 1) fail('expected one production Ngang iframe');
  const frames = [...html.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => m[1]);
  if (frames.length !== 2 || frames.some(src => !src.startsWith('../') || src.startsWith('//') || src.includes('://')))
    fail('iframe outside isolated staging');
  if (html.includes('https://wilson86.github.io/tach-dai-ngang/'))
    fail('production Ngang iframe still present');
  return html;
}
function stage({mobile, ngang, out}) {
  if (![mobile, ngang, out].every(x => typeof x === 'string' && path.isAbsolute(x)))
    fail('provide absolute --mobile, --ngang and --out paths');
  const m = fs.realpathSync(mobile), n = fs.realpathSync(ngang), target = path.resolve(out);
  if (m === n || inside(m, target) || inside(n, target) || inside(target, m) || inside(target, n))
    fail('source and staging paths overlap');
  if (process.platform === 'win32' && ![m, n, target].every(p => /^[cC]:\\/.test(p)))
    fail('Windows source and staging must remain on C:');
  if (fs.existsSync(target)) fail('stage already exists (never overwrite)');
  const parent = path.dirname(target);
  if (!fs.existsSync(parent) || fs.lstatSync(parent).isSymbolicLink() ||
      fs.realpathSync(parent) !== parent)
    fail('stage parent must be an existing normal directory');
  const mv = JSON.parse(fs.readFileSync(checkedFile(m, 'version.json'), 'utf8'));
  const nv = JSON.parse(fs.readFileSync(checkedFile(n, 'version.json'), 'utf8'));
  const uv = JSON.parse(fs.readFileSync(checkedFile(m, 'app/version.json'), 'utf8'));
  const engine = mv.business_engine_sha256;
  if (!/^[a-f0-9]{64}$/.test(engine) || engine !== nv.business_engine_sha256 || engine !== uv.business_engine_sha256)
    fail('Mobile/Ngang/Unified engine SHA mismatch');
  const html = isolatedUnifiedHtml(fs.readFileSync(checkedFile(m, 'app/index.html'), 'utf8'));
  // Preflight all assets before making the staging directory.
  for (const file of MOBILE_FILES) checkedFile(m, file);
  for (const file of NGANG_FILES) checkedFile(n, file);
  fs.mkdirSync(target);
  for (const [root, dest, files] of [[m, 'Mobile', MOBILE_FILES], [n, 'Ngang', NGANG_FILES]]) {
    for (const file of files) {
      const output = path.join(target, dest, file);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.copyFileSync(checkedFile(root, file), output);
    }
  }
  fs.writeFileSync(path.join(target, 'Mobile/app/index.html'), html, {encoding: 'utf8', flag: 'w'});
  const manifest = {schema: 'KTS_ISSUE18_LOCAL_ONLY_STAGE_V1', engine_sha256: engine,
    mobile_version: mv.version, ngang_version: nv.version, unified_version: uv.version,
    iframe_ngang: '../../Ngang/', source_unchanged: true, release_authorized: false};
  fs.writeFileSync(path.join(target, 'ISSUE18_STAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--mobile','--ngang','--out'].includes(argv[i]) || !argv[i+1] || argv[i+1].startsWith('--'))
      fail('usage: node issue18-build-local-stage.js --mobile ABS --ngang ABS --out FRESH_ABS');
    args[argv[i].slice(2)] = argv[i+1];
  }
  return args;
}
if (require.main === module) {
  try { console.log(JSON.stringify(stage(parseArgs(process.argv.slice(2))))); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
module.exports = {isolatedUnifiedHtml, stage, parseArgs};
