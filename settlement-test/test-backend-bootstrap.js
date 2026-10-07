(function(global){
  'use strict';
  const BASE='https://kts-settlement-api-test.onrender.com';
  const TARGETS={
    kts_settlement_parser_endpoint_v1: BASE + '/api/settlement/parse',
    kts_kqxs_endpoint_v1: BASE + '/api/kqxs'
  };

  function shouldBootstrap(current){
    const value=String(current||'').trim();
    if(!value)return true;
    if(value.startsWith('/api/'))return true;
    try{
      const u=new URL(value,global.location&&global.location.href?global.location.href:'https://wilson86.github.io/');
      return u.hostname==='wilson86.github.io' && u.pathname.startsWith('/api/');
    }catch(_){return false;}
  }

  try{
    if(global.localStorage){
      for(const [key,target] of Object.entries(TARGETS)){
        const current=global.localStorage.getItem(key);
        if(shouldBootstrap(current))global.localStorage.setItem(key,target);
      }
      global.localStorage.setItem('kts_settlement_test_backend_v1',BASE);
    }
  }catch(_){}

  global.KTS_SETTLEMENT_TEST_BACKEND=Object.freeze({
    version:'settlement-test-backend-bootstrap-v1',
    base_url:BASE,
    parser_endpoint:TARGETS.kts_settlement_parser_endpoint_v1,
    kqxs_endpoint:TARGETS.kts_kqxs_endpoint_v1
  });
})(typeof window!=='undefined'?window:globalThis);
