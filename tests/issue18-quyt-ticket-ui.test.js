'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const parser=require('../clean-aggregate-review.js'),rate=require('../quyt-bao-review.js'),engine=require('../quyt-ticket-review.js');
const ui=require('node:fs').readFileSync(require('node:path').join(__dirname,'../quyt-ticket-review-ui.js'),'utf8');
function mount(raw){
 const els=[],data=new Map(),copies=[],messages=[],storage=new Map();
 const el=(id='')=>{
  const x={id,value:'',textContent:'',checked:false,disabled:false,hidden:false,style:{},listeners:{},children:[],
   append(...nodes){this.children.push(...nodes)},
   insertAdjacentElement(_position,node){this.children.push(node)},
   setAttribute(){},
   addEventListener(event,fn){(this.listeners[event]??=[]).push(fn)},
   async emit(type,details={}){
    const event={type,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...details};
    for(const fn of this.listeners[type]??[]){await fn(event);if(event.stopped)break}return event;
   }
  };els.push(x);return x;
 };
 const input=el('input');input.value=raw;const output=el('output');
 const customer=el('ktsReviewCustomer');customer.value='quyt';
 const optIn=el('ktsCustomerRateToggle');optIn.checked=true;
 const factor=el('ktsQuytRate');factor.value='1.067';
 const region=el('region');region.value='mb';
 const day=el('date');day.value='2026-11-04';
 const legacyCopy=el('copyBtn'),legacyCut=el('cutBtn');
 const document={readyState:'complete',getElementById:id=>els.find(x=>x.id===id)||null,createElement:()=>el(),addEventListener(){}};
 const window={KTSQuytTicketReview:engine,KTSCleanAggregate:parser,KTSQuytBaoReview:rate,
  location:{pathname:'/review/'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  navigator:{clipboard:{writeText:async text=>copies.push(text)}},confirm:text=>{messages.push(text);return true},addEventListener(){}};
 new Function('window','document',ui)(window,document);
 return{input,output,customer,factor,legacyCopy,legacyCut,copies,messages,storage,
  get:id=>document.getElementById(id)};
}
test('duplicate pasted lines HOLD until operator confirms distinct bets',async()=>{
 const d=mount('hn 21 b10n\nhn 21 b10n');
 const output=d.get('ktsQuytTicketResult'),confirm=d.get('ktsQuytTicketKeepDuplicates'),copy=d.get('ktsQuytTicketCopy');
 assert.equal(output.value,'');assert.equal(copy.disabled,true);assert.equal(confirm.hidden,false);
 await confirm.emit('click');assert.equal(d.messages.length,1);assert.match(output.value,/21 b20n/);
 assert.equal(copy.disabled,false);
 const toggle=d.get('ktsQuytTicketTick');toggle.checked=true;await toggle.emit('change');
 assert.match(output.value,/21 b21.34n/);
 const ev=await d.legacyCopy.emit('click');assert.equal(ev.defaultPrevented,true);assert.equal(ev.stopped,true);
 assert.equal(d.copies[0],output.value);
});
test('unchecked is original despite invalid multiplier draft, ticked invalid HOLD',async()=>{
 const d=mount('hn 21 b10n');
 const original=d.get('ktsQuytTicketResult');assert.match(original.value,/21 b10n/);
 d.factor.value='invalid';await d.factor.emit('input');assert.match(original.value,/21 b10n/);
 const toggle=d.get('ktsQuytTicketTick');toggle.checked=true;await toggle.emit('change');
 assert.equal(original.value,'');assert.equal(d.get('ktsQuytTicketCopy').disabled,true);
 toggle.checked=false;await toggle.emit('change');assert.match(original.value,/21 b10n/);
});
test('Quyt native Cut is blocked only with factor ticked',async()=>{
 const d=mount('hn 21 b10n'),toggle=d.get('ktsQuytTicketTick');
 const plain=await d.legacyCut.emit('click');assert.equal(plain.defaultPrevented,false);
 toggle.checked=true;await toggle.emit('change');
 const adjusted=await d.legacyCut.emit('click');assert.equal(adjusted.defaultPrevented,true);
});
