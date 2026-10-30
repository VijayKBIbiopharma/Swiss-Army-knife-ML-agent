/* Golden batch panel: reads a campaign of batch time-series, learns the path the good
   batches took, and scores the rest against it. The first thing on screen is a sentence
   anybody can act on; the charts and the statistics sit underneath for whoever wants them.
   Nothing is uploaded or stored. */
(function () {
  'use strict';
  const E = window.MLEngine, G = window.MLGolden, CH = window.Charts;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = v => (isFinite(v) ? Number(v).toFixed(1) : '–');
  const f2 = v => (isFinite(v) ? Number(v).toFixed(2) : '–');

  let table = null, result = null, shown = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- reading the campaign ----------
  const BATCH = /batch|lot|run|campaign/i;
  const TIME = /hour|time|age|elapsed|duration|day|min|stamp/i;

  function loadText(text) {
    let t;
    try { t = E.parseTable(text); } catch (e) { return fail('Could not read the data: ' + e.message); }
    if (!t.rows.length || t.columns.length < 3) return fail('Need at least three columns: a batch, a time, and one sensor.');
    table = t;
    const prof = E.profile(t);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    const batchCol = t.columns.find(c => BATCH.test(c)) || t.columns.find(c => !numeric.includes(c)) || t.columns[0];
    const timeCol = numeric.find(c => TIME.test(c)) || numeric[0] || t.columns[1];
    const opt = (sel, cols, val) => { $(sel).innerHTML = cols.map(c => '<option' + (c === val ? ' selected' : '') + '>' + h(c) + '</option>').join(''); };
    opt('gb-batch', t.columns, batchCol);
    opt('gb-time', t.columns, timeCol);
    $('gb-settings').hidden = false;
    $('gb-shape').open = false;
    refreshPickers();
  }

  // Sensors and batches are offered as tick boxes, because both are usually chosen by eye.
  function refreshPickers() {
    if (!table) return;
    const bCol = $('gb-batch').value, tCol = $('gb-time').value;
    const prof = E.profile(table);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    const sensors = table.columns.filter(c => c !== bCol && c !== tCol && numeric.includes(c));
    const chosen = new Set(Array.from(document.querySelectorAll('#gb-vars input:checked')).map(i => i.value));
    $('gb-vars').innerHTML = sensors.length
      ? sensors.map(c => '<label class="chip-check"><input type="checkbox" value="' + h(c) + '"' + (chosen.size ? (chosen.has(c) ? ' checked' : '') : ' checked') + '> ' + h(c) + '</label>').join('')
      : '<p class="hint">No numeric sensor columns found besides the batch and time columns.</p>';

    const bi = table.columns.indexOf(bCol);
    const ids = [];
    table.rows.forEach(r => { const v = String(r[bi]).trim(); if (v && !ids.includes(v)) ids.push(v); });
    const refChosen = new Set(Array.from(document.querySelectorAll('#gb-refs input:checked')).map(i => i.value));
    $('gb-refs').innerHTML = ids.map(b => '<label class="chip-check"><input type="checkbox" value="' + h(b) + '"' + (refChosen.size ? (refChosen.has(b) ? ' checked' : '') : ' checked') + '> ' + h(b) + '</label>').join('');
    updateNote(ids.length);
    describe();
  }
  function updateNote(total) {
    const n = document.querySelectorAll('#gb-refs input:checked').length;
    $('gb-ref-note').textContent = n + ' of ' + total + ' batches will define normal.' +
      (n < 3 ? ' At least 3 are needed.' : n < 8 ? ' Ten or more gives a far steadier envelope.' : '') +
      ' Untick any batch you would not want repeated; it will still be scored, just not used to set the standard.';
  }
  const chosenVars = () => Array.from(document.querySelectorAll('#gb-vars input:checked')).map(i => i.value);
  const chosenRefs = () => Array.from(document.querySelectorAll('#gb-refs input:checked')).map(i => i.value);

  function readRecords() {
    if (!table) throw new Error('Load some batch data first.');
    const bi = table.columns.indexOf($('gb-batch').value);
    const ti = table.columns.indexOf($('gb-time').value);
    const vars = chosenVars();
    if (bi < 0 || ti < 0) throw new Error('Pick a batch column and a time column.');
    if (bi === ti) throw new Error('The batch column and the time column must be different.');
    if (vars.length < 2) throw new Error('Tick at least two sensors. Watching one sensor is an ordinary control chart, not this.');
    const idx = vars.map(v => table.columns.indexOf(v));
    return table.rows.map(r => {
      const vals = {};
      vars.forEach((v, k) => { vals[v] = r[idx[k]]; });
      return { batch: String(r[bi]).trim(), time: r[ti], vars: vals };
    });
  }

  function describe() {
    try {
      const recs = readRecords();
      const ids = Array.from(new Set(recs.map(r => r.batch)));
      const times = recs.map(r => Number(r.time)).filter(isFinite);
      $('gb-read').textContent = recs.length.toLocaleString() + ' readings across ' + ids.length + ' batches, ' +
        chosenVars().length + ' sensors, time running ' + f1(Math.min.apply(null, times)) + ' to ' + f1(Math.max.apply(null, times)) + '.';
    } catch (e) { $('gb-read').textContent = e.message; }
  }
  function fail(msg) { $('gb-error').textContent = msg; $('gb-error').hidden = false; }

  // ---------- charts ----------
  /* One chart shape reused for T-squared and Q: a line through time with the alarm limit
     drawn across it, and anything over the limit picked out. */
  function statChart(el, pts, limit, label, colour) {
    const W = Math.max(320, el.clientWidth || 640), H = 170, L = 52, R = 14, T = 14, B = 34;
    const seen = pts.filter(Boolean);
    if (!seen.length) { el.innerHTML = '<p class="hint">No overlapping data to score.</p>'; return; }
    const xs = seen.map(p => p.t), ys = seen.map(p => p.v);
    const xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
    const yhi = Math.max(limit * 1.35, Math.max.apply(null, ys) * 1.1), ylo = 0;
    const sx = v => L + (v - xlo) / ((xhi - xlo) || 1) * (W - L - R);
    const sy = v => H - B - (v - ylo) / ((yhi - ylo) || 1) * (H - T - B);
    let b = '';
    b += '<rect class="over" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + Math.max(0, sy(limit) - T) + '"/>';
    for (const t of CH.niceTicks(ylo, yhi, 4)) if (t >= ylo && t <= yhi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + f1(t) + '</text>';
    for (const t of CH.niceTicks(xlo, xhi, 6)) if (t >= xlo && t <= xhi) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + Math.round(t) + '</text>';
    b += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    b += '<line class="ref" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(limit) + '" y2="' + sy(limit) + '"/>' +
      '<text class="lbl-strong" x="' + (W - R - 2) + '" y="' + (sy(limit) - 5) + '" text-anchor="end">alarm limit ' + f1(limit) + '</text>';
    b += '<path class="line ' + colour + '" d="' + seen.map((p, i) => (i ? 'L' : 'M') + sx(p.t).toFixed(1) + ' ' + sy(Math.min(p.v, yhi)).toFixed(1)).join('') + '"/>';
    seen.forEach(p => { if (p.v > limit) b += '<circle class="pt flag" cx="' + sx(p.t) + '" cy="' + sy(Math.min(p.v, yhi)) + '" r="3.5"/>'; });
    b += '<text class="lbl-strong" transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + h(label) + '</text>';
    el.innerHTML = '<svg class="chart gb-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(label) + ' against time">' + b + '</svg>';
  }

  // The golden envelope for one sensor: the band good batches stayed in, and this batch over it.
  function envelopeChart(el, res, scored, varIndex) {
    const W = Math.max(320, el.clientWidth || 640), H = 210, L = 58, R = 14, T = 16, B = 38;
    const env = scored.env[varIndex], grid = res.grid;
    const name = res.variables[varIndex];
    const b0 = res.gridSeries[scored.name];
    const line = b0 ? b0[varIndex] : [];
    const vals = [];
    env.forEach(e => { if (e.mean !== null) { vals.push(e.mean + 3 * e.sd, e.mean - 3 * e.sd); } });
    line.forEach(v => { if (v !== null) vals.push(v); });
    if (!vals.length) { el.innerHTML = ''; return; }
    let ylo = Math.min.apply(null, vals), yhi = Math.max.apply(null, vals);
    const pad = (yhi - ylo) * 0.08 || 1; ylo -= pad; yhi += pad;
    const xlo = grid[0], xhi = grid[grid.length - 1];
    const sx = v => L + (v - xlo) / ((xhi - xlo) || 1) * (W - L - R);
    const sy = v => H - B - (v - ylo) / ((yhi - ylo) || 1) * (H - T - B);
    const band = k => {
      const up = [], dn = [];
      grid.forEach((t, g) => { const e = env[g]; if (e.mean === null) return; up.push([t, e.mean + k * e.sd]); dn.push([t, e.mean - k * e.sd]); });
      if (!up.length) return '';
      return '<path class="envelope" d="' + up.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('') +
        dn.reverse().map(p => 'L' + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('') + 'Z"/>';
    };
    let b = '';
    for (const t of CH.niceTicks(ylo, yhi, 4)) if (t >= ylo && t <= yhi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + f2(t) + '</text>';
    for (const t of CH.niceTicks(xlo, xhi, 6)) if (t >= xlo && t <= xhi) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + Math.round(t) + '</text>';
    b += band(3) + '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    const mid = grid.map((t, g) => (env[g].mean === null ? null : [t, env[g].mean])).filter(Boolean);
    b += '<path class="golden" d="' + mid.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('') + '"/>';
    const mine = grid.map((t, g) => (line[g] === null || line[g] === undefined ? null : [t, line[g]])).filter(Boolean);
    b += '<path class="watched" d="' + mine.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('') + '"/>';
    if (scored.alarm) b += '<line class="target-line" x1="' + sx(scored.alarm.t) + '" x2="' + sx(scored.alarm.t) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    b += '<text class="lbl-strong" transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + h(name) + '</text>';
    el.innerHTML = '<svg class="chart gb-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(name) + ' against the golden envelope">' + b + '</svg>' +
      CH.legend([{ label: 'what good batches did (average)', cls: 'pt' }, { label: 'the range they stayed in', cls: 'usual', shape: 'square' }, { label: h(scored.name), cls: 'pt c2' }]);
  }

  // ---------- plain English ----------
  /* The sentence a plant manager can act on without reading any of the statistics. Written
     first on purpose: if this paragraph is not useful on its own, the panel has failed. */
  function plainEnglish(res, s) {
    const unit = res.align === 'percent' ? '% of the way through' : 'hours in';
    if (s.verdict === 'normal') {
      return { tone: 'capable', head: 'Normal',
        text: 'Batch ' + s.name + ' followed the same path as your good batches from start to finish. Nothing in the ' + res.variables.length + ' sensors watched here stepped outside what the reference batches did.' };
    }
    const blame = s.alarmBlame || s.worstBlame;
    const who = blame ? blame.variable : 'a sensor';
    const howFar = blame ? Math.abs(blame.z).toFixed(1) : '?';
    const dir = blame && blame.z > 0 ? 'higher' : 'lower';
    if (s.verdict === 'watch') {
      return { tone: 'marginal', head: 'Worth a look',
        text: 'Batch ' + s.name + ' drifted outside the normal range at ' + s.flagged + ' of ' + s.scored + ' checkpoints, but never for long enough to call it a fault. The furthest it strayed was on ' + who + '. Worth a glance, not an investigation.' };
    }
    return { tone: 'not', head: 'Off the path',
      text: 'Batch ' + s.name + ' left the normal path at ' + f1(s.alarm.t) + ' ' + unit + ' and stayed out. The sensor furthest from where good batches sat was ' + who + ', running about ' + howFar + ' standard deviations ' + dir + ' than normal at that moment. In total ' + s.flagged + ' of ' + s.scored + ' checkpoints were outside the limit.' };
  }

  // ---------- results ----------
  function render(res) {
    result = res;
    const alarms = res.summary.filter(s => s.verdict === 'alarm');
    const watch = res.summary.filter(s => s.verdict === 'watch');
    const refFalse = res.summary.filter(s => s.isRef && s.verdict === 'alarm').length;
    const headline = alarms.length
      ? alarms.length + ' of ' + res.summary.length + ' batches left the normal path'
      : 'All ' + res.summary.length + ' batches followed the normal path';

    const tile = (lbl, val, sub, hero) => '<div class="tile' + (hero ? ' hero-tile' : '') + '"><div class="lbl">' + h(lbl) + '</div><div class="val">' + h(val) + '</div><div class="sub">' + h(sub || '') + '</div></div>';
    const tiles = tile('Verdict', alarms.length ? alarms.length + ' flagged' : 'All clear', headline, true) +
      tile('Batches checked', String(res.summary.length), res.reference.length + ' used to define normal') +
      tile('Sensors watched together', String(res.variables.length), res.components + ' patterns cover ' + Math.round(res.varianceCovered * 100) + '% of normal variation') +
      tile('Alarm limit', Math.round(res.limit * 100) + '%', 'set from batches held out of the model');

    const rows = res.summary.map(s => {
      const dot = { alarm: 'bad', watch: 'warn', normal: 'good' }[s.verdict];
      const word = { alarm: 'Off the path', watch: 'Worth a look', normal: 'Normal' }[s.verdict];
      return '<tr class="gb-row" data-batch="' + h(s.name) + '"><td><span class="dot ' + dot + '"></span><b>' + h(s.name) + '</b>' + (s.isRef ? ' <span class="chip">reference</span>' : '') + '</td>' +
        '<td>' + word + '</td><td class="num-cell">' + s.flagged + ' / ' + s.scored + '</td>' +
        '<td class="num-cell">' + (s.alarmAt === null ? '–' : f1(s.alarmAt)) + '</td><td>' + h(s.alarmBy || '–') + '</td>' +
        '<td class="num-cell">' + f1(s.maxT2) + '</td><td class="num-cell">' + f1(s.maxQ) + '</td>' +
        '<td><button type="button" class="btn ghost small" data-show="' + h(s.name) + '">Open</button></td></tr>';
    }).join('');

    $('gb-out').innerHTML = '<div class="card gb-result"><h3>Campaign review</h3>' +
      '<div class="plain"><h4>In plain English</h4><p>' + h(
        alarms.length
          ? alarms.length + ' batch' + (alarms.length === 1 ? '' : 'es') + ' (' + alarms.map(s => s.name).join(', ') + ') stopped following the path your good batches took, and stayed off it. ' +
            (watch.length ? watch.length + ' more wobbled briefly but came back. ' : '') + 'Open a batch below to see when it happened and which sensor was furthest out.'
          : 'Every batch in this campaign behaved like the reference runs. Nothing needs investigating on these ' + res.variables.length + ' sensors.'
      ) + '</p>' +
      (refFalse ? '<p class="hint">' + refFalse + ' of those flagged is a batch you marked as a reference. Either it was not as good as assumed, or it is unusual in a way that does not matter. Untick it and run again to see.</p>' : '') +
      '</div>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<h4>Every batch</h4><div class="table-scroll"><table><thead><tr><th>Batch</th><th>Verdict</th><th class="num-cell">Points out</th><th class="num-cell">Alarm at</th><th>Driven by</th><th class="num-cell">Worst T&sup2;</th><th class="num-cell">Worst Q</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div id="gb-detail"></div>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="gb-csv">Download the review (.csv)</button></div>' +
      '<p class="hint">Decision support, not a validated monitoring system. Limits come from the batches you nominated; if those were not truly representative, neither are the limits.</p>' +
      '</div>';

    $('gb-out').addEventListener('click', e => {
      const btn = e.target.closest('[data-show]');
      if (btn) showBatch(btn.getAttribute('data-show'));
    });
    $('gb-csv').addEventListener('click', () => download('golden-batch-review.csv', reportCSV(res), 'text/csv'));
    const first = (alarms[0] || watch[0] || res.summary[0]);
    if (first) showBatch(first.name);
    window.MLGoldenRun = summary(res);
  }

  function showBatch(name) {
    const res = result;
    const s = res.scoreBatch(name);
    shown = s;
    const p = plainEnglish(res, s);
    const blame = s.alarmBlame || s.worstBlame;
    const unit = res.align === 'percent' ? '%' : 'h';
    const contribs = blame ? blame.contributions.slice(0, 6).map(c =>
      '<tr><td>' + h(c.name) + '</td><td class="num-cell">' + (c.z > 0 ? '+' : '') + f1(c.z) + '</td><td class="num-cell">' + Math.round(c.qShare * 100) + '%</td></tr>').join('') : '';
    $('gb-detail').innerHTML = '<h4>Batch ' + h(name) + (s.isRef ? ' <span class="chip">reference</span>' : '') + '</h4>' +
      '<div class="plain ' + p.tone + '"><h4>' + h(p.head) + '</h4><p>' + h(p.text) + '</p></div>' +
      '<div class="cols2"><div><h4>All sensors together (T&sup2;)</h4><p class="hint">How far this batch is from the middle of normal, counting every sensor at once.</p><div id="gb-t2"></div></div>' +
      '<div><h4>Do the sensors still agree (Q)?</h4><p class="hint">Whether the sensors relate to each other the way they normally do. A probe drifting out of step shows here first.</p><div id="gb-q"></div></div></div>' +
      (blame ? '<h4>What was furthest out' + (s.alarm ? ' at ' + f1(s.alarm.t) + unit : '') + '</h4>' +
        '<div class="table-scroll"><table><thead><tr><th>Sensor</th><th class="num-cell">Standard deviations from normal</th><th class="num-cell">Share of the disagreement</th></tr></thead><tbody>' + contribs + '</tbody></table></div>' : '') +
      '<h4>Sensor against the golden envelope</h4>' +
      '<div class="controls"><label>Show sensor <select id="gb-pick">' +
      res.variables.map((v, i) => '<option value="' + i + '"' + (blame && v === blame.variable ? ' selected' : '') + '>' + h(v) + '</option>').join('') +
      '</select></label></div><div id="gb-env"></div>';
    statChart($('gb-t2'), s.points.map(x => (x ? { t: x.t, v: x.t2 } : null)), s.t2Limit, 'T²', 'c1');
    statChart($('gb-q'), s.points.map(x => (x ? { t: x.t, v: x.q } : null)), s.qLimit, 'Q', 'c4');
    const draw = () => envelopeChart($('gb-env'), res, s, Number($('gb-pick').value));
    $('gb-pick').addEventListener('change', draw);
    draw();
  }

  const summary = res => ({
    when: new Date().toISOString(), variables: res.variables, reference: res.reference,
    align: res.align, components: res.components, varianceCovered: res.varianceCovered,
    limit: res.limit, calibration: res.calibration, t2Limit: res.t2Limit, qLimit: res.qLimit,
    batches: res.summary.map(s => ({ name: s.name, isRef: s.isRef, verdict: s.verdict, flagged: s.flagged, scored: s.scored, alarmAt: s.alarmAt, alarmBy: s.alarmBy, maxT2: s.maxT2, maxQ: s.maxQ })),
    columns: { batch: $('gb-batch').value, time: $('gb-time').value }
  });

  function reportCSV(res) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const L = [];
    L.push(['Golden batch review (PCA, Hotelling T-squared, Q residuals)']);
    L.push(['Generated', q(new Date().toISOString())]);
    L.push(['Computed', q('In the browser. No data was uploaded or stored.')]);
    L.push([]);
    L.push(['Setting', 'Value']);
    L.push(['Batch column', q($('gb-batch').value)], ['Time column', q($('gb-time').value)]);
    L.push(['Sensors', q(res.variables.join('; '))]);
    L.push(['Reference batches', q(res.reference.join('; '))]);
    L.push(['Aligned on', q(res.align === 'percent' ? 'percent of batch length' : 'elapsed time')]);
    L.push(['Principal components', res.components], ['Normal variation covered', res.varianceCovered]);
    L.push(['Alarm limit', res.limit], ['Limits calibrated on', q(res.calibration)]);
    L.push(['T2 limit', res.t2Limit], ['Q limit', res.qLimit]);
    L.push([]);
    L.push(['Batch', 'Reference', 'Verdict', 'Points out', 'Points scored', 'Alarm at', 'Driven by', 'Worst T2', 'Worst Q']);
    res.summary.forEach(s => L.push([q(s.name), s.isRef ? 'yes' : 'no', s.verdict, s.flagged, s.scored, s.alarmAt === null ? '' : s.alarmAt, q(s.alarmBy || ''), s.maxT2, s.maxQ]));
    L.push([]);
    L.push([q('Decision support, not a validated monitoring system. Limits come from the nominated reference batches.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }

  /* An example campaign, generated here rather than taken from a real plant: ten batches that
     behaved, one whose dissolved oxygen slides away from day seven, one with a brief
     temperature excursion, and one where the pH probe drifts out of step with the vessel.

     Batch-to-batch deviations are correlated through a per-batch "vigour": a culture that
     grows faster runs slightly warmer, pulls oxygen down and takes more feed. That is what
     real vessels do, and it is what gives PCA something to find — without it Q has no
     relationship to notice the breaking of. The faulted batches are given an ordinary vigour
     so the only unusual thing about them is the fault itself. */
  function example() {
    const r = E.rng(9);
    const N = () => { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const lines = ['BatchID,Hours,Temp_C,DO_Pct,pH,Feed_mL_h,Agitation_rpm'];
    const one = (id, fault, fixed) => {
      const vigour = fixed === undefined ? N() : fixed;
      for (let hh = 0; hh <= 336; hh += 6) {
        const f = hh / 336;
        let temp = 37 - 0.8 * f + 0.08 * vigour + N() * 0.04;
        let dO = 55 - 20 * f - 2.2 * vigour + N() * 0.5;
        let ph = 7.05 - 0.1 * f - 0.03 * vigour + N() * 0.012;
        const feed = 2 + 10 * f + 0.45 * vigour + N() * 0.08;
        const agit = 120 + 30 * f + 1.1 * vigour + N() * 0.6;
        if (fault === 'do' && hh >= 168) dO -= 0.09 * (hh - 168);
        if (fault === 'temp' && hh >= 240 && hh <= 270) temp += 1.2;
        if (fault === 'probe' && hh >= 120) ph += 0.22;
        lines.push([id, hh, temp.toFixed(2), dO.toFixed(1), ph.toFixed(3), feed.toFixed(2), agit.toFixed(0)].join(','));
      }
    };
    for (let i = 1; i <= 10; i++) one('B-24' + String(i).padStart(2, '0'), null);
    one('B-2411', 'do', 0.25); one('B-2412', 'temp', 0.25); one('B-2413', 'probe', 0.25);
    return lines.join('\n');
  }

  function run() {
    $('gb-error').hidden = true;
    let recs;
    try { recs = readRecords(); } catch (e) { return fail(e.message); }
    try {
      const res = G.analyze(recs, {
        variables: chosenVars(), reference: chosenRefs(),
        align: $('gb-align').value, limit: Number($('gb-limit').value),
        minRun: Number($('gb-minrun').value) || 3, gridPoints: Number($('gb-grid').value) || 60
      });
      render(res);
      $('gb-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { fail(e.message); }
  }

  function clear() {
    table = null; result = null; shown = null; window.MLGoldenRun = null;
    $('gb-data').value = ''; $('gb-out').innerHTML = ''; $('gb-read').textContent = '';
    $('gb-settings').hidden = true; $('gb-error').hidden = true; $('gb-file').value = '';
    $('gb-vars').innerHTML = ''; $('gb-refs').innerHTML = '';
  }

  function init() {
    const load = text => { $('gb-data').value = text; $('gb-error').hidden = true; $('delete-top').hidden = false; loadText(text); };
    $('gb-sample').addEventListener('click', () => load(example()));
    $('gb-clear').addEventListener('click', clear);
    $('gb-data').addEventListener('change', () => { if ($('gb-data').value.trim()) { $('delete-top').hidden = false; loadText($('gb-data').value); } });
    $('gb-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => load(String(fr.result));
      fr.readAsText(f);
    });
    ['gb-batch', 'gb-time'].forEach(id => $(id).addEventListener('change', refreshPickers));
    $('gb-vars').addEventListener('change', describe);
    $('gb-refs').addEventListener('change', () => updateNote(document.querySelectorAll('#gb-refs input').length));
    $('gb-run').addEventListener('click', run);
  }

  window.MLGoldenUI = { clear, example };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
