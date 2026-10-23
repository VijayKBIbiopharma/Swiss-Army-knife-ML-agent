/* Joins two tables on a shared key (for example a process log and a QC report, both keyed
   by BatchID). Keys are matched after trimming and ignoring case. Repeated keys in the second
   file (replicate lanes, repeat injections) are averaged into one row per key. Pure
   computation; no network, no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');

  const normKey = v => String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  const normName = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ID_LIKE = /(id|no|num|number|code|key|lot|batch|sample)$/;
  // Replicate counters (lane 1, lane 2...) mean nothing once replicates are averaged.
  const REPLICATE = /^(lane|replicate|rep|injection|inj|well|repeat|aliquot)(no|num|number|#)?$/;
  // Measured decimals (12.37, 0.82) are not keys, even if a few values happen to coincide.
  const decimalShare = vals => { const v = vals.filter(Boolean); return v.length ? v.filter(x => /^-?\d*\.\d+$/.test(x)).length / v.length : 0; };

  // Candidate key pairs, best first: column names that match and values that overlap.
  function suggestKeys(a, b) {
    const out = [];
    a.columns.forEach((ca, i) => {
      const ra = a.rows.map(r => normKey(r[i])), va = new Set(ra.filter(Boolean));
      if (va.size < 2 || decimalShare(ra) > 0.5) return;
      b.columns.forEach((cb, j) => {
        const rb = b.rows.map(r => normKey(r[j])), vb = new Set(rb.filter(Boolean));
        if (vb.size < 2 || decimalShare(rb) > 0.5) return;
        let common = 0; for (const v of va) if (vb.has(v)) common++;
        if (!common) return;
        const overlap = common / Math.min(va.size, vb.size);
        const sameName = normName(ca) === normName(cb);
        const idName = ID_LIKE.test(normName(ca)) && ID_LIKE.test(normName(cb));
        // Keys are mostly distinct per row; measurements repeat less tidily.
        const distinct = Math.min(va.size / a.rows.length, vb.size / b.rows.length);
        out.push({ left: ca, right: cb, common, overlap, sameName, score: overlap + (sameName ? 0.6 : 0) + (idName ? 0.3 : 0) + Math.min(0.3, distinct * 0.3) });
      });
    });
    return out.filter(s => s.overlap >= 0.2).sort((x, y) => y.score - x.score);
  }

  /* a, b: { columns, rows }. o: { leftKey, rightKey, how: 'inner' | 'left', bName }.
     Returns { table, stats }. */
  function join(a, b, o) {
    const li = a.columns.indexOf(o.leftKey), ri = b.columns.indexOf(o.rightKey);
    if (li < 0 || ri < 0) throw new Error('Pick a key column in each file.');
    const how = o.how || 'inner';
    // Group the second file by key.
    const groups = new Map();
    b.rows.forEach(r => { const k = normKey(r[ri]); if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const hasRepeats = [...groups.values()].some(g => g.length > 1);
    const dropped = hasRepeats ? b.columns.filter((c, j) => j !== ri && REPLICATE.test(normName(c))) : [];
    const bCols = b.columns.map((c, j) => j).filter(j => j !== ri && !dropped.includes(b.columns[j]));
    // A column is averaged when every filled value in it is a number.
    const numericCol = j => b.rows.every(r => r[j] === undefined || String(r[j]).trim() === '' || E.toNumber(r[j]) !== null);
    const isNum = {}; bCols.forEach(j => { isNum[j] = numericCol(j); });
    const repeated = [...groups.values()].filter(g => g.length > 1).length;
    const collapse = rows => bCols.map(j => {
      const vals = rows.map(r => r[j]).filter(v => v !== undefined && String(v).trim() !== '');
      if (!vals.length) return '';
      if (isNum[j]) { const m = E.mean(vals.map(E.toNumber)); return String(Number(m.toPrecision(10))); }
      const uniq = Array.from(new Set(vals.map(v => String(v).trim())));
      return uniq.length === 1 ? uniq[0] : uniq.join(' | ');
    });
    const taken = new Set(a.columns);
    const label = o.bName || 'file 2';
    const newCols = bCols.map(j => { let c = b.columns[j]; if (taken.has(c)) c = c + ' (' + label + ')'; taken.add(c); return c; });
    const columns = a.columns.concat(newCols).concat(repeated ? ['Replicates (' + label + ')'] : []);
    const rows = [], seen = new Set(), unmatchedLeft = [];
    for (const r of a.rows) {
      const k = normKey(r[li]), g = groups.get(k);
      if (g) { seen.add(k); rows.push(r.concat(collapse(g)).concat(repeated ? [String(g.length)] : [])); }
      else { if (k) unmatchedLeft.push(r[li]); if (how === 'left') rows.push(r.concat(bCols.map(() => '')).concat(repeated ? [''] : [])); }
    }
    const unmatchedRight = [...groups.keys()].filter(k => !seen.has(k)).map(k => groups.get(k)[0][ri]);
    return {
      table: { columns, rows },
      stats: {
        leftRows: a.rows.length, rightRows: b.rows.length, rightKeys: groups.size, matchedKeys: seen.size, outputRows: rows.length, how,
        unmatchedLeft, unmatchedRight, repeatedKeys: repeated, droppedReplicateColumns: dropped, averagedColumns: bCols.filter(j => isNum[j]).map(j => b.columns[j]), renamed: newCols.filter((c, i) => c !== b.columns[bCols[i]])
      }
    };
  }

  root.MLMerge = { suggestKeys, join, normKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLMerge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
