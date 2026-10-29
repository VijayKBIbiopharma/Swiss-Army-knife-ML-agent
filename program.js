/* Plasmid selection for a programme that has not run yet.

   The simulation desk answered "what would this construct give" one slider at a time. That
   is the wrong shape for the decision it was built for. Nobody picking a vector for an
   incoming molecule wants to wiggle a slider: they have a protein with fixed attributes,
   a catalogue of parts the site can actually build with, and a need for a run sheet by
   Friday. So this works the other way round - history in, catalogue in, programme in, run
   sheet out, and no levers anywhere.

   One thing about it is harder than it looks, and getting it wrong would be the most
   damaging thing this product could do.

   Predicting for a NEW protein is not the same problem as predicting for a new vector. A
   vector factor can be extrapolated a little: the corpus has four promoters, you ask about
   a fifth, the tool maps it to the nearest and says so. A protein attribute cannot be
   treated that way, because if every historical run was a monoclonal antibody then the
   corpus contains no information whatsoever about how a bispecific responds to a promoter
   choice. The arithmetic will not complain. A model fitted on one protein class will
   happily return a confident number for another, and the conformal interval will be narrow,
   because nothing in the residuals knows the question changed.

   So transferability is measured before anything is predicted: how many distinct proteins
   the history actually contains, which protein attributes vary at all, and whether the
   incoming programme sits inside that. A constant attribute in history is reported as
   carrying no evidence, and a programme whose protein is unlike anything run before is
   told so in those words rather than handed a number with a tight band on it.

   Everything else here reuses the machinery already measured elsewhere: the model choice
   and the split-conformal interval come from plasmid.js, whose coverage is checked by
   simulation in the tests. */
