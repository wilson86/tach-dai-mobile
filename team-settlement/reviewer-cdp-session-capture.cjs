'use strict';
// Retains the actual UI login bearer only in the returned in-memory promise.
// Callers must not log or persist the value; errors deliberately contain no
// response data. Install before the Reviewer presses the login button.
function captureReviewerLogin({cdp,base,timeoutMs=10000}={}){
  if(!cdp||typeof cdp.onEvent!=='function'||typeof cdp.call!=='function'||
     !/^https:\/\/192\.168\.0\.148:9448$/.test(base||'')||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
    throw Error('REVIEWER_CDP_CAPTURE_CONFIG_INVALID');
  let id=null,settled=false,timer;
  const promise=new Promise((resolve,reject)=>{
    const fail=()=>{if(!settled){settled=true;clearTimeout(timer);reject(Error('REVIEWER_CDP_CAPTURE_UNVERIFIED'));}};
    timer=setTimeout(fail,timeoutMs);
    cdp.onEvent('Network.responseReceived',event=>{
      if(settled||event?.response?.url!==base+'/v1/login')return;
      if(id!==null||event.response.status!==200||typeof event.requestId!=='string'){fail();return;}
      id=event.requestId;
    });
    cdp.onEvent('Network.loadingFinished',event=>{
      if(settled||id===null||event?.requestId!==id)return;
      Promise.resolve(cdp.call('Network.getResponseBody',{requestId:id})).then(result=>{
        if(settled)return;
        try{
          if(result?.base64Encoded!==false||typeof result.body!=='string'||result.body.length>8192)throw Error();
          const token=JSON.parse(result.body).session_token;
          if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw Error();
          settled=true;clearTimeout(timer);resolve(token);
        }catch(_){fail();}
      },fail);
    });
    cdp.onEvent('Network.loadingFailed',event=>{if(id!==null&&event?.requestId===id)fail();});
  });
  return promise;
}
module.exports=Object.freeze({captureReviewerLogin});
