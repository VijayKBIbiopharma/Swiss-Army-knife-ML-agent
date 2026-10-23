/* Web Worker that runs the codon-optimization GA off the main thread, so the page stays
   responsive while a long run evolves. It loads only this site's own files and talks only
   to the page that started it: a worker has no more reach than the page, and the page's
   Content-Security-Policy (connect-src 'none') applies here too.

   Evolution runs in short slices with a timeout between them, so a "stop" message from the
   page is picked up within a few generations instead of after the whole run. */
'use strict';
importScripts('codon.js', 'ga.js'); // PRIVACY-LOCAL-WORKER: this site's own files, relative paths

let run = null, stopped = false;

function tick() {
  if (!run || stopped) return;
  try {
    const state = run.step(4);
    self.postMessage({ type: 'progress', gen: state.gen, history: state.history, last: state.history[state.history.length - 1], best: { dna: state.best.dna, cai: state.best.m.cai, gc: state.best.m.gc.overall, fold: state.best.m.fold, violations: state.best.m.violations, d: state.best.m.d } }); // PRIVACY-LOCAL-WORKER: to the page that started this worker
    if (state.done) { self.postMessage({ type: 'done', result: run.result() }); run = null; return; } // PRIVACY-LOCAL-WORKER: to the page that started this worker
    setTimeout(tick, 0);
  } catch (e) {
    self.postMessage({ type: 'error', message: String((e && e.message) || e) }); // PRIVACY-LOCAL-WORKER: to the page that started this worker
    run = null;
  }
}

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.cmd === 'start') {
    stopped = false;
    try { run = self.MLGa.create(msg.job); } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) }); // PRIVACY-LOCAL-WORKER: to the page that started this worker
      return;
    }
    setTimeout(tick, 0);
  } else if (msg.cmd === 'stop') {
    stopped = true;
    if (run) { self.postMessage({ type: 'done', result: run.result(), stopped: true }); run = null; } // PRIVACY-LOCAL-WORKER: to the page that started this worker
  }
};
