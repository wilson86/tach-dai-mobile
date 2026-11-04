'use strict';
// PUBLIC synthetic analog only. Never commit real customer ticket or Telegram source.
const test=require('node:test'),assert=require('node:assert/strict');
const parser=require('../clean-aggregate-review.js'),factor=require('../quyt-bao-review.js');
const impl=require('../quyt-ticket-review.js');
const A='Hn 10 b5n dd10n. 11 12 dd10n B5n. 14 15 da20n. 90 dau50n dui150n. 16 17 b30n.';
const B='hn 10 b50n dd50n. 11 b50n. 18 dd300n. 19 20 dd200n.';
const msg=(id,raw,customer='quyt')=>({source_message_id:id,original_text:raw,customer_id:customer,market:'mb',business_date:'2026-11-04'});
const options={market:'mb',businessDate:'2026-11-04',customerId:'quyt',multiply:false,rate:'1.067',cleanCore:parser,rateParser:factor.parseRate};
const run=(messages=[msg('A',A),msg('B',B)],extra={})=>impl.ticket(messages,{...options,...extra});
test('synthetic independent messages conserve original stake per number and pair',()=>{
 const r=run();
 assert.equal(r.sourceCount,2);assert.equal(r.totalOriginal,'1175');assert.equal(r.totalExact,'1175');
 assert.deepEqual([r.originalTotals.bao_lo,r.originalTotals.da,r.originalTotals.dd,r.originalTotals.dau,r.originalTotals.duoi],['175','20','780','50','150']);
 assert.match(r.formatted,/^HN\n/u);
 assert.match(r.formatted,/10 11 b55n/u);
 assert.match(r.formatted,/14 15 da20n/u);
 assert.match(r.formatted,/90 dau50n dui150n/u);
 assert.equal(r.forwardAuthorized,false);
});
test('toggle multiplies BAO_LO only, exact decimals, one time',()=>{
 const r=run(undefined,{multiply:true});
 assert.equal(r.adjustedTotals.bao_lo,'186.725');assert.equal(r.totalExact,'1186.725');
 assert.equal(r.adjustedTotals.da,'20');assert.equal(r.adjustedTotals.dd,'780');
 assert.equal(r.adjustedTotals.dau,'50');assert.equal(r.adjustedTotals.duoi,'150');
 assert.match(r.formatted,/10 11 b58.685n/u);
});
test('repeat toggle never uses already-adjusted text as source',()=>{
 for(let i=0;i<16;i++){
  assert.equal(run(undefined,{multiply:true}).totalExact,'1186.725');
  assert.equal(run(undefined,{multiply:false}).totalExact,'1175');
 }
});
test('edited rate always recomputes from unmodified originals',()=>{
 for(const [rate,expected] of [['1.05','1183.75'],['1.10','1192.5'],['1.067','1186.725']])
  assert.equal(run(undefined,{multiply:true,rate}).totalExact,expected);
});
test('identical text from different IDs counts twice; exact retry ID is idempotent',()=>{
 const original=[msg('a',A),msg('b',A)];
 const x=run(original);
 assert.equal(x.sourceCount,2);
 assert.equal(x.originalTotals.bao_lo,'150');
 assert.equal(run([...original,original[0]]).totalExact,x.totalExact);
});
test('source ID collision with revised text is blocked',()=>{
 assert.throws(()=>run([msg('id',A),msg('id',B)]),/SOURCE_ID_REVISION_CONFLICT_HOLD/);
});
test('BAO and LO same number aggregate but never merge with DD',()=>{
 const r=run([msg('a','hn 21 b10n 21 lo20n 21 dd7n')]);
 assert.deepEqual(r.rows.map(x=>[x.kind,x.original]),[['bao_lo','30'],['dd','7']]);
 assert.equal(run([msg('a','hn 21 b10n 21 lo20n 21 dd7n')],{multiply:true}).adjustedTotals.bao_lo,'32.01');
});
test('DA pair is unordered, distinct pairs remain separate',()=>{
 const r=run([msg('a','hn 21 22 da20n 22 21 da20n 21 23 da10n')]);
 assert.deepEqual(r.rows.filter(x=>x.kind==='da').map(x=>[x.number,x.original]),[['21-22','40'],['21-23','10']]);
});
test('unsupported DA topology, XC, absent n reject rather than drop',()=>{
 for(const ticket of ['hn 21 da20n','hn 21 22 23 da20n','hn 21 xc20n','hn 21 b20'])
  assert.throws(()=>run([msg('a',ticket)]),undefined,ticket);
});
test('source HN does not override market selected in UI',()=>{
 assert.throws(()=>run([msg('a','hn 21 b20n')],{market:'mn'}),/MESSAGE_SCOPE_HOLD/);
});
test('Quyt rate is never silently assigned to another customer',()=>{
 assert.equal(run([msg('a','hn 21 b20n','hien')],{customerId:'hien'}).totalExact,'20');
 assert.throws(()=>run([msg('a','hn 21 b20n','hien')],{customerId:'hien',multiply:true}),/CUSTOMER_MULTIPLIER_NOT_AUTHORIZED_HOLD/);
});
