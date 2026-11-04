'use strict';
// Standalone MB synthetic DOM tests. No real Telegram content, network or clipboard.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../quyt-pwa/index.html'),'utf8');
const engine=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
const ui=html.match(/<script>\s*(\(\(\)=>\{'use strict';[\s\S]*?\}\)\(\);)\s*<\/script>/u);
assert.ok(engine&&ui,'must use real source engine and UI handlers');
function element(){
 return {value:'',textContent:'',disabled:false,style:{},classList:{toggle(){}},handlers:{},
  addEventListener(name,fn){this.handlers[name]=fn},replaceChildren(){},append(){},focus(){},select(){}};
}
function makeApp(writeText){
 const ids={};
 for(const id of ['raw','result','rate','tick','customer','market','status','copy','select',
  'confirmDuplicates','confirmMissingDaN','missingUnitAudit','missingUnitAuditBody',
  'before','after','details','toggleWrap','clear'])ids[id]=element();
 ids.customer.value='quyt';ids.market.value='mb';ids.rate.value='1.067';
 const frames=['b','da','xc','dd','dau','dui'].map(kind=>({
  kind,getAttribute(){return kind},
  parts:{'.section-text':element(),'.section-total':element(),'.section-copy':element()},
  querySelector(name){return this.parts[name]}
 }));
 let fallbackCalls=0;
 const document={getElementById:id=>ids[id]||(ids[id]=element()),querySelectorAll:()=>frames,
  createElement:()=>element(),execCommand(){fallbackCalls++;return true}};
 const storage=()=>({getItem:()=>null,setItem(){}});
 vm.runInNewContext(engine[0]+'\n'+ui[1],{
  document,navigator:{clipboard:{writeText}},localStorage:storage(),sessionStorage:storage(),
  confirm:()=>true
 },{timeout:3000});
 const edit=source=>{ids.raw.value=source;ids.raw.handlers.input()};
 return {ids,frames,edit,getFallbackCalls:()=>fallbackCalls};
}
function delayedClipboard(){
 let resolve,reject;const payloads=[];
 return {payloads,writeText(text){payloads.push(text);return new Promise((yes,no)=>{resolve=yes;reject=no})},
  resolve:()=>resolve(),reject:()=>reject(new Error('denied'))};
}
for(const scope of ['full','group']){
 for(const settle of ['resolve','reject']){
  test(scope+' Copy cannot claim success after edit while clipboard pending ('+settle+')',async()=>{
   const clipboard=delayedClipboard(),app=makeApp(clipboard.writeText.bind(clipboard));
   app.edit('hn 21 b55n.');
   const pending=scope==='full'?app.ids.copy.handlers.click():
    app.frames[0].parts['.section-copy'].handlers.click();
   app.edit('hn 21 b90n.');
   clipboard[settle]();
   await pending;
   assert.match(clipboard.payloads[0],/55n/u);
   assert.match(app.ids.result.value,/90n/u);
   assert.match(app.ids.status.textContent,/HOLD:.*CLIPBOARD CÓ THỂ CHỨA TIN CŨ/u);
   assert.equal(app.getFallbackCalls(),0,'cannot retry copying a stale result');
  });
 }
 test(scope+' Copy reports success when input and factor remain unchanged',async()=>{
  const app=makeApp(async()=>{});
  app.edit('hn 21 b55n.');
  await (scope==='full'?app.ids.copy.handlers.click():app.frames[0].parts['.section-copy'].handlers.click());
  assert.match(app.ids.status.textContent,/ĐÃ COPY/u);
 });
}
test('unchanged failed Clipboard API may use current-result fallback',async()=>{
 const app=makeApp(async()=>{throw Error('denied')});
 app.edit('hn 21 b55n.');
 await app.ids.copy.handlers.click();
 assert.equal(app.getFallbackCalls(),1);
 assert.match(app.ids.status.textContent,/ĐÃ COPY/u);
});
