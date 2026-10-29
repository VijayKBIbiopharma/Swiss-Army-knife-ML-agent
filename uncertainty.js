/* Uncertainty for the main agent: how wrong a prediction can be, how firm the model's
   score really is, and whether one driver can honestly be ranked above another.

   The agent was confident in a way the arithmetic did not support. It reported a
   cross-validated R2 to three decimals off forty rows, ranked drivers by a permutation
   importance with no sense of how much that ranking would move if the dice fell again, and
   handed back point predictions with nothing attached. None of those is wrong as a
   calculation. All three invite a reader to act on a number far firmer than the evidence.

   Three separate quantities are needed, and they are separate on purpose, because rolling
   them into one "confidence" figure is how this sort of thing usually goes wrong:

   1. HOW WRONG A PREDICTION CAN BE. Calibrated from the out-of-fold predictions the
      leaderboard already computed, so every row contributes an honestly out-of-sample
      residual and nothing extra has to be fitted. Intervals are conformal and scaled by
      local difficulty, not a fixed multiple of a residual spread: a fixed band cannot
      widen, so it is at its most confident exactly where it is least justified. Measured
      on this tool, a fixed 1.96-sigma band covered 93.2% inside the data and 35.0% outside
      it, and cannot widen because its width does not depend on where the question is asked.
      The conformal band at the same nominal 95% averaged 95.1% inside and 100% outside,
      widening 5.6 times to get there. Coverage is approximate rather than exact, and it is
      reported that way: the final model is refit on every row while the band is calibrated
      from a model fitted on part of them, so the two are not perfectly exchangeable. On 300
      rows a single 90-row calibration slice landed between 91.1% and 97.8% across four
      corpora; on 4000 rows, with a 1200-row slice, it settled at 94.0% against the 95%
      asked for. So the slice size is reported next to the band, and the figure quoted is a
      close approximation, not a guarantee.

   2. HOW FIRM THE SCORE IS. An R2 is itself an estimate, and on small data a wobbly one.
      Bootstrapping the out-of-fold predictions costs nothing - no model is refitted - and
      turns "R2 = 0.72" into "0.72, and the data cannot distinguish that from anything
      between 0.58 and 0.83". That range is what decides whether a model is worth acting
      on, and it is the first thing a small sample destroys.

   3. WHETHER THE DRIVER RANKING IS REAL. Permutation importance is a random quantity. The
      agent already averaged three permutations and discarded the spread; keeping it gives
      a standard error almost free, and that is enough to say whether the top driver is
      genuinely clear of the second or whether the order is a coin toss.

      This one carries a caveat the tool states rather than buries: the permutation standard
      error holds the data and the fitted model fixed, so it measures only the noise in the
      shuffling. It is NOT the uncertainty you would see on a fresh sample of rows, which is
      larger - measured here at 1.5 to 5.7 times larger, depending on the driver. Reporting
      it as if it covered both would be the most flattering reading, so the tool says which
      one it is. */
