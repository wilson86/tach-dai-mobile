'use strict';
const https=require('node:https');
function createReviewerSessionObserver({ca,request=https.request}={}){
  if(!Buffer.isBuffer(ca)||ca.length===0||typeof request!=='function')throw Error('REVIEWER_HTTPS_CONFIG_INVALID');
  return ({method,path,bearer})=>new Promise((resolve,reject)=>{
    if(method!=='GET'||path!=='/v1/session'||typeof bearer!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(bearer)){reject(Error('REVIEWER_HTTPS_REQUEST_INVALID'));return;}
    let done=false,req;const fail=()=>{if(!done){done=true;reject(Error('REVIEWER_HTTPS_UNVERIFIED'));}};
    try{
      req=request({hostname:'192.168.0.148',port:9448,path,method,ca,rejectUnauthorized:true,headers:{authorization:'Bearer '+bearer},timeout:5000},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>8192){fail();req.destroy();}});
        res.on('error',fail);res.on('end',()=>{if(done)return;try{const parsed=JSON.parse(body);done=true;resolve({status:res.statusCode,body:parsed});}catch(_){fail();}});
      });
      req.on('error',fail);req.on('timeout',()=>{fail();req.destroy();});req.end();
    }catch(_){fail();}
  });
}
module.exports=Object.freeze({createReviewerSessionObserver});
