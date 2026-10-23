/* ML Agent Academy: interactive lessons. Each lesson has an analogy, a hands-on demo built
   on made-up data, plain-English steps, and a one-question check. Quiz progress is kept in
   memory only. No network, no storage. */
(function () {
  'use strict';
  const E = window.MLEngine, C = window.Charts, A = window.MLAgent, D = window.MLDoe;
  const h = C.esc, fmt = A.fmt, pct = A.pct;
  const range = E.range;

  // ---------- Small drawing helpers ----------
  function frame(W, H, xd, yd, o) {
    o = o || {};
    const L = o.l !== undefined ? o.l : 46, R = 14, T = 12, B = o.b !== undefined ? o.b : 38;
    const sx = v => L + (v - xd[0]) / (xd[1] - xd[0]) * (W - L - R);
    const sy = v => H - B - (v - yd[0]) / (yd[1] - yd[0]) * (H - T - B);
    let axes = '';
    if (!o.noAxes) {
      for (const t of C.niceTicks(yd[0], yd[1], 4)) if (t >= yd[0] && t <= yd[1]) axes += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + h(o.yFmt ? o.yFmt(t) : fmt(t)) + '</text>';
      for (const t of C.niceTicks(xd[0], xd[1], 5)) if (t >= xd[0] && t <= xd[1]) axes += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + h(o.xFmt ? o.xFmt(t) : fmt(t)) + '</text>';
      axes += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
      if (o.xLabel) axes += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + h(o.xLabel) + '</text>';
      if (o.yLabel) axes += '<text class="lbl-strong" transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + h(o.yLabel) + '</text>';
    }
    const inv = (px, py) => [xd[0] + (px - L) / (W - L - R) * (xd[1] - xd[0]), yd[0] + (H - B - py) / (H - T - B) * (yd[1] - yd[0])];
    return { sx, sy, inv, axes, L, R, T, B, W, H, clip: '<clipPath id="clip' + (++clipN) + '"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></clipPath>', clipId: 'clip' + clipN };
  }
  let clipN = 0;
  const svg = (W, H, label, body) => '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(label) + '">' + body + '</svg>';
  const pathOf = (pts, f) => pts.map((p, i) => (i ? 'L' : 'M') + f.sx(p[0]).toFixed(1) + ' ' + f.sy(p[1]).toFixed(1)).join('');
  function svgPoint(svgEl, e) {
    const r = svgEl.getBoundingClientRect(), vb = svgEl.viewBox.baseVal;
    return [(e.clientX - r.left) / r.width * vb.width, (e.clientY - r.top) / r.height * vb.height];
  }
  function slider(role, label, min, max, step, value) {
    return '<label>' + h(label) + ' <input type="range" data-role="' + role + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"><output data-out="' + role + '">' + value + '</output></label>';
  }
  const btn = (role, label, cls) => '<button type="button" class="btn ' + (cls || '') + '" data-role="' + role + '">' + h(label) + '</button>';
  const q = (el, role) => el.querySelector('[data-role="' + role + '"]');
  const setOut = (el, role, v) => { const o = el.querySelector('[data-out="' + role + '"]'); if (o) o.textContent = v; };
  function normal(rand) { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const dot = (x, y, cls, r, tip, shape) => (tip ? '<g data-tip="' + h(tip) + '">' : '') + (shape === 'square'
    ? '<rect class="' + cls + '" x="' + (x - r) + '" y="' + (y - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" rx="1"/>'
    : '<circle class="' + cls + '" cx="' + x + '" cy="' + y + '" r="' + r + '"/>') + (tip ? '</g>' : '');
  const passLegend = C.legend([{ label: 'Pass', cls: 'c1' }, { label: 'Fail', cls: 'c2', shape: 'square' }]);

  // Toy pass/fail process data: passes inside a temperature window at low humidity.
  function passFail(n, seed) {
    const rand = E.rng(seed), X = [], y = [];
    for (let i = 0; i < n; i++) {
      const t = 150 + 100 * rand(), hu = 20 + 60 * rand();
      let pass = t > 180 && t < 230 && hu < 58 ? 1 : 0;
      if (rand() < 0.06) pass = 1 - pass;
      X.push([t, hu]); y.push(pass);
    }
    return { X, y };
  }
  const PF_X = [150, 250], PF_Y = [20, 80];
  const pfQuestion = (f, t) => ({ q: (f ? 'Humidity' : 'Temperature') + ' ≤ ' + fmt(t) + '?', leftIsYes: true });
  const pfLeaf = node => { const k = node.value[1] >= 0.5 ? 1 : 0; return [(k ? 'Pass ' : 'Fail ') + pct(node.value[k]), node.n + ' rows']; };
  const pfLeafClass = node => (node.value[1] >= 0.5 ? 'good' : 'bad');
  function treeRegions(node, b, out) {
    if (node.leaf) { out.push({ b, p: node.value[1] }); return out; }
    const [x0, x1, y0, y1] = b;
    if (node.f === 0) { treeRegions(node.left, [x0, Math.min(x1, node.t), y0, y1], out); treeRegions(node.right, [Math.max(x0, node.t), x1, y0, y1], out); }
    else { treeRegions(node.left, [x0, x1, y0, Math.min(y1, node.t)], out); treeRegions(node.right, [x0, x1, Math.max(y0, node.t), y1], out); }
    return out;
  }
  function pathTo(tree, r) { const s = new Set(); let n = tree; s.add(n); while (!n.leaf) { n = r[n.f] <= n.t ? n.left : n.right; s.add(n); } return { set: s, leaf: n }; }
  function pfPoints(f, d) { return d.X.map((p, i) => dot(f.sx(p[0]), f.sy(p[1]), d.y[i] ? 'c1' : 'c2', 4, (d.y[i] ? 'Pass' : 'Fail') + '\nTemperature ' + fmt(p[0]) + ', humidity ' + fmt(p[1]), d.y[i] ? 'circle' : 'square')).join(''); }

  // ---------- Lessons ----------
  const LESSONS = [];
  const add = l => LESSONS.push(l);

  add({
    id: 'start', group: 'Start here', title: 'What machine learning is (and is not)',
    analogy: 'An apprentice who studies thousands of past jobs until they can guess the outcome of the next one, but who never understands the physics.',
    intro: 'Machine learning finds patterns in past data and uses them to predict or group new data. It is fast and tireless, but it only knows what is in the data. It cannot tell cause from coincidence on its own. That is why ML Agent pairs it with Design of Experiments.',
    demo(el) {
      el.innerHTML = '<div class="demo-grid">' + ['Supervised: learning with an answer key', 'Unsupervised: finding groups with no answer key'].map((t, i) => '<div><h4>' + t + '</h4><div data-role="p' + i + '"></div></div>').join('') + '</div>' +
        '<div class="demo-controls">' + btn('go', 'Let the algorithm find groups', 'primary') + '</div><p class="demo-read" data-role="read">Left: every point already has a label (blue Pass, orange Fail), so a model can learn to predict it. Right: no labels at all. Press the button to let k-means look for natural groups.</p>';
      const rand = E.rng(4), pts = [];
      [[2, 2], [7, 3], [4.5, 7.5]].forEach((c, g) => { for (let i = 0; i < 25; i++) pts.push({ x: c[0] + normal(rand) * 0.8, y: c[1] + normal(rand) * 0.8, g }); });
      const f = frame(320, 240, [-1, 10], [-1, 10.5], { noAxes: true, l: 10, b: 10 });
      const lab = pts.map(p => p.x > 4.5 ? 1 : 0);
      q(el, 'p0').innerHTML = svg(320, 240, 'Labelled points', pts.map((p, i) => dot(f.sx(p.x), f.sy(p.y), lab[i] ? 'c1' : 'c2', 5, null, lab[i] ? 'circle' : 'square')).join('')) + passLegend;
      const draw = labels => { q(el, 'p1').innerHTML = svg(320, 240, 'Unlabelled points', pts.map((p, i) => labels ? dot(f.sx(p.x), f.sy(p.y), 'c' + (labels[i] + 1), 5, null, C.SHAPES[labels[i]]) : dot(f.sx(p.x), f.sy(p.y), 'hollow', 5)).join('')); };
      draw(null);
      q(el, 'go').onclick = () => {
        const km = E.kmeans(pts.map(p => [p.x, p.y]), 3, E.rng(1), 5);
        draw(km.labels);
        q(el, 'read').innerHTML = 'k-means found <b>3 groups</b> without being told anything. It cannot name them: that is your job. Supervised learning answers "what will happen?"; unsupervised learning answers "what kinds of things do we have?"';
      };
    },
    steps: ['Supervised learning: you give examples with the answer (yield, pass/fail). The model learns the link from inputs to answer.', 'Regression predicts a number; classification predicts a category.', 'Unsupervised learning: no answer column. The model looks for groups, main directions and oddballs.', 'Every model is tested on rows it did not learn from, so you know how far to trust it.'],
    when: 'Use ML on historical data to find likely drivers quickly and cheaply.',
    watch: 'Patterns in history can be coincidence or a hidden cause. Prove the important ones with a DOE.',
    where: 'Step 2 of the agent: pick a target for supervised learning, or "Nothing" for unsupervised.',
    quiz: { q: 'You have 2 years of batch records with a Pass/Fail result and want to know what drives failures. What kind of problem is this?', options: ['Unsupervised clustering', 'Supervised classification', 'Regression'], answer: 1, why: 'There is an answer column (Pass/Fail) and it is a category, so it is supervised classification.' }
  });

  add({
    id: 'cross-validation', group: 'Start here', title: 'Cross-validation: the surprise exam',
    analogy: 'Grading a student on questions they have never seen, not on the homework they could have memorized.',
    intro: 'A model can look brilliant on the rows it learned from and fail on new ones. Cross-validation hides part of the data, trains on the rest, and scores the model on the hidden part. Then it rotates until every row has been hidden once.',
    demo(el) {
      el.innerHTML = '<div data-role="plot"></div><div class="demo-controls">' + btn('next', 'Next round', 'primary') + btn('reset', 'Start over', 'ghost') + '</div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(9), n = 20, xs = range(n).map(() => rand() * 10), ys = xs.map(x => 3 + 2 * x + normal(rand) * 3);
      const folds = E.makeFolds(n, 5, E.rng(2));
      let round = -1; const scores = [];
      const draw = () => {
        const W = 640, cell = 26, H = 5 * 34 + 30;
        let b = '';
        range(n).forEach(i => { b += '<text x="' + (110 + i * cell + cell / 2) + '" y="14" text-anchor="middle">' + (i + 1) + '</text>'; });
        for (let r = 0; r < 5; r++) {
          const y = 24 + r * 34;
          b += '<text x="100" y="' + (y + 18) + '" text-anchor="end" class="' + (r === round ? 'lbl-strong' : '') + '">Round ' + (r + 1) + (scores[r] !== undefined ? '  R² ' + scores[r].toFixed(2) : '') + '</text>';
          if (r <= round) range(n).forEach(i => { b += '<rect class="' + (folds[i] === r ? 'cell-test' : 'cell-train') + '" x="' + (110 + i * cell + 2) + '" y="' + y + '" width="' + (cell - 4) + '" height="26" rx="3"/>'; });
        }
        q(el, 'plot').innerHTML = svg(W, H, 'Cross-validation rounds', b) + C.legend([{ label: 'Rows the model learns from', cls: 'cell-train', shape: 'square' }, { label: 'Hidden rows it is tested on', cls: 'cell-test', shape: 'square' }]);
        const avg = scores.length ? E.mean(scores) : null;
        q(el, 'read').innerHTML = round < 0 ? 'Twenty rows of data. Press <b>Next round</b> to hide 4 of them, train on the other 16, and test on the hidden 4.'
          : round < 4 ? 'Round ' + (round + 1) + ': the model learned from the grey rows and scored <b>R² ' + scores[round].toFixed(2) + '</b> on the yellow rows it never saw.'
            : 'Every row has been tested exactly once. The cross-validated score is the average: <b>R² ' + avg.toFixed(2) + '</b>. That is the number the agent puts on its leaderboard.';
      };
      q(el, 'next').onclick = () => {
        if (round >= 4) return;
        round++;
        const tr = range(n).filter(i => folds[i] !== round), te = range(n).filter(i => folds[i] === round);
        const m = E.fitRidgeCore(tr.map(i => [xs[i]]), tr.map(i => ys[i]), 1e-8);
        const pr = m.predict(te.map(i => [xs[i]]));
        scores[round] = E.regressionMetrics(te.map(i => ys[i]), pr).r2;
        draw();
      };
      q(el, 'reset').onclick = () => { round = -1; scores.length = 0; draw(); };
      draw();
    },
    steps: ['Split the rows into 5 groups (folds).', 'Train on 4 folds, test on the 5th.', 'Rotate so every fold is the test once.', 'Average the 5 test scores. With very small data the agent uses leave-one-out: every row is its own fold.'],
    when: 'Always. It is the honest way to compare models.',
    watch: 'If the data has a time order and the future differs from the past, even cross-validation can be optimistic.',
    where: 'The model leaderboard shows cross-validated scores only.',
    quiz: { q: 'A model scores R² 0.98 on its training rows but 0.40 in cross-validation. Which number should you trust?', options: ['0.98, it is higher', '0.40, it was earned on unseen rows', 'Average them: 0.69'], answer: 1, why: 'Only the cross-validated score reflects how the model does on new data. The gap means it memorized noise.' }
  });

  add({
    id: 'overfitting', group: 'Start here', title: 'Overfitting: memorizing instead of learning',
    analogy: 'A student who memorizes last year\'s answer sheet aces the practice test and fails the real one.',
    intro: 'A model that is too simple misses the pattern (underfitting). A model that is too flexible chases every wobble of noise (overfitting). The sweet spot is in between, and cross-validation is how we find it.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('deg', 'Model flexibility', 1, 12, 1, 3) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(17);
      const truth = x => Math.sin(2.6 * x) * 3 + x;
      const train = range(14).map(() => { const x = rand() * 3; return [x, truth(x) + normal(rand) * 0.9]; });
      const test = range(14).map(() => { const x = rand() * 3; return [x, truth(x) + normal(rand) * 0.9]; });
      const feats = (x, d) => range(d).map(k => Math.pow(x / 1.5 - 1, k + 1));
      const draw = () => {
        const d = Number(q(el, 'deg').value); setOut(el, 'deg', d);
        const m = E.fitRidgeCore(train.map(p => feats(p[0], d)), train.map(p => p[1]), 1e-9);
        const rmse = pts => Math.sqrt(E.mean(pts.map(p => (m.predict([feats(p[0], d)])[0] - p[1]) ** 2)));
        const tr = rmse(train), te = rmse(test);
        const f = frame(640, 300, [0, 3], [-4, 8], { xLabel: 'Setting', yLabel: 'Result' });
        const curve = range(150).map(i => { const x = i / 149 * 3; return [x, m.predict([feats(x, d)])[0]]; });
        q(el, 'plot').innerHTML = svg(640, 300, 'Model fit', f.clip + f.axes + '<g clip-path="url(#' + f.clipId + ')"><path class="curve" d="' + pathOf(curve, f) + '"/></g>' +
          train.map(p => dot(f.sx(p[0]), f.sy(p[1]), 'pt', 4.5, 'Training row')).join('') + test.map(p => dot(f.sx(p[0]), f.sy(p[1]), 'hollow', 4.5, 'Hidden test row')).join('')) +
          C.legend([{ label: 'Rows the model learns from', cls: 'pt' }, { label: 'Hidden rows', cls: 'hollow' }]);
        const verdict = d <= 1 ? 'Too simple: a straight line misses the curve. Both errors are high (underfitting).'
          : d <= 5 ? 'About right: the curve follows the real pattern, and the error on hidden rows is lowest.'
            : 'Too flexible: the curve bends to hit training rows, so training error falls, but error on hidden rows climbs. That is overfitting.';
        q(el, 'read').innerHTML = 'Error on training rows: <b>' + tr.toFixed(2) + '</b> · error on hidden rows: <b>' + te.toFixed(2) + '</b><br>' + verdict;
      };
      q(el, 'deg').oninput = draw; draw();
    },
    steps: ['Training error always falls as a model gets more flexible.', 'Error on unseen data falls, then rises again once the model starts fitting noise.', 'The agent picks the model with the best unseen-data score, and prefers the simpler one in a tie.', 'Ridge, lasso, tree depth limits and forests are all ways to rein in overfitting.'],
    when: 'Think about it whenever you have few rows and many columns.',
    watch: 'A big gap between training and cross-validated scores. The agent flags it in its findings.',
    where: 'Findings: "The winner scores X% better on data it learned from than on unseen data."',
    quiz: { q: 'You raise model flexibility and training error drops, but error on hidden rows rises. What is happening?', options: ['The model is learning the real pattern better', 'The model is overfitting: memorizing noise', 'The data has errors'], answer: 1, why: 'Falling training error with rising unseen error is the signature of overfitting.' }
  });

  add({
    id: 'scores', group: 'Start here', title: 'Reading the scores: R², error and the confusion matrix',
    analogy: 'R² is how much of the weather a forecaster explains. A confusion matrix is a smoke alarm\'s report card: false alarms versus missed fires.',
    intro: 'For numbers, R² says what share of the ups and downs the model explains, and RMSE is the typical miss in your own units. For categories, accuracy can fool you when one outcome is rare, so the agent uses balanced accuracy and shows the confusion matrix.',
    demo(el) {
      el.innerHTML = '<div class="demo-grid"><div><h4>R²: how tightly predictions hug reality</h4><div class="demo-controls">' + slider('noise', 'Noise', 0, 4, 0.1, 1) + '</div><div data-role="r2"></div></div>' +
        '<div><h4>Smoke alarm: 100 days, 10 real fires</h4><div class="demo-controls">' + slider('sens', 'Alarm sensitivity', 0, 100, 5, 50) + '</div><div data-role="cm"></div></div></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(5), base = range(40).map(() => rand() * 10), eps = range(40).map(() => normal(rand));
      const fires = range(100).map(i => i < 10), signal = range(100).map(i => (i < 10 ? 62 : 35) + normal(E.rng(i + 1)) * 13);
      const draw = () => {
        const nz = Number(q(el, 'noise').value); setOut(el, 'noise', nz.toFixed(1));
        const act = base.map((x, i) => 10 + 3 * x + eps[i] * nz * 3), pred = base.map(x => 10 + 3 * x);
        const mtr = E.regressionMetrics(act, pred);
        const f = frame(320, 260, [0, 60], [0, 60], { xLabel: 'Actual', yLabel: 'Predicted' });
        q(el, 'r2').innerHTML = svg(320, 260, 'Predicted versus actual', f.axes + '<line class="diag" x1="' + f.sx(0) + '" y1="' + f.sy(0) + '" x2="' + f.sx(60) + '" y2="' + f.sy(60) + '"/>' + act.map((a, i) => dot(f.sx(a), f.sy(pred[i]), 'dot', 4)).join('') +
          '<text class="big-num" x="60" y="40">R² ' + Math.max(0, mtr.r2).toFixed(2) + '</text><text x="60" y="58">typical miss ±' + mtr.rmse.toFixed(1) + '</text>');
        const s = Number(q(el, 'sens').value); setOut(el, 'sens', s + '%');
        const thr = 100 - s;
        let tp = 0, fn = 0, fp = 0, tn = 0;
        signal.forEach((v, i) => { const alarm = v > thr; if (fires[i]) alarm ? tp++ : fn++; else alarm ? fp++ : tn++; });
        const box = (x, y, n, label, cls) => '<rect class="cm-box ' + cls + '" x="' + x + '" y="' + y + '" width="130" height="80" rx="6"/><text class="big-num" x="' + (x + 65) + '" y="' + (y + 38) + '" text-anchor="middle">' + n + '</text><text x="' + (x + 65) + '" y="' + (y + 60) + '" text-anchor="middle">' + label + '</text>';
        q(el, 'cm').innerHTML = svg(320, 230, 'Smoke alarm confusion matrix', '<text class="lbl-strong" x="200" y="14" text-anchor="middle">Alarm said</text><text x="135" y="32" text-anchor="middle">Fire!</text><text x="270" y="32" text-anchor="middle">All clear</text>' +
          '<text x="58" y="85" text-anchor="end">Real fire</text><text x="58" y="170" text-anchor="end">No fire</text>' + box(70, 40, tp, 'caught fires', 'ok') + box(205, 40, fn, 'MISSED fires', fn ? 'bad' : '') + box(70, 125, fp, 'false alarms', fp ? 'bad' : '') + box(205, 125, tn, 'quiet, correct', 'ok'));
        const acc = (tp + tn) / 100, bal = (tp / 10 + tn / 90) / 2;
        q(el, 'read').innerHTML = '<b>Left:</b> more noise scatters the dots away from the diagonal and R² falls. ' +
          '<b>Right:</b> accuracy is <b>' + pct(acc) + '</b>, balanced accuracy is <b>' + pct(bal) + '</b>. Slide sensitivity to 0: the alarm never rings, accuracy is still 90%, yet it misses every fire. Balanced accuracy drops to 50%, exposing it. That is why the agent ranks classifiers by balanced accuracy.';
      };
      q(el, 'noise').oninput = draw; q(el, 'sens').oninput = draw; draw();
    },
    steps: ['R² = 1 means perfect predictions; 0 means no better than always guessing the average. Below 0 is worse than guessing.', 'RMSE is the typical prediction error in the target\'s own units.', 'Accuracy = share of correct calls. Misleading when one class is rare.', 'Balanced accuracy averages the hit rate of each class, so rare classes count.'],
    when: 'R² and RMSE for numbers; balanced accuracy and the confusion matrix for categories.',
    watch: 'High accuracy on imbalanced data. Always look at the missed-rare-class cell.',
    where: 'The tiles at the top of the results, the leaderboard and the confusion matrix.',
    quiz: { q: '95% of your batches pass. A model that always says "Pass" has what accuracy?', options: ['50%', '95%', '0%'], answer: 1, why: 'It is right 95% of the time while catching zero failures. Its balanced accuracy is only 50%.' }
  });

  add({
    id: 'linear', group: 'Predicting numbers and categories', title: 'Linear regression: the recipe',
    analogy: 'A recipe card: every extra spoon of sugar adds the same sweetness, no matter what else is in the bowl.',
    intro: 'Linear regression draws the straight line (or flat surface, with many inputs) that sits as close as possible to all the points. It gives each input one number: how much the result changes per unit of that input.',
    demo(el) {
      el.innerHTML = '<div data-role="plot"></div><div class="demo-controls">' + btn('outlier', 'Add an odd point', 'ghost') + btn('reset', 'Reset', 'ghost') + '</div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(21); let pts;
      const reset = () => { pts = range(25).map(() => { const x = rand() * 10; return [x, 3 + 0.8 * x + normal(rand) * 0.8]; }); };
      const draw = () => {
        const m = E.fitRidgeCore(pts.map(p => [p[0]]), pts.map(p => p[1]), 1e-9);
        const f = frame(640, 300, [0, 10], [0, 14], { xLabel: 'Input (for example pressure)', yLabel: 'Result' });
        q(el, 'plot').innerHTML = svg(640, 300, 'Linear regression', f.axes + pts.map(p => '<line class="resid" x1="' + f.sx(p[0]) + '" y1="' + f.sy(p[1]) + '" x2="' + f.sx(p[0]) + '" y2="' + f.sy(m.predict([[p[0]]])[0]) + '"/>').join('') +
          '<path class="curve" d="' + pathOf([[0, m.b0], [10, m.b0 + 10 * m.w[0]]], f) + '"/>' + pts.map(p => dot(f.sx(p[0]), f.sy(p[1]), 'pt', 4.5, 'Input ' + fmt(p[0]) + ', result ' + fmt(p[1]))).join(''));
        q(el, 'read').innerHTML = 'Recipe: start at <b>' + m.b0.toFixed(2) + '</b>, then every +1 in the input adds <b>' + m.w[0].toFixed(2) + '</b>. The red dashes are the misses; the line is placed to make their squared total as small as possible. Add an odd point to see one bad row tilt the whole line.';
      };
      q(el, 'outlier').onclick = () => { pts.push([9 + rand(), 1 + rand()]); draw(); };
      q(el, 'reset').onclick = () => { reset(); draw(); };
      reset(); draw();
    },
    steps: ['Find the line that minimizes the total squared distance to the points.', 'Each input gets a slope: the change in the result per unit of that input.', 'With many inputs, each slope is "with the other inputs held still".', 'Categories become yes/no columns, each compared with the most common category.'],
    when: 'When effects are roughly straight-line and you want the easiest model to explain.',
    watch: 'Curves and sweet spots, outliers that drag the line, and inputs that move together.',
    where: 'If a linear model wins, "Peek inside the model" shows its recipe.',
    quiz: { q: 'A linear model gives Pressure a slope of +0.5 for Yield. What does that mean?', options: ['Pressure explains 50% of Yield', 'Each +1 unit of pressure adds about 0.5 to Yield, other inputs unchanged', 'Pressure must be raised by 50%'], answer: 1, why: 'A slope is the change in the result per unit of the input, holding the others still.' }
  });

  add({
    id: 'ridge-lasso', group: 'Predicting numbers and categories', title: 'Ridge and lasso: recipes with a seat belt',
    analogy: 'Ridge is a seat belt that stops the recipe from over-reacting. Lasso is an editor who crosses out the ingredients that do not matter: the vital few versus the trivial many.',
    intro: 'When there are many inputs, or inputs that move together, a plain linear model can give wild slopes. Ridge shrinks every slope a little toward zero. Lasso shrinks too, but pushes useless slopes all the way to zero.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('pen', 'Penalty strength', 0, 10, 1, 0) + '</div><div class="demo-grid"><div><h4>Ridge: every slope shrinks</h4><div data-role="ridge"></div></div><div><h4>Lasso: useless slopes drop to zero</h4><div data-role="lasso"></div></div></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(33), n = 40;
      const names = ['Real driver A', 'Real driver B', 'Copy of A', 'Noise 1', 'Noise 2', 'Noise 3', 'Noise 4'];
      const X = range(n).map(() => { const a = normal(rand), b = normal(rand); return [a, b, a + normal(rand) * 0.15, normal(rand), normal(rand), normal(rand), normal(rand)]; });
      const y = X.map(r => 3 * r[0] - 2 * r[1] + normal(rand) * 1.2);
      const draw = () => {
        const s = Number(q(el, 'pen').value); setOut(el, 'pen', s);
        const rw = E.fitRidgeCore(X, y, s === 0 ? 1e-8 : Math.pow(2, s) * 2).w;
        const lw = E.fitLasso(X, y, s * 0.12, 400).w;
        const bars = w => w.map((v, i) => ({ label: names[i], value: v, text: v.toFixed(2), cls: Math.abs(v) < 1e-6 ? '' : 'hi' }));
        C.hbar(q(el, 'ridge'), bars(rw), { min: -4, max: 4, label: 'Ridge slopes' });
        C.hbar(q(el, 'lasso'), bars(lw), { min: -4, max: 4, label: 'Lasso slopes' });
        const zeros = lw.filter(v => Math.abs(v) < 1e-6).length;
        q(el, 'read').innerHTML = s === 0 ? 'No penalty: notice how "Real driver A" and its near-copy share the credit in odd ways, and the noise columns get small non-zero slopes.'
          : 'Ridge pulls all slopes toward zero but keeps every input. Lasso has switched off <b>' + zeros + ' of 7</b> inputs. The real drivers A and B survive longest. Too much penalty and even they shrink away.';
      };
      q(el, 'pen').oninput = draw; draw();
    },
    steps: ['Both add a penalty for large slopes to the usual "minimize the misses".', 'Ridge: penalty on squared slopes, so everything shrinks smoothly.', 'Lasso: penalty on absolute slopes, so small ones snap to exactly zero.', 'The agent tunes the penalty with an inner cross-validation.'],
    when: 'Many inputs, few rows, or inputs that move together (multicollinearity).',
    watch: 'When two inputs are near copies, lasso keeps one somewhat at random. Domain knowledge decides which is real.',
    where: 'Ridge and lasso appear on the leaderboard for every regression.',
    quiz: { q: 'Which method can tell you "these 5 columns do not matter at all"?', options: ['Ridge', 'Lasso', 'Neither'], answer: 1, why: 'Lasso drives unhelpful slopes to exactly zero, which acts as automatic factor screening.' }
  });

  add({
    id: 'quadratic', group: 'Predicting numbers and categories', title: 'Quadratic models: finding the sweet spot',
    analogy: 'Baking: too cold and the cake is raw, too hot and it burns. The best result is in the middle.',
    intro: 'Real processes often have an optimum inside the range: temperature, speed, concentration. A quadratic model adds squared terms (curves) and cross terms (interactions). It is the response-surface model used in DOE.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls"><label><input type="checkbox" data-role="lin" checked> Straight line</label><label><input type="checkbox" data-role="quad" checked> Curve (quadratic)</label></div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(41);
      const pts = range(30).map(() => { const x = 20 + rand() * 80; return [x, 80 - 0.025 * (x - 62) ** 2 + normal(rand) * 2.5]; });
      const lin = E.fitRidgeCore(pts.map(p => [p[0]]), pts.map(p => p[1]), 1e-8);
      const quad = E.fitRidgeCore(pts.map(p => [p[0], p[0] * p[0]]), pts.map(p => p[1]), 1e-8);
      const vx = -quad.w[0] / (2 * quad.w[1]), vy = quad.predict([[vx, vx * vx]])[0];
      const draw = () => {
        const f = frame(640, 300, [15, 105], [20, 90], { xLabel: 'Oven temperature', yLabel: 'Quality score' });
        let b = f.axes;
        if (q(el, 'lin').checked) b += '<path class="curve alt" d="' + pathOf([[15, lin.predict([[15]])[0]], [105, lin.predict([[105]])[0]]], f) + '"/>';
        if (q(el, 'quad').checked) {
          b += '<path class="curve" d="' + pathOf(range(100).map(i => { const x = 15 + i * 0.9; return [x, quad.predict([[x, x * x]])[0]]; }), f) + '"/>';
          b += '<line class="ref" x1="' + f.sx(vx) + '" x2="' + f.sx(vx) + '" y1="' + f.sy(20) + '" y2="' + f.sy(vy) + '"/><text class="lbl-strong" x="' + (f.sx(vx) + 6) + '" y="' + (f.sy(vy) - 8) + '">Sweet spot ≈ ' + vx.toFixed(0) + '</text>';
        }
        b += pts.map(p => dot(f.sx(p[0]), f.sy(p[1]), 'pt', 4.5)).join('');
        q(el, 'plot').innerHTML = svg(640, 300, 'Linear versus quadratic fit', b);
        const r2l = E.regressionMetrics(pts.map(p => p[1]), lin.predict(pts.map(p => [p[0]]))).r2;
        const r2q = E.regressionMetrics(pts.map(p => p[1]), quad.predict(pts.map(p => [p[0], p[0] * p[0]]))).r2;
        q(el, 'read').innerHTML = 'Straight line R² <b>' + r2l.toFixed(2) + '</b> versus curve R² <b>' + r2q.toFixed(2) + '</b>. The straight line says "temperature barely matters", which is wrong: it matters a lot, just not in one direction. The curve finds the best temperature at about <b>' + vx.toFixed(0) + '</b>.';
      };
      q(el, 'lin').onchange = draw; q(el, 'quad').onchange = draw; draw();
    },
    steps: ['Add each input squared, so the model can bend.', 'Add each pair of inputs multiplied, so it can capture interactions.', 'Fit like linear regression, with a little ridge penalty for stability.', 'The top of the curve is the sweet spot.'],
    when: 'When you suspect an optimum inside the range, or after a DOE shows curvature.',
    watch: 'Never trust the curve outside the data. Curves shoot off quickly beyond the tested range.',
    where: 'The "Quadratic (curves + interactions)" model, and "Target" actions in the action plan.',
    quiz: { q: 'A straight-line model says temperature has almost no effect, but a quadratic fits much better. What is the likely story?', options: ['Temperature does not matter', 'There is a sweet spot: both too low and too high are bad', 'The data is broken'], answer: 1, why: 'A hump-shaped relationship averages out to a flat line, hiding a strong effect with an optimum in the middle.' }
  });

  add({
    id: 'logistic', group: 'Predicting numbers and categories', title: 'Logistic regression: scoring the odds',
    analogy: 'A credit score: points for each factor add up, and the total maps to a chance of default.',
    intro: 'For yes/no outcomes, logistic regression adds up weighted inputs like a linear model, then squeezes the total through an S-shaped curve so the answer is a probability between 0% and 100%.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('x', 'Hold time (hours)', 0, 24, 0.5, 12) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(51);
      const pts = range(60).map(() => { const x = rand() * 24; const p = 1 / (1 + Math.exp(-(x - 13) * 0.55)); return [x, rand() < p ? 1 : 0]; });
      let a = 0, b = 0;
      for (let it = 0; it < 4000; it++) { let ga = 0, gb = 0; pts.forEach(([x, y]) => { const p = 1 / (1 + Math.exp(-(a + b * x))); ga += p - y; gb += (p - y) * x; }); a -= 0.05 * ga / 60; b -= 0.01 * gb / 60; }
      const P = x => 1 / (1 + Math.exp(-(a + b * x)));
      const draw = () => {
        const x = Number(q(el, 'x').value); setOut(el, 'x', x);
        const f = frame(640, 300, [0, 24], [-0.08, 1.08], { xLabel: 'Hold time (hours)', yLabel: 'Chance of failure', yFmt: v => pct(v) });
        const jit = i => ((i * 37) % 11 - 5) / 100;
        q(el, 'plot').innerHTML = svg(640, 300, 'Logistic curve', f.axes + '<line class="diag" x1="' + f.sx(0) + '" x2="' + f.sx(24) + '" y1="' + f.sy(0.5) + '" y2="' + f.sy(0.5) + '"/>' +
          pts.map((p, i) => dot(f.sx(p[0]), f.sy(p[1] + jit(i)), p[1] ? 'c2' : 'c1', 4, null, p[1] ? 'square' : 'circle')).join('') +
          '<path class="curve" d="' + pathOf(range(100).map(i => [i * 0.24, P(i * 0.24)]), f) + '"/><line class="ref" x1="' + f.sx(x) + '" x2="' + f.sx(x) + '" y1="' + f.sy(0) + '" y2="' + f.sy(P(x)) + '"/>' + dot(f.sx(x), f.sy(P(x)), 'query', 7)) +
          C.legend([{ label: 'Passed (bottom)', cls: 'c1' }, { label: 'Failed (top)', cls: 'c2', shape: 'square' }]);
        q(el, 'read').innerHTML = 'At <b>' + x + ' hours</b> the model gives a <b>' + pct(P(x)) + '</b> chance of failure, so it predicts <b>' + (P(x) >= 0.5 ? 'Fail' : 'Pass') + '</b> (50% cut-off, dashed line). Each extra hour multiplies the odds of failure by about <b>' + Math.exp(b).toFixed(2) + '</b>.';
      };
      q(el, 'x').oninput = draw; draw();
    },
    steps: ['Add up weighted inputs into a score.', 'Turn the score into a probability with an S-curve.', 'Predict the class with the highest probability.', 'Each weight says how much an input shifts the odds.'],
    when: 'Yes/no or few-category outcomes where you want an explainable model.',
    watch: 'Like linear models, it assumes effects push steadily in one direction.',
    where: 'Leaderboard for classification, and the probability bars in the what-if simulator.',
    quiz: { q: 'What does logistic regression output before the final yes/no call?', options: ['A probability between 0% and 100%', 'A straight line', 'A list of groups'], answer: 0, why: 'The S-curve turns the weighted score into a probability; the class is then the most likely one.' }
  });

  add({
    id: 'naive-bayes', group: 'Predicting numbers and categories', title: 'Naive Bayes: matching the profile',
    analogy: 'A detective with a profile of each suspect group: "people in this group are usually this tall and this old." Who does the new person resemble most?',
    intro: 'Naive Bayes learns what each class typically looks like (a bell curve per input), then for a new row asks which class profile it fits best. It is "naive" because it treats inputs as independent, which is rarely true but often works well.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('x', 'Measured pH', 3, 10, 0.1, 6.2) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const g = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
      const draw = () => {
        const x = Number(q(el, 'x').value); setOut(el, 'x', x.toFixed(1));
        const f = frame(640, 280, [3, 10], [0, 0.45], { xLabel: 'pH', yLabel: 'How typical', yFmt: () => '' });
        const xs = range(141).map(i => 3 + i * 0.05);
        const pa = g(x, 7, 0.7), pb = g(x, 5.2, 0.9), post = pa / (pa + pb);
        q(el, 'plot').innerHTML = svg(640, 280, 'Class profiles', f.axes + '<path class="curve" d="' + pathOf(xs.map(v => [v, g(v, 7, 0.7)]), f) + '"/><path class="curve alt" d="' + pathOf(xs.map(v => [v, g(v, 5.2, 0.9)]), f) + '"/>' +
          '<line class="ref" x1="' + f.sx(x) + '" x2="' + f.sx(x) + '" y1="' + f.sy(0) + '" y2="' + f.sy(0.45) + '"/>' + dot(f.sx(x), f.sy(pa), 'pt', 6) + dot(f.sx(x), f.sy(pb), 'pt s2', 6, null, 'square')) +
          C.legend([{ label: 'Profile of passing batches', cls: 'pt' }, { label: 'Profile of failing batches', cls: 'pt s2', shape: 'square' }]);
        q(el, 'read').innerHTML = 'At pH <b>' + x.toFixed(1) + '</b> the batch looks <b>' + (pa / pb).toFixed(1) + '×</b> as typical of a pass as of a fail, so the chance of passing is <b>' + pct(post) + '</b>. With more inputs, Naive Bayes multiplies these "how typical" scores together.';
      };
      q(el, 'x').oninput = draw; draw();
    },
    steps: ['For each class, learn the average and spread of each input.', 'For a new row, score how typical it is of each class.', 'Multiply the scores across inputs (treating them as independent).', 'Pick the class with the highest score.'],
    when: 'Small data, many inputs, or as a fast benchmark.',
    watch: 'Strongly linked inputs get double-counted, so probabilities can be over-confident.',
    where: 'Leaderboard for classification problems.',
    quiz: { q: 'Why is it called "naive"?', options: ['It only works on small data', 'It assumes the inputs do not influence each other', 'It ignores the target'], answer: 1, why: 'It treats every input as independent, a simplification that is often good enough.' }
  });

  add({
    id: 'knn', group: 'Predicting numbers and categories', title: 'k-Nearest neighbours: ask the neighbours',
    analogy: 'Pricing a house by looking at the five most similar houses that sold nearby.',
    intro: 'kNN does not build a formula at all. To predict a new row it finds the k most similar past rows and takes their majority vote (or average). Click anywhere on the chart to drop a new batch.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('k', 'Neighbours (k)', 1, 15, 2, 5) + '</div><div data-role="plot"></div>' + passLegend + '<p class="demo-read" data-role="read"></p>';
      const d = passFail(90, 7);
      let qx = 205, qy = 50;
      const draw = () => {
        const k = Number(q(el, 'k').value); setOut(el, 'k', k);
        const f = frame(640, 340, PF_X, PF_Y, { xLabel: 'Temperature', yLabel: 'Humidity' });
        const dist = d.X.map((p, i) => [((p[0] - qx) / 100) ** 2 + ((p[1] - qy) / 60) ** 2, i]).sort((a, b) => a[0] - b[0]).slice(0, k);
        const votes = dist.reduce((s, v) => s + d.y[v[1]], 0);
        q(el, 'plot').innerHTML = svg(640, 340, 'k nearest neighbours', f.axes + dist.map(v => '<line class="nbr" x1="' + f.sx(qx) + '" y1="' + f.sy(qy) + '" x2="' + f.sx(d.X[v[1]][0]) + '" y2="' + f.sy(d.X[v[1]][1]) + '"/>').join('') + pfPoints(f, d) + dot(f.sx(qx), f.sy(qy), 'query', 8) + '<rect class="hit" x="0" y="0" width="640" height="340"/>');
        q(el, 'read').innerHTML = '<b>' + votes + ' of ' + k + '</b> nearest neighbours passed, so kNN predicts <b>' + (votes * 2 > k ? 'Pass' : votes * 2 === k ? 'a tie' : 'Fail') + '</b> for the yellow batch (temperature ' + fmt(qx) + ', humidity ' + fmt(qy) + '). Click elsewhere to move it. Small k follows local quirks; large k smooths them out.';
        const s = q(el, 'plot').querySelector('svg');
        s.onclick = e => { const [px, py] = svgPoint(s, e); const v = f.inv(px, py); qx = Math.max(150, Math.min(250, v[0])); qy = Math.max(20, Math.min(80, v[1])); draw(); };
      };
      q(el, 'k').oninput = draw; draw();
    },
    steps: ['Put every input on the same scale.', 'Measure the distance from the new row to every past row.', 'Take the k closest.', 'Vote (classification) or average (regression).'],
    when: 'When similar conditions really do give similar results, and the data is not huge.',
    watch: 'Irrelevant columns distort "similar". It gets slow with very large data.',
    where: 'Leaderboard for both regression and classification.',
    quiz: { q: 'With k = 1, kNN copies the single closest row. What is the risk?', options: ['It is too slow', 'One noisy or mislabelled row decides the prediction', 'It cannot handle numbers'], answer: 1, why: 'k = 1 trusts one neighbour completely, so noise passes straight through. Larger k averages it out.' }
  });

  add({
    id: 'tree', group: 'Predicting numbers and categories', title: 'Decision tree: the troubleshooting flowchart',
    analogy: 'A game of 20 questions, or the troubleshooting chart on the side of a machine: "Is the light red? Yes → check the fuse."',
    intro: 'A decision tree asks a series of yes/no questions about the inputs. Each question is chosen to split the rows into the purest possible groups. Grow the tree one level at a time and watch the map on the left get carved into boxes. Click the map to send a batch down the tree.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('depth', 'Tree depth (questions asked)', 1, 5, 1, 2) + '</div><div class="demo-grid"><div><h4>The map the tree draws</h4><div data-role="map"></div>' + passLegend + '</div><div><h4>The tree itself</h4><div class="table-scroll" data-role="tree"></div></div></div><p class="demo-read" data-role="read"></p>';
      const d = passFail(120, 3);
      let probe = [205, 45];
      const draw = () => {
        const depth = Number(q(el, 'depth').value); setOut(el, 'depth', depth);
        const tree = E.buildTree(d.X, d.y, range(d.X.length), { maxDepth: depth, minLeaf: 3, nClasses: 2 }, E.rng(1), 0);
        const f = frame(360, 300, PF_X, PF_Y, { xLabel: 'Temperature', yLabel: 'Humidity' });
        const regions = treeRegions(tree, [150, 250, 20, 80], []);
        const acc = E.mean(d.X.map((r, i) => ((E.treePredictRow(tree, r)[1] >= 0.5 ? 1 : 0) === d.y[i] ? 1 : 0)));
        const path = pathTo(tree, probe);
        q(el, 'map').innerHTML = svg(360, 300, 'Tree regions', f.axes + regions.map(r => '<rect class="region-' + (r.p >= 0.5 ? 'c1' : 'c2') + '" fill-opacity="0.16" x="' + f.sx(r.b[0]) + '" y="' + f.sy(r.b[3]) + '" width="' + (f.sx(r.b[1]) - f.sx(r.b[0])) + '" height="' + (f.sy(r.b[2]) - f.sy(r.b[3])) + '"/>').join('') +
          pfPoints(f, d) + dot(f.sx(probe[0]), f.sy(probe[1]), 'query', 8) + '<rect class="hit" x="0" y="0" width="360" height="300"/>');
        C.treeDiagram(q(el, 'tree'), tree, { question: pfQuestion, leaf: pfLeaf, leafClass: pfLeafClass, path: path.set, colW: 112, label: 'Decision tree' });
        q(el, 'read').innerHTML = 'Depth <b>' + depth + '</b>: the tree gets <b>' + pct(acc) + '</b> of these rows right. The yellow batch follows the highlighted path and lands in a <b>' + (path.leaf.value[1] >= 0.5 ? 'Pass' : 'Fail') + '</b> box. ' +
          (depth >= 4 ? 'Deep trees start carving tiny boxes around single noisy points: overfitting.' : 'Each extra level lets the tree draw finer boxes.');
        const s = q(el, 'map').querySelector('svg');
        s.onclick = e => { const [px, py] = svgPoint(s, e); const v = f.inv(px, py); probe = [Math.max(150, Math.min(250, v[0])), Math.max(20, Math.min(80, v[1]))]; draw(); };
      };
      q(el, 'depth').oninput = draw; draw();
    },
    steps: ['Try every input and every cut point.', 'Pick the question that splits the rows into the purest two groups.', 'Repeat inside each group until the tree is deep enough or groups get too small.', 'A new row answers the questions top to bottom and gets the result of the box it lands in.'],
    when: 'When you want rules people can read and act on, or when effects have thresholds.',
    watch: 'A single tree is unstable: a few changed rows can change the whole tree. Deep trees overfit.',
    where: '"Peek inside the model" shows a 3-question tree trained on your data.',
    quiz: { q: 'What does each box at the bottom of a decision tree hold?', options: ['A question', 'The predicted result for rows that end there', 'The raw data'], answer: 1, why: 'Leaves (rounded boxes) give the prediction: the average result or the most common class of the rows that reach them.' }
  });

  add({
    id: 'forest', group: 'Predicting numbers and categories', title: 'Random forest: the wisdom of the crowd',
    analogy: 'Asking 60 experienced operators separately and going with the majority. Each has blind spots, but their mistakes rarely line up.',
    intro: 'A random forest grows many decision trees. Each tree sees a random sample of the rows and, at each question, a random subset of the inputs. So the trees differ. The forest takes a vote. Click the map to send one batch through all five trees below.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + btn('grow', 'Grow a new forest', 'primary') + '</div><div class="demo-grid"><div><h4>One tree on its own</h4><div data-role="one"></div></div><div><h4>The forest\'s vote (darker = more trees agree)</h4><div data-role="map"></div></div></div>' + passLegend +
        '<h4>The five trees: pick one to see the path the yellow batch takes through it</h4><div data-role="trees"></div><p class="demo-read" data-role="read"></p>';
      const d = passFail(120, 3);
      let probe = [205, 45], seed = 1, trees = [], cur = 0;
      const grow = () => {
        const rand = E.rng(seed++);
        trees = range(5).map(() => { const idx = range(d.X.length).map(() => Math.floor(rand() * d.X.length)); return E.buildTree(d.X, d.y, idx, { maxDepth: 3, minLeaf: 2, nClasses: 2, mtry: 1 }, rand, 0); });
      };
      const single = E.buildTree(d.X, d.y, range(d.X.length), { maxDepth: 3, minLeaf: 2, nClasses: 2 }, E.rng(1), 0);
      const mapSvg = (fn, label) => {
        const f = frame(320, 270, PF_X, PF_Y, { xLabel: 'Temperature', yLabel: 'Humidity' });
        let b = f.axes;
        const nx = 30, ny = 22;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const x0 = 150 + 100 * i / nx, x1 = 150 + 100 * (i + 1) / nx, y0 = 20 + 60 * j / ny, y1 = 20 + 60 * (j + 1) / ny;
          const p = fn([(x0 + x1) / 2, (y0 + y1) / 2]);
          // Snap cell edges to whole units so neighbouring cells share edges exactly (no seams).
          const rx = Math.round(f.sx(x0)), ry = Math.round(f.sy(y1));
          b += '<rect class="region-' + (p >= 0.5 ? 'c1' : 'c2') + '" fill-opacity="' + (0.05 + 0.3 * Math.abs(p - 0.5) * 2).toFixed(2) + '" x="' + rx + '" y="' + ry + '" width="' + (Math.round(f.sx(x1)) - rx) + '" height="' + (Math.round(f.sy(y0)) - ry) + '" shape-rendering="crispEdges"/>';
        }
        return { f, html: svg(320, 270, label, b + pfPoints(f, d) + dot(f.sx(probe[0]), f.sy(probe[1]), 'query', 8) + '<rect class="hit" x="0" y="0" width="320" height="270"/>') };
      };
      const vote = r => E.mean(trees.map(t => (E.treePredictRow(t, r)[1] >= 0.5 ? 1 : 0)));
      const draw = () => {
        const one = mapSvg(r => E.treePredictRow(single, r)[1], 'Single tree map');
        const forest = mapSvg(vote, 'Forest vote map');
        q(el, 'one').innerHTML = one.html; q(el, 'map').innerHTML = forest.html;
        const votes = trees.map(t => pathTo(t, probe));
        const yes = votes.filter(v => v.leaf.value[1] >= 0.5).length;
        const box = q(el, 'trees');
        box.innerHTML = '<div class="tree-tabs" role="tablist">' + votes.map((v, i) => '<button type="button" role="tab" aria-selected="' + (i === cur) + '" class="btn ' + (i === cur ? 'primary' : 'ghost') + '" data-tree="' + i + '">Tree ' + (i + 1) + ': <span class="' + (v.leaf.value[1] >= 0.5 ? 'pass' : 'fail') + '">' + (v.leaf.value[1] >= 0.5 ? 'Pass' : 'Fail') + '</span></button>').join('') + '</div><div class="table-scroll" data-role="one-tree"></div>';
        C.treeDiagram(q(box, 'one-tree'), trees[cur], { question: pfQuestion, leaf: pfLeaf, leafClass: pfLeafClass, path: votes[cur].set, colW: 116, label: 'Tree ' + (cur + 1) });
        box.querySelectorAll('[data-tree]').forEach(b => { b.onclick = () => { cur = Number(b.getAttribute('data-tree')); draw(); }; });
        q(el, 'read').innerHTML = '<b>' + yes + ' of 5</b> trees vote Pass, so the forest says <b>' + (yes >= 3 ? 'Pass' : 'Fail') + '</b> with ' + pct(Math.max(yes, 5 - yes) / 5) + ' agreement. Compare the two maps: the single tree draws hard, blocky edges; the forest\'s vote is smoother and shows where it is unsure (pale areas). The agent\'s forest uses 60 trees, not 5.';
        [one, forest].forEach((m, k) => { const s = q(el, k ? 'map' : 'one').querySelector('svg'); s.onclick = e => { const [px, py] = svgPoint(s, e); const v = m.f.inv(px, py); probe = [Math.max(150, Math.min(250, v[0])), Math.max(20, Math.min(80, v[1]))]; draw(); }; });
      };
      q(el, 'grow').onclick = () => { grow(); draw(); };
      grow(); draw();
    },
    steps: ['Draw a random sample of rows (with repeats) for each tree.', 'At every question, let the tree consider only a random few inputs.', 'Grow many such trees; they will disagree in different places.', 'Average or vote. Random errors cancel; the real pattern adds up.'],
    when: 'A strong default for messy, non-linear data with interactions.',
    watch: 'Harder to explain than one tree, so use the driver chart and "how each driver moves the result" to interpret it.',
    where: 'If a forest wins, "Peek inside the model" shows three of its real trees.',
    quiz: { q: 'Why does a random forest usually beat a single decision tree?', options: ['Its trees are deeper', 'Averaging many different trees cancels out their individual mistakes', 'It uses more columns'], answer: 1, why: 'Each tree errs in different places; the vote keeps what they agree on, which is the real pattern.' }
  });

  add({
    id: 'boosting', group: 'Predicting numbers and categories', title: 'Gradient boosting: continuous improvement',
    analogy: 'Golf: the first shot gets you near the green, each next shot corrects what is left. Or a kaizen loop: every cycle closes part of the remaining gap.',
    intro: 'Boosting builds small trees one after another. The first makes a rough guess. Each next tree is trained only on what is still wrong (the leftover errors), and adds a small correction. Slide the rounds to watch the fit improve.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('m', 'Rounds (trees added)', 0, 80, 1, 0) + '</div><div class="demo-grid"><div><h4>The model\'s prediction</h4><div data-role="fit"></div></div><div><h4>Remaining error after each round</h4><div data-role="err"></div></div></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(61), n = 70;
      const X = range(n).map(() => [rand() * 10]), y = X.map(r => Math.sin(r[0]) * 3 + r[0] * 0.4 + normal(rand) * 0.5);
      const grid = range(120).map(i => [i / 119 * 10]);
      const f0 = E.mean(y), F = y.map(() => f0), G = grid.map(() => f0);
      const fits = [G.slice()], errs = [Math.sqrt(E.mean(y.map((v, i) => (v - F[i]) ** 2)))];
      for (let m = 0; m < 80; m++) {
        const r = y.map((v, i) => v - F[i]);
        const t = E.buildTree(X, r, range(n), { maxDepth: 2, minLeaf: 4, nClasses: 0 }, rand, 0);
        X.forEach((row, i) => { F[i] += 0.3 * E.treePredictRow(t, row); });
        grid.forEach((row, i) => { G[i] += 0.3 * E.treePredictRow(t, row); });
        fits.push(G.slice()); errs.push(Math.sqrt(E.mean(y.map((v, i) => (v - F[i]) ** 2))));
      }
      const draw = () => {
        const m = Number(q(el, 'm').value); setOut(el, 'm', m);
        const f = frame(330, 260, [0, 10], [-4, 8], { xLabel: 'Setting', yLabel: 'Result' });
        q(el, 'fit').innerHTML = svg(330, 260, 'Boosting fit', f.axes + X.map((r, i) => dot(f.sx(r[0]), f.sy(y[i]), 'dot', 3.5)).join('') + '<path class="curve good" d="' + pathOf(grid.map((g, i) => [g[0], fits[m][i]]), f) + '"/>');
        const fe = frame(330, 260, [0, 80], [0, Math.ceil(errs[0])], { xLabel: 'Round', yLabel: 'Typical error' });
        q(el, 'err').innerHTML = svg(330, 260, 'Error by round', fe.axes + '<path class="curve" d="' + pathOf(errs.map((e, i) => [i, e]), fe) + '"/>' + dot(fe.sx(m), fe.sy(errs[m]), 'query', 6));
        q(el, 'read').innerHTML = m === 0 ? 'Round 0: the model just guesses the average, a flat line. Start sliding.'
          : 'After <b>' + m + '</b> small trees, the typical error is down from ' + errs[0].toFixed(2) + ' to <b>' + errs[m].toFixed(2) + '</b>. Early rounds fix big misses; later rounds polish. Too many rounds would start fitting noise, so the agent keeps the corrections small (a learning rate) and checks with cross-validation.';
      };
      q(el, 'm').oninput = draw; draw();
    },
    steps: ['Start with a simple guess (the average).', 'Measure what is still wrong for every row.', 'Fit a small tree to those leftovers and add a fraction of it.', 'Repeat 100 times. Each round closes part of the gap.'],
    when: 'Often the most accurate model on tabular data with non-linear effects.',
    watch: 'Least explainable on its own. Lean on the driver and "how each driver moves" charts.',
    where: 'If boosting wins, "Peek inside the model" shows its first three correction trees.',
    quiz: { q: 'What does each new tree in gradient boosting learn?', options: ['The original target, from scratch', 'The errors the previous trees still make', 'A random subset of columns only'], answer: 1, why: 'Each tree targets the remaining errors, so the chain keeps correcting itself.' }
  });

  add({
    id: 'neural-network', group: 'Predicting numbers and categories', title: 'Neural networks: watch one learn',
    analogy: 'A team of specialists passing notes forward. The first layer spots simple clues, the next combines clues into patterns, and the last makes the call. Training is the team adjusting how much they trust each note.',
    intro: 'A neural network is layers of simple units. Each unit adds up its weighted inputs and passes a signal on if the total is positive. Stack two layers and the network can bend its boundary into curves and islands that a straight line cannot draw. Pick a pattern and press Train.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + ['circle', 'moons', 'xor'].map((k, i) => btn('d-' + k, { circle: 'Circle', moons: 'Two moons', xor: 'Checkerboard (XOR)' }[k], i ? 'ghost' : 'primary')).join('') +
        slider('h', 'Units per hidden layer', 2, 16, 1, 8) + btn('go', 'Train', 'primary') + btn('reset', 'Reset', 'ghost') + '</div>' +
        '<div class="demo-grid"><div><h4>What the network thinks (shading = its confidence)</h4><div data-role="map"></div>' + passLegend + '</div><div><h4>The network: blue connections push up, orange push down</h4><div data-role="net"></div><h4>Error while learning</h4><div data-role="loss"></div></div></div><p class="demo-read" data-role="read"></p>';
      let kind = 'circle', tr = null, data = null, running = false, raf = 0;
      const make = () => {
        const rand = E.rng(17), X = [], y = [];
        for (let i = 0; i < 220; i++) {
          let a, b, c;
          if (kind === 'circle') { a = rand() * 4 - 2; b = rand() * 4 - 2; c = a * a + b * b < 1.4 ? 1 : 0; }
          else if (kind === 'xor') { a = rand() * 4 - 2; b = rand() * 4 - 2; c = (a > 0) === (b > 0) ? 1 : 0; }
          else { const t = rand() * Math.PI, up = rand() < 0.5; a = up ? Math.cos(t) * 1.4 - 0.5 : 0.9 - Math.cos(t) * 1.4; b = up ? Math.sin(t) * 1.4 - 0.4 : 0.4 - Math.sin(t) * 1.4; c = up ? 1 : 0; a += normal(rand) * 0.15; b += normal(rand) * 0.15; }
          X.push([a, b]); y.push(c);
        }
        return { X, y };
      };
      const restart = () => {
        cancelAnimationFrame(raf); running = false; q(el, 'go').textContent = 'Train';
        const h = Number(q(el, 'h').value); setOut(el, 'h', h);
        data = make();
        tr = E.mlpTrainer(data.X, data.y, { task: 'classification', nClasses: 2, rand: E.rng(5) }, { h1: h, h2: h, maxEpochs: 400, patience: 400, lr: 0.01, l2: 0 });
        draw();
      };
      const draw = () => {
        const f = frame(330, 290, [-2.2, 2.2], [-2.2, 2.2], { xLabel: 'Input 1', yLabel: 'Input 2' });
        const nx = 34, ny = 30, cells = [];
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([-2.2 + 4.4 * (i + 0.5) / nx, -2.2 + 4.4 * (j + 0.5) / ny]);
        const pr = tr.peek(cells);
        let b = f.axes;
        cells.forEach((c, k) => {
          const p1 = pr[k][1], x0 = Math.round(f.sx(c[0] - 2.2 / nx)), y0 = Math.round(f.sy(c[1] + 2.2 / ny));
          b += '<rect class="region-' + (p1 >= 0.5 ? 'c1' : 'c2') + '" fill-opacity="' + (0.06 + 0.4 * Math.abs(p1 - 0.5)).toFixed(2) + '" x="' + x0 + '" y="' + y0 + '" width="' + (Math.round(f.sx(c[0] + 2.2 / nx)) - x0) + '" height="' + (Math.round(f.sy(c[1] - 2.2 / ny)) - y0) + '" shape-rendering="crispEdges"/>';
        });
        b += data.X.map((p, i) => dot(f.sx(p[0]), f.sy(p[1]), data.y[i] ? 'c1' : 'c2', 3.5, null, data.y[i] ? 'circle' : 'square')).join('');
        q(el, 'map').innerHTML = svg(330, 290, 'Network decision map', b);
        // Network diagram with live weights.
        const wts = tr.weights(), sizes = tr.sizes, W = 330, H = 200, xs = c => 30 + c * (W - 60) / (sizes.length - 1), ys = (c, i) => H / 2 + (i - (sizes[c] - 1) / 2) * Math.min(22, (H - 30) / sizes[c]);
        let maxw = 1e-9; wts.W.forEach(w => w.forEach(v => { maxw = Math.max(maxw, Math.abs(v)); }));
        let n = '';
        for (let l = 0; l < sizes.length - 1; l++) for (let j = 0; j < sizes[l + 1]; j++) for (let i = 0; i < sizes[l]; i++) {
          const v = wts.W[l][j * sizes[l] + i];
          n += '<line class="nn-edge ' + (v >= 0 ? 'pos' : 'neg') + '" stroke-opacity="' + (0.15 + 0.85 * Math.abs(v) / maxw).toFixed(2) + '" stroke-width="' + (0.5 + 3 * Math.abs(v) / maxw).toFixed(2) + '" x1="' + xs(l) + '" y1="' + ys(l, i) + '" x2="' + xs(l + 1) + '" y2="' + ys(l + 1, j) + '"/>';
        }
        sizes.forEach((sz, c) => { for (let i = 0; i < sz; i++) n += '<circle class="nn-node' + (c === 0 ? ' in' : c === sizes.length - 1 ? ' out' : '') + '" cx="' + xs(c) + '" cy="' + ys(c, i) + '" r="6"/>'; });
        q(el, 'net').innerHTML = svg(W, H, 'Network diagram', n);
        const hist = tr.history;
        if (hist.length > 1) {
          const fl = frame(330, 150, [1, Math.max(10, hist.length)], [0, Math.max(0.8, ...hist.map(e => e.train))], { xLabel: 'Epoch', yFmt: v => v.toFixed(1) });
          q(el, 'loss').innerHTML = svg(330, 150, 'Training error', fl.axes + '<path class="curve" d="' + pathOf(hist.map(e => [e.epoch, e.train]), fl) + '"/>');
        } else q(el, 'loss').innerHTML = '<p class="hint">Press Train to start.</p>';
        const acc = E.mean(tr.peek(data.X).map((o, i) => ((o[1] >= 0.5 ? 1 : 0) === data.y[i] ? 1 : 0)));
        q(el, 'read').innerHTML = 'Epoch <b>' + hist.length + '</b> · accuracy <b>' + pct(acc) + '</b>. ' + (hist.length === 0 ? 'Before training the weights are random, so the map is a guess.' :
          acc > 0.95 ? 'It has bent its boundary to fit the pattern. Try fewer units: with 2 per layer it often cannot draw the shape.' : 'Watch the shading reshape as the connections strengthen.');
      };
      const loop = () => { if (!running) return; const fin = tr.step(2); draw(); if (fin) { running = false; q(el, 'go').textContent = 'Train'; return; } raf = requestAnimationFrame(loop); };
      q(el, 'go').onclick = () => { running = !running; q(el, 'go').textContent = running ? 'Pause' : 'Train'; if (running) raf = requestAnimationFrame(loop); };
      q(el, 'reset').onclick = restart;
      q(el, 'h').oninput = restart;
      ['circle', 'moons', 'xor'].forEach(k => { q(el, 'd-' + k).onclick = () => { kind = k; el.querySelectorAll('[data-role^="d-"]').forEach(b => { b.className = 'btn ' + (b.getAttribute('data-role') === 'd-' + k ? 'primary' : 'ghost'); }); restart(); }; });
      restart();
    },
    steps: ['Each unit computes a weighted sum of its inputs plus a bias, then keeps it only if positive (ReLU).', 'Two hidden layers let the network combine simple cuts into curves and islands.', 'Training nudges every weight a little to reduce the error (backpropagation with the Adam optimizer), one batch at a time.', 'ML Agent holds back 15% of rows and stops when their error stops improving (early stopping), keeping the best version.'],
    when: 'Tangled, curved patterns with enough rows (hundreds or more), where trees and straight lines fall short.',
    watch: 'Needs more data than simple models, is hard to explain, and can overfit small tables. On many business tables boosting or a forest does as well with less fuss, and the agent will tell you when.',
    where: 'The "Neural network (MLP)" row on the leaderboard, the live learning curve while the agent runs, and the "Neural network: how it learned" card.',
    quiz: { q: 'Why does the agent stop training when the error on held-back rows stops improving?', options: ['To save battery', 'Further training would start memorizing noise (overfitting)', 'Because the network is full'], answer: 1, why: 'Learning-row error keeps falling, but once held-back error plateaus, extra epochs only fit noise.' }
  });

  add({
    id: 'kmeans', group: 'Finding patterns', title: 'k-means: finding natural groups',
    analogy: 'Placing k warehouses so every store is as close as possible to its nearest one. Move the warehouses, reassign the stores, repeat.',
    intro: 'k-means has no answer key. It drops k centers, assigns every row to the nearest center, moves each center to the middle of its rows, and repeats until nothing changes. Step through it.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('k', 'Number of groups (k)', 2, 5, 1, 3) + btn('step', 'Next step', 'primary') + btn('run', 'Run to the end', 'ghost') + btn('restart', 'New random start', 'ghost') + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(71), pts = [];
      [[2, 2.5], [7.5, 2], [5, 7.5]].forEach(c => { for (let i = 0; i < 30; i++) pts.push([c[0] + normal(rand) * 0.9, c[1] + normal(rand) * 0.9]); });
      let centers, labels, phase, stepN, seed = 3;
      const restart = () => {
        const r = E.rng(seed++), k = Number(q(el, 'k').value); setOut(el, 'k', k);
        centers = range(k).map(() => [0.5 + r() * 9, 0.5 + r() * 9]);
        labels = null; phase = 'assign'; stepN = 0;
      };
      const inertia = () => labels ? pts.reduce((s, p, i) => s + (p[0] - centers[labels[i]][0]) ** 2 + (p[1] - centers[labels[i]][1]) ** 2, 0) : null;
      const step = () => {
        stepN++;
        if (phase === 'assign') {
          const nl = pts.map(p => { let b = 0; centers.forEach((c, j) => { if ((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 < (p[0] - centers[b][0]) ** 2 + (p[1] - centers[b][1]) ** 2) b = j; }); return b; });
          const changed = !labels || nl.some((v, i) => v !== labels[i]);
          labels = nl; phase = 'move';
          return changed;
        }
        centers = centers.map((c, j) => { const m = pts.filter((_, i) => labels[i] === j); return m.length ? [E.mean(m.map(p => p[0])), E.mean(m.map(p => p[1]))] : c; });
        phase = 'assign';
        return true;
      };
      const draw = msg => {
        const f = frame(640, 340, [-1, 11], [-1, 11], { noAxes: true, l: 10, b: 10 });
        q(el, 'plot').innerHTML = svg(640, 340, 'k-means steps', pts.map((p, i) => labels ? dot(f.sx(p[0]), f.sy(p[1]), 'c' + (labels[i] + 1), 5, null, C.SHAPES[labels[i]]) : dot(f.sx(p[0]), f.sy(p[1]), 'hollow', 5)).join('') +
          centers.map((c, j) => '<g><circle class="c' + (j + 1) + '" cx="' + f.sx(c[0]) + '" cy="' + f.sy(c[1]) + '" r="13" fill-opacity=".35"/><path class="center-mark" d="M' + (f.sx(c[0]) - 9) + ' ' + f.sy(c[1]) + 'h18M' + f.sx(c[0]) + ' ' + (f.sy(c[1]) - 9) + 'v18"/></g>').join(''));
        q(el, 'read').innerHTML = msg || 'The crosses are ' + centers.length + ' random starting centers. Press <b>Next step</b>.';
      };
      q(el, 'step').onclick = () => {
        const wasAssign = phase === 'assign';
        const changed = step();
        draw(wasAssign ? (changed ? 'Step ' + stepN + ': every point joins its <b>nearest</b> center. Total distance: ' + inertia().toFixed(1) + '.' : 'Step ' + stepN + ': no point changed group. <b>Done.</b> These are the groups.')
          : 'Step ' + stepN + ': each center moves to the <b>middle</b> of its points.');
      };
      q(el, 'run').onclick = () => { for (let i = 0; i < 60; i++) { const a = phase === 'assign'; const ch = step(); if (a && !ch) break; } draw('Finished. Total distance ' + inertia().toFixed(1) + '. Try "New random start" or a different k: with the wrong k, groups get merged or split oddly. The agent tries k = 2 to 6 and picks the clearest split.'); };
      q(el, 'restart').onclick = () => { restart(); draw(); };
      q(el, 'k').oninput = () => { restart(); draw(); };
      restart(); draw();
    },
    steps: ['Pick k starting centers (the agent uses a smart spread-out start and 5 tries).', 'Assign every row to its nearest center.', 'Move each center to the average of its rows.', 'Repeat until no row changes group. Then name the groups with people who know the process.'],
    when: 'Segmenting customers, products, lots or machines when there is no outcome column.',
    watch: 'Columns must be on comparable scales (the agent standardizes them). k-means likes round, similar-sized groups.',
    where: 'Unsupervised results: groups chart, silhouette chart and group profiles.',
    quiz: { q: 'What are the two steps k-means repeats?', options: ['Split and prune', 'Assign rows to the nearest center, then move centers to the middle of their rows', 'Vote and average'], answer: 1, why: 'Assign, then update, until nothing changes.' }
  });

  add({
    id: 'pca', group: 'Finding patterns', title: 'PCA: the most informative angle',
    analogy: 'Photographing a 3D object from the angle that shows the most. Or a shadow: flatten something into fewer dimensions but keep its shape.',
    intro: 'When there are many columns, PCA finds the directions in which the rows spread out the most. The first direction (component) captures the most variation, the second the next most, and so on. Plotting the first two gives a map of the whole dataset.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls"><label><input type="checkbox" data-role="flat"> Flatten onto the main direction</label></div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(81);
      const pts = range(80).map(() => { const a = normal(rand) * 2, b = normal(rand) * 0.6; return [5 + a * 0.8 - b * 0.6, 5 + a * 0.6 + b * 0.8]; });
      const pc = E.pca(pts), mx = E.mean(pts.map(p => p[0])), my = E.mean(pts.map(p => p[1]));
      const v1 = pc.loadings[0], v2 = pc.loadings[1];
      const draw = () => {
        const flat = q(el, 'flat').checked;
        const f = frame(640, 340, [0, 10], [0, 10], { xLabel: 'Column 1', yLabel: 'Column 2' });
        let b = f.axes;
        const l1 = Math.sqrt(pc.explained[0]) * 4.5, l2 = Math.sqrt(pc.explained[1]) * 4.5;
        b += '<line class="arrow" x1="' + f.sx(mx - v1[0] * l1) + '" y1="' + f.sy(my - v1[1] * l1) + '" x2="' + f.sx(mx + v1[0] * l1) + '" y2="' + f.sy(my + v1[1] * l1) + '"/>';
        b += '<line class="arrow second" x1="' + f.sx(mx - v2[0] * l2) + '" y1="' + f.sy(my - v2[1] * l2) + '" x2="' + f.sx(mx + v2[0] * l2) + '" y2="' + f.sy(my + v2[1] * l2) + '"/>';
        pts.forEach(p => {
          const s = (p[0] - mx) * v1[0] + (p[1] - my) * v1[1], px = mx + s * v1[0], py = my + s * v1[1];
          if (flat) b += '<line class="proj" x1="' + f.sx(p[0]) + '" y1="' + f.sy(p[1]) + '" x2="' + f.sx(px) + '" y2="' + f.sy(py) + '"/>' + dot(f.sx(px), f.sy(py), 'pt', 4);
          else b += dot(f.sx(p[0]), f.sy(p[1]), 'pt', 4);
        });
        q(el, 'plot').innerHTML = svg(640, 340, 'PCA directions', b) + C.legend([{ label: 'Main direction (component 1)', cls: 'arrow-key', shape: 'square' }, { label: 'Second direction', cls: 'c6', shape: 'square' }]);
        q(el, 'read').innerHTML = 'The red line is the direction of greatest spread. It alone captures <b>' + pct(pc.explained[0]) + '</b> of the variation. ' + (flat ? 'Flattened onto it, the points keep almost all their story with one number instead of two.' : 'Tick the box to flatten the points onto it.') + ' With 20 columns, PCA does the same: two components can often show most of the picture.';
      };
      q(el, 'flat').onchange = draw; draw();
    },
    steps: ['Standardize the columns.', 'Find the direction of greatest spread: component 1.', 'Find the next one at right angles: component 2.', 'Plot every row on those two directions.'],
    when: 'To see many-column data on one chart, and to spot groups and outliers.',
    watch: 'Components are blends of columns, so they do not have simple names.',
    where: 'The "Groups in the data" scatter in unsupervised results.',
    quiz: { q: 'PCA component 1 captures 85% of the variation. What does that tell you?', options: ['85% of rows are correct', 'One blended direction tells most of the story of how rows differ', 'The model is 85% accurate'], answer: 1, why: 'Explained variation is about how rows spread out, not accuracy.' }
  });

  add({
    id: 'why-doe', group: 'Design of experiments', title: 'Why DOE: correlation is not causation',
    analogy: 'Ice-cream sales and sunburns rise together, but banning ice cream will not prevent sunburn. The sun drives both.',
    intro: 'Historical data shows what moves together. A hidden driver can make two things look linked. In a designed experiment you set the factors yourself, in a balanced pattern and a random order, so hidden drivers cannot ride along. That is how you prove cause and effect.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls"><label><input type="checkbox" data-role="reveal"> Reveal the hidden driver (daily temperature)</label></div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const rand = E.rng(91);
      const days = range(60).map(() => { const t = 10 + rand() * 25; return { t, ice: 20 + t * 4 + normal(rand) * 12, burn: t * 0.6 + normal(rand) * 2.5 }; });
      const r = E.pearson(days.map(d => d.ice), days.map(d => d.burn));
      const draw = () => {
        const rev = q(el, 'reveal').checked;
        const f = frame(640, 320, [40, 170], [0, 25], { xLabel: 'Ice-cream sales', yLabel: 'Sunburn cases' });
        q(el, 'plot').innerHTML = svg(640, 320, 'Spurious correlation', f.axes + days.map(d => dot(f.sx(d.ice), f.sy(d.burn), rev ? (d.t < 18 ? 'heat1' : d.t < 26 ? 'heat2' : 'heat3') : 'dot', 5, 'Temperature ' + d.t.toFixed(0) + '°C')).join('')) +
          (rev ? C.legend([{ label: 'Cool days', cls: 'heat1' }, { label: 'Mild days', cls: 'heat2' }, { label: 'Hot days', cls: 'heat3' }]) : '');
        q(el, 'read').innerHTML = 'Correlation r = <b>' + r.toFixed(2) + '</b>: a strong link. ' + (rev ? 'Coloured by temperature, the truth appears: hot days drive both. In your plant, the "temperature" might be a raw-material lot, a shift or the season.' : 'Does ice cream cause sunburn? Tick the box.');
      };
      q(el, 'reveal').onchange = draw; draw();
    },
    steps: ['Machine learning on history finds candidate drivers fast.', 'But inputs in history move together, and hidden factors lurk.', 'A DOE sets each factor high or low on purpose, independently of the others.', 'Random run order spreads any hidden drift evenly, so it cannot fake an effect.'],
    when: 'Before you change a standard based on what historical data suggests.',
    watch: '"The data says X drives Y" from history alone. Always ask what else changed at the same time.',
    where: 'The agent pre-fills the DOE builder with the drivers it found, so you can confirm them.',
    quiz: { q: 'Historical data shows higher line speed goes with fewer defects. What is the safest next step?', options: ['Raise line speed everywhere', 'Run a designed experiment varying speed on purpose', 'Ignore it'], answer: 1, why: 'Maybe the newest machines are both faster and better. A DOE separates the real cause.' }
  });

  add({
    id: 'factorial', group: 'Design of experiments', title: 'Factorial designs and main effects',
    analogy: 'Testing every combination of settings, like trying every combination of oven temperature, time and recipe, then comparing the averages.',
    intro: 'A 2-level full factorial runs every combination of low and high for each factor. With 3 factors that is 2 × 2 × 2 = 8 runs: the corners of a cube. The main effect of a factor is the average result on its high side minus the average on its low side. Pick a factor to see it.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + ['Temperature', 'Time', 'Catalyst'].map((n, i) => btn('f' + i, 'Effect of ' + n, i ? 'ghost' : 'primary')).join('') + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const runs = D.fullFactorial(3).map(x => ({ x, y: 60 + 6 * x[0] + 1 * x[1] + 3.5 * x[2] + 2 * x[0] * x[2] }));
      const names = ['Temperature', 'Time', 'Catalyst'], lv = [['150°', '180°'], ['30 min', '60 min'], ['A', 'B']];
      let sel = 0;
      const pos = x => [220 + x[0] * 120 + x[1] * 60, 128 - x[2] * 72 - x[1] * 36];
      const draw = () => {
        el.querySelectorAll('[data-role^="f"]').forEach((b, i) => { b.className = 'btn ' + (i === sel ? 'primary' : 'ghost'); });
        let b = '';
        const edges = [];
        runs.forEach((r, i) => runs.forEach((s, j) => { if (j > i && r.x.filter((v, k) => v !== s.x[k]).length === 1) edges.push([pos(r.x), pos(s.x)]); }));
        b += edges.map(e => '<line class="edge" x1="' + e[0][0] + '" y1="' + e[0][1] + '" x2="' + e[1][0] + '" y2="' + e[1][1] + '"/>').join('');
        runs.forEach(r => { const [px, py] = pos(r.x); b += '<g data-tip="' + h(names.map((n, k) => n + ' ' + lv[k][r.x[k] > 0 ? 1 : 0]).join(', ') + '\nYield ' + fmt(r.y)) + '"><circle class="corner ' + (r.x[sel] > 0 ? 'hi' : 'lo') + '" cx="' + px + '" cy="' + py + '" r="20"/><text class="cm-text inv" x="' + px + '" y="' + (py + 4) + '" text-anchor="middle">' + fmt(r.y) + '</text></g>'; });
        b += '<text x="170" y="262" class="lbl-strong">Temperature →</text><text x="12" y="132" class="lbl-strong">Catalyst ↑</text><text x="440" y="40" class="lbl-strong">↗ Time</text>';
        q(el, 'plot').innerHTML = svg(560, 270, '2 to the 3 factorial cube', b) + C.legend([{ label: names[sel] + ' high', cls: 'corner hi' }, { label: names[sel] + ' low', cls: 'corner lo' }]);
        const hi = runs.filter(r => r.x[sel] > 0).map(r => r.y), lo = runs.filter(r => r.x[sel] < 0).map(r => r.y);
        q(el, 'read').innerHTML = 'Average with ' + names[sel] + ' high: (' + hi.map(fmt).join(' + ') + ') ÷ 4 = <b>' + fmt(E.mean(hi)) + '</b><br>Average with ' + names[sel] + ' low: (' + lo.map(fmt).join(' + ') + ') ÷ 4 = <b>' + fmt(E.mean(lo)) + '</b><br>Main effect of ' + names[sel] + ' = <b>' + fmt(E.mean(hi) - E.mean(lo)) + '</b>. Every one of the 8 runs is used for every factor\'s estimate: that is the efficiency of a factorial.';
      };
      [0, 1, 2].forEach(i => { q(el, 'f' + i).onclick = () => { sel = i; draw(); }; });
      draw();
    },
    steps: ['Choose factors and a low and high level for each.', 'Run every combination (2^k runs), in random order.', 'Main effect = average at high − average at low.', 'Interaction effects come from the same runs (next lesson).'],
    when: '2 to 4 factors. With more, use a fraction or a screening design.',
    watch: 'Choose levels far enough apart to see an effect, but within safe limits.',
    where: 'DOE builder: "Full factorial". Results: effects table and main effects plots.',
    quiz: { q: 'How many runs does a 2-level full factorial with 4 factors need (before center points)?', options: ['8', '16', '4'], answer: 1, why: '2 × 2 × 2 × 2 = 16.' }
  });

  add({
    id: 'interactions', group: 'Design of experiments', title: 'Interactions: when factors team up',
    analogy: 'Fertilizer only helps if there is enough water. Salt and sugar each change the taste, and together they change it differently.',
    intro: 'An interaction means the effect of one factor depends on the level of another. On an interaction plot, parallel lines mean no interaction; lines that spread or cross mean the factors work together. One-factor-at-a-time testing misses this entirely.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('s', 'Interaction strength', -1, 1, 0.1, 0) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const draw = () => {
        const s = Number(q(el, 's').value); setOut(el, 's', s.toFixed(1));
        const y = (f, w) => 20 + 3 * f + 2 * w + 6 * s * f * w;
        C.lines(q(el, 'plot'), [-1, 1].map((w, i) => ({ name: 'Water ' + (w > 0 ? 'high' : 'low'), cls: i ? 's2' : '', points: [-1, 1].map(f => ({ x: f, y: y(f, w), tip: 'Fertilizer ' + (f > 0 ? 'high' : 'low') + ', water ' + (w > 0 ? 'high' : 'low') + ': growth ' + fmt(y(f, w)) })) })),
          { yDomain: [0, 42], xLabel: 'Fertilizer', yLabel: 'Growth', xTickFmt: v => (v > 0 ? 'High' : 'Low'), label: 'Interaction plot' });
        q(el, 'plot').insertAdjacentHTML('beforeend', C.legend([{ label: 'Water low', cls: 'pt' }, { label: 'Water high', cls: 'pt s2' }]));
        const effLow = y(1, -1) - y(-1, -1), effHigh = y(1, 1) - y(-1, 1);
        q(el, 'read').innerHTML = 'Fertilizer adds <b>' + fmt(effLow) + '</b> with low water and <b>' + fmt(effHigh) + '</b> with high water. ' +
          (Math.abs(s) < 0.05 ? 'Same effect either way: parallel lines, no interaction.' : Math.abs(effLow) < 0.5 || Math.sign(effLow) !== Math.sign(effHigh) ? 'The effect flips or vanishes depending on water: a strong interaction. Testing fertilizer alone could give the wrong answer.' : 'The lines are not parallel: the factors interact, so set them together.');
      };
      q(el, 's').oninput = draw; draw();
    },
    steps: ['In a factorial, multiply the coded levels (−1/+1) of two factors to get an interaction column.', 'Its effect is estimated just like a main effect.', 'Plot: one line per level of the second factor.', 'Significant interaction → choose the two settings as a pair.'],
    when: 'Whenever two factors plausibly affect each other (temperature and time, speed and feed).',
    watch: 'If an interaction is strong, a main effect on its own can mislead.',
    where: 'DOE results: "strongest interaction" plot and "Combine" actions in the action plan.',
    quiz: { q: 'On an interaction plot, the two lines are parallel. What does that mean?', options: ['A strong interaction', 'No interaction: each factor acts on its own', 'The experiment failed'], answer: 1, why: 'Parallel lines mean the effect of one factor is the same at both levels of the other.' }
  });

  add({
    id: 'significance', group: 'Design of experiments', title: 'Pareto chart and p-values: signal versus noise',
    analogy: 'Listening for voices on a crackly radio. The p-value asks: if nobody were talking, how often would static sound this loud?',
    intro: 'Every experiment has noise, so every estimated effect wobbles. The Pareto chart ranks effects by how far they stand out from the noise (|t|). Bars past the red line have p < 0.05: noise alone would produce an effect that big less than 5% of the time.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('noise', 'Process noise', 0.5, 8, 0.5, 2) + btn('again', 'Run the experiment again', 'primary') + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const names = ['Temperature', 'Pressure', 'Speed', 'Material', 'Operator', 'Humidity'], truth = [8, 5, 2, 0, 0, 0];
      let seed = 1;
      const draw = () => {
        const nz = Number(q(el, 'noise').value); setOut(el, 'noise', nz);
        const rand = E.rng(seed), se = nz / 2;
        const est = truth.map(t => t + normal(rand) * se);
        const tc = 2.26;
        const items = est.map((e, i) => ({ label: names[i] + (truth[i] ? ' (real)' : ' (no effect)'), value: Math.abs(e / se), text: Math.abs(e / se).toFixed(1), cls: Math.abs(e / se) > tc ? 'hi' : '' })).sort((a, b) => b.value - a.value);
        C.hbar(q(el, 'plot'), items, { min: 0, ref: { value: tc }, label: 'Pareto of effects' });
        const found = est.filter((e, i) => truth[i] && Math.abs(e / se) > tc).length, fake = est.filter((e, i) => !truth[i] && Math.abs(e / se) > tc).length;
        q(el, 'read').innerHTML = 'Three factors truly matter (8, 5 and 2 units). This run detected <b>' + found + ' of 3</b>' + (fake ? ' and raised <b>' + fake + ' false alarm' + (fake > 1 ? 's' : '') + '</b>' : '') + '. Raise the noise and the small real effect (Speed) sinks below the line. The cure: reduce noise, widen the factor levels, or add replicates.';
      };
      q(el, 'noise').oninput = draw; q(el, 'again').onclick = () => { seed++; draw(); };
      draw();
    },
    steps: ['Estimate each effect from the runs.', 'Estimate the noise from replicates or center points (or Lenth\'s method when there are none).', 't = effect ÷ its standard error; the p-value comes from t.', 'p < 0.05 → treat as real. Look at the size too: real but tiny may not be worth acting on.'],
    when: 'Reading any DOE result.',
    watch: 'p > 0.05 does not prove "no effect"; it may mean too much noise. And with many effects, about 1 in 20 can cross the line by luck.',
    where: 'DOE results: Pareto chart and effects table.',
    quiz: { q: 'An effect has p = 0.30. What is the best reading?', options: ['It definitely has no effect', 'The data cannot separate it from noise; it may be absent or too small to see', 'It is 30% important'], answer: 1, why: 'A high p-value means "not proven", not "proven absent".' }
  });

  add({
    id: 'designs', group: 'Design of experiments', title: 'Which design? The shapes of experiments',
    analogy: 'Choosing a map: a quick sketch to find the right neighbourhood (screening), then a detailed street map to find the exact house (response surface).',
    intro: 'Each design is a pattern of points in the factor space. Screening designs use few runs to find the vital few factors. Factorials measure effects and interactions. Response-surface designs add points so you can see curves and find the optimum.',
    demo(el) {
      const kinds = [['full2', 'Full factorial, 2 factors'], ['full3', 'Full factorial, 3 factors'], ['half', 'Half fraction'], ['center', 'With center points'], ['ccd', 'Central composite'], ['bbd', 'Box-Behnken'], ['pb', 'Plackett-Burman']];
      el.innerHTML = '<div class="demo-controls">' + kinds.map((k, i) => btn(k[0], k[1], i ? 'ghost' : 'primary')).join('') + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const info = {
        full2: ['4 runs', 'Every combination of 2 factors. Measures both main effects and their interaction.'],
        full3: ['8 runs', 'The corners of a cube. All main effects and interactions for 3 factors.'],
        half: ['4 runs instead of 8', 'Half of the cube\'s corners, chosen so main effects stay clear. Some interactions get mixed (aliased) with main effects. Good for screening 4 to 6 factors.'],
        center: ['8 + 3 runs', 'Center points (all factors in the middle) check whether the response curves, and give a cheap estimate of noise.'],
        ccd: ['2 factors: 4 + 4 + 3 runs', 'Corners, plus "star" points beyond the edges, plus center points. Fits curves in every direction to find the sweet spot.'],
        bbd: ['3 factors: 12 + 3 runs', 'Points at the middle of each cube edge, plus centers. Never runs all factors at extremes at once: good when corners are unsafe.'],
        pb: ['12 runs for up to 11 factors', 'A screening table of + and − settings. Each column is balanced against every other. Finds the vital few factors cheaply.']
      };
      let sel = 'full2';
      const draw = () => {
        el.querySelectorAll('.demo-controls .btn').forEach(b => { b.className = 'btn ' + (b.getAttribute('data-role') === sel ? 'primary' : 'ghost'); });
        let b = '';
        const sq = (x, y, s) => [[x - s, y + s], [x + s, y + s], [x + s, y - s], [x - s, y - s]];
        const cube = (x, y) => { const p = []; for (const c of D.fullFactorial(3)) p.push([x + c[0] * 80 + c[1] * 40, y - c[2] * 80 - c[1] * 35, c]); return p; };
        const cubeEdges = pts => pts.map((a, i) => pts.map((c, j) => (j > i && a[2].filter((v, k) => v !== c[2][k]).length === 1 ? '<line class="edge" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + c[0] + '" y2="' + c[1] + '"/>' : '')).join('')).join('');
        if (sel === 'pb') {
          const rows = D.plackettBurman(11);
          q(el, 'plot').innerHTML = '<div class="table-scroll"><table class="pm"><thead><tr><th>Run</th>' + range(11).map(i => '<th>F' + (i + 1) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map(v => '<td class="' + (v > 0 ? 'p' : 'm') + '">' + (v > 0 ? '+' : '−') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
        } else {
          if (sel === 'full2' || sel === 'ccd') {
            const pts = sq(280, 120, 70);
            b += '<rect class="edge" x="210" y="50" width="140" height="140"/>' + pts.map(p => '<circle class="corner hi" cx="' + p[0] + '" cy="' + p[1] + '" r="10"/>').join('');
            if (sel === 'ccd') {
              const a = 70 * 1.414;
              b += '<circle class="edge" cx="280" cy="120" r="' + a + '" stroke-dasharray="4 4"/>' + [[280 - a, 120], [280 + a, 120], [280, 120 - a], [280, 120 + a]].map(p => '<circle class="corner star" cx="' + p[0] + '" cy="' + p[1] + '" r="10"/>').join('') + '<circle class="corner mid" cx="280" cy="120" r="10"/>';
            }
          } else {
            const pts = cube(250, 128);
            b += cubeEdges(pts);
            if (sel === 'bbd') {
              pts.forEach((a, i) => pts.forEach((c, j) => { if (j > i && a[2].filter((v, k) => v !== c[2][k]).length === 1) b += '<circle class="corner star" cx="' + (a[0] + c[0]) / 2 + '" cy="' + (a[1] + c[1]) / 2 + '" r="9"/>'; }));
              b += '<circle class="corner mid" cx="250" cy="128" r="9"/>';
            } else {
              pts.forEach(p => { const on = sel !== 'half' || p[2][0] * p[2][1] * p[2][2] > 0; b += '<circle class="corner ' + (on ? 'hi' : '') + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (on ? 10 : 6) + '"/>'; });
              if (sel === 'center') b += '<circle class="corner mid" cx="250" cy="128" r="10"/>';
            }
          }
          q(el, 'plot').innerHTML = svg(560, 250, 'Design shape', b) + C.legend([{ label: 'Factorial (corner) runs', cls: 'corner hi' }, { label: 'Star or edge runs', cls: 'corner star' }, { label: 'Center points', cls: 'corner mid' }]);
        }
        q(el, 'read').innerHTML = '<b>' + info[sel][0] + '.</b> ' + info[sel][1];
      };
      kinds.forEach(k => { q(el, k[0]).onclick = () => { sel = k[0]; draw(); }; });
      draw();
    },
    steps: ['Many candidate factors (6+)? Screen with Plackett-Burman or a resolution IV fraction.', '2 to 5 important factors? Full or half factorial with center points.', 'Curvature found? Response surface: central composite, or Box-Behnken if corners are risky.', 'Always randomize the run order; replicate if noise is high.'],
    when: 'The agent recommends one automatically from the number of drivers and whether curvature showed up.',
    watch: 'Small fractions alias effects. Plan a follow-up (fold-over) if an aliased effect looks important.',
    where: 'DOE builder: design selector, run sheet and notes.',
    quiz: { q: 'You have 10 candidate factors and limited budget. Which design first?', options: ['Full factorial (1,024 runs)', 'Plackett-Burman screening (12 runs)', 'Central composite'], answer: 1, why: 'Screen first to find the vital few, then study those in detail.' }
  });

  add({
    id: 'curvature', group: 'Design of experiments', title: 'Center points and curvature',
    analogy: 'Measuring a bridge only at both ends tells you nothing about whether it sags in the middle.',
    intro: 'A 2-level design only sees the ends of each factor\'s range, so it assumes straight lines between them. Center points measure the middle. If the middle result differs from what the straight line predicts, the response curves, and the optimum may lie inside the range.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('c', 'True curvature', -8, 8, 0.5, 4) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const draw = () => {
        const c = Number(q(el, 'c').value); setOut(el, 'c', c);
        const y = x => 50 + 6 * x + c * (1 - x * x);
        const f = frame(640, 300, [-1.2, 1.2], [30, 70], { xLabel: 'Factor level (low → center → high)', yLabel: 'Result', xFmt: v => (v === -1 ? 'low' : v === 1 ? 'high' : v === 0 ? 'center' : '') });
        const line = 50, mid = y(0);
        q(el, 'plot').innerHTML = svg(640, 300, 'Curvature check', f.axes + '<path class="curve alt" d="' + pathOf([[-1, y(-1)], [1, y(1)]], f) + '"/><path class="curve" d="' + pathOf(range(61).map(i => { const x = -1.2 + i * 0.04; return [x, y(x)]; }), f) + '"/>' +
          '<line class="ref" x1="' + f.sx(0) + '" x2="' + f.sx(0) + '" y1="' + f.sy(line) + '" y2="' + f.sy(mid) + '"/>' + dot(f.sx(-1), f.sy(y(-1)), 'corner hi', 8) + dot(f.sx(1), f.sy(y(1)), 'corner hi', 8) + dot(f.sx(0), f.sy(mid), 'corner mid', 8)) +
          C.legend([{ label: 'Corner runs', cls: 'corner hi' }, { label: 'Center point', cls: 'corner mid' }, { label: 'True response', cls: 'pt', shape: 'square' }]);
        q(el, 'read').innerHTML = 'The straight line through the corners predicts <b>' + fmt(line) + '</b> at the center; the center point measures <b>' + fmt(mid) + '</b>. Gap = <b>' + fmt(mid - line) + '</b>. ' + (Math.abs(mid - line) > 2 ? 'That is curvature: a response-surface design (central composite) is the next step.' : 'Little curvature: straight-line effects describe the process well.');
      };
      q(el, 'c').oninput = draw; draw();
    },
    steps: ['Add 3 to 5 runs with every factor at its midpoint.', 'Compare their average with the average of the corner runs.', 'A clear gap means curvature: some factor has a sweet spot.', 'Center points also measure pure noise, because they are true replicates.'],
    when: 'Almost always: they are cheap insurance on any 2-level design with numeric factors.',
    watch: 'Center points show that curvature exists, but not which factor causes it. A response-surface design pins that down.',
    where: 'DOE results: "Curvature" term and the curvature finding.',
    quiz: { q: 'Center points average 72, corner runs average 65. What does this suggest?', options: ['An error in the data', 'Curvature: the best setting may be inside the range', 'No effect of any factor'], answer: 1, why: 'The middle beats the straight-line prediction, so the response bends.' }
  });

  add({
    id: 'capability', group: 'Six Sigma and process control', title: 'Process capability: Cp, Cpk and sigma level',
    analogy: 'Parking a car in a garage. Cp asks: is the car narrower than the garage? Cpk asks: is it parked in the middle, or scraping one wall?',
    intro: 'Capability compares what the customer allows (the spec limits) with what the process actually does (its spread). Move the process average and its spread below and watch the numbers. The red tails are defects.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('mu', 'Process average', 92, 108, 0.5, 103) + slider('sd', 'Process spread (std. dev.)', 0.8, 5, 0.1, 2.5) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const LSL = 90, USL = 110, T = 100;
      const draw = () => {
        const mu = Number(q(el, 'mu').value), sdv = Number(q(el, 'sd').value);
        setOut(el, 'mu', mu); setOut(el, 'sd', sdv.toFixed(1));
        const f = frame(640, 290, [80, 120], [0, 0.52], { xLabel: 'Measured value', yFmt: () => '' });
        const pdf = x => Math.exp(-((x - mu) ** 2) / (2 * sdv * sdv)) / (sdv * Math.sqrt(2 * Math.PI));
        const xs = range(241).map(i => 80 + i / 6);
        const area = (a, b) => 'M' + f.sx(a) + ' ' + f.sy(0) + xs.filter(x => x >= a && x <= b).map(x => 'L' + f.sx(x).toFixed(1) + ' ' + f.sy(pdf(x)).toFixed(1)).join('') + 'L' + f.sx(b) + ' ' + f.sy(0) + 'Z';
        let b = f.axes + '<path class="region-c2" fill-opacity=".55" d="' + area(80, LSL) + '"/><path class="region-c2" fill-opacity=".55" d="' + area(USL, 120) + '"/>';
        b += '<path class="curve" d="' + pathOf(xs.map(x => [x, pdf(x)]), f) + '"/>';
        [['LSL', LSL, 'ref'], ['USL', USL, 'ref'], ['Target', T, 'target-line']].forEach(([l, v, c]) => { b += '<line class="' + c + '" x1="' + f.sx(v) + '" x2="' + f.sx(v) + '" y1="' + f.sy(0) + '" y2="' + f.sy(0.5) + '"/><text class="lbl-strong" x="' + f.sx(v) + '" y="' + (f.sy(0.5) - 2) + '" text-anchor="middle">' + l + '</text>'; });
        q(el, 'plot').innerHTML = svg(640, 290, 'Capability demo', b);
        const S = window.MLSpc, cp = (USL - LSL) / (6 * sdv), cpk = Math.min(USL - mu, mu - LSL) / (3 * sdv);
        const pOut = S.normCdf((LSL - mu) / sdv) + 1 - S.normCdf((USL - mu) / sdv), z = Math.min(8, S.normInv(1 - Math.max(pOut, 1e-15)));
        const verdict = cpk >= 1.33 ? 'capable' : cpk >= 1 ? 'marginal' : 'not capable';
        q(el, 'read').innerHTML = 'Cp <b>' + cp.toFixed(2) + '</b> · Cpk <b>' + cpk.toFixed(2) + '</b> (' + verdict + ') · expected <b>' + fmt(pOut * 1e6, 0) + '</b> defects per million · sigma level <b>' + (z + 1.5).toFixed(1) + '</b><br>' +
          (cp - cpk > 0.2 ? 'The car fits, but it is parked off center: Cp is fine while Cpk suffers. Center the average at 100 and Cpk rises to Cp.' : cp < 1.33 ? 'Centered, but the car is too wide for the garage: only reducing the spread will make it capable.' : 'Narrow and centered: plenty of room on both sides.');
      };
      q(el, 'mu').oninput = draw; q(el, 'sd').oninput = draw; draw();
    },
    steps: ['Cp = (USL − LSL) ÷ 6σ: does the spread fit inside the spec window?', 'Cpk = distance from the average to the nearer limit ÷ 3σ: does it fit where it actually sits?', 'Cp/Cpk use short-term spread (row to row); Pp/Ppk use the overall, long-term spread.', '1.33 or more is capable; below 1.0 means a steady stream of defects. PPM and sigma level express the same thing as a defect rate.'],
    when: 'Any measured result with specification limits, on a stable process in normal production.',
    watch: 'Capability assumes the process is stable (check the control chart first) and roughly bell-shaped. A designed experiment is not normal production.',
    where: 'Six Sigma mode: the "Process capability" card and the capability tile.',
    quiz: { q: 'Cp is 1.8 but Cpk is 0.9. What is the quickest fix?', options: ['Reduce variation', 'Center the process average', 'Widen the spec limits'], answer: 1, why: 'A big gap between Cp and Cpk means the spread fits but the process is off center. Centering it raises Cpk toward Cp.' }
  });

  add({
    id: 'control-charts', group: 'Six Sigma and process control', title: 'Control charts: common cause or special cause?',
    analogy: 'Your commute: it varies a few minutes every day (common cause). A road closure is different (special cause). A control chart tells the two apart, so you do not overreact to normal noise or miss a real problem.',
    intro: 'An I-MR chart plots each value in time order with control limits at about 3 standard deviations. Inside the limits is everyday noise. Add a disruption below and watch the chart flag it.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls"><label><input type="checkbox" data-role="shift"> Process shift from point 25</label><label><input type="checkbox" data-role="spike"> One-off spike at point 12</label>' + btn('new', 'New data', 'ghost') + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      let seed = 3;
      const draw = () => {
        const rand = E.rng(seed);
        const base = range(40).map(() => 50 + normal(rand) * 1.5);
        const y = base.map((v, i) => v + (q(el, 'shift').checked && i >= 24 ? 2.2 : 0) + (q(el, 'spike').checked && i === 11 ? 7 : 0));
        // Limits from the first 20 points, as a team would set them from a stable baseline.
        const base20 = window.MLSpc.imr(y.slice(0, 20));
        const lim = { cl: base20.cl, ucl: base20.ucl, lcl: base20.lcl };
        const flags = y.map((v, i) => { const f = []; if (v > lim.ucl || v < lim.lcl) f.push('beyond limits'); return f; });
        let run = 0, side = 0;
        y.forEach((v, i) => { const sd0 = v > lim.cl ? 1 : -1; run = sd0 === side ? run + 1 : 1; side = sd0; if (run >= 8) flags[i].push('8 in a row on one side'); });
        C.controlChart(q(el, 'plot'), y, Object.assign({ flags, rowLabel: i => 'Point ' + (i + 1), yLabel: 'Value', xLabel: 'Point (time order)', label: 'Individuals chart demo' }, lim));
        const n = flags.filter(f => f.length).length;
        q(el, 'read').innerHTML = n ? '<b>' + n + ' point' + (n > 1 ? 's' : '') + ' flagged.</b> ' + (q(el, 'shift').checked ? 'A shift shows up as a long run on one side of the center line, even when no single point crosses a limit. ' : '') + (q(el, 'spike').checked ? 'A one-off spike breaks the limit: find out what happened at that moment.' : '')
          : 'No signals: the wiggle you see is common-cause noise. Reacting to it (tampering) would make the process worse. Tick a box to add a real disruption.';
      };
      q(el, 'shift').onchange = draw; q(el, 'spike').onchange = draw; q(el, 'new').onclick = () => { seed++; draw(); };
      draw();
    },
    steps: ['Plot each value in time order.', 'Center line = average; control limits = average ± 2.66 × the average moving range (about ±3σ).', 'Signals: a point beyond a limit, 8 in a row on one side, or an unusually big jump.', 'Investigate signals (special causes). Leave common-cause noise alone, and reduce it only by changing the system.'],
    when: 'Before judging capability, and in the Control phase to keep a gain from slipping.',
    watch: 'Control limits come from the process, not the spec. A process can be stable and still out of spec, or in spec and unstable.',
    where: 'Six Sigma mode: the "I-MR control chart" card (rows must be in time order).',
    quiz: { q: 'Eight points in a row sit above the center line, none beyond the limits. What does it suggest?', options: ['Nothing; all points are inside the limits', 'A shift in the process average', 'The limits are wrong'], answer: 1, why: 'A long run on one side is very unlikely by chance and signals that the average has moved.' }
  });

  add({
    id: 'taguchi', group: 'Six Sigma and process control', title: 'Taguchi: robustness, S/N ratios and quality loss',
    analogy: 'A recipe that tastes good every time, not just on a good day. Taguchi looks for settings that make the result consistent despite noise you cannot control.',
    intro: 'Two suppliers can give the same average and very different consistency. The signal-to-noise (S/N) ratio rewards both being on target and being consistent. The loss function adds that being off target costs something even inside the spec.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('noise', 'Supplier B spread', 0.5, 4, 0.1, 2.5) + slider('pos', 'One unit measures', 90, 110, 0.5, 106) + '</div><div class="demo-grid"><div><h4>Same average, different consistency</h4><div data-role="box"></div></div><div><h4>Goalpost thinking vs Taguchi loss</h4><div data-role="loss"></div></div></div><p class="demo-read" data-role="read"></p>';
      const draw = () => {
        const nz = Number(q(el, 'noise').value), pos = Number(q(el, 'pos').value);
        setOut(el, 'noise', nz.toFixed(1)); setOut(el, 'pos', pos);
        const rand = E.rng(11), a = range(40).map(() => 100 + normal(rand) * 1), bb = range(40).map(() => 100 + normal(rand) * nz);
        const S = window.MLSpc;
        C.boxplot(q(el, 'box'), [{ label: 'Supplier A', stats: S.box(a) }, { label: 'Supplier B', stats: S.box(bb) }], { lsl: 90, usl: 110, label: 'Supplier box plots' });
        const f = frame(320, 240, [88, 112], [0, 1.3], { xLabel: 'Measured value', yLabel: 'Cost of the unit', yFmt: v => (v === 1 ? 'scrap' : v === 0 ? '0' : '') });
        const tag = x => ((x - 100) / 10) ** 2;
        let b = f.axes + '<path class="curve alt" d="' + pathOf([[88, 1], [90, 1], [90, 0], [110, 0], [110, 1], [112, 1]], f) + '"/>';
        b += '<path class="curve" d="' + pathOf(range(97).map(i => { const x = 88 + i * 0.25; return [x, Math.min(1.3, tag(x))]; }), f) + '"/>' + dot(f.sx(pos), f.sy(Math.min(1.3, tag(pos))), 'query', 6);
        q(el, 'loss').innerHTML = svg(320, 240, 'Loss functions', b) + C.legend([{ label: 'Goalpost: in spec is free', cls: 'pt s2' }, { label: 'Taguchi: loss grows away from target', cls: 'pt' }]);
        const snA = S.snRatio(a, 'nominal'), snB = S.snRatio(bb, 'nominal');
        q(el, 'read').innerHTML = 'S/N (on target is best): Supplier A <b>' + snA.toFixed(1) + ' dB</b>, Supplier B <b>' + snB.toFixed(1) + ' dB</b>. Higher is more robust, so ' + (snA > snB ? 'A' : 'B') + ' wins even though both average about 100. ' +
          'The unit at <b>' + pos + '</b> is ' + (pos < 90 || pos > 110 ? 'out of spec' : 'inside spec, so goalpost thinking says it is perfect') + '; Taguchi loss puts its cost at <b>' + pct(Math.min(tag(pos), 9)) + '</b> of a scrapped unit.';
      };
      q(el, 'noise').oninput = draw; q(el, 'pos').oninput = draw; draw();
    },
    steps: ['Pick the S/N type from your goal: larger is better, smaller is better, or on target is best.', 'Compute S/N for each level of each factor. Higher S/N = more consistent.', 'Rank factors by how much their S/N changes: big ranges matter most for robustness.', 'Set robust levels for factors that barely move the average; use another factor to adjust the average onto target.'],
    when: 'When variation hurts as much as the average does, for example fit, finish, fill weight or timing.',
    watch: 'S/N needs several results per level; with very few runs, treat the ranking as a hint.',
    where: 'Six Sigma mode: "Taguchi robustness" card, box plots, and the quality-loss line in the capability table.',
    quiz: { q: 'Two settings give the same average yield. Setting A has S/N 32 dB, setting B 24 dB. Which is better?', options: ['They are equal', 'A: it is more consistent', 'B: lower noise number'], answer: 1, why: 'Higher S/N means less variation relative to the signal, so A is more robust.' }
  });

  add({
    id: 'desirability', group: 'Six Sigma and process control', title: 'Desirability: the best compromise across several results',
    analogy: 'Tuning a car for speed, fuel economy and comfort at once. Flat out wins on speed and fails on fuel. The best tune is the one where nothing fails and everything is as good as it can be together.',
    intro: 'Real processes have several results to hit at once, for example high purity and low aggregates. Pushing temperature up may raise one and wreck the other. Desirability turns each result into a 0 to 1 score (d), then combines them with a geometric mean (D). Move the temperature and the purity weight below.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('x', 'Culture temperature (°C)', 30, 40, 0.1, 33) + slider('w', 'Weight on purity', 0.5, 3, 0.5, 1) + '</div><div data-role="plot"></div><p class="demo-read" data-role="read"></p>';
      const purity = x => 97.2 - 0.22 * (x - 36.5) ** 2, hmw = x => 0.4 + 0.3 * (x - 30);
      const dP = y => Math.max(0, Math.min(1, (y - 94) / 3)), dH = y => Math.max(0, Math.min(1, (3 - y) / 2));
      const D = (x, w) => { const a = dP(purity(x)), b = dH(hmw(x)); return a <= 0 || b <= 0 ? 0 : Math.exp((w * Math.log(a) + Math.log(b)) / (w + 1)); };
      const draw = () => {
        const x = Number(q(el, 'x').value), w = Number(q(el, 'w').value);
        setOut(el, 'x', x.toFixed(1)); setOut(el, 'w', w);
        const xs = range(101).map(i => 30 + i / 10);
        const f = frame(640, 280, [30, 40], [0, 1.05], { xLabel: 'Culture temperature (°C)', yLabel: 'Desirability (0 to 1)' });
        let best = 30; xs.forEach(v => { if (D(v, w) > D(best, w)) best = v; });
        let b = f.axes + '<path class="curve d1" d="' + pathOf(xs.map(v => [v, dP(purity(v))]), f) + '"/><path class="curve alt" d="' + pathOf(xs.map(v => [v, dH(hmw(v))]), f) + '"/><path class="curve d3" d="' + pathOf(xs.map(v => [v, D(v, w)]), f) + '"/>';
        b += '<line class="target-line" x1="' + f.sx(best) + '" x2="' + f.sx(best) + '" y1="' + f.sy(0) + '" y2="' + f.sy(1.05) + '"/>' + dot(f.sx(x), f.sy(D(x, w)), 'query', 6);
        q(el, 'plot').innerHTML = svg(640, 280, 'Desirability demo', b) + C.legend([{ label: 'd purity (94% fails, 97% ideal)', cls: 'c1' }, { label: 'd aggregates HMW (3% fails, 1% ideal)', cls: 'c2' }, { label: 'Overall D', cls: 'c3' }]);
        const p = purity(x), m = hmw(x);
        q(el, 'read').innerHTML = 'At <b>' + x.toFixed(1) + ' °C</b>: purity <b>' + p.toFixed(2) + '%</b> (d ' + dP(p).toFixed(2) + '), HMW <b>' + m.toFixed(2) + '%</b> (d ' + dH(m).toFixed(2) + '), overall <b>D ' + D(x, w).toFixed(2) + '</b>. The best compromise is about <b>' + best.toFixed(1) + ' °C</b> (dashed line), not the purity peak at 36.5 °C, because aggregates climb with temperature. ' +
          (w > 1 ? 'Weighting purity more pulls the compromise toward the purity peak.' : 'Raise the purity weight and watch the compromise move.');
      };
      q(el, 'x').oninput = draw; q(el, 'w').oninput = draw; draw();
    },
    steps: ['For each result, pick a goal: maximize, minimize, or hit a target, plus where it fails and where it is fully met.', 'Each result gets its own model and a score d from 0 (fails) to 1 (ideal), a straight line in between.', 'Overall D is the weighted geometric mean of the d scores, so a single failing result makes D zero: no trade can hide a failure.', 'The agent searches the middle 90% of your settings for the highest D, then you confirm it with a few real batches.'],
    when: 'Two or more results matter at once: purity and yield, strength and weight, speed and defects.',
    watch: 'Each result model has its own error, so the combined prediction is less certain than any single one. Keep settings inside the range you have run.',
    where: 'Setup: "Optimize several results together". Results: the "Best compromise" card and every result on the what-if desk.',
    quiz: { q: 'Purity scores d = 1.0, but aggregates score d = 0. What is D?', options: ['0.5', '0', '1.0'], answer: 1, why: 'D is a geometric mean, so one failing result (d = 0) makes the whole compromise unacceptable, however good the others are.' }
  });

  add({
    id: 'codon-optimization', group: 'Optimizing with evolution', title: 'Codon optimization: evolving a gene without changing the protein',
    analogy: 'Spelling the same word in two languages. "Colour" and "color" read the same to a person, but one is what the local reader expects. The protein is the meaning; the codons are the spelling, and each host has its own preference.',
    intro: 'Most amino acids can be written with several codons, so a protein has astronomically many possible genes. A genetic algorithm breeds a population of spellings: it keeps the ones that score well, mixes them, and mutates a codon here and there. Drag through the generations below and watch a deliberately badly-spelled gene improve, one objective at a time.',
    demo(el) {
      el.innerHTML = '<div class="demo-controls">' + slider('gen', 'Generation', 0, 60, 1, 0) + btn('play', 'Play', 'primary') + '</div>' +
        '<div data-role="track"></div><p class="demo-read" data-role="read"></p><div class="cols2"><div data-role="plot"></div><div data-role="codons"></div></div>';
      const CD = window.MLCodon, GA = window.MLGa;
      // A short gene written with the codons a human cell uses least, plus an EcoRI site.
      const rnd = GA.rng(11), aas = 'ACDEFGHIKLMNPQRSTVY';
      let dna = 'ATG';
      for (let i = 0; i < 59; i++) {
        const aa = aas[Math.floor(rnd() * aas.length)];
        dna += CD.SYN[aa].slice().sort((x, y) => CD.TABLES.HEK293.usage[x] - CD.TABLES.HEK293.usage[y])[0];
      }
      dna = dna.slice(0, 15) + 'GAATTC' + dna.slice(21) + 'TAA';
      const job = { dna, host: 'HEK293', gcLow: 0.45, gcHigh: 0.55, avoid: ['EcoRI'], maxRun: 6, popSize: 30, generations: 60, seed: 3 };
      const run = GA.create(job), w = CD.relativeAdaptiveness('HEK293');
      /* Record the best sequence at every generation, then let the slider scrub through
         them. Generation 0 is the gene exactly as it was written: the starting population
         already contains improved spellings, so showing its best here would skip the point. */
      const keep = m => ({ dna: m.dna, cai: m.cai, gc: m.gc.overall, viol: m.violations, d: m.d });
      const snaps = [keep(run.state.baseline)];
      for (let g = 0; g < 60; g++) { run.step(1); snaps.push(keep(run.state.best.m)); }

      const draw = () => {
        const g = Number(q(el, 'gen').value), s = snaps[g];
        setOut(el, 'gen', g);
        // One cell per codon, shaded by how much this host likes that codon.
        const n = s.dna.length / 3, cw = 640 / n;
        let b = '';
        for (let i = 0; i < n; i++) {
          const c = s.dna.slice(i * 3, i * 3 + 3);
          const good = CD.SYN[CD.CODE[c]].length < 2 ? 1 : w[c];
          const changed = c !== dna.slice(i * 3, i * 3 + 3);
          b += '<rect x="' + (i * cw) + '" y="8" width="' + Math.max(1, cw - 1) + '" height="26" rx="2" class="' + (good > 0.8 ? 'cell-good' : good > 0.45 ? 'cell-mid' : 'cell-bad') + '"><title>' + h(c) + ' = ' + h(CD.CODE[c]) + ', host preference ' + good.toFixed(2) + '</title></rect>' +
            (changed ? '<rect x="' + (i * cw) + '" y="36" width="' + Math.max(1, cw - 1) + '" height="3" class="cell-changed"/>' : '');
        }
        q(el, 'track').innerHTML = svg(640, 46, 'Codon preference along the gene', b) +
          C.legend([{ label: 'codon this host likes', cls: 'c3', shape: 'square' }, { label: 'middling', cls: 'c4', shape: 'square' }, { label: 'rare codon', cls: 'c2', shape: 'square' }, { label: 'changed from the original', cls: 'c1', shape: 'square' }]);
        const f = frame(320, 220, [0, 60], [0, 1], { xLabel: 'Generation', yLabel: 'Overall score' });
        let p = f.axes + '<path class="curve d3" d="' + pathOf(snaps.slice(0, g + 1).map((x, i) => [i, x.d]), f) + '"/>';
        p += dot(f.sx(g), f.sy(s.d), 'query', 5);
        q(el, 'plot').innerHTML = svg(320, 220, 'Score by generation', p);
        // What the first six codons look like now, versus where they started.
        let rows = '<table class="mini"><thead><tr><th>Codon</th><th>Started</th><th>Now</th><th>Amino acid</th></tr></thead><tbody>';
        for (let i = 1; i < 7; i++) {
          const was = dna.slice(i * 3, i * 3 + 3), now = s.dna.slice(i * 3, i * 3 + 3);
          rows += '<tr><td>' + (i + 1) + '</td><td>' + h(was) + ' <span class="hint">' + w[was].toFixed(2) + '</span></td><td><b>' + h(now) + '</b> <span class="hint">' + w[now].toFixed(2) + '</span></td><td>' + h(CD.CODE[now]) + '</td></tr>';
        }
        q(el, 'codons').innerHTML = rows + '</tbody></table>';
        const first = snaps[0];
        q(el, 'read').innerHTML = 'Generation <b>' + g + '</b>: CAI <b>' + s.cai.toFixed(3) + '</b> (started ' + first.cai.toFixed(3) + '), GC <b>' + pct(s.gc) + '</b>, EcoRI sites <b>' + s.viol + '</b>, overall score <b>' + s.d.toFixed(3) + '</b>.<br>' +
          (g === 0 ? 'This is the gene as written: rare codons nearly everywhere (the red track) and an EcoRI site that has to go. Drag the slider, or press Play.'
            : s.viol === 0 && s.cai > 0.85 ? 'The protein has not changed by a single amino acid: only the spelling has. Rare codons have been swapped for ones this host reads easily, and the restriction site is gone.'
              : 'Evolution in progress: the population is still trading CAI against GC and the leftover site.');
      };
      q(el, 'gen').oninput = draw;
      q(el, 'play').onclick = () => {
        let g = 0;
        const sl = q(el, 'gen');
        const tickOn = () => { sl.value = g; draw(); if (g++ < 60) setTimeout(tickOn, 60); };
        tickOn();
      };
      draw();
    },
    steps: ['Start from a population of spellings of the same protein: the original, the host’s favourite codon everywhere, and random mixes.', 'Score each one: Codon Adaptation Index (does this host read it easily?), GC content in its window, how much the 5′ end folds, and whether forbidden sites are present.', 'Keep the sequences nothing else beats on all goals at once (the Pareto front), breed them, and mutate the odd codon to a synonym.', 'Repeat for a few hundred generations. Because only synonyms are ever swapped, the protein cannot change.'],
    when: 'Expressing a gene in a host it did not come from, or cleaning a sequence up before ordering synthesis.',
    watch: 'Codon tables are averages over a genome, not a promise about your construct. The folding number here is a base-pairing score, not a kcal/mol free energy. Highest CAI is not always best: very fast translation can misfold some proteins. Always have the final sequence reviewed.',
    where: 'Step 6, "Sequence optimizer": paste a coding sequence, pick a host, and run it.',
    quiz: { q: 'A codon optimizer changes 60% of the codons in your gene. What should the protein look like afterwards?', options: ['Slightly different, which is normal', 'Exactly the same, every amino acid', 'Shorter, because rare codons are dropped'], answer: 1, why: 'Only synonymous codons are swapped, so the amino acid sequence is identical. If it is not, something is wrong: the tool checks this and reports it.' }
  });

  add({
    id: 'reading-results', group: 'Using the results', title: 'From charts to actions: reading the action plan',
    analogy: 'A mixing desk: turn one knob while leaving the others alone, and listen. That is what "how each driver moves the result" does with the model.',
    intro: 'The agent turns its model into plain-English actions by asking, for each top driver: if I change only this, holding everything else as it was, what happens to the result? The shape of that curve becomes the action.',
    demo(el) {
      el.innerHTML = '<div class="me-grid" data-role="g"></div><p class="demo-read">These four shapes cover almost every driver. The agent also measures the size of the swing to rank the levers, and lists drivers whose curve is flat as "little effect".</p>';
      const shapes = [['Rising → "Increase"', x => 50 + 8 * x], ['Falling → "Decrease"', x => 58 - 7 * x], ['Hump → "Target the sweet spot"', x => 60 - 9 * (x - 0.1) * (x - 0.1)], ['Flat → "Little effect: set for cost"', x => 54 + 0.4 * x]];
      shapes.forEach(s => {
        const d = document.createElement('div'); q(el, 'g').appendChild(d);
        C.lines(d, [{ name: s[0], points: range(9).map(i => { const x = -1 + i / 4; return { x, y: s[1](x) }; }) }], { yDomain: [38, 62], xLabel: s[0], xTicks: [-1, 0, 1], xTickFmt: v => (v < 0 ? 'low' : v > 0 ? 'high' : 'typical'), width: 260, height: 180, label: s[0] });
      });
    },
    steps: ['For each top driver, set it to each value across its range for every row, and average the predictions.', 'Rising curve: increase it. Falling: decrease it. Hump: aim for the peak. Flat: it barely matters here.', 'Gain = best point on the curve minus your typical value. Levers are ranked by how much their curve swings.', '"All together" applies every lever at once to past rows and compares averages.', 'For categories, pick a Target outcome and a Starting from group above the plan, for example "Rows now Bronze" to "Silver or better". Ranked tiers (Bronze < Silver < Gold) mean that tier or better.'],
    when: 'To turn a model into a short list of changes to try.',
    watch: 'From historical data these are hypotheses, not proof. Make one change at a time or run the pre-filled DOE. Stay inside the ranges you have run.',
    where: 'The action plan at the top of the results, and the "How each driver moves" panel.',
    quiz: { q: 'A driver\'s curve is a hump peaking at 210, and your typical value is 230. What does the action plan suggest?', options: ['Increase it', 'Keep it near 210, the sweet spot', 'Ignore it'], answer: 1, why: 'A hump means a sweet spot: move from 230 toward the peak at 210.' }
  });

  // ---------- Page ----------
  const answered = {};
  const $ = id => document.getElementById(id);

  function renderNav(current) {
    const groups = [];
    LESSONS.forEach(l => { if (!groups.includes(l.group)) groups.push(l.group); });
    $('lesson-list').innerHTML = groups.map(g => '<h4>' + h(g) + '</h4><ol>' + LESSONS.filter(l => l.group === g).map(l => '<li><a href="#' + l.id + '"' + (l.id === current ? ' class="on" aria-current="page"' : '') + '>' + h(l.title) + (answered[l.id] ? '<span class="done" aria-label="check passed">✓</span>' : '') + '</a></li>').join('') + '</ol>').join('');
    $('lesson-select').innerHTML = LESSONS.map((l, i) => '<option value="' + l.id + '"' + (l.id === current ? ' selected' : '') + '>' + (i + 1) + '. ' + h(l.title) + '</option>').join('');
    const n = Object.keys(answered).length;
    $('score').textContent = n ? 'Checks passed: ' + n + ' of ' + LESSONS.length : 'Each lesson ends with a quick check.';
  }

  function show(id) {
    const i = Math.max(0, LESSONS.findIndex(l => l.id === id));
    const l = LESSONS[i], prev = LESSONS[i - 1], next = LESSONS[i + 1];
    const art = $('lesson');
    art.innerHTML = '<p class="eyebrow">' + h(l.group) + ' · lesson ' + (i + 1) + ' of ' + LESSONS.length + '</p><h1>' + h(l.title) + '</h1>' +
      '<div class="analogy-box"><b>Analogy</b><span>' + h(l.analogy) + '</span></div><p>' + h(l.intro) + '</p>' +
      '<div class="card demo" data-role="demo"></div>' +
      '<div class="cols2"><div class="card"><h3>How it works</h3><ol class="steps">' + l.steps.map(s => '<li>' + h(s) + '</li>').join('') + '</ol></div>' +
      '<div class="card"><h3>When to use it</h3><p>' + h(l.when) + '</p><h3>Watch out for</h3><p>' + h(l.watch) + '</p><h3>Where you see it in ML Agent</h3><p>' + h(l.where) + '</p></div></div>' +
      '<div class="card quiz"><h3>Quick check</h3><p>' + h(l.quiz.q) + '</p><div class="opts">' + l.quiz.options.map((o, k) => '<button type="button" class="opt" data-k="' + k + '">' + h(o) + '</button>').join('') + '</div><p class="why" aria-live="polite"></p></div>' +
      '<nav class="lesson-nav">' + (prev ? '<a class="btn ghost" href="#' + prev.id + '">← ' + h(prev.title) + '</a>' : '<span></span>') + (next ? '<a class="btn primary" href="#' + next.id + '">' + h(next.title) + ' →</a>' : '<a class="btn primary" href="./">Try it on data →</a>') + '</nav>';
    l.demo(art.querySelector('[data-role="demo"]'));
    art.querySelector('.opts').addEventListener('click', e => {
      const b = e.target.closest('.opt'); if (!b) return;
      const k = Number(b.getAttribute('data-k')), ok = k === l.quiz.answer;
      art.querySelectorAll('.opt').forEach((o, j) => { o.classList.toggle('right', j === l.quiz.answer && ok); o.classList.toggle('wrong', j === k && !ok); });
      art.querySelector('.why').textContent = (ok ? 'Correct. ' : 'Not quite; try again. ') + (ok ? l.quiz.why : '');
      if (ok) { answered[l.id] = true; renderNav(l.id); }
    });
    renderNav(l.id);
    document.title = l.title + ' · ML Agent Academy';
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1)) || LESSONS[0].id;
    show(id);
    window.scrollTo(0, 0);
    $('lesson').focus({ preventScroll: true });
  }
  C.bindTips($('tip'));
  $('lesson-select').addEventListener('change', e => { location.hash = e.target.value; });
  window.addEventListener('hashchange', route);
  route();
  window.MLLessons = LESSONS;
})();
