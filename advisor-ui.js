/* The front door. You type the problem; it names the tool and the first move, and takes you
   there with the right mode already selected.

   What is typed is treated as carefully as the data: held in one variable, never stored,
   and cleared along with everything else. */
(function () {
  'use strict';
  const A = window.MLAdvisor, EV = window.MLAdvisorEval;
  const $ = id => document.getElementById(id);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const EXAMPLES = [
    'purity jumps around between resin lots',
    'how many batches for PPQ',
    'transferring a method to QC',
    'what shelf life can we claim',
    'a batch went wrong, 30 sensors',
    'set a release specification'
  ];

  /* Taking someone to a tool: the page already routes on the address, so the hash does the
     navigation and the mode is set afterwards, with a change event so the panel redraws. */
  function goTo(rec) {
    if (location.hash.slice(1) !== rec.tool) location.hash = '#' + rec.tool;
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTimeout(() => {
      if (rec.open) { const d = $(rec.open); if (d) d.open = true; }
      if (rec.mode) {
        const el = $(rec.mode.sel);
        if (el && el.value !== rec.mode.value) { el.value = rec.mode.value; el.dispatchEvent(new Event('change')); }
      }
      const target = $(rec.open || 'tab-' + rec.tool);
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function card(rec, rank) {
    return '<div class="rec' + (rank === 0 ? ' rec-top' : '') + '">' +
      '<div class="rec-head"><h4>' + h(rec.title) + '</h4>' +
      (rank === 0 ? '<span class="verdict capable">best match</span>' : '<span class="chip">also possible</span>') + '</div>' +
      '<p class="rec-what">' + h(rec.what) + '</p>' +
      '<dl class="rec-steps">' +
      '<dt>Bring</dt><dd>' + h(rec.bring) + '</dd>' +
      '<dt>It will</dt><dd>' + h(rec.first) + '</dd>' +
      '<dt>Then</dt><dd>' + h(rec.then) + '</dd>' +
      '</dl>' +
      '<p class="rec-why">Matched on: ' + rec.hits.map(x => '<code>' + h(x) + '</code>').join(', ') + '</p>' +
      '<div class="row-actions"><button class="btn primary small" type="button" data-go="' + h(rec.id) + '">Take me there</button></div>' +
      '</div>';
  }

  let last = null;
  function run() {
    const text = $('ask-text').value;
    const res = A.advise(text);
    last = res;
    const out = $('ask-out');
    if (res.status === 'empty') { out.innerHTML = ''; return; }
    if (res.status === 'nomatch') {
      out.innerHTML = '<div class="card rec-none"><h4>Nothing matched</h4><p>' + h(res.message) + '</p>' +
        '<p class="hint">It recognises words, not meaning. Naming what you measured and what you want to know about it usually works: "titer varies between lots", "how many runs do I need", "prove the new lab agrees".</p></div>';
      return;
    }
    const head = res.status === 'unsure'
      ? '<div class="ask-unsure"><b>Two of these fit what you typed.</b> ' + h(res.question) + '</div>'
      : '';
    out.innerHTML = head + '<div class="recs">' + res.recommendations.map(card).join('') + '</div>';
    out.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const rec = res.recommendations.find(r => r.id === b.getAttribute('data-go'));
      if (rec) goTo(rec);
    }));
  }

  /* The measured accuracy, computed here from the shipped eval set rather than quoted from
     a README, so it cannot drift away from the code it describes. */
  function howItWorks() {
    const sets = { tuned: { n: 0, t1: 0, nm: 0 }, heldout: { n: 0, t1: 0, nm: 0 } };
    if (EV && EV.CASES) {
      for (const c of EV.CASES) {
        const s = sets[c.set]; if (!s) continue;
        s.n++;
        const r = A.advise(c.text);
        if (r.status === 'nomatch') { s.nm++; continue; }
        if (r.recommendations[0] && r.recommendations[0].id === c.want) s.t1++;
      }
    }
    const pct = s => (s.n ? (100 * s.t1 / s.n).toFixed(0) + '%' : '–');
    $('ask-how-body').innerHTML =
      '<p>Every word you type is matched against a list of phrases and everyday concepts held in <code>advisor.js</code>, which you can open and read. There is no model and no server: the same input gives the same answer every time, it works with the network off, and nothing you type is kept once you clear your data.</p>' +
      '<p><b>Measured on the ' + (sets.tuned.n + sets.heldout.n) + ' examples shipped in <code>advisor-eval.js</code>:</b></p>' +
      '<div class="table-scroll"><table><thead><tr><th>Set</th><th class="num-cell">Cases</th><th class="num-cell">Right tool first</th><th class="num-cell">No match</th></tr></thead><tbody>' +
      '<tr><td>Phrasings using the vocabulary it was built around</td><td class="num-cell">' + sets.tuned.n + '</td><td class="num-cell">' + pct(sets.tuned) + '</td><td class="num-cell">' + sets.tuned.nm + '</td></tr>' +
      '<tr><td>Phrasings written deliberately avoiding that vocabulary</td><td class="num-cell">' + sets.heldout.n + '</td><td class="num-cell">' + pct(sets.heldout) + '</td><td class="num-cell">' + sets.heldout.nm + '</td></tr>' +
      '</tbody></table></div>' +
      '<p>The second row is the number worth believing, and it is the one to watch. Treat even that as optimistic: those examples were used to find and fix faults in the matching, so they are no longer strangers to it. The honest test is your own phrasing, which is why the set ships as a file you can add to.</p>' +
      '<p><b>What it cannot do.</b> It does not understand your sentence. A problem described entirely in words it has never seen will come back as "nothing matched" rather than a guess, and when two tools are close it asks instead of asserting. It will not interpret your results, answer a question about a number, or hold a conversation. That would need a language model, which would mean either shipping gigabytes of weights or sending what you type to a server &mdash; and the second is exactly what this tool exists not to do.</p>';
  }

  function clear() {
    last = null;
    $('ask-text').value = '';
    $('ask-out').innerHTML = '';
  }

  function init() {
    $('ask-examples').innerHTML = '<span class="hint">Try:</span> ' +
      EXAMPLES.map(e => '<button class="btn ghost small" type="button" data-ex="' + h(e) + '">' + h(e) + '</button>').join('');
    $('ask-examples').addEventListener('click', e => {
      const b = e.target.closest('[data-ex]'); if (!b) return;
      $('ask-text').value = b.getAttribute('data-ex'); run();
    });
    $('ask-go').addEventListener('click', run);
    $('ask-text').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    $('ask-how-link').addEventListener('click', e => { e.preventDefault(); $('ask-how').open = true; $('ask-how').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    $('ask-how').addEventListener('toggle', e => { if (e.target.open && !$('ask-how-body').innerHTML) howItWorks(); });
  }

  window.MLAsk = { clear, run };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
