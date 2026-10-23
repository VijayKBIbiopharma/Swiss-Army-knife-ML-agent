/* Equivalence testing by TOST (two one-sided tests), for analytical method transfer:
   is Lab B the same as Lab A, within a margin you declare acceptable beforehand?

   An ordinary t-test answers the wrong question. Failing to find a difference is not
   evidence of sameness: it can simply mean the study was too small. TOST turns the question
   around and asks whether the difference is small enough to ignore, by testing both edges of
   the acceptable band:

     H01: difference <= -margin   against   difference > -margin
     H02: difference >= +margin   against   difference < +margin

   Rejecting both says the true difference lies inside the band. That is exactly the same
   statement as "the 90% confidence interval fits entirely within the margins" when alpha is
   0.05, and both are reported here.

   Pure computation; no network, no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');

  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => (a.length ? sum(a) / a.length : NaN);
  function sdOf(a) {
    const n = a.length;
    if (n < 2) return NaN;
    const m = mean(a);
    return Math.sqrt(sum(a.map(v => (v - m) ** 2)) / (n - 1));
  }
  // Upper tail P(T > t) and lower tail P(T < t), from the two-sided p-value.
  const upper = (t, df) => (t >= 0 ? E.tTestP(t, df) / 2 : 1 - E.tTestP(-t, df) / 2);
  const lower = (t, df) => 1 - upper(t, df);

  const describe = vals => ({
    n: vals.length, mean: mean(vals), sd: sdOf(vals),
    cv: Math.abs(mean(vals)) > 0 ? sdOf(vals) / Math.abs(mean(vals)) : NaN,
    min: Math.min.apply(null, vals), max: Math.max.apply(null, vals)
  });

  const asNumber = v => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };

  /* rows: [{ group, value, sample }]. opt:
       reference, test   which group label is which (defaults: the first two seen)
       margin            the acceptable difference
       marginType        'absolute' or 'percent' (percent of the reference mean)
       alpha             one-sided level, default 0.05, so a 90% interval
       paired            match on `sample` instead of treating the groups as independent
       welch             unequal variances (default true when unpaired) */
  function analyze(rows, opt) {
    opt = opt || {};
    const clean = (rows || []).map(r => (r ? { group: String(r.group === undefined ? '' : r.group).trim(), value: asNumber(r.value), sample: r.sample === undefined || r.sample === null ? '' : String(r.sample).trim() } : null))
      .filter(r => r && r.group !== '' && r.value !== null);
    const labels = [];
    clean.forEach(r => { if (!labels.includes(r.group)) labels.push(r.group); });
    if (labels.length < 2) throw new Error('Two methods are needed to compare. Found ' + (labels.length ? '"' + labels[0] + '"' : 'none') + '.');
    const reference = opt.reference && labels.includes(opt.reference) ? opt.reference : labels[0];
    const test = opt.test && labels.includes(opt.test) && opt.test !== reference ? opt.test : labels.find(l => l !== reference);
    if (labels.length > 2 && !(opt.reference && opt.test)) throw new Error('Found ' + labels.length + ' methods (' + labels.join(', ') + '). Choose which two to compare.');

    const refRows = clean.filter(r => r.group === reference), testRows = clean.filter(r => r.group === test);
    if (refRows.length < 2 || testRows.length < 2) throw new Error('Each method needs at least 2 results. ' + reference + ' has ' + refRows.length + ', ' + test + ' has ' + testRows.length + '.');

    const alpha = opt.alpha > 0 && opt.alpha < 0.5 ? opt.alpha : 0.05;
    const refStats = describe(refRows.map(r => r.value)), testStats = describe(testRows.map(r => r.value));

    // The margin may be quoted as a percentage, which is always a percentage of the reference.
    const marginType = opt.marginType === 'percent' ? 'percent' : 'absolute';
    const marginInput = Number(opt.margin);
    if (!(isFinite(marginInput) && marginInput > 0)) throw new Error('Set an equivalence margin greater than zero: the difference you are willing to accept.');
    const theta = marginType === 'percent' ? Math.abs(refStats.mean) * marginInput / 100 : marginInput;
    if (!(theta > 0)) throw new Error('A percentage margin needs a reference mean that is not zero. Use an absolute margin instead.');

    let diff, se, df, design, pairs = null, dropped = 0;
    if (opt.paired) {
      // Same samples measured twice: compare them one by one, which removes sample-to-sample
      // spread from the comparison and is far more sensitive.
      const byId = new Map();
      refRows.forEach(r => { if (r.sample) byId.set(r.sample, { ref: r.value }); });
      const ds = [];
      testRows.forEach(r => {
        const hit = r.sample && byId.get(r.sample);
        if (hit && hit.ref !== undefined && hit.used !== true) { hit.used = true; ds.push({ sample: r.sample, ref: hit.ref, test: r.value, d: r.value - hit.ref }); }
      });
      dropped = refRows.length + testRows.length - ds.length * 2;
      if (ds.length < 2) throw new Error('Pairing needs a sample identifier that appears under both methods. Matched ' + ds.length + ' pair' + (ds.length === 1 ? '' : 's') + '.');
      pairs = ds;
      const dv = ds.map(x => x.d);
      diff = mean(dv); se = sdOf(dv) / Math.sqrt(ds.length); df = ds.length - 1;
      design = 'paired';
    } else {
      const n1 = testStats.n, n2 = refStats.n, s1 = testStats.sd, s2 = refStats.sd;
      diff = testStats.mean - refStats.mean;
      const welch = opt.welch !== false;
      if (welch) {
        const a = s1 * s1 / n1, b = s2 * s2 / n2;
        se = Math.sqrt(a + b);
        // Welch-Satterthwaite: the effective degrees of freedom when the spreads differ.
        df = (a + b) ** 2 / (a * a / (n1 - 1) + b * b / (n2 - 1));
        design = 'unpaired, unequal variances (Welch)';
      } else {
        const sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
        se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
        df = n1 + n2 - 2;
        design = 'unpaired, pooled variance';
      }
    }
    if (!(se > 0)) throw new Error('Every result within a method is identical, so there is no scatter to test against. Check the data.');

    // The two one-sided tests, and the interval that says the same thing.
    const t1 = (diff + theta) / se, t2 = (diff - theta) / se;
    const p1 = upper(t1, df), p2 = lower(t2, df);
    const pTost = Math.max(p1, p2);
    const tCrit = E.tQuantile(alpha, df);
    const ciLow = diff - tCrit * se, ciHigh = diff + tCrit * se;
    const equivalent = pTost < alpha;

    // An ordinary two-sided test of "is there any difference at all", for contrast.
    const tDiff = diff / se, pDiff = E.tTestP(Math.abs(tDiff), df);
    const differs = pDiff < alpha * 2;

    /* Three outcomes, not two. Failing equivalence while also failing to find a difference
       is the commonest result of an underpowered study, and it means "we cannot tell yet",
       not "the methods differ". */
    const verdict = equivalent ? 'equivalent' : differs ? 'different' : 'inconclusive';
    const widest = Math.max(Math.abs(ciLow), Math.abs(ciHigh));

    /* How many results per method it would take, if the difference and the scatter stayed
       as observed. Planning arithmetic, not a promise. */
    let needed = null;
    if (!equivalent) {
      const unit = opt.paired ? sdOf(pairs.map(x => x.d)) : se * Math.sqrt(1 / (1 / testStats.n + 1 / refStats.n));
      for (let n = Math.max(3, 3); n <= 2000; n++) {
        const dfN = opt.paired ? n - 1 : 2 * (n - 1);
        const seN = opt.paired ? unit / Math.sqrt(n) : unit * Math.sqrt(2 / n);
        const tc = E.tQuantile(alpha, dfN);
        if (Math.abs(diff) + tc * seN < theta) { needed = n; break; }
      }
    }

    return {
      reference, test, labels, design, paired: !!opt.paired, pairs, dropped,
      refStats, testStats, alpha, confidence: 1 - 2 * alpha,
      margin: theta, marginType, marginInput, marginPct: Math.abs(refStats.mean) > 0 ? theta / Math.abs(refStats.mean) * 100 : NaN,
      diff, diffPct: Math.abs(refStats.mean) > 0 ? diff / refStats.mean * 100 : NaN,
      se, df, t1, t2, p1, p2, pTost, tCrit, ciLow, ciHigh, equivalent, differs, verdict,
      pDiff, widest, marginNeeded: widest, needed,
      // How much of the allowed band the interval uses up: under 1 means it fits.
      bandUsed: theta > 0 ? widest / theta : Infinity
    };
  }

  root.MLTost = { analyze, describe, upper, lower };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLTost;
})(typeof globalThis !== 'undefined' ? globalThis : this);
