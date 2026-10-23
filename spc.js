/* Six Sigma and process-control statistics: capability (Cp, Cpk, Pp, Ppk, Cpm, Z.bench,
   PPM), I-MR control charts, box-plot summaries, Taguchi signal-to-noise and quality loss,
   and defect rate / DPMO / sigma level for pass-fail data. Pure computation; no network,
   no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');
  const { mean, sd, quantile } = E;

  // Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7).
  function normCdf(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  // Inverse standard normal CDF (Acklam's algorithm, relative error below 1.2e-9).
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425;
    if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
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
    const key = w.Cpk ?? o.Ppk ?? null;
    return {
      n, mean: m, sdOverall: sO, sdWithin: sW, lsl, usl, target: T, mrBar,
      // Missing indices are null (never undefined), so callers can test with === null.
      Cp: w.Cp ?? null, Cpk: w.Cpk ?? null, Cpu: w.Cpu ?? null, Cpl: w.Cpl ?? null, Pp: o.Pp ?? null, Ppk: o.Ppk ?? null, Cpm: cpm,
      pBelow, pAbove, ppm: pOut * 1e6, zBench, sigmaLevel: zBench === null ? null : zBench + 1.5,
      observedOut, observedPct: observedOut / n, loss, skew: s3,
      verdict: key === null || key === undefined ? null : key >= 1.67 ? 'excellent' : key >= 1.33 ? 'capable' : key >= 1 ? 'marginal' : 'not capable',
      centeredCpk: lsl !== null && usl !== null && (sW || sO) ? (usl - lsl) / (6 * (sW || sO)) : null,
      sigmaFor133: lsl !== null && usl !== null ? (usl - lsl) / 8 : null
    };
  }

  /* Individuals and moving-range chart limits, with two classic signals:
     a point beyond 3 sigma, and 8 points in a row on one side of the center line. */
  function imr(y) {
    const mrs = [null]; for (let i = 1; i < y.length; i++) mrs.push(Math.abs(y[i] - y[i - 1]));
    const mrBar = mean(mrs.slice(1)), cl = mean(y);
    const ucl = cl + 2.66 * mrBar, lcl = cl - 2.66 * mrBar, mrUcl = 3.267 * mrBar;
    const flags = y.map(() => []);
    y.forEach((v, i) => { if (v > ucl || v < lcl) flags[i].push('beyond limits'); });
    let run = 0, side = 0;
    y.forEach((v, i) => {
      const s = v > cl ? 1 : v < cl ? -1 : 0;
      run = s && s === side ? run + 1 : s ? 1 : 0; side = s;
      if (run >= 8) flags[i].push('8 in a row on one side');
    });
    mrs.forEach((v, i) => { if (v !== null && v > mrUcl) flags[i].push('jump between points'); });
    const signals = flags.map((f, i) => (f.length ? { i, why: f } : null)).filter(Boolean);
    return { y, mr: mrs, cl, ucl, lcl, mrBar, mrUcl, flags, signals };
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
