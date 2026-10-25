/* Golden batch trajectories and multivariate process control.

   The idea in one sentence: take the batches that went well, work out the path they follow
   through time, and then ask of any other batch "how far from that path is it, right now?"

   Three numbers come out of it, and they answer different questions:

     The envelope   For one sensor at one moment: is this reading inside the range good
                    batches sat in? Easy to read, but thirty sensors means thirty charts, and
                    a batch can be inside every single one and still be wrong.

     T-squared      One number for all sensors together: how far is this moment from the
                    middle of normal, counting the usual spread of each sensor. This is what
                    catches "temperature a bit high AND dissolved oxygen a bit low AND feed
                    slightly off", none of them alarming alone.

     Q (residual)   Whether the sensors still agree with each other the way they normally do.
                    T-squared asks "is this far from normal"; Q asks "is this a KIND of
                    behaviour we have never seen". A probe drifting out of step with the rest
                    of the vessel shows up here first.

   Everything is measured against reference batches the user nominates. Readings are turned
   into how many standard deviations they sit from the reference mean at that same point in
   the batch, so a planned temperature ramp is not mistaken for a fault.

   Pure computation; no network, no storage. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');
  const { mean, sd, quantile, range } = E;

  const asNumber = v => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };

  // Linear interpolation of one batch's readings onto a shared time grid.
  function resample(times, values, grid) {
    const out = new Array(grid.length).fill(null);
    if (times.length < 2) return out;
    let i = 0;
    for (let g = 0; g < grid.length; g++) {
      const t = grid[g];
      if (t < times[0] || t > times[times.length - 1]) continue;   // never extrapolate
      while (i < times.length - 2 && times[i + 1] < t) i++;
      const t0 = times[i], t1 = times[i + 1];
      const w = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      out[g] = values[i] + w * (values[i + 1] - values[i]);
    }
    return out;
  }

  /* records: [{ batch, time, vars: { name: value } }]
     opt: { variables, reference (batch ids), gridPoints, limit (0-1), align: 'time'|'percent',
            components, minRun } */
  function analyze(records, opt) {
    opt = opt || {};
    const clean = (records || []).map(r => {
      if (!r) return null;
      const t = asNumber(r.time);
      return t === null ? null : { batch: String(r.batch === undefined ? '' : r.batch).trim(), time: t, vars: r.vars || {} };
    }).filter(Boolean);
    if (!clean.length) throw new Error('No rows with a numeric time column.');

    const variables = (opt.variables || []).slice();
    if (variables.length < 2) throw new Error('Pick at least 2 process variables. Multivariate monitoring needs more than one sensor to be worth anything.');

    const names = [];
    clean.forEach(r => { if (r.batch && !names.includes(r.batch)) names.push(r.batch); });
    if (names.length < 3) throw new Error('Found ' + names.length + ' batch' + (names.length === 1 ? '' : 'es') + '. At least 3 are needed to describe what normal looks like, and more is much better.');

    // One tidy series per batch: sorted by time, rows with any missing variable dropped.
    const batches = names.map(name => {
      const rs = clean.filter(r => r.batch === name).slice().sort((a, b) => a.time - b.time);
      const times = [], cols = variables.map(() => []);
      for (const r of rs) {
        const vals = variables.map(v => asNumber(r.vars[v]));
        if (vals.some(v => v === null)) continue;
        if (times.length && r.time === times[times.length - 1]) continue;  // duplicate timestamp
        times.push(r.time);
        vals.forEach((v, j) => cols[j].push(v));
      }
      return { name, times, cols, n: times.length, start: times[0], end: times[times.length - 1] };
    }).filter(b => b.n >= 3);
    if (batches.length < 3) throw new Error('Only ' + batches.length + ' batch(es) have at least 3 usable time points.');

    let reference = (opt.reference && opt.reference.length ? opt.reference : batches.map(b => b.name)).filter(n => batches.some(b => b.name === n));
    if (reference.length < 3) throw new Error('Pick at least 3 reference batches. These are the runs you are happy with, and they define what normal means.');

    /* The shared grid. On absolute time it only runs as far as the shortest reference batch,
       because beyond that there is nothing to compare against. On percent it runs 0-100% of
       each batch's own length, which is the right choice when batches differ in duration. */
    const align = opt.align === 'percent' ? 'percent' : 'time';
    const gridPoints = Math.max(10, Math.min(opt.gridPoints || 60, 400));
    const refBatches = batches.filter(b => reference.includes(b.name));
    let gridLo, gridHi;
    if (align === 'percent') { gridLo = 0; gridHi = 100; }
    else {
      gridLo = Math.max.apply(null, refBatches.map(b => b.start));
      gridHi = Math.min.apply(null, refBatches.map(b => b.end));
      if (!(gridHi > gridLo)) throw new Error('The reference batches do not overlap in time. Switch the alignment to "percent of batch length".');
    }
    const grid = range(gridPoints).map(i => gridLo + (gridHi - gridLo) * i / (gridPoints - 1));
    const onGrid = b => {
      const t = align === 'percent'
        ? b.times.map(x => (b.end === b.start ? 0 : (x - b.start) / (b.end - b.start) * 100))
        : b.times;
      return variables.map((_, j) => resample(t, b.cols[j], grid));
    };
    batches.forEach(b => { b.grid = onGrid(b); });

    // What a good batch looks like at each point: the golden trajectory, and its spread.
    function envelopeFrom(refNames) {
      const refs = batches.filter(b => refNames.includes(b.name));
      const spreadFloor = variables.map((_, j) => {
        const all = [];
        refs.forEach(b => b.grid[j].forEach(v => { if (v !== null) all.push(v); }));
        // A sensor held hard at setpoint has almost no spread; without a floor its z-scores
        // would explode on rounding alone.
        return Math.max(1e-9, sd(all) * 0.02);
      });
      return variables.map((_, j) => grid.map((_, g) => {
        const vals = refs.map(b => b.grid[j][g]).filter(v => v !== null);
        return { n: vals.length, mean: vals.length ? mean(vals) : null, sd: vals.length > 1 ? Math.max(sd(vals), spreadFloor[j]) : spreadFloor[j] };
      }));
    }

    // Readings as "standard deviations from the golden path at this point in the batch".
    const zRows = (b, env) => grid.map((_, g) => {
      const z = variables.map((_, j) => {
        const v = b.grid[j][g], e = env[j][g];
        return v === null || e.mean === null ? null : (v - e.mean) / e.sd;
      });
      return z.some(v => v === null) ? null : z;
    });

    /* The model of normal: principal components of the reference deviations.

       Limits are deliberately NOT taken from these same batches' own scores. A batch that
       helped draw the envelope sits unnaturally close to it, so an in-sample limit is far too
       tight and every new batch trips it. The limits below are calibrated the honest way, on
       batches held out of the model that scored them. */
    function fit(refNames) {
      const env = envelopeFrom(refNames);
      const Z = [];
      batches.filter(b => refNames.includes(b.name)).forEach(b => zRows(b, env).forEach(r => { if (r) Z.push(r); }));
      if (Z.length < variables.length + 2) throw new Error('Not enough overlapping reference data to build a model.');
      const full = E.pca(Z, variables.length);
      let A = opt.components;
      if (!(A >= 1)) {
        // Enough components to carry 85% of the normal variation, and never all of them:
        // Q needs something left over to measure.
        let cum = 0; A = 1;
        for (let i = 0; i < full.explained.length; i++) { cum += full.explained[i]; A = i + 1; if (cum >= 0.85) break; }
      }
      A = Math.max(1, Math.min(A, variables.length - 1));
      const p = E.pca(Z, A);
      const lam = p.values.slice(0, A).map(v => Math.max(v, 1e-12));
      const project = z => {
        const c = z.map((v, j) => v - p.center[j]);
        const t = p.loadings.map(w => w.reduce((s, wj, j) => s + wj * c[j], 0));
        const rec = c.map((_, j) => p.loadings.reduce((s, w, a) => s + t[a] * w[j], 0));
        const resid = c.map((v, j) => v - rec[j]);
        return {
          t2: t.reduce((s, v, a) => s + v * v / lam[a], 0),
          q: resid.reduce((s, v) => s + v * v, 0),
          residuals: resid, scores: t
        };
      };
      return { env, A, explained: full.explained, pca: p, lam, project, nRefObs: Z.length };
    }

    const lim = opt.limit > 0 && opt.limit < 1 ? opt.limit : 0.99;
    const sortAsc = a => a.slice().sort((x, y) => x - y);

    /* Leave one batch out, rebuild the model from the rest, score the held-out batch. Pooling
       those scores gives limits that mean what they say: "99% of the time, a good batch the
       model had never seen stayed under this line". */
    const looModels = {};
    const looT2 = [], looQ = [];
    reference.forEach(name => {
      const others = reference.filter(n => n !== name);
      if (others.length < 3) return;
      const m = fit(others);
      looModels[name] = m;
      const b = batches.find(x => x.name === name);
      zRows(b, m.env).forEach(z => {
        if (!z) return;
        const s = m.project(z);
        looT2.push(s.t2); looQ.push(s.q);
      });
    });
    const haveLoo = looT2.length > variables.length * 5;
    const model = fit(reference);
    // Without enough reference batches to hold any out, fall back to in-sample limits and
    // widen them, rather than pretending to a calibration that was not done.
    const inSample = [];
    if (!haveLoo) {
      batches.filter(b => reference.includes(b.name)).forEach(b => zRows(b, model.env).forEach(z => { if (z) inSample.push(model.project(z)); }));
    }
    model.t2Limit = haveLoo ? quantile(sortAsc(looT2), lim) : quantile(sortAsc(inSample.map(s => s.t2)), lim) * 2;
    model.qLimit = haveLoo ? quantile(sortAsc(looQ), lim) : quantile(sortAsc(inSample.map(s => s.q)), lim) * 2;
    model.limit = lim;
    model.calibration = haveLoo ? 'held-out reference batches' : 'reference batches themselves, widened (too few batches to hold any out)';
    Object.keys(looModels).forEach(k => { looModels[k].t2Limit = model.t2Limit; looModels[k].qLimit = model.qLimit; });

    /* Scoring one batch. A reference batch is scored against a model refitted without it,
       so it is not being marked against an envelope it helped to draw. */
    const minRun = Math.max(1, opt.minRun || 3);
    function scoreBatch(name) {
      const b = batches.find(x => x.name === name);
      const isRef = reference.includes(name);
      // A reference batch is scored by the model built without it; everyone shares the same
      // held-out limits, so the numbers on screen are comparable between batches.
      const m = isRef && looModels[name] ? looModels[name] : model;
      const z = zRows(b, m.env);
      const points = grid.map((t, g) => {
        if (!z[g]) return null;
        const s = m.project(z[g]);
        return { t, z: z[g], t2: s.t2, q: s.q, residuals: s.residuals, overT2: s.t2 > m.t2Limit, overQ: s.q > m.qLimit };
      });
      const seen = points.filter(Boolean);
      // An alarm means several points in a row outside, not one twitchy reading.
      let alarm = null, run = 0;
      for (const p of points) {
        if (!p) { run = 0; continue; }
        if (p.overT2 || p.overQ) { run++; if (run >= minRun && !alarm) alarm = p; } else run = 0;
      }
      const worst = seen.reduce((a, p) => (a === null || p.t2 / m.t2Limit > a.t2 / m.t2Limit ? p : a), null);
      const flagged = seen.filter(p => p.overT2 || p.overQ).length;
      // What drove the alarm: the sensor furthest outside its own envelope, and the sensor
      // contributing most to the broken-correlation number.
      const blame = p => {
        if (!p) return null;
        let bz = 0, bq = 0;
        p.z.forEach((v, j) => { if (Math.abs(v) > Math.abs(p.z[bz])) bz = j; });
        p.residuals.forEach((v, j) => { if (v * v > p.residuals[bq] * p.residuals[bq]) bq = j; });
        return {
          variable: variables[bz], z: p.z[bz],
          qVariable: variables[bq], qShare: p.q > 0 ? p.residuals[bq] * p.residuals[bq] / p.q : 0,
          contributions: variables.map((v, j) => ({ name: v, z: p.z[j], qShare: p.q > 0 ? p.residuals[j] * p.residuals[j] / p.q : 0 }))
            .sort((x, y) => Math.abs(y.z) - Math.abs(x.z))
        };
      };
      return {
        name, isRef, points, grid, t2Limit: m.t2Limit, qLimit: m.qLimit, env: m.env,
        alarm, alarmBlame: blame(alarm), worst, worstBlame: blame(worst),
        flagged, scored: seen.length,
        maxT2: seen.length ? Math.max.apply(null, seen.map(p => p.t2)) : null,
        maxQ: seen.length ? Math.max.apply(null, seen.map(p => p.q)) : null,
        /* A 99% limit means about one checkpoint in a hundred sits outside it on a perfectly
           good batch. Calling that "worth a look" would flag most good batches and teach
           everyone to ignore the column, so a handful of isolated points still counts as
           normal; "watch" needs a real cluster. */
        verdict: alarm ? 'alarm' : seen.length && flagged / seen.length >= 0.05 ? 'watch' : 'normal'
      };
    }

    const summary = batches.map(b => {
      const s = scoreBatch(b.name);
      return {
        name: b.name, isRef: s.isRef, verdict: s.verdict, flagged: s.flagged, scored: s.scored,
        maxT2: s.maxT2, maxQ: s.maxQ, t2Limit: s.t2Limit, qLimit: s.qLimit,
        alarmAt: s.alarm ? s.alarm.t : null,
        alarmBy: s.alarmBlame ? s.alarmBlame.variable : null,
        points: b.n, from: b.start, to: b.end
      };
    });

    return {
      variables, batches: batches.map(b => ({ name: b.name, n: b.n, start: b.start, end: b.end })),
      gridSeries: batches.reduce((acc, b) => { acc[b.name] = b.grid; return acc; }, {}),
      reference, align, grid, gridLo, gridHi, model, summary, scoreBatch,
      components: model.A, explained: model.explained, limit: model.limit, calibration: model.calibration,
      t2Limit: model.t2Limit, qLimit: model.qLimit,
      varianceCovered: model.explained.slice(0, model.A).reduce((a, b) => a + b, 0)
    };
  }

  root.MLGolden = { analyze, resample };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLGolden;
})(typeof globalThis !== 'undefined' ? globalThis : this);
