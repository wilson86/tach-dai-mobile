(function (global) {
  'use strict';

  function deps() {
    const engine = global.KTS_SETTLEMENT_ENGINE;
    const mb = global.KTS_SETTLEMENT_MB_RULES;
    if (!engine) throw new Error('SETTLEMENT_ENGINE_NOT_LOADED');
    if (!mb) throw new Error('SETTLEMENT_MB_RULES_NOT_LOADED');
    return { engine, mb };
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function num(v, name) {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error((name || 'value') + '_INVALID');
    return x;
  }
  function suffix(value, width) {
    const digits = String(value == null ? '' : value).replace(/\D/g, '');
    return digits ? digits.padStart(width, '0').slice(-width) : '';
  }
  function resultStations(snapshot, region) {
    if (!snapshot || String(snapshot.region || '').toLowerCase() !== region) throw new Error(region.toUpperCase() + '_RESULT_REQUIRED');
    const stations = Array.isArray(snapshot.stations) ? snapshot.stations : [];
    if (!stations.length) throw new Error(region.toUpperCase() + '_RESULT_STATION_REQUIRED');
    return stations;
  }
  function stationByCode(snapshot, region, code) {
    const needle = String(code || '').toLowerCase();
    const station = resultStations(snapshot, region).find(s => String(s.code || '').toLowerCase() === needle);
    if (!station) throw new Error('RESULT_STATION_NOT_FOUND:' + needle);
    return station;
  }
  function mbStation(snapshot) { return resultStations(snapshot, 'mb')[0]; }
  function selectedPrizeValuesFromStation(station, selectors, width) {
    const prizes = station.prizes || {}, out = [];
    for (const selector of selectors) {
      const [prize, index] = String(selector).split(':');
      const values = Array.isArray(prizes[prize]) ? prizes[prize] : [];
      if (index === '*') values.forEach((value, i) => out.push({ prize, index: i, value: suffix(value, width), raw_value: String(value) }));
      else {
        const i = Number(index);
        if (Number.isInteger(i) && i >= 0 && i < values.length) out.push({ prize, index: i, value: suffix(values[i], width), raw_value: String(values[i]) });
      }
    }
    return out;
  }
  function selectedPrizeValues(snapshot, selectors, width) { return selectedPrizeValuesFromStation(mbStation(snapshot), selectors, width); }
  function countValueHits(value, selected, width) {
    const needle = suffix(value, width);
    return selected.reduce((sum, row) => sum + (row.value === needle ? 1 : 0), 0);
  }
  function priceKey(code) { return String(code || '').toUpperCase() === '3CXC' ? '3CDD' : String(code || '').toUpperCase(); }
  function pricing(config, region, code) {
    const key = priceKey(code), byRegion = config && config.region_pricing && config.region_pricing[region];
    const fallback = region === 'mt' && config && config.region_pricing ? config.region_pricing.mn : null;
    const row = (byRegion && byRegion[key]) || (fallback && fallback[key]);
    if (!row) throw new Error('PRICE_MISSING:' + region + ':' + key);
    const commission = num(row.commission, 'commission'), win = num(row.win, 'win');
    if (commission < 0 || win < 0) throw new Error('PRICE_NEGATIVE:' + region + ':' + key);
    return { commission, win, price_key: key };
  }
  function standardCategoryInput(code, xac, hitUnits, price, config) {
    return { code, xac, commission_type: config.commission_type || 'ratio', commission_value: price.commission, hit_units: hitUnits, win_rate: price.win };
  }

  function uiRows(leg, selected, stake, price, stationCode) {
    const d = deps(); let units = 0; const details = [];
    for (const value of (leg.values || [])) {
      const candidate = Number(suffix(value, 2)); let hits = 0;
      for (const target of selected) if (d.engine.isUiNeighbor(candidate, Number(target.value))) hits += 1;
      if (hits) details.push({ code: 'UI', station: stationCode, numbers: String(value), selector: 'ủi ±1', points: stake, hit_count: hits, hit_units: hits * stake, xac: 0 });
      units += hits * stake;
    }
    return units ? { category_inputs: [{ code: 'UI', xac: 0, commission_type: 'direct', commission_value: 0, hit_units: units, win_rate: price.win }], detail_rows: details } : { category_inputs: [], detail_rows: details };
  }

  function evaluateNormalMbLeg(leg, snapshot, config) {
    const d = deps(), code = String(leg.code || '').toUpperCase(), values = (leg.values || []).map(String), stake = num(leg.stake, 'stake');
    const position = leg.position == null ? null : String(leg.position).toLowerCase();
    const width = code === '4C' ? 4 : (code === '3CB' || code === '3CB7' || code === '3CXC' ? 3 : 2);
    const selected = selectedPrizeValues(snapshot, d.mb.mbSelectors(code, { position }), width), price = pricing(config, 'mb', code);
    const hitCounts = values.map(value => countValueHits(value, selected, width));
    const xac = d.mb.mbXacUnits(code, { number_count: values.length, stake, position });
    const base = { category_inputs: [standardCategoryInput(code, xac, hitCounts.reduce((a,b)=>a+b,0) * stake, price, config)], detail_rows: values.map((value,i)=>({ code, station: mbStation(snapshot).code || 'mb', numbers:value, selector:position ? code+':'+position : code, points:stake, hit_count:hitCounts[i], hit_units:hitCounts[i]*stake, xac:d.mb.mbXacUnits(code,{number_count:1,stake,position}) })) };
    if (code === '2CD' && config && config.tinh_ui === true) { const ui = uiRows(leg, selected, stake, pricing(config,'mb','UI'), mbStation(snapshot).code || 'mb'); base.category_inputs.push(...ui.category_inputs); base.detail_rows.push(...ui.detail_rows); }
    return base;
  }
  function evaluateDatMbLeg(leg, snapshot, config) {
    const d=deps(), values=(leg.values||[]).map(String), stake=num(leg.stake,'stake'); if(values.length<2) throw new Error('MB_DAT_REQUIRES_AT_LEAST_2_NUMBERS');
    const selected=selectedPrizeValues(snapshot,d.mb.mbSelectors('DAT'),2), hits=values.map(v=>countValueHits(v,selected,2));
    const details=[]; for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++){ const h=d.mb.mbDatHitUnits(hits[i],hits[j]); details.push({code:'DAT',station:mbStation(snapshot).code||'mb',numbers:values[i]+'-'+values[j],selector:'đá thẳng',points:stake,hit_count_a:hits[i],hit_count_b:hits[j],hit_units:h*stake,xac:d.mb.MB_XAC_UNITS.DAT*stake}); }
    return { category_inputs:[standardCategoryInput('DAT',d.mb.mbXacUnits('DAT',{number_count:values.length,stake}),d.mb.mbDatTotalHitUnits(hits)*stake,pricing(config,'mb','DAT'),config)], detail_rows:details };
  }
  function evaluateXienMbLeg(leg,snapshot,config){ const d=deps(),code=String(leg.code||'').toUpperCase(),size=Number(code.replace('MB_XIEN','')),values=(leg.values||[]).map(String),stake=num(leg.stake,'stake'); if(![2,3,4].includes(size)||values.length!==size) throw new Error('INVALID_MB_XIEN_SIZE'); const selected=selectedPrizeValues(snapshot,d.mb.mbSelectors('2CB'),2),hits=values.map(v=>countValueHits(v,selected,2)),winning=hits.every(x=>x>0),price=pricing(config,'mb',code); return {category_inputs:[{code,xac:stake,commission_type:'direct',commission_value:price.commission,hit_units:winning?stake:0,win_rate:price.win}],detail_rows:[{code,station:mbStation(snapshot).code||'mb',numbers:values.join('-'),selector:'xien',points:stake,hit_counts:hits,hit_units:winning?stake:0,xac:stake}]}; }
  function evaluateMbLeg(leg,snapshot,config){ const code=String(leg.code||'').toUpperCase(); if(code==='DAT') return evaluateDatMbLeg(leg,snapshot,config); if(/^MB_XIEN[234]$/.test(code)) return evaluateXienMbLeg(leg,snapshot,config); return evaluateNormalMbLeg(leg,snapshot,config); }

  function mnMtWidth(code){ return code==='4C'?4:(code==='3CB'||code==='3CB7'||code==='3CXC'?3:2); }
  function evaluateNormalMnMtLeg(leg,snapshot,config,region){
    const d=deps(),code=String(leg.code||'').toUpperCase(),stations=Array.isArray(leg.station_codes)?leg.station_codes:[]; if(stations.length!==1) throw new Error('MN_MT_STANDARD_LEG_REQUIRES_ONE_STATION');
    const station=stationByCode(snapshot,region,stations[0]),width=mnMtWidth(code),selected=selectedPrizeValuesFromStation(station,d.engine.mnMtSelectors(code),width),values=(leg.values||[]).map(String),stake=num(leg.stake,'stake');
    const hits=values.map(v=>countValueHits(v,selected,width)),price=pricing(config,region,code),xac=d.engine.mnMtXacUnits(code,{number_count:values.length,stake});
    const base={category_inputs:[standardCategoryInput(code,xac,hits.reduce((a,b)=>a+b,0)*stake,price,config)],detail_rows:values.map((v,i)=>({code,station:String(station.code||stations[0]).toLowerCase(),numbers:v,selector:code,points:stake,hit_count:hits[i],hit_units:hits[i]*stake,xac:d.engine.mnMtXacUnits(code,{number_count:1,stake})}))};
    if(code==='2CD'&&config&&config.tinh_ui===true){const ui=uiRows(leg,selected,stake,pricing(config,region,'UI'),String(station.code||stations[0]).toLowerCase());base.category_inputs.push(...ui.category_inputs);base.detail_rows.push(...ui.detail_rows);} return base;
  }
  function evaluateDatMnMtLeg(leg,snapshot,config,region){
    const d=deps(),stations=Array.isArray(leg.station_codes)?leg.station_codes:[]; if(stations.length!==1) throw new Error('MN_MT_DAT_REQUIRES_ONE_STATION');
    const station=stationByCode(snapshot,region,stations[0]),selected=selectedPrizeValuesFromStation(station,d.engine.mnMtSelectors('2CB'),2),values=(leg.values||[]).map(String),stake=num(leg.stake,'stake'); if(values.length<2) throw new Error('MN_MT_DAT_REQUIRES_AT_LEAST_2_NUMBERS');
    const hits=values.map(v=>countValueHits(v,selected,2)),mode=config.dat_hit_mode||'ky_ruoi'; let units=0; const details=[];
    for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++){const h=d.engine.datHitUnits(hits[i],hits[j],mode);units+=h*stake;details.push({code:'DAT',station:String(station.code||stations[0]).toLowerCase(),numbers:values[i]+'-'+values[j],selector:mode,points:stake,hit_count_a:hits[i],hit_count_b:hits[j],hit_units:h*stake,xac:d.engine.MN_MT_XAC_UNITS.DAT*stake});}
    return {category_inputs:[standardCategoryInput('DAT',d.engine.mnMtXacUnits('DAT',{number_count:values.length,stake}),units,pricing(config,region,'DAT'),config)],detail_rows:details};
  }
  function evaluateDaxMnMtLeg(leg,snapshot,config,region){
    const d=deps(),stations=Array.isArray(leg.station_codes)?leg.station_codes:[],values=(leg.values||[]).map(String),stake=num(leg.stake,'stake'); if(stations.length<2||values.length<2) throw new Error('MN_MT_DAX_REQUIRES_2PLUS_STATIONS_AND_NUMBERS');
    const selected=stations.map(code=>{const station=stationByCode(snapshot,region,code);return {station,selected:selectedPrizeValuesFromStation(station,d.engine.mnMtSelectors('2CB'),2)};}); const mode=config.dax_hit_mode||'multi_pair'; let units=0; const details=[];
    for(let ni=0;ni<values.length;ni++) for(let nj=ni+1;nj<values.length;nj++) for(let si=0;si<stations.length;si++) for(let sj=si+1;sj<stations.length;sj++){const a=countValueHits(values[ni],selected[si].selected,2),b=countValueHits(values[nj],selected[sj].selected,2),h=d.engine.daxPairHitUnits(a,b,mode);units+=h*stake;details.push({code:'DAX',station:stations[si]+'-'+stations[sj],numbers:values[ni]+'-'+values[nj],selector:mode,points:stake,hit_count_a:a,hit_count_b:b,hit_units:h*stake,xac:d.engine.MN_MT_XAC_UNITS.DAX*stake});}
    return {category_inputs:[standardCategoryInput('DAX',d.engine.mnMtXacUnits('DAX',{number_count:values.length,station_count:stations.length,stake}),units,pricing(config,region,'DAX'),config)],detail_rows:details};
  }
  function evaluateMnMtLeg(leg,snapshot,config,region){const code=String(leg.code||'').toUpperCase();if(code==='DAT')return evaluateDatMnMtLeg(leg,snapshot,config,region);if(code==='DAX')return evaluateDaxMnMtLeg(leg,snapshot,config,region);return evaluateNormalMnMtLeg(leg,snapshot,config,region);}

  function evaluateCanonicalMessage(input){ const canonical=input&&input.canonical_payload,config=input&&input.config_snapshot,snapshot=input&&input.result_snapshot;if(!canonical||!Array.isArray(canonical.legs))throw new Error('CANONICAL_PAYLOAD_REQUIRED');const region=String(canonical.region||input.region||'').toLowerCase();if(!['mn','mt','mb'].includes(region))throw new Error('SETTLEMENT_REGION_REQUIRED');const categoryInputs=[],detailRows=[];for(const leg of canonical.legs){const e=region==='mb'?evaluateMbLeg(leg,snapshot,config):evaluateMnMtLeg(leg,snapshot,config,region);categoryInputs.push(...e.category_inputs);detailRows.push(...e.detail_rows);}return {region,category_inputs:clone(categoryInputs),detail_rows:clone(detailRows)};}

  global.KTS_SETTLEMENT_EVALUATOR=Object.freeze({version:'settlement-evaluator-3region-v2',suffix,selectedPrizeValues,selectedPrizeValuesFromStation,countValueHits,pricing,evaluateCanonicalMessage});
})(typeof window !== 'undefined' ? window : globalThis);
