/* GENERATED FILE — DO NOT EDIT.
 * ENGINE_VERSION: 1.0.0-candidate.1
 * ENGINE_SHA256: 2aea573c27fba78f1c98c664a4dc009d071cc3677fc3ee7f1183104ea93f64b4
 */
(function(global) {
  "use strict";
  const source={"spec":{"schema":"KTS_SHARED_BUSINESS_ENGINE_V1","engine_version":"1.0.0-candidate.1","semantic_source":"This file and calendar_authority.json are the only manually maintained shared-rule sources. Generated adapters are never edited.","weekday_labels":{"0":"CHỦ NHẬT","1":"THỨ HAI","2":"THỨ BA","3":"THỨ TƯ","4":"THỨ NĂM","5":"THỨ SÁU","6":"THỨ BẢY"},"workflow_policies":{"TACH_3_MIEN":{"policy_version":"1","money_allocation":"HALF_UNIT_QUOTIENT_REMAINDER","station_exposure":"FULL_PER_SEMANTIC_STATION","mb_split":"HALF_UNIT_QUOTIENT_REMAINDER"},"NGANG":{"policy_version":"1","money_allocation":"WHOLE_INPUT_INTEGER_QUOTIENT_REMAINDER_ELSE_HALF_UNIT_QUOTIENT_REMAINDER","station_exposure":"HORIZONTAL_SPLIT","mb_split":"NOT_APPLICABLE"},"ROUTER_VALIDATE_FORWARD":{"policy_version":"1","money_allocation":"PRESERVE_VALIDATED_SOURCE_SEMANTICS","station_exposure":"ROUTER_OWNER_ALLOCATION","mb_split":"ROUTER_POLICY_ONLY"}},"selector_contract":{"canonical_aliases":{"b":"B","bao":"LO","dd":"DD","đđ":"DD","d":"D","dau":"DAU","đầu":"DAU","duoi":"DUOI","đuôi":"DUOI","lo":"LO","lô":"LO","bl":"LO","da":"DAT","đá":"DAT","dat":"DAT","dathang":"DAT","dx":"DX","đx":"DX","xc":"XC","x":"XC"},"three_mien_replicated_selectors":["B","DD","D","DAU","DUOI","LO","XC"],"dx_pair_order":"AUTHORITATIVE_SCHEDULE_ORDER_UNORDERED_PAIR"},"selector_policies":{"B":{"topology":"STATION_EXPOSURE","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"DD":{"topology":"STATION_EXPOSURE","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"XC":{"topology":"EXPLICIT_OR_FULL","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"DX":{"topology":"UNORDERED_STATION_PAIRS","money":"PER_PAIR_FOR_TACH_3_MIEN","fraction":"HALF_UNIT_ONLY"},"DAT":{"topology":"TWO_STATION_OR_WORKFLOW","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"DAU":{"topology":"STATION_EXPOSURE","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"DUOI":{"topology":"STATION_EXPOSURE","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"},"LO":{"topology":"STATION_EXPOSURE","money":"WORKFLOW","fraction":"HALF_UNIT_ONLY"}},"selector_groups":{"bet_tokens":["b","bao","dd","đđ","xc","x","dx","đx","da","đá","dat","dathang","d","duoi","đuôi","dau","đầu","lo","lô","bl"],"dx_tokens":["dx","đx","da","đá","dat","dathang"],"literal_dx_tokens":["dx","đx"],"xc_tokens":["xc","x"],"two_station_da_tokens":["da","đá","dx","đx"]},"station_aliases":[["thanh pho ho chi minh","tp"],["thành phố hồ chí minh","tp"],["thua thien hue","hue"],["thừa thiên huế","hue"],["ho chi minh","tp"],["hồ chí minh","tp"],["binh duong","bd"],["binh phuoc","bp"],["binh thuan","bt"],["bình dương","bd"],["bình phước","bp"],["bình thuận","bt"],["kien giang","kg"],["kiên giang","kg"],["ninh thuan","nt"],["ninh thuận","nt"],["quang binh","qb"],["quang ngai","qn"],["quảng bình","qb"],["quảng ngãi","qn"],["tien giang","tg"],["tiền giang","tg"],["binh dinh","bd"],["bình định","bd"],["dong thap","dt"],["hau giang","hg"],["hậu giang","hg"],["khanh hoa","kh"],["khánh hòa","kh"],["quang nam","qn"],["quang tri","qt"],["quảng nam","qn"],["quảng trị","qt"],["soc trang","st"],["sóc trăng","st"],["vinh long","vl"],["vĩnh long","vl"],["đồng tháp","dt"],["an giang","ag"],["bac lieu","bli"],["bạc liêu","bli"],["dak nong","dno"],["dong nai","dn"],["tay ninh","tn"],["tra vinh","tv"],["trà vinh","tv"],["tây ninh","tn"],["vung tau","vt"],["vũng tàu","vt"],["đắk nông","dno"],["đồng nai","dn"],["ben tre","bt"],["bến tre","bt"],["can tho","ct"],["cần thơ","ct"],["da nang","dn"],["dak lak","dl"],["gia lai","gl"],["kon tum","kt"],["long an","la"],["phu yen","py"],["phú yên","py"],["đà nẵng","dn"],["đắk lắk","dl"],["ca mau","cm"],["cà mau","cm"],["da lat","dl"],["tp hcm","tp"],["tp.hcm","tp"],["đà lạt","dl"],["tphcm","tp"],["hue","hue"],["huế","hue"]],"fail_closed":{"invalid_split_money":"SỐ TIỀN CHIA CHỈ ĐƯỢC PHÉP BƯỚC 0.5","calendar_schema":"BUSINESS_ENGINE_CALENDAR_SCHEMA_INVALID","generated_stale":"BUSINESS_ENGINE_GENERATED_ARTIFACT_STALE","engine_mismatch":"BUSINESS_ENGINE_MISMATCH"},"parser_contract":{"grammar_version":"2","validation_scopes":{"duplicate_number":"NUMBER_GROUP","selector":"BET_CLAUSE","amount":"BET_CLAUSE","station":"LINE","region":"SOURCE","topology":"SEMANTIC_OUTPUT"},"numeric_period_policy":"DECIMAL_ONLY_WHEN_DIGITS_DOT_DIGITS_AMOUNT; OTHERWISE_COMPACT_CLAUSE_SEPARATOR","source_atomicity":"FAIL_CLOSED_ON_GENUINE_INVALID_CLAUSE"},"region_resolution_contract":{"precedence":["EXPLICIT_FULL_STATION","EXPLICIT_REGION","PERSISTED_SOURCE_REGION","SOURCE_TIME_WINDOW"],"bare_dn":{"mn":"Đồng Nai","mt":"Đà Nẵng","mb":"FAIL_CLOSED_AMBIGUOUS_DN","outside_window":"FAIL_CLOSED_AMBIGUOUS_DN"},"historical_region":"PERSISTED_SOURCE_REGION_IS_AUTHORITATIVE_OVER_UI_OR_TIME","failure":"REGION_AMBIGUOUS_FAIL_CLOSED"}},"calendar":{"schema":"KTS_STATION_SCHEDULE_AUTHORITY_V1","weekday_convention":"JavaScript Date.getDay(): 0=Sunday, 1=Monday, ... 6=Saturday","role_contract":{"main_station_count":2,"auxiliary_stations_follow_main":true,"mb":"single-region check-only; no station split"},"regions":{"mn":{"0":[["tg","Tiền Giang"],["kg","Kiên Giang"],["dl","Đà Lạt"]],"1":[["tp","TP.HCM"],["dt","Đồng Tháp"],["cm","Cà Mau"]],"2":[["bt","Bến Tre"],["vt","Vũng Tàu"],["bli","Bạc Liêu"]],"3":[["dn","Đồng Nai"],["ct","Cần Thơ"],["st","Sóc Trăng"]],"4":[["tn","Tây Ninh"],["ag","An Giang"],["bt","Bình Thuận"]],"5":[["vl","Vĩnh Long"],["bd","Bình Dương"],["tv","Trà Vinh"]],"6":[["tp","TP.HCM"],["la","Long An"],["bp","Bình Phước"],["hg","Hậu Giang"]]},"mt":{"0":[["kh","Khánh Hòa"],["kt","Kon Tum"],["hue","Huế"]],"1":[["hue","Huế"],["py","Phú Yên"]],"2":[["dl","Đắk Lắk"],["qn","Quảng Nam"]],"3":[["dn","Đà Nẵng"],["kh","Khánh Hòa"]],"4":[["bd","Bình Định"],["qt","Quảng Trị"],["qb","Quảng Bình"]],"5":[["gl","Gia Lai"],["nt","Ninh Thuận"]],"6":[["dn","Đà Nẵng"],["qn","Quảng Ngãi"],["dno","Đắk Nông"]]},"mb":{"0":[["mb","Miền Bắc"]],"1":[["mb","Miền Bắc"]],"2":[["mb","Miền Bắc"]],"3":[["mb","Miền Bắc"]],"4":[["mb","Miền Bắc"]],"5":[["mb","Miền Bắc"]],"6":[["mb","Miền Bắc"]]}},"authoritative_regression":{"date":"2026-09-13","region":"mt","stations":["kh","kt","hue"],"main_stations":["kh","kt"],"auxiliary":["hue"]}}};
  const fail=source.spec.fail_closed.invalid_split_money;
  function parseMoney(token) {
    const m=String(token||"").match(/^(\d+)(?:[.,](\d+))?([a-zA-ZđĐ]?)$/u);
    if(!m) throw new Error(fail);
    const fraction=m[2]||"";
    if(!Number.isSafeInteger(Number(m[1])) || (!/^0*$/u.test(fraction) && !/^50*$/u.test(fraction))) throw new Error(fail);
    return {halfUnits:Number(m[1])*2+(fraction&&!/^0*$/u.test(fraction)?1:0), suffix:m[3], comma:String(token).includes(","), whole:/^\d+(?:[.,]0+)?[a-zA-ZđĐ]?$/u.test(String(token||""))};
  }
  function format(units,suffix,comma) { const out=units%2===0?String(units/2):`${Math.floor(units/2)}.5`; return (comma?out.replace(".",","):out)+suffix; }
  function allocateStake(token,count,mode) {
    if(!Number.isInteger(count)||count<1) return Array(Math.max(0,count||0)).fill(null);
    const p=parseMoney(token), policy=source.spec.workflow_policies[mode];
    if(!policy) throw new Error("BUSINESS_ENGINE_WORKFLOW_UNKNOWN:"+mode);
    let total=p.halfUnits, divisor=count, half=true;
    if(mode==="NGANG" && p.whole) { total=Number(String(token).match(/^\d+/u)[0]); half=false; }
    const q=Math.floor(total/divisor), r=total%divisor;
    return Array.from({length:count},(_,i)=>{ const units=q+(i>=count-r?1:0); return units>0?(half?format(units,p.suffix,p.comma):`${units}${p.suffix}`):null; });
  }
  function topology(stations,count) {
    const selected=(stations||[]).slice(0,Math.min(Number(count)||0,(stations||[]).length));
    const codes=selected.map(x=>Array.isArray(x)?x[0]:x);
    if(new Set(codes).size!==codes.length) throw new Error("TOPOLOGY_INTEGRITY_FAILED:DUPLICATE_ACTIVE_STATION");
    const pairs=[]; for(let i=0;i<codes.length;i++) for(let j=i+1;j<codes.length;j++) pairs.push([codes[i],codes[j]]);
    return Object.freeze({stations:Object.freeze(selected),codes:Object.freeze(codes),primary:Object.freeze(codes.slice(0,2)),auxiliary:Object.freeze(codes.slice(2)),pairs:Object.freeze(pairs.map(Object.freeze))});
  }
  function isNumberToken(token) { return /^\d{1,4}$/u.test(String(token||"")); }
  function isMoneyToken(token) { return /^\d+(?:[.,]\d+)?[a-zA-ZđĐ]?$/u.test(String(token||"")); }
  function isBetToken(token) { return source.spec.selector_groups.bet_tokens.includes(String(token||"").toLowerCase()); }
  function splitCompactBetToken(token) {
    const raw=String(token||"").toLowerCase(), types=[...source.spec.selector_groups.bet_tokens].sort((a,b)=>b.length-a.length);
    for(const bet of types) if(raw.startsWith(bet) && raw.length>bet.length) { const money=raw.slice(bet.length); if(isMoneyToken(money)) return [bet,money]; }
    return null;
  }
  function parseBetPayloadAst(rest) {
    const toks=String(rest||"").split(/\s+/u).filter(Boolean), groups=[]; let i=0;
    while(i<toks.length) {
      const numbers=[]; while(i<toks.length && isNumberToken(toks[i]) && !isBetToken(toks[i])) numbers.push(toks[i++]);
      if(!numbers.length) throw new Error(`phải có số đánh trước '${toks[i]||""}'`);
      const dups=[...new Set(numbers.filter((n,index)=>numbers.indexOf(n)!==index))];
      if(dups.length) throw new Error(dups.length===1?`trùng số ${dups[0]} trong cùng cú pháp`:`trùng các số ${dups.join(", ")} trong cùng cú pháp`);
      const bets=[]; while(i<toks.length) {
        if(isNumberToken(toks[i]) && !isBetToken(toks[i])) break;
        const compact=splitCompactBetToken(toks[i]); let selector,money;
        if(compact) { [selector,money]=compact;i++; }
        else if(isBetToken(toks[i])) { selector=toks[i++]; money=toks[i++]; if(!money) throw new Error(`thiếu tiền sau loại cược '${selector}'`); }
        else if(isMoneyToken(toks[i])) throw new Error(`thiếu loại cược trước '${toks[i]}'`);
        else throw new Error(`không nhận ra cú pháp '${toks[i]}'`);
        if(isBetToken(money)||splitCompactBetToken(money)||!isMoneyToken(money)) throw new Error(`tiền cược '${money}' không hợp lệ`);
        bets.push({selector,amount:money});
      }
      if(!bets.length) throw new Error("thiếu loại cược sau số"); groups.push({numbers,bets});
    } return groups;
  }
  function extractStakeOccurrences(text) {
    const tokens=String(text||"").split(/\s+/u).filter(Boolean), occurrences=[]; let i=0;
    while(i<tokens.length) {
      const compact=splitCompactBetToken(tokens[i]);
      if(compact) { const selector=source.spec.selector_contract.canonical_aliases[compact[0]]; if(selector) occurrences.push(Object.freeze({selector,amount:compact[1]})); i++; continue; }
      const selector=source.spec.selector_contract.canonical_aliases[String(tokens[i]||"").toLowerCase()];
      if(selector && isMoneyToken(tokens[i+1])) { occurrences.push(Object.freeze({selector,amount:tokens[i+1]})); i+=2; continue; }
      i++;
    } return Object.freeze(occurrences);
  }
  function extractExplicitSourceRegion(text) {
    const lines=String(text||"").split(/\r?\n/u).filter(x=>x.trim());
    const first=(lines[0]||"").trim();
    const match=first.match(/^[\s\-—|_.,]*(mn|mt|mb)(?=$|[\s\-—|_.,])/iu);
    if(!match) return Object.freeze({region:null,text:String(text||""),explicit:false});
    const region=match[1].toLowerCase();
    if(/^[\s\-—|_.,]*(mn|mt|mb)[\s\-—|_.,]*$/iu.test(first)) lines.shift();
    else lines[0]=lines[0].slice(match[0].length).replace(/^[\s\-—|_.,]+/u,"").trim();
    return Object.freeze({region,text:lines.join("\n"),explicit:true});
  }
  function resolveSourceRegion(text, options={}) {
    const extracted=extractExplicitSourceRegion(text), persisted=String(options.persistedRegion||"").toLowerCase();
    const first=(extracted.text.split(/\r?\n/u).find(x=>x.trim())||"").trim().toLowerCase();
    let station=null, stationRegion=null;
    if(/^(?:đồng\s*nai|dong\s*nai)\b/iu.test(first)) { station="Đồng Nai"; stationRegion="mn"; }
    else if(/^(?:đà\s*nẵng|da\s*nang)\b/iu.test(first)) { station="Đà Nẵng"; stationRegion="mt"; }
    else if(/^dn\b/iu.test(first)) {
      if(extracted.region==="mn") { station="Đồng Nai"; stationRegion="mn"; }
      else if(extracted.region==="mt") { station="Đà Nẵng"; stationRegion="mt"; }
      else if(extracted.region==="mb") return Object.freeze({...extracted,canonicalStation:null,resolvedRegion:null,resolutionMethod:"FAIL_CLOSED",error:"REGION_STATION_CONFLICT:MB_DN"});
    }
    if(extracted.region) {
      if(stationRegion && stationRegion!==extracted.region) return Object.freeze({...extracted,canonicalStation:station,resolvedRegion:null,resolutionMethod:"FAIL_CLOSED",error:"REGION_STATION_CONFLICT"});
      return Object.freeze({...extracted,canonicalStation:station,resolvedRegion:extracted.region,resolutionMethod:station?"EXPLICIT_REGION_DISAMBIGUATED_STATION":"EXPLICIT_REGION",error:null});
    }
    if(stationRegion) return Object.freeze({...extracted,canonicalStation:station,resolvedRegion:stationRegion,resolutionMethod:"EXPLICIT_STATION",error:null});
    if(["mn","mt","mb"].includes(persisted)) return Object.freeze({...extracted,canonicalStation:null,resolvedRegion:persisted,resolutionMethod:"PERSISTED_SOURCE",error:null});
    const windowRegion=String(options.windowRegion||"").toLowerCase();
    if(/^dn\b/iu.test(first) && windowRegion==="mb") return Object.freeze({...extracted,canonicalStation:null,resolvedRegion:null,resolutionMethod:"FAIL_CLOSED",error:"FAIL_CLOSED_AMBIGUOUS_DN"});
    if(["mn","mt","mb"].includes(windowRegion)) return Object.freeze({...extracted,canonicalStation:windowRegion==="mn"&&/^dn\b/iu.test(first)?"Đồng Nai":windowRegion==="mt"&&/^dn\b/iu.test(first)?"Đà Nẵng":null,resolvedRegion:windowRegion,resolutionMethod:"SOURCE_TIME_WINDOW",error:null});
    return Object.freeze({...extracted,canonicalStation:null,resolvedRegion:null,resolutionMethod:"FAIL_CLOSED",error:"REGION_AMBIGUOUS"});
  }
  function normalizeCompactTicket(value) {
    const selector=[...source.spec.selector_groups.bet_tokens].sort((a,b)=>b.length-a.length).join("|");
    let text=String(value||""), heads=[];
    // 2d/3d/4d are topology heads, not number+the one-letter `d` selector.
    // Protect them only while compact clause atoms are being recognized.
    text=text.replace(/\b([234]d)(?=[.:|]|\s|$)/giu,(_,head)=>`\uE200${heads.push(head)-1}\uE201`);
    const dottedHead=new RegExp(String.raw`\b(\d{1,4})[.:|]+(${selector})(\d+(?:[.,]\d+)?[a-zA-ZđĐ]?)\b`,"giu");
    text=text.replace(dottedHead,"$1 $2$3");
    const compact=new RegExp(String.raw`\b(\d{1,4})(${selector})(?:[.:|]+)?(\d+(?:[.,]\d+)?[a-zA-ZđĐ]?)\b`,"giu");
    text=text.replace(compact,"$1 $2 $3");
    const chain=new RegExp(String.raw`([nd])\.(?=\d{1,4}\s+(?:${selector})(?:[.:|]|\d|\s|$))`,"giu");
    return text.replace(chain,"$1 ").replace(/\uE200(\d+)\uE201/gu,(_,index)=>heads[Number(index)]);
  }
  global.KTS_BUSINESS_ENGINE=Object.freeze({
    ENGINE_VERSION:source.spec.engine_version, ENGINE_SHA256:"2aea573c27fba78f1c98c664a4dc009d071cc3677fc3ee7f1183104ea93f64b4",
    workflowPolicies:Object.freeze(source.spec.workflow_policies), stationAliases:Object.freeze(source.spec.station_aliases.map(x=>Object.freeze(x.slice()))),
    selectorContract:Object.freeze(source.spec.selector_contract), selectorPolicies:Object.freeze(source.spec.selector_policies), selectorGroups:Object.freeze(source.spec.selector_groups), parserContract:Object.freeze(source.spec.parser_contract), regionResolutionContract:Object.freeze(source.spec.region_resolution_contract), calendar:Object.freeze(source.calendar), allocateStake, topology, parseMoney, isNumberToken, isMoneyToken, isBetToken, splitCompactBetToken, parseBetPayloadAst, extractStakeOccurrences, normalizeCompactTicket, extractExplicitSourceRegion, resolveSourceRegion
  });
})(globalThis);
