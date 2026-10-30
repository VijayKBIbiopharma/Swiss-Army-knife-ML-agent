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


  /* ---------- Capability when the data is not bell-shaped ----------

     Withholding the tail figures, which is what happens above when Anderson-Darling fails,
     is correct and is still a dead end: a QC group that has to write a specification this
     week is left with Cp, Cpk and a count. There is a standard way out that does not
     require pretending - transform the measurements to a scale where the shape IS normal,
     transform the specification limits the same way, and compute the tail there.

     Box-Cox picks the power that makes the transformed data as normal as possible, by
     maximising the profile likelihood over lambda. The crucial discipline is that
     normality is then TESTED AGAIN on the transformed values, and the figures are still
     withheld if the transform did not fix it. A transform that failed is not a licence to
     report; impurity data with a hard floor at zero and a long right tail is usually fixed
     by lambda near 0, which is the log, and a bimodal distribution is not fixed by any
     lambda at all, because no power of a two-humped variable is bell-shaped.

     The transform is monotone increasing for every lambda, so the limits keep their order
     and the probability below a limit is preserved exactly - which is what makes the tail
     figure in the transformed space the right answer in the original one. */
  function boxCoxLambda(values) {
    const xs = values.filter(v => isFinite(v) && v > 0);
    const n = xs.length;
    if (n < 8 || n !== values.length) return null;
    const sumLog = xs.reduce((a, x) => a + Math.log(x), 0);
    const at = lam => {
      const ys = Math.abs(lam) < 1e-9 ? xs.map(Math.log) : xs.map(x => (Math.pow(x, lam) - 1) / lam);
      const m = mean(ys);
      let v = 0;
      for (const y of ys) v += (y - m) * (y - m);
      v /= n;
      if (!(v > 0)) return -Infinity;
      return -(n / 2) * Math.log(v) + (lam - 1) * sumLog;
    };
    let best = null, bestLL = -Infinity;
    for (let lam = -5; lam <= 5.0001; lam += 0.01) {
      const ll = at(lam);
      if (ll > bestLL) { bestLL = ll; best = lam; }
    }
    if (best === null) return null;
    return { lambda: Math.round(best * 100) / 100, loglik: bestLL };
  }
  const bcApply = (x, lam) => (Math.abs(lam) < 1e-9 ? Math.log(x) : (Math.pow(x, lam) - 1) / lam);

  /* Returns the tail figures computed on the transformed scale, or an honest reason why
     there are none. Called by capability when the raw data fails its normality test. */
  function nonNormalTail(y, lsl, usl) {
    if (y.some(v => !(v > 0))) {
      return { usable: false, why: 'Box-Cox needs every result above zero, and this data contains zero or negative values. A shift would make it apply, but the size of the shift is a judgement the tool should not make for you.' };
    }
    const bc = boxCoxLambda(y);
    if (!bc) return { usable: false, why: 'Not enough results to fit a transform worth trusting.' };
    const lam = bc.lambda;
    if (lsl !== null && !(lsl > 0)) {
      return { usable: false, lambda: lam, why: 'The lower specification limit is at or below zero, which the transform cannot carry, so a two-sided tail figure is not available on this scale.' };
    }
    const t = y.map(v => bcApply(v, lam));
    const TOL = tolerance();
    const ad = TOL && TOL.andersonDarling ? TOL.andersonDarling(t) : null;
    const normalNow = ad ? ad.normal : null;
    const m = mean(t), s = sd(t);
    const tl = lsl !== null ? bcApply(lsl, lam) : null;
    const tu = usl !== null ? bcApply(usl, lam) : null;
    const pBelow = tl !== null && s > 0 ? normCdf((tl - m) / s) : 0;
    const pAbove = tu !== null && s > 0 ? 1 - normCdf((tu - m) / s) : 0;
    const pOut = pBelow + pAbove;
    const zBench = pOut <= 0 || pOut >= 1 ? null : -normInv(pOut);
    return {
      usable: normalNow === true,
      lambda: lam, label: lam === 0 ? 'log' : lam === 1 ? 'none needed' : 'x^' + lam,
      normality: ad ? { stat: ad.adjusted, p: ad.p, normal: ad.normal, note: ad.note || null } : null,
      pBelow, pAbove, ppm: pOut * 1e6, zBench, sigmaLevel: zBench === null ? null : zBench + 1.5,
      why: normalNow === true
        ? 'A Box-Cox transform at lambda ' + lam + ' brings this data to a shape the normal tail figures can be read from, and normality was re-tested on the transformed values rather than assumed. Cp and Cpk stay as computed on your actual measurements, since they are ratios and need no shape.'
        : normalNow === false
          ? 'A Box-Cox transform at lambda ' + lam + ' was fitted and the transformed values still fail the normality test, so the tail figures stay withheld. No power of a two-humped or mixed distribution is bell-shaped, and a transform that did not work is not a licence to report.'
          : 'The transform was fitted but normality could not be tested on the result.'
    };
  }

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
      /* Only fitted when the raw data failed. On data that passed, a transform would be
         solving a problem that is not there, and reporting two sets of tail figures invites
         picking the friendlier one. */
      nonNormal: tailsUsable === false ? nonNormalTail(y, lsl, usl) : null,
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


  /* ---------- Charts for things you count ----------

     The I-MR chart above is built for measurements: a titer, a pH, a purity. A great deal of
     quality data is not measured but counted - particles in a vial, vials rejected at
     inspection, deviations in a month, colonies on a plate - and running a counted series
     through a measurement chart gets the limits wrong, because the spread of a count is not
     free to be anything: a Poisson count's standard deviation is the square root of its own
     mean, and a proportion's depends on how many units were looked at.

       c   defects per constant opportunity   particles per vial, deviations per month
       u   defects per unit, varying size     particles per mL, deviations per 1000 batches
       p   proportion of units defective      share of vials rejected at inspection

     And then the part that matters more than the choice between them. The textbook limits
     above assume the counts really are Poisson or binomial - that every vial has the same
     underlying rate. Real counts almost never do: particles cluster by batch, by stopper
     lot, by shift, so the rate itself moves and the observed spread is wider than the
     square-root law allows. That is overdispersion, and a chart that ignores it draws
     limits far too tight and then fires constantly at a process that is behaving.

     So dispersion is measured rather than assumed, and reported. If the counts are wider
     than the model allows, Laney's correction is applied: standardise every point, take the
     spread of that standardised series from its average moving range - deliberately, since
     a moving range is barely moved by the shifts the chart exists to find - and widen the
     limits by it. When the counts really are Poisson that factor comes out near 1 and the
     chart is the textbook one, so the correction costs nothing when it is not needed. Both
     sets of limits are returned, with a recommendation, because a reader deserves to see
     how much of the alarm was the chart. */
  const LANEY_D2 = 1.128;   // E[moving range] / sigma for a pair of normal draws

  function countChart(counts, opt) {
    opt = opt || {};
    const y = (counts || []).map(v => (num(v) ? Number(v) : null));
    if (y.some(v => v === null)) throw new Error('Every point must be a number. A missing count is not a zero: leave the period out rather than calling it zero defects.');
    if (y.some(v => v < 0 || v !== Math.round(v))) throw new Error('Counts must be whole numbers and cannot be negative. If these are measurements rather than counts, use the I-MR chart instead.');
    const m = y.length;
    if (m < 8) throw new Error('Need at least 8 points to set limits worth drawing. Below that the limits move more than the process does.');

    let units = null;
    if (opt.units) {
      units = opt.units.map(v => (num(v) ? Number(v) : null));
      if (units.length !== m) throw new Error('Got ' + m + ' counts but ' + units.length + ' opportunity sizes. There must be one size per point.');
      if (units.some(v => v === null || v <= 0)) throw new Error('Every opportunity size must be a positive number: how many units were inspected, or how much material was looked at.');
    }
    let kind = opt.kind || (units ? 'u' : 'c');
    if (kind === 'p' && !units) throw new Error('A p-chart needs how many units were inspected at each point, or a proportion cannot be formed.');
    if (kind === 'p' && y.some((v, i) => v > units[i])) throw new Error('A p-chart counts defective units, so a count cannot exceed the number inspected. If a unit can hold several defects, this is a u-chart.');
    if (kind === 'c' && units && !units.every(u => u === units[0])) throw new Error('These opportunity sizes are not all the same, so a c-chart cannot apply. Use a u-chart, whose limits move with the size.');

    const total = y.reduce((a, b) => a + b, 0);
    const totalUnits = units ? units.reduce((a, b) => a + b, 0) : m;
    let centre, sigmaAt, plotted;
    if (kind === 'c') {
      centre = total / m;
      plotted = y.slice();
      sigmaAt = () => Math.sqrt(centre);
    } else if (kind === 'u') {
      centre = total / totalUnits;
      plotted = y.map((v, i) => v / units[i]);
      sigmaAt = i => Math.sqrt(centre / units[i]);
    } else {
      centre = total / totalUnits;
      plotted = y.map((v, i) => v / units[i]);
      sigmaAt = i => Math.sqrt(centre * (1 - centre) / units[i]);
    }
    /* A centre of zero means nothing ever happened. The limits collapse onto zero and the
       chart would flag the first event that ever occurs as a signal, which is arithmetic
       rather than evidence. */
    if (!(centre > 0)) {
      return { kind, n: m, centre: 0, plotted, sigma: plotted.map(() => 0), lower: plotted.map(() => 0), upper: plotted.map(() => 0),
        dispersion: null, overdispersed: false, laney: null, signals: [], use: kind,
        why: 'Not one defect in ' + m + ' points, so there is no rate to set limits around. The chart starts meaning something once something has happened.' };
    }

    const sigma = plotted.map((_, i) => sigmaAt(i));
    const clampHi = v => (kind === 'p' ? Math.min(1, v) : v);
    const lower = sigma.map(s => Math.max(0, centre - 3 * s));
    const upper = sigma.map(s => clampHi(centre + 3 * s));

    /* Dispersion: the average squared standardised distance from centre. Poisson or
       binomial counts put this at 1. Above it, the rate itself is moving. */
    const z = plotted.map((v, i) => (v - centre) / sigma[i]);
    const phi = z.reduce((a, b) => a + b * b, 0) / (m - 1);

    const mrs = [];
    for (let i = 1; i < m; i++) mrs.push(Math.abs(z[i] - z[i - 1]));
    const sigmaZ = mrs.length ? mean(mrs) / LANEY_D2 : 1;
    /* Only ever used to widen. A sigmaZ below 1 says the counts are tighter than the model
       allows, which is a real thing - stratified or over-controlled data - but tightening
       limits on it would manufacture signals, so the textbook limits stand as the floor. */
    const factor = Math.max(1, sigmaZ);
    const lowerP = sigma.map(s => Math.max(0, centre - 3 * s * factor));
    const upperP = sigma.map(s => clampHi(centre + 3 * s * factor));

    const findSignals = (lo, hi) => {
      const out = [];
      for (let i = 0; i < m; i++) {
        if (plotted[i] > hi[i]) out.push({ i, value: plotted[i], count: y[i], side: 'above', limit: hi[i] });
        else if (plotted[i] < lo[i]) out.push({ i, value: plotted[i], count: y[i], side: 'below', limit: lo[i] });
      }
      return out;
    };
    const signals = findSignals(lower, upper);
    const signalsP = findSignals(lowerP, upperP);

    const overdispersed = phi > 1.5 && factor > 1.1;
    const prime = kind + '-prime';
    return {
      kind, n: m, centre, plotted, sigma, lower, upper, signals,
      units: units ? units.slice() : null, counts: y.slice(), total,
      dispersion: phi, overdispersed, sigmaZ, factor,
      laney: { kind: prime, sigmaZ, factor, lower: lowerP, upper: upperP, signals: signalsP },
      use: overdispersed ? prime : kind,
      why: overdispersed
        ? 'These counts vary ' + phi.toFixed(1) + ' times as much as a ' + (kind === 'p' ? 'binomial' : 'Poisson') + ' model allows, so the rate itself is moving between points - clustering by lot, line or shift. The textbook limits would flag ' +
          signals.length + ' of ' + m + ' points; widened for that extra spread, ' + signalsP.length + ' remain. Read the widened chart, and treat the difference as a question about what the clusters are rather than as signals.'
        : 'Dispersion measures ' + phi.toFixed(2) + ', so these counts behave as a ' + (kind === 'p' ? 'binomial' : 'Poisson') + ' model expects and the textbook limits hold. The widened limits were computed too and change nothing worth reading.'
    };
  }

  root.MLSpc = { normCdf, normInv, capability, imr, countChart, boxCoxLambda, nonNormalTail, box, snRatio, taguchi, attribute };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLSpc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
