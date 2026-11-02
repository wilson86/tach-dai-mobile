'use strict';
// Static contract and pure helper checks; never claims browser acceptance.
const t=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const p=require('node:path');
const script=fs.readFileSync(p.join(__dirname,'../scripts/issue18-chrome-1032-local-acceptance.js'),'utf8');
const driver=require('../scripts/issue18-chrome-1032-local-acceptance.js');
t('scoped to standalone review localhost and exact checked-in candidate',()=>{
 assert.equal(driver.URL,'http://127.0.0.1:8768/app/');
 assert.equal(driver.PIN.KTS,'79680f4dc65e07ddd17f90e448a2f4236d240452');
 assert.equal(driver.PIN.Mobile,'5cd748700e60d5c682b77a8d99a9130faeb6102f');
 assert.equal(driver.PIN.Ngang,'f35245f537977cfde3399079122cd4e6f9d84725');
 assert.match(script,/HEADLESS_REAL_CHROME_NOT_CHROME_GUEST/);
 assert.match(script,/PASS_SCOPED_HEADLESS_CHROME/);
 assert.match(script,/production:'NO_GO'/);
 assert.match(script,/cost_usd:0/);
});
t('cannot erase previous localhost previews or launch paid CI',()=>{
 assert.ok(!/rmSync\(|rmdirSync\(|execSync\(|npm install|gh workflow run|deploy|merge --no-ff/.test(script));
 assert.match(script,/C:\\\\KTS-QA\\\\issue18-hn-dui-20261101/);
 assert.match(script,/Chrome DevTools did not start/);
 assert.match(script,/getRegistrations\(\)/);
 assert.match(script,/navigator\.serviceWorker\.controller/);
});
t('scoped candidate checks all three modes, atomic mixed, Cut F5 Undo and A/B',()=>{
 for(const marker of ['VALID_HN_DUI_','DUPLICATE_PHYSICAL_LINE_',
 'MIXED_INVALID_','CUT_ALL_BEFORE_F5','CUT_ALL_AFTER_F5',
 'UNDO_AFTER_F5','CUT_A_NEW_B_F5'])assert.ok(script.includes(marker),marker);
 assert.match(script,/real Chrome|Chrome JS/);
 assert.match(script,/Page\.reload/);
 assert.match(script,/Input\.dispatchMouseEvent/);
});
t('ledger helper refuses non-ledger text and reads empty persistent rows',()=>{
 assert.equal(driver.readLedger('2d 52 68 dx5n'),null);
 const ledger={schema:'KTS_EXACT_OUTPUT_LEDGER_V1',rows:[],origin:'2d 52 68 dx5n'};
 assert.deepEqual(driver.readLedger('[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n'+JSON.stringify(ledger)),ledger);
});
