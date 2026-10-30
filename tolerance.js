/* Specification setting and study sizing.

   Two questions that a development group asks constantly and usually answers by habit:
   "what limits can I defend from the batches I have?" and "how many do I need?"

   Both reduce to the same piece of arithmetic. The sample standard deviation is itself a
   random thing, and every answer here is an integral over its distribution rather than a
   formula that pretends s is sigma. That is why a tolerance interval is so much wider than
   the mean plus two standard deviations people usually reach for.

   Everything is computed locally. Nothing is uploaded or stored. */
(function (root) {
  'use strict';
  const E = root.MLEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { normCdf: Phi, normInv: zOf, normPdf: phi, lgamma, tQuantile, tTestP } = E;

  const asNumber = v => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const x = Number(s.replace(/,/g, ''));
    return isFinite(x) ? x : null;
  };
  const sum = a => a.reduce((x, y) => x + y, 0);

  /* The distribution of s/sigma. If V ~ chi-square on df, then w = sqrt(V/df) has this
     density; integrating against it is what turns "I measured an s" into a statement about
     sigma. Written in logs because df^(df/2) overflows for perfectly ordinary df. */
  function wPdf(w, df) {
    if (!(w > 0)) return 0;
    const lg = (df / 2) * Math.log(df) + (df - 1) * Math.log(w) - df * w * w / 2 - (df / 2 - 1) * Math.LN2 - lgamma(df / 2);
    return Math.exp(lg);
  }
  // Simpson's rule on a finite interval. Needs a smooth integrand to earn its accuracy.
  function simpson(a, b, f, panels) {
    const N = Math.max(2, 2 * Math.round(panels || 100));
    const h = (b - a) / N;
    if (!(h > 0)) return 0;
    let total = 0;
    for (let i = 0; i <= N; i++) {
      total += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * f(a + i * h);
    }
    return total * h / 3;
  }
  /* Where w = s/sigma actually lives. Its spread is about 1/sqrt(2 df), so for a large
     study the whole distribution sits inside a hair's breadth of 1. Integrating a fixed wide
     range instead would put the grid spacing outside the entire density and quietly return
     nonsense for big samples, which is the kind of error that shows up only in the one case
     nobody checks. Twelve standard deviations each way is past the point of numerical
     relevance, and the floor at zero keeps the skewed small-df case honest. */
  function wBounds(df) {
    const spread = 1 / Math.sqrt(2 * df);
    return [Math.max(0, 1 - 12 * spread), 1 + 12 * spread];
  }
  /* Panel counts, set from measured convergence rather than by feel. The plain integral
     needs the finer grid: at low df its tail is long, and for a very large study the
     one-sided integrand is nearly a step. The two-sided route has had its kink substituted
     away and is already at machine precision on a much coarser grid. */
  const PANELS = 300, PANELS_TWO = 120;
  /* Integrate a smooth function against the density of w. Used for the one-sided factor and
     for every power calculation, where the integrand has no kink. */
  function integrateW(df, f, panels) {
    const [lo, hi] = wBounds(df);
    return simpson(lo, hi, w => { const d = wPdf(w, df); return d > 0 ? d * f(w) : 0; }, panels || PANELS);
  }

  /* Non-central t, by the same integral. T = (Z + delta)/w, so T <= t means
     Z <= t w - delta, and averaging that over w gives the CDF. Used for power. */
  function nctCdf(t, df, delta) {
    if (!(df > 0)) return NaN;
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    return integrateW(df, w => Phi(t * w - delta));
  }

  /* Half-width, in standard deviations, that a normal interval centred d away from the mean
     needs in order to cover a proportion p: solves Phi(g + r) - Phi(g - r) = p for g.
     Returns null when r is too small to cover p however well centred the interval is. */
  function centreAllowance(r, p) {
    if (!(r > 0)) return null;
    if (2 * Phi(r) - 1 < p) return null;
    let lo = 0, hi = r + 40;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (Phi(mid + r) - Phi(mid - r) > p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* The two-sided coverage integral, with the awkward part taken out by hand.

     Below w* = z_q/k the interval is too narrow to cover p however luckily it is centred, so
     the contribution is exactly zero; just above w* the allowance grows like sqrt(w - w*).
     That kink destroys Simpson's accuracy, and silently: refining the grid makes the error
     jump around instead of shrinking. So the dead region is excluded and the square root is
     substituted away with w = w* + u^2, which leaves an integrand smooth enough to deserve
     the quadrature. */
  function twoSidedCoverage(k, n, p, panels) {
    const df = n - 1, rootN = Math.sqrt(n);
    const [lo, hi] = wBounds(df);
    const wStar = zOf((1 + p) / 2) / k;
    if (!(wStar < hi)) return 0;
    const N = panels || PANELS_TWO;
    const at = w => {
      const d = wPdf(w, df);
      if (!(d > 0)) return 0;
      const g = centreAllowance(k * w, p);
      return g === null ? 0 : d * (2 * Phi(rootN * g) - 1);
    };
    // The kink sits at wStar. When that is below the range the density reaches, there is
    // nothing to work around and the plain rule is both simpler and sharper.
    if (wStar <= lo) return simpson(lo, hi, at, N);
    const U = Math.sqrt(hi - wStar);
    return simpson(0, U, u => at(wStar + u * u) * 2 * u, N);
  }

  function toleranceFactor(n, p, conf, sided) {
    n = Math.round(n);
    if (!(n >= 2)) throw new Error('A tolerance interval needs at least 2 results, and is meaningless below about 5.');
    if (!(p > 0 && p < 1)) throw new Error('The proportion covered must be between 0 and 1.');
    if (!(conf > 0 && conf < 1)) throw new Error('The confidence must be between 0 and 1.');
    const df = n - 1, rootN = Math.sqrt(n), zp = zOf(p);
    const two = Number(sided) === 2;
    const cover = two
      ? k => twoSidedCoverage(k, n, p)
      : k => integrateW(df, w => Phi(rootN * (k * w - zp)));
    let lo = 0, hi = 2;
    while (cover(hi) < conf && hi < 1e4) hi *= 2;
    // After the doubling the bracket is within a factor of two of the answer, so this is
    // far more bisection than double precision can use.
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (cover(mid) < conf) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* Anderson-Darling test for normality, with the small-sample adjustment and the standard
     critical values. A tolerance interval leans on normality far harder than a mean or a
     confidence interval does: it is a statement about the tails, which is exactly where a
     wrong distribution bites. So it is checked and reported rather than assumed. */
  function andersonDarling(values) {
    const n = values.length;
    if (n < 8) return { n, stat: null, adjusted: null, p: null, normal: null, note: 'Too few results to test normality; below about eight the test has no power worth quoting.' };
    const x = values.slice().sort((a, b) => a - b);
    const m = sum(x) / n;
    const s = Math.sqrt(sum(x.map(v => (v - m) ** 2)) / (n - 1));
    if (!(s > 0)) return { n, stat: null, adjusted: null, p: null, normal: null, note: 'Every result is identical, so normality cannot be assessed.' };
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const lo = Math.min(1 - 1e-15, Math.max(1e-15, Phi((x[i] - m) / s)));
      const hi = Math.min(1 - 1e-15, Math.max(1e-15, Phi((x[n - 1 - i] - m) / s)));
      a2 += (2 * i + 1) * (Math.log(lo) + Math.log(1 - hi));
    }
    const stat = -n - a2 / n;
    const adjusted = stat * (1 + 0.75 / n + 2.25 / (n * n));
    // D'Agostino's piecewise fit to the adjusted statistic's null distribution.
    let pv;
    if (adjusted >= 0.6) pv = Math.exp(1.2937 - 5.709 * adjusted + 0.0186 * adjusted * adjusted);
    else if (adjusted >= 0.34) pv = Math.exp(0.9177 - 4.279 * adjusted - 1.38 * adjusted * adjusted);
    else if (adjusted >= 0.2) pv = 1 - Math.exp(-8.318 + 42.796 * adjusted - 59.938 * adjusted * adjusted);
    else pv = 1 - Math.exp(-13.436 + 101.14 * adjusted - 223.73 * adjusted * adjusted);
    pv = Math.min(1, Math.max(0, pv));
    return { n, stat, adjusted, p: pv, normal: pv >= 0.05, critical5: 0.752 };
  }

  /* A tolerance interval on real numbers, with the specification comparison that is the
     reason anyone wants one. */
  function toleranceInterval(values, opt) {
    opt = opt || {};
    const x = (values || []).map(asNumber).filter(v => v !== null);
    const n = x.length;
    if (n < 2) throw new Error('Need at least 2 numeric results.');
    const p = opt.p === undefined ? 0.99 : Number(opt.p);
    const conf = opt.conf === undefined ? 0.95 : Number(opt.conf);
    const sided = Number(opt.sided) === 1 ? 1 : 2;
    const bound = opt.bound === 'upper' ? 'upper' : opt.bound === 'lower' ? 'lower' : 'both';
    const mean = sum(x) / n;
    const sd = Math.sqrt(sum(x.map(v => (v - mean) ** 2)) / (n - 1));
    const k = toleranceFactor(n, p, conf, sided);
    const lower = sided === 2 || bound === 'lower' ? mean - k * sd : null;
    const upper = sided === 2 || bound === 'upper' ? mean + k * sd : null;
    const lsl = asNumber(opt.lsl), usl = asNumber(opt.usl);

    /* Whether the interval sits inside the specification is the whole decision: if it does,
       the data supports those limits; if it does not, the limits are wider than the process
       has earned, or there is not enough data yet to say so. */
    const insideLower = lsl === null || lower === null ? null : lower >= lsl;
    const insideUpper = usl === null || upper === null ? null : upper <= usl;
    const checks = [insideLower, insideUpper].filter(v => v !== null);
    const inside = checks.length ? checks.every(Boolean) : null;

    /* If it does not fit, how many results would it take? The factor shrinks with n while
       the mean and sd are taken as they stand, so this answers "is this a data problem or a
       process problem?" - the single most useful thing to know at this point. */
    let needed = null, achievable = null;
    if (inside === false && sd > 0) {
      const fits = m => {
        const kk = toleranceFactor(m, p, conf, sided);
        const lo = sided === 2 || bound === 'lower' ? mean - kk * sd : null;
        const up = sided === 2 || bound === 'upper' ? mean + kk * sd : null;
        return (lsl === null || lo === null || lo >= lsl) && (usl === null || up === null || up <= usl);
      };
      // The factor tends to its limiting z as n grows, so if 4000 will not do it, nothing will.
      achievable = fits(4000);
      if (achievable) {
        let lo = n, hi = 4000;
        while (lo + 1 < hi) { const mid = Math.floor((lo + hi) / 2); if (fits(mid)) hi = mid; else lo = mid; }
        needed = hi;
      }
    }
    const widthSpec = lsl !== null && usl !== null ? usl - lsl : null;
    return {
      n, mean, sd, df: n - 1, p, conf, sided, bound, k,
      lower, upper, lsl, usl, inside, insideLower, insideUpper, needed, achievable,
      min: Math.min.apply(null, x), max: Math.max.apply(null, x),
      // How much of the specification window the interval eats: the headroom, in one number.
      usedOfSpec: widthSpec && widthSpec > 0 && lower !== null && upper !== null ? (upper - lower) / widthSpec : null,
      normality: andersonDarling(x),
      // The naive interval people reach for instead, kept alongside to show the gap.
      naive: { lower: mean - 3 * sd, upper: mean + 3 * sd, k: 3 },
      limitingK: sided === 2 ? zOf((1 + p) / 2) : zOf(p),
      values: x
    };
  }

  // ---------- power and sample size ----------
  /* Power for a two-sided t-test. Exact, through the non-central t above, rather than the
     normal approximation that quietly overstates power at the sample sizes people run. */
  function tPower(df, tCrit, delta, sided) {
    if (Number(sided) === 1) return 1 - nctCdf(tCrit, df, delta);
    return 1 - nctCdf(tCrit, df, delta) + nctCdf(-tCrit, df, delta);
  }
  function powerOneSample(opt) {
    const n = Math.round(opt.n), sd = Number(opt.sd), delta = Number(opt.delta);
    const alpha = opt.alpha === undefined ? 0.05 : Number(opt.alpha);
    const sided = Number(opt.sided) === 1 ? 1 : 2;
    if (!(n >= 2)) throw new Error('Need at least 2 results.');
    if (!(sd > 0)) throw new Error('The standard deviation must be above zero.');
    const df = n - 1;
    const tCrit = tQuantile(sided === 1 ? alpha : alpha / 2, df);
    return { n, df, power: tPower(df, tCrit, delta / sd * Math.sqrt(n), sided), tCrit, ncp: delta / sd * Math.sqrt(n), alpha, sided };
  }
  function powerTwoSample(opt) {
    const n = Math.round(opt.n), sd = Number(opt.sd), delta = Number(opt.delta);
    const alpha = opt.alpha === undefined ? 0.05 : Number(opt.alpha);
    const sided = Number(opt.sided) === 1 ? 1 : 2;
    if (!(n >= 2)) throw new Error('Need at least 2 results per group.');
    if (!(sd > 0)) throw new Error('The standard deviation must be above zero.');
    const df = 2 * n - 2;
    const tCrit = tQuantile(sided === 1 ? alpha : alpha / 2, df);
    const ncp = delta / (sd * Math.sqrt(2 / n));
    return { n, perGroup: n, total: 2 * n, df, power: tPower(df, tCrit, ncp, sided), tCrit, ncp, alpha, sided };
  }
  /* Power to SHOW EQUIVALENCE by two one-sided tests. Both tests must pass, which is a joint
     statement about the estimate and its standard error, so it is integrated over s rather
     than taken as the product of two one-sided powers. */
  function powerTost(opt) {
    const n = Math.round(opt.n), sd = Number(opt.sd);
    const margin = Math.abs(Number(opt.margin));
    const diff = Number(opt.diff || 0);
    const alpha = opt.alpha === undefined ? 0.05 : Number(opt.alpha);
    const paired = !!opt.paired;
    if (!(n >= 2)) throw new Error('Need at least 2 results per method.');
    if (!(sd > 0)) throw new Error('The standard deviation must be above zero.');
    if (!(margin > 0)) throw new Error('The equivalence margin must be above zero.');
    const df = paired ? n - 1 : 2 * n - 2;
    const seUnits = paired ? sd / Math.sqrt(n) : sd * Math.sqrt(2 / n);
    const tCrit = tQuantile(alpha, df);
    const A = (margin - diff) / seUnits, B = (margin + diff) / seUnits;
    const power = integrateW(df, w => Math.max(0, Phi(A - tCrit * w) - Phi(tCrit * w - B)));
    return { n, df, power: Math.min(1, Math.max(0, power)), margin, diff, sd, alpha, paired, tCrit, seUnits };
  }
  // Smallest n reaching the target power. Each of these is monotone in n, so a scan is safe.
  function sampleSize(fn, opt, target, max) {
    const want = target === undefined ? 0.8 : Number(target);
    if (!(want > 0 && want < 1)) throw new Error('The target power must be between 0 and 1.');
    const cap = max || 5000;
    let lo = 2, hi = null;
    for (let n = 2; n <= cap; n = n < 40 ? n + 1 : Math.ceil(n * 1.3)) {
      if (fn(Object.assign({}, opt, { n })).power >= want) { hi = n; break; }
      lo = n;
    }
    if (hi === null) return { n: null, power: fn(Object.assign({}, opt, { n: cap })).power, capped: cap };
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fn(Object.assign({}, opt, { n: mid })).power >= want) hi = mid; else lo = mid;
    }
    const at = fn(Object.assign({}, opt, { n: hi }));
    return { n: hi, power: at.power, detail: at, capped: null };
  }
  const sampleSizeOneSample = (opt, target) => sampleSize(powerOneSample, opt, target);
  const sampleSizeTwoSample = (opt, target) => sampleSize(powerTwoSample, opt, target);
  const sampleSizeTost = (opt, target) => sampleSize(powerTost, opt, target);

  // A power curve for charting: power against sample size, at the settings given.
  function powerCurve(fn, opt, from, to, steps) {
    const out = [];
    const a = Math.max(2, Math.round(from || 2)), b = Math.max(a + 1, Math.round(to || 60));
    const step = Math.max(1, Math.round((b - a) / (steps || 30)));
    for (let n = a; n <= b; n += step) out.push({ n, power: fn(Object.assign({}, opt, { n })).power });
    return out;
  }


  /* ---------- A tolerance bound that assumes no distribution at all ----------

     The factors above lean hard on normality, and the Anderson-Darling test above exists
     because of it. But a failed test leaves a QC group with nothing to report, which is an
     honest dead end and still a dead end: "this data cannot support that limit" does not
     help somebody who has to write a specification this week.

     Order statistics give the way out. If you sort the results and quote the largest one as
     the limit, the share of the population below it is not unknown - it follows a Beta
     distribution that depends only on n, whatever the measurements themselves are
     distributed like. Skewed, bimodal, bounded at zero, it does not matter, because the
     only thing used is the ranking.

     What it costs is sample size, and the cost is steep. The coverage below the j-th
     smallest of n results is Beta(j, n-j+1), so the confidence that it sits above the
     p-quantile is a binomial tail:

         gamma = P(Binomial(n, p) <= j-1)

     Take the largest observation, j = n, and that collapses to 1 - p^n. For 99% coverage at
     95% confidence this needs n >= 299, against about 10 for the normal-theory factor. That
     is the real trade: the normal factor buys a limit from 10 results by assuming a shape,
     and this one assumes nothing and asks for 299. Both numbers are reported so the choice
     is made with open eyes rather than by whichever test happened to pass. */

  // P(Binomial(n, p) <= k), summed in log space so large n does not overflow.
  function binomCdf(k, n, p) {
    if (k < 0) return 0;
    if (k >= n) return 1;
    if (p <= 0) return 1;
    if (p >= 1) return 0;
    let lc = 0, total = 0;
    const lp = Math.log(p), lq = Math.log1p(-p);
    for (let i = 0; i <= k; i++) {
      if (i > 0) lc += Math.log((n - i + 1) / i);
      total += Math.exp(lc + i * lp + (n - i) * lq);
    }
    return Math.min(1, total);
  }

  /* The smallest n whose most extreme observations can carry the claim at all.
     One-sided uses the single most extreme value; two-sided uses the min and the max, whose
     joint coverage is 1 - p^n - n(1-p)p^(n-1). */
  function nonParametricN(p, conf, sided) {
    const reach = n => (sided === 2
      ? 1 - Math.pow(p, n) - n * (1 - p) * Math.pow(p, n - 1)
      : 1 - Math.pow(p, n));
    let n = 2;
    while (n < 200000 && reach(n) < conf) n++;
    return n >= 200000 ? null : n;
  }

  /* A bound from the ranking alone. Returns the most extreme usable order statistic, how
     much confidence it actually achieves, and - when the data cannot reach the claim - how
     many results would. */
  function nonParametric(values, p, conf, sided) {
    const xs = (values || []).map(Number).filter(v => isFinite(v)).sort((a, b) => a - b);
    const n = xs.length;
    const need = nonParametricN(p, conf, sided);
    const out = { n, p, conf, sided, nNeeded: need, lower: null, upper: null, rank: null, achieved: null, achievable: false, distributionFree: true };
    if (n < 2) { out.note = 'Two results cannot bound anything without assuming a shape.'; return out; }
    if (sided === 2) {
      // Depth k from each end: coverage between x(k) and x(n+1-k) is Beta(n+1-2k, 2k).
      for (let k = Math.floor(n / 2); k >= 1; k--) {
        const g = binomCdf(n - 2 * k, n, p);
        if (g >= conf) {
          out.rank = k; out.achieved = g; out.achievable = true;
          out.lower = xs[k - 1]; out.upper = xs[n - k];
          break;
        }
      }
      if (!out.achievable) out.achieved = 1 - Math.pow(p, n) - n * (1 - p) * Math.pow(p, n - 1);
    } else {
      for (let j = n; j >= 1; j--) {
        const g = binomCdf(j - 1, n, p);
        if (g >= conf) {
          out.rank = n - j + 1; out.achieved = g;
          out.achievable = true;
          out.upper = xs[j - 1];
          out.lower = xs[n - j];   // the mirror bound, for a lower one-sided claim
          break;
        }
      }
      if (!out.achievable) out.achieved = 1 - Math.pow(p, n);
    }
    if (!out.achievable) {
      out.note = 'With ' + n + ' result' + (n === 1 ? '' : 's') + ', the most extreme value reaches only ' +
        (out.achieved * 100).toFixed(1) + '% confidence of covering ' + (p * 100).toFixed(1) + '% of production' +
        (need ? ', and ' + need + ' results would be needed for ' + Math.round(conf * 100) + '%' : '') +
        '. No distribution was assumed, so this is the floor rather than a modelling choice.';
    }
    return out;
  }

  root.MLTolerance = {
    toleranceFactor, toleranceInterval, andersonDarling, nonParametric, nonParametricN, binomCdf, nctCdf, wPdf, wBounds, integrateW, simpson, centreAllowance, twoSidedCoverage,
    powerOneSample, powerTwoSample, powerTost,
    sampleSizeOneSample, sampleSizeTwoSample, sampleSizeTost, powerCurve
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLTolerance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
