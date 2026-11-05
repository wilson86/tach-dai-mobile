'use strict';
// Canonical tenant-bound cursor shared by the repository and API boundary.
const MAX_FEED_SEQ=9223372036854775807n;
function normalizedFeedSeq(value){
 if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='bigint')throw Error('TEAM_CURSOR_INVALID');
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw Error('TEAM_CURSOR_INVALID');
 const str=String(value);
 if(!/^(0|[1-9][0-9]{0,18})$/.test(str)||BigInt(str)>MAX_FEED_SEQ)throw Error('TEAM_CURSOR_INVALID');
 return str;
}
function encodeCursor(feedSeq,workspaceId){
 if(typeof workspaceId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(workspaceId))throw Error('TEAM_CURSOR_INVALID');
 return Buffer.from(JSON.stringify({feed_seq:normalizedFeedSeq(feedSeq),workspace_id:workspaceId}),'utf8').toString('base64url');
}
function decodeCursor(cursor,workspaceId){
 if(cursor===null||cursor===undefined||cursor==='')return {feed_seq:'0'};
 if(typeof cursor!=='string'||cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error('TEAM_CURSOR_INVALID');
 try{
  const parsed=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length!==2||
    !Object.prototype.hasOwnProperty.call(parsed,'feed_seq')||!Object.prototype.hasOwnProperty.call(parsed,'workspace_id')||
    parsed.workspace_id!==workspaceId||typeof parsed.feed_seq!=='string'||encodeCursor(parsed.feed_seq,workspaceId)!==cursor)throw Error();
  return {feed_seq:normalizedFeedSeq(parsed.feed_seq)};
 }catch{throw Error('TEAM_CURSOR_INVALID');}
}
module.exports=Object.freeze({normalizedFeedSeq,encodeCursor,decodeCursor});
