/* Plasmid and vector selection: predict titer and specific productivity from a construct's
   genetic features, and be honest about what happens outside the data.

   The hard part of this module is not the prediction. It is what the tool does when the
   question moves away from the runs it learned on, which is most of the time in vector
   screening: a promoter nobody has used here, a plasmid larger than anything built, a seed
   density past the end of the range. Three mechanisms handle that, and each is designed to
   fail loudly rather than quietly.

   Intervals are CONFORMAL, not plus-or-minus-two-sigma. A fixed multiple of a residual
   standard deviation is not a 95% interval unless the errors really are normal and
   homoscedastic, which predictions from a screening corpus are not. Split conformal gives a
   coverage guarantee that holds whatever shape the errors have, and normalising by a local
   difficulty estimate is what makes the band widen as you move away from the data - the
   behaviour asked for, arrived at in a way that can be checked. The coverage IS checked,
   empirically, in the tests. */
(function (root) {
  'use strict';
  const E = root.MLEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  /* Reference properties for the categorical features. These are ordinary domain knowledge,
     written down so an unfamiliar level can be mapped to the nearest familiar one instead of
     silently becoming the reference category - which is what a plain dummy encoding does,
     and it is the quietest possible way to be wrong.

     They are editable, and the tool says when a prediction leaned on them. Strength is on a
     rough 0-1 scale of commonly reported relative activity, not a measurement. */
  const PROMOTERS = {
    CMV: { strength: 1.00, note: 'strong, viral, can silence over time' },
    CAG: { strength: 0.95, note: 'strong hybrid, durable in CHO' },
    EF1a: { strength: 0.80, note: 'moderate-strong, resists silencing' },
    'EF1a-HTLV': { strength: 0.88, note: 'EF1a with an HTLV element' },
    SV40: { strength: 0.45, note: 'moderate, small' },
    UBC: { strength: 0.40, note: 'moderate, steady' },
    PGK: { strength: 0.35, note: 'modest, very steady' },
    TK: { strength: 0.20, note: 'weak, often for markers' }
  };
  const MARKERS = {
    GS: { stringency: 0.90, note: 'glutamine synthetase, strong selection' },
    DHFR: { stringency: 0.85, note: 'amplifiable, needs MTX' },
    Puromycin: { stringency: 0.60, note: 'fast, antibiotic' },
    Neomycin: { stringency: 0.45, note: 'slower, antibiotic' },
    Hygromycin: { stringency: 0.50, note: 'antibiotic' },
    Blasticidin: { stringency: 0.55, note: 'antibiotic' }
  };
  const norm = s => String(s == null ? '' : s).trim();
  const key = s => norm(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  /* Nearest known level for one the corpus has never seen. Matched on name first (so
     "CMV-intron" finds CMV), then on the declared property. Returns what it matched and
     why, because a mapping the user cannot see is a mapping they cannot correct. */
  function nearestLevel(value, known, table) {
    const v = norm(value);
    if (!v) return null;
    const exact = known.find(k => key(k) === key(v));
    if (exact) return { level: exact, exact: true, why: 'used in the historical runs' };
    const kv = key(v);
    const byName = known.filter(k => key(k) && (kv.indexOf(key(k)) >= 0 || key(k).indexOf(kv) >= 0))
      .sort((a, b) => key(b).length - key(a).length)[0];
    if (byName) return { level: byName, exact: false, why: 'name contains "' + byName + '", so it is treated as that' };
    const prop = table && table[v];
    if (prop) {
      const field = prop.strength !== undefined ? 'strength' : 'stringency';
      let best = null, bestD = Infinity;
      for (const k of known) {
        const p = table[k];
        if (!p || p[field] === undefined) continue;
        const d = Math.abs(p[field] - prop[field]);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best) return { level: best, exact: false, why: 'not in the corpus; matched to ' + best + ' on reported ' + field + ' (' + prop[field] + ' against ' + table[best][field] + ')' };
    }
    return { level: null, exact: false, why: 'not in the corpus and not in the reference table, so it cannot be placed' };
  }

  /* One target, trained and calibrated. The corpus is split: most of it trains the model,
     a held-back slice calibrates the interval. The calibration slice is never trained on,
     which is what makes the coverage guarantee mean anything. */
  function trainTarget(prof, targetName, featureNames, opt) {
    opt = opt || {};
    const seed = opt.seed || 42;
    const targetCol = prof.columns.find(c => c.name === targetName);
    if (!targetCol) throw new Error('No column called "' + targetName + '".');
    const featureCols = featureNames.map(n => prof.columns.find(c => c.name === n)).filter(Boolean);
    if (!featureCols.length) throw new Error('No usable feature columns.');
    const data = E.supervisedData(prof, targetCol, featureCols, 'regression');
    const n = data.rows.length;
    if (n < 12) throw new Error('Need at least 12 complete runs to fit and calibrate; found ' + n + '.');

    // Pick a model the way the rest of the tool does: cross-validate, prefer the simpler one.
    const nFolds = n <= 20 ? n : n <= 100 ? 10 : 5;
    const folds = E.makeFolds(n, nFolds, E.rng(seed));
    const candidates = E.MODELS.filter(m => m.task !== 'classification' && m.id !== 'baseline' &&
      (!m.applicable || m.applicable(n, featureCols.length)));
    let best = null;
    for (const m of candidates) {
      try {
        const oof = E.crossValidate(m, data, 'regression', folds, nFolds, seed);
        const r2 = E.regressionMetrics(data.y, oof).r2;
        // A score that did not come out as a number must never win by default, or the
        // "chosen" model is simply whichever happened to be tried first.
        if (!isFinite(r2)) continue;
        if (!best || r2 > best.r2 + 0.01 || (Math.abs(r2 - best.r2) <= 0.01 && m.complexity < best.model.complexity)) {
          best = { model: m, r2, oof };
        }
      } catch (err) { /* a model that cannot fit this shape simply does not compete */ }
    }
    if (best && !isFinite(best.r2)) best = null;
    if (!best) throw new Error('No model could be fitted to these runs.');

    /* Split conformal. Shuffle, hold back a slice, fit on the rest, and measure how wrong
       the model is on runs it has not seen. Those errors - not an assumed distribution -
       are what set the interval. */
    const order = E.shuffle(E.range(n), E.rng(seed + 5));
    const nCal = Math.max(5, Math.round(n * 0.3));
    const calIdx = order.slice(0, nCal), fitIdx = order.slice(nCal);
    const sub = idx => ({ rows: idx.map(i => data.rows[i]), y: idx.map(i => data.y[i]), classes: null, featureCols });
    const fitData = sub(fitIdx), calData = sub(calIdx);
    const partial = E.fitFull(best.model, fitData, 'regression', seed);
    const calX = partial.enc.transform(calData.rows);
    const calPred = partial.fitted.predict(calX);

    /* Local difficulty: how far a point sits from the runs the model learned on, in the
       encoded space. The interval is scaled by it, so a construct unlike anything in the
       corpus gets a wider band - and because the scaling is calibrated rather than assumed,
       the coverage still holds. */
    const trainX = partial.X;
    const spread = [];
    const p = trainX[0] ? trainX[0].length : 0;
    for (let j = 0; j < p; j++) {
      const col = trainX.map(r => r[j]);
      spread.push(E.sd(col) || 1);
    }
    const distance = x => {
      const ds = trainX.map(r => {
        let s = 0;
        for (let j = 0; j < p; j++) { const d = (r[j] - x[j]) / spread[j]; s += d * d; }
        return Math.sqrt(s / Math.max(1, p));
      }).sort((a, b) => a - b);
      const k = Math.min(5, ds.length);
      let s = 0; for (let i = 0; i < k; i++) s += ds[i];
      return k ? s / k : 0;
    };
    const calDist = calX.map(distance);
    const typicalDist = E.quantile(calDist.slice().sort((a, b) => a - b), 0.5) || 1;
    const beta = 0.5;   // keeps the scaling finite for a point sitting on top of the data
    const scores = calPred.map((pv, i) => Math.abs(calData.y[i] - pv) / (beta + calDist[i] / typicalDist));
    scores.sort((a, b) => a - b);
    const qAt = conf => {
      // The conformal quantile, with the finite-sample correction that makes it valid.
      const idx = Math.ceil((nCal + 1) * conf) - 1;
      return scores[Math.max(0, Math.min(scores.length - 1, idx))];
    };

    // The model that gets used is refit on everything; the interval width comes from above.
    const full = E.fitFull(best.model, data, 'regression', seed);
    const ys = data.y.slice().sort((a, b) => a - b);
    return {
      target: targetName, model: best.model.id, modelName: best.model.name, r2: best.r2,
      n, nCal, enc: full.enc, fitted: full.fitted,
      /* The tightest tail nCal+1 order statistics can resolve. Past this the conformal
         quantile saturates at the widest calibration score, so a caller asking for more
         gets a floor rather than a guarantee - and is told which it got. */
      maxConf: nCal / (nCal + 1),
      distance: x => distance(x) / typicalDist,
      q: qAt, beta,
      observed: { min: ys[0], max: ys[ys.length - 1], median: E.quantile(ys, 0.5) },
      predictRaw: x => full.fitted.predict([x])[0]
    };
  }

  /* The envelope: what the corpus actually covers. Everything the sandbox says about
     extrapolation is measured against this rather than guessed at. */
  function summarise(prof, featureNames) {
    const out = { numeric: {}, categorical: {} };
    for (const name of featureNames) {
      const col = prof.columns.find(c => c.name === name);
      if (!col) continue;
      if (col.kind === 'numeric') {
        const vals = col.values.filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);
        if (!vals.length) continue;
        out.numeric[name] = {
          min: vals[0], max: vals[vals.length - 1],
          p5: E.quantile(vals, 0.05), p95: E.quantile(vals, 0.95), median: E.quantile(vals, 0.5), n: vals.length
        };
      } else {
        const counts = {};
        col.values.forEach(v => { if (v !== null && String(v).trim()) counts[String(v).trim()] = (counts[String(v).trim()] || 0) + 1; });
        out.categorical[name] = { levels: Object.keys(counts).sort((a, b) => counts[b] - counts[a]), counts };
      }
    }
    return out;
  }

  /* A prediction, with everything that qualifies it attached rather than mentioned in a
     footnote: which inputs sit outside the corpus, which levels had to be substituted, how
     far from the data the point is, and whether a cap is doing the talking. */
  function predict(models, env, values, opt) {
    opt = opt || {};
    const conf = opt.confidence || 0.9;
    const resolved = {}, substitutions = [], outside = [], blocking = [];
    for (const name of Object.keys(values)) resolved[name] = values[name];

    for (const name of Object.keys(env.categorical)) {
      const known = env.categorical[name].levels;
      const table = /promoter/i.test(name) ? PROMOTERS : /marker|selection/i.test(name) ? MARKERS : null;
      const raw = norm(values[name]);
      if (!raw) continue;
      const hit = nearestLevel(raw, known, table);
      if (!hit || !hit.level) {
        blocking.push({ field: name, value: raw, why: hit ? hit.why : 'unknown level' });
        continue;
      }
      resolved[name] = hit.level;
      if (!hit.exact) substitutions.push({ field: name, entered: raw, used: hit.level, why: hit.why });
    }
    for (const name of Object.keys(env.numeric)) {
      const v = Number(values[name]);
      if (!isFinite(v)) continue;
      const e = env.numeric[name];
      if (v < e.min || v > e.max) {
        outside.push({ field: name, value: v, min: e.min, max: e.max, by: v < e.min ? e.min - v : v - e.max });
      }
    }
    if (blocking.length) return { ok: false, blocking, substitutions, outside };

    const results = {};
    let maxDist = 0;
    for (const k of Object.keys(models)) {
      const m = models[k];
      const x = m.enc.encodeValues(resolved);
      const raw = m.predictRaw(x);
      const d = m.distance(x);
      maxDist = Math.max(maxDist, d);
      const half = m.q(conf) * (m.beta + d);
      /* The cap is a stated assumption about metabolic burden, not something the data
         implies, so it is reported whenever it binds instead of silently flattening the
         answer. Default: a quarter above the best run ever seen. */
      const cap = opt.caps && isFinite(opt.caps[k]) ? Number(opt.caps[k]) : m.observed.max * 1.25;
      const capped = raw > cap;
      const value = Math.max(0, Math.min(raw, cap));
      results[k] = {
        target: m.target, value, uncapped: raw, cap, capped,
        low: Math.max(0, value - half), high: Math.min(cap, value + half),
        halfWidth: half, distance: d, model: m.modelName, r2: m.r2, observed: m.observed
      };
    }
    /* How far outside the data this is, in one number, because that is what decides whether
       the answer is a prediction or an extrapolation dressed as one. */
    const trust = maxDist <= 1.2 ? 'inside' : maxDist <= 2 ? 'edge' : 'outside';
    return { ok: true, results, substitutions, outside, distance: maxDist, trust, confidence: conf, resolved };
  }

  /* When the sandbox is being asked about a region the corpus does not cover, the honest
     product is not a confident number: it is the four runs that would make the number
     trustworthy. Built over the inputs that are furthest outside, at the corners. */
  function suggestDOE(env, values, outside, opt) {
    opt = opt || {};
    const seed = opt.seed || 7;
    const picks = outside.slice().sort((a, b) => b.by - a.by).slice(0, 2).map(o => o.field);
    const fields = picks.slice();
    // If nothing is outside, screen whichever numeric inputs the construct sits furthest
    // from the middle of, so the sheet is still about the uncertain part of the space.
    if (fields.length < 2) {
      const rest = Object.keys(env.numeric).filter(n => fields.indexOf(n) < 0).map(n => {
        const e = env.numeric[n], v = Number(values[n]);
        const span = (e.max - e.min) || 1;
        return { n, off: isFinite(v) ? Math.abs(v - e.median) / span : 0 };
      }).sort((a, b) => b.off - a.off);
      for (const r of rest) { if (fields.length >= 2) break; fields.push(r.n); }
    }
    if (fields.length < 2) return null;
    const factors = fields.slice(0, 2).map(n => {
      const e = env.numeric[n], v = Number(values[n]);
      // Bracket the setting of interest, staying inside what is physically sensible.
      const span = (e.max - e.min) || Math.abs(v) || 1;
      const lo = isFinite(v) ? Math.min(v, e.max) : e.median;
      const hi = isFinite(v) ? Math.max(v, e.max) : e.max;
      const pad = span * 0.12;
      return { name: n, low: Number((lo - pad).toFixed(3)), high: Number((hi + pad).toFixed(3)) };
    });
    const rand = E.rng(seed);
    const runs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map((c, i) => ({ std: i + 1, coded: c }));
    const order = E.shuffle(E.range(4), rand);
    order.forEach((ri, pos) => { runs[ri].run = pos + 1; });
    runs.sort((a, b) => a.run - b.run);
    return {
      factors,
      runs: runs.map(r => ({
        run: r.run, std: r.std,
        values: factors.map((f, j) => Number((r.coded[j] < 0 ? f.low : f.high).toFixed(3)))
      })),
      why: picks.length
        ? 'Both of these are outside the runs the model learned from, so the prediction there rests on the shape of the fit rather than on evidence. Four runs at the corners settle it.'
        : 'Nothing is outside the historical range, so this screens the two inputs this construct sits furthest from the middle on.'
    };
  }

  /* ---- Forecasting a whole proposed run sheet ----

     The desk answers one question: what would THIS construct give. A screening programme
     asks a different one - of the runs I am about to book, which are worth booking, and
     will the sheet even tell them apart. Three things change when the question moves from
     one row to many, and each is a way to be wrong that a per-row number hides.

     First, the envelope flag has to stay per row. A sheet built to probe a new region will
     have some rows inside the corpus and some outside it; reporting one standing for the
     whole sheet turns a mixed sheet into a uniformly confident one.

     Second, the conformal guarantee is MARGINAL. A 90% interval covers 90% of rows on
     average. It does not mean every row of a sixteen-run sheet lands inside its band with
     90% probability - even if the rows were independent that would be 0.9^16, about 19%.
     So the sheet offers a simultaneous mode: spend the error budget across the rows
     (Bonferroni) so the claim being made is the one a programme actually needs. Both the
     shortfall and the fix are measured in the tests rather than asserted here.

     Third, a calibration slice can only support so narrow a tail. The widest band split
     conformal can honestly quote is the largest calibration score, which caps the
     achievable confidence at nCal/(nCal+1). Past that the band is a floor, not a
     guarantee, and it says so instead of printing a number that looks the same.

     Fourth, the errors across one sheet are not independent anyway - every row comes off
     the same fitted model - so a simultaneous band is conservative and a per-row band is
     optimistic about the sheet as a whole. The tool reports which one it is showing. */

  /* A design from suggestDOE, turned into rows the forecaster can take. Everything the
     design does not set is held at the desk settings, which is what the run sheet means. */
  function sheetFromDesign(design, values) {
    if (!design || !design.runs) return [];
    return design.runs.map(r => {
      const v = {};
      for (const k of Object.keys(values || {})) v[k] = values[k];
      design.factors.forEach((f, j) => { v[f.name] = r.values[j]; });
      return { run: r.run, std: r.std, values: v };
    });
  }

  /* A pasted sheet, mapped onto the features the model was fitted on. Columns are matched
     by name, loosely enough that "CAI" finds "CAI_Score"; anything unrecognised is listed
     rather than dropped in silence, and any feature the sheet does not carry is named as
     having been held at the desk setting. A column nobody can place is not quietly
     ignored, because a run sheet missing the factor you care about looks identical to one
     that has it until the predictions come back flat. */
  function parseRunSheet(table, env, defaults) {
    const numericNames = Object.keys(env.numeric), catNames = Object.keys(env.categorical);
    const featureNames = numericNames.concat(catNames);
    const cols = (table && table.columns) || [];
    const map = {}, ignored = [];
    let runIdx = -1, stdIdx = -1;
    cols.forEach((c, i) => {
      const k = key(c);
      if (/^run(order|no|number|id)?$/.test(k)) { runIdx = i; return; }
      if (/^std(order|no|number)?$/.test(k)) { stdIdx = i; return; }
      const exact = featureNames.find(f => key(f) === k);
      if (exact) { map[i] = exact; return; }
      const loose = k.length >= 3 ? featureNames.filter(f => key(f).indexOf(k) >= 0 || k.indexOf(key(f)) >= 0)
        .sort((a, b) => key(b).length - key(a).length)[0] : null;
      if (loose) { map[i] = loose; return; }
      ignored.push(c);
    });
    const idxs = Object.keys(map);
    const carried = idxs.map(i => map[i]);
    const held = featureNames.filter(f => carried.indexOf(f) < 0 && defaults && defaults[f] !== undefined && String(defaults[f]).trim() !== '');
    const missing = featureNames.filter(f => carried.indexOf(f) < 0 && held.indexOf(f) < 0);
    const rows = (table.rows || []).map((r, ri) => {
      const v = {};
      for (const f of featureNames) if (defaults && defaults[f] !== undefined) v[f] = defaults[f];
      for (const i of idxs) {
        const f = map[i], raw = r[i];
        if (raw === null || raw === undefined || String(raw).trim() === '') continue;
        v[f] = numericNames.indexOf(f) >= 0 ? Number(raw) : norm(raw);
      }
      return {
        run: runIdx >= 0 && isFinite(Number(r[runIdx])) ? Number(r[runIdx]) : ri + 1,
        std: stdIdx >= 0 && isFinite(Number(r[stdIdx])) ? Number(r[stdIdx]) : null,
        values: v
      };
    });
    return {
      rows,
      mapped: idxs.map(i => ({ column: cols[i], feature: map[i] })),
      ignored, held, missing,
      factors: carried.slice()
    };
  }

  /* Every row of the sheet, each with its own interval and its own standing against the
     corpus. A row the sheet cannot fill is refused rather than completed from the desk
     without saying so - a blank promoter column would otherwise become the reference
     level, which is the failure this whole module is built to avoid. */
  function forecastSheet(models, env, rows, opt) {
    opt = opt || {};
    const conf = opt.confidence || 0.9;
    const n = (rows || []).length;
    if (!n) return { ok: false, why: 'The run sheet has no rows to forecast.' };
    const keys = Object.keys(models);
    if (!keys.length) return { ok: false, why: 'No model has been fitted yet.' };

    const simultaneous = !!opt.simultaneous;
    const rowConf = simultaneous ? 1 - (1 - conf) / n : conf;
    /* What the calibration slice can actually support. Asking for a tighter tail than
       nCal+1 order statistics can resolve does not fail - it saturates at the widest
       calibration score - so the shortfall is reported rather than hidden. */
    let maxConf = 1, nCalMin = Infinity;
    for (const k of keys) {
      const m = models[k];
      if (isFinite(m.maxConf)) maxConf = Math.min(maxConf, m.maxConf);
      if (isFinite(m.nCal)) nCalMin = Math.min(nCalMin, m.nCal);
    }
    const supported = rowConf <= maxConf + 1e-12;

    const featureNames = Object.keys(env.numeric).concat(Object.keys(env.categorical));
    const out = (rows || []).map((r, i) => {
      const values = r.values || {};
      const blanks = featureNames.filter(f => {
        const v = values[f];
        if (v === undefined || v === null || String(v).trim() === '') return true;
        return !!env.numeric[f] && !isFinite(Number(v));
      }).map(f => ({
        field: f, value: '(blank)',
        why: 'the run sheet does not give it and no desk setting stands in for it, so filling it would mean inventing a level'
      }));
      const head = { run: r.run != null ? r.run : i + 1, std: r.std == null ? null : r.std, values };
      if (blanks.length) return Object.assign(head, { ok: false, blocking: blanks, substitutions: [], outside: [] });
      return Object.assign(head, predict(models, env, values, { confidence: rowConf, caps: opt.caps }));
    });

    const done = out.filter(r => r.ok);
    /* Two different things get counted, because conflating them is the easiest way to
       mislead with this table. The standing (inside / edge / outside) is how far the row
       sits from the corpus in the encoded space, which is what sets the band width.
       Beyond-envelope is the separate, blunter fact that some input is past the measured
       range of that column. A row can be comfortably near the data on the whole and still
       be past the end of one input, and the reverse happens too. */
    const tally = { n, refused: out.length - done.length, inside: 0, edge: 0, outside: 0, beyondEnvelope: 0 };
    done.forEach(r => { tally[r.trust]++; if (r.outside.length) tally.beyondEnvelope++; });

    const byTarget = {};
    for (const k of keys) {
      const vals = done.map(r => ({
        run: r.run, value: r.results[k].value, low: r.results[k].low, high: r.results[k].high,
        half: r.results[k].halfWidth, trust: r.trust, capped: r.results[k].capped
      }));
      if (!vals.length) continue;
      const ranked = vals.slice().sort((a, b) => b.value - a.value);
      const best = ranked[0], worst = ranked[ranked.length - 1];
      /* Whether the sheet can rank its own rows. Two runs are separated at this confidence
         only if their bands do not overlap; if the best row's band overlaps everything,
         running the sheet will not order the candidates however carefully it is executed.
         Better to know that before it is booked than after. */
      const overlapping = ranked.slice(1).filter(x => x.high >= best.low);
      byTarget[k] = {
        target: models[k].target, model: models[k].modelName, r2: models[k].r2,
        best, worst, spread: best.value - worst.value,
        meanHalfWidth: vals.reduce((s, x) => s + x.half, 0) / vals.length,
        maxHalfWidth: vals.reduce((s, x) => Math.max(s, x.half), 0),
        indistinguishable: overlapping.map(x => x.run),
        separated: overlapping.length === 0,
        bestBeatsWorst: ranked.length > 1 && best.low > worst.high,
        capped: vals.filter(x => x.capped).length,
        observed: models[k].observed
      };
    }
    return {
      ok: true, confidence: conf, rowConfidence: rowConf, simultaneous,
      supported, maxConf, nCal: isFinite(nCalMin) ? nCalMin : null,
      rows: out, tally, byTarget
    };
  }

  root.MLPlasmid = { PROMOTERS, MARKERS, nearestLevel, trainTarget, summarise, predict, suggestDOE,
    sheetFromDesign, parseRunSheet, forecastSheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLPlasmid;
})(typeof globalThis !== 'undefined' ? globalThis : this);
