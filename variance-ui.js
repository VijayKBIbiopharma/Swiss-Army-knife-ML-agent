/* Variance components and Gage R&R.

   Two questions out of one piece of arithmetic. "Where is the variation coming from?" splits
   a total spread across named sources and names which groups actually differ. "Can my
   measurement system see it?" points the same split at an instrument: how much of what you
   observe is the method rather than the product.

   Everything runs here. Nothing is uploaded and nothing is kept after the page is closed. */
(function () {
  'use strict';
  const E = window.MLEngine, V = window.MLVariance, CH = window.Charts;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (isFinite(v) ? Number(v).toFixed(2) : '–');
  const f3 = v => (isFinite(v) ? Number(v).toFixed(3) : '–');
  const f4 = v => (isFinite(v) ? Number(v).toFixed(4) : '–');
  const pct = v => (isFinite(v) ? Number(v).toFixed(1) + '%' : '–');
  const pFmt = p => (p === null || p === undefined || !isFinite(p) ? '–' : p < 0.0001 ? '<0.0001' : p.toFixed(4));
  const mode = () => $('vc-mode').value;

  let table = null, last = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- what each mode is for, and what it needs ----------
  const MODE_DESC = {
    components: 'Splits a total spread into between-group and within-group variation, says what share each owns, and names which groups genuinely differ rather than looking different by chance.',
    grr: 'Splits what you observe into repeatability, reproducibility and real part-to-part differences, and judges whether the measurement system is fit to make the decisions you make with it.'
  };
  const SHAPES = {
    components: '<p class="hint">One row per measurement: which group it came from, and the number. Several measurements per group is what makes the split possible &mdash; with one each, there is nothing to compare the between-group spread against.</p>' +
      '<div class="table-scroll"><table class="shape-table"><thead><tr><th>Lot</th><th>Result</th></tr></thead><tbody>' +
      '<tr><td>L-2401</td><td>96.2</td></tr><tr><td>L-2401</td><td>96.6</td></tr><tr><td>L-2401</td><td>96.4</td></tr>' +
      '<tr><td>L-2402</td><td>94.1</td></tr><tr><td>L-2402</td><td>94.5</td></tr>' +
      '<tr class="dim"><td colspan="2">&hellip; and so on for every lot</td></tr></tbody></table></div>' +
      '<p class="hint">The groups can be anything you suspect: raw material lot, analyst, instrument, vessel, shift, site, day. Groups need not be the same size. Three groups is thin; six or more makes the between-group estimate worth quoting.</p>',
    grr: '<p class="hint">Every operator measures every sample, more than once. The repeats are what separate the instrument\'s own noise from the differences between people, so a study with one reading per cell cannot be analysed at all.</p>' +
      '<div class="table-scroll"><table class="shape-table"><thead><tr><th>Sample</th><th>Analyst</th><th>Result</th></tr></thead><tbody>' +
      '<tr><td>S-01</td><td>Analyst 1</td><td>98.4</td></tr><tr><td>S-01</td><td>Analyst 1</td><td>98.6</td></tr>' +
      '<tr><td>S-01</td><td>Analyst 2</td><td>98.9</td></tr><tr><td>S-01</td><td>Analyst 2</td><td>98.7</td></tr>' +
      '<tr><td>S-02</td><td>Analyst 1</td><td>95.1</td></tr>' +
      '<tr class="dim"><td colspan="3">&hellip; every sample measured by every analyst, the same number of times</td></tr></tbody></table></div>' +
      '<p class="hint">The usual study is 10 samples, 3 operators, 2 or 3 repeats, and the design must be complete and balanced. Pick samples that span the range you really see in production: a study run on ten near-identical samples will fail whatever the instrument does, because there is nothing for the method to resolve.</p>'
  };
  const EXAMPLES = {
    components: [['vc-ex1', 'Example: one supplier lot is the problem'], ['vc-ex2', 'Example: the lots are fine, the assay is noisy'], ['vc-ex3', 'Example: analyst-to-analyst drift']],
    grr: [['vc-ex1', 'Example: a method fit for release'], ['vc-ex2', 'Example: one analyst out of step'], ['vc-ex3', 'Example: the instrument cannot resolve it']]
  };

  // ---------- reading the data ----------
  const GROUP = /lot|batch|supplier|vendor|analyst|operator|instrument|vessel|reactor|shift|site|line|day|group|source|material/i;
  const PART = /sample|specimen|part|vial|lot|batch|aliquot|^id|id$/i;
  const OPER = /analyst|operator|instrument|system|device|gauge|technician|appraiser|column|lab/i;
  const VALUE = /result|value|assay|purity|potency|conc|content|titer|titre|measure|area|response|reading|%/i;

  function loadText(text) {
    let t;
    try { t = E.parseCSV(text); } catch (e) { return fail('Could not read the data: ' + e.message); }
    if (!t.rows.length || t.columns.length < 2) return fail('No usable rows found. The first row should hold column names.');
    table = t;
    const prof = E.profile(t);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    const value = numeric.find(c => VALUE.test(c)) || numeric[numeric.length - 1] || t.columns[t.columns.length - 1];
    const others = t.columns.filter(c => c !== value);
    const opt = (sel, cols, val) => { $(sel).innerHTML = cols.map(c => '<option' + (c === val ? ' selected' : '') + '>' + h(c) + '</option>').join(''); };
    opt('vc-value', t.columns, value);
    opt('vc-grr-value', t.columns, value);
    opt('vc-group', t.columns, others.find(c => GROUP.test(c)) || others[0] || value);
    const part = others.find(c => PART.test(c)) || others[0] || value;
    opt('vc-part', t.columns, part);
    opt('vc-operator', t.columns, others.find(c => c !== part && OPER.test(c)) || others.find(c => c !== part) || part);
    $('vc-settings').hidden = false;
    $('vc-error').hidden = true;
    describe();
  }

  function readRows() {
    if (!table) throw new Error('Load some measurements first.');
    const col = id => table.columns.indexOf($(id).value);
    if (mode() === 'components') {
      const gi = col('vc-group'), vi = col('vc-value');
      if (gi < 0 || vi < 0) throw new Error('Pick a grouping column and a result column.');
      if (gi === vi) throw new Error('The grouping column and the result column must be different.');
      const out = []; let skipped = 0;
      table.rows.forEach(r => {
        const value = E.toNumber(r[vi]);
        if (value === null) { skipped++; return; }
        out.push({ group: String(r[gi]).trim(), value });
      });
      if (!out.length) throw new Error('No numeric results found in "' + $('vc-value').value + '".');
      return { rows: out, skipped };
    }
    const pi = col('vc-part'), oi = col('vc-operator'), vi = col('vc-grr-value');
    if (pi < 0 || oi < 0 || vi < 0) throw new Error('Pick a sample column, an operator column and a result column.');
    if (pi === oi || pi === vi || oi === vi) throw new Error('The sample, operator and result columns must all be different.');
    const out = []; let skipped = 0;
    table.rows.forEach(r => {
      const value = E.toNumber(r[vi]);
      if (value === null) { skipped++; return; }
      out.push({ part: String(r[pi]).trim(), operator: String(r[oi]).trim(), value });
    });
    if (!out.length) throw new Error('No numeric results found in "' + $('vc-grr-value').value + '".');
    return { rows: out, skipped };
  }

  function describe() {
    try {
      const { rows, skipped } = readRows();
      const tail = skipped ? ' ' + skipped + ' row' + (skipped === 1 ? '' : 's') + ' skipped (no number in the result column).' : '';
      if (mode() === 'components') {
        const g = Array.from(new Set(rows.map(r => r.group)));
        const sizes = g.map(n => rows.filter(r => r.group === n).length);
        const lo = Math.min.apply(null, sizes), hi = Math.max.apply(null, sizes);
        $('vc-read').textContent = rows.length + ' measurements across ' + g.length + ' group' + (g.length === 1 ? '' : 's') +
          ' (' + g.slice(0, 6).map(x => x).join(', ') + (g.length > 6 ? '…' : '') + '), ' +
          (lo === hi ? lo + ' each' : lo + ' to ' + hi + ' each') + '.' + tail;
      } else {
        const p = new Set(rows.map(r => r.part)), o = new Set(rows.map(r => r.operator));
        const cells = p.size * o.size;
        $('vc-read').textContent = rows.length + ' measurements: ' + p.size + ' sample' + (p.size === 1 ? '' : 's') + ' × ' + o.size + ' operator' + (o.size === 1 ? '' : 's') +
          (cells ? ', ' + (rows.length / cells === Math.round(rows.length / cells) ? (rows.length / cells) + ' repeats each' : 'unevenly repeated') : '') + '.' + tail;
      }
    } catch (e) { $('vc-read').textContent = e.message; }
  }
  function fail(msg) { $('vc-error').textContent = msg; $('vc-error').hidden = false; }

  // ---------- charts ----------
  /* The whole answer in one bar: the total spread cut into its sources, by share of variance.
     Variance adds up and standard deviation does not, which is why the bar is in variance and
     the table quotes both. */
  function drawShare(el, parts, caption) {
    const W = Math.max(320, el.clientWidth || 700), H = 108, L = 0, R = 0, barY = 30, barH = 38;
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!(total > 0)) { el.innerHTML = '<p class="hint">Every source came out at zero: the measurements are identical.</p>'; return; }
    let x = L, b = '';
    parts.forEach((p, i) => {
      const w = (p.value / total) * (W - L - R);
      if (w <= 0) return;
      b += '<g data-tip="' + h(p.label + ' · ' + pct(p.value / total * 100) + ' of the variance')  + '">' +
        '<rect class="share c' + ((i % 4) + 1) + '" x="' + x + '" y="' + barY + '" width="' + Math.max(0.5, w) + '" height="' + barH + '"/></g>';
      if (w > 46) b += '<text class="lbl-strong on-bar" x="' + (x + w / 2) + '" y="' + (barY + barH / 2 + 5) + '" text-anchor="middle">' + pct(p.value / total * 100) + '</text>';
      x += w;
    });
    b += '<text class="lbl-strong" x="0" y="20">' + h(caption) + '</text>';
    let lx = 0;
    parts.forEach((p, i) => {
      b += '<rect class="share c' + ((i % 4) + 1) + '" x="' + lx + '" y="' + (barY + barH + 14) + '" width="11" height="11"/>' +
        '<text x="' + (lx + 16) + '" y="' + (barY + barH + 24) + '">' + h(p.label) + '</text>';
      lx += 26 + String(p.label).length * 6.6;
    });
    el.innerHTML = '<svg class="chart share-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(caption) + '">' + b + '</svg>';
  }

  // Every measurement, grouped, with each group's mean marked: an outlier cannot hide behind a mean.
  function drawGroups(el, r, rows, key) {
    const names = r.groups ? r.groups.map(g => g.name) : r.parts;
    const vals = rows.map(x => x.value);
    const rowH = 34, W = Math.max(320, el.clientWidth || 700);
    const H = 30 + rowH * names.length;
    const L = Math.min(170, 24 + Math.max.apply(null, names.map(n => n.length)) * 7.5), R = 22;
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const sx = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let b = '';
    for (const t of CH.niceTicks(lo, hi, 5)) if (t >= lo && t <= hi) b += '<text x="' + sx(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + f2(t) + '</text>';
    b += '<line class="zero" x1="' + sx(r.grand) + '" x2="' + sx(r.grand) + '" y1="14" y2="' + (H - 22) + '"/>';
    names.forEach((n, i) => {
      const y = 26 + i * rowH;
      const mine = rows.filter(x => String(x[key]).trim() === n);
      const m = mine.reduce((a, x) => a + x.value, 0) / (mine.length || 1);
      b += '<text class="lbl-strong" x="0" y="' + (y + 4) + '">' + h(n) + '</text>';
      b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>';
      b += '<line class="mean-mark c' + ((i % 4) + 1) + '" x1="' + sx(m) + '" x2="' + sx(m) + '" y1="' + (y - 11) + '" y2="' + (y + 11) + '"/>';
      mine.forEach(x => { b += '<g data-tip="' + h(n + ' · ' + f3(x.value)) + '"><circle class="pt c' + ((i % 4) + 1) + '" cx="' + sx(x.value) + '" cy="' + y + '" r="4"/></g>'; });
    });
    el.innerHTML = '<svg class="chart strip-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Every measurement by group, with group means">' + b + '</svg>' +
      '<p class="hint">Every measurement, with the vertical mark at each group’s mean and the long line at the overall mean.</p>';
  }

  // ---------- plain English ----------
  function plainComponents(r, label) {
    const b = Math.round(r.icc * 100);
    if (r.negative || b < 10) {
      return 'The ' + label + 's are not the problem. Almost all of the spread you are seeing — about ' + (100 - b) + '% of it — happens between repeat measurements of the same ' + label + '. ' +
        'Chasing a ' + label + ' that looks high or low is chasing noise; if this spread matters, the measurement is where to go after it.';
    }
    if (b >= 70) {
      return 'The ' + label + 's really do differ, and that is where almost all of the spread lives: about ' + b + '% of the total. ' +
        'Repeat measurements of the same ' + label + ' agree well, so when a result looks different it is different. The ' + label + ' is a real lever, and worth the investigation.';
    }
    return 'Both things are happening. About ' + b + '% of the spread is genuine difference between ' + label + 's, and about ' + (100 - b) + '% is scatter between repeat measurements of the same one. ' +
      'Neither can be ignored: a single measurement is not enough to judge a ' + label + ', but the ' + label + 's are not interchangeable either.';
  }
  function plainGrr(r) {
    const basis = r.judgedOn === 'tolerance' ? 'the specification window' : 'the spread of the samples in this study';
    const head = r.judgedOn === 'tolerance' ? pct(r.pctTolerance) + ' of ' + basis : pct(r.pctStudyGrr) + ' of ' + basis;
    if (r.verdict === 'acceptable') {
      return 'The measurement system is good enough. It uses ' + head + ', which leaves the rest for real differences between samples, and it can tell about ' + (isFinite(r.ndc) ? r.ndc : 'many') + ' distinct levels apart. ' +
        'When this method says two samples differ, they differ.';
    }
    if (r.verdict === 'marginal') {
      return 'The measurement system is borderline. It uses ' + head + ', which is usable for monitoring a trend but thin for passing or failing an individual result against a limit. ' +
        (r.vReprod > r.vRepeat ? 'Most of that noise is between operators rather than within one, so training, a clearer method or a tighter procedure would help more than a new instrument.'
          : 'Most of that noise is the instrument repeating itself, so more replicates per result, or better equipment, is the lever.');
    }
    return 'The measurement system is not fit for this decision. It uses ' + head + ', so a large part of what you see on a certificate is the method rather than the material. ' +
      (r.vReprod > r.vRepeat ? 'The bigger share is disagreement between operators, which points at the method description and training before the hardware.'
        : 'The bigger share is the instrument failing to repeat itself on the same sample, which points at the hardware, the sample preparation or the number of replicates.') +
      (isFinite(r.ndc) && r.ndc < 5 ? ' It can only separate about ' + r.ndc + ' distinct levels, and the usual bar is five.' : '');
  }

  // ---------- results ----------
  const tile = (lbl, val, sub, hero) => '<div class="tile' + (hero ? ' hero-tile' : '') + '"><div class="lbl">' + h(lbl) + '</div><div class="val">' + h(val) + '</div><div class="sub">' + h(sub || '') + '</div></div>';
  const anovaTable = rows => '<div class="table-scroll"><table><thead><tr><th>Source</th><th class="num-cell">Sum of squares</th><th class="num-cell">df</th><th class="num-cell">Mean square</th><th class="num-cell">F</th><th class="num-cell">p</th></tr></thead><tbody>' +
    rows.map(a => '<tr><td>' + h(a.source) + '</td><td class="num-cell">' + f4(a.ss) + '</td><td class="num-cell">' + a.df + '</td><td class="num-cell">' + f4(a.ms) + '</td><td class="num-cell">' + (a.f === null ? '–' : f3(a.f)) + '</td><td class="num-cell">' + pFmt(a.p) + '</td></tr>').join('') +
    '</tbody></table></div>';
  const compTable = (comps, extra) => '<div class="table-scroll"><table><thead><tr><th>Source</th><th class="num-cell">Variance</th><th class="num-cell">Std dev</th><th class="num-cell">Share of variance</th>' + (extra ? '<th class="num-cell">% of total spread</th>' : '') + '</tr></thead><tbody>' +
    comps.map(c => '<tr><td>' + h(c.source) + '</td><td class="num-cell">' + f4(c.variance) + '</td><td class="num-cell">' + f4(c.sd) + '</td><td class="num-cell">' + pct(c.share * 100) + '</td>' + (extra ? '<td class="num-cell">' + pct(c.pctStudy) + '</td>' : '') + '</tr>').join('') +
    '</tbody></table></div>';

  function renderComponents(r, rows) {
    const label = ($('vc-group').value || 'group').replace(/[_-]+/g, ' ').toLowerCase();
    const cls = r.negative || r.icc < 0.1 ? 'capable' : r.icc >= 0.7 ? 'not' : 'marginal';
    const badge = r.negative || r.icc < 0.1 ? 'MEASUREMENT, NOT THE GROUPS' : r.icc >= 0.7 ? 'THE GROUPS DIFFER' : 'BOTH MATTER';
    const tiles = tile('Between ' + label + 's', pct(r.icc * 100), 'share of the total variance', true) +
      tile('Within ' + label + 's', pct((1 - r.icc) * 100), 'repeat measurements of the same one') +
      tile('Total spread', f3(r.sdTotal), 'standard deviation, all sources together') +
      tile('Groups differ?', r.significant ? 'Yes (p ' + pFmt(r.p) + ')' : 'Not shown (p ' + pFmt(r.p) + ')', 'one-way ANOVA F test');

    const diff = r.pairs.filter(p => p.different);
    const pairTable = '<h4>Which ' + h(label) + 's actually differ</h4>' +
      '<p class="hint">Tukey&rsquo;s method, holding ' + Math.round((1 - r.alpha) * 100) + '% confidence across all ' + r.pairs.length + ' comparison' + (r.pairs.length === 1 ? '' : 's') + ' at once. An interval that does not contain zero is a real difference.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Pair</th><th class="num-cell">Difference</th><th class="num-cell">' + Math.round((1 - r.alpha) * 100) + '% interval</th><th class="num-cell">p</th><th>Verdict</th></tr></thead><tbody>' +
      r.pairs.slice(0, 40).map(p => '<tr><td>' + h(p.a) + ' &minus; ' + h(p.b) + '</td><td class="num-cell">' + f3(p.diff) + '</td><td class="num-cell">' + f3(p.lower) + ' to ' + f3(p.upper) + '</td><td class="num-cell">' + pFmt(p.p) + '</td><td><span class="verdict ' + (p.different ? 'not' : 'capable') + '">' + (p.different ? 'differs' : 'no difference shown') + '</span></td></tr>').join('') +
      '</tbody></table></div>' + (r.pairs.length > 40 ? '<p class="hint">Showing the 40 largest differences of ' + r.pairs.length + '. The full set is in the report.</p>' : '');

    const groupTable = '<h4>Each ' + h(label) + '</h4><div class="table-scroll"><table><thead><tr><th>' + h(label.charAt(0).toUpperCase() + label.slice(1)) + '</th><th class="num-cell">Measurements</th><th class="num-cell">Mean</th><th class="num-cell">Std dev</th><th class="num-cell">Difference from overall</th></tr></thead><tbody>' +
      r.groups.slice().sort((a, b) => b.mean - a.mean).map(g => '<tr><td>' + h(g.name) + '</td><td class="num-cell">' + g.n + '</td><td class="num-cell">' + f3(g.mean) + '</td><td class="num-cell">' + (isFinite(g.sd) ? f3(g.sd) : '–') + '</td><td class="num-cell">' + (g.mean - r.grand >= 0 ? '+' : '') + f3(g.mean - r.grand) + '</td></tr>').join('') +
      '</tbody></table></div>';

    const notes = [];
    notes.push('Variance adds up; standard deviation does not. The shares above are shares of variance, which is why removing a source that owns 50% of the variance cuts the spread you feel by about 29%, not by half.');
    if (r.negative) notes.push('The between-' + label + ' estimate came out negative, which cannot be true of a variance. It means the ' + label + 's differ by less than ordinary measurement scatter would produce anyway, and the estimate is reported as zero by convention.');
    if (!r.balanced) notes.push('The groups are different sizes, so the effective replication is ' + f2(r.n0) + ' rather than a whole number. That is handled, but a badly unbalanced study leans heavily on its largest groups.');
    if (r.a < 6) notes.push('With ' + r.a + ' groups, the between-group variance rests on ' + (r.a - 1) + ' degree' + (r.a === 2 ? '' : 's') + ' of freedom and is a rough estimate whatever the arithmetic says. Treat the share as an order of magnitude, not a number to put in a specification.');
    if (r.significant && !diff.length) notes.push('The overall F test is significant but no single pair clears Tukey&rsquo;s bar. That is not a contradiction: the overall test pools all the evidence, while each pair gets only its own, paying for the protection against false alarms across every comparison.');
    if (!r.significant && diff.length) notes.push('No overall effect, yet a pair clears the bar. With this few groups that can happen; treat it as a lead to confirm, not a finding.');
    notes.push('This splits variation across the groups you supplied. A source you did not record — the day, the instrument, the operator — hides inside whichever column happens to move with it, so a clean split needs the study designed, not just the data pulled.');

    const plain = plainComponents(r, label);
    const top = diff.length ? (diff[0].diff >= 0 ? diff[0] : { a: diff[0].b, b: diff[0].a, diff: -diff[0].diff }) : null;
    const act = top
      ? 'Start with ' + h(top.a) + ' against ' + h(top.b) + ': a gap of ' + f3(top.diff) + ', wider than repeat measurements explain.'
      : r.icc < 0.1 ? 'Nothing here points at a particular ' + label + '. If this spread matters, run a Gage R&R on the method that produced these numbers.'
        : 'No single pair stands out yet. More measurements per ' + label + ', or more ' + label + 's, would sharpen it.';

    $('vc-out').innerHTML = '<div class="card vc-result"><h3>Where the variation comes from</h3>' +
      '<div class="plain ' + cls + '"><h4>In plain English</h4><p>' + h(plain) + '</p><p><b>Next move.</b> ' + act + '</p></div>' +
      '<p class="sub-head"><span class="verdict ' + cls + '">' + badge + '</span> ' + r.N + ' measurements across ' + r.a + ' ' + h(label) + 's.</p>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div id="vc-share"></div>' +
      '<h4>Variance components</h4>' + compTable(r.components) +
      '<h4>Analysis of variance</h4>' + anovaTable(r.anova) +
      '<div id="vc-strip"></div>' + groupTable + pairTable +
      '<h4>What this rests on</h4><ul class="insights">' + notes.map(n => '<li class="info">' + n + '</li>').join('') + '</ul>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="vc-csv">Download the report (.csv)</button></div>' +
      '<p class="hint">Decision support, not a validated system. Confirm against your protocol and have the arithmetic checked independently.</p></div>';
    drawShare($('vc-share'), [{ label: 'Between ' + label + 's', value: r.between }, { label: 'Within ' + label + 's (repeat error)', value: r.within }], 'The total variance, cut into its sources');
    drawGroups($('vc-strip'), r, rows, 'group');
    $('vc-csv').addEventListener('click', () => download('variance-components.csv', csvComponents(r, rows, label), 'text/csv'));
  }

  function renderGrr(r, rows) {
    const cls = r.verdict === 'acceptable' ? 'capable' : r.verdict === 'marginal' ? 'marginal' : 'not';
    const headline = r.judgedOn === 'tolerance' ? r.pctTolerance : r.pctStudyGrr;
    const tiles = tile('Measurement system', r.verdict === 'acceptable' ? 'Fit' : r.verdict === 'marginal' ? 'Borderline' : 'Not fit', 'judged on ' + r.judgedOn, true) +
      tile('Gage R&R', pct(headline), r.judgedOn === 'tolerance' ? 'of the ' + f3(r.tolerance) + ' spec window' : 'of the study spread') +
      tile('Distinct categories', isFinite(r.ndc) ? String(r.ndc) : 'many', 'levels it can tell apart (5 is the usual bar)') +
      tile('Real differences', pct(r.components[3].pctStudy), 'part to part, the signal you want');

    const bars = [
      { label: 'Repeatability', value: r.components[0].pctStudy },
      { label: 'Reproducibility', value: r.components[1].pctStudy },
      { label: 'Total Gage R&R', value: r.components[2].pctStudy },
      { label: 'Part to part', value: r.components[3].pctStudy }
    ];

    const notes = [];
    notes.push('Repeatability is one operator measuring the same sample twice and getting a different answer: the instrument and the sample preparation. Reproducibility is two operators measuring the same sample and disagreeing: the method description, the training, the judgement calls.');
    notes.push('The model used was ' + r.model + ' (interaction p ' + pFmt(r.pInteraction) + '). Dropping an unsupported interaction is standard practice: left in, a noisy interaction term eats variation that belongs to the operators.');
    if (r.judgedOn !== 'tolerance') notes.push('No specification limits were given, so the verdict is against the spread of the samples in this study. That flatters a study built from very different samples and punishes one built from similar ones. Enter the real spec limits and the verdict becomes the one that matters: can this method pass and fail product against its limits?');
    if (r.keepInteraction) notes.push('The part-by-operator interaction is real: some operators read some samples differently from others, rather than being uniformly high or low. That pattern usually means a step of the method is open to interpretation, and it will not be fixed by recalibrating.');
    if (isFinite(r.ndc) && r.ndc < 5) notes.push('Fewer than five distinct categories means the method cannot support a control chart on individual results: it would show the measurement moving, not the process.');
    if (r.parts.length < 10) notes.push('With ' + r.parts.length + ' samples the part-to-part estimate is rough, and since the verdict is partly a ratio against it, the verdict is rough too. Ten is the usual study size.');
    if (r.reps < 3) notes.push('With ' + r.reps + ' repeats per cell, repeatability rests on ' + r.anova[3].df + ' degrees of freedom. Three repeats is the usual choice and costs little more.');
    notes.push('The samples must span the range you really see. A study run on near-identical samples will fail however good the instrument is, because the arithmetic compares measurement noise against real differences and there are none to compare against.');

    const worst = r.operators.length > 1 ? (() => {
      const means = r.operators.map(o => { const mine = rows.filter(x => x.operator === o); return { o, m: mine.reduce((a, x) => a + x.value, 0) / mine.length }; });
      means.sort((a, b) => b.m - a.m);
      return means;
    })() : null;
    const act = r.verdict === 'acceptable'
      ? 'Nothing to fix. Record this study as the method&rsquo;s qualification and repeat it after any change to the instrument, the method or the people.'
      : r.vReprod > r.vRepeat
        ? 'Go after reproducibility first: it is the larger share. ' + (worst ? 'The operators span ' + f3(worst[0].m - worst[worst.length - 1].m) + ' between ' + h(worst[0].o) + ' and ' + h(worst[worst.length - 1].o) + ', which is a method and training question, not a calibration one.' : '')
        : 'Go after repeatability first: it is the larger share. That is the instrument and the sample preparation. Averaging ' + (r.reps < 3 ? 'three' : 'more') + ' replicates per reported result divides this part of the noise by the square root of the count, which is often the cheapest fix available.';

    $('vc-out').innerHTML = '<div class="card vc-result"><h3>Measurement system analysis (Gage R&amp;R)</h3>' +
      '<div class="plain ' + cls + '"><h4>In plain English</h4><p>' + h(plainGrr(r)) + '</p><p><b>Next move.</b> ' + act + '</p></div>' +
      '<p class="sub-head"><span class="verdict ' + cls + '">' + r.verdict.toUpperCase() + '</span> ' + r.parts.length + ' samples × ' + r.operators.length + ' operators × ' + r.reps + ' repeats = ' + r.N + ' measurements.</p>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div id="vc-share"></div>' +
      '<h4>Where the spread comes from</h4><div id="vc-bars"></div>' +
      '<h4>Variance components</h4>' + compTable(r.components, true) +
      '<p class="hint">"% of total spread" is on the standard-deviation scale, which is the number quoted as "%GRR" in a measurement-system report. The shares of variance in the previous column add to 100%; the percentages of spread do not, because standard deviations do not add.</p>' +
      '<h4>Analysis of variance</h4>' + anovaTable(r.anova) +
      '<div id="vc-strip"></div>' +
      '<h4>What this rests on</h4><ul class="insights">' + notes.map(n => '<li class="info">' + n + '</li>').join('') + '</ul>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="vc-csv">Download the report (.csv)</button></div>' +
      '<p class="hint">Decision support, not a validated measurement-system package. Confirm against your protocol and have the arithmetic checked independently.</p></div>';
    drawShare($('vc-share'), [
      { label: 'Repeatability', value: r.vRepeat },
      { label: 'Reproducibility', value: r.vReprod },
      { label: 'Real part-to-part differences', value: r.vPart }
    ], 'The total variance, cut into measurement and material');
    CH.hbar($('vc-bars'), bars.map(b => ({ label: b.label, value: b.value, text: pct(b.value), cls: b.label === 'Part to part' ? 'hi' : '' })), { min: 0, max: Math.max(100, Math.ceil(Math.max.apply(null, bars.map(b => b.value)) / 10) * 10), label: '% of total spread (standard deviation scale)' });
    drawGroups($('vc-strip'), { groups: r.operators.map(o => ({ name: o })), grand: r.grand }, rows, 'operator');
    $('vc-csv').addEventListener('click', () => download('gage-rr.csv', csvGrr(r, rows), 'text/csv'));
  }

  // ---------- reports ----------
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  function head(title) {
    const L = [[title], ['Generated', q(new Date().toISOString())], ['Computed', q('In the browser. No data was uploaded or stored.')], []];
    return L;
  }
  function csvComponents(r, rows, label) {
    const L = head('Variance component analysis (one-way random effects)');
    L.push(['Setting', 'Value']);
    L.push(['Grouping column', q($('vc-group').value)], ['Result column', q($('vc-value').value)]);
    L.push(['Groups', r.a], ['Measurements', r.N], ['Balanced', r.balanced ? 'yes' : 'no'], ['Effective replication (n0)', r.n0]);
    L.push(['Pairwise confidence', Math.round((1 - r.alpha) * 100) + '%'], ['Tukey critical q', r.qCrit]);
    L.push([]);
    L.push(['Source', 'Sum of squares', 'df', 'Mean square', 'F', 'p']);
    r.anova.forEach(a => L.push([q(a.source), a.ss, a.df, a.ms, a.f === null ? '' : a.f, a.p === null ? '' : a.p]));
    L.push([]);
    L.push(['Component', 'Variance', 'Std dev', 'Share of variance']);
    r.components.forEach(c => L.push([q(c.source), c.variance, c.sd, c.share]));
    L.push(['Total', r.total, r.sdTotal, 1]);
    if (r.negative) L.push([q('Note'), q('The between-group estimate was negative and is reported as zero.')]);
    L.push([]);
    L.push([q(label.charAt(0).toUpperCase() + label.slice(1)), 'Measurements', 'Mean', 'Std dev', 'Difference from overall']);
    r.groups.forEach(g => L.push([q(g.name), g.n, g.mean, isFinite(g.sd) ? g.sd : '', g.mean - r.grand]));
    L.push([]);
    L.push(['Pair A', 'Pair B', 'Difference', 'Std error', 'q', 'p', 'Interval lower', 'Interval upper', 'Different']);
    r.pairs.forEach(p => L.push([q(p.a), q(p.b), p.diff, p.se, p.q, p.p, p.lower, p.upper, p.different ? 'yes' : 'no']));
    L.push([]);
    L.push([q('Group'), q('Measurement')]);
    rows.forEach(x => L.push([q(x.group), x.value]));
    L.push([]);
    L.push([q('Decision support, not a validated system. Variation can only be split across sources that were recorded; an unrecorded source hides inside whichever column moves with it.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }
  function csvGrr(r, rows) {
    const L = head('Measurement system analysis (Gage R&R, crossed, ANOVA method)');
    L.push(['Setting', 'Value']);
    L.push(['Sample column', q($('vc-part').value)], ['Operator column', q($('vc-operator').value)], ['Result column', q($('vc-grr-value').value)]);
    L.push(['Samples', r.parts.length], ['Operators', r.operators.length], ['Repeats per cell', r.reps], ['Measurements', r.N]);
    L.push(['Model', q(r.model)], ['Interaction p', r.pInteraction]);
    if (r.tolerance !== null) L.push(['Lower spec limit', r.lsl], ['Upper spec limit', r.usl], ['Tolerance', r.tolerance]);
    L.push(['Judged on', q(r.judgedOn)]);
    L.push([]);
    L.push(['Source', 'Sum of squares', 'df', 'Mean square', 'F', 'p']);
    r.anova.forEach(a => L.push([q(a.source), a.ss, a.df, a.ms, a.f === null ? '' : a.f, a.p === null ? '' : a.p]));
    L.push([]);
    L.push(['Component', 'Variance', 'Std dev', 'Share of variance', '% of total spread']);
    r.components.forEach(c => L.push([q(c.source), c.variance, c.sd, c.share, c.pctStudy]));
    L.push([]);
    L.push(['Result', 'Value']);
    L.push(['%GRR of study variation', r.pctStudyGrr]);
    if (r.pctTolerance !== null) L.push(['%GRR of tolerance', r.pctTolerance]);
    L.push(['Number of distinct categories', isFinite(r.ndc) ? r.ndc : '']);
    L.push(['Verdict', q(r.verdict)]);
    L.push([]);
    L.push(['Sample', 'Operator', 'Measurement']);
    rows.forEach(x => L.push([q(x.part), q(x.operator), x.value]));
    L.push([]);
    L.push([q('Decision support, not a validated measurement-system package. Acceptance thresholds of 10% and 30% follow common industry practice; your own protocol governs.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }

  // ---------- examples ----------
  /* Built here rather than taken from a real study, so each one illustrates exactly one
     situation and the write-up can be checked against what was injected. */
  function example(kind) {
    const seeds = { components: { vc1: 7, vc2: 19, vc3: 41 }, grr: { vc1: 3, vc2: 23, vc3: 57 } };
    const r = E.rng(seeds[mode()]['vc' + kind]);
    const N = () => { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    if (mode() === 'components') {
      if (kind === 1) {
        // Six resin lots, one of them genuinely low; the assay itself is tight.
        const lines = ['Resin_Lot,Step_Yield_Pct'];
        ['R-4401', 'R-4402', 'R-4403', 'R-4404', 'R-4405', 'R-4406'].forEach((lot, i) => {
          const shift = lot === 'R-4404' ? -4.1 : N() * 0.5;
          for (let k = 0; k < 4; k++) lines.push([lot, (91.5 + shift + N() * 0.6).toFixed(2)].join(','));
        });
        return lines.join('\n');
      }
      if (kind === 2) {
        // Lots all the same; the assay is noisy. The honest answer is "stop blaming the vendor".
        const lines = ['Media_Lot,Titer_g_L'];
        ['M-11', 'M-12', 'M-13', 'M-14', 'M-15', 'M-16', 'M-17'].forEach(lot => {
          for (let k = 0; k < 4; k++) lines.push([lot, (3.42 + N() * 0.001 + N() * 0.21).toFixed(3)].join(','));
        });
        return lines.join('\n');
      }
      // Four analysts, a graded drift across them: no single villain, a real effect.
      const lines = ['Analyst,Purity_Pct'];
      ['A. Rao', 'B. Chen', 'C. Okafor', 'D. Lindqvist'].forEach((who, i) => {
        for (let k = 0; k < 6; k++) lines.push([who, (98.1 + i * 0.42 + N() * 0.3).toFixed(2)].join(','));
      });
      return lines.join('\n');
    }
    // Gage R&R: 10 samples spanning the range, 3 analysts, 3 repeats.
    const samples = [], names = ['Analyst 1', 'Analyst 2', 'Analyst 3'];
    for (let i = 0; i < 10; i++) samples.push(96 + i * 0.9 + N() * 0.3);
    const bias = kind === 2 ? [0, 0, 1.6] : [0, 0.05, -0.04];
    const noise = kind === 3 ? 1.9 : 0.16;
    const lines = ['Sample,Analyst,Assay_Result'];
    samples.forEach((truth, i) => names.forEach((who, j) => {
      for (let k = 0; k < 3; k++) lines.push(['S-' + String(i + 1).padStart(2, '0'), who, (truth + bias[j] + N() * noise).toFixed(2)].join(','));
    }));
    return lines.join('\n');
  }

  // ---------- wiring ----------
  function showMode() {
    const m = mode();
    $('vc-mode-desc').textContent = MODE_DESC[m];
    $('vc-shape-body').innerHTML = SHAPES[m];
    $('vc-shape').querySelector('summary').textContent = 'What the data should look like';
    $('vc-map-components').hidden = m !== 'components';
    $('vc-map-grr').hidden = m === 'components';
    $('vc-spec').hidden = m === 'components';
    $('vc-spec-note').hidden = m === 'components';
    $('vc-advanced').hidden = m !== 'components';
    $('vc-run').textContent = m === 'components' ? 'Split the variation' : 'Check the measurement system';
    $('vc-examples').innerHTML = EXAMPLES[m].map(([id, label]) => '<button class="btn ghost small" id="' + id + '" type="button">' + h(label) + '</button>').join('') +
      '<button class="btn ghost small" id="vc-clear" type="button">Clear</button>';
    bindExamples();
    $('vc-data').placeholder = m === 'components' ? 'Lot,Result\nL-2401,96.2\nL-2401,96.6\nL-2402,94.1' : 'Sample,Analyst,Result\nS-01,Analyst 1,98.4\nS-01,Analyst 1,98.6';
    $('vc-out').innerHTML = ''; $('vc-error').hidden = true;
    if (table) { describe(); } else { $('vc-read').textContent = ''; }
  }
  function bindExamples() {
    EXAMPLES[mode()].forEach(([id], i) => {
      const b = $(id); if (!b) return;
      b.addEventListener('click', () => load(example(i + 1)));
    });
    const c = $('vc-clear'); if (c) c.addEventListener('click', clear);
  }
  function load(text) {
    $('vc-data').value = text; $('vc-error').hidden = true; $('delete-top').hidden = false;
    $('vc-out').innerHTML = '';
    loadText(text);
  }

  function run() {
    $('vc-error').hidden = true;
    let got;
    try { got = readRows(); } catch (e) { return fail(e.message); }
    try {
      if (mode() === 'components') {
        const res = V.tukey(got.rows, Number($('vc-alpha').value));
        last = { kind: 'components', r: res, rows: got.rows };
        renderComponents(res, got.rows);
        window.MLVarianceRun = summaryComponents(res);
      } else {
        const res = V.gageRR(got.rows, { lsl: $('vc-lsl').value, usl: $('vc-usl').value });
        last = { kind: 'grr', r: res, rows: got.rows };
        renderGrr(res, got.rows);
        window.MLVarianceRun = summaryGrr(res);
      }
      $('vc-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { fail(e.message); }
  }

  const summaryComponents = r => ({
    kind: 'components', when: new Date().toISOString(),
    columns: { group: $('vc-group').value, value: $('vc-value').value },
    groups: r.a, N: r.N, balanced: r.balanced, n0: r.n0,
    between: r.between, within: r.within, total: r.total, sdTotal: r.sdTotal,
    icc: r.icc, negative: r.negative, p: r.p, significant: r.significant,
    alpha: r.alpha, qCrit: r.qCrit,
    anova: r.anova, components: r.components,
    groupStats: r.groups, pairs: r.pairs,
    differing: r.pairs.filter(p => p.different).length
  });
  const summaryGrr = r => ({
    kind: 'grr', when: new Date().toISOString(),
    columns: { part: $('vc-part').value, operator: $('vc-operator').value, value: $('vc-grr-value').value },
    parts: r.parts.length, operators: r.operators.length, reps: r.reps, N: r.N,
    model: r.model, pInteraction: r.pInteraction, keepInteraction: r.keepInteraction,
    anova: r.anova, components: r.components,
    vRepeat: r.vRepeat, vReprod: r.vReprod, vGrr: r.vGrr, vPart: r.vPart, vTotal: r.vTotal,
    pctStudyGrr: r.pctStudyGrr, pctTolerance: r.pctTolerance, tolerance: r.tolerance,
    lsl: r.lsl, usl: r.usl, ndc: isFinite(r.ndc) ? r.ndc : null, verdict: r.verdict, judgedOn: r.judgedOn
  });

  function clear() {
    table = null; last = null; window.MLVarianceRun = null;
    $('vc-data').value = ''; $('vc-file').value = '';
    $('vc-out').innerHTML = ''; $('vc-read').textContent = '';
    $('vc-settings').hidden = true; $('vc-error').hidden = true;
    $('vc-lsl').value = ''; $('vc-usl').value = '';
  }

  function init() {
    showMode();
    $('vc-mode').addEventListener('change', () => { table = null; $('vc-settings').hidden = true; $('vc-data').value = ''; showMode(); });
    $('vc-data').addEventListener('change', () => { if ($('vc-data').value.trim()) { $('delete-top').hidden = false; loadText($('vc-data').value); } });
    $('vc-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => load(String(fr.result));
      fr.readAsText(f);
    });
    ['vc-group', 'vc-value', 'vc-part', 'vc-operator', 'vc-grr-value'].forEach(id => $(id).addEventListener('change', describe));
    $('vc-run').addEventListener('click', run);
  }

  window.MLVarUI = { clear, example };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
