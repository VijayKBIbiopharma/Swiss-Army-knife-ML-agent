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


  /* ---------- Attribute agreement: can the judgement even be trusted? ----------

     Gage R&R above answers that question for a measurement. It cannot answer it for a
     judgement, and a great deal of pharmaceutical quality work is judgement: a visual
     inspector calling a vial accept or reject, a reviewer grading a defect, an analyst
     reading a plate pass or fail. There is no number to take a variance of, so the
     machinery above does not apply at all - what matters is whether people agree with
     themselves, with each other, and with the truth.

     The trap this exists to close is percent agreement. Visual inspection defects are rare,
     and when the defect rate is low an inspector who simply passes everything agrees with
     the standard on almost every vial. Two percent defective means a rubber stamp scores
     98% agreement, which reads as an excellent inspector and is the opposite of one. So
     agreement is reported with Cohen's and Fleiss' kappa beside it, which measure agreement
     ABOVE what guessing at the same rate would give: the rubber stamp scores zero, as it
     should, and the gap between the two numbers is itself the warning.

     Confidence intervals are bootstrapped over samples rather than taken from an asymptotic
     formula, because the asymptotic variance of kappa is fragile exactly where these studies
     live - few samples, rare defects, cells with nothing in them - and a resample needs no
     such assumption. The interval is checked against its own coverage in the tests.

     And for a binary call against a known standard, two more numbers matter more than any
     kappa, because they are not symmetric: the share of real defects passed (a miss, which
     reaches the patient) and the share of good units rejected (a false alarm, which costs
     yield). One inspector can be strong on one and weak on the other, and a single
     agreement figure hides that completely. */

  // Fleiss' kappa across m raters on n items. counts[i][j] = raters putting item i in category j.
  function fleiss(counts, k) {
    const n = counts.length;
    if (!n) return null;
    const m = sum(counts[0]);
    if (m < 2) return null;
    if (counts.some(row => sum(row) !== m)) return null;
    let pBar = 0;
    const colTotal = new Array(k).fill(0);
    for (const row of counts) {
      let s = 0;
      for (let j = 0; j < k; j++) { s += row[j] * row[j]; colTotal[j] += row[j]; }
      pBar += (s - m) / (m * (m - 1));
    }
    pBar /= n;
    let pe = 0;
    for (let j = 0; j < k; j++) { const pj = colTotal[j] / (n * m); pe += pj * pj; }
    // Everything in one category: agreement is perfect and chance agreement is also 1, so
    // kappa is 0/0. Reported as not computable rather than as a number.
    if (pe >= 1 - 1e-12) return { kappa: null, agreement: pBar, degenerate: true };
    return { kappa: (pBar - pe) / (1 - pe), agreement: pBar, degenerate: false };
  }

  // Cohen's kappa between two aligned label vectors.
  function cohen(a, b, cats) {
    const n = a.length;
    if (!n) return null;
    const k = cats.length, idx = {};
    cats.forEach((c, i) => { idx[c] = i; });
    let po = 0;
    const rowT = new Array(k).fill(0), colT = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const x = idx[a[i]], y = idx[b[i]];
      if (x === y) po++;
      rowT[x]++; colT[y]++;
    }
    po /= n;
    let pe = 0;
    for (let j = 0; j < k; j++) pe += (rowT[j] / n) * (colT[j] / n);
    if (pe >= 1 - 1e-12) return { kappa: null, agreement: po, degenerate: true };
    return { kappa: (po - pe) / (1 - pe), agreement: po, degenerate: false };
  }

  /* A percentile interval from resampling the SAMPLES - not the individual ratings, because
     the ratings within one sample are the very thing being measured and resampling them
     would break the dependence the study exists to capture. */
  function bootCI(parts, statOf, seed, reps) {
    const n = parts.length;
    if (n < 3) return { lo: null, hi: null, reps: 0 };
    const rand = E.rng(seed);
    const out = [];
    for (let b = 0; b < reps; b++) {
      const draw = [];
      for (let i = 0; i < n; i++) draw.push(parts[Math.floor(rand() * n)]);
      const v = statOf(draw);
      if (v !== null && v !== undefined && isFinite(v)) out.push(v);
    }
    if (out.length < reps / 2) return { lo: null, hi: null, reps: out.length };
    out.sort((x, y) => x - y);
    return { lo: E.quantile(out, 0.025), hi: E.quantile(out, 0.975), reps: out.length };
  }

  const KAPPA_BANDS = [
    [0.90, 'acceptable'],
    [0.70, 'marginal']
  ];
  // The 0.90 / 0.70 cuts are the measurement-systems convention, not a law; they are
  // reported as the convention they are so a borderline study is argued, not rubber-stamped.
  const kappaVerdict = k => {
    if (k === null || k === undefined || !isFinite(k)) return 'not computable';
    for (const [cut, label] of KAPPA_BANDS) if (k >= cut) return label;
    return 'inadequate';
  };

  function attributeAgreement(rows, opt) {
    opt = opt || {};
    const clean = (rows || []).map(r => (r ? {
      part: String(r.part === undefined ? '' : r.part).trim(),
      operator: String(r.operator === undefined ? '' : r.operator).trim(),
      rating: String(r.rating === undefined ? '' : r.rating).trim(),
      standard: r.standard === undefined || r.standard === null ? '' : String(r.standard).trim()
    } : null)).filter(r => r && r.part !== '' && r.operator !== '' && r.rating !== '');
    if (!clean.length) throw new Error('No usable ratings found. Each row needs a sample, an appraiser and the call they made.');

    const parts = [], operators = [], categories = [];
    /* Categories come from the calls AND the known values. Taking them from the calls alone
       threw out the one study this method exists to expose: the appraiser who passes
       everything. Every rating they give is "accept", so the call column holds one category,
       and the analysis that would have shown a kappa of zero refused to run instead. */
    for (const r of clean) {
      if (!parts.includes(r.part)) parts.push(r.part);
      if (!operators.includes(r.operator)) operators.push(r.operator);
      if (!categories.includes(r.rating)) categories.push(r.rating);
      if (r.standard !== '' && !categories.includes(r.standard)) categories.push(r.standard);
    }
    if (parts.length < 3) throw new Error('Need at least 3 samples. Agreement measured on one or two samples is not measured.');
    if (categories.length < 2) throw new Error('Every call and every known value in this study is "' + categories[0] + '". With only one possible answer there is nothing to agree or disagree about.');
    if (categories.length > 8) throw new Error('Found ' + categories.length + ' different ratings. This is for a judgement with a few possible calls, not a measurement; if the column holds numbers, use the Gage R&R mode instead.');
    categories.sort();

    // The known truth, where there is one: one value per sample, taken from the rows.
    const truth = Object.create(null);
    const conflicting = [];
    for (const r of clean) {
      if (r.standard === '') continue;
      if (truth[r.part] === undefined) truth[r.part] = r.standard;
      else if (truth[r.part] !== r.standard && !conflicting.includes(r.part)) conflicting.push(r.part);
    }
    const withTruth = parts.filter(p => truth[p] !== undefined);
    const hasStandard = withTruth.length === parts.length && parts.length > 0 && !conflicting.length;
    const notes = [];
    if (conflicting.length) notes.push('Samples ' + conflicting.slice(0, 5).join(', ') + (conflicting.length > 5 ? ' and others' : '') + ' carry more than one known value, so the standard was ignored and only agreement between and within appraisers is reported.');
    else if (withTruth.length && !hasStandard) notes.push('Only ' + withTruth.length + ' of ' + parts.length + ' samples carry a known value, so comparison against the standard was skipped. A partial standard flatters whoever was shown the easy samples.');

    const ratingsOf = (p, o) => clean.filter(r => r.part === p && r.operator === o).map(r => r.rating);
    const repeatCounts = [];
    for (const p of parts) for (const o of operators) repeatCounts.push(ratingsOf(p, o).length);
    const repeats = Math.min.apply(null, repeatCounts);
    const balanced = repeatCounts.every(c => c === repeatCounts[0]);
    if (!balanced) notes.push('This study is not balanced: appraisers rated between ' + Math.min.apply(null, repeatCounts) + ' and ' + Math.max.apply(null, repeatCounts) + ' times per sample. Figures below use every rating given, but an unbalanced study weights whoever rated most.');

    const countRow = labels => {
      const row = new Array(categories.length).fill(0);
      for (const l of labels) { const j = categories.indexOf(l); if (j >= 0) row[j]++; }
      return row;
    };

    /* 1. Each appraiser against themselves. Only meaningful with repeats: one look per
          sample cannot show whether a second look would have agreed. */
    const withinAppraiser = operators.map(o => {
      const per = parts.map(p => ratingsOf(p, o)).filter(rs => rs.length >= 2);
      if (per.length < 3) return { operator: o, repeats: 0, n: per.length, agreed: null, pct: null, kappa: null, lo: null, hi: null, verdict: 'not measured', why: 'needs at least two looks at each of at least three samples' };
      const r = Math.min.apply(null, per.map(x => x.length));
      const trimmed = per.map(x => x.slice(0, r));
      const agreed = trimmed.filter(x => x.every(v => v === x[0])).length;
      const stat = set => { const f = fleiss(set.map(countRow), categories.length); return f ? f.kappa : null; };
      const k = stat(trimmed);
      const ci = bootCI(trimmed, stat, (opt.seed || 7) + 11, opt.reps || 400);
      return { operator: o, repeats: r, n: trimmed.length, agreed, pct: agreed / trimmed.length, kappa: k, lo: ci.lo, hi: ci.hi, verdict: kappaVerdict(k) };
    });

    /* 2. Each appraiser against the known standard, pooling every look they took. Plus the
          two asymmetric rates, which is what an inspection qualification turns on. */
    const binary = categories.length === 2;
    const defectName = binary ? (opt.defect && categories.includes(String(opt.defect).trim()) ? String(opt.defect).trim() : guessDefect(categories)) : null;
    const vsStandard = !hasStandard ? [] : operators.map(o => {
      const mine = [], theirs = [], per = [];
      for (const p of parts) {
        const rs = ratingsOf(p, o);
        if (!rs.length) continue;
        per.push({ ratings: rs, truth: truth[p] });
        for (const v of rs) { mine.push(v); theirs.push(truth[p]); }
      }
      const c = cohen(mine, theirs, categories);
      const stat = set => {
        const a = [], b = [];
        for (const row of set) for (const v of row.ratings) { a.push(v); b.push(row.truth); }
        const cc = cohen(a, b, categories);
        return cc ? cc.kappa : null;
      };
      const ci = bootCI(per, stat, (opt.seed || 7) + 23, opt.reps || 400);
      let miss = null, falseAlarm = null, missN = 0, goodN = 0;
      if (binary && defectName) {
        let missed = 0, flagged = 0;
        for (const row of per) for (const v of row.ratings) {
          if (row.truth === defectName) { missN++; if (v !== defectName) missed++; }
          else { goodN++; if (v === defectName) flagged++; }
        }
        miss = missN ? missed / missN : null;
        falseAlarm = goodN ? flagged / goodN : null;
      }
      return {
        operator: o, n: mine.length, agreed: Math.round((c ? c.agreement : 0) * mine.length), pct: c ? c.agreement : null,
        kappa: c ? c.kappa : null, lo: ci.lo, hi: ci.hi, verdict: kappaVerdict(c ? c.kappa : null),
        miss, falseAlarm, defectsSeen: missN, goodsSeen: goodN
      };
    });

    // 3. Everyone against everyone: every rating on a sample treated as one more rater on it.
    const allRows = parts.map(p => countRow(clean.filter(r => r.part === p).map(r => r.rating)));
    const sameCount = allRows.every(r => sum(r) === sum(allRows[0]));
    const between = (() => {
      if (operators.length < 2) return { n: parts.length, agreed: null, pct: null, kappa: null, lo: null, hi: null, verdict: 'not measured', why: 'one appraiser only' };
      const agreed = parts.filter(p => { const rs = clean.filter(r => r.part === p).map(r => r.rating); return rs.every(v => v === rs[0]); }).length;
      if (!sameCount) return { n: parts.length, agreed, pct: agreed / parts.length, kappa: null, lo: null, hi: null, verdict: 'not computable', why: 'unbalanced: kappa between appraisers needs the same number of ratings on every sample' };
      const perPart = parts.map(p => clean.filter(r => r.part === p).map(r => r.rating));
      const stat = set => { const f = fleiss(set.map(countRow), categories.length); return f ? f.kappa : null; };
      const k = stat(perPart);
      const ci = bootCI(perPart, stat, (opt.seed || 7) + 37, opt.reps || 400);
      return { n: parts.length, agreed, pct: agreed / parts.length, kappa: k, lo: ci.lo, hi: ci.hi, verdict: kappaVerdict(k) };
    })();

    // 4. The one figure a quality unit asks for: every appraiser, every look, all correct.
    const allVsStandard = !hasStandard ? null : (() => {
      const ok = parts.filter(p => clean.filter(r => r.part === p).every(r => r.rating === truth[p])).length;
      return { n: parts.length, agreed: ok, pct: ok / parts.length };
    })();

    /* The prevalence warning, which is the whole reason kappa is here. With a rare defect,
       percent agreement is close to 100 for anybody at all, so the gap between it and kappa
       is reported rather than left for the reader to spot. */
    let prevalence = null;
    if (hasStandard && binary && defectName) {
      const d = parts.filter(p => truth[p] === defectName).length;
      prevalence = d / parts.length;
      if (prevalence <= 0.2 || prevalence >= 0.8) {
        const rubber = Math.max(prevalence, 1 - prevalence);
        notes.push('Only ' + Math.round(prevalence * 100) + '% of these samples are truly ' + defectName + '. An appraiser who called every single one the same way would score ' +
          Math.round(rubber * 100) + '% agreement and a kappa of 0, so read kappa here and treat the agreement percentage as background.');
      }
      if (d < 3 || parts.length - d < 3) notes.push('This study holds ' + d + ' truly ' + defectName + ' and ' + (parts.length - d) + ' truly not. Fewer than about three of either side cannot support a miss rate or a false alarm rate worth quoting; a qualification study is usually built close to half and half.');
    }
    if (repeats < 2) notes.push('No sample was rated twice by the same appraiser, so repeatability - whether one person would say the same thing on a second look - is not measured here at all.');
    /* One call, every time. Kappa is 0 over 0 for such an appraiser against themselves, and
       a blank there reads as a missing number rather than as the finding it is. */
    const oneNote = [];
    for (const o of operators) {
      const used = [];
      for (const r of clean) if (r.operator === o && !used.includes(r.rating)) used.push(r.rating);
      if (used.length === 1) oneNote.push(o + ' called every sample "' + used[0] + '"');
    }
    if (oneNote.length) notes.push(oneNote.join('; ') + '. Perfect self-agreement and no discrimination whatever: their own kappa cannot be computed, and against the standard it is 0. Read the miss and false alarm rates for them, not the agreement percentage.');

    const kappas = [].concat(withinAppraiser.map(w => w.kappa), vsStandard.map(v => v.kappa), [between.kappa]).filter(k => k !== null && isFinite(k));
    const worst = kappas.length ? Math.min.apply(null, kappas) : null;
    return {
      parts: parts.length, operators: operators.slice(), categories: categories.slice(), repeats, balanced,
      binary, defect: defectName, hasStandard, prevalence,
      withinAppraiser, vsStandard, betweenAppraisers: between, allVsStandard,
      worstKappa: worst, verdict: kappaVerdict(worst), notes,
      ratings: clean.length
    };
  }

  // Which of two labels means "there is something wrong with this unit".
  const DEFECTY = /^(fail|failed|reject|rejected|defect|defective|bad|ng|not ?ok|nok|out|oos|particle|contaminated|positive|yes|y|1|true)$/i;
  const GOODY = /^(pass|passed|accept|accepted|ok|good|clean|none|negative|no|n|0|false|conform|conforming)$/i;
  function guessDefect(cats) {
    const bad = cats.filter(c => DEFECTY.test(c));
    if (bad.length === 1) return bad[0];
    const good = cats.filter(c => GOODY.test(c));
    if (good.length === 1) return cats.find(c => c !== good[0]);
    return null;
  }

  root.MLVariance = { oneWay, tukey, gageRR, attributeAgreement, fleiss, cohen, qCritical, srCdf, rangeCdf, fTestP };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLVariance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
