/* Sequence optimizer panel: reads a coding DNA sequence, runs the codon-optimization GA in
   a background worker, draws the convergence and trade-off charts live, and hands back the
   optimized sequence as a file you save yourself. Nothing is uploaded or stored. */
(function () {
  'use strict';
  const C = window.MLCodon, G = window.MLGa, CH = window.Charts;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct1 = v => (v * 100).toFixed(1) + '%';
  const f3 = v => Number(v).toFixed(3);

  // Enzymes offered as tick boxes: the ones most often screened out before synthesis.
  const COMMON = ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NotI', 'XbaI', 'SalI', 'NcoI', 'NdeI', 'BsaI', 'BsmBI', 'BbsI'];
  const DEFAULT_ON = ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NotI', 'BsaI'];

  let worker = null, local = null, running = false, lastResult = null, selected = null;

  function download(name, data, type) {
    // Built in memory and handed to the browser's own download. Nothing is sent anywhere.
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- reading the sequence ----------
  // FASTA, plain letters, or a pasted column: keep the bases, drop headers and numbering.
  function readSequence(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => !/^\s*[>;]/.test(l));
    return C.clean(lines.join(''));
  }
  const avoidList = () => Array.from(document.querySelectorAll('#seq-enzymes input:checked')).map(i => i.value)
    .concat(String($('seq-extra').value || '').split(/[,\s]+/).filter(Boolean));

  function readJob() {
    const dna = readSequence($('seq-dna').value);
    const lo = Number($('seq-gc-low').value) / 100, hi = Number($('seq-gc-high').value) / 100;
    if (!(lo >= 0.2 && hi <= 0.8 && lo < hi)) throw new Error('The GC window must run from a lower to a higher percentage, between 20 and 80.');
    return {
      dna, host: $('seq-host').value, gcLow: lo, gcHigh: hi, maxRun: Number($('seq-maxrun').value) || 0,
      avoid: avoidList(), popSize: Number($('seq-pop').value) || 80, generations: Number($('seq-gens').value) || 300,
      weights: { cai: Number($('seq-w-cai').value), gc: Number($('seq-w-gc').value), fold: Number($('seq-w-fold').value) }, seed: 42
    };
  }

  // Live note under the box: what was read, and how the sequence scores before optimizing.
  function describe() {
    const el = $('seq-read');
    const dna = readSequence($('seq-dna').value);
    $('seq-settings').hidden = !dna;
    if (!dna) { el.textContent = ''; return; }
    if (dna.length % 3) { el.textContent = dna.length + ' bases: not a whole number of codons (' + (dna.length % 3) + ' left over). Trim to a coding sequence that starts at the first codon.'; return; }
    try {
      const job = readJob(), p = G.plan(job);
      const w = C.relativeAdaptiveness(job.host);
      const m = C.score(p.dna, { w, motifs: C.motifList(job.avoid), maxRun: job.maxRun, gcLow: job.gcLow, gcHigh: job.gcHigh });
      const choices = p.positions.filter(x => !x.fixed).length;
      el.textContent = p.positions.length + ' codons, ' + (p.protein.replace(/\*$/, '').length) + ' amino acids, ' + choices + ' of them with a synonym to choose from. ' +
        'Right now: CAI ' + f3(m.cai) + ', GC ' + pct1(m.gc.overall) + ', 5′ folding ' + f3(m.fold) + ', ' + m.violations + ' site' + (m.violations === 1 ? '' : 's') + ' to remove.';
    } catch (e) { el.textContent = e.message; }
  }

  // ---------- charts ----------
  const thinTicks = history => {
    const last = history[history.length - 1].gen, step = Math.max(1, Math.ceil(last / 6));
    const out = []; for (let g = 0; g <= last; g += step) out.push(g);
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  };
  function drawProgress(history) {
    if (!history.length) return;
    const xTicks = thinTicks(history);
    CH.lines($('seq-chart-fit'), [
      { name: 'Best', points: history.map(p => ({ x: p.gen, y: p.best })) },
      { name: 'Population average', cls: 's2', points: history.map(p => ({ x: p.gen, y: p.avg })) }
    ], { height: 200, noDots: true, yDomain: [0, 1], xTicks, xTickFmt: v => String(v), xLabel: 'Generation', yLabel: 'Overall score (0 to 1)', label: 'Best and average score by generation' });
    $('seq-chart-fit').insertAdjacentHTML('beforeend', CH.legend([{ label: 'Best in the population', cls: 'pt' }, { label: 'Population average', cls: 'pt s2' }]));
    CH.lines($('seq-chart-div'), [{ name: 'Diversity', cls: 's3', points: history.map(p => ({ x: p.gen, y: p.diversity })) }],
      { height: 200, noDots: true, yDomain: [0, Math.max(0.05, Math.max.apply(null, history.map(p => p.diversity)))], xTicks, xTickFmt: v => String(v), xLabel: 'Generation', yLabel: 'Codons differing (fraction)', label: 'Population diversity by generation' });
  }

  /* Trade-off (Pareto) plot: every point is a sequence that nothing else beats on all three
     goals at once. Across is CAI, up is GC, and the colour is 5' folding, so you can see
     what each gain costs. Click a point to load that sequence. */
  function drawPareto(front, job) {
    const el = $('seq-pareto');
    if (!el || !front.length) return;
    const W = Math.max(320, el.clientWidth || 560), H = Math.round(Math.min(360, W * 0.6)), L = 58, R = 16, T = 14, B = 46;
    const xs = front.map(p => p.cai), ys = front.map(p => p.gc);
    const pad = (a, b) => { const d = (b - a) || 0.02; return [a - d * 0.1, b + d * 0.1]; };
    const [xlo, xhi] = pad(Math.min.apply(null, xs), Math.max.apply(null, xs));
    const [ylo, yhi] = pad(Math.min.apply(null, ys), Math.max.apply(null, ys));
    const sx = v => L + (v - xlo) / (xhi - xlo) * (W - L - R);
    const sy = v => H - B - (v - ylo) / (yhi - ylo) * (H - T - B);
    const folds = front.map(p => p.fold), flo = Math.min.apply(null, folds), fhi = Math.max.apply(null, folds);
    const bin = f => (fhi - flo < 1e-9 ? 1 : f < flo + (fhi - flo) / 3 ? 0 : f < flo + 2 * (fhi - flo) / 3 ? 1 : 2);
    const cls = ['c3', 'c4', 'c2'];
    let b = '';
    for (const t of CH.niceTicks(ylo, yhi, 4)) if (t >= ylo && t <= yhi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + (t * 100).toFixed(0) + '%</text>';
    for (const t of CH.niceTicks(xlo, xhi, 5)) if (t >= xlo && t <= xhi) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + t.toFixed(2) + '</text>';
    // The GC window, shaded only when part of the plot falls outside it; when every sequence
    // shown is already inside, a band across the whole chart would say nothing.
    const allInside = ylo >= job.gcLow && yhi <= job.gcHigh;
    if (!allInside && job.gcHigh >= ylo && job.gcLow <= yhi) {
      const top = sy(Math.min(yhi, job.gcHigh)), bot = sy(Math.max(ylo, job.gcLow));
      b += '<rect class="usual" x="' + L + '" y="' + top + '" width="' + (W - L - R) + '" height="' + Math.max(1, bot - top) + '"/>';
    }
    b += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    front.forEach((p, i) => {
      const on = selected === i;
      b += '<g data-pareto="' + i + '" data-tip="CAI ' + f3(p.cai) + ' · GC ' + pct1(p.gc) + ' · folding ' + f3(p.fold) + ' · score ' + f3(p.d) + '\nClick to load this sequence">' +
        '<circle class="hit" cx="' + sx(p.cai) + '" cy="' + sy(p.gc) + '" r="13"/>' +
        '<circle class="pt ' + cls[bin(p.fold)] + (on ? ' sel' : '') + '" cx="' + sx(p.cai) + '" cy="' + sy(p.gc) + '" r="' + (on ? 7.5 : 4.5) + '"/></g>';
    });
    b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Codon Adaptation Index (higher is better)</text>';
    b += '<text class="lbl-strong" transform="translate(14 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">GC content</text>';
    const items = [{ label: '5′ folding: low (best)', cls: 'pt c3' }, { label: 'middle', cls: 'pt c4' }, { label: 'high', cls: 'pt c2' }];
    if (!allInside) items.push({ label: 'shaded band: your GC window', cls: 'usual', shape: 'square' });
    el.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Trade-off between CAI, GC content and folding">' + b + '</svg>' +
      CH.legend(items) + (allInside ? '<p class="hint">Every sequence shown sits inside your ' + Math.round(job.gcLow * 100) + '–' + Math.round(job.gcHigh * 100) + '% GC window.</p>' : '');
  }

  // ---------- results ----------
  function renderResult(res, job, stopped) {
    lastResult = { res, job };
    const b = res.before, a = res.after;
    const row = (label, before, after, good) => '<tr><td>' + h(label) + '</td><td class="num-cell">' + before + '</td><td class="num-cell"><b>' + after + '</b></td><td>' + good + '</td></tr>';
    const gcTxt = m => pct1(m.gc) + (m.gcOk ? '' : m.worstWindow > 0 ? ' (a window is ' + pct1(m.worstWindow) + ' outside)' : '');
    const verdict = (ok, text) => '<span class="verdict ' + (ok ? 'capable' : 'not') + '">' + h(text) + '</span>';
    const band = Math.round(job.gcLow * 100) + '–' + Math.round(job.gcHigh * 100) + '%';
    // Inside overall with one window a shade over is a note, not a failure; missing the band is.
    const gcVerdict = m => (m.gcOk ? verdict(true, 'inside ' + band)
      : m.worstWindow <= 0.02 && m.gc >= job.gcLow && m.gc <= job.gcHigh ? '<span class="verdict marginal">overall inside ' + band + ', one window ' + pct1(m.worstWindow) + ' over</span>'
        : verdict(false, m.gc < job.gcLow || m.gc > job.gcHigh ? 'overall outside ' + band : 'a window misses ' + band + ' by ' + pct1(m.worstWindow)));
    const motifNames = m => (m.motifs.length ? Array.from(new Set(m.motifs.map(x => x.label))).join(', ') : 'none');

    const table = '<div class="table-scroll"><table><thead><tr><th>Measure</th><th class="num-cell">Before</th><th class="num-cell">After</th><th>Verdict</th></tr></thead><tbody>' +
      row('Codon Adaptation Index', f3(b.cai), f3(a.cai), verdict(a.cai >= b.cai, a.cai >= b.cai ? '+' + f3(a.cai - b.cai) : 'no gain')) +
      row('GC content', gcTxt(b), gcTxt(a), gcVerdict(a)) +
      row('5′ folding (first 45 bases)', f3(b.fold), f3(a.fold), verdict(a.fold <= b.fold, a.fold <= b.fold ? 'looser start' : 'tighter start')) +
      row('Sites to remove', b.violations + (b.violations ? ' (' + h(motifNames(b)) + ')' : ''), a.violations + (a.violations ? ' (' + h(motifNames(a)) + ')' : ''), verdict(a.violations === 0, a.violations === 0 ? 'all removed' : 'still present')) +
      row('Overall score', f3(b.d), f3(a.d), verdict(a.d >= b.d, a.d >= b.d ? 'better balance' : 'no gain')) +
      '</tbody></table></div>';

    const protein = res.proteinUnchanged
      ? '<p class="verdict capable">Protein unchanged: the optimized gene translates to exactly the same ' + (res.protein.replace(/\*$/, '').length) + ' amino acids.</p>'
      : '<p class="verdict not">Protein changed. Do not use this sequence; please report it.</p>';

    $('seq-out').innerHTML =
      '<div class="card seq-result"><h3>Optimized sequence' + (stopped ? ' (stopped early)' : '') + '</h3>' +
      '<p class="sub-head">' + h(C.TABLES[res.host].name) + ' · ' + res.generations + ' generations · ' + res.changed + ' of ' + res.codons + ' codons changed (' + pct1(res.changedPct) + ').</p>' +
      protein + table +
      '<h4>Trade-offs found (Pareto front)</h4>' +
      '<p class="hint">Each point is a sequence that cannot be improved on one goal without losing on another. Click one to load it instead of the default pick.</p>' +
      '<div id="seq-pareto"></div>' +
      '<h4>Sequence</h4><div class="row-actions">' +
      '<button class="btn primary" type="button" id="seq-fasta">Download FASTA (.fa)</button>' +
      '<button class="btn" type="button" id="seq-csv">Download report (.csv)</button>' +
      '<button class="btn ghost" type="button" id="seq-copy">Copy to clipboard</button></div>' +
      '<pre class="seq-text" id="seq-text"></pre>' +
      '<p class="hint">Reference codon-usage tables are included for demonstration and training. Confirm the table for your own host and expression system, and have the final sequence reviewed, before ordering synthesis.</p>' +
      '</div>';

    selected = null;
    showSequence(res.dna, job);
    drawPareto(res.front, job);
    $('seq-pareto').addEventListener('click', e => {
      const g = e.target.closest('[data-pareto]'); if (!g) return;
      selected = Number(g.getAttribute('data-pareto'));
      const p = res.front[selected];
      const outside = p.gc < job.gcLow || p.gc > job.gcHigh;
      showSequence(p.dna, job, 'Chosen from the trade-off plot: CAI ' + f3(p.cai) + ', GC ' + pct1(p.gc) + ', folding ' + f3(p.fold) + '.' +
        (outside ? '\n! This one buys CAI by leaving your ' + Math.round(job.gcLow * 100) + '-' + Math.round(job.gcHigh * 100) + '% GC window.' : ''));
      drawPareto(res.front, job);
    });
    $('seq-fasta').addEventListener('click', () => download('optimized-sequence.fa', fasta(), 'text/plain'));
    $('seq-csv').addEventListener('click', () => download('codon-optimization-report.csv', reportCSV(), 'text/csv'));
    $('seq-copy').addEventListener('click', e => {
      const t = $('seq-text');
      const r = document.createRange(); r.selectNodeContents(t);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { document.execCommand('copy'); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy to clipboard'; }, 1500); } catch (err) { /* selection is left for a manual copy */ }
    });
  }

  let shown = '';
  function showSequence(dna, job, note) {
    shown = dna;
    // 60 bases a line with positions, the way sequence files are normally read.
    let out = '';
    for (let i = 0; i < dna.length; i += 60) out += String(i + 1).padStart(6, ' ') + '  ' + (dna.substr(i, 60).match(/.{1,10}/g) || []).join(' ') + '\n';
    $('seq-text').textContent = (note ? note + '\n\n' : '') + out;
  }
  const fasta = () => {
    const r = lastResult.res;
    return '>optimized_' + r.host + ' CAI=' + f3(r.after.cai) + ' GC=' + pct1(r.after.gc) + ' codons=' + r.codons + '\n' +
      (shown.match(/.{1,60}/g) || []).join('\n') + '\n';
  };
  function reportCSV() {
    const r = lastResult.res, j = lastResult.job;
    const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [
      ['Measure', 'Before', 'After'],
      ['Host', C.TABLES[r.host].name, C.TABLES[r.host].name],
      ['Codons', r.codons, r.codons],
      ['Codons changed', 0, r.changed],
      ['Codon Adaptation Index', r.before.cai, r.after.cai],
      ['GC content', r.before.gc, r.after.gc],
      ['Worst window outside the GC band', r.before.worstWindow, r.after.worstWindow],
      ['GC window', Math.round(j.gcLow * 100) + '-' + Math.round(j.gcHigh * 100) + '%', Math.round(j.gcLow * 100) + '-' + Math.round(j.gcHigh * 100) + '%'],
      ['5-prime folding score', r.before.fold, r.after.fold],
      ['Forbidden sites', r.before.violations, r.after.violations],
      ['Overall score', r.before.d, r.after.d],
      ['Protein unchanged', '', r.proteinUnchanged ? 'yes' : 'NO'],
      ['Generations', '', r.generations],
      ['Sites screened', esc(j.avoid.join('; ')), esc(j.avoid.join('; '))],
      [], ['Original sequence', esc(r.original)], ['Optimized sequence', esc(shown)]
    ];
    return rows.map(x => x.join(',')).join('\n') + '\n';
  }

  // ---------- running ----------
  let lastDraw = 0;
  function onProgress(msg, job) {
    $('seq-bar').value = Math.min(100, 100 * msg.gen / (job.generations || 300));
    const l = msg.last || {};
    $('seq-status').textContent = 'Generation ' + msg.gen + ' of ' + job.generations + ' · best score ' + f3(msg.best.d) +
      ' · CAI ' + f3(msg.best.cai) + ' · GC ' + pct1(msg.best.gc) + ' · ' + msg.best.violations + ' site' + (msg.best.violations === 1 ? '' : 's') + ' left' +
      ' · diversity ' + pct1(l.diversity || 0);
    // Charts cost more to draw than the numbers do to read, so they refresh a few times a
    // second rather than on every message. That is what keeps the page at full frame rate.
    const now = Date.now();
    if (msg.history && (now - lastDraw > 250 || msg.gen >= job.generations)) { lastDraw = now; drawProgress(msg.history); }
  }
  function finish(result, job, stopped) {
    running = false; lastDraw = 0;
    $('seq-run').disabled = false; $('seq-run').textContent = 'Optimize the sequence';
    $('seq-stop').hidden = true;
    $('seq-bar').value = 100;
    $('seq-status').textContent = 'Finished after ' + result.generations + ' generations.';
    renderResult(result, job, stopped);
  }
  function fail(message) {
    running = false;
    $('seq-run').disabled = false; $('seq-run').textContent = 'Optimize the sequence';
    $('seq-stop').hidden = true; $('seq-progress').hidden = true;
    $('seq-error').textContent = message; $('seq-error').hidden = false;
  }

  function start() {
    if (running) return;
    $('seq-error').hidden = true; $('seq-out').innerHTML = '';
    let job;
    try { job = readJob(); G.plan(job); } catch (e) { return fail(e.message); }
    running = true;
    $('seq-run').disabled = true; $('seq-run').textContent = 'Evolving…';
    $('seq-stop').hidden = false; $('seq-progress').hidden = false;
    $('seq-bar').value = 0; $('seq-status').textContent = 'Starting';

    // A worker keeps the page responsive. Opening the page straight from a file (file://)
    // blocks workers in some browsers, so the same engine then runs here in short slices.
    try {
      worker = new Worker('ga-worker.js'); // PRIVACY-LOCAL-WORKER: this site's own file, relative path
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m, job);
        else if (m.type === 'done') { stopWorker(); finish(m.result, job, m.stopped); }
        else if (m.type === 'error') { stopWorker(); fail(m.message); }
      };
      worker.onerror = () => { stopWorker(); runLocally(job); };
      worker.postMessage({ cmd: 'start', job }); // PRIVACY-LOCAL-WORKER: to this site's own worker
    } catch (e) {
      runLocally(job);
    }
  }
  function stopWorker() { if (worker) { worker.terminate(); worker = null; } }

  // Main-thread fallback: the same GA, stepped a few generations per animation frame.
  function runLocally(job) {
    try { local = G.create(job); } catch (e) { return fail(e.message); }
    const tick = () => {
      if (!local || !running) return;
      const st = local.step(2);
      onProgress({ gen: st.gen, history: st.history, last: st.history[st.history.length - 1], best: { d: st.best.m.d, cai: st.best.m.cai, gc: st.best.m.gc.overall, violations: st.best.m.violations } }, job);
      if (st.done) { const r = local.result(); local = null; finish(r, job, false); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function stop() {
    if (!running) return;
    if (worker) { worker.postMessage({ cmd: 'stop' }); return; } // PRIVACY-LOCAL-WORKER: to this site's own worker
    if (local) { const r = local.result(); local = null; finish(r, job0 || readJob(), true); }
  }
  let job0 = null;

  /* An example gene, built here rather than copied from a database: a 240-codon sequence
     with deliberately poor codon choices for a mammalian host, an EcoRI site, a BsaI site
     and a GC-rich stretch. It shows what the optimizer does; it is not a real gene. */
  function exampleGene() {
    const r = G.rng(2024);
    const aas = 'AAAGGGLLLVVVSSSTTTPPPEEEKKKDDDNNNQQQRRRIIIFFFYYYHHHCCMW';
    let dna = 'ATG';
    for (let i = 0; i < 236; i++) {
      const aa = aas[Math.floor(r() * aas.length)], syn = C.SYN[aa];
      // Favour the codons a mammalian host uses least, so there is something to fix.
      const usage = C.TABLES.CHO.usage;
      const sorted = syn.slice().sort((x, y) => usage[x] - usage[y]);
      dna += sorted[Math.floor(r() * Math.min(2, sorted.length))];
    }
    dna = dna.slice(0, 60) + 'GAATTC' + dna.slice(66);          // EcoRI, in frame
    dna = dna.slice(0, 300) + 'GGTCTC' + dna.slice(306);        // BsaI
    dna = dna.slice(0, 450) + 'GCCGCCGCCGCCGCC' + dna.slice(465); // a GC-rich run
    return dna + 'TGA';
  }

  function clear() {
    stopWorker(); local = null; running = false; job0 = null; lastResult = null; shown = '';
    $('seq-dna').value = ''; $('seq-out').innerHTML = ''; $('seq-read').textContent = '';
    $('seq-progress').hidden = true; $('seq-error').hidden = true; $('seq-settings').hidden = true;
    $('seq-run').disabled = false; $('seq-run').textContent = 'Optimize the sequence'; $('seq-stop').hidden = true;
    $('seq-chart-fit').innerHTML = ''; $('seq-chart-div').innerHTML = '';
  }

  function init() {
    $('seq-host').innerHTML = Object.keys(C.TABLES).map(k => '<option value="' + k + '"' + (k === 'CHO' ? ' selected' : '') + '>' + h(C.TABLES[k].name) + '</option>').join('');
    $('seq-enzymes').innerHTML = COMMON.map(n => '<label class="chip-check"><input type="checkbox" value="' + n + '"' + (DEFAULT_ON.includes(n) ? ' checked' : '') + '> ' + h(n) + ' <code>' + h(C.ENZYMES[n]) + '</code></label>').join('');
    document.querySelectorAll('.wsel').forEach(sel => {
      const def = sel.id === 'seq-w-cai' ? 3 : sel.id === 'seq-w-gc' ? 2 : 1;
      sel.innerHTML = [1, 2, 3, 4, 5].map(v => '<option' + (v === def ? ' selected' : '') + '>' + v + '</option>').join('');
    });
    $('seq-dna').addEventListener('input', () => {
      // The sequence box holds data too, so the delete button belongs to it as much as to a table.
      if ($('seq-dna').value.trim()) $('delete-top').hidden = false;
      describe();
    });
    ['seq-host', 'seq-gc-low', 'seq-gc-high', 'seq-maxrun', 'seq-extra'].forEach(id => $(id).addEventListener('change', describe));
    $('seq-enzymes').addEventListener('change', describe);
    $('seq-sample').addEventListener('click', () => { $('seq-dna').value = exampleGene(); $('delete-top').hidden = false; describe(); });
    $('seq-clear').addEventListener('click', clear);
    $('seq-run').addEventListener('click', () => { job0 = null; try { job0 = readJob(); } catch (e) { /* start reports it */ } start(); });
    $('seq-stop').addEventListener('click', stop);
  }

  window.MLSeq = { clear, readSequence, exampleGene };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
