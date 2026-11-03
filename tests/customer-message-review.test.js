const test=require('node:test');const assert=require('node:assert/strict');const {createStore,KEY}=require('../customer-message-review.js');
function storage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)}}
const msg=(id,text='68 86 lo20n',customer='quyt')=>({source_message_id:id,customer_id:customer,original_text:text,source_system:'manual',received_at:'2026-11-03T00:00:00Z',market:'mb',business_date:'2026-11-03'});
test('independent identical messages persist and keep physical source lines',()=>{const s=storage(),a=createStore(s);for(const id of ['1','2','3'])assert.equal(a.add(msg(id)).status,'ADDED');assert.equal(createStore(s).read().length,3);assert.deepEqual(a.add(msg('4','68 lo20n\n86 lo20n')).message.original_lines,[{line:1,text:'68 lo20n'},{line:2,text:'86 lo20n'}]);});
test('retry is idempotent, changed text or customer is held',()=>{const s=createStore(storage());s.add(msg('1'));assert.equal(s.add(msg('1')).status,'ALREADY_PRESENT');assert.throws(()=>s.add(msg('1','68 lo10n')),/SOURCE_REVISION_CONFLICT/);assert.throws(()=>s.add(msg('1','68 86 lo20n','hien')),/SOURCE_REVISION_CONFLICT/);assert.equal(s.read().length,1)});
test('corrupt storage and write failures never overwrite old sources',()=>{const x=storage();x.setItem(KEY,'bad');assert.throws(()=>createStore(x).add(msg('1')),/CORRUPT/);assert.equal(x.getItem(KEY),'bad');const y=storage(),s=createStore(y);s.add(msg('1'));const before=y.getItem(KEY);y.setItem=()=>{throw Error('quota')};assert.throws(()=>s.add(msg('2')),/WRITE_HOLD/);assert.equal(y.getItem(KEY),before)});
test('missing source or customer identity is held',()=>{const s=createStore(storage());assert.throws(()=>s.add({...msg('1'),customer_id:''}),/METADATA_REQUIRED/);assert.throws(()=>s.add({...msg('1'),source_message_id:''}),/METADATA_REQUIRED/) });

test('three distinct original IDs are aggregated exactly once and keep provenance',()=>{
 const core=require('../quyt-bao-review.js'),cleanCore=require('../clean-aggregate-review.js'),store=createStore(storage());
 for(const id of ['1','2','3'])store.add(msg(id));store.add(msg('1'));
 const options={core,cleanCore,customerId:'quyt',market:'mb',businessDate:'2026-11-03',rate:'1,067'};
 const result=require('../customer-message-review.js').aggregate(store.read(),options);
 assert.deepEqual(result.entries.map(x=>[x.number,x.original,x.exact]),[['68','60','64.02'],['86','60','64.02']]);
 assert.deepEqual(result.entries[0].provenance.map(x=>[x.source_message_id,x.line]),[['1',1],['2',1],['3',1]]);
 assert.equal(result.forwardAuthorized,false);assert.equal(result.entries[0].rounded,null);
 assert.equal(require('../customer-message-review.js').aggregate(store.read(),{...options,rate:'1,05'}).entries[0].exact,'63');
 assert.throws(()=>require('../customer-message-review.js').aggregate(store.read(),{...options,customerId:'hien'}),/SCOPE/);
});
test('ambiguous duplicate within one source and unknown fragments HOLD',()=>{
 const core=require('../quyt-bao-review.js'),cleanCore=require('../clean-aggregate-review.js'),store=createStore(storage());
 const options={core,cleanCore,customerId:'quyt',market:'mb',businessDate:'2026-11-03',rate:'1,067'};
 store.add(msg('1','68 lo20n\n68 lo20n'));assert.throws(()=>require('../customer-message-review.js').aggregate(store.read(),options),/DUPLICATE/);
 const bad=createStore(storage());bad.add(msg('2','68 lo20n ???'));assert.throws(()=>require('../customer-message-review.js').aggregate(bad.read(),options),/UNRECOGNIZED/);
});

test('B/LO same exposure and malformed prefixes fail closed',()=>{
 const core=require('../quyt-bao-review.js'),cleanCore=require('../clean-aggregate-review.js');
 const options={core,cleanCore,customerId:'quyt',market:'mb',businessDate:'2026-11-03',rate:'1,067'};
 for(const raw of ['86 lo60n\n86 b15n','68 lo20n\n.. 86 lo20n','68 lo20n\n| 86 lo20n']){
  const s=createStore(storage());s.add(msg('1',raw));assert.throws(()=>require('../customer-message-review.js').aggregate(s.read(),options),/HOLD/);
 }
});
