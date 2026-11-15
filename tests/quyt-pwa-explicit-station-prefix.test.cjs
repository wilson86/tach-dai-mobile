'use strict';
// Public synthetic fixtures only: explicit MN/MT station chains, no live money.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const calendar=fs.readFileSync(path.join(root,'station_calendar.generated.js'),'utf8');
const core=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(core,'Quyt one-screen money parser must exist');
const app=vm.runInNewContext(calendar+'\n'+core[0]+';OfflineKTS;');
const MN={market:'mn',businessDate:'2026-11-15',customer:'quyt',tick:true,rate:'1.067'};
test('Sunday: explicit TG KG prefixes bind two full-stake BAO placements',()=>{
 const actual=app.merge('tg kg 11 22 b10n',MN);
 assert.equal(actual.sourceTotal,'20');
 assert.equal(actual.original,'40');
 assert.equal(actual.total,'44');
 assert.equal(actual.rows.length,4);
 assert.equal(actual.pretty,'tg 11 22 b11n.\nkg 11 22 b11n.');
 assert.equal(actual.sections.reduce((sum,s)=>sum+BigInt(s.total),0n),44n);
});
test('Sunday: MT KH KT prefix binds two independently rounded DD placements',()=>{
 const actual=app.merge('kh kt 11 dd10n',{...MN,market:'mt'});
 assert.equal(actual.sourceTotal,'10');
 assert.equal(actual.original,'20');
 assert.equal(actual.total,'22');
 assert.equal(actual.pretty,'kh 11 dd11n.\nkt 11 dd11n.');
});
test('tick OFF and 2d/single station legacy have unchanged accounting',()=>{
 const unticked=app.merge('tg kg 11 22 b10n',{...MN,tick:false});
 assert.equal(unticked.original,'40');assert.equal(unticked.total,'40');
 assert.equal(app.merge('tg 11 22 b10n',MN).total,'22');
 assert.equal(app.merge('2d 11 22 b10n',MN).pretty,app.merge('tg kg 11 22 b10n',MN).pretty);
});
test('duplicate or off-calendar named stations fail closed',()=>{
 assert.throws(()=>app.merge('tg tg 11 b10n',MN),/lặp đài/u);
 assert.throws(()=>app.merge('tg 11 b10n',{...MN,businessDate:'2026-11-16'}),/HOLD/u);
});
test('MN cross-station DX with explicit n and with bare stake both HOLD',()=>{
 assert.throws(()=>app.merge('tg kg 11 22 dx10n',MN),/DX liên đài chưa có oracle/u);
 assert.throws(()=>app.merge('tg kg 11 22 dx 10',MN),/Thiếu tiền hoặc thiếu n/u);
 assert.throws(()=>app.merge('tg 11 b10n\n\ntg kg 11 22 dx10n',MN),/HOLD — tin 3/u);
});
test('MN cross-station DA stays HOLD; do not infer money for other bet types',()=>{
 assert.throws(()=>app.merge('tg kg 11 22 da10n',MN),/ĐÁ\/DX liên đài chưa có oracle/u);
 assert.throws(()=>app.merge('tg kg 11 22 xc10n',MN),/XC chưa có quy tắc/u);
});
