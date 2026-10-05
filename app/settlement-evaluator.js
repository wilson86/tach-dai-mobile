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
    const raw = String(value == null ? '' : value).trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return digits.padStart(width, '0').slice(-width);
  }

  function mbStation(snapshot) {
    if (!snapshot || String(snapshot.region || '').toLowerCase() !== 'mb') throw new Error('MB_RESULT_REQUIRED');
    const stations = Array.isArray(snapshot.stations) ? snapshot.stations : [];
    if (!stations.length) throw new Error('MB_RESULT_STATION_REQUIRED');
    return stations[0];
  }

  function selectedPrizeValues(snapshot, selectors, width) {
    const station = mbStation(snapshot);
    const prizes = station.prizes || {};
    const out = [];
    for (const selector of selectors) {
      const parts = String(selector).split(':');
      const prize = parts[0];
      const index = parts[1];
      const values = Array.isArray(prizes[prize]) ? prizes[prize] : [];
      if (index === '*') {
        for (const value of values) out.push({ prize, index: out.length, value: suffix(value, width), raw_value: String(value) });
      } else {
        const i = Number(index);
        if (Number.isInteger(i) && i >= 0 && i < values.length) out.push({ prize, index: i, value: suffix(values[i], width), raw_value: String(values[i]) });
      }
    }
    return out;
  }

  function countValueHits(value, selected, width) {
    const needle = suffix(value, width);
    return selected.reduce((sum, row) => sum + (row.value === needle ? 1 : 0), 0);
  }

  function priceKey(code) {
    const c = String(code || '').toUpperCase();
    if (c === '3CXC') return '3CDD';
    return c;
  }

  function pricing(config, region, code) {
    const key = priceKey(code);
    const byRegion = config && config.region_pricing && config.region_pricing[region];
    const row = byRegion && byRegion[key];
    if (!row) throw new Error('PRICE_MISSING:' + region + ':' + key);
    const commission = num(row.commission, 'commission');
    const win = num(row.win, 'win');
    if (commission < 0 || win < 0) throw new Error('PRICE_NEGATIVE:' + region + ':' + key);
    return { commission, win, price_key: key };
  }

  function standardCategoryInput(code, xac, hitUnits, price, config) {
    return {
      code,
      xac,
      commission_type: config.commission_type || 'ratio',
      commission_value: price.commission,
      hit_units: hitUnits,
      win_rate: price.win
    };
  }

  function evaluateNormalMbLeg(leg, snapshot, config) {
    const d = deps();
    const code = String(leg.code || '').toUpperCase();
    const values = (leg.values || []).map(String);
    const stake = num(leg.stake, 'stake');
    const position = leg.position == null ? null : String(leg.position).toLowerCase();
    const width = code === '4C' ? 4 : (code === '3CB' || code === '3CB7' || code === '3CXC' ? 3 : 2);
    const selectors = d.mb.mbSelectors(code, { position });
    const selected = selectedPrizeValues(snapshot, selectors, width);
    const price = pricing(config, 'mb', code);
    const hitCounts = values.map(value => countValueHits(value, selected, width));
    const hitUnits = hitCounts.reduce((a, b) => a + b, 0) * stake;
    const xac = d.mb.mbXacUnits(code, { number_count: values.length, stake, position });
    const details = values.map((value, i) => ({
      code,
      station: mbStation(snapshot).code || 'mb',
      numbers: value,
      selector: position ? code + ':' + position : code,
      points: stake,
      hit_count: hitCounts[i],
      hit_units: hitCounts[i] * stake,
      xac: d.mb.mbXacUnits(code, { number_count: 1, stake, position })
    }));
    return { category_inputs: [standardCategoryInput(code, xac, hitUnits, price, config)], detail_rows: details };
  }

  function evaluateDatMbLeg(leg, snapshot, config) {
    const d = deps();
    const values = (leg.values || []).map(String);
    const stake = num(leg.stake, 'stake');
    if (values.length < 2) throw new Error('MB_DAT_REQUIRES_AT_LEAST_2_NUMBERS');
    const selected = selectedPrizeValues(snapshot, d.mb.mbSelectors('DAT'), 2);
    const hitCounts = values.map(value => countValueHits(value, selected, 2));
    const baseHitUnits = d.mb.mbDatTotalHitUnits(hitCounts);
    const hitUnits = baseHitUnits * stake;
    const xac = d.mb.mbXacUnits('DAT', { number_count: values.length, stake });
    const price = pricing(config, 'mb', 'DAT');
    const details = [];
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const hit = d.mb.mbDatHitUnits(hitCounts[i], hitCounts[j]);
        details.push({
          code: 'DAT', station: mbStation(snapshot).code || 'mb', numbers: values[i] + '-' + values[j],
          selector: 'đá thẳng', points: stake, hit_count_a: hitCounts[i], hit_count_b: hitCounts[j],
          hit_units: hit * stake, xac: d.mb.MB_XAC_UNITS.DAT * stake
        });
      }
    }
    return { category_inputs: [standardCategoryInput('DAT', xac, hitUnits, price, config)], detail_rows: details };
  }

  function evaluateXienMbLeg(leg, snapshot, config) {
    const d = deps();
    const code = String(leg.code || '').toUpperCase();
    const size = Number(code.replace('MB_XIEN', ''));
    if (![2, 3, 4].includes(size)) throw new Error('INVALID_MB_XIEN_SIZE');
    const values = (leg.values || []).map(String);
    if (values.length !== size) throw new Error('MB_XIEN_SIZE_MISMATCH');
    const stake = num(leg.stake, 'stake');
    const selected = selectedPrizeValues(snapshot, d.mb.mbSelectors('2CB'), 2);
    const hitCounts = values.map(value => countValueHits(value, selected, 2));
    const winning = hitCounts.every(x => x > 0);
    const price = pricing(config, 'mb', code);
    return {
      category_inputs: [{
        code,
        xac: stake,
        commission_type: 'direct',
        commission_value: price.commission,
        hit_units: winning ? stake : 0,
        win_rate: price.win
      }],
      detail_rows: [{
        code, station: mbStation(snapshot).code || 'mb', numbers: values.join('-'), selector: 'xien',
        points: stake, hit_counts: hitCounts, hit_units: winning ? stake : 0, xac: stake
      }]
    };
  }

  function evaluateUiFromDd(leg, snapshot, config) {
    if (!config || config.tinh_ui !== true) return { category_inputs: [], detail_rows: [] };
    const d = deps();
    const price = pricing(config, 'mb', 'UI');
    const stake = num(leg.stake, 'stake');
    const selected = selectedPrizeValues(snapshot, d.mb.mbSelectors('2CD'), 2);
    let units = 0;
    const details = [];
    for (const value of (leg.values || [])) {
      const candidate = Number(suffix(value, 2));
      let hits = 0;
      for (const target of selected) {
        const winning = Number(target.value);
        if (d.engine.isUiNeighbor(candidate, winning)) hits += 1;
      }
      if (hits) details.push({ code: 'UI', station: mbStation(snapshot).code || 'mb', numbers: String(value), selector: 'ủi ±1', points: stake, hit_count: hits, hit_units: hits * stake, xac: 0 });
      units += hits * stake;
    }
    if (!units) return { category_inputs: [], detail_rows: details };
    return {
      category_inputs: [{ code: 'UI', xac: 0, commission_type: 'direct', commission_value: 0, hit_units: units, win_rate: price.win }],
      detail_rows: details
    };
  }

  function evaluateMbLeg(leg, snapshot, config) {
    const code = String(leg.code || '').toUpperCase();
    if (code === 'DAT') return evaluateDatMbLeg(leg, snapshot, config);
    if (/^MB_XIEN[234]$/.test(code)) return evaluateXienMbLeg(leg, snapshot, config);
    const base = evaluateNormalMbLeg(leg, snapshot, config);
    if (code === '2CD') {
      const ui = evaluateUiFromDd(leg, snapshot, config);
      base.category_inputs.push(...ui.category_inputs);
      base.detail_rows.push(...ui.detail_rows);
    }
    return base;
  }

  function evaluateCanonicalMessage(input) {
    const canonical = input && input.canonical_payload;
    const config = input && input.config_snapshot;
    const snapshot = input && input.result_snapshot;
    if (!canonical || !Array.isArray(canonical.legs)) throw new Error('CANONICAL_PAYLOAD_REQUIRED');
    const region = String(canonical.region || input.region || '').toLowerCase();
    if (region !== 'mb') throw new Error('MN_MT_CANONICAL_EVALUATOR_PENDING');
    const categoryInputs = [];
    const detailRows = [];
    for (const leg of canonical.legs) {
      const evaluated = evaluateMbLeg(leg, snapshot, config);
      categoryInputs.push(...evaluated.category_inputs);
      detailRows.push(...evaluated.detail_rows);
    }
    return { region, category_inputs: clone(categoryInputs), detail_rows: clone(detailRows) };
  }

  global.KTS_SETTLEMENT_EVALUATOR = Object.freeze({
    version: 'settlement-evaluator-mb-v1',
    suffix,
    selectedPrizeValues,
    countValueHits,
    pricing,
    evaluateCanonicalMessage
  });
})(typeof window !== 'undefined' ? window : globalThis);
