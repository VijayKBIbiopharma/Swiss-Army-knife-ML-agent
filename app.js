/* ML Agent page logic. Reads files with the browser's FileReader (local only), runs the
   agent, and draws results. Data lives only in the `state` object below. "Finish and delete"
   (or 30 idle minutes, or leaving the page) drops it and every result from the page. */
(function () {
  'use strict';
  const A = window.MLAgent, D = window.MLDoe, E = window.MLEngine, C = window.Charts, X = window.MLExplain;
  const h = C.esc, fmt = A.fmt, pct = A.pct;
  const $ = id => document.getElementById(id);
  const IDLE_MS = 30 * 60 * 1000;

  const state = { table: null, prof: null, name: '', report: null, sampleTarget: null, factors: null, design: null };
  const DEFAULT_FACTORS = () => [{ name: 'Temperature', low: 150, high: 180 }, { name: 'Time', low: 30, high: 60 }, { name: 'Catalyst', low: 'Type A', high: 'Type B' }];

  // ---------- Loading ----------
  function showError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = !msg; }

  function loadText(text, name, sampleTarget) {
    showError('load-error', ''); $('deleted-note').hidden = true;
    let table;
    try { table = E.parseCSV(text); } catch (e) { return showError('load-error', 'Could not read that data: ' + e.message); }
    if (!table.columns.length || !table.rows.length) return showError('load-error', 'No data found. The first row should hold column names, with one row per observation below it.');
    if (table.columns.length < 2) return showError('load-error', 'Only one column found. If your file uses another separator, try pasting the cells from Excel instead.');
    state.table = table; state.name = name; state.sampleTarget = sampleTarget || null;
    state.prof = E.profile(table);
    state.report = state.sim = null;
    $('sim').innerHTML = ''; $('sim').hidden = true;
    $('results').hidden = true; $('next').hidden = true; $('progress').hidden = true; showError('run-error', '');
    $('delete-top').hidden = false;
    renderSetup();
    $('setup').hidden = false;
    touch();
    $('setup').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function readFile(file) {
    if (!file) return;
    if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) return showError('load-error', 'Excel workbooks need one extra step: in Excel use File → Save As → CSV, or copy the cells and paste them in the box.');
    if (file.size > 50 * 1024 * 1024) return showError('load-error', 'That file is over 50 MB. Try a sample of the rows, or remove columns you do not need.');
    const reader = new FileReader();
    reader.onload = () => { const text = String(reader.result); $('file').value = ''; loadText(text, file.name); };
    reader.onerror = () => showError('load-error', 'Could not read the file.');
    reader.readAsText(file);
  }

  // ---------- Setup ----------
  const KIND_LABEL = { numeric: 'number', categorical: 'category', id: 'ID', constant: 'constant', text: 'free text', empty: 'empty' };

  function renderSetup() {
    const prof = state.prof;
    $('data-summary').innerHTML = '<b>' + h(state.name) + '</b>: ' + prof.nRows.toLocaleString() + ' rows × ' + prof.nCols + ' columns. The agent has checked each column below.';
    const usable = prof.columns.filter(E.isUsableFeature);
    const guess = state.sampleTarget || A.guessTarget(prof);
    $('target').innerHTML = usable.map(c => '<option value="' + h(c.name) + '"' + (c.name === guess ? ' selected' : '') + '>' + h(c.name) + '</option>').join('') +
      '<option value="__none__"' + (guess === '__none__' ? ' selected' : '') + '>Nothing: find groups and patterns (unsupervised)</option>';
    $('task').value = 'auto';
    renderProfile();
    const pv = state.table.rows.slice(0, 8);
    $('preview').innerHTML = '<thead><tr>' + state.table.columns.map(c => '<th>' + h(c) + '</th>').join('') + '</tr></thead><tbody>' +
      pv.map(r => '<tr>' + r.map(v => '<td>' + h(v) + '</td>').join('') + '</tr>').join('') + '</tbody>';
  }

  function renderGoal(col, task) {
    const sel = $('goal');
    if (!col) { sel.innerHTML = '<option value="max">Not needed for finding groups</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    if (task === 'classification') {
      const classes = (col.levels || []).map(String);
      const fav = A.guessFavorable(classes);
      sel.innerHTML = classes.map((c, i) => '<option value="class:' + h(c) + '"' + (i === fav ? ' selected' : '') + '>More "' + h(c) + '" is better</option>').join('');
    } else {
      sel.innerHTML = '<option value="max">Higher ' + h(col.name) + ' is better</option><option value="min">Lower ' + h(col.name) + ' is better</option>';
      if (/defect|scrap|cost|time|delay|downtime|error|waste|reject|cycle|lead|days|hours/i.test(col.name)) sel.value = 'min';
    }
  }

  function renderProfile() {
    const target = $('target').value;
    const excluded = new Set(Array.from(document.querySelectorAll('#profile input[data-col]')).filter(i => !i.checked).map(i => i.getAttribute('data-col')));
    const rows = state.prof.columns.map(c => {
      const isT = c.name === target;
      const usable = E.isUsableFeature(c);
      let detail = '';
      if (c.stats) detail = h(fmt(c.stats.min) + ' to ' + fmt(c.stats.max) + ', median ' + fmt(c.stats.median));
      else if (c.levels) detail = c.levels.slice(0, 4).map(h).join(', ') + (c.levels.length > 4 ? ', …' : '');
      const chip = isT ? '<span class="chip target">target</span>' : usable ? '<span class="chip">' + KIND_LABEL[c.kind] + '</span>' : '<span class="chip off">' + KIND_LABEL[c.kind] + ', set aside</span>';
      const box = usable && !isT ? '<input type="checkbox" aria-label="Use ' + h(c.name) + '" data-col="' + h(c.name) + '"' + (excluded.has(c.name) ? '' : ' checked') + '>' : '';
      return '<tr' + (usable ? '' : ' class="dim"') + '><td>' + box + '</td><td><b>' + h(c.name) + '</b></td><td>' + chip + '</td><td class="num-cell">' + (c.missing ? c.missing + ' (' + pct(c.missing / c.n) + ')' : '0') + '</td><td class="num-cell">' + c.unique + '</td><td>' + detail + '</td></tr>';
    });
    $('profile').innerHTML = '<thead><tr><th>Use</th><th>Column</th><th>Type</th><th class="num-cell">Missing</th><th class="num-cell">Distinct</th><th>Range or values</th></tr></thead><tbody>' + rows.join('') + '</tbody>';
    const col = state.prof.columns.find(c => c.name === target);
    const task = col && A.decideTask(col, $('task').value);
    renderGoal(col, task);
    renderSpcPanel(col, task);
    $('target-hint').textContent = !col ? 'No target: the agent will look for natural groups (clustering), main directions of variation (PCA) and unusual rows.'
      : task === 'regression' ? '"' + target + '" is a number, so the agent will run regression models and check whether the data is a designed experiment.'
        : '"' + target + '" is a category, so the agent will run classification models.';
  }

  // ---------- Six Sigma mode (setup) ----------
  const sigmaMode = () => document.querySelector('input[name="mode"]:checked').value === 'sigma';
  function renderSpcPanel(col, task) {
    const on = sigmaMode();
    $('spc-panel').hidden = !on;
    if (!on) return;
    const numeric = col && task === 'regression';
    $('spc-fields').hidden = !numeric;
    $('spc-intro').textContent = !col ? 'Six Sigma mode needs a target column. With no target, the agent runs the usual group finding.'
      : numeric ? 'Does "' + col.name + '" have specification limits? All optional: leave them blank and you still get the control chart, box plots and robustness analysis.'
        : '"' + col.name + '" is pass/fail or a category, so the agent will report the defect rate, defects per million and sigma level. "Which result is better?" sets what counts as good.';
    if (numeric && col.stats) {
      $('lsl').placeholder = 'data min ' + fmt(col.stats.min);
      $('usl').placeholder = 'data max ' + fmt(col.stats.max);
      $('spec-target').placeholder = 'optional';
    }
  }
  // Returns the Six Sigma options, or throws a message for the user.
  function readSpc() {
    if (!sigmaMode()) return null;
    const v = id => { const t = $(id).value.trim(); return t === '' ? null : Number(t); };
    const lsl = v('lsl'), usl = v('usl'), target = v('spec-target');
    if ([lsl, usl, target].some(x => x !== null && !isFinite(x))) throw new Error('Spec limits must be numbers.');
    if (lsl !== null && usl !== null && lsl >= usl) throw new Error('The lower spec limit must be below the upper spec limit.');
    if (target !== null && ((lsl !== null && target < lsl) || (usl !== null && target > usl))) throw new Error('The target value must sit between the spec limits.');
    return { lsl, usl, target, timeOrdered: $('time-ordered').checked };
  }

  // ---------- Run ----------
  async function runAgent() {
    if (!state.table) return;
    showError('run-error', '');
    const btn = $('run'); btn.disabled = true; btn.textContent = 'Running…';
    $('progress').hidden = false; $('agent-log').innerHTML = ''; $('progress-bar').value = 2; $('progress-text').textContent = 'Starting';
    $('nn-live').hidden = true; $('nn-live-chart').innerHTML = '';
    const exclude = Array.from(document.querySelectorAll('#profile input[data-col]')).filter(i => !i.checked).map(i => i.getAttribute('data-col'));
    showError('spc-error', '');
    let sixSigma;
    try { sixSigma = readSpc(); } catch (e) {
      showError('spc-error', e.message); $('progress').hidden = true; btn.disabled = false; btn.textContent = 'Run the agent'; return;
    }
    try {
      const rep = await A.run(state.table, { target: $('target').value, task: $('task').value, goal: $('goal').value, exclude, sixSigma }, p => {
        if (p.log) $('agent-log').innerHTML = p.log.map(l => '<li class="log-' + l.kind + '">' + h(l.text) + '</li>').join('');
        if (p.total) { $('progress-bar').value = 5 + 90 * p.done / p.total; $('progress-text').textContent = 'Testing ' + p.model + ' (' + (p.done + 1) + ' of ' + p.total + ')'; }
        if (p.nn) {
          $('nn-live').hidden = false;
          $('progress-text').textContent = 'Neural network: epoch ' + p.nn.history.length;
          lossChart($('nn-live-chart'), p.nn, 220);
        }
      });
      if (!state.table) return; // deleted while running
      $('progress-bar').value = 100; $('progress-text').textContent = 'Finished';
      state.report = rep;
      renderResults(rep);
    } catch (e) {
      showError('run-error', e.message || String(e));
      $('progress-text').textContent = 'Stopped';
    } finally {
      btn.disabled = false; btn.textContent = 'Run the agent';
    }
  }

  // ---------- Result building blocks ----------
  function learnLink(topic, text) { return '<a class="learn-link" href="learn.html#' + topic + '" target="_blank" rel="noopener noreferrer">' + h(text || 'Learn how this works') + ' ↗</a>'; }
  function howTo(key, extra) {
    const r = X.READ[key];
    return '<details class="howto"><summary>How to read this</summary><p>' + h(r[0]) + (extra ? ' ' + h(extra) : '') + '</p><p class="analogy">' + h(r[1]) + '</p><p>' + learnLink(r[2]) + '</p></details>';
  }
  function tile(label, val, sub, hero, badge) { return '<div class="tile' + (hero ? ' hero-tile' : '') + '"><div class="lbl">' + h(label) + '</div><div class="val">' + h(val) + '</div><div class="sub">' + h(sub || '') + '</div>' + (badge || '') + '</div>'; }
  // Under 30 rows, one or two unusual rows can swing a cross-validated score by a lot.
  const SMALL_N = 30;
  function smallSampleBadge(rep) {
    const n = rep.nUsed || 0;
    if (!n || n >= SMALL_N) return '';
    const tip = 'Only ' + n + ' rows were scored. With fewer than ' + SMALL_N + ', the score can move a lot if a few rows change, so read it as a rough guide, not a precise number.' +
      (rep.doe ? ' The DOE effects analysis is built for small run counts and is the better guide here.' : ' More rows, or a designed experiment, will firm it up.');
    return '<span class="risk-badge" tabindex="0" data-tip="' + h(tip) + '" aria-label="' + h(tip) + '">⚠ Small sample size: high variance risk</span>';
  }
  function card(title, sub, inner, readKey, extra) { return '<div class="card"><h3>' + h(title) + '</h3>' + (sub ? '<p class="sub-head">' + sub + '</p>' : '') + inner + (readKey ? howTo(readKey, extra) : '') + '</div>'; }
  function append(parent, html, cls) {
    const d = document.createElement('div');
    d.innerHTML = html;
    if (cls) { d.className = cls; parent.appendChild(d); return d; }
    const el = d.firstElementChild; parent.appendChild(el); return el;
  }

  // quiet: re-draw in place (after changing the target class) without scrolling or redoing the DOE.
  function renderResults(rep, quiet) {
    const tiles = [];
    if (rep.task === 'clustering') {
      const c = rep.clustering;
      tiles.push(tile('Problem type', 'Unsupervised', 'Finding groups and patterns'));
      tiles.push(tile('Groups found', String(c.k), 'k-means, best of 2 to ' + (c.tries.length + 1), true));
      tiles.push(tile('Separation', c.silhouette.toFixed(2), 'silhouette, −1 to 1 (above 0.5 is clear)'));
      tiles.push(tile('Unusual rows', String(c.outliers.length), 'far from every group'));
    } else {
      const b = rep.best, reg = rep.task === 'regression';
      tiles.push(tile('Problem type', reg ? 'Regression' : 'Classification', reg ? 'Predicting the number ' + rep.target : 'Predicting the category ' + rep.target));
      tiles.push(tile('Best model', b.name, X.MODEL_ANALOGY[b.id] || rep.bestReason, true));
      tiles.push(reg ? tile('Variation explained', pct(Math.max(0, b.metrics.r2)), 'R² on unseen rows · error ±' + fmt(b.metrics.rmse), false, smallSampleBadge(rep))
        : tile('Accuracy', pct(b.metrics.accuracy), 'on unseen rows · balanced ' + pct(b.metrics.balancedAccuracy), false, smallSampleBadge(rep)));
      tiles.push(rep.doe ? tile('Designed experiment', rep.doe.k + ' factors', rep.doe.n + ' runs, effects analysis below')
        : tile('Rows used', (rep.nUsed || 0).toLocaleString(), (rep.folds === rep.nUsed ? 'leave-one-out' : rep.folds + '-fold') + ' cross-validation' + (rep.sampled ? ', sampled' : '')));
    }
    if (rep.spc && rep.spc.capability) {
      const c = rep.spc.capability, k = c.Cpk !== null ? c.Cpk : c.Ppk;
      if (k !== null) tiles.push(tile('Process capability', (c.Cpk !== null ? 'Cpk ' : 'Ppk ') + k.toFixed(2), c.verdict + ' · ' + fmt(c.ppm, 0) + ' PPM expected out of spec'));
    } else if (rep.spc && rep.spc.attribute) {
      const a = rep.spc.attribute;
      tiles.push(tile('Sigma level', a.sigmaLevel.toFixed(1) + ' σ', fmt(a.dpmo, 0) + ' defects per million · yield ' + pct(a.yield)));
    }
    $('tiles').innerHTML = tiles.join('');
    renderPlan(rep);
    renderSimulator(rep);
    $('insights').innerHTML = rep.insights.map(i => '<li class="' + i.level + '">' + h(i.text) + '</li>').join('');

    const blocks = $('result-blocks');
    blocks.innerHTML = '';
    $('results').hidden = false;
    if (rep.spc) renderSPC(rep, blocks);
    if (rep.doe) renderDOE(rep, blocks);
    if (rep.task === 'clustering') renderClusters(rep, blocks);
    else renderSupervised(rep, blocks);
    renderCorrelations(rep, blocks);

    $('next-steps').innerHTML = rep.nextSteps.map(s => '<li class="p-' + s.phase + '"><span class="phase">' + h(s.phase) + '</span><b>' + h(s.title) + '</b><p>' + h(s.text) + '</p></li>').join('');
    $('next').hidden = false;
    if (quiet) return;
    if (rep.doeRecommendation && rep.doeRecommendation.factors.length) prefillDOE(rep);
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Target outcome and starting class, for classification. Changing them re-aims the plan.
  function planControls(rep) {
    if (rep.task !== 'classification' || !rep.classes || rep.classes.length < 2 || !rep.pdFor) return '';
    const order = A.classOrder(rep.classes);
    const counts = rep.classes.map((_, k) => rep.actual.filter(v => v === k).length);
    // For ranked tiers, "lowest tier or better" is everyone, so it is not offered as a target.
    const targets = rep.ordinal ? order.slice(0, -1) : order;
    return '<div class="plan-controls"><label>Target outcome <select id="plan-target">' +
      targets.map(k => '<option value="' + k + '"' + (k === rep.favorable ? ' selected' : '') + '>' + h(rep.classes[k]) + (rep.ordinal && k !== order[0] ? ' or better' : '') + '</option>').join('') +
      '</select></label><label>Starting from <select id="plan-from"><option value="">All rows</option>' +
      order.map(k => '<option value="' + k + '"' + (k === rep.fromClass ? ' selected' : '') + '>Rows now ' + h(rep.classes[k]) + ' (' + counts[k] + ')</option>').join('') +
      '</select></label><span class="hint">Re-aims the plan, the driver curves and the model peek. ' + (rep.ordinal ? 'Tiers are ranked, so a target means that tier or better.' : '') + '</span></div>';
  }
  function retargetFrom(changedId) {
    const rep = state.report; if (!rep) return;
    const from = $('plan-from').value;
    A.retarget(rep, Number($('plan-target').value), from === '' ? null : Number(from));
    renderResults(rep, true);
    const opt = Array.from($('goal').options).find(o => o.value === rep.goal);
    if (opt) $('goal').value = rep.goal;
    $(changedId).focus();
  }

  function renderPlan(rep) {
    const p = rep.actionPlan, el = $('plan');
    if (!p || !p.items.length) { el.innerHTML = planControls(rep) + '<h3>Action plan</h3><p>No clear levers stood out' + (rep.fromClass !== null && rep.fromClass !== undefined ? ' for this combination' : ' in this data') + '. See the findings below, and consider collecting the drivers the team believes matter.</p>'; return; }
    const confText = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence: treat as hints' }[p.confidence];
    el.innerHTML = planControls(rep) + '<h3>Action plan in plain English <span class="conf ' + p.confidence + '">' + confText + '</span></h3>' +
      '<p class="sub-head">' + h(p.headline) + '</p><ol class="plan-list">' +
      p.items.map(i => '<li><span class="verb ' + i.verb + '">' + h(i.verb) + '</span><div><b>' + h(i.text) + '</b>' + (i.impactText ? '<span class="impact">' + h(i.impactText) + '</span>' : '') + '</div></li>').join('') + '</ol>' +
      (p.quiet && p.quiet.length ? '<p><b>Little effect:</b> ' + h(p.quiet.join(', ')) + '. In the range you have run, these barely move the result, so set them for cost, speed or convenience.</p>' : '') +
      (p.combined ? '<p><b>All together:</b> ' + h(p.combined) + '</p>' : '') +
      '<p class="hint">' + h(p.caveat) + ' ' + learnLink('reading-results', 'How the action plan is worked out') + '</p>';
  }

  function renderSPC(rep, blocks) {
    const s = rep.spc;
    const row = (k, v) => v === null || v === undefined || v === '' ? '' : '<tr><td>' + h(k) + '</td><td class="num-cell"><b>' + h(v) + '</b></td></tr>';
    const f2 = v => (v === null || v === undefined || !isFinite(v) ? null : v.toFixed(2));
    if (s.attribute) {
      const a = s.attribute;
      append(blocks, card('Quality level (pass/fail)', 'Good outcome: ' + h(s.goodLabel) + '. Every other result counts as a defect.',
        '<div class="table-scroll"><table class="spc-table"><tbody>' + row('Rows', a.total.toLocaleString()) + row('Defects', a.defects.toLocaleString()) + row('Defect rate', pct(a.p)) + row('Yield', pct(a.yield)) +
        row('Defects per million (DPMO)', fmt(a.dpmo, 0)) + row('Z (long term)', f2(a.zLT)) + row('Sigma level (short term, +1.5 shift)', a.sigmaLevel.toFixed(2)) + '</tbody></table></div>', 'sigma'));
      return;
    }
    const c = s.capability, st = s.stats;
    const histHtml = '<div class="spc-hist"></div>';
    if (c) {
      const v = c.verdict === 'not capable' ? 'not' : c.verdict;
      append(blocks,
        card('Process capability', 'Against ' + [c.lsl !== null ? 'LSL ' + fmt(c.lsl) : '', c.usl !== null ? 'USL ' + fmt(c.usl) : '', c.target !== null ? 'target ' + fmt(c.target) : ''].filter(Boolean).join(', ') + '. <span class="verdict ' + v + '">' + h(c.verdict) + '</span>' + (s.designed ? '<br>Designed experiment: this spread was created on purpose, so read these as illustration only.' : ''),
          '<div class="table-scroll"><table class="spc-table"><tbody>' + row('Rows', c.n.toLocaleString()) + row('Mean', fmt(c.mean)) + row('Std. deviation, within (short term)', c.sdWithin === null ? null : fmt(c.sdWithin)) + row('Std. deviation, overall (long term)', fmt(c.sdOverall)) +
          row('Cp', f2(c.Cp)) + row('Cpk', f2(c.Cpk)) + row('Pp', f2(c.Pp)) + row('Ppk', f2(c.Ppk)) + row('Cpm (Taguchi, vs target)', f2(c.Cpm)) + row('Z.bench', f2(c.zBench)) +
          row('Expected out of spec (PPM)', fmt(c.ppm, 0)) + row('Observed out of spec', c.observedOut + ' of ' + c.n + ' (' + pct(c.observedPct) + ')') + row('Sigma level (short term, +1.5 shift)', f2(c.sigmaLevel)) +
          row('Taguchi loss vs a unit at the spec limit', c.loss === null ? null : pct(c.loss)) + '</tbody></table></div>' + (c.sdWithin === null ? '<p class="hint">Rows are not in time order, so short-term Cp and Cpk are skipped; Pp and Ppk use the overall spread.</p>' : ''), 'capability') +
        card('Distribution against the spec', 'Red bars fall outside the spec. The curve is the bell shape the capability numbers assume.', histHtml, 'histogram'),
        'block-grid');
    } else {
      append(blocks, card('Distribution of ' + rep.target, 'No spec limits given. Add LSL and USL in step 2 to get Cp and Cpk.', histHtml, 'histogram'));
    }
    C.histogram(blocks.querySelector('.spc-hist'), (st.n ? state.prof.columns.find(col => col.name === rep.target).values.filter(x => x !== null) : []),
      { lsl: c ? c.lsl : null, usl: c ? c.usl : null, target: c ? c.target : null, mean: st.mean, sd: st.sdOverall, xLabel: rep.target, label: 'Histogram of ' + rep.target });

    if (s.imr) {
      const m = s.imr;
      const sig = m.signals.slice(0, 8).map(g => 'row ' + m.rowNums[g.i] + ' (' + g.why.join(', ') + ')');
      const el = append(blocks, card('I-MR control chart', 'Individuals (top) and moving range (bottom), in row order' + (m.trimmed ? ', last 500 rows' : '') + '. ' + (m.signals.length ? m.signals.length + ' signal' + (m.signals.length > 1 ? 's' : '') + ' in red.' : 'No signals: the process looks stable.'),
        '<div class="cc-i"></div><div class="cc-mr"></div>' + (sig.length ? '<p class="hint">Signals: ' + h(sig.join('; ')) + (m.signals.length > 8 ? '…' : '') + '</p>' : ''), 'controlChart'));
      const label = i => 'Row ' + m.rowNums[i];
      C.controlChart(el.querySelector('.cc-i'), m.y, { cl: m.cl, ucl: m.ucl, lcl: m.lcl, flags: m.flags, rowLabel: label, yLabel: rep.target, label: 'Individuals chart' });
      C.controlChart(el.querySelector('.cc-mr'), m.mr, { cl: m.mrBar, ucl: m.mrUcl, lcl: null, flags: m.mr.map((v, i) => (v !== null && v > m.mrUcl ? ['jump between points'] : [])), rowLabel: label, yLabel: 'Moving range', height: 170, label: 'Moving range chart' });
    }
    if (s.boxes) {
      const el = append(blocks, card('Box plots of ' + rep.target, 'Overall' + (s.boxes.by.length ? ', and split by ' + h(s.boxes.by.map(b => b.name).join(', ')) : '') + '. Shifted boxes change the average; wider boxes mean more variation.',
        '<div class="bp-all"></div>' + s.boxes.by.map((b, i) => '<h4>By ' + h(b.name) + '</h4><div class="bp-' + i + '"></div>').join(''), 'boxplot'));
      const spec = { lsl: c ? c.lsl : null, usl: c ? c.usl : null };
      const ov = s.boxes.overall, ext = [ov.min, ov.max, spec.lsl, spec.usl].filter(v => v !== null), pad = (Math.max(...ext) - Math.min(...ext)) * 0.05 || 1;
      spec.domain = [Math.min(...ext) - pad, Math.max(...ext) + pad];
      C.boxplot(el.querySelector('.bp-all'), [{ label: 'All rows', stats: s.boxes.overall }], Object.assign({ label: 'Box plot, all rows' }, spec));
      s.boxes.by.forEach((b, i) => C.boxplot(el.querySelector('.bp-' + i), b.groups, Object.assign({ label: 'Box plots by ' + b.name, xLabel: rep.target }, spec)));
    }
    if (s.taguchi) {
      const t = s.taguchi, kind = { larger: 'larger is better', smaller: 'smaller is better', nominal: 'on target is best' }[t.type];
      const lv = v => (typeof v === 'number' ? fmt(v) : v);
      const el = append(blocks, card('Taguchi robustness (signal-to-noise)', 'S/N type: ' + kind + '. Higher S/N means more consistent results. Factors are ranked by how much S/N changes across their levels.',
        '<div class="table-scroll"><table><thead><tr><th>Rank</th><th>Factor</th><th class="num-cell">S/N range (dB)</th><th>Most robust level</th><th>S/N by level (mean)</th></tr></thead><tbody>' +
        t.factors.map(f => '<tr><td class="num-cell">' + f.rank + '</td><td>' + h(f.name) + '</td><td class="num-cell">' + f.delta.toFixed(2) + '</td><td><b>' + h(lv(f.best.level)) + '</b></td><td>' + h(f.levels.map(x => lv(x.level) + ': ' + x.sn.toFixed(1) + ' (' + fmt(x.mean) + ')').join(' · ')) + '</td></tr>').join('') +
        '</tbody></table></div><div class="me-grid tg-grid"></div>', 'taguchi'));
      const all = t.factors.reduce((a, f) => a.concat(f.levels.map(x => x.sn)), []), dom = [Math.min(...all), Math.max(...all)];
      t.factors.slice(0, 6).forEach(f => {
        const d = document.createElement('div'); el.querySelector('.tg-grid').appendChild(d);
        C.lines(d, [{ name: f.name, points: f.levels.map((x, i) => ({ x: i, y: x.sn, big: x === f.best, tip: f.name + ' = ' + lv(x.level) + '\nS/N ' + x.sn.toFixed(2) + ' dB, mean ' + fmt(x.mean) })) }],
          { yDomain: dom, xLabel: f.name, xTickFmt: i => String(lv(f.levels[i] ? f.levels[i].level : '')), width: 280, height: 180, label: 'S/N by level of ' + f.name });
      });
    }
  }

  function renderSupervised(rep, blocks) {
    const reg = rep.task === 'regression', key = rep.metricKey;
    const lb = rep.leaderboard.filter(m => m.metrics);
    append(blocks,
      card('Model leaderboard', (reg ? 'R²: share of variation explained' : 'Balanced accuracy') + ' on rows each model never saw. Yellow = chosen.', '<div id="lb-chart"></div>' +
        '<div class="models"><details><summary>Scores table</summary><div class="table-scroll"><table><thead><tr><th>Model</th>' +
        (reg ? '<th class="num-cell">R²</th><th class="num-cell">RMSE</th><th class="num-cell">MAE</th>' : '<th class="num-cell">Accuracy</th><th class="num-cell">Balanced</th><th class="num-cell">Macro F1</th>') +
        '</tr></thead><tbody>' + lb.map(m => '<tr' + (m === rep.best ? ' class="best"' : '') + '><td>' + h(m.name) + '</td>' +
          (reg ? '<td class="num-cell">' + m.metrics.r2.toFixed(3) + '</td><td class="num-cell">' + fmt(m.metrics.rmse) + '</td><td class="num-cell">' + fmt(m.metrics.mae) + '</td>'
            : '<td class="num-cell">' + pct(m.metrics.accuracy) + '</td><td class="num-cell">' + pct(m.metrics.balancedAccuracy) + '</td><td class="num-cell">' + m.metrics.macroF1.toFixed(2) + '</td>') + '</tr>').join('') +
        '</tbody></table></div></details><details><summary>What each model does, in plain words</summary><dl>' +
        lb.map(m => '<dt>' + h(m.name) + '</dt><dd>' + h(m.plain) + ' <i>' + h(X.MODEL_ANALOGY[m.id] || '') + '</i> ' + learnLink(X.MODEL_TOPIC[m.id], 'Visual lesson') + '</dd>').join('') + '</dl></details></div>', 'leaderboard') +
      card(reg ? 'Predicted vs actual' : 'Confusion matrix', reg ? 'Each dot is a row, predicted while hidden from the model. Dots on the dashed line are perfect.' : 'Rows on the diagonal were classified correctly. Hover a cell for details.', '<div id="fit-chart"></div>', reg ? 'fitScatter' : 'confusion'),
      'block-grid');
    C.hbar($('lb-chart'), lb.map(m => ({
      label: m.name, value: Math.max(0, m.metrics[key]), cls: m === rep.best ? 'accent hi' : '',
      text: reg ? m.metrics.r2.toFixed(2) : pct(m.metrics[key]),
      tip: m.name + '\n' + (reg ? 'R² ' + m.metrics.r2.toFixed(3) + ' · RMSE ' + fmt(m.metrics.rmse) : 'Accuracy ' + pct(m.metrics.accuracy) + ' · balanced ' + pct(m.metrics.balancedAccuracy)) + '\nScored in ' + m.ms + ' ms'
    })), { min: 0, max: 1, tickFmt: t => pct(t), label: 'Model scores' });
    if (reg) {
      C.scatter($('fit-chart'), rep.actual.map((y, i) => ({ x: y, y: rep.best.oof[i], tip: 'Actual ' + fmt(y) + '\nPredicted ' + fmt(rep.best.oof[i]) })),
        { diagonal: true, xLabel: 'Actual ' + rep.target, yLabel: 'Predicted', label: 'Predicted versus actual' });
    } else C.confusion($('fit-chart'), rep.best.metrics.confusion, rep.classes);

    const imp = (rep.importance || []).slice(0, 12);
    append(blocks, card('What drives ' + rep.target, 'How much the best model\'s score drops when each column is scrambled. Bigger = more important.', imp.length ? '<div id="imp-chart"></div>' : '<p>No drivers to show.</p>', 'drivers'));
    if (imp.length) C.hbar($('imp-chart'), imp.map((v, i) => ({ label: v.name, value: v.share, text: pct(v.share), cls: i < 3 ? 'hi' : '' })), { min: 0, tickFmt: t => pct(t), label: 'Driver importance' });
    renderNN(rep, blocks);
    renderPD(rep, blocks);
    renderPeek(rep, blocks);
  }

  // Loss curve: error on the rows the network learns from, and on the rows held back to check it.
  function lossChart(el, nn, height) {
    const hist = nn.history; if (!hist.length) return;
    const hasVal = hist[0].val !== null;
    const series = [{ name: 'Learning rows', points: hist.map(e => ({ x: e.epoch, y: e.train })) }];
    if (hasVal) series.push({ name: 'Check rows', cls: 's2', points: hist.map(e => ({ x: e.epoch, y: e.val, big: e.epoch === nn.bestEpoch, tip: 'Best check score, epoch ' + e.epoch })) });
    else series[0].points.forEach(pt => { pt.big = pt.x === nn.bestEpoch; });
    const last = hist[hist.length - 1].epoch, ticks = C.niceTicks(1, Math.max(2, last), 5).filter(t => t >= 1 && t <= last);
    C.lines(el, series, { noDots: true, xTicks: ticks, xLabel: 'Epoch (one pass over the learning rows)', yLabel: 'Error', height: height || 240, label: 'Neural network learning curve' });
    el.insertAdjacentHTML('beforeend', C.legend([{ label: 'Error on rows it learns from', cls: 'pt' }].concat(hasVal ? [{ label: 'Error on held-back check rows', cls: 'pt s2' }] : [])));
  }
  // A sketch of the network: up to 8 units drawn per layer, connections faint.
  function networkSketch(sizes, inputs) {
    const W = 520, H = 190, cols = sizes.length, show = s => Math.min(s, 8);
    const x = c => 40 + c * (W - 80) / (cols - 1), y = (c, i) => { const n = show(sizes[c]); return H / 2 + (i - (n - 1) / 2) * 20; };
    let b = '';
    for (let c = 0; c < cols - 1; c++) for (let i = 0; i < show(sizes[c]); i++) for (let j = 0; j < show(sizes[c + 1]); j++) b += '<line class="nn-edge" x1="' + x(c) + '" y1="' + y(c, i) + '" x2="' + x(c + 1) + '" y2="' + y(c + 1, j) + '"/>';
    const names = ['Inputs', 'Hidden layer 1', 'Hidden layer 2', 'Output'];
    sizes.forEach((s, c) => {
      for (let i = 0; i < show(s); i++) b += '<circle class="nn-node' + (c === 0 ? ' in' : c === cols - 1 ? ' out' : '') + '" cx="' + x(c) + '" cy="' + y(c, i) + '" r="6.5"/>';
      b += '<text class="lbl-strong" x="' + x(c) + '" y="14" text-anchor="middle">' + names[c] + '</text><text x="' + x(c) + '" y="' + (H - 4) + '" text-anchor="middle">' + s + (s > 8 ? ' (8 shown)' : '') + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Network diagram: ' + sizes.join(' to ') + ' units">' + b + '</svg>';
  }
  function renderNN(rep, blocks) {
    const nn = rep.nn; if (!nn) return;
    const key = rep.metricKey, bestScore = rep.best.metrics[key];
    const scoreTxt = v => (rep.task === 'regression' ? 'R² ' + v.toFixed(2) : pct(v));
    const why = nn.chosen ? 'It is the chosen model.' : bestScore - nn.score <= 0.01 + 1e-9 ? 'A simpler model scored within 0.01, so the agent kept the easier-to-explain one.' : 'Other models scored higher on this data, which is common for small tables.';
    const outN = nn.sizes[nn.sizes.length - 1];
    const bestVal = nn.history[nn.bestEpoch - 1] && nn.history[nn.bestEpoch - 1].val, lastVal = nn.history[nn.history.length - 1].val;
    const overfit = bestVal !== null && bestVal !== undefined && lastVal > bestVal * 1.05 ? ' After that, the check error rises while the learning error keeps falling: that is overfitting, so the network keeps its epoch-' + nn.bestEpoch + ' version.' : '';
    const el = append(blocks, card('Neural network: how it learned', nn.sizes[0] + ' inputs → ' + nn.sizes[1] + ' → ' + nn.sizes[2] + ' units → ' + (outN === 1 ? '1 output (the number)' : outN + ' outputs (one per class)') + '. Cross-validated ' + scoreTxt(nn.score) + ', rank ' + nn.rank + ' on the leaderboard. ' + why +
      ' Training stopped after ' + nn.history.length + ' epochs; the best check score came at epoch ' + nn.bestEpoch + '.' + overfit,
      '<div class="block-grid nn-grid"><div class="nn-curve"></div><div>' + networkSketch(nn.sizes) + '<p class="hint">Inputs are your columns after scaling (each category becomes a yes/no input). Each unit adds up its weighted inputs and passes the signal on only if it is positive (ReLU).</p></div></div>', 'nn'));
    lossChart(el.querySelector('.nn-curve'), nn);
  }

  function renderPD(rep, blocks) {
    if (!rep.pd || !rep.pd.length) return;
    const cls = rep.task === 'classification';
    const what = cls ? 'chance of ' + A.classLabel(rep) + (rep.fromClass !== null && rep.fromClass !== undefined ? ' for rows now ' + rep.classes[rep.fromClass] : '') : rep.target;
    const c = append(blocks, card('How each driver moves ' + rep.target, 'Model-expected ' + h(what) + ' as one driver changes, with everything else as it was. Same scale on every panel; the large dot is your typical value.', '<div class="me-grid pd-grid"></div>', 'pd'));
    const grid = c.querySelector('.pd-grid');
    const all = rep.pd.reduce((s, p) => s.concat(p.ys), []);
    const dom = [Math.min(...all), Math.max(...all)];
    const yf = v => (cls ? pct(v) : fmt(v));
    for (const p of rep.pd) {
      const div = document.createElement('div'); grid.appendChild(div);
      if (p.kind === 'numeric') {
        const near = Math.min(...p.grid.map(q => Math.abs(q - p.typical)));
        C.lines(div, [{ name: p.name, points: p.grid.map((g, i) => {
          const typ = Math.abs(g - p.typical) === near;
          return { x: g, y: p.ys[i], big: typ, tip: p.name + ' = ' + fmt(g) + '\nExpected ' + what + ': ' + yf(p.ys[i]) + (typ ? '\n(near your typical value)' : '') };
        }) }], { yDomain: dom, xLabel: p.name, xTicks: [p.grid[0], p.grid[6], p.grid[12]], xTickFmt: v => fmt(Number(v.toPrecision(3))), width: 280, height: 190, label: 'Effect of ' + p.name });
      } else {
        C.hbar(div, p.grid.map((g, i) => ({ label: g, value: p.ys[i], text: yf(p.ys[i]) })), { width: 280, min: cls ? 0 : Math.min(...p.ys) - (Math.max(...p.ys) - Math.min(...p.ys)) * 0.3, label: 'Effect of ' + p.name, tickFmt: yf });
        const t = document.createElement('p'); t.className = 'pd-cap'; t.textContent = p.name; div.appendChild(t);
      }
    }
  }

  function renderPeek(rep, blocks) {
    const ex = rep.explain;
    if (!ex) return;
    const cls = rep.task === 'classification';
    const leaf = node => {
      if (!cls) return [rep.target + ' ≈ ' + fmt(node.value), node.n + ' rows'];
      const k = node.value.indexOf(Math.max(...node.value));
      return [rep.classes[k] + ' ' + pct(node.value[k]), node.n + ' rows'];
    };
    // Regression leaves: best third green, worst third red (by the chosen goal).
    const leafVals = [];
    (function walk(n) { if (n.leaf) leafVals.push(n.value); else { walk(n.left); walk(n.right); } })(ex.tree);
    const lo = Math.min(...leafVals), hi = Math.max(...leafVals), up = rep.goal !== 'min';
    const leafClass = node => {
      if (cls) return (rep.favorableSet || [rep.favorable]).includes(node.value.indexOf(Math.max(...node.value))) ? 'good' : 'bad';
      const r = hi > lo ? (node.value - lo) / (hi - lo) : 0.5, score = up ? r : 1 - r;
      return score >= 0.67 ? 'good' : score <= 0.33 ? 'bad' : '';
    };
    const scoreText = cls ? 'gets ' + pct(ex.score) + ' of rows right' : 'explains ' + pct(Math.max(0, ex.score)) + ' of the variation';
    let html = '<p class="sub-head">A simplified 3-question tree trained on your data. It ' + scoreText + ' (on the rows it learned from), versus ' +
      (cls ? pct(rep.best.metrics.accuracy) : pct(Math.max(0, rep.best.metrics.r2))) + ' for the chosen ' + h(rep.best.name) + ' on unseen rows.</p><div class="table-scroll peek-tree"></div>' + howTo('tree');
    const ensemble = ex.trees && (rep.best.id === 'forest' || rep.best.id === 'boosting');
    if (ensemble) html += '<h3 class="peek-sub">Inside your ' + (rep.best.id === 'forest' ? 'random forest' : 'gradient boosting chain') + '</h3><div class="trees-row"></div>' + howTo(rep.best.id === 'forest' ? 'forest' : 'boosting');
    if (ex.recipe) html += '<h3 class="peek-sub">The recipe your ' + h(rep.best.name.toLowerCase()) + ' learned</h3><div class="recipe"></div>' + howTo('recipe');
    const c = append(blocks, '<div class="card"><h3>Peek inside the model</h3>' + html + '</div>');
    C.treeDiagram(c.querySelector('.peek-tree'), ex.tree, { question: ex.question, leaf, leafClass, label: 'Simplified decision tree' });
    if (ensemble) {
      const row = c.querySelector('.trees-row');
      const boostLeaf = node => {
        const v = node.value * 0.1;
        if (cls) return [v >= 0 ? 'nudge toward ' + rep.classes[1] : 'nudge toward ' + rep.classes[0], node.n + ' rows'];
        return [(v >= 0 ? '+' : '−') + fmt(Math.abs(v)) + ' correction', node.n + ' rows'];
      };
      ex.trees.forEach((t, i) => {
        const d = document.createElement('div');
        d.innerHTML = '<h4>' + (rep.best.id === 'forest' ? 'Tree ' + (i + 1) + ' of many' : i === 0 ? 'Tree 1: first correction' : 'Tree ' + (i + 1) + ': fixes what is left') + '</h4><div class="table-scroll"></div>';
        row.appendChild(d);
        C.treeDiagram(d.querySelector('div'), t, { question: ex.question, leaf: rep.best.id === 'forest' ? leaf : boostLeaf, leafClass: rep.best.id === 'forest' ? leafClass : null, maxDepth: 2, colW: 118, label: 'Tree ' + (i + 1) });
      });
    }
    if (ex.recipe) {
      C.hbar(c.querySelector('.recipe'), ex.recipe.slice(0, 10).map(x => ({
        label: x.label, value: x.effectRange,
        text: (x.perUnit >= 0 ? '+' : '−') + fmt(Math.abs(x.perUnit)) + (x.numeric ? ' per unit' : ' vs ' + x.ref),
        tip: x.numeric ? 'Each +1 in ' + x.label + ' changes ' + rep.target + ' by ' + fmt(x.perUnit) + '\nAcross its usual range: ' + fmt(x.effectRange) : x.label + ' changes ' + rep.target + ' by ' + fmt(x.perUnit) + ' compared with ' + x.ref
      })), { label: 'Recipe coefficients' });
    }
  }

  // ---------- What-if mixing desk ----------
  // One knob per top driver. Each move re-scores the current settings plus a short sweep
  // along every knob (the curve under it), in a single batch, so it feels instant.
  function simDrivers(rep) {
    const imp = rep.importance && rep.importance.length ? rep.importance.filter(v => v.share >= 0.02).map(v => v.name) : rep.features;
    return imp.slice(0, 8).map(n => state.prof.columns.find(c => c.name === n)).filter(Boolean).map(c => {
      if (c.kind === 'numeric') {
        const sorted = c.values.filter(v => v !== null).sort((a, b) => a - b);
        const span = c.stats.max - c.stats.min || 1, step = Number((span / 200).toPrecision(2));
        return { name: c.name, kind: 'numeric', min: c.stats.min, max: c.stats.max, lo: E.quantile(sorted, 0.05), hi: E.quantile(sorted, 0.95), typical: c.stats.median, step,
          grid: E.range(15).map(i => c.stats.min + span * i / 14) };
      }
      return { name: c.name, kind: 'categorical', levels: c.levels.slice(0, 12), typical: c.levels[0], grid: c.levels.slice(0, 12) };
    });
  }
  const simScore = (rep, out) => (out.proba ? (rep.favorableSet || [rep.favorable]).reduce((a, k) => a + out.proba[k], 0) : out.value);
  const simFmt = (rep, v) => (rep.task === 'classification' ? pct(v) : fmt(v));

  function knobHtml(d, i, v) {
    const head = '<div class="knob-head"><label for="knob-' + i + '">' + h(d.name) + '</label><output id="knob-out-' + i + '">' + h(d.kind === 'numeric' ? fmt(v) : v) + '</output></div>';
    let ctl;
    if (d.kind === 'numeric') {
      ctl = '<input type="range" id="knob-' + i + '" data-knob="' + i + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + v + '">' +
        '<div class="knob-scale"><span>' + fmt(d.min) + '</span><span>typical ' + fmt(d.typical) + '</span><span>' + fmt(d.max) + '</span></div>';
    } else if (d.levels.length <= 5) {
      ctl = '<div class="seg" role="group" aria-label="' + h(d.name) + '">' + d.levels.map(l => '<button type="button" data-knob="' + i + '" data-level="' + h(l) + '" aria-pressed="' + (l === v) + '">' + h(l) + '</button>').join('') + '</div>';
    } else {
      ctl = '<select id="knob-' + i + '" data-knob="' + i + '">' + d.levels.map(l => '<option' + (l === v ? ' selected' : '') + '>' + h(l) + '</option>').join('') + '</select>';
    }
    return '<div class="knob">' + head + ctl + '<div class="knob-curve" id="knob-curve-' + i + '" aria-hidden="true"></div></div>';
  }

  function renderSimulator(rep) {
    const el = $('sim');
    const drivers = rep.predictMany && rep.task !== 'clustering' ? simDrivers(rep) : [];
    if (!drivers.length) { el.hidden = true; el.innerHTML = ''; return; }
    let sim = state.sim;
    if (!sim || sim.rep !== rep) sim = state.sim = { rep, values: {}, pinned: [], shown: null };
    sim.drivers = drivers;
    drivers.forEach(d => { if (sim.values[d.name] === undefined) sim.values[d.name] = d.typical; });
    sim.typical = {}; drivers.forEach(d => { sim.typical[d.name] = d.typical; });
    const cls = rep.task === 'classification';
    const what = cls ? 'Chance of ' + rep.target + ' = ' + A.classLabel(rep) : 'Predicted ' + rep.target;
    const plan = rep.actionPlan && rep.actionPlan.settings && rep.actionPlan.settings.length;
    el.hidden = false;
    el.innerHTML = '<h3>What-if mixing desk</h3><p class="sub-head">Move a knob and the prediction updates instantly. The curve under each knob shows how ' + h(rep.target) + ' responds to it, given where the other knobs sit right now (same scale on every curve, so a flat curve is a knob that barely matters). Columns without a knob stay at their typical value.</p>' +
      '<div class="sim-layout"><div class="sim-readout" aria-live="polite"><div class="lbl">' + h(what) + '</div><div class="sim-big" id="sim-big">–</div><div class="sim-delta" id="sim-delta"></div><div id="sim-extra"></div></div>' +
      '<div class="sim-knobs">' + drivers.map((d, i) => knobHtml(d, i, sim.values[d.name])).join('') + '</div></div>' +
      '<p class="sim-warn" id="sim-warn" hidden></p>' +
      '<div class="row-actions sim-actions">' + (plan ? '<button class="btn" type="button" id="sim-plan">Apply the action plan</button>' : '') +
      '<button class="btn ghost" type="button" id="sim-reset">Reset to typical</button><button class="btn primary" type="button" id="sim-pin">Pin this scenario</button></div>' +
      '<div id="sim-pins"></div>' + howTo('whatif');
    const setKnob = (i, raw) => {
      const d = drivers[i];
      sim.values[d.name] = d.kind === 'numeric' ? Number(raw) : raw;
      scheduleSim();
    };
    el.oninput = e => { const i = e.target.getAttribute('data-knob'); if (i !== null && e.target.tagName !== 'BUTTON') setKnob(Number(i), e.target.value); };
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-level')) { setKnob(Number(b.getAttribute('data-knob')), b.getAttribute('data-level')); syncKnobs(); return; }
      if (b.id === 'sim-reset') { Object.assign(sim.values, sim.typical); syncKnobs(); scheduleSim(); }
      if (b.id === 'sim-plan') {
        rep.actionPlan.settings.forEach(st => { const d = drivers.find(x => x.name === st.name); if (d) sim.values[d.name] = d.kind === 'numeric' ? Math.min(d.max, Math.max(d.min, Number(String(st.value).replace(/,/g, '')))) : st.value; });
        syncKnobs(); scheduleSim();
      }
      if (b.id === 'sim-pin') { sim.pinned.push({ values: Object.assign({}, sim.values) }); renderPins(); }
      if (b.hasAttribute('data-unpin')) { sim.pinned.splice(Number(b.getAttribute('data-unpin')), 1); renderPins(); }
    };
    sim.shown = null;
    updateSim();
    renderPins();
  }
  function syncKnobs() {
    const sim = state.sim;
    sim.drivers.forEach((d, i) => {
      const v = sim.values[d.name];
      if (d.kind === 'numeric' || d.levels.length > 5) $('knob-' + i).value = v;
      else document.querySelectorAll('[data-knob="' + i + '"][data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-level') === v)));
    });
  }
  let simFrame = 0;
  function scheduleSim() { if (!simFrame) simFrame = requestAnimationFrame(() => { simFrame = 0; updateSim(); }); }

  function updateSim() {
    const sim = state.sim; if (!sim || !state.report) return;
    const rep = sim.rep, ds = sim.drivers, cur = sim.values;
    // One batch: typical settings, current settings, then a sweep along each knob.
    const batch = [Object.assign({}, sim.typical), Object.assign({}, cur)];
    ds.forEach(d => d.grid.forEach(g => batch.push(Object.assign({}, cur, { [d.name]: g }))));
    const outs = rep.predictMany(batch), sc = outs.map(o => simScore(rep, o));
    const base = sc[0], now = sc[1], nowOut = outs[1];
    let k = 2;
    const curves = ds.map(d => { const ys = sc.slice(k, k + d.grid.length); k += d.grid.length; return ys; });
    const all = curves.flat().concat([now]), lo = Math.min(...all), hi = Math.max(...all);
    ds.forEach((d, i) => {
      $('knob-out-' + i).textContent = d.kind === 'numeric' ? fmt(cur[d.name]) : cur[d.name];
      $('knob-curve-' + i).innerHTML = knobCurve(rep, d, curves[i], cur[d.name], now, lo, hi);
    });
    animateNumber($('sim-big'), sim.shown === null ? now : sim.shown, now, v => simFmt(rep, v));
    sim.shown = now;
    const diff = now - base, cls = rep.task === 'classification';
    const better = cls || rep.goal !== 'min' ? diff > 0 : diff < 0;
    const tiny = cls ? Math.abs(diff) < 0.005 : Math.abs(diff) < 1e-9 + 0.01 * (rep.targetSD || 1);
    $('sim-delta').className = 'sim-delta ' + (tiny ? '' : better ? 'up' : 'down');
    $('sim-delta').textContent = tiny ? 'Same as typical settings' : (diff > 0 ? '▲ +' : '▼ −') + (cls ? Math.abs(Math.round(diff * 100)) + ' points' : fmt(Math.abs(diff))) + ' vs typical settings (' + simFmt(rep, base) + ')';
    let extra = '';
    if (cls) {
      extra = '<div class="proba">' + A.classOrder(rep.classes).map(c => '<div' + ((rep.favorableSet || [rep.favorable]).includes(c) ? ' class="tgt"' : '') + '><span>' + h(rep.classes[c]) + '</span><progress max="1" value="' + nowOut.proba[c] + '"></progress><span>' + pct(nowOut.proba[c]) + '</span></div>').join('') + '</div><p class="hint">Most likely: <b>' + h(nowOut.label) + '</b></p>';
    } else {
      extra = '<p class="hint">Typical error ±' + fmt(rep.best.metrics.rmse) + '</p>';
      const c = rep.spc && rep.spc.capability;
      if (c) {
        const out = c.lsl !== null && now < c.lsl ? 'below LSL ' + fmt(c.lsl) : c.usl !== null && now > c.usl ? 'above USL ' + fmt(c.usl) : null;
        extra += '<span class="verdict ' + (out ? 'not' : 'capable') + '">' + (out ? h(out) : 'inside spec') + '</span>';
      }
    }
    $('sim-extra').innerHTML = extra;
    const outside = ds.filter(d => d.kind === 'numeric' && (cur[d.name] < d.lo || cur[d.name] > d.hi)).map(d => d.name);
    $('sim-warn').hidden = !outside.length;
    $('sim-warn').textContent = outside.length ? '⚠ ' + outside.join(', ') + (outside.length > 1 ? ' are' : ' is') + ' outside the range where 90% of your data sits. Predictions there are less reliable: confirm with a trial before acting.' : '';
  }

  // The small response curve under a knob: shaded usual range, current position marked.
  function knobCurve(rep, d, ys, v, now, lo, hi) {
    const W = 260, H = 46, pad = 3, span = hi - lo || 1;
    const sy = y => H - pad - (y - lo) / span * (H - 2 * pad);
    if (d.kind === 'numeric') {
      const sx = x => pad + (x - d.min) / (d.max - d.min || 1) * (W - 2 * pad);
      const path = d.grid.map((g, i) => (i ? 'L' : 'M') + sx(g).toFixed(1) + ' ' + sy(ys[i]).toFixed(1)).join('');
      return '<svg class="chart knob-svg" viewBox="0 0 ' + W + ' ' + H + '"><rect class="usual" x="' + sx(d.lo) + '" y="0" width="' + (sx(d.hi) - sx(d.lo)) + '" height="' + H + '"/><path class="line" d="' + path + '"/><circle class="query" cx="' + sx(v) + '" cy="' + sy(now) + '" r="4.5"/></svg>';
    }
    // Categories: one bar per level, labelled underneath, current level highlighted.
    const n = d.grid.length, bw = (W - 2 * pad) / n, LH = 14;
    return '<svg class="chart knob-svg" viewBox="0 0 ' + W + ' ' + (H + LH) + '">' + d.grid.map((g, i) => '<rect class="bar' + (g === v ? ' accent' : '') + '" x="' + (pad + i * bw + 1) + '" y="' + sy(ys[i]) + '" width="' + Math.max(2, bw - 2) + '" height="' + Math.max(1.5, H - pad - sy(ys[i])) + '" rx="2"><title>' + h(g) + ': ' + h(simFmt(rep, ys[i])) + '</title></rect>' +
      '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (H + LH - 3) + '" text-anchor="middle"' + (g === v ? ' class="lbl-strong"' : '') + '>' + h(String(g).length > 10 ? String(g).slice(0, 9) + '…' : g) + '</text>').join('') + '</svg>';
  }

  function animateNumber(el, from, to, show) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === to) { el.textContent = show(to); return; }
    const t0 = performance.now(), dur = 220;
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = show(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function renderPins() {
    const sim = state.sim; if (!sim) return;
    const rep = sim.rep, ds = sim.drivers;
    if (!sim.pinned.length) { $('sim-pins').innerHTML = ''; return; }
    const rows = [{ name: 'Typical settings', values: sim.typical }].concat(sim.pinned.map((p, i) => ({ name: 'Scenario ' + (i + 1), values: p.values, i })));
    const scores = rep.predictMany(rows.map(r => Object.assign({}, r.values))).map(o => simScore(rep, o));
    sim.pinRows = rows.map((r, j) => ({ name: r.name, values: r.values, score: scores[j] }));
    $('sim-pins').innerHTML = '<h4>Pinned scenarios</h4><div class="table-scroll"><table class="pins"><thead><tr><th>Scenario</th>' + ds.map(d => '<th class="num-cell">' + h(d.name) + '</th>').join('') + '<th class="num-cell">' + h(rep.task === 'classification' ? 'Chance of ' + A.classLabel(rep) : 'Predicted ' + rep.target) + '</th><th></th></tr></thead><tbody>' +
      rows.map((r, j) => '<tr' + (j ? '' : ' class="dim"') + '><td>' + h(r.name) + '</td>' + ds.map(d => { const v = r.values[d.name]; const changed = j && v !== sim.typical[d.name]; return '<td class="num-cell">' + (changed ? '<b>' : '') + h(d.kind === 'numeric' ? fmt(v) : v) + (changed ? '</b>' : '') + '</td>'; }).join('') +
        '<td class="num-cell"><b>' + h(simFmt(rep, scores[j])) + '</b></td><td>' + (j ? '<button type="button" class="icon-btn" data-unpin="' + r.i + '" aria-label="Remove ' + h(r.name) + '">✕</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
  }

  function tCritical(df) {
    let lo = 0, hi = 200;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (E.tTestP(mid, df) > 0.05) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  function renderDOE(rep, blocks) {
    const a = rep.doe;
    const df = a.dfe > 0 ? a.dfe : Math.max(1, a.terms.length / 3);
    const tc = tCritical(df);
    const goal = rep.goal === 'min' ? a.optimum.min : a.optimum.max;
    const nm = v => (typeof v === 'number' ? fmt(v) : v);
    append(blocks,
      card('DOE: Pareto of effects', 'Standardized effect size |t|. Bars past the red dashed line (t = ' + tc.toFixed(2) + ') are significant at p &lt; 0.05. Dark bars are significant.', '<div id="pareto"></div>', 'pareto') +
      card('DOE: effects table', h(a.method) + '. R² ' + pct(a.r2) + (a.adjR2 !== null ? ', adjusted ' + pct(a.adjR2) : '') + (a.predR2 !== null ? ', predicted ' + pct(Math.max(0, a.predR2)) : '') + '.',
        '<div class="table-scroll"><table><thead><tr><th>Term</th><th class="num-cell">Effect</th><th class="num-cell">Coef.</th><th class="num-cell">t</th><th class="num-cell">p</th><th></th></tr></thead><tbody>' +
        a.terms.map(t => '<tr' + (t.p < 0.05 ? '' : ' class="dim"') + '><td>' + h(t.name) + '</td><td class="num-cell">' + (t.kind === 'square' ? '–' : fmt(t.effect)) + '</td><td class="num-cell">' + fmt(t.coef) + '</td><td class="num-cell">' + (isFinite(t.t) ? t.t.toFixed(2) : '∞') + '</td><td class="num-cell">' + (isFinite(t.p) ? (t.p < 0.001 ? '&lt;0.001' : t.p.toFixed(3)) : '–') + '</td><td>' +
          (t.p < 0.05 ? '<span class="chip">significant</span>' : t.p < 0.1 ? '<span class="chip off">borderline</span>' : '') + '</td></tr>').join('') +
        '</tbody></table></div><p class="hint">Factor letters: ' + a.factors.map(f => f.letter + ' = ' + h(f.name)).join(', ') + '.</p>', 'effects'),
      'block-grid');
    C.hbar($('pareto'), a.terms.slice(0, 15).map(t => ({ label: t.name, value: Math.min(Math.abs(t.t), 999), cls: t.p < 0.05 ? 'hi' : '', text: Math.abs(t.t) > 999 ? '>999' : Math.abs(t.t).toFixed(1), tip: t.name + '\nEffect ' + fmt(t.effect) + ' · p ' + (isFinite(t.p) ? t.p.toFixed(4) : '–') })), { min: 0, ref: { value: tc }, label: 'Pareto chart of standardized effects' });

    append(blocks, card('DOE: main effects', 'Average ' + h(rep.target) + ' at each level of each factor. Steeper = stronger. Same scale on every panel.', '<div class="me-grid" id="me-grid"></div>', 'mainEffects'));
    append(blocks,
      card('DOE: ' + (a.interaction ? 'strongest interaction' : 'interactions'), a.interaction ? 'Model prediction for ' + h(a.interaction.a) + ' at each level of ' + h(a.interaction.b) + '. Non-parallel lines mean the factors interact.' : '', a.interaction ? '<div id="int-chart"></div><div id="int-legend"></div>' : '<p>No interaction terms could be estimated in this design.</p>', 'interaction') +
      card('Best settings found', 'Goal: ' + (rep.goal === 'min' ? 'minimize' : 'maximize') + ' ' + h(rep.target) + ', searching inside the tested range only.',
        goal ? '<div class="table-scroll"><table><tbody>' + goal.settings.map(s => '<tr><td>' + h(s.name) + '</td><td class="num-cell"><b>' + h(nm(s.actual)) + '</b></td></tr>').join('') +
          '<tr class="best"><td>Predicted ' + h(rep.target) + '</td><td class="num-cell"><b>' + fmt(goal.y) + '</b></td></tr></tbody></table></div><p class="hint">Confirm with 3 to 5 runs at these settings before changing the process.</p>' : '<p>Not available.</p>', 'optimum'),
      'block-grid');
    const all = a.mainEffects.reduce((s, m) => s.concat(m.points.map(p => p.mean)), []);
    const dom = [Math.min(...all), Math.max(...all)];
    a.mainEffects.forEach(m => {
      const div = document.createElement('div'); $('me-grid').appendChild(div);
      const lab = {}; m.points.forEach(p => { lab[p.coded] = nm(p.actual); });
      C.lines(div, [{ name: m.name, points: m.points.map(p => ({ x: p.coded, y: p.mean, tip: m.name + ' = ' + lab[p.coded] + '\nMean ' + fmt(p.mean) })) }],
        { yDomain: dom, xLabel: m.name, xTickFmt: c => lab[c], width: 280, height: 190, label: 'Main effect of ' + m.name });
    });
    if (a.interaction) {
      const it = a.interaction;
      const lab = { '-1': String(nm(it.lines[0].points[0].aLevel)), '1': String(nm(it.lines[0].points[1].aLevel)) };
      C.lines($('int-chart'), it.lines.map((l, i) => ({ name: it.b + ' = ' + nm(l.bLevel), cls: i ? 's2' : '', points: l.points.map((p, j) => ({ x: j ? 1 : -1, y: p.y, tip: it.a + ' = ' + nm(p.aLevel) + ', ' + it.b + ' = ' + nm(l.bLevel) + '\nPredicted ' + fmt(p.y) })) })),
        { xLabel: it.a, yLabel: rep.target, xTickFmt: c => lab[String(c)], label: 'Interaction plot' });
      $('int-legend').innerHTML = C.legend(it.lines.map((l, i) => ({ label: it.b + ' = ' + nm(l.bLevel), cls: i ? 'pt s2' : 'pt' })));
    }
  }

  function renderClusters(rep, blocks) {
    const c = rep.clustering;
    append(blocks,
      card('Groups in the data', c.pca ? 'Rows plotted on the two main directions of variation (PCA: ' + pct(c.pca.explained[0]) + ' + ' + pct(c.pca.explained[1]) + ' of the spread). Color and shape show the group.' : '', c.pca ? '<div id="pca-chart"></div><div id="pca-legend"></div>' : '<p>Need at least two inputs to plot.</p>', 'pca') +
      card('How many groups?', 'Silhouette score for each number of groups: higher means tighter, better separated groups. The largest dot is the agent\'s choice. Splits that leave a group of only a few rows are skipped: those rows are outliers, not a segment.', '<div id="sil-chart"></div>', 'silhouette'),
      'block-grid');
    if (c.pca) {
      C.scatter($('pca-chart'), c.pca.scores.map((s, i) => ({ x: s[0], y: s[1], cls: 'c' + (c.labels[i] % 6 + 1), shape: C.SHAPES[c.labels[i] % 6], tip: 'Row ' + (c.rows[i] + 2) + '\nGroup ' + (c.labels[i] + 1) })),
        { xLabel: 'Component 1', yLabel: 'Component 2', label: 'PCA scatter by group' });
      $('pca-legend').innerHTML = C.legend(c.profiles.map(p => ({ label: 'Group ' + p.cluster + ' (' + p.size + ')', cls: 'c' + ((p.cluster - 1) % 6 + 1), shape: C.SHAPES[(p.cluster - 1) % 6] })));
    }
    C.lines($('sil-chart'), [{ name: 'Silhouette', points: c.tries.map(t => ({ x: t.k, y: t.silhouette, big: t.k === c.k, tip: t.k + ' groups: silhouette ' + t.silhouette.toFixed(2) + (t.tiny ? '\nSkipped: one group has only a few rows' : '') })) }], { xLabel: 'Number of groups', yLabel: 'Silhouette', label: 'Silhouette by number of groups' });

    const numCols = state.prof.columns.filter(col => rep.features.includes(col.name) && col.kind === 'numeric');
    const prof = '<div class="table-scroll"><table><thead><tr><th>Group</th><th class="num-cell">Rows</th>' + numCols.map(col => '<th class="num-cell">' + h(col.name) + '</th>').join('') + '<th>Stands out for</th></tr></thead><tbody>' +
      c.profiles.map(p => '<tr><td><b>Group ' + p.cluster + '</b></td><td class="num-cell">' + p.size + ' (' + pct(p.share) + ')</td>' +
        numCols.map(col => { const t = p.means.find(m => m.name === col.name); return '<td class="num-cell">' + (t ? fmt(t.mean) : '–') + '</td>'; }).join('') +
        '<td>' + h(p.traits.map(t => t.text).join('; ')) + '</td></tr>').join('') +
      '<tr class="dim"><td>All rows</td><td class="num-cell">' + c.rows.length + '</td>' + numCols.map(col => '<td class="num-cell">' + fmt(col.stats.mean) + '</td>').join('') + '<td></td></tr></tbody></table></div>';
    const out = c.outliers.length ? '<p class="hint">Unusual rows (spreadsheet row numbers, header = row 1): ' + c.outliers.slice(0, 20).map(o => o.row).join(', ') + (c.outliers.length > 20 ? '…' : '') + '</p>' : '';
    append(blocks, card('Group profiles', 'Average of each numeric column per group, and what makes each group different.', prof + out, 'profiles'));
  }

  function renderCorrelations(rep, blocks) {
    const cs = (rep.correlations || []).filter(c => Math.abs(c.r) >= 0.3).slice(0, 8);
    if (!cs.length) return;
    append(blocks, card('Strongest relationships between numeric columns', 'Pearson correlation, −1 to 1.',
      '<div class="table-scroll"><table><thead><tr><th>Column</th><th>Column</th><th class="num-cell">r</th><th>Reads as</th></tr></thead><tbody>' +
      cs.map(c => '<tr><td>' + h(c.a) + '</td><td>' + h(c.b) + '</td><td class="num-cell">' + c.r.toFixed(2) + '</td><td>' + (Math.abs(c.r) >= 0.7 ? 'strong' : 'moderate') + (c.r > 0 ? ', rise together' : ', one rises as the other falls') + '</td></tr>').join('') + '</tbody></table></div>', 'correlations'));
  }

  // ---------- DOE builder ----------
  function isNum(v) { return v !== '' && v !== null && isFinite(Number(v)); }
  function factorList() {
    return state.factors.map(f => ({ name: String(f.name).trim(), low: f.low, high: f.high, categorical: !(isNum(f.low) && isNum(f.high)) }));
  }
  function renderFactors() {
    $('factors').innerHTML = '<thead><tr><th>Factor</th><th>Low level</th><th>High level</th><th></th></tr></thead><tbody>' +
      state.factors.map((f, i) => '<tr><td><input type="text" data-i="' + i + '" data-k="name" value="' + h(f.name) + '" aria-label="Factor ' + (i + 1) + ' name"></td>' +
        '<td><input type="text" data-i="' + i + '" data-k="low" value="' + h(f.low) + '" aria-label="Factor ' + (i + 1) + ' low level"></td>' +
        '<td><input type="text" data-i="' + i + '" data-k="high" value="' + h(f.high) + '" aria-label="Factor ' + (i + 1) + ' high level"></td>' +
        '<td><button class="icon-btn" type="button" data-remove="' + i + '" aria-label="Remove factor ' + (i + 1) + '">✕</button></td></tr>').join('') + '</tbody>';
    renderDesignTypes();
  }
  function designPurpose() { $('design-purpose').innerHTML = h(D.DESIGNS[$('design-type').value].purpose) + ' ' + learnLink('designs', 'See the design shapes'); }
  function renderDesignTypes(preferred) {
    const k = state.factors.length;
    const sel = $('design-type');
    const current = preferred || sel.value;
    sel.innerHTML = Object.keys(D.DESIGNS).map(t => {
      const d = D.DESIGNS[t], ok = k >= d.min && k <= d.max;
      return '<option value="' + t + '"' + (ok ? '' : ' disabled') + '>' + h(d.name) + (ok ? '' : ' (needs ' + d.min + '–' + d.max + ' factors)') + '</option>';
    }).join('');
    const d = D.DESIGNS[current];
    sel.value = d && k >= d.min && k <= d.max ? current : D.recommend(k).type;
    if (!D.DESIGNS[sel.value] || sel.selectedOptions[0].disabled) sel.value = 'pb';
    designPurpose();
  }
  function generateDesign(seed) {
    showError('doe-error', '');
    const fs = factorList();
    const names = fs.map(f => f.name);
    if (names.some(n => !n)) return showError('doe-error', 'Every factor needs a name.');
    if (new Set(names).size !== names.length) return showError('doe-error', 'Factor names must be different.');
    const bad = fs.find(f => String(f.low).trim() === '' || String(f.high).trim() === '' || String(f.low).trim() === String(f.high).trim());
    if (bad) return showError('doe-error', '"' + bad.name + '" needs two different levels.');
    let design;
    try {
      design = D.generate(fs.map(f => ({ name: f.name, low: f.categorical ? String(f.low).trim() : Number(f.low), high: f.categorical ? String(f.high).trim() : Number(f.high), categorical: f.categorical })), {
        type: $('design-type').value, centerPoints: Number($('centers').value) || 0, replicates: Number($('reps').value) || 1,
        randomize: $('randomize').checked, seed: seed || (Date.now() % 1e9)
      });
    } catch (e) { return showError('doe-error', e.message); }
    state.design = { design, factors: fs, response: $('response-name').value.trim() || 'Response' };
    const resp = state.design.response;
    $('design-out').innerHTML = '<div class="design-summary"><p><b>' + h(design.name) + ': ' + design.runs.length + ' runs</b> for ' + design.k + ' factor' + (design.k > 1 ? 's' : '') + '.</p><p>' + h(design.purpose) + '</p>' +
      design.notes.map(n => '<p>' + h(n) + '</p>').join('') +
      '<p>Run the experiments in <b>RunOrder</b> (randomized to protect against drift), record ' + h(resp) + ', then load the file in step 1. The agent will recognize the design and analyze it.</p></div>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="download-design">Download run sheet (.csv)</button></div>' +
      '<div class="table-scroll"><table class="runsheet"><thead><tr><th class="num-cell">Run</th><th class="num-cell">Std</th>' + fs.map(f => '<th class="num-cell">' + h(f.name) + '</th>').join('') + '<th>' + h(resp) + '</th></tr></thead><tbody>' +
      design.runs.map(r => '<tr><td class="num-cell">' + r.run + '</td><td class="num-cell">' + r.std + '</td>' + r.actual.map(v => '<td class="num-cell">' + h(v) + '</td>').join('') + '<td class="blank"></td></tr>').join('') + '</tbody></table></div>';
    $('download-design').addEventListener('click', () => download('doe-run-sheet.csv', D.toCSV(design, fs, resp), 'text/csv'));
  }
  function prefillDOE(rep) {
    const rec = rep.doeRecommendation;
    state.factors = rec.factors.map(f => ({ name: f.name, low: f.low, high: f.high }));
    renderFactors();
    renderDesignTypes(rec.type);
    $('centers').value = rec.centerPoints || 0;
    $('reps').value = rec.replicates || 1;
    $('response-name').value = rep.target;
    $('doe-intro').innerHTML = '<b>Pre-filled by the agent.</b> ' + h(rec.why) + ' Adjust the levels to what is safe and practical, then regenerate.';
    generateDesign(rep.seed);
  }
  function resetDOE() {
    state.factors = DEFAULT_FACTORS(); state.design = null;
    renderFactors(); renderDesignTypes('full');
    $('centers').value = 3; $('reps').value = 1; $('response-name').value = 'Response';
    $('design-out').innerHTML = ''; showError('doe-error', '');
    $('doe-intro').textContent = 'Plan a designed experiment from scratch, or let the agent pre-fill it after a run. Set each factor\'s low and high level; words (like Supplier A / Supplier B) make a categorical factor.';
  }

  // ---------- Report ----------
  function download(name, data, type) {
    // Builds the file in memory and hands it to the browser's own download. Nothing is sent anywhere.
    const url = URL.createObjectURL(new Blob([data], { type: typeof data === 'string' ? type + ';charset=utf-8' : type }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function pageCSS() {
    // Copies this page's own stylesheet (already loaded, nothing fetched) into the report.
    try { return Array.from(document.styleSheets).map(s => Array.from(s.cssRules).map(r => r.cssText).join('\n')).join('\n'); } catch (e) { return ''; }
  }
  function reportHTML(rep) {
    const clone = id => {
      const n = $(id).cloneNode(true);
      n.querySelectorAll('.whatif').forEach(x => { const c = x.closest('.card'); if (c) c.remove(); });
      n.querySelectorAll('button, input, select, textarea, .row-actions, a.learn-link').forEach(x => x.remove());
      n.querySelectorAll('details').forEach(d => { d.open = true; });
      n.removeAttribute('hidden');
      return n.outerHTML;
    };
    const glossary = '<div class="card"><h3>Glossary</h3><table><tbody>' + X.GLOSSARY.map(g => '<tr><td><b>' + h(g[0]) + '</b></td><td>' + h(g[1]) + '</td></tr>').join('') + '</tbody></table></div>';
    const models = rep.leaderboard ? '<div class="card"><h3>The models, in plain words</h3><dl>' + rep.leaderboard.filter(m => m.metrics).map(m => '<dt><b>' + h(m.name) + '</b>' + (m === rep.best ? ' (chosen)' : '') + '</dt><dd>' + h(m.plain) + ' <i>' + h(X.MODEL_ANALOGY[m.id] || '') + '</i></dd>').join('') + '</dl></div>' : '';
    let doe = '';
    if (state.design) {
      const out = $('design-out').cloneNode(true);
      out.querySelectorAll('.row-actions').forEach(x => x.remove());
      doe = '<section class="wrap step"><div class="step-head"><span class="num">5</span><h2>Recommended experiment</h2></div><div class="card"><p>' + $('doe-intro').innerHTML + '</p>' + out.innerHTML + '</div></section>';
    }
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">' +
      '<title>ML Agent report: ' + h(state.name) + '</title><style>' + pageCSS() + '</style></head><body><main>' +
      '<section class="hero"><div class="wrap"><p class="eyebrow">ML Agent report · ' + h(new Date().toLocaleString()) + '</p><h1>' + h(state.name) + '</h1><p class="lede">' + rep.profile.nRows.toLocaleString() + ' rows × ' + rep.profile.nCols + ' columns. ' +
      (rep.target ? 'Target: ' + h(rep.target) + '.' : 'No target: unsupervised analysis.') + ' Computed entirely in the browser; no data left the device.</p></div></section>' +
      clone('results') + '<section class="wrap step">' + models + glossary + '</section>' + clone('next') + doe +
      '</main><footer class="foot"><div class="wrap"><p>Generated by ML Agent. Charts and tables summarize your data; keep or delete this file as your data policy requires.</p></div></footer></body></html>';
  }

  // ---------- PDF and print ----------
  // Charts use light-mode colors in the PDF and on paper, whatever the screen theme is.
  function withLightTheme() {
    const el = document.documentElement, prev = el.getAttribute('data-theme');
    el.setAttribute('data-theme', 'light');
    return () => { if (prev === null) el.removeAttribute('data-theme'); else el.setAttribute('data-theme', prev); };
  }
  const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-style'];
  // Turns an on-screen SVG chart into a JPEG for the PDF. The chart is drawn from an in-memory
  // copy (a data: URL), so nothing is loaded from anywhere.
  async function chartImage(svg) {
    const vb = svg.viewBox.baseVal, w = Math.round(vb.width), h = Math.round(vb.height);
    if (!w || !h) return null;
    const clone = svg.cloneNode(true);
    const from = svg.querySelectorAll('*'), to = clone.querySelectorAll('*');
    from.forEach((el, i) => {
      const cs = getComputedStyle(el);
      SVG_PROPS.forEach(p => { const v = cs.getPropertyValue(p); if (v) to[i].setAttribute(p, v); });
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = document.createElement('img');
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); }); // PRIVACY-LOCAL-IMAGE
    const scale = 2, cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1], bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w: cv.width, h: cv.height, viewW: w };
  }
  const tableRows = t => Array.from(t.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()));
  const VERB_COLOR = { Increase: [44, 74, 94], Decrease: [235, 104, 52], Target: [168, 118, 0], Combine: [168, 118, 0], Choose: [47, 122, 82], Hold: [47, 122, 82], Segment: [47, 122, 82], Check: [154, 90, 0] };

  async function savePDF() {
    const rep = state.report; if (!rep) return;
    const btn = $('save-pdf'); btn.disabled = true; btn.textContent = 'Building PDF…';
    const restore = withLightTheme();
    try {
      const P = window.MLPdf.create({ title: 'ML Agent report: ' + state.name, footer: 'ML Agent report · ' + state.name + ' · computed in the browser, no data left the device' });
      P.h1('ML Agent report');
      P.muted(state.name + ' · ' + rep.profile.nRows.toLocaleString() + ' rows × ' + rep.profile.nCols + ' columns · ' + (rep.target ? 'target: ' + rep.target : 'no target (unsupervised)') + ' · ' + new Date().toLocaleString());
      P.space(4);
      document.querySelectorAll('#tiles .tile').forEach(t => {
        const badge = t.querySelector('.risk-badge');
        P.p(t.querySelector('.lbl').textContent + ': ' + t.querySelector('.val').textContent, { bold: true, size: 10.5, gap: 0 }).muted(t.querySelector('.sub').textContent, { gap: badge ? 1 : 4 });
        if (badge) P.p('! Small sample size, high variance risk. ' + badge.getAttribute('data-tip'), { size: 8.5, bold: true, color: [154, 90, 0], gap: 4 });
      });

      const plan = rep.actionPlan;
      if (plan && plan.items.length) {
        P.h2('Action plan in plain English (' + plan.confidence + ' confidence)');
        P.p(plan.headline, { gap: 6 });
        plan.items.forEach(i => P.band(i.verb, i.text, i.impactText, VERB_COLOR[i.verb]));
        if (plan.quiet && plan.quiet.length) P.p('Little effect: ' + plan.quiet.join(', ') + '. In the range you have run, these barely move the result, so set them for cost, speed or convenience.');
        if (plan.combined) P.p('All together: ' + plan.combined);
        P.muted(plan.caveat);
      }
      const sim = state.sim;
      if (sim && sim.drivers && sim.drivers.length) {
        renderPins();
        const rows = sim.pinRows || [];
        P.h2('What-if scenarios');
        P.muted('From the what-if mixing desk. Columns not listed stay at their typical value. ' + (rep.task === 'classification' ? 'Values are the chance of ' + rep.target + ' = ' + A.classLabel(rep) + '.' : 'Values are the predicted ' + rep.target + ' (typical error ±' + fmt(rep.best.metrics.rmse) + ').'));
        const cur = rep.predictMany([Object.assign({}, sim.values)]).map(o => simScore(rep, o))[0];
        const all = (rows.length ? rows : [{ name: 'Typical settings', values: sim.typical, score: rep.predictMany([Object.assign({}, sim.typical)]).map(o => simScore(rep, o))[0] }]).concat([{ name: 'Current desk settings', values: sim.values, score: cur }]);
        P.table([['Scenario'].concat(sim.drivers.map(d => d.name)).concat(['Prediction'])].concat(all.map(r => [r.name].concat(sim.drivers.map(d => (d.kind === 'numeric' ? fmt(r.values[d.name]) : String(r.values[d.name])))).concat([simFmt(rep, r.score)]))));
      }
      P.h2('What the agent found');
      rep.insights.forEach(i => P.p(i.text, { bullet: i.level === 'warn' ? '!' : '·', gap: 3 }));

      P.h2('Charts, and how to read them');
      for (const card of document.querySelectorAll('#result-blocks .card')) {
        if (card.querySelector('.whatif')) continue;
        P.keep(card.querySelector('svg.chart:not(.legend svg)') ? 260 : 120).h3(card.querySelector('h3').textContent);
        const parts = card.querySelectorAll('.sub-head, svg.chart, table, h3.peek-sub, h4, .legend, .pd-cap, p.hint, details.howto');
        for (const el of parts) {
          if (el.closest('.legend') && el.tagName.toLowerCase() === 'svg') continue;
          if (el.closest('details.howto') && !el.matches('details.howto')) continue;
          if (el.closest('dl')) continue;
          if (el.matches('.sub-head, p.hint')) P.muted(el.textContent);
          else if (el.matches('h3.peek-sub')) P.h3(el.textContent);
          else if (el.matches('h4, .pd-cap')) P.p(el.textContent, { bold: true, size: 9 });
          else if (el.matches('.legend')) P.muted('Legend: ' + Array.from(el.querySelectorAll('li')).map(li => li.textContent).join(' · '));
          else if (el.matches('table')) P.table(tableRows(el));
          else if (el.matches('details.howto')) {
            const ps = el.querySelectorAll('p');
            P.p('How to read this: ' + ps[0].textContent, { size: 9, color: [44, 74, 94], gap: 2 });
            if (ps[1]) P.p(ps[1].textContent, { size: 9, italic: true, color: [86, 99, 108] });
          } else {
            const im = await chartImage(el);
            if (im) P.image(im, Math.min(500, im.viewW * 0.66));
          }
        }
        P.space(6);
      }

      P.h2('Next steps (DMAIC)');
      rep.nextSteps.forEach(s => P.p(s.phase + ': ' + s.title, { bold: true, gap: 1, keep: true }).p(s.text, { gap: 6 }));
      if (state.design) {
        const d = state.design;
        P.h2('Recommended experiment: ' + d.design.name + ' (' + d.design.runs.length + ' runs)');
        P.p($('doe-intro').textContent);
        d.design.notes.forEach(n => P.muted(n));
        P.table([['Run', 'Std'].concat(d.factors.map(f => f.name)).concat([d.response])].concat(d.design.runs.map(r => [String(r.run), String(r.std)].concat(r.actual.map(String)).concat(['']))));
      }
      if (rep.leaderboard) {
        P.h2('The models, in plain words');
        rep.leaderboard.filter(m => m.metrics).forEach(m => P.p(m.name + (m === rep.best ? ' (chosen)' : ''), { bold: true, gap: 1, keep: true }).p(m.plain, { gap: 5 }));
      }
      P.h2('Glossary');
      P.table([['Term', 'Meaning']].concat(X.GLOSSARY));
      download('ml-agent-report.pdf', P.output(), 'application/pdf');
    } catch (e) {
      showError('run-error', 'Could not build the PDF: ' + (e.message || e) + '. Use Print and choose "Save as PDF" instead.');
    } finally {
      restore(); btn.disabled = false; btn.textContent = 'Save as PDF';
    }
  }

  // Printing: show every "How to read this" note and use light colors, then put things back.
  let printUndo = null;
  function beforePrint() {
    const closed = Array.from(document.querySelectorAll('details')).filter(d => !d.open);
    closed.forEach(d => { d.open = true; });
    const restore = withLightTheme();
    printUndo = () => { closed.forEach(d => { d.open = false; }); restore(); };
  }
  function afterPrint() { if (printUndo) { printUndo(); printUndo = null; } }

  // ---------- Privacy self-test ----------
  async function selfTest() {
    const out = $('self-test-out');
    out.textContent = 'Testing…';
    const blocked = [];
    const onViolation = e => blocked.push(e.violatedDirective || e.effectiveDirective);
    document.addEventListener('securitypolicyviolation', onViolation);
    // The probes below carry no data. They exist only to show that the browser refuses them.
    let fetchBlocked = false;
    try { await fetch('https://example.com/ml-agent-privacy-self-test', { mode: 'no-cors', cache: 'no-store' }); } catch (e) { fetchBlocked = true; } // PRIVACY-SELF-TEST
    const imgBlocked = await new Promise(res => {
      const img = new Image(); // PRIVACY-SELF-TEST
      const timer = setTimeout(() => res(true), 4000);
      img.onload = () => { clearTimeout(timer); res(false); };
      img.onerror = () => { clearTimeout(timer); res(true); };
      img.src = 'https://example.com/ml-agent-pixel.gif'; // PRIVACY-SELF-TEST
    });
    await new Promise(r => setTimeout(r, 150));
    document.removeEventListener('securitypolicyviolation', onViolation);
    const noCookies = document.cookie === ''; // PRIVACY-SELF-TEST
    const ok = fetchBlocked && imgBlocked;
    const row = (pass, text) => '<li class="' + (pass ? 'pass' : 'fail') + '">' + (pass ? '✓ ' : '✗ ') + text + '</li>';
    out.innerHTML = '<p class="' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'Passed. This page cannot send data out.' : 'Something got through. Please report this.') + '</p><ul>' +
      row(fetchBlocked, 'Data request to an outside server: blocked') +
      row(imgBlocked, 'Tracking pixel (hidden image) to an outside server: blocked') +
      row(noCookies, 'Cookies set by this page: none') +
      row(true, state.table ? 'Your data is held only in this tab\'s memory. Use "Finish and delete my data" when you are done.' : 'No data is held in this tab right now') +
      '</ul><p class="hint">The browser\'s security policy stopped ' + blocked.length + ' attempt' + (blocked.length === 1 ? '' : 's') + (blocked.length ? ' (' + Array.from(new Set(blocked)).join(', ') + ')' : '') + '. That is the lock working.</p>';
  }

  // ---------- Delete ----------
  function deleteData(reason) {
    const had = !!state.table;
    clearTimeout(idleTimer);
    state.table = state.prof = state.report = state.sim = null; state.name = ''; state.sampleTarget = null;
    $('sim').innerHTML = ''; $('sim').hidden = true;
    $('paste').value = ''; $('file').value = '';
    ['setup', 'results', 'next', 'progress'].forEach(id => { $(id).hidden = true; });
    ['result-blocks', 'insights', 'tiles', 'agent-log', 'plan', 'profile', 'preview', 'target', 'goal', 'next-steps', 'self-test-out'].forEach(id => { $(id).innerHTML = ''; });
    $('data-summary').textContent = ''; $('target-hint').textContent = '';
    showError('load-error', ''); showError('run-error', '');
    resetDOE();
    ['lsl', 'usl', 'spec-target'].forEach(id => { $(id).value = ''; });
    showError('spc-error', '');
    $('delete-top').hidden = true;
    const note = $('deleted-note');
    note.textContent = had ? (reason || 'Your data and all results have been deleted from this page.') + ' Nothing was saved or sent anywhere.' : 'Cleared. There was no data loaded. Nothing was saved or sent anywhere.';
    note.hidden = false;
    $('load').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let idleTimer = null;
  function touch() {
    clearTimeout(idleTimer);
    if (state.table && $('auto-delete').checked) idleTimer = setTimeout(() => deleteData('Auto-delete: after 30 minutes without activity, your data and results were removed.'), IDLE_MS);
  }

  // ---------- Wiring ----------
  function init() {
    C.bindTips($('tip'));
    $('samples').innerHTML = window.MLSamples.map(s => '<button type="button" class="sample" data-sample="' + s.id + '"><span class="k">' + h(s.kind) + '</span><b>' + h(s.title) + '</b><span>' + h(s.blurb) + '</span></button>').join('');
    $('samples').addEventListener('click', e => {
      const b = e.target.closest('[data-sample]'); if (!b) return;
      const s = window.MLSamples.find(x => x.id === b.getAttribute('data-sample'));
      loadText(s.make(), s.title + ' (practice data)', s.target);
    });
    $('file').addEventListener('change', e => readFile(e.target.files[0]));
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
    $('use-paste').addEventListener('click', () => { const t = $('paste').value; if (t.trim()) { $('paste').value = ''; loadText(t, 'Pasted data'); } else showError('load-error', 'Paste some data first.'); });
    ['clear', 'delete-top', 'delete-bottom'].forEach(id => $(id).addEventListener('click', () => deleteData()));
    $('target').addEventListener('change', renderProfile);
    document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { if (state.prof) renderProfile(); }));
    $('task').addEventListener('change', renderProfile);
    $('run').addEventListener('click', runAgent);
    $('download-report').addEventListener('click', () => state.report && download('ml-agent-report.html', reportHTML(state.report), 'text/html'));
    $('print').addEventListener('click', () => window.print());
    $('save-pdf').addEventListener('click', savePDF);
    $('plan').addEventListener('change', e => { if (e.target.id === 'plan-target' || e.target.id === 'plan-from') retargetFrom(e.target.id); });
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    $('self-test').addEventListener('click', selfTest);
    ['pointerdown', 'keydown', 'scroll', 'input'].forEach(t => document.addEventListener(t, touch, { passive: true, capture: true }));
    $('auto-delete').addEventListener('change', touch);
    // Leaving the page wipes the data, so the browser's back/forward cache cannot bring it back.
    window.addEventListener('pagehide', () => { if (state.table) deleteData(); });

    state.factors = DEFAULT_FACTORS();
    renderFactors();
    $('factors').addEventListener('input', e => {
      const i = e.target.getAttribute('data-i'); if (i === null) return;
      state.factors[Number(i)][e.target.getAttribute('data-k')] = e.target.value;
    });
    $('factors').addEventListener('click', e => {
      const r = e.target.closest('[data-remove]'); if (!r) return;
      if (state.factors.length <= 1) return showError('doe-error', 'A design needs at least one factor.');
      state.factors.splice(Number(r.getAttribute('data-remove')), 1); renderFactors();
    });
    $('add-factor').addEventListener('click', () => {
      if (state.factors.length >= 19) return showError('doe-error', 'Up to 19 factors are supported.');
      state.factors.push({ name: 'Factor ' + (state.factors.length + 1), low: -1, high: 1 }); renderFactors();
    });
    $('design-type').addEventListener('change', designPurpose);
    $('generate').addEventListener('click', () => generateDesign());
  }
  init();
})();
