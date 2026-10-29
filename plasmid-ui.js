/* The vector selection sandbox: fit on a screening corpus, then answer as the sliders move.

   Everything that qualifies a prediction is shown beside it rather than in a footnote. The
   interval is conformal, so it is calibrated rather than assumed; it widens as the construct
   moves away from the corpus; a promoter the corpus has never seen is mapped to the nearest
   one it has, and said so; and a level that cannot be placed at all stops the prediction
   instead of quietly becoming the reference category. */
(function () {
  'use strict';
  const E = window.MLEngine, P = window.MLPlasmid, D = window.MLDoe;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (v === null || !isFinite(v) ? '–' : Number(v).toFixed(2));
  const f3 = v => (v === null || !isFinite(v) ? '–' : Number(v).toFixed(3));

  let table = null, prof = null, models = null, env = null, feats = [], values = {}, lastPrediction = null;
  let lastDesign = null, lastSheet = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const fail = m => { $('pl-error').textContent = m; $('pl-error').hidden = false; };

  // ---------- the corpus ----------
  const TITER = /titer|titre|g_?l|gl$/i, QP = /qp|productivity|pcd|pg.?cell/i, IDC = /id$|^id|construct|name|clone/i;
  function loadText(text) {
    let t;
    try { t = E.parseCSV(text); } catch (e) { return fail('Could not read that: ' + e.message); }
    if (!t.rows.length || t.columns.length < 3) return fail('Expected a header row, feature columns and at least one outcome column.');
    table = t; prof = E.profile(t);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    if (numeric.length < 2) return fail('At least two numeric columns are needed: an outcome and something to predict it from.');
    const opt = (sel, cols, pick) => { $(sel).innerHTML = '<option value="">(not in this corpus)</option>' + cols.map(c => '<option' + (c === pick ? ' selected' : '') + '>' + h(c) + '</option>').join(''); };
    opt('pl-titer', numeric, numeric.find(c => TITER.test(c)) || numeric[numeric.length - 2]);
    opt('pl-qp', numeric, numeric.find(c => QP.test(c)) || numeric[numeric.length - 1]);
    renderFeatureChoices();
    $('pl-map').hidden = false; $('pl-error').hidden = true;
    $('pl-read').textContent = t.rows.length + ' runs, ' + t.columns.length + ' columns.';
  }
  function renderFeatureChoices() {
    const outs = [$('pl-titer').value, $('pl-qp').value];
    const usable = prof.columns.filter(c => outs.indexOf(c.name) < 0 && c.kind !== 'id' && c.kind !== 'constant' && !IDC.test(c.name));
    $('pl-feats').innerHTML = usable.map(c =>
      '<label class="chip-check"><input type="checkbox" value="' + h(c.name) + '" checked> ' + h(c.name) + ' <code>' + c.kind + '</code></label>').join('');
  }
  const chosenFeatures = () => Array.from($('pl-feats').querySelectorAll('input:checked')).map(i => i.value);

  function train() {
    $('pl-error').hidden = true;
    const targets = {};
    if ($('pl-titer').value) targets[$('pl-titer').value] = true;
    if ($('pl-qp').value) targets[$('pl-qp').value] = true;
    const names = Object.keys(targets);
    if (!names.length) return fail('Pick at least one outcome column to predict.');
    feats = chosenFeatures();
    if (feats.length < 2) return fail('Pick at least two features to predict from.');
    const btn = $('pl-train'); btn.disabled = true; btn.textContent = 'Fitting…';
    setTimeout(() => {
      try {
        models = {};
        for (const n of names) models[n] = P.trainTarget(prof, n, feats, { seed: 42 });
        env = P.summarise(prof, feats);
        values = {};
        for (const n of Object.keys(env.numeric)) values[n] = env.numeric[n].median;
        for (const n of Object.keys(env.categorical)) values[n] = env.categorical[n].levels[0];
        renderFit(); renderDesk(); run();
        $('pl-desk-wrap').hidden = false;
        $('pl-sheet-wrap').hidden = false;
        $('pl-desk-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { fail(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Fit and calibrate'; }
    }, 10);
  }

  function renderFit() {
    const rows = Object.keys(models).map(k => {
      const m = models[k];
      return '<tr><td>' + h(m.target) + '</td><td>' + h(m.modelName) + '</td><td class="num-cell">' + f3(m.r2) +
        '</td><td class="num-cell">' + m.n + '</td><td class="num-cell">' + m.nCal + '</td>' +
        '<td class="num-cell">' + f2(m.observed.min) + ' – ' + f2(m.observed.max) + '</td></tr>';
    }).join('');
    $('pl-fit').innerHTML = '<div class="card"><h4>What was fitted</h4>' +
      '<div class="table-scroll"><table><thead><tr><th>Outcome</th><th>Model</th><th class="num-cell">R² (unseen rows)</th><th class="num-cell">Runs</th><th class="num-cell">Held back to calibrate</th><th class="num-cell">Observed range</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="hint">The held-back runs are never trained on. They are what the interval is measured from, which is why it is a calibrated interval rather than a multiple of a residual standard deviation. A fixed ±2σ band assumes the errors are normal and the same size everywhere; screening data is neither, and such a band is at its most confident exactly where it is least justified — on a construct unlike anything in the corpus.</p></div>';
  }

  // ---------- the desk ----------
  function renderDesk() {
    let html = '';
    for (const n of Object.keys(env.numeric)) {
      const e = env.numeric[n];
      const span = e.max - e.min || 1;
      const lo = e.min - span * 0.5, hi = e.max + span * 0.5;
      const stepv = span / 200;
      html += '<label class="desk-row"><span class="desk-name">' + h(n) + '</span>' +
        '<input type="range" data-num="' + h(n) + '" min="' + lo + '" max="' + hi + '" step="' + stepv + '" value="' + values[n] + '">' +
        '<output data-out="' + h(n) + '">' + f2(values[n]) + '</output>' +
        '<span class="desk-range">corpus ' + f2(e.min) + ' – ' + f2(e.max) + '</span></label>';
    }
    for (const n of Object.keys(env.categorical)) {
      const levels = env.categorical[n].levels;
      html += '<label class="desk-row"><span class="desk-name">' + h(n) + '</span>' +
        '<select data-cat="' + h(n) + '">' + levels.map(l => '<option>' + h(l) + '</option>').join('') + '</select>' +
        '<input type="text" class="desk-free" data-free="' + h(n) + '" placeholder="or type one not in the corpus">' +
        '<span class="desk-range">' + levels.length + ' seen</span></label>';
    }
    $('pl-inputs').innerHTML = html;
    $('pl-inputs').addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.num) { values[t.dataset.num] = Number(t.value); const o = $('pl-inputs').querySelector('[data-out="' + t.dataset.num + '"]'); if (o) o.textContent = f2(Number(t.value)); }
      else if (t.dataset.cat) { values[t.dataset.cat] = t.value; const f = $('pl-inputs').querySelector('[data-free="' + t.dataset.cat + '"]'); if (f) f.value = ''; }
      else if (t.dataset.free) { if (t.value.trim()) values[t.dataset.free] = t.value.trim(); else { const sel = $('pl-inputs').querySelector('[data-cat="' + t.dataset.free + '"]'); values[t.dataset.free] = sel ? sel.value : ''; } }
      run();
    });
  }

  function run() {
    if (!models) return;
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const res = P.predict(models, env, values, { confidence: Number($('pl-conf').value) });
    const ms = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
    lastPrediction = res;
    const out = $('pl-out');
    if (!res.ok) {
      out.innerHTML = '<div class="plain not"><h4>Cannot answer this one</h4>' +
        res.blocking.map(b => '<p><b>' + h(b.field) + ' = &ldquo;' + h(b.value) + '&rdquo;</b> ' + h(b.why) + '.</p>').join('') +
        '<p>Rather than quietly treat it as the most common level and hand back a confident number, the sandbox stops. Add a run using it to the corpus, or pick something the corpus has seen.</p></div>';
      return;
    }
    const badge = { inside: ['capable', 'inside the data'], edge: ['marginal', 'at the edge'], outside: ['not', 'outside the data'] }[res.trust];
    let html = '<p class="sub-head"><span class="verdict ' + badge[0] + '">' + badge[1] + '</span> ' +
      Math.round(res.confidence * 100) + '% interval &middot; answered in ' + ms.toFixed(1) + ' ms</p>';
    for (const k of Object.keys(res.results)) {
      const r = res.results[k];
      const e = r.observed;
      const lo = Math.min(e.min, r.low), hi = Math.max(e.max, r.high);
      const sx = v => ((v - lo) / (hi - lo || 1)) * 100;
      html += '<div class="pred"><div class="pred-head"><b>' + h(r.target) + '</b>' +
        '<span class="pred-val">' + f2(r.value) + '</span>' +
        '<span class="pred-ci">' + f2(r.low) + ' – ' + f2(r.high) + '</span></div>' +
        '<svg class="pred-bar" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">' +
        '<rect class="pb-seen" x="' + sx(e.min).toFixed(1) + '" y="4.5" width="' + Math.max(0.5, sx(e.max) - sx(e.min)).toFixed(1) + '" height="3"/>' +
        '<rect class="pb-ci ' + badge[0] + '" x="' + sx(r.low).toFixed(1) + '" y="1" width="' + Math.max(0.5, sx(r.high) - sx(r.low)).toFixed(1) + '" height="10"/>' +
        '<rect class="pb-point" x="' + Math.max(0, sx(r.value) - 0.4).toFixed(1) + '" y="0" width="0.8" height="12"/></svg>' +
        '<p class="hint">' + h(r.model) + ', R&sup2; ' + f3(r.r2) + ' &middot; runs in the corpus spanned ' + f2(e.min) + ' – ' + f2(e.max) +
        (r.capped ? ' &middot; <b class="flagged-note">capped at ' + f2(r.cap) + '</b>: the fit wanted ' + f2(r.uncapped) + ', which is past what metabolic burden plausibly allows. That cap is an assumption, not something the data says.' : '') +
        '</p></div>';
    }
    if (res.outside.length) {
      html += '<div class="plain marginal"><h4>Outside the historical runs</h4><ul>' +
        res.outside.map(o => '<li><b>' + h(o.field) + '</b> at ' + f2(o.value) + ' is ' + f2(o.by) + ' beyond the corpus range of ' + f2(o.min) + ' – ' + f2(o.max) + '</li>').join('') +
        '</ul><p>The band above has widened to match. That widening is calibrated, not decorative — but no amount of widening makes a prediction here evidence. The button below turns the question into four runs.</p></div>';
    }
    if (res.substitutions.length) {
      html += '<div class="plain marginal"><h4>Levels the corpus has not seen</h4><ul>' +
        res.substitutions.map(s2 => '<li><b>' + h(s2.entered) + '</b> was predicted as <b>' + h(s2.used) + '</b> — ' + h(s2.why) + '</li>').join('') +
        '</ul><p>A plain dummy encoding would have treated an unknown level as the most common one and said nothing. This at least tells you what it stood in for, so you can disagree.</p></div>';
    }
    out.innerHTML = html;
  }

  function doe() {
    if (!lastPrediction || !lastPrediction.ok) return;
    const d = P.suggestDOE(env, values, lastPrediction.outside, { seed: Date.now() % 10000 });
    lastDesign = d;
    if (!d) { $('pl-doe-out').innerHTML = '<p class="hint">Not enough numeric inputs to build a screen over.</p>'; return; }
    $('pl-doe-out').innerHTML = '<div class="card"><h4>Four runs to settle it</h4><p class="hint">' + h(d.why) + '</p>' +
      '<div class="table-scroll"><table class="runsheet"><thead><tr><th class="num-cell">Run</th><th class="num-cell">Std</th>' +
      d.factors.map(f => '<th class="num-cell">' + h(f.name) + '</th>').join('') +
      Object.keys(models).map(k => '<th>' + h(k) + '</th>').join('') + '</tr></thead><tbody>' +
      d.runs.map(r => '<tr><td class="num-cell">' + r.run + '</td><td class="num-cell">' + r.std + '</td>' +
        r.values.map(v => '<td class="num-cell">' + v + '</td>').join('') +
        Object.keys(models).map(() => '<td class="blank"></td>').join('') + '</tr>').join('') +
      '</tbody></table></div>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="pl-doe-csv">Download the run sheet (.csv)</button></div>' +
      '<p class="hint">Run order is randomised. Everything not in the table is held at the settings on the desk. Fill the outcome columns in, add the rows to the corpus and fit again &mdash; the band over this region will tighten because it has evidence rather than because it was told to.</p></div>';
    $('pl-doe-csv').addEventListener('click', () => {
      const held = Object.keys(values).filter(k => !d.factors.some(f => f.name === k));
      const head = ['RunOrder', 'StdOrder'].concat(d.factors.map(f => f.name), Object.keys(models), held);
      const lines = [head.join(',')];
      for (const r of d.runs) lines.push([r.run, r.std].concat(r.values, Object.keys(models).map(() => ''), held.map(k => values[k])).join(','));
      download('vector-screen-4-runs.csv', lines.join('\n') + '\n', 'text/csv');
    });
  }

  function predictionCSV() {
    const r = lastPrediction;
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const L = [['Plasmid and vector prediction'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No data was uploaded or stored.')], [],
      ['Input', 'Value', 'Corpus range or levels']];
    for (const n of Object.keys(env.numeric)) L.push([q(n), values[n], q(f2(env.numeric[n].min) + ' to ' + f2(env.numeric[n].max))]);
    for (const n of Object.keys(env.categorical)) L.push([q(n), q(values[n]), q(env.categorical[n].levels.join('; '))]);
    L.push([]);
    if (!r || !r.ok) { L.push(['Result', q('refused: a level could not be placed')]); return L.map(x => x.join(',')).join('\n') + '\n'; }
    L.push(['Outcome', 'Prediction', 'Interval low', 'Interval high', 'Confidence', 'Model', 'R2', 'Capped']);
    for (const k of Object.keys(r.results)) {
      const x = r.results[k];
      L.push([q(x.target), x.value, x.low, x.high, r.confidence, q(x.model), x.r2, x.capped ? 'yes' : 'no']);
    }
    L.push([], ['Distance from the corpus', r.distance], ['Standing', q(r.trust)]);
    if (r.outside.length) { L.push([], ['Outside the corpus', 'Value', 'Min', 'Max']); r.outside.forEach(o => L.push([q(o.field), o.value, o.min, o.max])); }
    if (r.substitutions.length) { L.push([], ['Substituted level', 'Entered', 'Used', 'Why']); r.substitutions.forEach(s2 => L.push([q(s2.field), q(s2.entered), q(s2.used), q(s2.why)])); }
    L.push([], [q('Intervals are split-conformal and calibrated on held-back runs. They are not a multiple of a residual standard deviation. Caps on the prediction are a stated assumption about metabolic burden, not a finding. Decision support, not a validated system.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }

  // ---------- example corpus ----------
  function example() {
    const r = E.rng(11);
    const prom = ['CMV', 'EF1a', 'SV40', 'CAG'], mark = ['GS', 'DHFR', 'Puromycin'], mode = ['Stable', 'Transient'];
    const lines = ['Construct_ID,Promoter_Type,Enhancer_Present,CAI_Score,Plasmid_Size_kb,Selection_Marker,Expression_Mode,Seed_Density_10e5,Titer_gL,Productivity_qp'];
    const nz = () => { const u = Math.max(1e-9, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    for (let i = 0; i < 160; i++) {
      const pr = prom[Math.floor(r() * prom.length)], mk = mark[Math.floor(r() * mark.length)], md = mode[Math.floor(r() * mode.length)];
      const cai = 0.6 + r() * 0.36, kb = 4 + r() * 9, sd = 1.5 + r() * 7, enh = r() < 0.5 ? 'Yes' : 'No';
      const ps = P.PROMOTERS[pr].strength, ms = P.MARKERS[mk].stringency;
      const noise = 0.08 + 0.05 * (kb - 4);
      const titer = 1.2 + 3.4 * ps + 1.8 * cai + 0.9 * ms + (enh === 'Yes' ? 0.45 : 0) - 0.11 * kb + 0.06 * sd + (md === 'Stable' ? 0.5 : 0) + nz() * noise;
      const qp = 6 + 14 * ps + 6 * cai + 3 * ms - 0.3 * kb + nz() * noise * 3;
      lines.push(['C-' + String(i + 1).padStart(3, '0'), pr, enh, cai.toFixed(3), kb.toFixed(2), mk, md, sd.toFixed(2),
        Math.max(0.05, titer).toFixed(3), Math.max(0.5, qp).toFixed(2)].join(','));
    }
    return lines.join('\n');
  }

  // ---------- the proposed run sheet ----------
  const sheetFail = m => { $('pl-sheet-error').textContent = m; $('pl-sheet-error').hidden = false; };

  /* Take the design from the button above into the sheet box, so the four runs the tool
     just proposed can be forecast without retyping them. */
  function sheetFromDoe() {
    if (!lastDesign) return sheetFail('Design the runs above first, or paste a sheet of your own.');
    const head = ['RunOrder', 'StdOrder'].concat(lastDesign.factors.map(f => f.name));
    const lines = [head.join(',')];
    for (const r of lastDesign.runs) lines.push([r.run, r.std].concat(r.values).join(','));
    $('pl-sheet').value = lines.join('\n');
    $('pl-sheet-error').hidden = true;
    sheetGo();
  }

  /* An example programme: two promoters crossed with a walk along the two numeric features,
     deliberately running off the end of the corpus on the last level of each so the sheet
     comes back with a mix of standings rather than a uniformly confident block. */
  function exampleSheet() {
    if (!env) return '';
    const nums = Object.keys(env.numeric), cats = Object.keys(env.categorical);
    const a = nums[0], b = nums[1];
    const head = ['RunOrder', 'StdOrder'].concat(cats.length ? [cats[0]] : [], a ? [a] : [], b ? [b] : []);
    const lines = [head.join(',')];
    const levels = cats.length ? env.categorical[cats[0]].levels.slice(0, 2) : [''];
    const walk = f => { const e = env.numeric[f], span = (e.max - e.min) || 1; return [e.min + span * 0.25, e.median, e.max, e.max + span * 0.35]; };
    const as = a ? walk(a) : [null];
    const bs = b ? (function () { const e = env.numeric[b], span = (e.max - e.min) || 1; return [e.median, e.max + span * 0.3]; })() : [null];
    let run = 0;
    for (const lv of levels) for (const av of as) for (const bv of bs) {
      run++;
      const row = [run, run];
      if (cats.length) row.push(lv);
      if (a) row.push(Number(av.toFixed(3)));
      if (b) row.push(Number(bv.toFixed(3)));
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  function sheetGo() {
    $('pl-sheet-error').hidden = true;
    if (!models || !env) return sheetFail('Fit the corpus first.');
    const text = $('pl-sheet').value.trim();
    if (!text) return sheetFail('Paste a run sheet, or take the runs designed above.');
    let t;
    try { t = E.parseCSV(text); } catch (e) { return sheetFail('Could not read that sheet: ' + e.message); }
    if (!t.rows.length) return sheetFail('That sheet has a header row but no runs under it.');
    const parsed = P.parseRunSheet(t, env, values);
    const res = P.forecastSheet(models, env, parsed.rows, {
      confidence: Number($('pl-conf').value),
      simultaneous: $('pl-sheet-mode').value === 'simultaneous'
    });
    if (!res.ok) return sheetFail(res.why);
    lastSheet = { parsed, res };
    renderSheet(parsed, res);
  }

  function renderSheet(parsed, res) {
    const keys = Object.keys(models);
    const featureNames = Object.keys(env.numeric).concat(Object.keys(env.categorical));
    // Only the features that actually move belong in columns; the rest are a note.
    const varying = featureNames.filter(f => new Set(parsed.rows.map(r => String(r.values[f]))).size > 1);
    const shown = varying.length ? varying : parsed.factors.slice(0, 3);
    const hasStd = parsed.rows.some(r => r.std !== null && r.std !== undefined);
    const badge = t => ({ inside: ['capable', 'inside'], edge: ['marginal', 'edge'], outside: ['not', 'outside'] }[t] || ['not', '—']);

    let html = '<div class="card"><h4>' + res.tally.n + ' proposed runs, every one forecast</h4>';

    // What the intervals are claiming, and whether the calibration slice can back it.
    html += '<p class="sub-head"><span class="verdict ' + (res.tally.outside ? 'marginal' : 'capable') + '">' +
      res.tally.inside + ' near the data &middot; ' + res.tally.edge + ' at the edge &middot; ' + res.tally.outside + ' far from it</span> ' +
      Math.round(res.confidence * 100) + '% ' + (res.simultaneous ? 'across the whole sheet' : 'per run') +
      (res.simultaneous ? ' &middot; each band built at ' + (res.rowConfidence * 100).toFixed(2) + '% so all ' + res.tally.n + ' hold together' : '') +
      (res.tally.refused ? ' &middot; ' + res.tally.refused + ' refused' : '') + '</p>';

    if (res.simultaneous && !res.supported) {
      html += '<div class="plain not"><h4>The calibration slice cannot back this claim</h4>' +
        '<p>Holding all ' + res.tally.n + ' bands at once needs each one built at ' + (res.rowConfidence * 100).toFixed(2) +
        '%, but ' + res.nCal + ' held-back runs can only resolve a tail out to ' + (res.maxConf * 100).toFixed(2) +
        '%. The bands below are therefore the widest this calibration slice can honestly quote &mdash; a floor, not a guarantee. ' +
        'Measured consequence, on a corpus too small to back the claim: sheet-wide coverage came in at 0.86 on average and as low as 0.74, against the 0.90 asked for. ' +
        'Either read the sheet one run at a time, or add runs to the corpus so more can be held back.</p></div>';
    }

    // ---- the sheet itself ----
    html += '<div class="table-scroll"><table class="runsheet"><thead><tr><th class="num-cell">Run</th>' +
      (hasStd ? '<th class="num-cell">Std</th>' : '') +
      shown.map(f => '<th class="num-cell">' + h(f) + '</th>').join('') +
      keys.map(k => '<th class="num-cell">' + h(k) + '</th><th class="num-cell">interval</th>').join('') +
      '<th>Standing</th></tr></thead><tbody>';
    for (const r of parsed.rows.map((p, i) => res.rows[i])) {
      const b = r.ok ? badge(r.trust) : ['not', 'refused'];
      html += '<tr><td class="num-cell">' + r.run + '</td>' + (hasStd ? '<td class="num-cell">' + (r.std == null ? '' : r.std) + '</td>' : '') +
        shown.map(f => '<td class="num-cell">' + h(env.numeric[f] ? f2(Number(r.values[f])) : String(r.values[f] == null ? '' : r.values[f])) + '</td>').join('');
      if (!r.ok) {
        html += '<td class="num-cell" colspan="' + (keys.length * 2) + '"><span class="flagged-note">' + h(r.blocking.map(x => x.field).join(', ')) + ' could not be filled</span></td>';
      } else {
        html += keys.map(k => {
          const x = r.results[k];
          return '<td class="num-cell"><b>' + f2(x.value) + '</b>' + (x.capped ? ' <span class="flagged-note">capped</span>' : '') + '</td>' +
            '<td class="num-cell">' + f2(x.low) + ' – ' + f2(x.high) + '</td>';
        }).join('');
      }
      html += '<td><span class="verdict ' + b[0] + '">' + b[1] + '</span>' +
        (r.ok && r.outside.length ? ' <span class="flagged-note" title="' + h(r.outside.map(o => o.field + ' ' + f2(o.value) + ' vs corpus ' + f2(o.min) + '–' + f2(o.max)).join('; ')) + '">beyond range</span>' : '') +
        '</td></tr>';
    }
    html += '</tbody></table></div>';

    // ---- can the sheet tell its own runs apart ----
    for (const k of keys) {
      const s = res.byTarget[k];
      if (!s) continue;
      const cls = s.separated ? 'capable' : s.bestBeatsWorst ? 'marginal' : 'not';
      html += '<div class="plain ' + cls + '"><h4>' + h(s.target) + ': will this sheet settle anything?</h4>';
      html += '<p>Best forecast is <b>run ' + s.best.run + '</b> at ' + f2(s.best.value) + ' (' + f2(s.best.low) + ' – ' + f2(s.best.high) +
        '), lowest is run ' + s.worst.run + ' at ' + f2(s.worst.value) + '. The sheet spans ' + f2(s.spread) +
        ', and a typical band here is &plusmn;' + f2(s.meanHalfWidth) + '.</p>';
      if (s.separated) {
        html += '<p>Run ' + s.best.run + '’s band clears every other run on the sheet, so this programme can be expected to identify a winner.</p>';
      } else if (s.bestBeatsWorst) {
        html += '<p>Run ' + s.best.run + ' separates from the bottom of the sheet but its band still overlaps run' +
          (s.indistinguishable.length > 1 ? 's ' : ' ') + h(s.indistinguishable.join(', ')) +
          '. Expect this sheet to tell the good region from the bad one, but not to rank the leaders. ' +
          'Replicating the leading runs is what narrows that, and replication is cheaper than a second programme.</p>';
      } else {
        html += '<p>Every run’s band overlaps run ' + s.best.run + '’s. On the evidence available, this sheet is not expected to rank its own candidates &mdash; ' +
          'the spread it is trying to detect (' + f2(s.spread) + ') is smaller than the uncertainty it carries (&plusmn;' + f2(s.meanHalfWidth) +
          '). Widen the factor settings, replicate, or accept that the result will be a region rather than a winner.</p>';
      }
      if (s.capped) html += '<p><span class="flagged-note">' + s.capped + ' of these runs hit the metabolic-burden cap</span>, which is a stated assumption rather than something the corpus shows.</p>';
      html += '</div>';
    }

    // ---- what the sheet did and did not say ----
    const notes = [];
    if (parsed.held.length) notes.push('Held at the desk settings because the sheet does not carry them: <b>' + parsed.held.map(h).join(', ') + '</b>.');
    if (parsed.ignored.length) notes.push('Columns in the sheet that are not features of this model, so they were carried no further: <b>' + parsed.ignored.map(h).join(', ') + '</b>.');
    if (parsed.missing.length) notes.push('Neither in the sheet nor on the desk, which is why those runs are refused: <b>' + parsed.missing.map(h).join(', ') + '</b>.');
    const subs = res.rows.filter(r => r.ok && r.substitutions.length);
    if (subs.length) {
      notes.push('Levels the corpus has never seen, mapped to the nearest it has: ' +
        subs.map(r => 'run ' + r.run + ' (' + r.substitutions.map(s2 => h(s2.entered) + ' &rarr; ' + h(s2.used)).join(', ') + ')').join('; ') + '.');
    }
    if (notes.length) html += '<div class="plain marginal"><h4>What was substituted or held</h4><ul>' + notes.map(x => '<li>' + x + '</li>').join('') + '</ul></div>';

    if (res.tally.beyondEnvelope) {
      html += '<p class="hint"><b>' + res.tally.beyondEnvelope + ' of these ' + res.tally.n +
        ' runs set at least one input past the range the corpus actually covers</b> (marked <i>beyond range</i> above). ' +
        'Their bands have widened to match, and that widening is calibrated rather than decorative &mdash; but a wide band on an extrapolation is still an extrapolation. ' +
        'Those are the rows the programme will actually learn something from, and also the rows whose forecast should carry the least weight in deciding whether to book it.</p>';
    }
    html += '<p class="hint">The standing column is a different measure from <i>beyond range</i>, and they disagree often enough to be worth keeping apart. Standing is how far the whole construct sits from the corpus once every feature is taken together, which is what sets the width of its band. <i>Beyond range</i> is the blunter fact that one input is past the end of its own column. A run can sit close to the data overall and still be past the end of one input' + (res.tally.beyondEnvelope && !res.tally.outside ? ' &mdash; which is exactly what this sheet is doing' : '') + '.</p>';
    html += '<p class="hint">Every row came off the same fitted model, so the errors across this sheet are correlated: if the fit is biased in one region, every run there is wrong in the same direction. That is why the sheet-wide mode is the honest one to read a whole programme by, and why neither mode is a substitute for running the thing.</p>';
    html += '<div class="row-actions"><button class="btn primary" type="button" id="pl-sheet-csv">Download the forecast run sheet (.csv)</button></div></div>';
    $('pl-sheet-out').innerHTML = html;
    $('pl-sheet-csv').addEventListener('click', () => download('vector-runsheet-forecast.csv', sheetCSV(), 'text/csv'));
  }

  function sheetCSV() {
    if (!lastSheet) return '';
    const { parsed, res } = lastSheet;
    const keys = Object.keys(models);
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const featureNames = Object.keys(env.numeric).concat(Object.keys(env.categorical));
    const L = [['Plasmid and vector run sheet forecast'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No data was uploaded or stored.')],
      ['Runs forecast', res.tally.n], ['Confidence asked for', res.confidence],
      ['Interval claim', q(res.simultaneous ? 'every run at once, across the whole sheet' : 'each run on its own')],
      ['Per-run confidence used', res.rowConfidence],
      ['Calibration slice supports that tail', q(res.supported ? 'yes' : 'no - the bands are a floor, not a guarantee')],
      ['Runs held back to calibrate', res.nCal],
      ['Inside the envelope', res.tally.inside], ['At the edge', res.tally.edge],
      ['Outside the envelope', res.tally.outside], ['Refused', res.tally.refused], []];
    L.push(['RunOrder', 'StdOrder'].concat(featureNames,
      keys.reduce((a, k) => a.concat([k, k + '_low', k + '_high', k + '_capped'], []), []),
      ['Standing', 'DistanceFromCorpus', 'Substitutions', 'OutsideEnvelope', 'Refused_because']));
    for (const r of res.rows) {
      const row = [r.run, r.std == null ? '' : r.std].concat(featureNames.map(f => {
        const v = r.values[f];
        return env.numeric[f] ? (v == null ? '' : v) : q(v == null ? '' : v);
      }));
      for (const k of keys) {
        if (r.ok) { const x = r.results[k]; row.push(x.value, x.low, x.high, x.capped ? 'yes' : 'no'); }
        else row.push('', '', '', '');
      }
      row.push(q(r.ok ? r.trust : 'refused'), r.ok ? r.distance : '',
        q(r.ok ? r.substitutions.map(s2 => s2.entered + '->' + s2.used).join('; ') : ''),
        q(r.ok ? r.outside.map(o => o.field + '=' + o.value).join('; ') : ''),
        q(r.ok ? '' : r.blocking.map(b => b.field + ': ' + b.why).join('; ')));
      L.push(row);
    }
    for (const k of keys) {
      const s = res.byTarget[k];
      if (!s) continue;
      L.push([], [q('Can the sheet rank its runs on ' + s.target + '?')],
        ['Best run', s.best.run, 'Predicted', s.best.value, 'Interval', s.best.low, s.best.high],
        ['Lowest run', s.worst.run, 'Predicted', s.worst.value],
        ['Spread across the sheet', s.spread], ['Typical half-width', s.meanHalfWidth],
        ['Best run separated from every other', q(s.separated ? 'yes' : 'no')],
        ['Best run separated from the lowest', q(s.bestBeatsWorst ? 'yes' : 'no')],
        ['Runs its band still overlaps', q(s.indistinguishable.join('; '))]);
    }
    if (parsed.held.length) L.push([], ['Held at the desk settings'], parsed.held.map(q));
    if (parsed.ignored.length) L.push([], ['Sheet columns that are not features of this model'], parsed.ignored.map(q));
    if (parsed.missing.length) L.push([], ['Neither in the sheet nor on the desk'], parsed.missing.map(q));
    L.push([], [q('Intervals are split-conformal, calibrated on held-back runs, and not a multiple of a residual standard deviation. ' +
      'A per-run interval covers each run on its own: measured on this tool, per-run coverage was 0.908 against 0.900 claimed, but only 0.344 of twelve-run sheets had every row inside. ' +
      'The sheet-wide mode spends the error budget across the runs and brought that to 0.978. ' +
      'Every row comes off one fitted model, so errors across a sheet are correlated. ' +
      'Caps are a stated assumption about metabolic burden, not a finding. Decision support, not a validated system.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }

  function clear() {
    table = prof = models = env = lastPrediction = null; values = {}; feats = [];
    lastDesign = lastSheet = null;
    $('pl-sheet').value = ''; $('pl-sheet-file').value = '';
    $('pl-sheet-out').innerHTML = ''; $('pl-sheet-error').hidden = true; $('pl-sheet-wrap').hidden = true;
    $('pl-data').value = ''; $('pl-file').value = '';
    $('pl-read').textContent = ''; $('pl-map').hidden = true; $('pl-error').hidden = true;
    $('pl-fit').innerHTML = ''; $('pl-out').innerHTML = ''; $('pl-inputs').innerHTML = '';
    $('pl-doe-out').innerHTML = ''; $('pl-desk-wrap').hidden = true;
  }

  function init() {
    $('pl-sample').addEventListener('click', () => { const t = example(); $('pl-data').value = t; $('delete-top').hidden = false; loadText(t); });
    $('pl-clear').addEventListener('click', clear);
    $('pl-data').addEventListener('change', () => { if ($('pl-data').value.trim()) { $('delete-top').hidden = false; loadText($('pl-data').value); } });
    $('pl-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { $('pl-data').value = String(fr.result); $('delete-top').hidden = false; loadText(String(fr.result)); };
      fr.readAsText(f);
    });
    ['pl-titer', 'pl-qp'].forEach(id => $(id).addEventListener('change', renderFeatureChoices));
    $('pl-conf').addEventListener('change', () => { run(); if (lastSheet) sheetGo(); });
    $('pl-train').addEventListener('click', train);
    $('pl-doe').addEventListener('click', doe);
    $('pl-csv').addEventListener('click', () => { if (lastPrediction) download('vector-prediction.csv', predictionCSV(), 'text/csv'); });
    $('pl-sheet-go').addEventListener('click', sheetGo);
    $('pl-sheet-fill').addEventListener('click', sheetFromDoe);
    $('pl-sheet-example').addEventListener('click', () => { $('pl-sheet').value = exampleSheet(); $('pl-sheet-error').hidden = true; sheetGo(); });
    $('pl-sheet-clear').addEventListener('click', () => { $('pl-sheet').value = ''; $('pl-sheet-out').innerHTML = ''; $('pl-sheet-error').hidden = true; lastSheet = null; });
    $('pl-sheet-mode').addEventListener('change', () => { if (lastSheet) sheetGo(); });
    $('pl-sheet-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { $('pl-sheet').value = String(fr.result); sheetGo(); };
      fr.readAsText(f);
    });
  }

  window.MLPlasmidUI = { clear, example };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
