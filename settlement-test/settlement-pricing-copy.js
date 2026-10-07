(function(global){
  'use strict';

  const SUPPORTED_CODES = Object.freeze({
    mn: Object.freeze(['2CB','2CD','2CB7','DAT','DAX','3CB','3CB7','3CDD','4C']),
    mt: Object.freeze(['2CB','2CD','2CB7','DAT','DAX','3CB','3CB7','3CDD','4C']),
    mb: Object.freeze(['2CB','2CD','2CB8','DAT','3CB','3CB7','3CDD','4C','MB_XIEN2','MB_XIEN3','MB_XIEN4','UI'])
  });

  function validRegion(region){ return Object.prototype.hasOwnProperty.call(SUPPORTED_CODES,String(region||'').toLowerCase()); }
  function normRate(value){ const text=String(value==null?'0':value).trim(); return text || '0'; }

  function copyRates(input){
    const source=String(input&&input.source_region||'').toLowerCase();
    const target=String(input&&input.target_region||'').toLowerCase();
    if(!validRegion(source)||!validRegion(target)) throw new Error('INVALID_COPY_RATE_REGION');
    if(source===target) throw new Error('COPY_RATE_SAME_REGION');

    const pricing=input&&input.pricing&&typeof input.pricing==='object'?input.pricing:{};
    const sourceData=pricing[source]&&typeof pricing[source]==='object'?pricing[source]:{};
    const sourceCodes=new Set(SUPPORTED_CODES[source]);
    const targetPricing={};
    let copiedCodes=0,zeroedCodes=0;

    for(const code of SUPPORTED_CODES[target]){
      if(sourceCodes.has(code)){
        const row=sourceData[code]&&typeof sourceData[code]==='object'?sourceData[code]:{};
        targetPricing[code]={commission:normRate(row.commission),win:normRate(row.win)};
        copiedCodes+=1;
      }else{
        targetPricing[code]={commission:'0',win:'0'};
        zeroedCodes+=1;
      }
    }
    return Object.freeze({
      source_region:source,
      target_region:target,
      target_pricing:Object.freeze(targetPricing),
      copied_codes:copiedCodes,
      zeroed_codes:zeroedCodes
    });
  }

  global.KTS_SETTLEMENT_PRICING_COPY=Object.freeze({
    version:'settlement-pricing-copy-v1',
    SUPPORTED_CODES,
    copyRates
  });
})(typeof window!=='undefined'?window:globalThis);
