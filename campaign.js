/* The loop: passive data, a design, runs, back into the model, again until it is good enough.

   Four of the five steps already existed in pieces - a baseline from operational data, a
   recommended design, a run sheet with a column to write results into, and a model that can
   be refitted. What was missing was the loop itself: nothing stacked a round of results onto
   what came before, nothing tracked whether the model was actually improving, and nothing
   would say when to stop.

   The last one is where this has to be careful, because the obvious way to measure progress
   is wrong.

   R-SQUARED IS NOT A CONVERGENCE METRIC HERE. R2 is error measured against the spread of the
   data, and every round of this loop deliberately widens that spread - that is what a design
   of experiments is for. Measured on identical data with identical noise and an identical
   model, widening the sampled range alone takes R2 from 0.376 to 0.975 while the
   cross-validated RMSE sits at 0.265 the whole way. A campaign steered by R2 would declare
   success after one round of widening ranges, having learned nothing.

   So progress is tracked on quantities that do not move when the range does: the width of
   the prediction interval, in the units of the response, and the cross-validated RMSE. R2 is
   reported because people expect it and the brief asks for it, with the spread of the target
   beside it so a jump explained by range rather than by skill is visible rather than
   flattering. */
(function (root) {
  'use strict';
  const need = (globalName, moduleName) => {
    const got = root[globalName] || (typeof require !== 'undefined' ? require(moduleName) : null);
    if (!got) throw new Error(globalName + ' is not loaded, so this cannot run.');
    return got;
  };
  const engine = () => need('MLEngine', './engine.js');
  const uncertainty = () => need('MLUncertainty', './uncertainty.js');

  /* Stacking a round of results onto what came before. Columns are matched by name, not by
     position, because a run sheet comes back with its columns in whatever order the
     instrument wrote them. A column missing from one round is kept and left blank there
     rather than dropped, since dropping it would silently discard every earlier measurement
     of it. */
  function stack(tables, opt) {
    opt = opt || {};
    const list = (tables || []).filter(t => t && t.columns && t.columns.length);
    if (!list.length) return { columns: [], rows: [], rounds: [] };
    const key = s => String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const columns = [], seen = new Map();
    for (const t of list) {
      t.columns.forEach(c => {
        const k = key(c);
        if (!seen.has(k)) { seen.set(k, columns.length); columns.push(c); }
      });
    }
    const tag = opt.roundColumn === false ? null : (opt.roundColumn || 'Round');
    const rows = [], rounds = [];
    list.forEach((t, ri) => {
      const idx = t.columns.map(c => seen.get(key(c)));
      let kept = 0;
      for (const r of t.rows) {
        const out = new Array(columns.length).fill('');
        idx.forEach((to, from) => { out[to] = r[from] === undefined || r[from] === null ? '' : r[from]; });
        rows.push(out); kept++;
      }
      rounds.push({ round: ri, name: t.name || (ri === 0 ? 'Round 0' : 'Round ' + ri), rows: kept });
    });
    if (tag) {
      columns.push(tag);
      let at = 0;
      rounds.forEach(r => { for (let i = 0; i < r.rows; i++) rows[at++].push(String(r.round)); });
    }
    return { columns, rows, rounds };
  }

  /* One round, measured. Everything here is cross-validated rather than read off the fit,
     and the interval width is the median half-width of the conformal band over the rows
     themselves - a number in the units of the response, which is what somebody deciding
     whether to run another block of experiments actually needs. */
  function metrics(table, targetName, opt) {
    opt = opt || {};
    const E = engine(), U = uncertainty();
    const prof = E.profile(table);
    const targetCol = prof.columns.find(c => c.name === targetName);
    if (!targetCol) throw new Error('No column called "' + targetName + '".');
    if (targetCol.kind !== 'numeric') throw new Error('"' + targetName + '" is not a number, so there is no interval to converge.');
    const skip = new Set([targetName].concat(opt.exclude || []));
    const featureCols = prof.columns.filter(c => !skip.has(c.name) && E.isUsableFeature(c) &&
      c.kind !== 'id' && c.kind !== 'constant' && !/^round$/i.test(c.name));
    if (featureCols.length < 1) throw new Error('No usable columns to predict from.');
    const data = E.supervisedData(prof, targetCol, featureCols, 'regression');
    const n = data.rows.length;
    if (n < 8) throw new Error('Need at least 8 complete runs to measure a round; found ' + n + '.');

    const seed = opt.seed || 42;
    const k = n <= 20 ? n : n <= 100 ? 10 : 5;
    const folds = E.makeFolds(n, k, E.rng(seed));
    const models = E.MODELS.filter(m => m.task !== 'classification' && m.id !== 'baseline' &&
      (!m.applicable || m.applicable(n, featureCols.length)));
    let best = null;
    for (const m of models) {
      try {
        const oof = E.crossValidate(m, data, 'regression', folds, k, seed);
        const mt = E.regressionMetrics(data.y, oof);
        if (!isFinite(mt.r2)) continue;
        if (!best || mt.r2 > best.metrics.r2 + 0.01 ||
          (Math.abs(mt.r2 - best.metrics.r2) <= 0.01 && m.complexity < best.model.complexity)) {
          best = { model: m, metrics: mt, oof };
        }
      } catch (err) { /* a model that cannot fit this shape does not compete */ }
    }
    if (!best) throw new Error('No model could be fitted to these runs.');

    /* The interval, from a slice held back from a second fit - the same arrangement the rest
       of the tool uses, so the widths are comparable with what it reports elsewhere. */
    let halfWidth = null, nCal = null, supported = null;
    try {
      const order = E.shuffle(E.range(n), E.rng(seed + 5));
      const nCalWant = Math.max(8, Math.round(n * 0.3));
      const calIdx = order.slice(0, nCalWant), fitIdx = order.slice(nCalWant);
      const sub = idx => ({ rows: idx.map(i => data.rows[i]), y: idx.map(i => data.y[i]), classes: null, featureCols });
      const partial = E.fitFull(best.model, sub(fitIdx), 'regression', seed);
      const calX = partial.enc.transform(sub(calIdx).rows);
      const cal = U.calibrate({ trainX: partial.X, calX, calY: sub(calIdx).y, calPred: partial.fitted.predict(calX) }, {});
      if (cal) {
        const conf = opt.confidence || 0.9;
        const full = E.fitFull(best.model, data, 'regression', seed);
        const widths = full.X.map(x => cal.halfWidth(x, conf)).sort((a, b) => a - b);
        halfWidth = E.quantile(widths, 0.5);
        nCal = cal.nCal; supported = cal.supports(conf);
      }
    } catch (err) { /* no interval is better than one nobody can stand behind */ }

    const ys = data.y.slice().sort((a, b) => a - b);
    const score = U.scoreUncertainty(data.y, best.oof, 'regression', { p: featureCols.length, seed: seed + 3 });
    return {
      n, model: best.model.name,
      r2: best.metrics.r2, rmse: best.metrics.rmse, mae: best.metrics.mae,
      r2Lo: score ? score.lo : null, r2Hi: score ? score.hi : null,
      halfWidth, nCal, intervalSupported: supported,
      confidence: opt.confidence || 0.9,
      features: featureCols.map(c => c.name),
      /* The spread of the target, carried so a jump in R2 can be checked against the thing
         that most often explains it. */
      targetSd: E.sd(data.y), targetRange: ys[ys.length - 1] - ys[0]
    };
  }

  /* Where the campaign has got to, and whether it is done.

     Targets are on the interval and on RMSE rather than on R2. R2 is checked too, because
     the brief asks for it, but a round that meets the R2 target while the interval has not
     moved is reported as what it is rather than as success. */
  function assess(rounds, targets) {
    targets = targets || {};
    const last = rounds[rounds.length - 1], first = rounds[0];
    if (!last) return null;
    const met = {};
    if (isFinite(targets.halfWidth)) met.halfWidth = last.halfWidth !== null && last.halfWidth <= targets.halfWidth;
    if (isFinite(targets.rmse)) met.rmse = last.rmse <= targets.rmse;
    if (isFinite(targets.r2)) met.r2 = last.r2 >= targets.r2;
    const keys = Object.keys(met);
    const done = keys.length > 0 && keys.every(k => met[k]);

    /* Whether an R2 gain is the model improving or the range widening. Both move it, and
       only one of them is progress, so the two are separated rather than summed. */
    let rangeEffect = null;
    if (rounds.length > 1 && first.targetSd > 0 && last.targetSd > 0) {
      const spreadRatio = last.targetSd / first.targetSd;
      /* What R2 would read now if the model were no better than it was at the start - only
         the spread having changed. Anything above this is genuine; the gap below it is the
         part the widening alone explains. */
      const r2IfNoBetter = 1 - (1 - first.r2) / (spreadRatio * spreadRatio);
      rangeEffect = {
        spreadRatio,
        r2IfNoBetter,
        genuine: last.r2 - r2IfNoBetter,
        fromWidening: r2IfNoBetter - first.r2
      };
    }
    return {
      rounds: rounds.length, latest: last, met, done, targets,
      deltaHalfWidth: rounds.length > 1 && last.halfWidth !== null && first.halfWidth !== null ? last.halfWidth - first.halfWidth : null,
      deltaRmse: rounds.length > 1 ? last.rmse - first.rmse : null,
      deltaR2: rounds.length > 1 ? last.r2 - first.r2 : null,
      rangeEffect
    };
  }

  /* What another block of runs would buy, measured rather than promised.

     The model is refitted on subsamples of increasing size and the error is recorded, which
     traces the curve this dataset is actually on. Error against sample size falls roughly as
     one over the square root of n toward a floor set by the noise, so a + b/sqrt(n) is
     fitted to the measured points and read forward. It is an extrapolation and is labelled
     one: it assumes the new runs look like the old ones, and a design that deliberately
     explores somewhere new does not. */
  function project(table, targetName, addN, opt) {
    opt = opt || {};
    const E = engine();
    const base = metrics(table, targetName, opt);
    const n = base.n;
    const fracs = [0.4, 0.55, 0.7, 0.85, 1];
    const points = [];
    for (const f of fracs) {
      const take = Math.round(n * f);
      if (take < 8) continue;
      try {
        const idx = E.shuffle(E.range(n), E.rng((opt.seed || 42) + 11)).slice(0, take).sort((a, b) => a - b);
        const sub = { columns: table.columns, rows: idx.map(i => table.rows[i]) };
        const m = metrics(sub, targetName, Object.assign({}, opt, { seed: (opt.seed || 42) + 17 }));
        points.push({ n: m.n, rmse: m.rmse, halfWidth: m.halfWidth });
      } catch (err) { /* a subsample too small to fit simply does not contribute a point */ }
    }
    if (points.length < 3) return { base, points, projection: null, why: 'Too few runs to trace a learning curve; measure again after the next round.' };

    // Least squares on y = a + b / sqrt(n), which is the shape error follows with sample size.
    const fitCurve = key => {
      const xs = points.map(p => 1 / Math.sqrt(p.n)), ys = points.map(p => p[key]);
      if (ys.some(v => v === null || !isFinite(v))) return null;
      const mx = E.mean(xs), my = E.mean(ys);
      let num = 0, den = 0;
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
      let b = den ? num / den : 0;
      /* The slope is held at or above zero. Error falls with sample size; it does not rise,
         and a fit that says otherwise is reading noise in the subsample measurements rather
         than a real trend. Left unclamped it produces the one projection nobody should ever
         be shown - that running more experiments will make the model worse. A slope of zero
         is the honest reading of that situation: this data shows no measurable improvement
         with size, which usually means it is already at the noise floor. */
      if (!(b > 0)) b = 0;
      const a = my - b * mx;
      return { a, b, flat: b === 0, at: m => Math.max(0, a + b / Math.sqrt(m)) };
    };
    const rc = fitCurve('rmse'), hc = fitCurve('halfWidth');
    const target = n + Math.max(1, addN || n);
    /* Whatever the curve says, more runs cannot be projected to do worse than what is
       already measured at today's sample size. A flat curve evaluates to the average of the
       subsample points, and the small subsamples in that average have higher error than the
       full set - so without this the projection comes back above where the campaign already
       stands, which reads as "run more experiments and the model will get worse". */
    const atMost = (fitted, now) => (fitted === null || now === null || !isFinite(now) ? fitted : Math.min(fitted, now));
    return {
      base, points,
      projection: {
        atN: target, addN: target - n,
        /* True when the measured curve is flat: more runs of the same kind are not expected
           to help, which is a finding rather than a failure to produce one. */
        flat: !!(rc && rc.flat),
        rmse: rc ? atMost(rc.at(target), base.rmse) : null,
        halfWidth: hc ? atMost(hc.at(target), base.halfWidth) : null,
        /* The floor each curve is heading for: more runs cannot take the error below the
           noise in the measurement itself, and knowing where that sits is what says when to
           stop running and start improving the assay instead. */
        rmseFloor: rc ? atMost(Math.max(0, rc.a), base.rmse) : null,
        halfWidthFloor: hc ? atMost(Math.max(0, hc.a), base.halfWidth) : null
      },
      assumption: 'Read off how this dataset has improved with size so far, and assumes the next runs resemble the ones already in it. A design that deliberately explores somewhere new breaks that assumption, usually by making the model worse before it makes it better.'
    };
  }

  root.MLCampaign = { stack, metrics, assess, project };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLCampaign;
})(typeof globalThis !== 'undefined' ? globalThis : this);
