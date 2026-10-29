/* The four-step vector flow: history in, catalogue in, programme in, run sheet out.

   No sliders. The desk the sliders belonged to answers "what would this construct give",
   which is a fine question and the wrong one for choosing a vector for an incoming
   molecule: the protein's attributes are fixed, the parts available are whatever the site
   can order, and what is wanted is a sheet of candidates with numbers against them.

   Loading is Excel or CSV. An .xlsx is a ZIP of XML and the browser can inflate and read it
   without help, so the workbook never leaves the tab - which is the only reason Excel
   support is acceptable here at all. */
(function () {
  'use strict';
  const E = window.MLEngine, P = window.MLPlasmid, M = window.MLProgram, X = window.MLXlsx;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (v === null || v === undefined || !isFinite(v) ? '–' : Number(v).toFixed(2));
  const f3 = v => (v === null || v === undefined || !isFinite(v) ? '–' : Number(v).toFixed(3));

  let hist = null, prof = null, catalogue = null, programs = null, lastPlan = null;

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const fail = (id, m) => { const el = $(id); el.textContent = m; el.hidden = false; };
  const clearErr = id => { $(id).hidden = true; };

  /* One reader for both formats. A workbook with several sheets comes back whole, so the
     right tab can be chosen rather than guessed at - these files routinely arrive with the
     runs on one tab and the catalogue on another. */
  async function readAny(file) {
    const name = String(file.name || '');
    if (/\.xlsx$/i.test(name)) {
      const buf = await file.arrayBuffer();
      const wb = await X.read(buf);
      return { kind: 'workbook', sheets: wb.sheets.filter(s => s.columns.length), name };
    }
    const text = await file.text();
    return { kind: 'text', sheets: [Object.assign({ name: name }, E.parseCSV(text))], name };
  }

  // A sheet picker, shown only when the choice is real.
  function sheetPicker(hostId, sheets, onPick) {
    const host = $(hostId);
    if (sheets.length <= 1) { host.innerHTML = ''; onPick(sheets[0]); return; }
    host.innerHTML = '<div class="controls"><label>Sheet in the workbook <select>' +
      sheets.map((s, i) => '<option value="' + i + '">' + h(s.name) + ' (' + s.rows.length + ' rows)</option>').join('') +
      '</select></label></div>';
    const sel = host.querySelector('select');
    sel.addEventListener('change', () => onPick(sheets[Number(sel.value)]));
    onPick(sheets[0]);
  }

  // ---------- step 1 ----------
  function takeHistory(sheet) {
    if (!sheet || sheet.rows.length < 12) return fail('pg-hist-error', 'Need at least 12 complete runs to fit and calibrate; this sheet has ' + ((sheet && sheet.rows.length) || 0) + '.');
    clearErr('pg-hist-error');
    hist = sheet; prof = E.profile(sheet);
    const numeric = prof.columns.filter(c => c.kind === 'numeric').map(c => c.name);
    if (!numeric.length) return fail('pg-hist-error', 'No numeric outcome column found in that sheet.');
    const TITER = /titer|titre|g_?l|yield/i, QP = /qp|productivity|pcd|pg.?cell/i;
    const opt = (id, pick, blank) => {
      $(id).innerHTML = (blank ? '<option value="">(none)</option>' : '') +
        numeric.map(c => '<option' + (c === pick ? ' selected' : '') + '>' + h(c) + '</option>').join('');
    };
    opt('pg-target', numeric.find(c => TITER.test(c)) || numeric[numeric.length - 1], false);
    opt('pg-target2', numeric.find(c => QP.test(c)) || '', true);
    $('pg-hist-map').hidden = false;
    $('pg-hist-read').textContent = sheet.rows.length + ' runs, ' + sheet.columns.length + ' columns read from "' + sheet.name + '". Nothing was uploaded.';
    refreshFactors();
    ready();
  }

  // ---------- step 2 ----------
  function takeFactors(sheet) {
    const res = M.parseCatalogue(sheet);
    if (!res.factors.length) { catalogue = null; $('pg-fac-out').innerHTML = ''; ready(); return fail('pg-fac-error', res.problems[0] || 'No usable factors in that file.'); }
    clearErr('pg-fac-error');
    catalogue = res;
    $('pg-fac-read').textContent = res.factors.length + ' factors read from "' + sheet.name + '".';
    refreshFactors();
    ready();
  }
  /* Which catalogue factors actually exist as columns in the history. A factor the history
     never recorded cannot be modelled, and silently dropping it would mean the tool chose
     a level for something it knows nothing about. */
  function refreshFactors() {
    if (!catalogue) { $('pg-fac-out').innerHTML = ''; return; }
    const known = prof ? prof.columns.map(c => c.name) : null;
    const rows = catalogue.factors.map(f => {
      const inHist = !known || known.indexOf(f.name) >= 0;
      const what = f.kind === 'categorical' ? f.levels.join(', ')
        : f.kind === 'numeric' ? f2(f.min) + ' to ' + f2(f.max) + (f.step ? ' in steps of ' + f2(f.step) : ' (low, middle, high)')
          : 'held at ' + f.levels[0];
      return '<tr><td><b>' + h(f.name) + '</b></td><td>' + h(f.kind) + '</td><td>' + h(what) + '</td>' +
        '<td>' + (inHist ? '<span class="verdict capable">in the history</span>' : '<span class="verdict not">not a column in step 1</span>') + '</td></tr>';
    }).join('');
    const orphans = known ? catalogue.factors.filter(f => known.indexOf(f.name) < 0) : [];
    let html = '<div class="table-scroll"><table><thead><tr><th>Factor</th><th>Kind</th><th>Choices</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (catalogue.problems.length) html += '<div class="plain marginal"><h4>Read with notes</h4><ul>' + catalogue.problems.map(x => '<li>' + h(x) + '</li>').join('') + '</ul></div>';
    if (orphans.length) {
      html += '<div class="plain not"><h4>' + orphans.length + ' factor' + (orphans.length === 1 ? '' : 's') + ' the history does not contain</h4>' +
        '<p><b>' + orphans.map(f => h(f.name)).join(', ') + '</b> ' + (orphans.length === 1 ? 'is' : 'are') + ' in your catalogue but not a column in step 1, so there is no evidence about ' +
        (orphans.length === 1 ? 'its' : 'their') + ' effect. ' + (orphans.length === 1 ? 'It is' : 'They are') + ' left out of the choice rather than picked blind. ' +
        'Add the column to the historical runs, or drop ' + (orphans.length === 1 ? 'it' : 'them') + ' from the catalogue.</p></div>';
    }
    $('pg-fac-out').innerHTML = html;
  }

  // ---------- step 3 ----------
  function takeProgram(sheet) {
    if (!sheet || !sheet.rows.length) { programs = null; ready(); return fail('pg-prog-error', 'That sheet has no programme rows.'); }
    clearErr('pg-prog-error');
    const res = M.parseProgram(sheet, catalogue ? catalogue.factors.map(f => f.name) : []);
    programs = res;
    $('pg-prog-read').textContent = res.programs.length + ' programme' + (res.programs.length === 1 ? '' : 's') + ' read from "' + sheet.name + '".';
    const attrs = Object.keys(res.programs[0] ? res.programs[0].attributes : {});
    let html = '<div class="table-scroll"><table><thead><tr><th>Programme</th>' + attrs.map(a => '<th>' + h(a) + '</th>').join('') + '</tr></thead><tbody>' +
      res.programs.map(p => '<tr><td><b>' + h(p.id) + '</b></td>' + attrs.map(a => '<td>' + h(p.attributes[a] === undefined ? '' : p.attributes[a]) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>';
    if (res.ignored.length) {
      html += '<p class="hint">Dropped because choosing them is this tool’s job, not the sheet’s: <b>' + res.ignored.map(h).join(', ') + '</b>.</p>';
    }
    /* Named rather than dropped in silence. A kept Notes or Owner column would read as a
       protein attribute the history has never recorded, which flips a well-supported
       programme to untested - a scheduling note quietly discrediting the prediction. */
    if (res.skipped && res.skipped.length) {
      html += '<p class="hint">Read as record-keeping rather than protein attributes, so they take no part in the prediction: <b>' + res.skipped.map(h).join(', ') + '</b>.</p>';
    }
    $('pg-prog-out').innerHTML = html;
    ready();
  }

  const ready = () => {
    const ok = !!(prof && catalogue && catalogue.factors.length && programs && programs.programs.length);
    $('pg-run').disabled = !ok;
  };

  // ---------- step 4 ----------
  function run() {
    clearErr('pg-prog-error');
    const targets = [$('pg-target').value].concat($('pg-target2').value ? [$('pg-target2').value] : [])
      .filter((v, i, a) => v && a.indexOf(v) === i);
    const btn = $('pg-run'); btn.disabled = true; btn.textContent = 'Fitting…';
    setTimeout(() => {
      try {
        lastPlan = M.plan({ profile: prof, factors: catalogue.factors, programs: programs.programs, targets },
          { confidence: Number($('pg-conf').value), runs: Number($('pg-runs').value), seed: 42 });
        render(lastPlan);
        $('pg-step4').hidden = false;
        $('pg-step4').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { fail('pg-prog-error', err.message); }
      finally { btn.disabled = false; btn.textContent = 'Build the run sheet'; ready(); }
    }, 10);
  }

  function render(plan) {
    const t = plan.targets[0];
    const tr = plan.transfer;
    let html = '';

    /* The transferability verdict goes first and unmissably, because it is the one thing
       that decides whether anything below it means anything. A model fitted on one protein
       returns a confident number for another and the interval stays narrow, since nothing
       in the residuals knows the question changed. */
    const cls = tr.canTransfer ? (tr.nProteins <= 2 ? 'marginal' : 'capable') : 'not';
    html += '<div class="plain ' + cls + '"><h4>What the history can say about a protein it has not run</h4>' +
      '<p>' + h(tr.why) + '</p>';
    if (!tr.canTransfer) {
      html += '<p><b>So the numbers below are the shape of the fit, not evidence.</b> They are shown because a bad prediction you can see beats a blank screen, but do not plan on them. ' +
        'What would fix it is history across more than one molecule &mdash; even a handful of runs on a second protein changes this from an extrapolation into a comparison.</p>';
    }
    if (tr.constant.length) {
      html += '<p>Carrying no evidence because every historical run holds them fixed: <b>' + tr.constant.map(h).join(', ') + '</b>. ' +
        'A model cannot learn what changing something does from data where it never changed.</p>';
    }
    if (tr.varying.length) html += '<p>Protein attributes that do vary, and so can inform a choice: <b>' + tr.varying.map(h).join(', ') + '</b>.</p>';
    html += '</div>';

    html += '<p class="sub-head">' + plan.candidateCount.toLocaleString() + ' buildable vectors from your catalogue' +
      (plan.sampled ? ' (sampled from ' + plan.candidateTotal.toLocaleString() + ', spread across the catalogue rather than the first chunk of it)' : '') +
      ' &middot; ' + Math.round(plan.confidence * 100) + '% intervals &middot; predicting ' + h(plan.targets.join(' and ')) + '</p>';

    for (const r of plan.perProgram) {
      const badge = { supported: ['capable', 'supported by the history'], thin: ['marginal', 'thin evidence'], untested: ['not', 'untested for this protein'] }[r.standing];
      html += '<div class="card"><h4>' + h(r.id) + ' <span class="verdict ' + badge[0] + '">' + badge[1] + '</span></h4>';
      html += '<p class="hint">' + Object.keys(r.attributes).map(k => h(k) + ' <b>' + h(r.attributes[k]) + '</b>').join(' &middot; ') + '</p>';

      if (!r.candidates) {
        html += '<div class="plain not"><h4>Refused</h4><p>No vector in your catalogue can be scored for this programme. ' +
          (r.unseen.length ? 'Its ' + r.unseen.map(u => '<b>' + h(u.field) + ' = ' + h(String(u.value)) + '</b> (' + h(u.why) + ')').join(', ') + ' cannot be placed against anything in the history. ' : '') +
          'Rather than map it to the nearest molecule and hand back a confident figure, the tool stops. Screen it the old way, and these runs become the history that answers the next one like it.</p></div></div>';
        continue;
      }

      // the two recommendations, and whether they agree
      const bp = r.bestPredicted, sc = r.safestChoice;
      const cfgText = c => plan.axes.map(a => h(a.name) + ' <b>' + h(String(c.config[a.name])) + '</b>').join(' &middot; ');
      html += '<div class="tiles mini"><div class="tile hero-tile"><div class="lbl">Highest predicted</div><div class="val">' + f2(bp.value) + '</div>' +
        '<div class="sub">' + f2(bp.low) + ' to ' + f2(bp.high) + '</div></div>' +
        '<div class="tile"><div class="lbl">Least likely to disappoint</div><div class="val">' + f2(sc.low) + '</div>' +
        '<div class="sub">worst case of ' + f2(sc.value) + '</div></div></div>';
      html += '<p><b>Highest predicted build:</b> ' + cfgText(bp) + '</p>';
      if (bp !== sc) {
        html += '<p><b>Safest build:</b> ' + cfgText(sc) + '</p>' +
          '<p class="hint">These disagree, which is the useful case. The first has the better central estimate; the second has the better floor, because its band is tighter. If one shot is all you get, the floor is usually what matters.</p>';
      } else {
        html += '<p class="hint">The highest predicted build is also the one with the best floor, so there is no trade-off to make here.</p>';
      }

      // the run sheet
      html += '<div class="table-scroll"><table class="runsheet"><thead><tr><th class="num-cell">Run</th><th class="num-cell">Std</th>' +
        plan.axes.map(a => '<th>' + h(a.name) + '</th>').join('') +
        plan.targets.map(x => '<th class="num-cell">' + h(x) + '</th><th class="num-cell">interval</th>').join('') +
        '<th>Standing</th><th class="num-cell">Measured</th></tr></thead><tbody>';
      for (const s of r.sheet) {
        const b = { inside: ['capable', 'near the data'], edge: ['marginal', 'edge'], outside: ['not', 'far'] }[s.trust] || ['not', '–'];
        html += '<tr><td class="num-cell">' + s.run + '</td><td class="num-cell">' + s.std + '</td>' +
          plan.axes.map(a => '<td>' + h(String(s.config[a.name])) + '</td>').join('') +
          plan.targets.map(x => {
            const v = s.results[x];
            return '<td class="num-cell"><b>' + f2(v.value) + '</b></td><td class="num-cell">' + f2(v.low) + ' – ' + f2(v.high) + '</td>';
          }).join('') +
          '<td><span class="verdict ' + b[0] + '">' + b[1] + '</span>' +
          (s.outside.length ? ' <span class="flagged-note">beyond range</span>' : '') + '</td>' +
          '<td class="blank"></td></tr>';
      }
      html += '</tbody></table></div>';

      // what the sheet is balanced on, which is what makes it a design and not a top-N list
      if (r.balance) {
        const worst = Math.max.apply(null, Object.keys(r.balance).map(k => r.balance[k].spread));
        html += '<p class="hint">' + (worst === 0
          ? 'Every level of every factor appears the same number of times on this sheet, so each one can be judged on equal footing.'
          : 'Levels appear within ' + worst + ' run' + (worst === 1 ? '' : 's') + ' of each other across the sheet.') +
          ' That balance is why this is a design rather than a list of the twelve highest predictions &mdash; a sheet that ran your strongest promoter eight times and the weakest once could not tell you anything about the weakest, however good its numbers looked.' +
          ' Run order is randomised; the last column is for the number you measure.</p>';
      }
      html += '</div>';
    }

    html += '<div class="row-actions"><button class="btn primary" type="button" id="pg-csv">Download every run sheet (.csv)</button></div>';
    html += '<p class="hint">Predictions are decision support for screening, not a release calculation. Intervals are split-conformal and calibrated on held-back runs, so they widen as a build moves away from what you have screened &mdash; but a wide band on an untested protein is still untested.</p>';
    $('pg-out').innerHTML = html;
    $('pg-csv').addEventListener('click', () => download('plasmid-selection-run-sheets.csv', csv(), 'text/csv'));
  }

  function csv() {
    const plan = lastPlan;
    if (!plan) return '';
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const L = [['Plasmid selection for future programmes'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No file was uploaded or stored.')],
      ['Outcomes predicted', q(plan.targets.join('; '))], ['Confidence', plan.confidence],
      ['Buildable vectors considered', plan.candidateCount],
      ['Distinct proteins in the history', plan.transfer.nProteins],
      ['Can the history speak to a new protein', q(plan.transfer.canTransfer ? 'yes' : 'no - ' + plan.transfer.why)],
      ['Protein attributes that vary', q(plan.transfer.varying.join('; '))],
      ['Protein attributes held constant (no evidence)', q(plan.transfer.constant.join('; '))], []];
    for (const r of plan.perProgram) {
      L.push([q('Programme'), q(r.id), q('Standing'), q(r.standing)]);
      L.push([q('Attributes'), q(Object.keys(r.attributes).map(k => k + '=' + r.attributes[k]).join('; '))]);
      if (!r.candidates) { L.push([q('Result'), q('refused: nothing in the catalogue can be scored for this protein')], []); continue; }
      L.push([q('Highest predicted'), q(plan.axes.map(a => a.name + '=' + r.bestPredicted.config[a.name]).join('; ')), r.bestPredicted.value, r.bestPredicted.low, r.bestPredicted.high]);
      L.push([q('Safest (best floor)'), q(plan.axes.map(a => a.name + '=' + r.safestChoice.config[a.name]).join('; ')), r.safestChoice.value, r.safestChoice.low, r.safestChoice.high]);
      L.push(['RunOrder', 'StdOrder'].concat(plan.axes.map(a => a.name),
        plan.targets.reduce((acc, x) => acc.concat([x, x + '_low', x + '_high']), []),
        ['Standing', 'BeyondRange', 'Measured']));
      for (const s of r.sheet) {
        const row = [s.run, s.std].concat(plan.axes.map(a => q(s.config[a.name])));
        for (const x of plan.targets) { const v = s.results[x]; row.push(v.value, v.low, v.high); }
        row.push(q(s.trust), q(s.outside.map(o => o.field).join('; ')), '');
        L.push(row);
      }
      if (r.balance) {
        L.push([q('Level balance across the sheet')]);
        Object.keys(r.balance).forEach(k => L.push([q(k), q(r.balance[k].counts.join('; ')), q('spread ' + r.balance[k].spread)]));
      }
      L.push([]);
    }
    L.push([q('Split-conformal intervals calibrated on held-back runs, not a multiple of a residual standard deviation. ' +
      'Decision support for screening, not a release calculation. A prediction for a protein unlike anything in the history is ' +
      'the shape of the fit rather than evidence, however narrow its interval looks.')]);
    return L.map(r => r.join(',')).join('\n') + '\n';
  }

  // ---------- worked example ----------
  const CLASSES = { 'mAb': 148, 'Fc-fusion': 106, 'bispecific': 99, 'enzyme': 62 };
  function demo() {
    const r = E.rng(11);
    const prom = ['CMV', 'EF1a', 'SV40', 'CAG'], mark = ['GS', 'DHFR', 'Puromycin'];
    const names = Object.keys(CLASSES);
    const comp = { 'mAb': 1.0, 'Fc-fusion': 0.8, 'bispecific': 0.62, 'enzyme': 0.9 };
    const nz = () => { const u = Math.max(1e-9, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const rows = [];
    for (let i = 0; i < 240; i++) {
      const cl = names[Math.floor(r() * names.length)];
      const pr = prom[Math.floor(r() * prom.length)], mk = mark[Math.floor(r() * mark.length)];
      const kb = 5 + r() * 7;
      const ps = P.PROMOTERS[pr].strength, ms = P.MARKERS[mk].stringency;
      const titer = 0.8 + 4.2 * ps * comp[cl] + 1.1 * ms - 0.09 * kb + nz() * (0.12 + 0.04 * (kb - 5));
      rows.push(['C-' + String(i + 1).padStart(3, '0'), cl, CLASSES[cl], pr, mk, kb.toFixed(2), Math.max(0.05, titer).toFixed(3)]);
    }
    takeHistory({ name: 'Worked example · historical runs', columns: ['Construct_ID', 'Protein_Class', 'Protein_kDa', 'Promoter_Type', 'Selection_Marker', 'Plasmid_Size_kb', 'Titer_gL'], rows });
    takeFactors({
      name: 'Worked example · factors', columns: ['Factor', 'Levels', 'Min', 'Max', 'Step'],
      rows: [['Promoter_Type', 'CMV; EF1a; SV40; CAG', '', '', ''], ['Selection_Marker', 'GS; DHFR; Puromycin', '', '', ''], ['Plasmid_Size_kb', '', '6', '11', '2.5']]
    });
    takeProgram({
      name: 'Worked example · intake', columns: ['Program_ID', 'Protein_Class', 'Protein_kDa'],
      rows: [['PRG-24-001', 'bispecific', '101'], ['PRG-24-002', 'enzyme', '63'], ['PRG-24-003', 'nanobody', '14']]
    });
    $('delete-top').hidden = false;
  }

  function clear() {
    hist = prof = catalogue = programs = lastPlan = null;
    ['pg-hist-file', 'pg-fac-file', 'pg-prog-file'].forEach(id => { if ($(id)) $(id).value = ''; });
    ['pg-hist-read', 'pg-fac-read', 'pg-prog-read'].forEach(id => { $(id).textContent = ''; });
    ['pg-hist-sheet', 'pg-fac-sheet', 'pg-prog-sheet', 'pg-fac-out', 'pg-prog-out', 'pg-out'].forEach(id => { $(id).innerHTML = ''; });
    ['pg-hist-error', 'pg-fac-error', 'pg-prog-error'].forEach(clearErr);
    $('pg-hist-map').hidden = true; $('pg-step4').hidden = true;
    ready();
  }

  function wire(fileId, hostId, take, errId) {
    $(fileId).addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const got = await readAny(f);
        if (!got.sheets.length) return fail(errId, 'Nothing readable in that file.');
        $('delete-top').hidden = false;
        sheetPicker(hostId, got.sheets, take);
      } catch (err) { fail(errId, 'Could not read that file: ' + err.message); }
    });
  }

  function init() {
    if (!$('pg-run')) return;
    wire('pg-hist-file', 'pg-hist-sheet', takeHistory, 'pg-hist-error');
    wire('pg-fac-file', 'pg-fac-sheet', takeFactors, 'pg-fac-error');
    wire('pg-prog-file', 'pg-prog-sheet', takeProgram, 'pg-prog-error');
    $('pg-demo').addEventListener('click', demo);
    $('pg-clear').addEventListener('click', clear);
    $('pg-run').addEventListener('click', run);
    ['pg-target', 'pg-target2', 'pg-conf', 'pg-runs'].forEach(id => $(id).addEventListener('change', () => {
      if (lastPlan) run();
    }));
  }

  window.MLProgramUI = { clear, demo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
