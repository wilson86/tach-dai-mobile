'use strict';
// Owner-authorized 2026-11-05: FINAL Quyt stake INTEGER n HALF_UP, one factor after merge.
// Review-only synthetic fixtures, no Telegram/production money.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
function load(file,calendar=false){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const script=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
 assert.ok(script,'review engine missing: '+file);
 const cal=calendar?fs.readFileSync(path.join(root,'../station_calendar.generated.js'),'utf8')+'\n':'';
 return vm.runInNewContext(cal+script[0]+';OfflineKTS;');
}
const mb=load('index.html',true),mnmt=load('mn-mt-review.html',true);
const o={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
test('75n × 1.067 is 80n (nearest integer HALF_UP) in both MB and MN',()=>{
 const a=mb.merge('hn 21 b75n',o);
 const b=mnmt.merge('mn dn 21 bao75n',{...o,market:'mn',businessDate:'2026-11-04'});
 assert.match(a.pretty,/21 b80n/u);
 assert.match(b.pretty,/dn 21 b80n/u);
 assert.equal(a.total,'80'); assert.equal(b.total,'80');
 assert.equal(a.rows[0].beforeRounding,'80.025');
 assert.equal(b.rows[0].beforeRounding,'80.025');
});
test('10n ×1.067 →11n; HALF_UP 10.500→11, 10.490→10',()=>{
 assert.equal(mb.merge('hn 21 lo10n',o).total,'11');
 assert.equal(mb.merge('hn 21 b10n',{...o,rate:'1.050'}).total,'11');
 assert.equal(mb.merge('hn 21 b10n',{...o,rate:'1.049'}).total,'10');
});
test('merge distinct placements BEFORE factor once; DD also scales and rounds',()=>{
 const a=mb.merge('hn 21 b75n dd5n\nhn 21 b75n dd5n',{...o,duplicateConfirmed:true});
 assert.equal(a.total,'171'); // Bao 150*1.067→160 plus DD 10*1.067→11
 assert.equal(a.sections.find(s=>s.kind==='b').total,'160');
 assert.equal(a.sections.find(s=>s.kind==='dd').total,'11');
 assert.equal(mb.merge('hn 21 bao75n',{...o,tick:false}).total,'75');
});
test('final wager text always uses whole n, audit retains decimals',()=>{
 const a=mb.merge('hn 21 b75n dd5n',o);
 const b=mnmt.merge('mn dn 21 b75n dd5n',{...o,market:'mn',businessDate:'2026-11-04'});
 for(const x of [a,b]){
  assert.doesNotMatch(x.pretty,/\d+[.,]\d+n\b/u);
  for(const row of x.rows) assert.match(row.adjusted,/^\d+$/u);
 }
});
