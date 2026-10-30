/* The iteration panel: rounds in, trajectory out, and a verdict on whether to run another.

   The panel exists because four of the five steps in this loop already worked separately
   and nothing joined them up. What it adds is memory - each round stacked onto the last -
   and a way of telling progress from the appearance of it. */
(function () {
  'use strict';
  const E = window.MLEngine, C = window.MLCampaign, X = window.MLXlsx;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = v => (v === null || v === undefined || !isFinite(v) ? '–' : Number(v).toFixed(2));
  const f3 = v => (v === null || v === undefined || !isFinite(v) ? '–' : Number(v).toFixed(3));
  const pm = v => (v === null || v === undefined || !isFinite(v) ? '–' : '±' + Number(v).toFixed(3));

  let rounds = [];      // { name, table }
  let measured = [];    // metrics per round
  let target = null;

  const fail = m => { $('cm-error').textContent = m; $('cm-error').hidden = false; };
  const clearErr = () => { $('cm-error').hidden = true; };

  /* Round 0 is whatever is loaded in the tool. Re-reading it each time the panel opens
     keeps the two in step: analysing a different file starts a different campaign, which
     is the only sane reading of what just happened. */
  function sync(table, name, targetName) {
    if (!table || !targetName) { rounds = []; measured = []; $('cm-out').innerHTML = ''; $('campaign').hidden = true; return; }
    const sameStart = rounds.length && rounds[0].table === table;
    if (!sameStart) rounds = [{ name: name || 'Round 0 · the data you loaded', table }];
    target = targetName;
    $('campaign').hidden = false;
    render();
  }

  function recompute() {
    measured = [];
    for (let i = 0; i < rounds.length; i++) {
      const stacked = C.stack(rounds.slice(0, i + 1).map(r => r.table), { roundColumn: 'Round' });
      try {
        measured.push(Object.assign(
          C.metrics({ columns: stacked.columns, rows: stacked.rows }, target, { seed: 42 }),
          { label: rounds[i].name, cumulative: stacked.rows.length }));
      } catch (err) { measured.push({ label: rounds[i].name, error: err.message }); }
    }
  }

  function targets() {
    const num = id => { const v = Number($(id).value); return isFinite(v) && $(id).value !== '' ? v : null; };
    const t = {};
    const hw = num('cm-t-half'), rm = num('cm-t-rmse'), r2 = num('cm-t-r2');
    if (hw !== null) t.halfWidth = hw;
    if (rm !== null) t.rmse = rm;
    if (r2 !== null) t.r2 = r2;
    return t;
  }

  function render() {
    if (!rounds.length || !target) { $('cm-out').innerHTML = ''; return; }
    recompute();
    const ok = measured.filter(m => !m.error);
    if (!ok.length) { $('cm-out').innerHTML = '<p class="error">' + h(measured[0].error || 'Could not measure this round.') + '</p>'; return; }
    const a = C.assess(ok, targets());

    let html = '<div class="table-scroll"><table><thead><tr><th>Round</th><th class="num-cell">Runs</th>' +
      '<th class="num-cell">Interval</th><th class="num-cell">RMSE</th><th class="num-cell">R&sup2;</th>' +
      '<th class="num-cell">Spread of ' + h(target) + '</th><th>Model</th></tr></thead><tbody>';
    ok.forEach((m, i) => {
      const prev = i ? ok[i - 1] : null;
      const arrow = (now, before, lowerBetter) => {
        if (prev === null || before === null || now === null) return '';
        const d = now - before;
        if (Math.abs(d) < 1e-9) return '';
        const good = lowerBetter ? d < 0 : d > 0;
        return ' <span class="' + (good ? 'up' : 'down') + '">' + (d > 0 ? '▲' : '▼') + '</span>';
      };
      html += '<tr><td><b>' + h(m.label) + '</b></td><td class="num-cell">' + m.n + '</td>' +
        '<td class="num-cell">' + pm(m.halfWidth) + (prev ? arrow(m.halfWidth, prev.halfWidth, true) : '') + '</td>' +
        '<td class="num-cell">' + f3(m.rmse) + (prev ? arrow(m.rmse, prev.rmse, true) : '') + '</td>' +
        '<td class="num-cell">' + f3(m.r2) + (prev ? arrow(m.r2, prev.r2, false) : '') + '</td>' +
        '<td class="num-cell">' + f2(m.targetSd) + '</td><td>' + h(m.model) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    /* The part that stops the loop being steered by the wrong number. R2 rises when the
       range widens whether or not the model has improved, and widening the range is exactly
       what each round does, so the two causes are separated rather than summed. */
    if (a.rangeEffect && ok.length > 1) {
      const re = a.rangeEffect;
      const mostlyRange = Math.abs(re.fromWidening) > Math.abs(re.genuine);
      html += '<div class="plain ' + (mostlyRange ? 'marginal' : 'capable') + '"><h4>What moved R&sup2;</h4>' +
        '<p>R&sup2; has gone ' + (a.deltaR2 >= 0 ? 'up ' : 'down ') + f3(Math.abs(a.deltaR2)) + ' since the first round. ' +
        'The spread of ' + h(target) + ' has grown ' + f2(re.spreadRatio) + ' times over the same period, and that alone ' +
        'accounts for ' + f3(re.fromWidening) + ' of the move. The part attributable to a genuinely better model is ' +
        f3(re.genuine) + '.</p>' +
        (mostlyRange
          ? '<p><b>So most of that rise is the range, not the model.</b> R&sup2; is error measured against the spread of the data, and every design of experiments widens that spread deliberately. Measured on identical data with identical noise and an identical model, widening the range alone takes R&sup2; from 0.376 to 0.975 while the cross-validated error does not move at all. Steer this campaign on the interval and the RMSE, which do not move when the range does.</p>'
          : '<p>Most of that rise is the model rather than the range, which is what a round of experiments is supposed to buy.</p>') +
        '</div>';
    }

    // Where it stands against the targets.
    const t = targets();
    if (Object.keys(t).length) {
      const rows = Object.keys(a.met).map(k => {
        const label = k === 'halfWidth' ? 'Interval ±' : k === 'rmse' ? 'RMSE' : 'R²';
        const now = k === 'halfWidth' ? a.latest.halfWidth : k === 'rmse' ? a.latest.rmse : a.latest.r2;
        return '<li><b>' + label + '</b>: ' + f3(now) + ' against a target of ' + f3(t[k]) + ' &mdash; ' +
          (a.met[k] ? '<span class="verdict capable">met</span>' : '<span class="verdict not">not yet</span>') + '</li>';
      }).join('');
      html += '<div class="plain ' + (a.done ? 'capable' : 'marginal') + '"><h4>' +
        (a.done ? 'The targets are met' : 'Not there yet') + '</h4><ul>' + rows + '</ul>' +
        (a.done
          ? '<p>Another round would still tighten things a little, but it would be buying precision you have already said you do not need. The useful question now is whether the model holds up on runs nobody has seen, not whether it can be made tighter.</p>'
          : '<p>The projection below says what another block of runs would be expected to buy.</p>') +
        (t.r2 !== undefined && a.met.r2 && !a.met.halfWidth
          ? '<p><b>Note the R&sup2; target is met while the interval target is not.</b> That is the pattern a widened range produces, so it is not on its own a reason to stop.</p>'
          : '') + '</div>';
    }

    // What another round would buy, from this dataset's own learning curve.
    const stacked = C.stack(rounds.map(r => r.table), { roundColumn: 'Round' });
    let proj = null;
    try { proj = C.project({ columns: stacked.columns, rows: stacked.rows }, target, Math.max(12, Math.round(a.latest.n * 0.3)), { seed: 42 }); } catch (err) { /* reported below */ }
    if (proj && proj.projection) {
      const p = proj.projection;
      html += '<div class="card"><h4>What another ' + p.addN + ' runs would be expected to buy</h4>' +
        '<div class="tiles mini">' +
        '<div class="tile"><div class="lbl">Interval now</div><div class="val">' + pm(a.latest.halfWidth) + '</div></div>' +
        '<div class="tile hero-tile"><div class="lbl">After ' + p.addN + ' more</div><div class="val">' + pm(p.halfWidth) + '</div>' +
        '<div class="sub">floor around ' + pm(p.halfWidthFloor) + '</div></div>' +
        '<div class="tile"><div class="lbl">RMSE now → after</div><div class="val">' + f3(a.latest.rmse) + ' → ' + f3(p.rmse) + '</div>' +
        '<div class="sub">floor around ' + f3(p.rmseFloor) + '</div></div></div>' +
        '<p class="hint">Read off how this dataset has actually improved as it grew, by refitting on ' + proj.points.length +
        ' subsets of increasing size, rather than from a rule of thumb. The floor is where the curve is heading: ' +
        'more runs cannot take the error below the noise in the measurement itself, and a projection that has flattened near it ' +
        'is telling you to improve the assay rather than to run more plates.</p>' +
        '<p class="hint">' + h(proj.assumption) + '</p></div>';
    } else if (proj) {
      html += '<p class="hint">' + h(proj.why || 'Not enough runs yet to trace a learning curve.') + '</p>';
    }

    html += '<div class="row-actions"><button class="btn" type="button" id="cm-csv">Download the campaign record (.csv)</button>' +
      (rounds.length > 1 ? '<button class="btn ghost small" type="button" id="cm-undo">Remove the last round</button>' : '') + '</div>';
    $('cm-out').innerHTML = html;
    $('cm-csv').addEventListener('click', () => download('campaign-rounds.csv', csv(), 'text/csv'));
    if ($('cm-undo')) $('cm-undo').addEventListener('click', () => { rounds.pop(); render(); });
  }

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csv() {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const t = targets();
    const a = C.assess(measured.filter(m => !m.error), t);
    const L = [['Campaign record'], ['Generated', q(new Date().toISOString())],
      ['Computed', q('In the browser. No data was uploaded or stored.')],
      ['Result', q(target)], [],
      ['Round', 'Label', 'Runs', 'Interval half-width', 'RMSE', 'R2', 'R2 low', 'R2 high', 'Spread of result', 'Model']];
    measured.forEach((m, i) => {
      if (m.error) { L.push([i, q(m.label), q('failed: ' + m.error)]); return; }
      L.push([i, q(m.label), m.n, m.halfWidth === null ? '' : m.halfWidth, m.rmse, m.r2,
        m.r2Lo === null ? '' : m.r2Lo, m.r2Hi === null ? '' : m.r2Hi, m.targetSd, q(m.model)]);
    });
    if (a && a.rangeEffect) {
      L.push([], [q('What moved R2')],
        ['Total change', a.deltaR2],
        ['Explained by the widened range alone', a.rangeEffect.fromWidening],
        ['Attributable to a better model', a.rangeEffect.genuine],
        ['Spread of the result grew by', a.rangeEffect.spreadRatio]);
    }
    if (a && Object.keys(t).length) {
      L.push([], [q('Targets')]);
      Object.keys(a.met).forEach(k => L.push([q(k), t[k], q(a.met[k] ? 'met' : 'not yet')]));
      L.push([q('All targets met'), q(a.done ? 'yes' : 'no')]);
    }
    L.push([], [q('R2 rises when the range of the result widens, whether or not the model has improved, and every ' +
      'round of a design-of-experiments campaign widens it deliberately. Measured on identical data with identical ' +
      'noise and an identical model, widening the range alone takes R2 from 0.376 to 0.975 while the cross-validated ' +
      'RMSE does not move. The interval and the RMSE are the quantities to steer a campaign by.')]);
    return L.map(r => r.join(',')).join('\n') + '\n';
  }

  async function addRound(file) {
    clearErr();
    if (!rounds.length) return fail('Load and run the tool on your starting data first.');
    try {
      let table;
      if (/\.xlsx$/i.test(file.name)) {
        const wb = await X.read(await file.arrayBuffer());
        const sheet = wb.sheets.find(s => s.columns.length && s.rows.length);
        if (!sheet) return fail('No readable sheet in that workbook.');
        table = sheet;
      } else {
        table = E.parseTable(await file.text(), file.name);
      }
      if (!table.rows.length) return fail('That file has a header row and no runs under it.');
      if (!table.columns.some(c => String(c).trim().toLowerCase() === String(target).trim().toLowerCase())) {
        return fail('That round has no "' + target + '" column, so there is nothing measured to learn from. Fill in the result column before adding it.');
      }
      rounds.push({ name: 'Round ' + rounds.length + ' · ' + file.name, table });
      render();
    } catch (err) { fail('Could not read that file: ' + err.message); }
  }

  function init() {
    if (!$('cm-file')) return;
    $('cm-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) addRound(f); });
    ['cm-t-half', 'cm-t-rmse', 'cm-t-r2'].forEach(id => $(id).addEventListener('input', () => { if (rounds.length) render(); }));
  }

  window.MLCampaignUI = { sync, reset: () => { rounds = []; measured = []; if ($('cm-out')) $('cm-out').innerHTML = ''; if ($('campaign')) $('campaign').hidden = true; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
