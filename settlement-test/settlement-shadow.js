(function (global) {
  'use strict';

  const FIELD_ALIASES = Object.freeze({
    total_xac: ['total_xac', 'xac'],
    total_qua_co: ['total_qua_co', 'qua_co'],
    total_payout: ['total_payout', 'payout', 'tien_trung'],
    refund_amount: ['refund_amount', 'refund', 'hoi'],
    final_net: ['final_net', 'final', 'thu_bu']
  });
  const REQUIRED_PROMOTION_TOTALS = Object.freeze(['total_xac', 'total_qua_co', 'total_payout', 'final_net']);

  function numeric(value) {
    // Number('   '), Number(false), Number([]), and Number('0x10')
    // produce ordinary numbers in JS. A missing/nondecimal HIOSKT oracle
    // must NEVER be interpreted as a real zero or exact monetary match.
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text=value.trim();
    if (!/^[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(text)) return null;
    const n=Number(text);
    return Number.isFinite(n) ? n : null;
  }

  function pick(obj, aliases) {
    for (const key of aliases) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
        const n = numeric(obj[key]);
        if (n != null) return n;
      }
    }
    return null;
  }

  function pickRaw(obj, aliases) {
    for (const key of aliases) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') return obj[key];
    }
    return null;
  }

  function decimal(value) {
    const text = String(value == null ? '' : value).trim();
    const m = text.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!m) throw new Error('INVALID_DECIMAL');
    const sign = m[1] === '-' ? -1n : 1n;
    const frac = m[3] || '';
    const exp = m[4] == null ? 0 : Number(m[4]);
    if (!Number.isInteger(exp) || Math.abs(exp) > 1000) throw new Error('INVALID_DECIMAL');
    let digits = (m[2] + frac).replace(/^0+(?=\d)/, '') || '0';
    let scale = frac.length - exp;
    if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
    let integer = sign * BigInt(digits);
    if (integer === 0n) return { i: 0n, s: 0 };
    while (scale > 0 && integer % 10n === 0n) { integer /= 10n; scale -= 1; }
    return { i: integer, s: scale };
  }

  function decimalString(value) {
    const d = value && typeof value === 'object' && typeof value.i === 'bigint' ? value : decimal(value);
    const neg = d.i < 0n;
    let digits = (neg ? -d.i : d.i).toString();
    if (d.s === 0) return (neg ? '-' : '') + digits;
    if (digits.length <= d.s) digits = '0'.repeat(d.s - digits.length + 1) + digits;
    const cut = digits.length - d.s;
    return (neg ? '-' : '') + digits.slice(0, cut) + '.' + digits.slice(cut);
  }

  function decimalCanonical(value) { return decimalString(decimal(value)); }

  function decimalAdd(a, b) {
    const x = decimal(a), y = decimal(b), scale = Math.max(x.s, y.s);
    const ten = power => 10n ** BigInt(power);
    let integer = x.i * ten(scale - x.s) + y.i * ten(scale - y.s);
    let s = scale;
    if (integer === 0n) return '0';
    while (s > 0 && integer % 10n === 0n) { integer /= 10n; s -= 1; }
    return decimalString({ i: integer, s });
  }

  function roundDisplay(value, digits) {
    const factor = 10 ** digits;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const scaled = Math.abs(n) * factor;
    const rounded = Math.floor(scaled + 0.5 + Number.EPSILON);
    return Math.sign(n) * rounded / factor;
  }

  function compareNumber(localValue, referenceValue, options, localExactValue, referenceExactValue) {
    const opts = options || {};
    const digits = Number(opts.display_digits == null ? 1 : opts.display_digits);
    const local = numeric(localValue);
    const reference = numeric(referenceValue);
    if (local == null || reference == null) return { status: 'NOT_COMPARABLE', local, reference, delta: null };
    const delta = local - reference;

    const hasLocalExact = localExactValue != null && localExactValue !== '';
    const hasReferenceExact = referenceExactValue != null && referenceExactValue !== '';
    let localCanonical=null,referenceCanonical=null;
    // Exact fields are optional only when ABSENT. If explicitly supplied but
    // invalid, they are contradictory monetary evidence, not an invitation to
    // retry a tolerant floating point comparison and call it an exact match.
    if (hasLocalExact || hasReferenceExact) {
      try {
        localCanonical=decimalCanonical(hasLocalExact?localExactValue:localValue);
        referenceCanonical=decimalCanonical(hasReferenceExact?referenceExactValue:referenceValue);
      } catch (_) {
        return { status: 'NOT_COMPARABLE', local, reference, delta,
          reason: 'INVALID_EXACT_MONETARY_EVIDENCE' };
      }
    }
    if (hasLocalExact || hasReferenceExact) {
      // Exact and displayed amounts are two representations of ONE monetary
      // observation. If the exact decimal is inconsistent with its displayed
      // figure at the display precision, matching the other side's exact
      // string must not override the visible contradiction.
      const shownLocal=roundDisplay(local,digits),shownRef=roundDisplay(reference,digits);
      if (hasLocalExact && roundDisplay(Number(localCanonical),digits)!==shownLocal)
        return {status:'NOT_COMPARABLE',local,reference,delta,reason:'LOCAL_EXACT_DISPLAY_CONTRADICTION'};
      if (hasReferenceExact && roundDisplay(Number(referenceCanonical),digits)!==shownRef)
        return {status:'NOT_COMPARABLE',local,reference,delta,reason:'REFERENCE_EXACT_DISPLAY_CONTRADICTION'};
    }
    if (hasLocalExact || hasReferenceExact) {
      if (localCanonical === referenceCanonical) return { status: 'MATCH_EXACT', local, reference, delta, local_exact: localCanonical, reference_exact: referenceCanonical };
      if (roundDisplay(local, digits) === roundDisplay(reference, digits)) return { status: 'MATCH_DISPLAY', local, reference, delta, local_exact: localCanonical, reference_exact: referenceCanonical };
      return { status: 'MISMATCH', local, reference, delta, local_exact: localCanonical, reference_exact: referenceCanonical };
    }

    // An epsilon difference may be visually negligible, but it is NOT an
    // exact match suitable for promotion of independently observed money.
    try {
      if (decimalCanonical(localValue) === decimalCanonical(referenceValue))
        return { status: 'MATCH_EXACT', local, reference, delta };
    } catch (_) {
      return { status: 'NOT_COMPARABLE', local, reference, delta, reason: 'INVALID_MONETARY_DECIMAL' };
    }
    if (roundDisplay(local, digits) === roundDisplay(reference, digits)) return { status: 'MATCH_DISPLAY', local, reference, delta };
    return { status: 'MISMATCH', local, reference, delta };
  }

  function rowsByCode(rows) {
    const out = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const code = String(row.code || row.category || '').trim().toUpperCase();
      if (!code) continue;
      if (!out[code]) out[code] = { code, xac: 0, qua_co: 0, hit_units: 0, payout: 0,
        present: { xac:false, qua_co:false, hit_units:false, payout:false },
        exact: { xac:'0', qua_co:'0', hit_units:'0', payout:'0' } };
      for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) {
        // Zero is evidence only when the original row actually supplied the
        // field. Do not turn an omitted HIOSKT field into a fabricated zero.
        if (!Object.prototype.hasOwnProperty.call(row,field)) continue;
        out[code].present[field] = true;
        const value = numeric(row[field]) || 0;
        out[code][field] += value;
        const exactValue = row.exact && row.exact[field] != null ? row.exact[field] : value;
        try { out[code].exact[field] = decimalAdd(out[code].exact[field], exactValue); }
        catch (_) { out[code].exact[field] = decimalCanonical(out[code][field]); }
      }
    }
    return out;
  }

  // Category rows are optional, but an explicitly provided malformed money
  // field is not. Previously rowsByCode silently turned false/null/blank into
  // zero, which allowed a false exact shadow pass when the totals matched.
  function categoryEvidenceValid(rows, options) {
    const digits = Number(!options || options.display_digits == null ? 1 : options.display_digits);
    if (!Array.isArray(rows)) return true;
    const fields=['xac','qua_co','hit_units','payout'];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
      if (row.exact != null && (typeof row.exact !== 'object' || Array.isArray(row.exact)))
        return false;
      const code=row.code || row.category;
      if (typeof code !== 'string' || !code.trim()) return false;
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(row,field) && numeric(row[field])===null)
          return false;
        if (row.exact && Object.prototype.hasOwnProperty.call(row.exact,field)) {
          // Validate EACH supplied source row before aggregation. Opposite
          // inconsistencies in two rows of the same category can cancel out
          // and make the aggregate appear exact even though both were corrupt.
          if (!Object.prototype.hasOwnProperty.call(row,field)) return false;
          try {
            const exact=decimalCanonical(row.exact[field]);
            const displayed=numeric(row[field]);
            if (displayed===null || roundDisplay(Number(exact),digits)!==roundDisplay(displayed,digits))
              return false;
          } catch (_) { return false; }
        }
      }
    }
    return true;
  }

  function compareCategories(localRows, referenceRows, options) {
    const local = rowsByCode(localRows);
    const reference = rowsByCode(referenceRows);
    const codes = [...new Set([...Object.keys(local), ...Object.keys(reference)])].sort();
    return codes.map(code => {
      const a = local[code] || {};
      const b = reference[code] || {};
      const fields = {};
      for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) {
        if (!b.present || !b.present[field]) continue;
        if (!a.present || !a.present[field]) {
          fields[field] = {status:'NOT_COMPARABLE',reason:'LOCAL_CATEGORY_FIELD_MISSING',
            local:null,reference:b[field],delta:null};
          continue;
        }
        fields[field] = compareNumber(
          a[field], b[field], options, a.exact && a.exact[field],
          b.exact && b.exact[field]
        );
      }
      const statuses = Object.values(fields).map(x => x.status);
      const status = statuses.includes('MISMATCH') ? 'MISMATCH' :
        statuses.includes('NOT_COMPARABLE') ? 'NOT_COMPARABLE' :
        statuses.includes('MATCH_DISPLAY') ? 'MATCH_DISPLAY' :
        statuses.length ? 'MATCH_EXACT' : 'NOT_COMPARABLE';
      return { code, status, fields };
    });
  }

  function referenceAliasesValid(reference) {
    // Imported shadow evidence may contain canonical and shorthand HIOSKT
    // fields at once. Ignoring a conflicting alias can select a false zero
    // and classify a monetary mismatch as an exact pass.
    for (const aliases of Object.values(FIELD_ALIASES)) {
      let expected=null;
      for (const alias of aliases) {
        if (!reference || !Object.prototype.hasOwnProperty.call(reference,alias)) continue;
        const raw=reference[alias];
        if (raw==null || raw==='') continue;
        if (numeric(raw)===null) return false;
        let canonical;
        try { canonical=decimalCanonical(raw); } catch (_) { return false; }
        if (expected!==null && expected!==canonical) return false;
        expected=canonical;
      }
    }
    return true;
  }

  function compareSettlement(localSettlement, referenceSnapshot, options) {
    const local = localSettlement && (localSettlement.settlement_result || localSettlement.result_snapshot || localSettlement) || {};
    const reference = referenceSnapshot && (referenceSnapshot.totals || referenceSnapshot) || {};
    // A malformed exact field supplied in imported evidence must never be
    // treated as "no exact evidence" and silently promote approximate money.
    const exactShapeValid=value=>value==null||(typeof value==='object'&&!Array.isArray(value));
    const exactMetadataOkay=exactShapeValid(local.exact)&&exactShapeValid(reference.exact);
    const localExact = exactMetadataOkay && local.exact ? local.exact : {};
    const referenceExact = exactMetadataOkay && reference.exact ? reference.exact : {};
    const totals = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      const refValue = pick(reference, aliases);
      if (refValue == null) continue;
      const rawReference = pickRaw(reference, aliases);
      totals[field] = compareNumber(local[field], refValue, options, localExact[field], referenceExact[field] == null ? rawReference : referenceExact[field]);
    }

    const localRows = localSettlement && Array.isArray(localSettlement.category_rows) ? localSettlement.category_rows : local.rows;
    const referenceRows = referenceSnapshot && (referenceSnapshot.categories || referenceSnapshot.category_rows);
    // Explicit category containers are monetary evidence. A malformed object,
    // null or scalar must not be silently treated as 'no categories'.
    const malformedCategoryContainer=(source,keys)=>
      source && typeof source==='object' && keys.some(key=>
        Object.prototype.hasOwnProperty.call(source,key) && !Array.isArray(source[key]));
    const invalidCategoryContainer=Boolean(
      malformedCategoryContainer(localSettlement,['category_rows']) ||
      malformedCategoryContainer(local,['rows']) ||
      malformedCategoryContainer(referenceSnapshot,['categories','category_rows']));
    const categoryEvidenceOkay=!invalidCategoryContainer &&
      categoryEvidenceValid(localRows,options)&&categoryEvidenceValid(referenceRows,options);
    const aliasEvidenceOkay=referenceAliasesValid(reference);
    // An explicitly supplied HIOSKT category without any monetary fields
    // proves nothing. A referenced category absent from local results cannot
    // become an exact match merely because all supplied stakes are zero.
    const referenceCategories=Array.isArray(referenceRows)?referenceRows:[];
    const codeOf=row=>String(row && (row.code || row.category) || '').trim().toUpperCase();
    const localCodes=new Set((Array.isArray(localRows)?localRows:[]).map(codeOf));
    const missingReferenceCategory=referenceCategories.some(row=>!localCodes.has(codeOf(row)));
    const emptyReferenceCategory=referenceCategories.some(row=>
      !['xac','qua_co','hit_units','payout'].some(key=>
        Object.prototype.hasOwnProperty.call(row,key)));
    const categories = Array.isArray(referenceRows) && categoryEvidenceOkay ?
      compareCategories(localRows, referenceRows, options) : [];
    const missingMonetaryEvidence=Object.values(totals).some(x=>x.status==='NOT_COMPARABLE') ||
      categories.some(row=>referenceCategories.some(ref=>codeOf(ref)===row.code) &&
        row.status==='NOT_COMPARABLE');
    const statuses = [...Object.values(totals).map(x => x.status), ...categories.map(x => x.status)].filter(x => x !== 'NOT_COMPARABLE');
    let status = 'INCOMPLETE_REFERENCE';
    if (statuses.length) {
      if (statuses.includes('MISMATCH')) status = 'MISMATCH';
      else if (statuses.includes('MATCH_DISPLAY')) status = 'MATCH_DISPLAY_ONLY';
      else status = 'MATCH_EXACT';
    }
    const requiredTotalsExact = REQUIRED_PROMOTION_TOTALS.every(field => totals[field] && totals[field].status === 'MATCH_EXACT');
    const categoriesExact = categoryEvidenceOkay && !missingReferenceCategory && !emptyReferenceCategory &&
      categories.filter(row=>referenceCategories.some(ref=>codeOf(ref)===row.code))
        .every(row=>row.status==='MATCH_EXACT');
    if (!categoryEvidenceOkay || !aliasEvidenceOkay || !exactMetadataOkay ||
        missingReferenceCategory || emptyReferenceCategory || missingMonetaryEvidence)
      status='INCOMPLETE_REFERENCE';
    return {
      status,
      totals,
      categories,
      compared_fields: statuses.length,
      invalid_category_evidence: !categoryEvidenceOkay || emptyReferenceCategory,
      missing_reference_category: missingReferenceCategory,
      missing_monetary_evidence: missingMonetaryEvidence,
      invalid_total_alias_evidence: !aliasEvidenceOkay,
      invalid_exact_metadata: !exactMetadataOkay,
      required_totals_exact: requiredTotalsExact,
      exact: status === 'MATCH_EXACT',
      safe_to_promote: status === 'MATCH_EXACT' && requiredTotalsExact && categoriesExact && aliasEvidenceOkay && exactMetadataOkay
    };
  }

  function messageIdsForCategory(settlement, code) {
    const target = String(code || '').toUpperCase();
    const ids = new Set();
    const breakdown = settlement && Array.isArray(settlement.message_breakdown) ? settlement.message_breakdown : [];
    for (const row of breakdown) {
      const categories = Array.isArray(row.category_rows) ? row.category_rows : [];
      if (categories.some(c => String(c.code || c.category || '').toUpperCase() === target) && row.message_id) ids.add(String(row.message_id));
    }
    const direct = settlement && Array.isArray(settlement.category_rows) ? settlement.category_rows : [];
    for (const row of direct) {
      if (String(row.code || row.category || '').toUpperCase() === target && row.message_id) ids.add(String(row.message_id));
    }
    return [...ids];
  }

  function buildMismatchDiagnostics(settlement, comparison) {
    const c = comparison || {};
    const totalIssues = [];
    for (const [field, row] of Object.entries(c.totals || {})) {
      if (!row || row.status === 'MATCH_EXACT') continue;
      totalIssues.push({ field, status: row.status, local: row.local, reference: row.reference, delta: row.delta });
    }

    const categoryIssues = [];
    for (const row of c.categories || []) {
      if (!row || row.status === 'MATCH_EXACT' || row.status === 'NOT_COMPARABLE') continue;
      const fields = Object.entries(row.fields || {})
        .filter(([, value]) => value && value.status !== 'MATCH_EXACT')
        .map(([field, value]) => ({ field, status: value.status, local: value.local, reference: value.reference, delta: value.delta }));
      categoryIssues.push({
        code: String(row.code || '').toUpperCase(),
        status: row.status,
        fields,
        message_ids: messageIdsForCategory(settlement, row.code)
      });
    }

    const priority = { MISMATCH: 0, MATCH_DISPLAY: 1, NOT_COMPARABLE: 2 };
    categoryIssues.sort((a, b) => (priority[a.status] == null ? 9 : priority[a.status]) - (priority[b.status] == null ? 9 : priority[b.status]) || a.code.localeCompare(b.code));
    totalIssues.sort((a, b) => (priority[a.status] == null ? 9 : priority[a.status]) - (priority[b.status] == null ? 9 : priority[b.status]) || a.field.localeCompare(b.field));

    return {
      status: c.status || 'INCOMPLETE_REFERENCE',
      total_issues: totalIssues,
      category_issues: categoryIssues,
      category_reference_missing: !Array.isArray(c.categories) || c.categories.length === 0,
      has_actionable_category_issue: categoryIssues.length > 0
    };
  }

  global.KTS_SETTLEMENT_SHADOW = Object.freeze({
    version: 'settlement-shadow-v16-category-container-shape',
    REQUIRED_PROMOTION_TOTALS,
    decimalCanonical,
    roundDisplay,
    compareNumber,
    compareCategories,
    compareSettlement,
    messageIdsForCategory,
    buildMismatchDiagnostics
  });
})(typeof window !== 'undefined' ? window : globalThis);
