/* Shelf-life estimation following ICH Q1E: fit degradation over time, test whether batches
   can be pooled, then find where the 95% one-sided confidence limit of the regression line
   meets the specification. Pure computation; no network, no storage.

   The three models ICH Q1E compares, from most to least flexible:
     A  every batch its own slope and intercept
     B  one common slope, a separate intercept per batch
     C  one line for all batches
   Batches are pooled down to the simplest model that an F test cannot reject at the 0.25
   level Q1E prescribes (a deliberately high level, so pooling has to be clearly supported).
   Where batches are not pooled, the shelf life is the shortest of the individual ones. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');

  // Upper tail of the F distribution: the chance of an F this large if the models truly agree.
  function fTestP(f, df1, df2) {
    if (!isFinite(f) || f <= 0) return 1;
    if (df1 <= 0 || df2 <= 0) return NaN;
    return E.ibeta(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
  }
  // Critical t for a one-sided tail area, by bisection on the two-sided p-value.
  function tQuantile(tail, df) {
    let lo = 0, hi = 500;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (E.tTestP(mid, df) / 2 > tail) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const sum = a => a.reduce((x, y) => x + y, 0);
  function lineFit(ts, ys) {
    const n = ts.length, tb = sum(ts) / n, yb = sum(ys) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (ts[i] - tb) ** 2; sxy += (ts[i] - tb) * (ys[i] - yb); }
    const slope = sxx ? sxy / sxx : 0, intercept = yb - slope * tb;
    let sse = 0, sst = 0;
    for (let i = 0; i < n; i++) { sse += (ys[i] - (intercept + slope * ts[i])) ** 2; sst += (ys[i] - yb) ** 2; }
    return { n, slope, intercept, tBar: tb, yBar: yb, sxx, sse, sst, r2: sst ? 1 - sse / sst : 1 };
  }

  /* data: [{ batch, time, y }]. opt: { lsl, usl, direction, poolAlpha, confidence, horizon }.
     direction: 'decreasing' (watch the lower limit), 'increasing' (upper), or 'both'. */
  function analyze(data, opt) {
    opt = opt || {};
    const asNumber = v => {
      if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
      const n = Number(v);
      return isFinite(n) ? n : null;
    };
    const rows = data.map(r => (r ? { batch: r.batch, condition: r.condition, time: asNumber(r.time), y: asNumber(r.y) } : null))
      .filter(r => r && r.time !== null && r.y !== null);
    if (rows.length < 3) throw new Error('Need at least 3 time points with a numeric result.');
    const lsl = isFinite(opt.lsl) ? Number(opt.lsl) : null;
    const usl = isFinite(opt.usl) ? Number(opt.usl) : null;
    if (lsl === null && usl === null) throw new Error('Set at least one specification limit, so there is something for the line to meet.');
    if (lsl !== null && usl !== null && lsl >= usl) throw new Error('The lower limit must be below the upper limit.');
    const poolAlpha = opt.poolAlpha || 0.25;
    const conf = opt.confidence || 0.95;

    const names = [];
    rows.forEach(r => { const b = String(r.batch === undefined || r.batch === '' ? 'All data' : r.batch); if (!names.includes(b)) names.push(b); });
    const batches = names.map(name => {
      const rs = rows.filter(r => String(r.batch === undefined || r.batch === '' ? 'All data' : r.batch) === name);
      const ts = rs.map(r => r.time), ys = rs.map(r => r.y);
      return Object.assign({ name, times: ts, ys, distinctTimes: new Set(ts).size }, lineFit(ts, ys));
    });
    const k = batches.length, n = rows.length;
    const usable = batches.filter(b => b.distinctTimes >= 2);
    if (!usable.length) throw new Error('Every batch has only one time point, so no trend can be fitted.');

    // ---------- the three models ----------
    const A = { sse: sum(batches.map(b => b.sse)), df: n - 2 * k, label: 'Separate slopes and intercepts' };
    const sxxWithin = sum(batches.map(b => b.sxx));
    const commonSlope = sxxWithin ? sum(batches.map(b => b.slope * b.sxx)) / sxxWithin : 0;
    const B = {
      slope: commonSlope, df: n - k - 1, label: 'Common slope, separate intercepts',
      sse: sum(batches.map(b => sum(b.ys.map((y, i) => (y - (b.yBar + commonSlope * (b.times[i] - b.tBar))) ** 2)))),
      intercepts: batches.map(b => b.yBar - commonSlope * b.tBar), sxx: sxxWithin
    };
    const all = lineFit(rows.map(r => r.time), rows.map(r => r.y));
    const C = Object.assign({ df: n - 2, label: 'One line for all batches' }, all);

    /* Q1E's two F tests. Each asks whether the extra parameters of the richer model earn
       their keep; a small p-value means the batches really do differ, so they stay apart. */
    const tests = [];
    let model, why;
    const canTestSlopes = k > 1 && A.df > 0;
    const pSlopes = canTestSlopes ? fTestP(((B.sse - A.sse) / (k - 1)) / (A.sse / A.df), k - 1, A.df) : null;
    if (canTestSlopes) tests.push({ name: 'Equality of slopes', f: ((B.sse - A.sse) / (k - 1)) / (A.sse / A.df), df1: k - 1, df2: A.df, p: pSlopes, alpha: poolAlpha, pass: pSlopes >= poolAlpha });
    const canTestIntercepts = k > 1 && B.df > 0;
    const pIntercepts = canTestIntercepts ? fTestP(((C.sse - B.sse) / (k - 1)) / (B.sse / B.df), k - 1, B.df) : null;

    if (k === 1) { model = 'C'; why = 'Only one batch, so there is nothing to pool.'; }
    else if (pSlopes !== null && pSlopes < poolAlpha) {
      model = 'A';
      why = 'The batches degrade at different rates (p ' + fmtP(pSlopes) + ' < ' + poolAlpha + '), so Q1E does not allow pooling. Each batch is fitted on its own and the shortest shelf life is taken.';
    } else {
      if (canTestIntercepts) tests.push({ name: 'Equality of intercepts (given a common slope)', f: ((C.sse - B.sse) / (k - 1)) / (B.sse / B.df), df1: k - 1, df2: B.df, p: pIntercepts, alpha: poolAlpha, pass: pIntercepts >= poolAlpha });
      if (pIntercepts !== null && pIntercepts < poolAlpha) {
        model = 'B';
        why = 'The batches share a degradation rate (p ' + fmtP(pSlopes) + ') but start from different levels (p ' + fmtP(pIntercepts) + ' < ' + poolAlpha + '), so they keep separate intercepts and the shortest shelf life is taken.';
      } else {
        model = 'C';
        why = 'The batches behave alike on both tests (slopes p ' + fmtP(pSlopes) + ', intercepts p ' + fmtP(pIntercepts) + '), so Q1E allows the data to be pooled into one line.';
      }
    }

    /* The confidence limit of the regression line, as a function of time. Each model has its
       own error estimate and its own standard error for the mean response. */
    const maxTime = Math.max.apply(null, rows.map(r => r.time));
    const horizon = opt.horizon || Math.max(60, Math.ceil(maxTime * 4));
    const curves = [];
    if (model === 'C') {
      const s2 = C.df > 0 ? C.sse / C.df : 0, tq = C.df > 0 ? tQuantile(1 - conf, C.df) : 0;
      curves.push(curveFor('All batches pooled', C.intercept, C.slope, s2, tq, C.n, C.tBar, C.sxx, C.df));
    } else if (model === 'B') {
      const s2 = B.df > 0 ? B.sse / B.df : 0, tq = B.df > 0 ? tQuantile(1 - conf, B.df) : 0;
      batches.forEach((b, i) => curves.push(curveFor(b.name, B.intercepts[i], commonSlope, s2, tq, b.n, b.tBar, B.sxx, B.df)));
    } else {
      batches.forEach(b => {
        const df = b.n - 2, s2 = df > 0 ? b.sse / df : 0, tq = df > 0 ? tQuantile(1 - conf, df) : 0;
        curves.push(curveFor(b.name, b.intercept, b.slope, s2, tq, b.n, b.tBar, b.sxx, df));
      });
    }

    // Which limit matters: a falling attribute is judged against the lower bound, a rising
    // one against the upper bound, and an attribute that could move either way against both.
    const dir = opt.direction || (model === 'C' ? guessDirection(C.slope) : guessDirection(commonSlope || C.slope));
    const each = curves.map(c => Object.assign({}, c, crossing(c, { lsl, usl, direction: dir, horizon })));
    const alone = batches.map(b => {
      const df = b.n - 2;
      if (df <= 0 || !b.sxx) return null;
      const c = curveFor(b.name, b.intercept, b.slope, b.sse / df, tQuantile(1 - conf, df), b.n, b.tBar, b.sxx, df);
      return crossing(c, { lsl, usl, direction: dir, horizon }).shelfLife;
    });
    const limiting = each.reduce((best, c) => (best === null || c.shelfLife < best.shelfLife ? c : best), null);

    // Q1E caps how far a shelf life may run beyond the data actually in hand.
    const allowed = Math.min(maxTime * 2, maxTime + 12);
    const shelfLife = limiting.shelfLife;
    const extrapolated = shelfLife > maxTime;
    const capped = shelfLife > allowed;

    return {
      rows, batches: batches.map((b, i) => ({ name: b.name, n: b.n, slope: b.slope, intercept: b.intercept, r2: b.r2, alone: alone[i], first: Math.min.apply(null, b.times), last: Math.max.apply(null, b.times) })),
      models: { A, B: { sse: B.sse, df: B.df, label: B.label, slope: B.slope }, C: { sse: C.sse, df: C.df, label: C.label, slope: C.slope, intercept: C.intercept } },
      tests, model, modelLabel: { A: A.label, B: B.label, C: C.label }[model], why,
      direction: dir, lsl, usl, confidence: conf, poolAlpha,
      curves: each, limiting, shelfLife, reported: Math.min(shelfLife, allowed),
      maxTime, allowed, extrapolated, capped, horizon,
      startsOutOfSpec: shelfLife === 0
    };
  }

  function curveFor(name, intercept, slope, s2, tq, nB, tBar, sxx, df) {
    const se = t => Math.sqrt(Math.max(0, s2) * (1 / nB + (sxx ? (t - tBar) ** 2 / sxx : 0)));
    return {
      name, intercept, slope, df, s: Math.sqrt(Math.max(0, s2)), tq, nB, tBar, sxx,
      fit: t => intercept + slope * t,
      lower: t => intercept + slope * t - tq * se(t),
      upper: t => intercept + slope * t + tq * se(t)
    };
  }

  const guessDirection = slope => (slope < 0 ? 'decreasing' : 'increasing');

  /* Walks forward from time zero and reports the first month at which the confidence limit
     meets the specification, refined by bisection. The band is curved, so it is swept rather
     than solved: the first crossing is what counts, whatever the shape. */
  function crossing(c, o) {
    const watchLow = o.lsl !== null && (o.direction === 'decreasing' || o.direction === 'both');
    const watchHigh = o.usl !== null && (o.direction === 'increasing' || o.direction === 'both');
    const bad = t => (watchLow && c.lower(t) <= o.lsl) || (watchHigh && c.upper(t) >= o.usl);
    if (!watchLow && !watchHigh) return { shelfLife: o.horizon, reachesSpec: false, watchLow, watchHigh };
    if (bad(0)) return { shelfLife: 0, reachesSpec: true, watchLow, watchHigh, which: watchLow && c.lower(0) <= o.lsl ? 'lower' : 'upper' };
    const steps = 4000;
    let prev = 0;
    for (let i = 1; i <= steps; i++) {
      const t = o.horizon * i / steps;
      if (bad(t)) {
        let lo = prev, hi = t;
        for (let j = 0; j < 60; j++) { const mid = (lo + hi) / 2; if (bad(mid)) hi = mid; else lo = mid; }
        return { shelfLife: lo, reachesSpec: true, watchLow, watchHigh, which: watchLow && c.lower(lo) <= o.lsl + 1e-9 ? 'lower' : 'upper' };
      }
      prev = t;
    }
    return { shelfLife: o.horizon, reachesSpec: false, watchLow, watchHigh };
  }

  const fmtP = p => (p === null || p === undefined ? '–' : p < 0.0001 ? '<0.0001' : p.toFixed(4));

  root.MLStability = { analyze, fTestP, tQuantile, lineFit, fmtP };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLStability;
})(typeof globalThis !== 'undefined' ? globalThis : this);
