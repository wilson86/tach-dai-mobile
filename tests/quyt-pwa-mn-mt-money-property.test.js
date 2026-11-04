'use strict';
// Deterministic synthetic property oracle, never real customer messages.
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'mn-mt-review.html'),'utf8');
const calendar=fs.readFileSync(path.join(root,'../station_calendar.generated.js'),'utf8');
const src=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(src,'Code-bearing canonical standalone engine must be present');
const app=vm.runInNewContext(calendar+'\n'+src[0]+';OfflineKTS;');
let seed=107;
const rng=()=>((seed=(seed*1664525+1013904223)>>>0),seed);
test('150 station-day mixed wager sets, tick and untick: 300 independent money oracles',()=>{
 let executions=0;
 for(let j=0;j<150;j++){
  const market=j%2?'mn':'mt';
  const stations=market==='mn'?['dn','ct','st']:['dn','kh'];
  const types=['b','lo','dd','dau','dui'];
  const raw=[],expected=new Map(), count=3+(rng()%12);
  for(let n=0;n<count;n++){
   const station=stations[rng()%stations.length],kind=types[rng()%types.length];
   const normalized=kind==='lo'?'b':kind,number=String(rng()%8).padStart(2,'0');
   const amount=rng()%100+1,key=station+'|'+normalized+'|'+number;
   raw.push(market+' '+station+' '+number+' '+kind+amount+'n.');
   expected.set(key,(expected.get(key)||0)+amount);
  }
  for(const tick of [false,true]){
   const out=app.merge(raw.join('\n'),{market,businessDate:'2026-11-04',customer:'quyt',
     tick,rate:'1.067',duplicateConfirmed:true});
   let expectedRaw=0, expectedResult=0;
   const actualRows=new Map(out.rows.map(r=>[r.station+'|'+r.kind+'|'+r.number,Number(r.adjusted)]));
   for(const [key,value] of expected){
    expectedRaw+=value;
    const scaled=key.split('|')[1]==='b'&&tick?Math.floor(value*1.067+0.5):value;
    expectedResult+=scaled;
    assert.equal(actualRows.get(key),scaled,'row '+key+' case '+j);
   }
   assert.equal(out.rows.length,expected.size);
   assert.equal(Number(out.original),expectedRaw);
   assert.equal(Number(out.total),expectedResult);
   assert.equal(out.sections.reduce((n,x)=>n+Number(x.total),0),expectedResult);
   assert.equal(out.sourceCount,raw.length);
   assert.doesNotMatch(out.pretty,/\d+\.\d+n/u);
   executions++;
  }
 }
 assert.equal(executions,300);
});
test('physical blank lines and region source marker do not become money',()=>{
 assert.throws(()=>app.merge('mn dn 21 b10n\n\nmn ct 21 b10n\n\nmn ct 21 xx10n',
 {market:'mn',businessDate:'2026-11-04',customer:'quyt',tick:false,rate:'1.067'}),
 /tin 5/u);
 assert.throws(()=>app.merge('mn dn hn 21 b10n',
 {market:'mn',businessDate:'2026-11-04',customer:'quyt',tick:false,rate:'1.067'}),
 /HN nằm sau/u);
});
