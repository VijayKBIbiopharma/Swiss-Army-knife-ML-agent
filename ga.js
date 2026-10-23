/* Multi-objective genetic algorithm for codon optimization (NSGA-II: non-dominated sorting
   with crowding distance and constrained domination).

   Every individual is a list of codon choices, one per amino acid, so the protein it codes
   for can never change: evolution only swaps a codon for a synonym. Three objectives are
   traded off (maximize CAI, keep GC in its window, keep the 5' end unfolded) while
   forbidden motifs are treated as constraints rather than objectives, so a sequence that
   still carries a restriction site always loses to one that does not.

   Pure computation; no network, no storage. Runs in a Web Worker or on the main thread. */
(function (root) {
  'use strict';
  const C = root.MLCodon || (typeof require !== 'undefined' ? require('./codon.js') : null);

  // Small seeded generator (mulberry32), so a run with the same seed repeats exactly.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

  /* Desirability of one sequence, the same 0-to-1 idea the rest of the agent uses:
     CAI is maximized, GC is on target inside its window, folding is minimized. The overall
     score is the weighted geometric mean, so one hopeless objective sinks the sequence. */
  function desirability(m, ctx) {
    const wt = ctx.weights;
    const dCai = Math.max(0, Math.min(1, (m.cai - ctx.caiFloor) / (1 - ctx.caiFloor)));
    const dGc = m.gc.ok ? 1 : Math.max(0, 1 - Math.max(m.gc.deviation, m.gc.worstWindow) / 0.15);
    const dFold = Math.max(0, Math.min(1, (ctx.foldWorst - m.fold) / (ctx.foldWorst || 1)));
    const ds = [dCai, dGc, dFold], ws = [wt.cai, wt.gc, wt.fold];
    if (ds.some(d => d <= 0)) return { d: 0, parts: ds };
    const W = ws.reduce((a, b) => a + b, 0);
    return { d: Math.exp(ds.reduce((a, v, i) => a + ws[i] * Math.log(v), 0) / W), parts: ds };
  }

  /* Reads the job into the per-position codon choices the GA works on.
     Positions with a single codon (Met, Trp), and the stop codon, have nothing to choose. */
  function plan(job) {
    const dna = C.clean(job.dna);
    if (!dna) throw new Error('No DNA sequence found. Paste A, C, G and T letters.');
    if (dna.length % 3 !== 0) throw new Error('The sequence is ' + dna.length + ' bases: not a whole number of codons. Trim it to a coding sequence.');
    const protein = C.translate(dna);
    const stopInside = protein.slice(0, -1).indexOf('*');
    if (stopInside >= 0) throw new Error('A stop codon appears at codon ' + (stopInside + 1) + ', inside the sequence. Check the reading frame.');
    const positions = [];
    for (let i = 0; i < protein.length; i++) {
      const aa = protein[i], original = dna.slice(i * 3, i * 3 + 3);
      // The stop codon is left exactly as it came in: swapping it is a cloning decision,
      // not an optimization.
      const choices = aa === '*' || aa === 'X' ? [original] : C.SYN[aa].slice();
      positions.push({ aa, original, choices, fixed: choices.length < 2, originalIndex: Math.max(0, choices.indexOf(original)) });
    }
    return { dna, protein, positions };
  }

  function create(job) {
    const p = plan(job);
    const host = job.host || 'HEK293';
    const w = C.relativeAdaptiveness(host);
    const usage = C.TABLES[host].usage;
    const motifs = C.motifList(job.avoid || []);
    const ctx = {
      w, motifs, gcLow: job.gcLow, gcHigh: job.gcHigh, gcWindow: job.gcWindow || 50, gcStep: job.gcStep || 10,
      foldWindow: job.foldWindow || 45, maxRun: job.maxRun || 0,
      weights: Object.assign({ cai: 3, gc: 2, fold: 1 }, job.weights), caiFloor: 0.3, foldWorst: 1.6
    };
    const n = p.positions.length;
    const popSize = Math.max(8, job.popSize || 80);
    const r = rng(job.seed || 42);
    const foldCache = new Map();

    const build = genes => { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = p.positions[i].choices[genes[i]]; return out.join(''); };

    function evaluate(genes) {
      const dna = build(genes);
      const head = dna.slice(0, ctx.foldWindow);
      let fold = foldCache.get(head);
      if (fold === undefined) { fold = C.foldScore(head); if (foldCache.size < 20000) foldCache.set(head, fold); }
      const gc = C.gcProfile(dna, ctx);
      const hits = C.findMotifs(dna, ctx.motifs, ctx.maxRun);
      const m = { cai: C.cai(dna, ctx.w), gc, fold, violations: hits.length, motifs: hits };
      const des = desirability(m, ctx);
      // All three objectives are minimized, which is what the sorting below assumes.
      return Object.assign(m, { f: [1 - m.cai, gc.penalty, fold], d: des.d, parts: des.parts, dna });
    }

    // Starting population: the original sequence, the host's favourite codon everywhere,
    // and the rest drawn in proportion to how often the host uses each codon.
    const weighted = p.positions.map(pos => {
      const tot = pos.choices.reduce((s, c) => s + usage[c], 0);
      return pos.choices.map(c => usage[c] / tot);
    });
    const drawWeighted = i => {
      let u = r(), k = 0;
      for (; k < weighted[i].length - 1; k++) { u -= weighted[i][k]; if (u <= 0) return k; }
      return k;
    };
    const original = p.positions.map(pos => pos.originalIndex);
    const greedy = p.positions.map(pos => { let b = 0; for (let k = 1; k < pos.choices.length; k++) if (usage[pos.choices[k]] > usage[pos.choices[b]]) b = k; return b; });
    let pop = [original.slice(), greedy.slice()];
    while (pop.length < popSize) pop.push(p.positions.map((_, i) => (p.positions[i].fixed ? 0 : drawWeighted(i))));
    let scored = pop.map(g => ({ genes: g, m: evaluate(g) }));

    const baseline = evaluate(original);

    // ---------- NSGA-II sorting ----------
    /* Constrained domination: a sequence with no forbidden motifs always beats one that has
       them; between two offenders, fewer wins; otherwise the usual Pareto rule applies. */
    function dominates(a, b) {
      if (a.m.violations !== b.m.violations) return a.m.violations < b.m.violations;
      if (a.m.violations > 0) return false;
      let better = false;
      for (let i = 0; i < 3; i++) { if (a.m.f[i] > b.m.f[i] + 1e-12) return false; if (a.m.f[i] < b.m.f[i] - 1e-12) better = true; }
      return better;
    }
    function sortFronts(list) {
      const fronts = [[]], dominated = list.map(() => []), count = list.map(() => 0);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (dominates(list[i], list[j])) { dominated[i].push(j); count[j]++; }
          else if (dominates(list[j], list[i])) { dominated[j].push(i); count[i]++; }
        }
        if (count[i] === 0) { list[i].rank = 0; fronts[0].push(i); }
      }
      // Rebuild rank 0 after every count is known, then peel the fronts off one at a time.
      fronts[0] = list.map((_, i) => i).filter(i => count[i] === 0);
      fronts[0].forEach(i => { list[i].rank = 0; });
      let f = 0;
      while (fronts[f] && fronts[f].length) {
        const next = [];
        for (const i of fronts[f]) for (const j of dominated[i]) if (--count[j] === 0) { list[j].rank = f + 1; next.push(j); }
        fronts.push(next); f++;
      }
      fronts.pop();
      return fronts;
    }
    // Crowding distance keeps the front spread out instead of collapsing onto one corner.
    function crowding(list, front) {
      front.forEach(i => { list[i].crowd = 0; });
      for (let k = 0; k < 3; k++) {
        const ord = front.slice().sort((a, b) => list[a].m.f[k] - list[b].m.f[k]);
        const lo = list[ord[0]].m.f[k], hi = list[ord[ord.length - 1]].m.f[k], span = hi - lo || 1;
        list[ord[0]].crowd = Infinity; list[ord[ord.length - 1]].crowd = Infinity;
        for (let i = 1; i < ord.length - 1; i++) list[ord[i]].crowd += (list[ord[i + 1]].m.f[k] - list[ord[i - 1]].m.f[k]) / span;
      }
    }
    const fitter = (a, b) => (a.rank !== b.rank ? a.rank < b.rank : a.crowd > b.crowd);

    function rankAll(list) {
      const fronts = sortFronts(list);
      fronts.forEach(fr => crowding(list, fr));
      return fronts;
    }
    rankAll(scored);

    const pMut = job.mutationRate || 0.02;
    const state = { gen: 0, best: null, front: [], history: [], baseline, protein: p.protein, host, positions: n, done: false };

    function recordGeneration() {
      const feasible = scored.filter(s => s.m.violations === 0);
      const pool = feasible.length ? feasible : scored;
      const best = pool.reduce((a, b) => (b.m.d > a.m.d || (b.m.d === a.m.d && b.m.violations < a.m.violations) ? b : a));
      state.best = { dna: best.m.dna, m: best.m };
      // The Pareto front is what the trade-off plot shows: no sequence on it can be improved
      // on one objective without losing on another.
      state.front = scored.filter(s => s.rank === 0 && s.m.violations === 0)
        .map(s => ({ cai: s.m.cai, gc: s.m.gc.overall, gcDev: Math.max(s.m.gc.deviation, s.m.gc.worstWindow), fold: s.m.fold, d: s.m.d, dna: s.m.dna }))
        .sort((a, b) => b.cai - a.cai).slice(0, 120);
      // Diversity: how often two random sequences differ at the same codon. It falls as the
      // population converges, which is the signal to stop.
      let diff = 0, pairs = 0;
      for (let i = 0; i < scored.length; i += 2) {
        const a = scored[i].genes, b = scored[(i + 1) % scored.length].genes;
        let d = 0; for (let k = 0; k < n; k++) if (a[k] !== b[k]) d++;
        diff += d / n; pairs++;
      }
      state.history.push({
        gen: state.gen, best: best.m.d, avg: scored.reduce((s, x) => s + x.m.d, 0) / scored.length,
        diversity: pairs ? diff / pairs : 0, cai: best.m.cai, gc: best.m.gc.overall, fold: best.m.fold,
        violations: best.m.violations, frontSize: state.front.length
      });
    }
    recordGeneration();

    // One generation: tournament selection, uniform crossover, synonymous mutation, then
    // parents and children compete together so a good sequence is never lost.
    function advance() {
      const kids = [];
      while (kids.length < popSize) {
        const pa = tournament(), pb = tournament();
        const g1 = new Array(n), g2 = new Array(n);
        for (let i = 0; i < n; i++) { const swap = r() < 0.5; g1[i] = swap ? pb.genes[i] : pa.genes[i]; g2[i] = swap ? pa.genes[i] : pb.genes[i]; }
        kids.push(mutate(g1), mutate(g2));
      }
      const children = kids.slice(0, popSize).map(g => ({ genes: g, m: evaluate(g) }));
      const all = scored.concat(children);
      const fronts = rankAll(all);
      const next = [];
      for (const fr of fronts) {
        if (next.length + fr.length <= popSize) { fr.forEach(i => next.push(all[i])); continue; }
        fr.sort((a, b) => all[b].crowd - all[a].crowd);
        for (const i of fr) { if (next.length >= popSize) break; next.push(all[i]); }
        break;
      }
      scored = next;
      state.gen++;
      recordGeneration();
    }
    function tournament() {
      const a = pick(scored, r), b = pick(scored, r);
      return fitter(a, b) ? a : b;
    }
    function mutate(g) {
      for (let i = 0; i < n; i++) {
        if (p.positions[i].fixed || r() > pMut) continue;
        let k = drawWeighted(i);
        if (k === g[i] && p.positions[i].choices.length > 1) k = (k + 1 + Math.floor(r() * (p.positions[i].choices.length - 1))) % p.positions[i].choices.length;
        g[i] = k;
      }
      return g;
    }

    return {
      state,
      plan: p,
      ctx,
      evaluate,
      // Runs a slice of generations, so a worker can report progress between slices.
      step(count) {
        for (let i = 0; i < count && state.gen < (job.generations || 300); i++) advance();
        state.done = state.gen >= (job.generations || 300);
        return state;
      },
      // Everything the report needs: the chosen sequence, what changed, and the proof.
      result() {
        const b = state.best, m = b.m;
        let changed = 0;
        for (let i = 0; i < n; i++) if (m.dna.slice(i * 3, i * 3 + 3) !== p.positions[i].original) changed++;
        return {
          host, dna: m.dna, original: p.dna, protein: p.protein,
          proteinUnchanged: C.translate(m.dna) === p.protein,
          codons: n, changed, changedPct: n ? changed / n : 0,
          before: summary(baseline), after: summary(m),
          front: state.front, history: state.history, generations: state.gen
        };
      }
    };
  }
  const summary = m => ({ cai: m.cai, gc: m.gc.overall, gcOk: m.gc.ok, worstWindow: m.gc.worstWindow, fold: m.fold, violations: m.violations, motifs: m.motifs.slice(0, 40), d: m.d });

  root.MLGa = { create, plan, desirability, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLGa;
})(typeof globalThis !== 'undefined' ? globalThis : this);