(function (root) {
  'use strict';
  /* Resolved when first used rather than when this file loads. Grabbing them at load time
     makes the module silently depend on script order, and it did: with this file placed
     above plasmid.js in the page, MLPlasmid was undefined here and the only symptom was
     "Cannot read properties of null" at the moment somebody pressed the button. Nothing
     about the ordering is visible from either file, so the dependency is removed instead of
     documented. */
  const need = (globalName, moduleName) => {
    const got = root[globalName] || (typeof require !== 'undefined' ? require(moduleName) : null);
    if (!got) throw new Error(globalName + ' is not loaded, so this cannot run.');
    return got;
  };
  const engine = () => need('MLEngine', './engine.js');
  const plasmid = () => need('MLPlasmid', './plasmid.js');

  const norm = s => String(s == null ? '' : s).trim();
  const key = s => norm(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  /* Two lists, not one. ID_PICK is what can name a programme; ID_SKIP is everything that is
     record-keeping rather than data. They were one list, and the bug that exposed the
     difference was quiet: only the FIRST match was dropped, so a sheet with Program_ID and
     Notes kept Notes as a protein attribute. The history has no Notes column, so the
     attribute read as "not in the historical runs at all" and flipped a well-supported
     programme to untested - a scheduling note silently discrediting the prediction. */
  const ID_PICK = /^(id|.*_id|id_.*|construct|clone|name|lot|batch|programme?|project|molecule)$/i;
  const ID_SKIP = /^(id|.*_id|id_.*|construct|clone|name|lot|batch|programme?|project|molecule|run|runorder|stdorder|std|date|.*_date|date_.*|time|operator|analyst|scientist|owner|notes?|comment|comments|remarks?|status|priority|site|customer|client)$/i;
  const ID_RE = ID_SKIP;

  /* Step 2's file: the factors the site can choose between, and the levels available.
     Two shapes are accepted because both are what people actually have - one row per
     factor with the levels in one cell, or one row per factor-level pair. A numeric factor
     is declared by giving a Min and Max instead of levels. */
  function parseCatalogue(table) {
    if (!table || !table.columns || !table.columns.length) return { factors: [], problems: ['The factor file is empty.'] };
    const cols = table.columns.map(key);
    const find = (...names) => { for (const n of names) { const i = cols.indexOf(key(n)); if (i >= 0) return i; } return -1; };
    const fi = find('factor', 'parameter', 'name', 'attribute');
    const li = find('levels', 'level', 'values', 'value', 'options');
    const mi = find('min', 'low', 'minimum'), ma = find('max', 'high', 'maximum'), si = find('step', 'increment');
    const problems = [];
    if (fi < 0) return { factors: [], problems: ['No "Factor" column found. Expected a column naming each factor, and either a "Levels" column or "Min" and "Max" columns.'] };

    const byName = new Map();
    for (const r of table.rows) {
      const name = norm(r[fi]);
      if (!name) continue;
      const rec = byName.get(name) || { name, levels: [], min: null, max: null, step: null };
      if (mi >= 0 && norm(r[mi]) !== '' && isFinite(Number(r[mi]))) rec.min = Number(r[mi]);
      if (ma >= 0 && norm(r[ma]) !== '' && isFinite(Number(r[ma]))) rec.max = Number(r[ma]);
      if (si >= 0 && norm(r[si]) !== '' && isFinite(Number(r[si]))) rec.step = Number(r[si]);
      if (li >= 0) {
        // "CMV; EF1a; CAG" in one cell, or one level per row - both end up here.
        norm(r[li]).split(/[;,|]/).map(norm).filter(Boolean).forEach(v => { if (rec.levels.indexOf(v) < 0) rec.levels.push(v); });
      }
      byName.set(name, rec);
    }
    const factors = [];
    for (const rec of byName.values()) {
      if (rec.levels.length >= 2) factors.push({ name: rec.name, kind: 'categorical', levels: rec.levels });
      else if (rec.min !== null && rec.max !== null && rec.max > rec.min) {
        factors.push({ name: rec.name, kind: 'numeric', min: rec.min, max: rec.max, step: rec.step });
      } else if (rec.levels.length === 1) {
        problems.push('"' + rec.name + '" has only one level (' + rec.levels[0] + '), so there is nothing to choose. It is held fixed.');
        factors.push({ name: rec.name, kind: 'fixed', levels: rec.levels });
      } else {
        problems.push('"' + rec.name + '" has neither two or more levels nor a usable Min and Max, so it was skipped.');
      }
    }
    return { factors, problems };
  }

  /* Step 3's file: one row per future programme, described by its protein's attributes.
     Any column that matches a catalogue factor is ignored with a note - the point of this
     flow is that the tool chooses those, not the sheet. */
  function parseProgram(table, factorNames) {
    if (!table || !table.rows || !table.rows.length) return { programs: [], ignored: [] };
    const fset = new Set((factorNames || []).map(key));
    const idIdx = table.columns.findIndex(c => ID_PICK.test(norm(c)));
    const ignored = table.columns.filter(c => fset.has(key(c)));
    const skipped = table.columns.filter((c, j) => j !== idIdx && !fset.has(key(c)) && ID_SKIP.test(norm(c)));
    const programs = table.rows.map((r, i) => {
      const attributes = {};
      table.columns.forEach((c, j) => {
        if (fset.has(key(c))) return;
        if (j === idIdx) return;
        // Every record-keeping column, not just the one that names the programme.
        if (ID_SKIP.test(norm(c))) return;
        const v = norm(r[j]);
        if (v !== '') attributes[c] = v;
      });
      return {
        id: idIdx >= 0 && norm(r[idIdx]) ? norm(r[idIdx]) : 'Programme ' + (i + 1),
        attributes
      };
    });
    return { programs, ignored, skipped };
  }

  /* Protein attributes are whatever the history has that is not a chosen factor, not an
     outcome and not a record-keeping column. The catalogue defines the levers, so this
     falls out of it rather than needing a list of its own.

     Exported because the interface needs the same answer: the form for entering a
     programme by hand offers one field per protein attribute, with the levels the history
     actually contains. Two implementations of this would drift, and the symptom would be a
     form that offers a field the planner then ignores - or worse, omits one it needs. */
  function proteinColumns(prof, factorNames, targets) {
    const chosen = factorNames || [], outs = targets || [];
    return prof.columns
      .filter(c => chosen.indexOf(c.name) < 0 && outs.indexOf(c.name) < 0 &&
        !ID_SKIP.test(c.name) && c.kind !== 'id')
      .map(c => c.name);
  }

  /* What the history holds for one attribute, so a hand-entry form can offer the real
     levels instead of a free-text box. A typo in a protein class reads downstream as "a
     value the historical runs do not contain", which correctly but pointlessly marks the
     programme untested - offering the levels prevents the typo rather than reporting it. */
  function attributeChoices(prof, name) {
    const col = prof.columns.find(c => c.name === name);
    if (!col) return null;
    const vals = col.values.filter(v => v !== null && norm(v) !== '');
    if (col.kind === 'numeric') {
      const nums = vals.map(Number).filter(isFinite).sort((a, b) => a - b);
      return { kind: 'numeric', min: nums[0], max: nums[nums.length - 1], median: engine().quantile(nums, 0.5) };
    }
    const counts = {};
    vals.forEach(v => { counts[norm(v)] = (counts[norm(v)] || 0) + 1; });
    return { kind: 'categorical', levels: Object.keys(counts).sort((a, b) => counts[b] - counts[a]) };
  }

  /* How much the history can say about a protein it has never seen. This is the measurement
     the whole module turns on, so it is separate, returns numbers, and is tested directly.

     An attribute that never varies carries no evidence at all: a model fitted where every
     row says "mAb" has not learnt what "mAb" does, it has learnt the intercept. Counting
     distinct proteins matters for the same reason - four hundred runs of one molecule are
     four hundred runs of one molecule, and the effective sample size for a cross-protein
     question is one, not four hundred. */
  function transferability(prof, proteinCols, programs) {
    const varying = [], constant = [];
    const seen = {};
    for (const name of proteinCols) {
      const col = prof.columns.find(c => c.name === name);
      if (!col) continue;
      const vals = col.values.filter(v => v !== null && norm(v) !== '');
      const distinct = new Set(vals.map(v => (col.kind === 'numeric' ? Number(v) : norm(v))));
      seen[name] = { distinct: distinct.size, kind: col.kind, levels: col.kind === 'numeric' ? null : Array.from(distinct) };
      if (col.kind === 'numeric') {
        const nums = vals.map(Number).filter(isFinite).sort((a, b) => a - b);
        seen[name].min = nums[0]; seen[name].max = nums[nums.length - 1];
      }
      (distinct.size > 1 ? varying : constant).push(name);
    }
    // Distinct protein identities: the unique combinations, which is the sample size that
    // matters for a question about a different molecule.
    const sigs = new Set();
    const n = prof.nRows;
    for (let i = 0; i < n; i++) {
      sigs.add(proteinCols.map(nm => {
        const c = prof.columns.find(x => x.name === nm);
        return c ? norm(c.values[i]) : '';
      }).join('\u0001'));
    }
    const nProteins = proteinCols.length ? sigs.size : 0;
    // With no protein columns at all there is nothing to transfer across, which is a
    // different situation from one protein and is reported as its own case below.

    /* Where each incoming programme sits. A new categorical level or a numeric value past
       the historical range is the case that must never be answered with a confident
       number, so it is named per programme and per attribute. */
    const perProgram = (programs || []).map(pg => {
      const novel = [], unseen = [], noEvidence = [];
      for (const name of Object.keys(pg.attributes)) {
        const info = seen[name];
        const v = pg.attributes[name];
        if (!info) { novel.push({ field: name, value: v, why: 'this attribute is not in the historical runs at all' }); continue; }
        if (constant.indexOf(name) >= 0) {
          noEvidence.push({ field: name, value: v, held: info.levels ? info.levels[0] : null, why: 'every historical run has the same value for it, so the data cannot say what changing it does' });
          continue;
        }
        if (info.kind === 'numeric') {
          const num = Number(v);
          if (isFinite(num) && (num < info.min || num > info.max)) {
            unseen.push({ field: name, value: num, min: info.min, max: info.max, why: 'outside the range of the historical runs' });
          }
        } else if (info.levels && info.levels.indexOf(norm(v)) < 0) {
          unseen.push({ field: name, value: v, levels: info.levels, why: 'a value the historical runs do not contain' });
        }
      }
      // The verdict, in the only three states that are honest here.
      /* noEvidence belongs with untested, not with thin. If every historical run holds the
         attribute fixed, a prediction for a different value is not weakly supported - it is
         unsupported, and the tight interval beside it comes from residuals that never saw
         the question change. */
      const standing = (novel.length || unseen.length || noEvidence.length) ? 'untested'
        : nProteins <= 2 ? 'thin' : 'supported';
      return { id: pg.id, novel, unseen, noEvidence, standing };
    });

    return {
      nProteins, varying, constant, detail: seen, perProgram,
      /* The flat refusal condition. With one protein in the history there is no protein
         effect to learn, so any number this tool prints for a different protein is the
         shape of the fit rather than evidence, however tight the interval looks. */
      canTransfer: nProteins >= 2 && varying.length > 0,
      why: nProteins < 2
        ? 'Every historical run is the same protein, so nothing here can say how a different one behaves.'
        : varying.length === 0
          ? 'No protein attribute varies across the historical runs, so the data cannot separate protein effects from anything else.'
          : nProteins <= 2
            ? 'Only ' + nProteins + ' distinct proteins appear in the history. A protein effect fitted on two molecules is a line through two points.'
            : nProteins + ' distinct proteins appear in the history.'
    };
  }

  /* Every buildable vector from the catalogue. Capped, because a catalogue with six factors
     at four levels is four thousand combinations and nobody needs four thousand rows - but
     the cap samples rather than truncating, so the set still spans the catalogue instead of
     being the alphabetical first chunk of it. */
  function candidates(factors, opt) {
    opt = opt || {};
    const cap = opt.cap || 4000;
    const axes = factors.filter(f => f.kind !== 'fixed').map(f => {
      if (f.kind === 'categorical') return { name: f.name, values: f.levels.slice() };
      const lv = [];
      if (f.step && f.step > 0) {
        for (let v = f.min; v <= f.max + 1e-9; v += f.step) lv.push(Number(v.toFixed(6)));
      }
      // Without a step, three settings is the most a screen can use from one numeric factor.
      if (lv.length < 2 || lv.length > 12) { lv.length = 0; lv.push(f.min, Number(((f.min + f.max) / 2).toFixed(6)), f.max); }
      return { name: f.name, values: lv };
    });
    const fixed = {};
    factors.filter(f => f.kind === 'fixed').forEach(f => { fixed[f.name] = f.levels[0]; });
    if (!axes.length) return { list: [], axes, fixed, total: 0, sampled: false };
    let total = 1;
    for (const a of axes) total *= a.values.length;
    const list = [];
    if (total <= cap) {
      const walk = (i, acc) => {
        if (i === axes.length) { list.push(Object.assign({}, fixed, acc)); return; }
        for (const v of axes[i].values) { acc[axes[i].name] = v; walk(i + 1, acc); }
        delete acc[axes[i].name];
      };
      walk(0, {});
      return { list, axes, fixed, total, sampled: false };
    }
    const rand = engine().rng(opt.seed || 13);
    const picked = new Set();
    while (list.length < cap && picked.size < cap * 4) {
      const acc = {};
      for (const a of axes) acc[a.name] = a.values[Math.floor(rand() * a.values.length)];
      const sig = axes.map(a => String(acc[a.name])).join('\u0001');
      if (picked.has(sig)) continue;
      picked.add(sig);
      list.push(Object.assign({}, fixed, acc));
    }
    return { list, axes, fixed, total, sampled: true };
  }

  /* A run sheet chosen from the scored candidates. Balance first, then promise: every level
     of every factor should appear about equally often, because a sheet that runs CMV eight
     times and SV40 once cannot tell you anything about SV40 whatever its predictions say.
     Among equally balancing choices the better-predicted one wins, so the sheet leans
     towards configurations worth building without becoming a list of near-duplicates.

     The balance achieved is returned and asserted in the tests rather than claimed here. */
  function runSheet(scored, axes, opt) {
    opt = opt || {};
    const runs = Math.max(2, Math.min(opt.runs || 12, scored.length));
    const counts = {};
    axes.forEach(a => { counts[a.name] = {}; a.values.forEach(v => { counts[a.name][String(v)] = 0; }); });
    const chosen = [], used = new Set();
    // How badly a pick would skew the sheet: the count it would push up, summed over factors.
    const cost = c => axes.reduce((s, a) => s + (counts[a.name][String(c.config[a.name])] || 0), 0);
    for (let k = 0; k < runs; k++) {
      let best = null, bestCost = Infinity, bestVal = -Infinity;
      for (let i = 0; i < scored.length; i++) {
        if (used.has(i)) continue;
        const c = scored[i], cst = cost(c);
        const val = isFinite(c.value) ? c.value : -Infinity;
        if (cst < bestCost || (cst === bestCost && val > bestVal)) { best = i; bestCost = cst; bestVal = val; }
      }
      if (best === null) break;
      used.add(best);
      const c = scored[best];
      axes.forEach(a => { counts[a.name][String(c.config[a.name])]++; });
      chosen.push(c);
    }
    // What balance actually came out, per factor: the gap between the most and least used
    // level. Zero means every level appears the same number of times.
    /* Reported as absent rather than as zero spread when nothing was chosen: a spread of 0
       over all-zero counts reads as "perfectly balanced", which is the most flattering
       possible description of an empty sheet. */
    let balance = null;
    if (chosen.length) {
      balance = {};
      axes.forEach(a => {
        const vs = a.values.map(v => counts[a.name][String(v)] || 0);
        balance[a.name] = { counts: vs, spread: Math.max.apply(null, vs) - Math.min.apply(null, vs) };
      });
    }
    const rand = engine().rng(opt.seed || 29);
    const order = engine().shuffle(engine().range(chosen.length), rand);
    const sheet = chosen.map((c, i) => Object.assign({}, c, { std: i + 1 }));
    order.forEach((ri, pos) => { sheet[ri].run = pos + 1; });
    sheet.sort((a, b) => a.run - b.run);
    return { sheet, balance, counts };
  }

  /* The whole flow. History and catalogue in, a scored sheet per programme out. */
  function plan(input, opt) {
    opt = opt || {};
    const conf = opt.confidence || 0.9;
    const prof = input.profile;
    const factors = (input.factors || []).filter(f => f.kind !== 'fixed' || true);
    const factorNames = factors.map(f => f.name);
    const present = factorNames.filter(n => prof.columns.some(c => c.name === n));
    const missing = factorNames.filter(n => present.indexOf(n) < 0);

    const targets = input.targets || [];
    if (!targets.length) throw new Error('Pick at least one outcome column from the historical runs.');
    const proteinCols = proteinColumns(prof, present, targets);
    /* A constant column is kept in the protein list and dropped from the features. Those
       are different jobs, and conflating them is how the first version of this reported
       "0 distinct proteins" for a history of one protein: profiling marks such a column
       constant, excluding it from the list excluded it from the count, and the honest
       answer - one protein, so nothing to learn from - came out as a nonsense zero with the
       frozen attributes unnamed. They are exactly what the user needs told. */
    const modelCols = proteinCols.filter(n => {
      const c = prof.columns.find(x => x.name === n);
      return c && c.kind !== 'constant';
    });
    const feats = present.concat(modelCols);
    if (feats.length < 2) throw new Error('Need at least two usable columns to predict from; found ' + feats.length + '.');
    const models = {};
    for (const t of targets) models[t] = plasmid().trainTarget(prof, t, feats, { seed: opt.seed || 42 });
    const env = plasmid().summarise(prof, feats);

    const cand = candidates(factors, { cap: opt.cap, seed: opt.seed });
    const transfer = transferability(prof, proteinCols, input.programs || []);

    const perProgram = (input.programs || []).map(pg => {
      const t = transfer.perProgram.find(x => x.id === pg.id) || { standing: 'untested', novel: [], unseen: [], noEvidence: [] };
      const scored = [];
      for (const cfg of cand.list) {
        const values = Object.assign({}, pg.attributes, cfg);
        const res = plasmid().predict(models, env, values, { confidence: conf, caps: opt.caps });
        if (!res.ok) { scored.push({ config: cfg, ok: false, blocking: res.blocking }); continue; }
        const first = res.results[targets[0]];
        scored.push({
          config: cfg, ok: true, value: first.value, low: first.low, high: first.high,
          halfWidth: first.halfWidth, results: res.results, trust: res.trust,
          distance: res.distance, substitutions: res.substitutions, outside: res.outside
        });
      }
      const usable = scored.filter(s => s.ok);
      const byPoint = usable.slice().sort((a, b) => b.value - a.value);
      /* Two recommendations, because they answer different questions and often disagree.
         The highest prediction is the best bet; the highest lower bound is the choice that
         is least likely to disappoint, which is usually what a programme actually wants. */
      const byFloor = usable.slice().sort((a, b) => b.low - a.low);
      const sheet = runSheet(byPoint, cand.axes, { runs: opt.runs || 12, seed: opt.seed || 29 });
      return {
        id: pg.id, attributes: pg.attributes, standing: t.standing,
        novel: t.novel, unseen: t.unseen, noEvidence: t.noEvidence,
        candidates: usable.length, refused: scored.length - usable.length,
        bestPredicted: byPoint[0] || null,
        safestChoice: byFloor[0] || null,
        agree: !!(byPoint[0] && byFloor[0]) && byPoint[0].config === byFloor[0].config,
        sheet: sheet.sheet, balance: sheet.balance
      };
    });

    return {
      targets, models, env, factors, proteinCols, modelCols, missing,
      candidateCount: cand.list.length, candidateTotal: cand.total, sampled: cand.sampled,
      axes: cand.axes, transfer, confidence: conf, perProgram
    };
  }

  root.MLProgram = { parseCatalogue, parseProgram, proteinColumns, attributeChoices, transferability, candidates, runSheet, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLProgram;
})(typeof globalThis !== 'undefined' ? globalThis : this);
