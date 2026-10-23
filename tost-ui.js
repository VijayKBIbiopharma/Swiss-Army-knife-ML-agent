/* Method-transfer equivalence panel: reads results from two methods, runs TOST, and shows
   the interval against the margin you declared. Nothing is uploaded or stored. */
(function () {
  'use strict';
  const E = window.MLEngine, T = window.MLTost, CH = window.Charts;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (isFinite(v) ? Number(v).toFixed(2) : '–');
  const f3 = v => (isFinite(v) ? Number(v).toFixed(3) : '–');
  const pFmt = p => (p === null || p === undefined || !isFinite(p) ? '–' : p < 0.0001 ? '<0.0001' : p.toFixed(4));

  let table = null, last = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- reading the results ----------
  const GROUP = /method|lab|instrument|analyst|site|operator|system|group|site|column/i;
  const VALUE = /result|value|assay|purity|potency|conc|content|measure|area|response|%/i;
  const SAMPLE = /sample|specimen|lot|batch|vial|id$|^id/i;

  function loadText(text) {
    let t;
    try { t = E.parseCSV(text); } catch (e) { return fail('Could not read the data: ' + e.message); }
    if (!t.rows.length || t.columns.length < 2) return fail('No usable rows found. The first row should hold column names.');
    table = t;
    const prof = E.profile(t);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    const twoLevel = prof.columns.filter(c => c.unique >= 2 && c.unique <= 8 && c.kind !== 'numeric').map(c => c.name);
    const pick = (re, from, fallback) => from.find(c => re.test(c)) || fallback || '';
    const groupCol = pick(GROUP, twoLevel.length ? twoLevel : t.columns, twoLevel[0] || t.columns[0]);
    const valueCol = pick(VALUE, numeric, numeric[numeric.length - 1]) || '';
    const sampleCol = t.columns.filter(c => c !== groupCol && c !== valueCol).find(c => SAMPLE.test(c)) || '';
    const opt = (sel, cols, val, blank) => {
      $(sel).innerHTML = (blank ? '<option value="">(none)</option>' : '') + cols.map(c => '<option' + (c === val ? ' selected' : '') + '>' + h(c) + '</option>').join('');
    };
    opt('eq-group', t.columns, groupCol); opt('eq-value', t.columns, valueCol); opt('eq-sampleid', t.columns, sampleCol, true);
    $('eq-settings').hidden = false;
    fillMethods();
    describe();
  }

  function fillMethods() {
    if (!table) return;
    const gi = table.columns.indexOf($('eq-group').value);
    const labels = gi < 0 ? [] : Array.from(new Set(table.rows.map(r => String(r[gi]).trim()).filter(Boolean)));
    const prevRef = $('eq-ref').value, prevTest = $('eq-test').value;
    $('eq-ref').innerHTML = labels.map(l => '<option>' + h(l) + '</option>').join('');
    $('eq-test').innerHTML = labels.map(l => '<option>' + h(l) + '</option>').join('');
    if (labels.includes(prevRef)) $('eq-ref').value = prevRef; else $('eq-ref').value = labels[0] || '';
    if (labels.includes(prevTest) && prevTest !== $('eq-ref').value) $('eq-test').value = prevTest;
    else $('eq-test').value = labels.find(l => l !== $('eq-ref').value) || labels[1] || '';
    // Pairing is only on offer when a sample identifier actually matches across both methods.
    $('eq-paired-wrap').hidden = !pairableCount();
  }
  function pairableCount() {
    const si = $('eq-sampleid').value ? table.columns.indexOf($('eq-sampleid').value) : -1;
    const gi = table.columns.indexOf($('eq-group').value);
    if (si < 0 || gi < 0) return 0;
    const ref = $('eq-ref').value, test = $('eq-test').value;
    const inRef = new Set(), inTest = new Set();
    table.rows.forEach(r => {
      const g = String(r[gi]).trim(), id = String(r[si]).trim();
      if (!id) return;
      if (g === ref) inRef.add(id); else if (g === test) inTest.add(id);
    });
    let n = 0; inRef.forEach(id => { if (inTest.has(id)) n++; });
    return n;
  }

  function readRows() {
    if (!table) throw new Error('Load some results first.');
    const gi = table.columns.indexOf($('eq-group').value);
    const vi = table.columns.indexOf($('eq-value').value);
    if (gi < 0 || vi < 0) throw new Error('Pick a method column and a result column.');
    if (gi === vi) throw new Error('The method column and the result column must be different.');
    const si = $('eq-sampleid').value ? table.columns.indexOf($('eq-sampleid').value) : -1;
    const out = [];
    let skipped = 0;
    table.rows.forEach(r => {
      const value = E.toNumber(r[vi]);
      if (value === null) { skipped++; return; }
      out.push({ group: String(r[gi]).trim(), value, sample: si >= 0 ? String(r[si]).trim() : '' });
    });
    if (!out.length) throw new Error('No numeric results found in "' + $('eq-value').value + '".');
    return { rows: out, skipped };
  }
  const readOpts = () => ({
    reference: $('eq-ref').value, test: $('eq-test').value,
    margin: Number($('eq-margin').value), marginType: $('eq-margin-type').value,
    alpha: Number($('eq-alpha').value), paired: !$('eq-paired-wrap').hidden && $('eq-paired').checked,
    welch: $('eq-var').value !== 'pooled'
  });

  function describe() {
    try {
      const { rows, skipped } = readRows();
      const labels = Array.from(new Set(rows.map(r => r.group)));
      const pairs = pairableCount();
      $('eq-read').textContent = rows.length + ' results across ' + labels.length + ' method' + (labels.length === 1 ? '' : 's') + ' (' + labels.slice(0, 6).join(', ') + (labels.length > 6 ? '…' : '') + ').' +
        (pairs ? ' ' + pairs + ' sample' + (pairs === 1 ? '' : 's') + ' measured by both, so they can be paired.' : '') +
        (skipped ? ' ' + skipped + ' row' + (skipped === 1 ? '' : 's') + ' skipped (no number in the result column).' : '');
    } catch (e) { $('eq-read').textContent = e.message; }
  }
  function fail(msg) { $('eq-error').textContent = msg; $('eq-error').hidden = false; }

  // ---------- the TOST chart ----------
  /* The confidence interval against the band you declared acceptable. Everything the test
     says is visible here: if the whole bar sits inside the shaded band, it passes. */
  function drawChart(el, r) {
    const W = Math.max(340, el.clientWidth || 700), H = 190, L = 40, R = 40, T0 = 34, mid = 104;
    const span = Math.max(r.margin * 1.45, Math.abs(r.ciLow) * 1.2, Math.abs(r.ciHigh) * 1.2, 1e-9);
    const sx = v => L + (v + span) / (2 * span) * (W - L - R);
    let b = '';
    b += '<rect class="band" x="' + sx(-r.margin) + '" y="' + T0 + '" width="' + (sx(r.margin) - sx(-r.margin)) + '" height="' + (mid + 34 - T0) + '"/>';
    [[-r.margin, '−margin'], [r.margin, '+margin']].forEach(([v, lab]) => {
      b += '<line class="ref" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T0 + '" y2="' + (mid + 34) + '"/>' +
        '<text class="lbl-strong" x="' + sx(v) + '" y="' + (T0 - 8) + '" text-anchor="middle">' + lab + ' ' + f2(v) + '</text>';
    });
    b += '<line class="zero" x1="' + sx(0) + '" x2="' + sx(0) + '" y1="' + T0 + '" y2="' + (mid + 34) + '"/>';
    b += '<text x="' + sx(0) + '" y="' + (mid + 50) + '" text-anchor="middle">no difference</text>';
    // The interval itself, with caps.
    const cls = r.equivalent ? 'ok' : r.differs ? 'bad' : 'warn';
    b += '<line class="ci ' + cls + '" x1="' + sx(r.ciLow) + '" x2="' + sx(r.ciHigh) + '" y1="' + mid + '" y2="' + mid + '"/>';
    [r.ciLow, r.ciHigh].forEach(v => { b += '<line class="ci-cap ' + cls + '" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + (mid - 9) + '" y2="' + (mid + 9) + '"/>'; });
    b += '<circle class="ci-dot ' + cls + '" cx="' + sx(r.diff) + '" cy="' + mid + '" r="6"/>';
    b += '<text class="lbl-strong" x="' + sx(r.diff) + '" y="' + (mid - 16) + '" text-anchor="middle">difference ' + f3(r.diff) + '</text>';
    b += '<text x="' + sx(r.ciLow) + '" y="' + (mid + 26) + '" text-anchor="middle">' + f3(r.ciLow) + '</text>';
    b += '<text x="' + sx(r.ciHigh) + '" y="' + (mid + 26) + '" text-anchor="middle">' + f3(r.ciHigh) + '</text>';
    b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + h(r.test) + ' minus ' + h(r.reference) + ' &#183; ' + Math.round(r.confidence * 100) + '% confidence interval</text>';
    el.innerHTML = '<svg class="chart tost-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Confidence interval against the equivalence margins">' + b + '</svg>';
  }

  // A strip of the individual results, so an outlier cannot hide behind a mean.
  function drawPoints(el, r, rows) {
    const groups = [r.reference, r.test];
    const vals = rows.filter(x => groups.includes(x.group)).map(x => x.value);
    const W = Math.max(320, el.clientWidth || 700), rowH = 46, H = 34 + rowH * 2, L = Math.min(150, 20 + Math.max(r.reference.length, r.test.length) * 7.5), R = 20;
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const sx = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let b = '';
    for (const t of CH.niceTicks(lo, hi, 5)) if (t >= lo && t <= hi) b += '<text x="' + sx(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + f2(t) + '</text>';
    groups.forEach((g, i) => {
      const y = 24 + i * rowH, st = i === 0 ? r.refStats : r.testStats;
      b += '<text class="lbl-strong" x="0" y="' + (y + 4) + '">' + h(g) + '</text>';
      b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>';
      b += '<line class="mean-mark c' + (i + 1) + '" x1="' + sx(st.mean) + '" x2="' + sx(st.mean) + '" y1="' + (y - 13) + '" y2="' + (y + 13) + '"/>';
      rows.filter(x => x.group === g).forEach(x => {
        b += '<g data-tip="' + h(g + ' · ' + f3(x.value) + (x.sample ? ' · ' + x.sample : '')) + '"><circle class="pt c' + (i + 1) + '" cx="' + sx(x.value) + '" cy="' + y + '" r="4"/></g>';
      });
    });
    el.innerHTML = '<svg class="chart strip-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Individual results from each method">' + b + '</svg>' +
      '<p class="hint">Every result, with the vertical mark at each method’s mean.</p>';
  }

  // ---------- results ----------
  function render(r, rows) {
    last = { r, rows };
    const badge = { equivalent: ['capable', 'EQUIVALENT'], different: ['not', 'NOT EQUIVALENT'], inconclusive: ['marginal', 'INCONCLUSIVE'] }[r.verdict];
    const headline = {
      equivalent: 'The methods agree closely enough. The whole ' + Math.round(r.confidence * 100) + '% interval sits inside your margin.',
      different: 'There is a real difference, and it is bigger than you said you would accept.',
      inconclusive: 'Not proven either way. The interval is wider than your margin, but it still includes zero, so this is most likely too little data rather than a real bias.'
    }[r.verdict];
    const tile = (lbl, val, sub, hero) => '<div class="tile' + (hero ? ' hero-tile' : '') + '"><div class="lbl">' + h(lbl) + '</div><div class="val">' + h(val) + '</div><div class="sub">' + h(sub || '') + '</div></div>';

    const tiles = tile('Verdict', badge[1] === 'EQUIVALENT' ? 'Pass' : badge[1] === 'INCONCLUSIVE' ? 'Not yet' : 'Fail', r.design, true) +
      tile('Mean difference', f3(r.diff) + (isFinite(r.diffPct) ? ' (' + f2(r.diffPct) + '%)' : ''), h(r.test) + ' minus ' + h(r.reference)) +
      tile(Math.round(r.confidence * 100) + '% interval', f3(r.ciLow) + ' to ' + f3(r.ciHigh), 'margin ±' + f3(r.margin) + (r.marginType === 'percent' ? ' (' + f2(r.marginInput) + '% of ' + f2(r.refStats.mean) + ')' : '')) +
      tile('Margin used up', Math.round(r.bandUsed * 100) + '%', r.bandUsed <= 1 ? 'room to spare' : 'the interval runs past the margin');

    const stats = '<h4>Each method</h4><div class="table-scroll"><table><thead><tr><th>Method</th><th class="num-cell">Results</th><th class="num-cell">Mean</th><th class="num-cell">Std dev</th><th class="num-cell">%CV</th><th class="num-cell">Lowest</th><th class="num-cell">Highest</th></tr></thead><tbody>' +
      [[r.reference, r.refStats, 'reference'], [r.test, r.testStats, 'under test']].map(([n, st, role]) =>
        '<tr><td>' + h(n) + ' <span class="chip">' + role + '</span></td><td class="num-cell">' + st.n + '</td><td class="num-cell">' + f3(st.mean) + '</td><td class="num-cell">' + f3(st.sd) + '</td><td class="num-cell">' + (isFinite(st.cv) ? f2(st.cv * 100) + '%' : '–') + '</td><td class="num-cell">' + f3(st.min) + '</td><td class="num-cell">' + f3(st.max) + '</td></tr>').join('') +
      '</tbody></table></div>';

    const tests = '<h4>The two one-sided tests</h4><div class="table-scroll"><table><thead><tr><th>Test</th><th class="num-cell">t</th><th class="num-cell">df</th><th class="num-cell">p</th><th>At ' + r.alpha + '</th></tr></thead><tbody>' +
      '<tr><td>Difference is above &minus;' + f3(r.margin) + '</td><td class="num-cell">' + f3(r.t1) + '</td><td class="num-cell">' + f2(r.df) + '</td><td class="num-cell">' + pFmt(r.p1) + '</td><td><span class="verdict ' + (r.p1 < r.alpha ? 'capable' : 'not') + '">' + (r.p1 < r.alpha ? 'passed' : 'not passed') + '</span></td></tr>' +
      '<tr><td>Difference is below +' + f3(r.margin) + '</td><td class="num-cell">' + f3(r.t2) + '</td><td class="num-cell">' + f2(r.df) + '</td><td class="num-cell">' + pFmt(r.p2) + '</td><td><span class="verdict ' + (r.p2 < r.alpha ? 'capable' : 'not') + '">' + (r.p2 < r.alpha ? 'passed' : 'not passed') + '</span></td></tr>' +
      '<tr class="dim"><td>Overall TOST (the worse of the two)</td><td class="num-cell">–</td><td class="num-cell">' + f2(r.df) + '</td><td class="num-cell">' + pFmt(r.pTost) + '</td><td><span class="verdict ' + (r.equivalent ? 'capable' : 'not') + '">' + (r.equivalent ? 'equivalent' : 'not shown') + '</span></td></tr>' +
      '</tbody></table></div>';

    const notes = [];
    notes.push('Both one-sided tests must pass for equivalence. That is the same statement as the ' + Math.round(r.confidence * 100) + '% interval fitting inside ±' + f3(r.margin) + ', which is what the chart shows.');
    if (r.verdict === 'inconclusive') {
      notes.push('This is the result people most often misread. It is not evidence that the methods agree, and not evidence that they differ.' +
        (r.needed ? ' On the scatter seen here, about ' + r.needed + ' results per method would settle it.' : ' The difference seen here is already larger than the margin, so more data would not rescue it: the margin or the method needs revisiting.'));
    }
    if (r.verdict === 'different') notes.push('The difference of ' + f3(r.diff) + ' is larger than the ±' + f3(r.margin) + ' you allowed (two-sided p ' + pFmt(r.pDiff) + '). More data will not change that; the bias needs investigating, or the margin was set tighter than the method can hold.');
    if (r.verdict === 'equivalent' && r.bandUsed > 0.8) notes.push('It passes, but only just: the interval uses ' + Math.round(r.bandUsed * 100) + '% of the margin. A small drift would fail next time.');
    if (r.paired) notes.push('Paired on the sample identifier: ' + r.pairs.length + ' pairs. Pairing compares like with like, so sample-to-sample spread does not count against the comparison.' + (r.dropped > 0 ? ' ' + r.dropped + ' unmatched result' + (r.dropped === 1 ? ' was' : 's were') + ' left out.' : ''));
    else if (pairableCount()) notes.push('The same samples appear under both methods, so pairing them would be more sensitive than this unpaired comparison. Tick "Match the same samples as pairs" and run again.');
    if (r.refStats.n < 6 || r.testStats.n < 6) notes.push('With ' + Math.min(r.refStats.n, r.testStats.n) + ' results in the smaller method, the interval is wide whatever the truth is. Treat the verdict as provisional.');
    notes.push('The margin is a decision, not a statistic: it has to be set from what matters to the product before the data is seen, not chosen afterwards to get a pass.');

    $('eq-out').innerHTML = '<div class="card eq-result"><h3>Equivalence result</h3>' +
      '<p class="sub-head"><span class="verdict ' + badge[0] + '">' + badge[1] + '</span> ' + h(headline) + '</p>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div id="eq-chart"></div><div id="eq-points"></div>' + stats + tests +
      '<h4>What this rests on</h4><ul class="insights">' + notes.map(n => '<li class="info">' + h(n) + '</li>').join('') + '</ul>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="eq-csv">Download the report (.csv)</button></div>' +
      '<p class="hint">Decision support, not a validated method-transfer system. Confirm against your protocol and have the arithmetic checked independently.</p>' +
      '</div>';
    drawChart($('eq-chart'), r);
    drawPoints($('eq-points'), r, rows);
    $('eq-csv').addEventListener('click', () => download('method-transfer-tost.csv', reportCSV(r, rows), 'text/csv'));
    window.MLTostRun = summary(r);
  }

  const summary = r => ({
    when: new Date().toISOString(), reference: r.reference, test: r.test, design: r.design, paired: r.paired,
    verdict: r.verdict, equivalent: r.equivalent, diff: r.diff, diffPct: r.diffPct, se: r.se, df: r.df,
    ciLow: r.ciLow, ciHigh: r.ciHigh, confidence: r.confidence, alpha: r.alpha,
    margin: r.margin, marginType: r.marginType, marginInput: r.marginInput, bandUsed: r.bandUsed,
    p1: r.p1, p2: r.p2, pTost: r.pTost, pDiff: r.pDiff, needed: r.needed,
    refStats: r.refStats, testStats: r.testStats, pairs: r.pairs ? r.pairs.length : 0,
    columns: { group: $('eq-group').value, value: $('eq-value').value, sample: $('eq-sampleid').value }
  });

  function reportCSV(r, rows) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const L = [];
    L.push(['Method transfer equivalence report (TOST)']);
    L.push(['Generated', q(new Date().toISOString())]);
    L.push(['Computed', q('In the browser. No data was uploaded or stored.')]);
    L.push([]);
    L.push(['Setting', 'Value']);
    L.push(['Method column', q($('eq-group').value)], ['Result column', q($('eq-value').value)]);
    if ($('eq-sampleid').value) L.push(['Sample identifier', q($('eq-sampleid').value)]);
    L.push(['Reference method', q(r.reference)], ['Method under test', q(r.test)], ['Design', q(r.design)]);
    L.push(['Equivalence margin', r.margin], ['Margin quoted as', q(r.marginType === 'percent' ? r.marginInput + '% of the reference mean' : 'absolute units')]);
    L.push(['Significance level (one sided)', r.alpha], ['Interval', Math.round(r.confidence * 100) + '%']);
    L.push([]);
    L.push(['Method', 'n', 'Mean', 'Std dev', 'CV', 'Min', 'Max']);
    [[r.reference, r.refStats], [r.test, r.testStats]].forEach(([n, st]) => L.push([q(n), st.n, st.mean, st.sd, st.cv, st.min, st.max]));
    L.push([]);
    L.push(['Result', 'Value']);
    L.push(['Mean difference (test minus reference)', r.diff]);
    L.push(['Standard error', r.se], ['Degrees of freedom', r.df]);
    L.push(['Interval lower', r.ciLow], ['Interval upper', r.ciHigh]);
    L.push(['Margin used up', r.bandUsed]);
    L.push([]);
    L.push(['One-sided test', 't', 'df', 'p', 'Passed']);
    L.push([q('Difference above -margin'), r.t1, r.df, r.p1, r.p1 < r.alpha ? 'yes' : 'no']);
    L.push([q('Difference below +margin'), r.t2, r.df, r.p2, r.p2 < r.alpha ? 'yes' : 'no']);
    L.push([q('Overall TOST'), '', r.df, r.pTost, r.equivalent ? 'yes' : 'no']);
    L.push(['Two-sided test of any difference', '', r.df, r.pDiff, '']);
    L.push([]);
    L.push(['Verdict', q(r.verdict)]);
    if (r.needed) L.push(['Results per method that would settle it', r.needed]);
    L.push([]);
    if (r.paired) {
      L.push(['Sample', 'Reference', 'Test', 'Difference']);
      r.pairs.forEach(p => L.push([q(p.sample), p.ref, p.test, p.d]));
    } else {
      L.push(['Method', 'Result', 'Sample']);
      rows.forEach(p => L.push([q(p.group), p.value, q(p.sample || '')]));
    }
    L.push([]);
    L.push([q('Decision support, not a validated method-transfer system. The equivalence margin must be set from product requirements before the data is seen.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }

  /* Three examples, built here rather than taken from a real transfer: one that passes, one
     with a genuine bias, and one that is simply too small to tell either way. */
  function example(kind) {
    const r = E.rng(kind === 'pass' ? 12 : kind === 'bias' ? 31 : 5);
    const norm = () => { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const n = kind === 'thin' ? 4 : 12;
    const shift = kind === 'bias' ? 4.2 : kind === 'thin' ? 0.6 : 0.25;
    const noise = kind === 'thin' ? 3.2 : 0.9;
    const lines = ['SampleID,Method_Lab,Result_Value'];
    for (let i = 0; i < n; i++) {
      const truth = 98.5 + norm() * 1.4;
      lines.push(['S-' + String(i + 1).padStart(2, '0'), 'Lab A (reference)', (truth + norm() * noise).toFixed(2)].join(','));
      lines.push(['S-' + String(i + 1).padStart(2, '0'), 'Lab B (new)', (truth + shift + norm() * noise).toFixed(2)].join(','));
    }
    return lines.join('\n');
  }

  function run() {
    $('eq-error').hidden = true;
    let rows, opts;
    try { rows = readRows(); opts = readOpts(); } catch (e) { return fail(e.message); }
    if ($('eq-ref').value === $('eq-test').value) return fail('The reference and the method under test must be different.');
    try {
      const res = T.analyze(rows.rows, opts);
      render(res, rows.rows.filter(x => x.group === res.reference || x.group === res.test));
      $('eq-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { fail(e.message); }
  }

  function clear() {
    table = null; last = null; window.MLTostRun = null;
    $('eq-data').value = ''; $('eq-out').innerHTML = ''; $('eq-read').textContent = '';
    $('eq-settings').hidden = true; $('eq-error').hidden = true; $('eq-file').value = '';
    $('eq-paired-wrap').hidden = true; $('eq-paired').checked = false;
  }

  function init() {
    const load = (text, margin) => {
      $('eq-data').value = text; $('eq-error').hidden = true; $('delete-top').hidden = false;
      loadText(text);
      // The examples set the margin they were built to illustrate: 2% of the reference is a
      // realistic acceptance band for an assay transfer, where 10% would wave anything through.
      if (margin) { $('eq-margin').value = margin; $('eq-margin-type').value = 'percent'; }
    };
    $('eq-sample').addEventListener('click', () => load(example('pass'), 2));
    $('eq-sample2').addEventListener('click', () => load(example('bias'), 2));
    $('eq-sample3').addEventListener('click', () => load(example('thin'), 2));
    $('eq-clear').addEventListener('click', clear);
    $('eq-data').addEventListener('change', () => { if ($('eq-data').value.trim()) { $('delete-top').hidden = false; loadText($('eq-data').value); } });
    $('eq-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => load(String(fr.result));
      fr.readAsText(f);
    });
    ['eq-group', 'eq-sampleid'].forEach(id => $(id).addEventListener('change', () => { fillMethods(); describe(); }));
    ['eq-ref', 'eq-test'].forEach(id => $(id).addEventListener('change', () => { $('eq-paired-wrap').hidden = !pairableCount(); }));
    $('eq-value').addEventListener('change', describe);
    $('eq-run').addEventListener('click', run);
  }

  window.MLEquiv = { clear, example };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
