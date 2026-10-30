/* Six Sigma and process-control statistics: capability (Cp, Cpk, Pp, Ppk, Cpm, Z.bench,
   PPM), I-MR control charts, box-plot summaries, Taguchi signal-to-noise and quality loss,
   and defect rate / DPMO / sigma level for pass-fail data. Pure computation; no network,
   no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');
  const { mean, sd, quantile } = E;

  // Shared numerics: the engine carries the accurate normal CDF and its inverse.
  const { normCdf, normInv } = E;
  /* Resolved when used, so load order cannot bite: the capability block needs the normality
     test that the tolerance tool already carries, and reimplementing Anderson-Darling here
     to avoid the dependency would be two versions of one thing waiting to disagree. */
  const tolerance = () => root.MLTolerance || (typeof require !== 'undefined' ? require('./tolerance.js') : null);

  const num = v => v !== null && v !== undefined && v !== '' && isFinite(Number(v));

  /* Capability. y in time order; spec = { lsl, usl, target } (any may be missing);
     timeOrdered: within-subgroup sigma comes from the average moving range, which only
     means something when rows are in production order. */
  function capability(y, spec, timeOrdered) {
    const lsl = num(spec.lsl) ? Number(spec.lsl) : null, usl = num(spec.usl) ? Number(spec.usl) : null, T = num(spec.target) ? Number(spec.target) : null;
    const n = y.length, m = mean(y), sO = sd(y);
    const mrs = []; for (let i = 1; i < n; i++) mrs.push(Math.abs(y[i] - y[i - 1]));
    const mrBar = mean(mrs), sW = timeOrdered && mrs.length ? mrBar / 1.128 : null;
    const idx = (s, k) => {
      if (!s) return {};
      const up = usl !== null ? (usl - m) / (3 * s) : null, dn = lsl !== null ? (m - lsl) / (3 * s) : null;
      const both = usl !== null && lsl !== null;
      return { [k + 'p']: both ? (usl - lsl) / (6 * s) : null, [k + 'pu']: up, [k + 'pl']: dn, [k + 'pk']: [up, dn].filter(v => v !== null).reduce((a, b) => Math.min(a, b), Infinity) };
    };
    const w = idx(sW, 'C'), o = idx(sO, 'P');
    if (w.Cpk === Infinity) w.Cpk = null;
    if (o.Ppk === Infinity) o.Ppk = null;
    // Expected fraction out of spec, from the overall (long-term) spread.
    const pBelow = lsl !== null && sO ? normCdf((lsl - m) / sO) : 0, pAbove = usl !== null && sO ? 1 - normCdf((usl - m) / sO) : 0;
    const pOut = pBelow + pAbove;
    const zBench = lsl === null && usl === null ? null : Math.min(8, normInv(1 - Math.max(pOut, 1e-15)));
    const observedOut = y.filter(v => (lsl !== null && v < lsl) || (usl !== null && v > usl)).length;
    const cpm = T !== null && lsl !== null && usl !== null ? (usl - lsl) / (6 * Math.sqrt(sO * sO + (m - T) ** 2)) : null;
    // Taguchi quadratic loss, relative to the loss of a unit sitting exactly at a spec limit.
    let loss = null;
    if (T !== null && (lsl !== null || usl !== null)) {
      const delta = Math.min(usl !== null ? usl - T : Infinity, lsl !== null ? T - lsl : Infinity);
      if (delta > 0 && isFinite(delta)) loss = mean(y.map(v => (v - T) ** 2)) / (delta * delta);
    }
    const s3 = y.reduce((a, v) => a + ((v - m) / (sO || 1)) ** 3, 0) / n;

    /* Whether the PPM and sigma figures above mean anything.

       Cp and Cpk are ratios of distances to spread; they are what they are whatever the
       shape. The expected PPM, Z.bench and sigma level are different: every one of them is
       a normal tail probability, and a tail probability from the wrong distribution is not
       approximately right, it is wrong by orders of magnitude.

       Measured on a right-skewed (lognormal) impurity with the limit at its true 99.9th
       percentile, so the real rate is 1,000 PPM: at a skewness of 0.50 the normal figure
       reads 80 PPM, twelve times under; at 0.85 it reads 9 PPM, a hundred times under; by
       1.47 it is eight thousand times under. The warning this replaced only fired above a
       skewness of 1, so it stayed silent through the first two - the mild right skew that
       impurities, aggregates and particulates actually have.

       So the test is a real one rather than a skew threshold, and the observed count is
       carried beside the estimate, because that one needs no distribution at all. */
    const TOL = tolerance();
    const ad = TOL && TOL.andersonDarling ? TOL.andersonDarling(y) : null;
    const tailsUsable = !ad || ad.normal === null ? null : ad.normal;
    /* How far apart the two answers are. The expected count is what the normal fit implies
       for these n rows; the observed count is what actually happened. When they disagree,
       the observed one is the evidence and the other is an assumption. */
    const expectedOut = pOut * n;
    const key = w.Cpk ?? o.Ppk ?? null;
    return {
      n, mean: m, sdOverall: sO, sdWithin: sW, lsl, usl, target: T, mrBar,
      // Missing indices are null (never undefined), so callers can test with === null.
      Cp: w.Cp ?? null, Cpk: w.Cpk ?? null, Cpu: w.Cpu ?? null, Cpl: w.Cpl ?? null, Pp: o.Pp ?? null, Ppk: o.Ppk ?? null, Cpm: cpm,
      pBelow, pAbove, ppm: pOut * 1e6, zBench, sigmaLevel: zBench === null ? null : zBench + 1.5,
      observedOut, observedPct: observedOut / n, loss, skew: s3,
      expectedOut,
      // Normality of the results, and therefore whether the tail figures are usable.
      normality: ad ? { stat: ad.adjusted, p: ad.p, normal: ad.normal, note: ad.note || null } : null,
      tailsUsable,
      verdict: key === null || key === undefined ? null : key >= 1.67 ? 'excellent' : key >= 1.33 ? 'capable' : key >= 1 ? 'marginal' : 'not capable',
      centeredCpk: lsl !== null && usl !== null && (sW || sO) ? (usl - lsl) / (6 * (sW || sO)) : null,
      sigmaFor133: lsl !== null && usl !== null ? (usl - lsl) / 8 : null
    };
  }

  /* Individuals and moving-range chart limits, with two classic signals:
     a point beyond 3 sigma, and 8 points in a row on one side of the center line. */
  /* Sensitivity is a choice, and it is the user's.

     The conservative chart is the control limits plus the moving-range limit: measured on
     3,000 in-control series it raises a false signal about once every 103 points. The
     3-sigma rule on its own measures once every 367, which is the textbook 370 - the
     difference is the moving-range chart, which is a second chart and fires on its own
     account. The number reported is for what the mode actually does rather than for the
     part of it with the nicer figure.

     Turning on all eight rules catches shifts and drifts a limits-only chart is blind to -
     on a 0.9-sigma shift the limits chart raises one signal and the full set raises
     twenty-five - and costs about one false signal every 50 points.

     On a fifty-run chart that is roughly one false signal expected per chart. Fine if you
     know it, badly misleading if you do not, so the number is reported beside the signals
     rather than left for somebody to discover by investigating noise. */
  const RULE_COST = { limits: 103, all: 50 };

  function imr(y, opt) {
    opt = opt || {};
    const useAll = opt.rules !== 'limits';
    const mrs = [null]; for (let i = 1; i < y.length; i++) mrs.push(Math.abs(y[i] - y[i - 1]));
    const mrBar = mean(mrs.slice(1)), cl = mean(y);
    const ucl = cl + 2.66 * mrBar, lcl = cl - 2.66 * mrBar, mrUcl = 3.267 * mrBar;
    /* The full Nelson set, not three of it.

       Rule 1 catches a point so far out it cannot be chance. The other seven catch the
       thing a limits-only chart is blind to: a process that has shifted or drifted while
       every individual point stays inside the lines. A slow drift toward a limit trips rule
       3 long before it trips rule 1, which is the whole reason the rules exist - by the time
       a point is beyond 3 sigma the batch is usually already made.

       Zones are the thirds of the distance from the centre line to a limit: C within one
       sigma, B between one and two, A between two and three. Sigma here comes from the
       moving range, which is the within-subgroup spread, not the standard deviation of the
       whole series - using the latter would widen the limits with the very shift the chart
       is meant to find. */
    const sigma = (ucl - cl) / 3;
    const flags = y.map(() => []);
    const zone = v => (sigma > 0 ? (v - cl) / sigma : 0);     // signed, in sigmas
    const mark = (i, why) => { if (flags[i].indexOf(why) < 0) flags[i].push(why); };
    // A rule that fires over a window marks every point in it, so the chart shows the run.
    const span = (from, to, why) => { for (let i = from; i <= to; i++) mark(i, why); };

    y.forEach((v, i) => { if (v > ucl || v < lcl) mark(i, 'beyond 3 sigma'); });

    const z = y.map(zone);
    const n = y.length;
    const sideOf = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const runRule = (len, test, why) => {
      for (let i = 0; i + len <= n; i++) {
        let ok = true;
        for (let j = 0; j < len && ok; j++) ok = test(i + j, i);
        if (ok) span(i, i + len - 1, why);
      }
    };
    // 2: nine in a row on one side of the centre line.
    if (useAll) {
    for (const s of [1, -1]) runRule(9, k => sideOf(z[k]) === s, '9 in a row on one side');
    // 3: six in a row climbing or falling.
    runRule(6, (k, i) => k === i || y[k] > y[k - 1], '6 in a row rising');
    runRule(6, (k, i) => k === i || y[k] < y[k - 1], '6 in a row falling');
    // 4: fourteen in a row alternating up and down.
    runRule(14, (k, i) => k === i || k === i + 1 || ((y[k] - y[k - 1]) * (y[k - 1] - y[k - 2]) < 0), '14 alternating');
    // 5: two of three in zone A or beyond, on one side.
    for (const s of [1, -1]) {
      for (let i = 0; i + 3 <= n; i++) {
        let c = 0;
        for (let j = 0; j < 3; j++) if (sideOf(z[i + j]) === s && Math.abs(z[i + j]) > 2) c++;
        if (c >= 2) span(i, i + 2, '2 of 3 beyond 2 sigma');
      }
    }
    // 6: four of five in zone B or beyond, on one side.
    for (const s of [1, -1]) {
      for (let i = 0; i + 5 <= n; i++) {
        let c = 0;
        for (let j = 0; j < 5; j++) if (sideOf(z[i + j]) === s && Math.abs(z[i + j]) > 1) c++;
        if (c >= 4) span(i, i + 4, '4 of 5 beyond 1 sigma');
      }
    }
    // 7: fifteen in a row inside one sigma, either side. Too good to be true, usually a
    // limit calculated from the wrong spread or data that has been smoothed.
    runRule(15, k => Math.abs(z[k]) < 1, '15 in a row hugging the centre');
    // 8: eight in a row outside one sigma, either side - a bimodal process, often two
    // shifts or two lines pooled into one chart.
    runRule(8, k => Math.abs(z[k]) > 1, '8 in a row avoiding the centre');
    }

    mrs.forEach((v, i) => { if (v !== null && v > mrUcl) mark(i, 'jump between points'); });
    const signals = flags.map((f, i) => (f.length ? { i, why: f } : null)).filter(Boolean);
    return { y, mr: mrs, cl, ucl, lcl, mrBar, mrUcl, sigma, flags, signals,
      rules: useAll ? 'all' : 'limits',
      /* How often this rule set cries wolf on a process with nothing wrong with it,
         measured on 3,000 in-control series rather than quoted. */
      falseAlarmEvery: RULE_COST[useAll ? 'all' : 'limits'],
      expectedFalse: y.length / RULE_COST[useAll ? 'all' : 'limits'],
      // The zone boundaries, so a chart can draw them rather than implying only the limits.
      zones: { a: [cl + 2 * sigma, cl + 3 * sigma], b: [cl + sigma, cl + 2 * sigma], c: [cl - sigma, cl + sigma] } };
  }

  function box(values) {
    const s = values.slice().sort((a, b) => a - b);
    const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
    const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
    const inside = s.filter(v => v >= loF && v <= hiF);
    return { n: s.length, min: s[0], max: s[s.length - 1], q1, median: med, q3, mean: mean(s), whiskerLo: inside[0], whiskerHi: inside[inside.length - 1], outliers: s.filter(v => v < loF || v > hiF) };
  }

  // Taguchi signal-to-noise ratio (dB). Higher is always better (more robust).
  function snRatio(y, type) {
    if (!y.length) return null;
    if (type === 'larger') return y.some(v => v === 0) ? null : -10 * Math.log10(mean(y.map(v => 1 / (v * v))));
    if (type === 'smaller') return -10 * Math.log10(mean(y.map(v => v * v)));
    if (y.length < 2) return null;
    const v = E.variance(y);
    return v > 0 ? 10 * Math.log10(mean(y) ** 2 / v) : null;
  }
  /* S/N and mean at every level of each factor. factors: [{ name, values: [] }] aligned
     with y. Ranks factors by how much S/N changes across their levels (delta). */
  function taguchi(y, factors, type) {
    const out = factors.map(f => {
      const levels = Array.from(new Set(f.values.filter(v => v !== null))).sort((a, b) => (typeof a === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
      const rows = levels.map(lv => {
        const ys = y.filter((_, i) => f.values[i] === lv);
        return { level: lv, n: ys.length, sn: snRatio(ys, type), mean: mean(ys) };
      }).filter(r => r.sn !== null && isFinite(r.sn));
      if (rows.length < 2) return null;
      const sns = rows.map(r => r.sn);
      const best = rows[sns.indexOf(Math.max(...sns))];
      return { name: f.name, levels: rows, delta: Math.max(...sns) - Math.min(...sns), best };
    }).filter(Boolean);
    out.sort((a, b) => b.delta - a.delta);
    out.forEach((f, i) => { f.rank = i + 1; });
    return out;
  }

  // Pass/fail quality: defect rate, defects per million, and process sigma level.
  function attribute(good, total) {
    const p = total ? (total - good) / total : 0;
    const zLT = normInv(1 - Math.min(Math.max(p, 1e-9), 1 - 1e-9));
    return { total, defects: total - good, p, yield: 1 - p, dpmo: p * 1e6, zLT, sigmaLevel: zLT + 1.5 };
  }

  root.MLSpc = { normCdf, normInv, capability, imr, box, snRatio, taguchi, attribute };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLSpc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
