/* Specification limits and study sizing.

   Two panels in one tool. Setting a limit works from data you already have; sizing a study
   works from what you expect before you have any. Both lean on the same point: the sample
   standard deviation is an estimate, and pretending otherwise is what makes a specification
   that no future batch can hold.

   Everything is computed here. Nothing is uploaded or stored. */
(function () {
  'use strict';
  const E = window.MLEngine, T = window.MLTolerance, CH = window.Charts;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (v === null || !isFinite(v) ? '–' : Number(v).toFixed(2));
  const f3 = v => (v === null || !isFinite(v) ? '–' : Number(v).toFixed(3));
  const f4 = v => (v === null || !isFinite(v) ? '–' : Number(v).toFixed(4));
  const pc = v => (v === null || !isFinite(v) ? '–' : (Number(v) * 100).toFixed(1) + '%');
  const pFmt = p => (p === null || p === undefined || !isFinite(p) ? '–' : p < 0.0001 ? '<0.0001' : p.toFixed(4));
  const mode = () => $('tl-mode').value;
  const design = () => $('tl-design').value;
  const num = id => { const v = String($(id).value).trim(); if (!v) return null; const x = Number(v.replace(/,/g, '')); return isFinite(x) ? x : NaN; };

  let table = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const tile = (lbl, val, sub, hero) => '<div class="tile' + (hero ? ' hero-tile' : '') + '"><div class="lbl">' + h(lbl) + '</div><div class="val">' + h(val) + '</div><div class="sub">' + h(sub || '') + '</div></div>';
  function fail(msg) { $('tl-error').textContent = msg; $('tl-error').hidden = false; }

  const MODE_DESC = {
    spec: 'Builds an interval that covers a stated share of future production with stated confidence, then checks it against the limits you already have.',
    size: 'Works out the smallest study that has a fair chance of answering the question, before anyone books instrument time.'
  };
  const DESIGN_DESC = {
    tost: 'Two one-sided tests. You must declare a margin first: how big a difference you are willing to call unimportant. This is the calculation the method-transfer tool refers to when it says a study was too small.',
    two: 'An ordinary two-sample t-test: is there a difference between two groups at all? Powered on the difference you would not want to miss.',
    one: 'A one-sample t-test against a fixed number, such as a target or a label claim.'
  };

  // ---------- reading the results ----------
  const VALUE = /result|value|assay|purity|potency|conc|content|titer|titre|measure|yield|response|%/i;
  function loadText(text) {
    let t;
    try { t = E.parseCSV(text); } catch (e) { return fail('Could not read the data: ' + e.message); }
    if (!t.rows.length) return fail('No usable rows found. The first row should hold column names.');
    table = t;
    const prof = E.profile(t);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    if (!numeric.length) return fail('No numeric column found. One column needs to hold the results.');
    const pick = numeric.find(c => VALUE.test(c)) || numeric[numeric.length - 1];
    $('tl-value').innerHTML = numeric.map(c => '<option' + (c === pick ? ' selected' : '') + '>' + h(c) + '</option>').join('');
    $('tl-settings').hidden = false;
    $('tl-error').hidden = true;
    describe();
  }
  function readValues() {
    if (!table) throw new Error('Load some results first.');
    const vi = table.columns.indexOf($('tl-value').value);
    if (vi < 0) throw new Error('Pick the column holding the results.');
    const out = []; let skipped = 0;
    table.rows.forEach(r => { const v = E.toNumber(r[vi]); if (v === null) skipped++; else out.push(v); });
    if (out.length < 2) throw new Error('Need at least 2 numeric results in "' + $('tl-value').value + '".');
    return { values: out, skipped };
  }
  function describe() {
    try {
      const { values, skipped } = readValues();
      const m = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
      $('tl-read').textContent = values.length + ' results, mean ' + f3(m) + ', standard deviation ' + f3(sd) + '.' +
        (skipped ? ' ' + skipped + ' row' + (skipped === 1 ? '' : 's') + ' skipped (no number).' : '') +
        (values.length < 10 ? ' Below about ten results the interval is very wide, which is honest rather than broken.' : '');
    } catch (e) { $('tl-read').textContent = e.message; }
  }

  // ---------- the tolerance interval chart ----------
  /* The interval against the specification, with every result shown. If the bar fits inside
     the spec marks, the data supports those limits. */
  function drawInterval(el, r) {
    const W = Math.max(340, el.clientWidth || 700), H = 200, L = 26, R = 26, mid = 118;
    const pts = [r.lower, r.upper, r.lsl, r.usl, r.min, r.max, r.mean].filter(v => v !== null && isFinite(v));
    let lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    const sx = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let b = '';
    // The specification window, drawn as the band the interval has to sit inside.
    if (r.lsl !== null || r.usl !== null) {
      const a = r.lsl !== null ? sx(r.lsl) : L, c = r.usl !== null ? sx(r.usl) : W - R;
      b += '<rect class="band" x="' + a + '" y="44" width="' + Math.max(0, c - a) + '" height="' + (mid + 30 - 44) + '"/>';
      [[r.lsl, 'LSL'], [r.usl, 'USL']].forEach(([v, lab]) => {
        if (v === null) return;
        b += '<line class="ref" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="44" y2="' + (mid + 30) + '"/>' +
          '<text class="lbl-strong" x="' + sx(v) + '" y="38" text-anchor="middle">' + lab + ' ' + f3(v) + '</text>';
      });
    }
    // Every measurement, so the reader can see the spread the interval came from.
    r.values.forEach(v => { b += '<g data-tip="' + h(f4(v)) + '"><circle class="pt c1" cx="' + sx(v) + '" cy="' + (mid - 36) + '" r="4"/></g>'; });
    b += '<text x="' + L + '" y="' + (mid - 54) + '">the ' + r.n + ' results</text>';
    const cls = r.inside === false ? 'bad' : r.inside === true ? 'ok' : 'warn';
    const a = r.lower !== null ? sx(r.lower) : L, c = r.upper !== null ? sx(r.upper) : W - R;
    b += '<line class="ci ' + cls + '" x1="' + a + '" x2="' + c + '" y1="' + mid + '" y2="' + mid + '"/>';
    [r.lower, r.upper].forEach(v => { if (v === null) return; b += '<line class="ci-cap ' + cls + '" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + (mid - 9) + '" y2="' + (mid + 9) + '"/>'; });
    b += '<circle class="ci-dot ' + cls + '" cx="' + sx(r.mean) + '" cy="' + mid + '" r="5"/>';
    [r.lower, r.upper].forEach(v => {
      if (v === null) return;
      b += '<text class="lbl-strong" x="' + sx(v) + '" y="' + (mid + 26) + '" text-anchor="middle">' + f3(v) + '</text>';
    });
    // The naive interval people reach for, for contrast.
    b += '<line class="naive-mark" x1="' + sx(r.naive.lower) + '" x2="' + sx(r.naive.upper) + '" y1="' + (mid + 46) + '" y2="' + (mid + 46) + '"/>';
    [r.naive.lower, r.naive.upper].forEach(v => { b += '<line class="naive-mark" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + (mid + 40) + '" y2="' + (mid + 52) + '"/>'; });
    b += '<text x="' + L + '" y="' + (H - 6) + '">mean &plusmn; 3 standard deviations, for comparison</text>';
    el.innerHTML = '<svg class="chart tol-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tolerance interval against the specification limits">' + b + '</svg>';
  }

  function renderSpec(r) {
    const covered = (r.p * 100).toFixed(r.p > 0.999 ? 2 : 0) + '%';
    const conf = Math.round(r.conf * 100) + '%';
    const nd = r.normality;
    const cls = r.inside === false ? 'not' : r.inside === true ? 'capable' : 'marginal';
    const badge = r.inside === false ? 'NOT SUPPORTED' : r.inside === true ? 'SUPPORTED' : 'NO LIMITS GIVEN';
    const sidedWord = r.sided === 1 ? (r.bound === 'lower' ? 'lower limit only' : 'upper limit only') : 'two-sided';

    const plain = r.inside === true
      ? 'Your current limits are supported by this data. On ' + r.n + ' results, you can say with ' + conf + ' confidence that at least ' + covered + ' of future production falls inside ' +
        (r.sided === 1 ? (r.bound === 'lower' ? 'above ' + f3(r.lower) : 'below ' + f3(r.upper)) : f3(r.lower) + ' to ' + f3(r.upper)) +
        ', and that sits inside the specification you already have.'
      : r.inside === false
        ? (r.achievable === false
          ? 'This process cannot hold those limits, and no amount of extra data will change that. The interval that covers ' + covered + ' of production runs from ' + f3(r.lower) + ' to ' + f3(r.upper) + ', which is already wider than the specification window itself. Either the limits were set from something other than process capability, or the process has to be improved — more batches will only measure the same spread more precisely.'
          : 'This data does not yet support those limits, but it is close enough that more of it would. On what you have, the interval runs ' + f3(r.lower) + ' to ' + f3(r.upper) + '. About ' + r.needed + ' results in total would bring it inside the specification, if the process carries on behaving as it has. That is a data problem rather than a process problem.')
        : 'With ' + conf + ' confidence, at least ' + covered + ' of future production falls ' +
          (r.sided === 1 ? (r.bound === 'lower' ? 'above ' + f3(r.lower) : 'below ' + f3(r.upper)) : 'between ' + f3(r.lower) + ' and ' + f3(r.upper)) +
          '. Those are the limits this data can defend. Enter the limits you currently hold and it will tell you whether they stand up.';

    const tiles = tile(r.sided === 1 ? 'Defensible limit' : 'Defensible limits',
      r.sided === 1 ? (r.bound === 'lower' ? '≥ ' + f3(r.lower) : '≤ ' + f3(r.upper)) : f3(r.lower) + ' to ' + f3(r.upper),
      covered + ' of production, ' + conf + ' confidence', true) +
      tile('Tolerance factor k', f3(r.k), 'against ' + f3(r.naive.k) + ' if sigma were known') +
      tile('Mean and spread', f3(r.mean) + ' ± ' + f3(r.sd), r.n + ' results, ' + r.df + ' degrees of freedom') +
      (r.usedOfSpec !== null ? tile('Spec window used', pc(r.usedOfSpec), r.usedOfSpec > 1 ? 'wider than the specification' : 'headroom left')
        : tile('Normality', nd.p === null ? 'not tested' : nd.normal ? 'no evidence against' : 'doubtful', nd.p === null ? 'too few results' : 'Anderson–Darling p ' + pFmt(nd.p)));

    const notes = [];
    notes.push('A tolerance interval is not a confidence interval. A confidence interval is about where the mean sits and shrinks towards nothing as you add data; this is about where the individual results sit, and it settles towards the real spread of the process rather than towards zero.');
    notes.push('With ' + r.n + ' results the factor is ' + f3(r.k) + '. If the standard deviation were known exactly it would be ' + f3(r.limitingK) + '. That gap is the price of not knowing sigma, and it is why mean ± 3s is optimistic on a small study: here it would give ' + f3(r.naive.lower) + ' to ' + f3(r.naive.upper) + ', which is ' + pc((r.naive.upper - r.naive.lower) / (r.upper !== null && r.lower !== null ? r.upper - r.lower : NaN)) + ' of the width this calculation says you need.');
    if (nd.p !== null && !nd.normal) notes.push('The results do not look normal (Anderson–Darling p ' + pFmt(nd.p) + '), and this interval assumes they are. That assumption bites hardest exactly where a specification lives — in the tails — so treat these limits as provisional. A transformation, or a distribution-free interval, would be the honest route; a skewed attribute such as an impurity often works better on a log scale.');
    else if (nd.p === null) notes.push('Normality was not tested: ' + (nd.note || 'too few results.') + ' The interval assumes a normal distribution, and on this little data that assumption is doing much of the work.');
    else notes.push('No evidence against normality (Anderson–Darling p ' + pFmt(nd.p) + '). That is not proof of it: on ' + r.n + ' results the test can only catch obvious departures, and the tails are where it matters.');
    if (r.n < 10) notes.push('With only ' + r.n + ' results, any limit set this way will be wide. That is the arithmetic being honest about how little is known, not a fault to work around — and it is why specifications set on three batches are so often broken later.');
    if (r.sided === 2) notes.push('A two-sided interval was used. If only one direction can actually fail — potency too low, an impurity too high — then a one-sided limit is the right test and is meaningfully tighter, because you are not paying for a limit you do not need.');
    notes.push('These results need to be independent and on the scale the specification is written on: one number per batch. Averaging replicates into each row understates batch-to-batch spread and produces limits that look comfortable and are not.');

    $('tl-out').innerHTML = '<div class="card tl-result"><h3>Specification limits this data supports</h3>' +
      '<div class="plain ' + cls + '"><h4>In plain English</h4><p>' + h(plain) + '</p></div>' +
      '<p class="sub-head"><span class="verdict ' + cls + '">' + badge + '</span> ' + covered + ' coverage at ' + conf + ' confidence, ' + sidedWord + '.</p>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div id="tl-chart"></div>' +
      '<h4>The numbers</h4><div class="table-scroll"><table><tbody>' +
      [['Results', r.n], ['Mean', f4(r.mean)], ['Standard deviation', f4(r.sd)], ['Degrees of freedom', r.df],
        ['Proportion covered', covered], ['Confidence', conf], ['Tolerance factor k', f4(r.k)],
        ['Lower tolerance limit', r.lower === null ? 'not requested' : f4(r.lower)],
        ['Upper tolerance limit', r.upper === null ? 'not requested' : f4(r.upper)],
        ['Lowest result seen', f4(r.min)], ['Highest result seen', f4(r.max)],
        ['Anderson–Darling statistic', nd.adjusted === null ? 'not tested' : f4(nd.adjusted) + ' (5% critical value 0.752)'],
        ['Normality p-value', nd.p === null ? 'not tested' : pFmt(nd.p)]]
        .map(([a, b]) => '<tr><td>' + h(a) + '</td><td class="num-cell">' + h(b) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (r.needed ? '<p class="hint"><b>How many results would it take?</b> About ' + r.needed + ' in total, assuming the mean and spread stay as they are. The factor falls as the study grows, so the interval tightens even though the process does not change.</p>' : '') +
      '<h4>What this rests on</h4><ul class="insights">' + notes.map(n => '<li class="info">' + n + '</li>').join('') + '</ul>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="tl-csv">Download the report (.csv)</button></div>' +
      '<p class="hint">Decision support, not a validated specification-setting system. A specification is a regulatory commitment: this gives you the statistical part of the argument, not the whole of it.</p></div>';
    drawInterval($('tl-chart'), r);
    $('tl-csv').addEventListener('click', () => download('tolerance-interval.csv', csvSpec(r), 'text/csv'));
    window.MLToleranceRun = summarySpec(r);
  }

  // ---------- study sizing ----------
  function renderSize(res) {
    const d = res.design, r = res.result, n = r.n;
    const what = d === 'tost' ? 'per method' : d === 'two' ? 'per group' : 'in total';
    const capped = n === null;
    const cls = capped ? 'not' : n <= 30 ? 'capable' : n <= 100 ? 'marginal' : 'not';

    const plain = capped
      ? 'No realistic study reaches ' + pc(res.target) + ' power at these settings: even ' + res.capped + ' results per group falls short. Either the difference you are trying to detect is far smaller than the scatter, or the margin is tighter than the method can support. The answer is to revisit the question rather than to book more instrument time.'
      : d === 'tost'
        ? 'You need about ' + n + ' results ' + what + '. That gives a ' + pc(r.power) + ' chance of demonstrating equivalence, if the two really differ by ' + f3(res.opt.diff) + ' and the standard deviation is ' + f3(res.opt.sd) + ', against your margin of ±' + f3(res.opt.margin) + '. Run fewer and the likely outcome is an inconclusive study: not a pass, not a fail, and no decision.'
        : 'You need about ' + n + ' results ' + what + (d === 'two' ? ', so ' + n * 2 + ' altogether' : '') + '. That gives a ' + pc(r.power) + ' chance of detecting a difference of ' + f3(res.opt.delta) + ' when the standard deviation is ' + f3(res.opt.sd) + '. A smaller study is not a cheaper version of this one; it is a study that probably cannot answer the question.';

    const tiles = tile('Results needed', capped ? 'not reachable' : String(n), what, true) +
      tile('Power achieved', capped ? '–' : pc(r.power), 'target was ' + pc(res.target)) +
      (d === 'tost' ? tile('Margin', '±' + f3(res.opt.margin), 'declared before the study') : tile('Difference', f3(res.opt.delta), 'what you would not want to miss')) +
      tile('Scatter assumed', f3(res.opt.sd), d === 'tost' && res.opt.paired ? 'standard deviation of the differences' : 'standard deviation');

    // What a smaller or larger study would buy: the table people actually argue over.
    const fn = d === 'tost' ? T.powerTost : d === 'two' ? T.powerTwoSample : T.powerOneSample;
    const base = capped ? 12 : n;
    const sizes = Array.from(new Set([3, 6, 10, Math.round(base / 2), base, Math.round(base * 1.5), base * 2, 60]
      .filter(v => v >= 2 && v <= 400))).sort((a, b) => a - b);
    const rows = sizes.map(m => ({ n: m, power: fn(Object.assign({}, res.opt, { n: m })).power }));
    const tableHtml = '<h4>What each study size buys</h4><div class="table-scroll"><table><thead><tr><th class="num-cell">Results ' + h(what) + '</th><th class="num-cell">Chance of a conclusive answer</th><th>&nbsp;</th></tr></thead><tbody>' +
      rows.map(x => '<tr' + (x.n === n ? ' class="hi-row"' : '') + '><td class="num-cell">' + x.n + '</td><td class="num-cell">' + pc(x.power) + '</td><td>' +
        (x.power < 0.5 ? '<span class="verdict not">likely wasted</span>' : x.power < 0.8 ? '<span class="verdict marginal">underpowered</span>' : '<span class="verdict capable">adequate</span>') + '</td></tr>').join('') +
      '</tbody></table></div>';

    const notes = [];
    if (d === 'tost') {
      notes.push('Equivalence is harder to show than a difference, and needs more results than people expect. The margin has to come from what matters to the product and be fixed before any data is seen — choosing it afterwards to get a pass is the one thing that makes the whole exercise worthless.');
      notes.push('The difference you expect matters as much as the margin. A method with no real bias needs far fewer results than one sitting halfway to the margin, which is why an honest guess at the bias is worth more here than an optimistic one.');
      if (res.opt.paired) notes.push('Paired: the standard deviation here is the standard deviation of the within-sample differences, not of the results themselves. It is usually much smaller, which is why pairing is worth the trouble when the same samples can be measured both ways.');
      else notes.push('Unpaired. If the same samples can be measured by both methods, pairing removes sample-to-sample spread from the comparison and typically cuts the study size substantially.');
    } else {
      notes.push('Power is the chance of finding a difference that is really there. At 80% there is a one-in-five chance of missing it even when it exists, which is the conventional bar rather than a comfortable one.');
      notes.push('A study with low power that reports "no significant difference" has not shown the two are the same. If showing sameness is the actual goal, the equivalence question above is the right test, and it needs its own margin.');
    }
    notes.push('All of this rests on the standard deviation you entered. If that came from a handful of runs it is itself uncertain, and the sample size inherits that uncertainty — a variance component study or a Gage R&R on the method is the way to put a defensible number on it.');
    notes.push('These are exact t-based calculations, not the normal approximation, so they do not quietly overstate power at the small sample sizes development studies actually run.');

    $('tl-out').innerHTML = '<div class="card tl-result"><h3>How big does the study need to be?</h3>' +
      '<div class="plain ' + cls + '"><h4>In plain English</h4><p>' + h(plain) + '</p></div>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div id="tl-curve"></div>' + tableHtml +
      '<h4>What this rests on</h4><ul class="insights">' + notes.map(n => '<li class="info">' + n + '</li>').join('') + '</ul>' +
      '<div class="row-actions"><button class="btn primary" type="button" id="tl-csv">Download the report (.csv)</button></div>' +
      '<p class="hint">Decision support. Confirm against your protocol before committing instrument time.</p></div>';

    const curve = T.powerCurve(fn, res.opt, 2, Math.max(24, Math.min(400, (capped ? 60 : n) * 2.5)), 36);
    CH.lines($('tl-curve'), [{ name: 'Power', points: curve.map(p => ({ x: p.n, y: p.power, big: p.n === n, tip: p.n + ' ' + what + ': ' + pc(p.power) })) }],
      { yDomain: [0, 1], xLabel: 'Results ' + what, yLabel: 'Chance of a conclusive answer', noDots: true, xTicks: curve.filter((_, i) => i % 6 === 0).map(p => p.n) });
    $('tl-csv').addEventListener('click', () => download('sample-size.csv', csvSize(res, rows), 'text/csv'));
    window.MLToleranceRun = summarySize(res, rows);
  }

  // ---------- reports ----------
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  function csvSpec(r) {
    const L = [['Tolerance interval report'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No data was uploaded or stored.')], [],
      ['Setting', 'Value'], ['Result column', q($('tl-value').value)],
      ['Results', r.n], ['Proportion covered', r.p], ['Confidence', r.conf],
      ['Limits', q(r.sided === 1 ? r.bound + ' only' : 'two-sided')], [],
      ['Result', 'Value'], ['Mean', r.mean], ['Standard deviation', r.sd], ['Degrees of freedom', r.df],
      ['Tolerance factor k', r.k], ['Factor if sigma were known', r.limitingK],
      ['Lower tolerance limit', r.lower === null ? '' : r.lower],
      ['Upper tolerance limit', r.upper === null ? '' : r.upper],
      ['Lowest result', r.min], ['Highest result', r.max], []];
    if (r.lsl !== null || r.usl !== null) {
      L.push(['Specification check', 'Value']);
      if (r.lsl !== null) L.push(['Lower spec limit', r.lsl], ['Lower limit supported', r.insideLower ? 'yes' : 'no']);
      if (r.usl !== null) L.push(['Upper spec limit', r.usl], ['Upper limit supported', r.insideUpper ? 'yes' : 'no']);
      L.push(['Supported overall', r.inside ? 'yes' : 'no']);
      if (r.inside === false) L.push(['Results that would suffice', r.achievable === false ? q('none: the limits are inside the natural spread of the process') : r.needed]);
      L.push([]);
    }
    L.push(['Normality (Anderson-Darling)', 'Value']);
    L.push(['Adjusted statistic', r.normality.adjusted === null ? '' : r.normality.adjusted], ['p-value', r.normality.p === null ? '' : r.normality.p],
      ['5% critical value', 0.752], ['Conclusion', q(r.normality.p === null ? 'not tested: ' + (r.normality.note || '') : r.normality.normal ? 'no evidence against normality' : 'normality is doubtful')]);
    L.push([], ['Result']);
    r.values.forEach(v => L.push([v]));
    L.push([], [q('Decision support, not a validated specification-setting system. The interval assumes independent, normally distributed results on the scale the specification is written on.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }
  function csvSize(res, rows) {
    const o = res.opt, d = res.design;
    const L = [['Sample size and power report'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No data was uploaded or stored.')], [],
      ['Setting', 'Value'],
      ['Question', q(d === 'tost' ? 'equivalence by two one-sided tests' : d === 'two' ? 'difference between two groups' : 'one group against a fixed target')],
      ['Standard deviation assumed', o.sd], ['Significance level', o.alpha], ['Target power', res.target]];
    if (d === 'tost') L.push(['Equivalence margin', o.margin], ['Difference expected', o.diff], ['Paired', o.paired ? 'yes' : 'no']);
    else L.push(['Difference to detect', o.delta], ['Sides', 2]);
    L.push([], ['Result', 'Value']);
    L.push(['Results needed', res.result.n === null ? q('not reachable') : res.result.n], ['Power at that size', res.result.power]);
    L.push([], ['Results per group', 'Power']);
    rows.forEach(x => L.push([x.n, x.power]));
    L.push([], [q('Exact t-based calculation, not the normal approximation. Decision support only.')]);
    return L.map(x => x.join(',')).join('\n') + '\n';
  }
  const summarySpec = r => ({
    kind: 'tolerance', when: new Date().toISOString(), column: $('tl-value').value,
    n: r.n, mean: r.mean, sd: r.sd, df: r.df, p: r.p, conf: r.conf, sided: r.sided, bound: r.bound,
    k: r.k, limitingK: r.limitingK, lower: r.lower, upper: r.upper, min: r.min, max: r.max,
    lsl: r.lsl, usl: r.usl, inside: r.inside, needed: r.needed, achievable: r.achievable,
    normalityP: r.normality.p, normalityStat: r.normality.adjusted, normal: r.normality.normal
  });
  const summarySize = (res, rows) => ({
    kind: 'samplesize', when: new Date().toISOString(), design: res.design,
    target: res.target, n: res.result.n, power: res.result.power, opt: res.opt,
    curve: rows.map(x => [x.n, x.power])
  });

  // ---------- examples ----------
  function example(kind) {
    const rand = E.rng(kind === 1 ? 11 : kind === 2 ? 29 : 3);
    const norm = () => { const u = Math.max(1e-12, rand()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
    const n = kind === 3 ? 4 : 24;
    const sd = kind === 2 ? 1.15 : 0.42;
    const lines = ['BatchID,Purity_Pct'];
    for (let i = 0; i < n; i++) lines.push(['B-' + String(2401 + i), (98.2 + norm() * sd).toFixed(2)].join(','));
    return lines.join('\n');
  }

  // ---------- wiring ----------
  function showMode() {
    const m = mode();
    $('tl-mode-desc').textContent = MODE_DESC[m];
    $('tl-spec').hidden = m !== 'spec';
    $('tl-size').hidden = m === 'spec';
    $('tl-out').innerHTML = ''; $('tl-error').hidden = true;
    if (m === 'size') showDesign();
  }
  function showDesign() {
    const d = design();
    $('tl-design-desc').textContent = DESIGN_DESC[d];
    $('tl-margin-wrap').hidden = d !== 'tost';
    $('tl-paired-wrap').hidden = d !== 'tost';
    // The same box means different things in the two questions, so it is relabelled.
    $('tl-diff-wrap').childNodes[0].nodeValue = d === 'tost' ? 'Difference you expect is really there ' : 'Difference you would not want to miss ';
    $('tl-size-hint').textContent = d === 'tost'
      ? 'The margin is the decision; the expected difference is your honest guess at the bias. A method you believe is unbiased needs far fewer results than one you suspect sits halfway to the margin.'
      : 'Enter the smallest difference that would actually change what you do. Powering a study on a difference nobody would act on is how studies end up enormous for no reason.';
    $('tl-out').innerHTML = ''; $('tl-error').hidden = true;
  }
  function runSpec() {
    $('tl-error').hidden = true;
    let got;
    try { got = readValues(); } catch (e) { return fail(e.message); }
    const sidedRaw = $('tl-sided').value;
    const lsl = num('tl-lsl'), usl = num('tl-usl');
    if (isNaN(lsl) || isNaN(usl)) return fail('The specification limits need to be numbers, or left empty.');
    if (lsl !== null && usl !== null && lsl >= usl) return fail('The lower specification limit has to be below the upper one.');
    const opt = {
      p: Number($('tl-p').value), conf: Number($('tl-conf').value),
      sided: sidedRaw === '2' ? 2 : 1, bound: sidedRaw === '2' ? 'both' : sidedRaw,
      lsl: lsl, usl: usl
    };
    const btn = $('tl-run'); btn.disabled = true; btn.textContent = 'Working…';
    // The factor is an integration and a root-find, so the button is released on the next
    // frame rather than locking the page while it runs.
    setTimeout(() => {
      try { renderSpec(T.toleranceInterval(got.values, opt)); $('tl-out').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e) { fail(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Work out the limits'; }
    }, 10);
  }
  function runSize() {
    $('tl-error').hidden = true;
    const d = design();
    const sd = num('tl-sd'), alpha = Number($('tl-alpha').value), target = Number($('tl-power').value);
    if (sd === null || isNaN(sd) || !(sd > 0)) return fail('Enter the standard deviation you expect, as a number above zero.');
    let opt, fn;
    if (d === 'tost') {
      const margin = num('tl-margin'), diff = num('tl-diff');
      if (margin === null || isNaN(margin) || !(margin > 0)) return fail('Enter the equivalence margin, as a number above zero.');
      if (diff === null || isNaN(diff)) return fail('Enter the difference you expect, or 0 if you expect none.');
      if (Math.abs(diff) >= margin) return fail('The difference you expect (' + diff + ') is at or beyond the margin (±' + margin + '), so no study could show equivalence. Either the margin is too tight or the methods genuinely differ.');
      opt = { sd, alpha, margin, diff, paired: $('tl-paired').value === '1' };
      fn = T.sampleSizeTost;
    } else {
      const delta = num('tl-diff');
      if (delta === null || isNaN(delta) || delta === 0) return fail('Enter the difference you want to detect, as a number other than zero.');
      opt = { sd, alpha, delta, sided: 2 };
      fn = d === 'two' ? T.sampleSizeTwoSample : T.sampleSizeOneSample;
    }
    const btn = $('tl-size-run'); btn.disabled = true; btn.textContent = 'Working…';
    setTimeout(() => {
      try {
        const result = fn(opt, target);
        renderSize({ design: d, opt, target, result, capped: result.capped });
        $('tl-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { fail(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Work out the sample size'; }
    }, 10);
  }
  function clear() {
    table = null; window.MLToleranceRun = null;
    $('tl-data').value = ''; $('tl-file').value = '';
    $('tl-out').innerHTML = ''; $('tl-read').textContent = '';
    $('tl-settings').hidden = true; $('tl-error').hidden = true;
    $('tl-lsl').value = ''; $('tl-usl').value = '';
  }
  function load(text, lsl, usl) {
    $('tl-data').value = text; $('tl-error').hidden = true; $('delete-top').hidden = false;
    $('tl-out').innerHTML = '';
    loadText(text);
    if (lsl !== undefined) $('tl-lsl').value = lsl;
    if (usl !== undefined) $('tl-usl').value = usl;
  }

  function init() {
    showMode();
    $('tl-mode').addEventListener('change', showMode);
    $('tl-design').addEventListener('change', showDesign);
    // Each example carries the limits it was built to illustrate.
    $('tl-ex1').addEventListener('click', () => load(example(1), 96, 100));
    $('tl-ex2').addEventListener('click', () => load(example(2), 97.5, 99));
    $('tl-ex3').addEventListener('click', () => load(example(3), 96, 100));
    $('tl-clear').addEventListener('click', clear);
    $('tl-size-clear').addEventListener('click', () => { $('tl-out').innerHTML = ''; $('tl-error').hidden = true; });
    $('tl-data').addEventListener('change', () => { if ($('tl-data').value.trim()) { $('delete-top').hidden = false; loadText($('tl-data').value); } });
    $('tl-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => load(String(fr.result));
      fr.readAsText(f);
    });
    $('tl-value').addEventListener('change', describe);
    $('tl-run').addEventListener('click', runSpec);
    $('tl-size-run').addEventListener('click', runSize);
  }

  window.MLLimits = { clear, example };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
