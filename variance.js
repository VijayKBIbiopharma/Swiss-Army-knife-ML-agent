/* Where does the variation come from, and can the measurement even see it?

   Two questions a development or QC group asks constantly, and both are answered by the same
   arithmetic: split the total variation into named buckets.

     Variance components   "Resin lot accounts for 42% of the variation in titer." Each
                           grouping factor -- supplier lot, vessel, analyst, column -- is
                           fitted as a random effect and reported as a share of the total.

     Gage R&R              The same split applied to a measurement study: part-to-part is
                           signal, everything else (repeatability and reproducibility) is the
                           measurement system's own noise. If that noise is a big share of
                           what you are trying to see, the method cannot do the job.

     Group comparison      One-way ANOVA with Tukey's honest significant difference, which
                           tells you WHICH groups differ rather than only that some do.

   Pure computation; no network, no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');
  const { mean, range } = E;

  const asNumber = v => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const fTestP = (f, df1, df2) => (!isFinite(f) || f <= 0 || df1 <= 0 || df2 <= 0 ? 1 : E.ibeta(df2 / 2, df1 / 2, df2 / (df2 + df1 * f)));

  // ---------- the studentized range, for Tukey ----------
  const lgamma = x => {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5;
    t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015;
    for (let j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  };
  const phi = z => Math.exp(-z * z / 2) / Math.SQRT2 / Math.sqrt(Math.PI);
  const Phi = z => {
    // Abramowitz and Stegun 7.1.26.
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  };
  // P(range of k independent standard normals <= w).
  function rangeCdf(w, k) {
    if (w <= 0) return 0;
    const lo = -8.5, hi = 8.5, n = 240, step = (hi - lo) / n;
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      const z = lo + i * step;
      const inner = Math.pow(Math.max(0, Phi(z) - Phi(z - w)), k - 1);
      const weight = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      acc += weight * phi(z) * inner;
    }
    return Math.min(1, Math.max(0, k * acc * step / 3));
  }
  /* P(studentized range <= q): the range above, averaged over the uncertainty in the pooled
     standard deviation. s = chi_v / sqrt(v), whose density is integrated by Simpson's rule
     over the range where it has any mass. */
  function srCdf(q, k, df) {
    if (!(q > 0)) return 0;
    if (df > 2000) return rangeCdf(q, k);
    const logC = (df / 2) * Math.log(df) - lgamma(df / 2) - (df / 2 - 1) * Math.log(2);
    const spread = 8 / Math.sqrt(2 * df);
    const lo = Math.max(1e-6, 1 - 6 * spread), hi = 1 + 6 * spread;
    const n = 240, step = (hi - lo) / n;
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      const s = lo + i * step;
      const dens = Math.exp(logC + (df - 1) * Math.log(s) - df * s * s / 2);
      const weight = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      acc += weight * dens * rangeCdf(q * s, k);
    }
    return Math.min(1, Math.max(0, acc * step / 3));
  }
  // Critical value of the studentized range: q such that P(Q <= q) = 1 - alpha.
  function qCritical(alpha, k, df) {
    if (k < 2 || df < 1) return NaN;
    let lo = 0, hi = 100;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (srCdf(mid, k, df) < 1 - alpha) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const srP = (q, k, df) => 1 - srCdf(q, k, df);

  // ---------- one grouping factor as a random effect ----------
  /* rows: [{ group, value }]. Handles unequal group sizes, which real data always has: n0 is
     the effective group size that makes the expected mean squares work out. */
  function oneWay(rows) {
    const clean = (rows || []).map(r => (r ? { group: String(r.group === undefined ? '' : r.group).trim(), value: asNumber(r.value) } : null))
      .filter(r => r && r.group !== '' && r.value !== null);
    const names = [];
    clean.forEach(r => { if (!names.includes(r.group)) names.push(r.group); });
    if (names.length < 2) throw new Error('Need at least 2 groups to split variation between them.');
    const groups = names.map(name => {
      const vals = clean.filter(r => r.group === name).map(r => r.value);
      return { name, n: vals.length, mean: mean(vals), values: vals };
    }).filter(g => g.n > 0);
    const N = sum(groups.map(g => g.n)), a = groups.length;
    if (N - a < 1) throw new Error('Every group has a single value, so within-group variation cannot be separated from between-group variation. At least one group needs repeats.');
    const grand = sum(groups.map(g => g.mean * g.n)) / N;
    const ssB = sum(groups.map(g => g.n * (g.mean - grand) ** 2));
    const ssW = sum(groups.map(g => sum(g.values.map(v => (v - g.mean) ** 2))));
    const dfB = a - 1, dfW = N - a;
    const msB = ssB / dfB, msW = ssW / dfW;
    // Effective replication, equal to n when the design is balanced.
    const n0 = (N - sum(groups.map(g => g.n * g.n)) / N) / dfB;
    const within = msW;
    // A negative estimate means the factor explains nothing beyond noise; convention is zero.
    const betweenRaw = (msB - msW) / n0;
    const between = Math.max(0, betweenRaw);
    const total = between + within;
    const f = msW > 0 ? msB / msW : Infinity;
    return {
      groups: groups.map(g => ({ name: g.name, n: g.n, mean: g.mean, sd: g.n > 1 ? Math.sqrt(sum(g.values.map(v => (v - g.mean) ** 2)) / (g.n - 1)) : NaN })),
      N, a, grand, balanced: groups.every(g => g.n === groups[0].n), n0,
      anova: [
        { source: 'Between groups', ss: ssB, df: dfB, ms: msB, f, p: fTestP(f, dfB, dfW) },
        { source: 'Within groups (repeat error)', ss: ssW, df: dfW, ms: msW, f: null, p: null }
      ],
      components: [
        { source: 'Between groups', variance: between, sd: Math.sqrt(between), share: total ? between / total : 0 },
        { source: 'Within groups', variance: within, sd: Math.sqrt(within), share: total ? within / total : 0 }
      ],
      between, within, total, sdTotal: Math.sqrt(total),
      negative: betweenRaw < 0,
      icc: total ? between / total : 0,
      p: fTestP(f, dfB, dfW), significant: fTestP(f, dfB, dfW) < 0.05
    };
  }

  /* Which groups actually differ. Tukey's method compares every pair while holding the
     overall false-positive rate at alpha, which repeated t-tests do not. */
  function tukey(rows, alpha) {
    const base = oneWay(rows);
    const a = alpha > 0 && alpha < 1 ? alpha : 0.05;
    const gs = base.groups, k = gs.length;
    const dfW = base.anova[1].df, msW = base.anova[1].ms;
    const qCrit = qCritical(a, k, dfW);
    const pairs = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const diff = gs[i].mean - gs[j].mean;
      // Tukey-Kramer, which allows the groups to be different sizes.
      const se = Math.sqrt(msW / 2 * (1 / gs[i].n + 1 / gs[j].n));
      const q = se > 0 ? Math.abs(diff) / se : Infinity;
      const half = qCrit * se;
      pairs.push({
        a: gs[i].name, b: gs[j].name, diff, se, q,
        p: srP(q, k, dfW), lower: diff - half, upper: diff + half,
        different: Math.abs(diff) > half
      });
    }
    pairs.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    return Object.assign({}, base, { alpha: a, qCrit, pairs, anyDifferent: pairs.some(p => p.different) });
  }

  /* Gage R&R, crossed, by the ANOVA method: every part measured by every operator, more than
     once. Reports what share of the variation is the measurement system rather than real
     differences between parts. */
  function gageRR(rows, opt) {
    opt = opt || {};
    const clean = (rows || []).map(r => (r ? { part: String(r.part === undefined ? '' : r.part).trim(), operator: String(r.operator === undefined ? '' : r.operator).trim(), value: asNumber(r.value) } : null))
      .filter(r => r && r.part !== '' && r.operator !== '' && r.value !== null);
    const parts = [], operators = [];
    clean.forEach(r => { if (!parts.includes(r.part)) parts.push(r.part); if (!operators.includes(r.operator)) operators.push(r.operator); });
    const p = parts.length, o = operators.length;
    if (p < 2) throw new Error('Need at least 2 parts or samples. Gage R&R compares measurement noise against real differences, so there must be real differences to compare against.');
    if (o < 1) throw new Error('Need at least one operator or instrument.');
    const cell = (pi, oi) => clean.filter(r => r.part === parts[pi] && r.operator === operators[oi]).map(r => r.value);
    const counts = [];
    for (let i = 0; i < p; i++) for (let j = 0; j < o; j++) counts.push(cell(i, j).length);
    const r = counts[0];
    if (counts.some(c => c !== r)) throw new Error('This study is not balanced: every operator must measure every part the same number of times. Found cells with ' + Math.min.apply(null, counts) + ' to ' + Math.max.apply(null, counts) + ' measurements.');
    if (r < 2) throw new Error('Each operator needs to measure each part at least twice, or repeatability cannot be separated from everything else.');

    const all = clean.map(x => x.value), N = all.length, grand = mean(all);
    const partMean = i => mean([].concat.apply([], range(o).map(j => cell(i, j))));
    const opMean = j => mean([].concat.apply([], range(p).map(i => cell(i, j))));
    const cellMean = (i, j) => mean(cell(i, j));
    const ssP = o * r * sum(range(p).map(i => (partMean(i) - grand) ** 2));
    const ssO = p * r * sum(range(o).map(j => (opMean(j) - grand) ** 2));
    let ssPO = 0, ssE = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < o; j++) {
      ssPO += r * (cellMean(i, j) - partMean(i) - opMean(j) + grand) ** 2;
      cell(i, j).forEach(v => { ssE += (v - cellMean(i, j)) ** 2; });
    }
    const dfP = p - 1, dfO = Math.max(0, o - 1), dfPO = dfP * dfO, dfE = p * o * (r - 1);
    const msP = ssP / dfP, msO = dfO ? ssO / dfO : 0, msPO = dfPO ? ssPO / dfPO : 0, msE = ssE / dfE;

    /* The interaction is dropped when it is not supported, which is standard practice: with
       it left in, a noisy interaction term eats variation that belongs elsewhere. */
    const pInteraction = dfPO ? fTestP(msPO / msE, dfPO, dfE) : 1;
    const keepInteraction = dfPO > 0 && pInteraction < (opt.interactionAlpha || 0.25);
    let vRepeat, vOper, vInter, vPart, model;
    if (keepInteraction) {
      vRepeat = msE;
      vInter = Math.max(0, (msPO - msE) / r);
      vOper = Math.max(0, (msO - msPO) / (p * r));
      vPart = Math.max(0, (msP - msPO) / (o * r));
      model = 'parts, operators and their interaction';
    } else {
      // Pool the interaction back into error.
      const ssPooled = ssPO + ssE, dfPooled = dfPO + dfE;
      const msPooled = ssPooled / dfPooled;
      vRepeat = msPooled;
      vInter = 0;
      vOper = Math.max(0, (msO - msPooled) / (p * r));
      vPart = Math.max(0, (msP - msPooled) / (o * r));
      model = 'parts and operators, interaction pooled into repeat error';
    }
    const vReprod = vOper + vInter;
    const vGrr = vRepeat + vReprod;
    const vTotal = vGrr + vPart;
    const pctOf = v => (vTotal > 0 ? Math.sqrt(v) / Math.sqrt(vTotal) * 100 : 0);
    const lsl = asNumber(opt.lsl), usl = asNumber(opt.usl);
    const tol = lsl !== null && usl !== null ? usl - lsl : null;
    const pctTol = tol && tol > 0 ? 6 * Math.sqrt(vGrr) / tol * 100 : null;
    // Distinct categories: how many genuinely different levels the method can tell apart.
    const ndc = vGrr > 0 ? Math.floor(1.41 * Math.sqrt(vPart) / Math.sqrt(vGrr)) : Infinity;
    const judge = v => (v < 10 ? 'acceptable' : v < 30 ? 'marginal' : 'not acceptable');
    const headline = pctTol !== null ? pctTol : pctOf(vGrr);
    return {
      parts, operators, reps: r, N, grand, model, keepInteraction, pInteraction,
      anova: [
        { source: 'Part', ss: ssP, df: dfP, ms: msP, f: msPO && keepInteraction ? msP / msPO : msP / msE, p: fTestP(keepInteraction && msPO ? msP / msPO : msP / msE, dfP, keepInteraction ? dfPO : dfE) },
        { source: 'Operator', ss: ssO, df: dfO, ms: msO, f: dfO ? (keepInteraction && msPO ? msO / msPO : msO / msE) : null, p: dfO ? fTestP(keepInteraction && msPO ? msO / msPO : msO / msE, dfO, keepInteraction ? dfPO : dfE) : null },
        { source: 'Part x Operator', ss: ssPO, df: dfPO, ms: msPO, f: dfPO ? msPO / msE : null, p: dfPO ? pInteraction : null },
        { source: 'Repeatability (error)', ss: ssE, df: dfE, ms: msE, f: null, p: null }
      ],
      components: [
        { source: 'Repeatability (same operator, same part)', variance: vRepeat, sd: Math.sqrt(vRepeat), share: vTotal ? vRepeat / vTotal : 0, pctStudy: pctOf(vRepeat) },
        { source: 'Reproducibility (between operators)', variance: vReprod, sd: Math.sqrt(vReprod), share: vTotal ? vReprod / vTotal : 0, pctStudy: pctOf(vReprod) },
        { source: 'Total Gage R&R (measurement)', variance: vGrr, sd: Math.sqrt(vGrr), share: vTotal ? vGrr / vTotal : 0, pctStudy: pctOf(vGrr) },
        { source: 'Part to part (real differences)', variance: vPart, sd: Math.sqrt(vPart), share: vTotal ? vPart / vTotal : 0, pctStudy: pctOf(vPart) }
      ],
      vRepeat, vReprod, vOper, vInter, vGrr, vPart, vTotal,
      pctStudyGrr: pctOf(vGrr), pctTolerance: pctTol, tolerance: tol, lsl, usl,
      ndc, verdict: judge(headline), judgedOn: pctTol !== null ? 'tolerance' : 'study variation'
    };
  }

  root.MLVariance = { oneWay, tukey, gageRR, qCritical, srCdf, rangeCdf, fTestP };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLVariance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