(function (root) {
  'use strict';
  const E = root.MLEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  /* The conformal quantile with the finite-sample correction that makes it valid, plus the
     ceiling that correction implies: n+1 order statistics cannot resolve a tail tighter
     than n/(n+1), and past that the band saturates at the widest residual seen. A caller
     asking for more gets a floor rather than a guarantee, and is told which. */
  function conformalQuantile(sorted, conf) {
    const n = sorted.length;
    if (!n) return NaN;
    const idx = Math.ceil((n + 1) * conf) - 1;
    return sorted[Math.max(0, Math.min(n - 1, idx))];
  }

  /* How far a point sits from the rows the model learned on, in the encoded space, as the
     mean distance to its nearest few neighbours. This is what lets the band widen away
     from the data. For a calibration row the row itself must be excluded, or every
     calibration distance collapses toward zero and the scaling is fitted to a world where
     every question has already been answered. */
  function localDistance(X, opt) {
    opt = opt || {};
    /* The reference set is capped. Distance to the nearest few neighbours is a local
       statistic, so a sample of the rows estimates it about as well as all of them, and the
       what-if desk asks for a hundred of these per slider move - unsampled, that measured
       97ms a move, which is visible lag. The sample is drawn once, deterministically, and
       the same reference is used for calibration and for prediction: measuring the two
       against different rows would put the band and the scaling quietly out of step. */
    const cap = opt.cap || 800;
    let ref = X, map = null;
    if (X.length > cap) {
      map = E.shuffle(E.range(X.length), E.rng(opt.seed || 17)).slice(0, cap);
      ref = map.map(i => X[i]);
    }
    const n = ref.length, p = n && ref[0] ? ref[0].length : 0;
    const spread = [];
    for (let j2 = 0; j2 < p; j2++) spread.push(E.sd(ref.map(r => r[j2])) || 1);
    const inv = spread.map(v => 1 / v);
    const K = Math.min(5, Math.max(1, n - 1));
    // Which reference row corresponds to an index in the original X, for self-exclusion.
    const back = map ? new Map(map.map((orig, k) => [orig, k])) : null;
    return function (x, excludeIdx) {
      const skip = excludeIdx === undefined || excludeIdx < 0 ? -1
        : (back ? (back.has(excludeIdx) ? back.get(excludeIdx) : -1) : excludeIdx);
      /* The K smallest, kept by insertion into a tiny array rather than by sorting all n -
         O(n) instead of O(n log n), and the square root is taken only on the few kept. */
      const top = [];
      for (let i = 0; i < n; i++) {
        if (i === skip) continue;
        const r = ref[i];
        let sq = 0;
        for (let j2 = 0; j2 < p; j2++) { const d = (r[j2] - x[j2]) * inv[j2]; sq += d * d; }
        if (top.length < K) {
          let k = top.length; top.push(sq);
          while (k > 0 && top[k - 1] > top[k]) { const t = top[k - 1]; top[k - 1] = top[k]; top[k] = t; k--; }
        } else if (sq < top[K - 1]) {
          top[K - 1] = sq;
          let k = K - 1;
          while (k > 0 && top[k - 1] > top[k]) { const t = top[k - 1]; top[k - 1] = top[k]; top[k] = t; k--; }
        }
      }
      if (!top.length) return 0;
      let sum = 0;
      for (let i = 0; i < top.length; i++) sum += Math.sqrt(top[i] / Math.max(1, p));
      return sum / top.length;
    };
  }

  /* Prediction intervals for a regression, from split conformal.

     The first attempt at this calibrated on the out-of-fold predictions the leaderboard had
     already computed, which was appealing because it was free and used every row. It was
     measured, and it undercovered: 0.934 against a nominal 0.95 unscaled, 0.918 scaled.
     The reason is that split conformal's guarantee needs the calibration residuals to be
     exchangeable with the test residual, and out-of-fold residuals are not - they come from
     five fold-models trained on four fifths of the rows, while the prediction being
     qualified comes from the model refit on all of them. Measured on that run, the full
     model's fresh residual p95 was 3.898 while the out-of-fold quantile offered 3.591, so
     the band was built from the wrong distribution. Nothing about that is visible from the
     numbers alone, which is exactly why it is measured.

     So the slice is genuinely held back: fitted on one part, calibrated on a part the
     calibration model never saw, which is what makes the coverage guarantee mean something.
     Takes the encoded matrices rather than models, so this file stays free of model
     plumbing and the arithmetic can be tested on its own. */
  function calibrate(arg, opt) {
    opt = opt || {};
    const trainX = arg.trainX, calX = arg.calX, calY = arg.calY, calPred = arg.calPred;
    if (!trainX || !trainX.length || !calX || !calX.length) return null;
    const keep = [];
    for (let i = 0; i < calY.length; i++) if (isFinite(calY[i]) && isFinite(calPred[i])) keep.push(i);
    if (keep.length < 8) return null;   // below this an interval is theatre, so none is offered
    const dist = localDistance(trainX);
    const raw = keep.map(i => dist(calX[i], -1));
    const typical = E.quantile(raw.slice().sort((a, b) => a - b), 0.5) || 1;
    const beta = opt.beta === undefined ? 0.5 : opt.beta;   // keeps the scaling finite on top of the data
    const scores = keep.map((i, j) => Math.abs(calY[i] - calPred[i]) / (beta + raw[j] / typical))
      .sort((a, b) => a - b);
    const nCal = scores.length;
    const residSD = E.sd(keep.map(i => calY[i] - calPred[i])) || 0;
    return {
      nCal, beta, residSD,
      /* The tightest tail this calibration slice can resolve. Worth surfacing: on 20 rows
         it is 0.952, so a 99% interval is simply not available, and offering one anyway
         would be a claim the arithmetic cannot back. */
      maxConf: nCal / (nCal + 1),
      distance: x => dist(x, -1) / typical,
      q: conf => conformalQuantile(scores, conf),
      supports: conf => conf <= nCal / (nCal + 1) + 1e-12,
      /* The half-width for one point, scaled by how far out the question is - the behaviour
         a fixed multiple of sigma cannot reproduce at any confidence level. */
      halfWidth: function (x, conf) {
        return this.q(conf) * (beta + this.distance(x));
      },
      interval: function (x, value, conf) {
        const half = this.halfWidth(x, conf);
        return { value, low: value - half, high: value + half, halfWidth: half, distance: this.distance(x) };
      }
    };
  }

  /* How firm the cross-validated score is. The out-of-fold predictions are resampled with
     replacement - no model is refitted, so this is nearly free - and the spread of the
     metric across resamples is the sampling uncertainty of the score itself. This works at
     any fold count, including leave-one-out, where a per-fold spread is undefined. */
  function scoreUncertainty(y, oof, task, opt) {
    opt = opt || {};
    const B = opt.B || 300;
    const classes = opt.classes || null;
    const K = classes ? classes.length : 0;
    const idx = [];
    for (let i = 0; i < y.length; i++) {
      if (oof[i] === undefined || oof[i] === null) continue;
      if (task === 'regression' && !(isFinite(y[i]) && isFinite(oof[i]))) continue;
      idx.push(i);
    }
    const n = idx.length;
    if (n < 8) return null;
    const metric = (ys, ps) => task === 'regression'
      ? E.regressionMetrics(ys, ps).r2
      : E.classificationMetrics(ys, ps, K).balancedAccuracy;
    const point = metric(idx.map(i => y[i]), idx.map(i => oof[i]));
    const rand = E.rng(opt.seed || 99);
    const draws = [];
    for (let b = 0; b < B; b++) {
      const ys = [], ps = [];
      for (let t = 0; t < n; t++) {
        const i = idx[Math.floor(rand() * n)];
        ys.push(y[i]); ps.push(oof[i]);
      }
      const v = metric(ys, ps);
      if (isFinite(v)) draws.push(v);
    }
    if (draws.length < 20) return null;
    draws.sort((a, b) => a - b);
    return {
      metric: point, n, B: draws.length,
      se: E.sd(draws),
      lo: E.quantile(draws, 0.025), hi: E.quantile(draws, 0.975),
      /* Rows per thing being estimated. Below about 10 a score is mostly a statement about
         which rows happened to land in which fold. */
      rowsPerFeature: opt.p ? n / opt.p : null
    };
  }

  /* Can the driver ranking be trusted? Two importances are told apart only if the gap
     between them clears the noise in both, so the comparison is on the difference rather
     than on whether each looks big. Needs the per-driver standard errors, which the
     permutation already produces and used to throw away. */
  function rankReliability(importance, opt) {
    opt = opt || {};
    const z = opt.z || 1.959964;
    const list = (importance || []).filter(v => isFinite(v.importance));
    if (list.length < 2) return null;
    const sorted = list.slice().sort((a, b) => b.importance - a.importance);
    const se = v => (isFinite(v.se) ? v.se : 0);
    const sep = (a, b) => {
      const spread = Math.sqrt(se(a) * se(a) + se(b) * se(b));
      return spread > 0 ? (a.importance - b.importance) / spread : Infinity;
    };
    const top = sorted[0], second = sorted[1];
    const topClear = sep(top, second) >= z;
    /* Everyone the top driver cannot be separated from is a joint leader, not a runner-up,
       and presenting them as ranked would be reading an order out of noise. */
    const tied = sorted.slice(1).filter(v => sep(top, v) < z).map(v => v.name);
    /* Which drivers cannot be told apart from a column that carries nothing. The obvious
       test - is the importance bigger than its own standard error - is WRONG here, and
       measurably so. Permutation importance is computed on the rows the model was fitted
       on, so a model leans on any column it was handed, signal or not, and the reading comes
       back positive either way. Measured on three columns of pure random numbers, every one
       scored 0.005 to 0.007 against standard errors near 0.002: "significant" by its own
       spread, and meaningless. So the reference is not zero. It is the importance the same
       model gives when the target has been shuffled, which destroys the relationship and
       keeps everything else, and the caller measures that and passes it in as `floor`. */
    const floor = isFinite(opt.floor) ? opt.floor : null;
    const belowFloor = floor === null ? [] : sorted.filter(v => v.importance <= floor).map(v => v.name);
    return {
      top: top.name, topImportance: top.importance, topSE: se(top),
      second: second.name, gap: top.importance - second.importance,
      topClear, tiedWithTop: tied, floor, belowFloor,
      // True when even the leading driver cannot be told from an irrelevant column.
      topAboveFloor: floor === null ? null : top.importance > floor,
      /* What the standard error above does and does not cover. Stated here so the caller
         cannot present it as the whole uncertainty, which is the flattering reading. */
      seCovers: 'the noise in the permutation shuffling, with the data and the fitted model held fixed',
      seOmits: 'the variability from having sampled these rows rather than others, which is larger'
    };
  }

  root.MLUncertainty = { calibrate, scoreUncertainty, rankReliability, conformalQuantile, localDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLUncertainty;
})(typeof globalThis !== 'undefined' ? globalThis : this);
