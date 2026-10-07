(function(global){
  'use strict';

  const REGIONS=Object.freeze(['mn','mt','mb']);

  function decimalText(value,name){
    const raw=String(value==null?'':value).trim().replace(',','.');
    if(!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error((name||'Giá trị')+' không hợp lệ');
    const n=Number(raw);
    if(!Number.isFinite(n)||n<0) throw new Error((name||'Giá trị')+' không hợp lệ');
    return raw;
  }

  function percent(value,name){
    const raw=decimalText(value,name);
    if(Number(raw)>100) throw new Error((name||'Phần trăm')+' phải từ 0 đến 100');
    return raw;
  }

  function validate(input){
    const type=String(input&&input.commission_type||'ratio').toLowerCase();
    if(!['ratio','amount'].includes(type)) throw new Error('Cách nhập cò không hợp lệ');
    const terms=input&&input.region_terms||{};
    const pricing=input&&input.region_pricing||{};
    const outTerms={},outPricing={};

    for(const region of REGIONS){
      const src=terms[region]||{};
      outTerms[region]={
        total_percent:percent(src.total_percent==null?'100':src.total_percent,'Tổng '+region.toUpperCase()),
        refund_percent:percent(src.refund_percent==null?'0':src.refund_percent,'Hồi '+region.toUpperCase()),
        dat_hit_mode:region==='mb'?'multi_pair':String(src.dat_hit_mode||'ky_ruoi'),
        ...(region==='mb'?{}:{dax_hit_mode:String(src.dax_hit_mode||'multi_pair')})
      };
      outPricing[region]={};
      for(const [code,row] of Object.entries(pricing[region]||{})){
        const commission=decimalText(row&&row.commission==null?'0':row.commission,'Cò '+region.toUpperCase()+' '+code);
        const win=decimalText(row&&row.win==null?'0':row.win,'Trúng '+region.toUpperCase()+' '+code);
        if(type==='ratio'&&Number(commission)>1) throw new Error('Cò '+region.toUpperCase()+' '+code+' dạng tỉ lệ phải từ 0 đến 1');
        outPricing[region][code]={commission,win};
      }
    }
    return Object.freeze({commission_type:type,region_terms:Object.freeze(outTerms),region_pricing:Object.freeze(outPricing)});
  }

  global.KTS_SETTLEMENT_CONFIG_VALIDATION=Object.freeze({
    version:'settlement-config-validation-v1',
    decimalText,percent,validate
  });
})(typeof window!=='undefined'?window:globalThis);
