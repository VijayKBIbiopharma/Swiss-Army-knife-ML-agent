/* Secondary structure: which bases pair with which, and where to draw them.

   WHAT THIS IS. A base-pair maximization with a stacking preference, traced back to an
   actual structure, then laid out as helices and loops. It finds stems and the loops between
   them, and it is nested by construction, so the drawing never crosses itself.

   WHAT THIS IS NOT. A free-energy minimization. There is no Turner nearest-neighbour
   parameter set here, no partition function, and therefore no kcal/mol and no base-pair
   probabilities. Tools that print those numbers carry thousands of measured parameters;
   this carries a scoring rule that prefers long stems of strong pairs. On a sequence with
   one obvious structure the two usually agree on the stems. On a sequence with several
   comparable foldings they will not, and nothing here can tell you which is right.

   So the drawing is offered as a picture of a plausible structure, and the page says so.
   Before committing a design, fold the final sequence somewhere that carries the parameters. */
(function (root) {
  'use strict';
  const PAIR = { GC: 3, CG: 3, AT: 2, TA: 2, AU: 2, UA: 2, GT: 1, TG: 1, GU: 1, UG: 1 };
  const MIN_LOOP = 3;

  /* ---------- Scoring ----------

     Shaped like a folding energy model without pretending to be one. Pairing is rewarded,
     stacking is rewarded more, and every loop is charged for - which is the part plain
     base-pair maximization leaves out, and why it merges two tidy hairpins into one long
     bulgy helix given half a chance. Charging for loops is what keeps helices helices.

     These constants are chosen so the structures come out sensible, NOT measured. Turner's
     parameters are thousands of laboratory measurements; borrowing their shape is fair,
     claiming their accuracy is not, which is why nothing here is reported in kcal/mol. */
  const PAIR_SCORE = { GC: 3.4, CG: 3.4, AT: 2.1, TA: 2.1, AU: 2.1, UA: 2.1, GT: 1.0, TG: 1.0, GU: 1.0, UG: 1.0 };
  const STACK = 1.6;          // a pair sitting directly on another is worth much more
  const MULTI = 3.2;          // opening a branching loop is expensive
  const MAX_INTERNAL = 16;    // bulges and internal loops beyond this are not considered
  // Loops cost more the bigger they are, and an internal loop also pays for being lopsided.
  const hairpinCost = len => 1.4 + 0.9 * Math.log(Math.max(3, len) / 3) + (len > 8 ? 0.25 * (len - 8) * 0.1 : 0);
  const internalCost = (l1, l2) => 1.1 + 0.55 * Math.log(1 + l1 + l2) + 0.28 * Math.abs(l1 - l2);

  function foldStructure(seqRaw, opt) {
    opt = opt || {};
    const seq = String(seqRaw || '').toUpperCase().replace(/[^ACGTU]/g, '');
    const n = seq.length;
    const pairs = new Int32Array(n).fill(-1);
    if (n < MIN_LOOP + 2) return { seq, pairs, dotBracket: '.'.repeat(n), score: 0 };
    const canPair = (i, j) => (j - i - 1 >= MIN_LOOP) && PAIR_SCORE[seq[i] + seq[j]] !== undefined;
    const bonus = (i, j) => PAIR_SCORE[seq[i] + seq[j]] || 0;

    const V = new Float32Array(n * n).fill(-Infinity);   // i pairs with j
    const W = new Float32Array(n * n);                   // best for i..j, however it folds
    for (let span = MIN_LOOP + 1; span < n; span++) {
      for (let i = 0; i + span < n; i++) {
        const j = i + span, ij = i * n + j;
        if (canPair(i, j)) {
          let best = -hairpinCost(j - i - 1);            // close it as a hairpin
          // Stack, bulge or internal loop onto an inner pair (p, q).
          const pMax = Math.min(i + MAX_INTERNAL + 1, j - MIN_LOOP - 1);
          for (let pp = i + 1; pp <= pMax; pp++) {
            const l1 = pp - i - 1;
            const qMin = Math.max(pp + MIN_LOOP + 1, j - 1 - (MAX_INTERNAL - l1));
            for (let qq = j - 1; qq >= qMin; qq--) {
              const inner = pp * n + qq;
              if (V[inner] === -Infinity) continue;
              const l2 = j - qq - 1;
              const cost = (l1 === 0 && l2 === 0) ? -STACK : internalCost(l1, l2);
              const v = V[inner] - cost;
              if (v > best) best = v;
            }
          }
          // Or close a loop with more than one branch inside it.
          if (j - 1 > i + 1) {
            const m = W[(i + 1) * n + (j - 1)] - MULTI;
            if (m > best) best = m;
          }
          V[ij] = bonus(i, j) + best;
        }
        let best = Math.max(W[i * n + j - 1], W[(i + 1) * n + j]);
        if (V[ij] > best) best = V[ij];
        for (let k = i + 1; k < j; k++) {
          const v = W[i * n + k] + W[(k + 1) * n + j];
          if (v > best) best = v;
        }
        W[ij] = best;
      }
    }
    // Traceback through the same cases, iteratively so a long sequence cannot blow the stack.
    const near = (a, b) => Math.abs(a - b) < 1e-4;
    const stack = [{ i: 0, j: n - 1, v: false }];
    while (stack.length) {
      const t = stack.pop();
      const i = t.i, j = t.j;
      if (i >= j) continue;
      const ij = i * n + j;
      if (!t.v) {
        if (near(W[ij], W[i * n + j - 1])) { stack.push({ i, j: j - 1, v: false }); continue; }
        if (near(W[ij], W[(i + 1) * n + j])) { stack.push({ i: i + 1, j, v: false }); continue; }
        if (V[ij] > -Infinity && near(W[ij], V[ij])) { stack.push({ i, j, v: true }); continue; }
        let split = -1;
        for (let k = i + 1; k < j; k++) if (near(W[i * n + k] + W[(k + 1) * n + j], W[ij])) { split = k; break; }
        if (split >= 0) { stack.push({ i, j: split, v: false }); stack.push({ i: split + 1, j, v: false }); }
        continue;
      }
      // i really does pair with j: record it, then work out what is inside.
      pairs[i] = j; pairs[j] = i;
      const rest = V[ij] - bonus(i, j);
      if (near(rest, -hairpinCost(j - i - 1))) continue;
      let done = false;
      const pMax = Math.min(i + MAX_INTERNAL + 1, j - MIN_LOOP - 1);
      for (let pp = i + 1; pp <= pMax && !done; pp++) {
        const l1 = pp - i - 1;
        const qMin = Math.max(pp + MIN_LOOP + 1, j - 1 - (MAX_INTERNAL - l1));
        for (let qq = j - 1; qq >= qMin; qq--) {
          const inner = pp * n + qq;
          if (V[inner] === -Infinity) continue;
          const l2 = j - qq - 1;
          const cost = (l1 === 0 && l2 === 0) ? -STACK : internalCost(l1, l2);
          if (near(V[inner] - cost, rest)) { stack.push({ i: pp, j: qq, v: true }); done = true; break; }
        }
      }
      if (!done && j - 1 > i + 1) stack.push({ i: i + 1, j: j - 1, v: false });
    }
    let db = '';
    for (let i = 0; i < n; i++) db += pairs[i] < 0 ? '.' : (pairs[i] > i ? '(' : ')');
    return { seq, pairs, dotBracket: db, score: W[n - 1] };
  }

  /* ---------- Layout ----------
     Helices become straight ladders; every loop becomes a circle big enough to seat the
     unpaired bases on it plus wherever its branching helices leave. Working outwards from
     the exterior keeps the whole thing nested, so nothing can cross. */
  const STEP = 24;        // distance between neighbouring bases
  function layout(seq, pairs, opt) {
    opt = opt || {};
    const n = pairs.length;
    const pos = new Array(n);
    const step = opt.step || STEP;

    // The elements sitting directly on a loop: unpaired bases, and the helices that leave it.
    function loopItems(i, j) {
      const items = [];
      let k = i;
      while (k <= j) {
        if (pairs[k] > k && pairs[k] <= j) { items.push({ type: 'helix', i: k, j: pairs[k] }); k = pairs[k] + 1; }
        else { items.push({ type: 'base', i: k }); k++; }
      }
      return items;
    }
    /* A loop is drawn as a circle. Its circumference has to seat one slot per base on it and
       two per branching helix (the helix leaves and comes back), so the radius follows from
       the count rather than being guessed. */
    const radiusFor = count => Math.max(step * 0.9, (count * step) / (2 * Math.PI) + step * 0.35);

    // Place a helix from (x, y) travelling along `ang`, then whatever it encloses. Depth
    // first, so a branch is complete before the next one starts and its width can be
    // measured - without that, two neighbouring branches are given the same room whether
    // one is a short hairpin and the other a whole sub-structure, and they collide.
    function placeHelix(i, j, x, y, ang) {
      let a = i, b = j, cx = x, cy = y;
      /* The 5' strand goes on the LEFT of the direction of travel. Put it on the right and
         the backbone arrives at the far strand, runs up and over, and comes back down the
         near one - crossing itself at every single helix junction. */
      const px = Math.cos(ang - Math.PI / 2), py = Math.sin(ang - Math.PI / 2);
      while (true) {
        pos[a] = { x: cx + px * step / 2, y: cy + py * step / 2 };
        pos[b] = { x: cx - px * step / 2, y: cy - py * step / 2 };
        const na = a + 1, nb = b - 1;
        if (na < nb && pairs[na] === nb) { a = na; b = nb; cx += Math.cos(ang) * step; cy += Math.sin(ang) * step; continue; }
        break;
      }
      // What the helix closes on: a hairpin loop, a bulge, or a branching multiloop.
      if (a + 1 <= b - 1) placeLoop({ i: a + 1, j: b - 1, x: cx, y: cy, ang });
    }
    function placeLoop(task) {
      const items = loopItems(task.i, task.j);
      // Slots: the closing pair counts as one, every base one, every branching helix two.
      const slots = 1 + items.reduce((s, it) => s + (it.type === 'helix' ? 2 : 1), 0);
      const r = radiusFor(slots);
      // The circle sits ahead of the closing pair, centred on the helix axis.
      const cx = task.x + Math.cos(task.ang) * r, cy = task.y + Math.sin(task.ang) * r;
      const start = task.ang + Math.PI;           // the closing pair's direction from the centre
      /* Sweep towards whichever side the 5' base of the closing pair sits on. Going the
         other way puts the first loop base across the circle from the base that precedes it
         in sequence, so the backbone jumps the loop and the drawing crosses itself. */
      const dAng = (2 * Math.PI) / slots;
      let slot = 1;                                // slot 0 is the closing pair
      for (const it of items) {
        if (it.type === 'base') {
          const a = start + dAng * slot;
          pos[it.i] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
          slot++;
        } else {
          // A branching helix leaves along the radius midway between its two slots.
          const a1 = start + dAng * slot, a2 = start + dAng * (slot + 1);
          const mid = (a1 + a2) / 2;
          placeHelix(it.i, it.j, cx + r * Math.cos(mid), cy + r * Math.sin(mid), mid);
          slot += 2;
        }
      }
    }

    /* The exterior: unpaired stretches run along a baseline and each outermost helix stands
       up from it, which is what gives these diagrams their familiar shape. */
    const ext = loopItems(0, n - 1);
    let x = 0;
    const up = -Math.PI / 2;
    for (const it of ext) {
      if (it.type === 'base') { pos[it.i] = { x, y: 0 }; x += step; }
      else {
        placeHelix(it.i, it.j, x + step / 2, 0, up);
        // Measure what that branch actually occupies and start the next one clear of it.
        let right = x + step;
        for (let k = it.i; k <= it.j; k++) if (pos[k]) right = Math.max(right, pos[k].x);
        x = right + step;
      }
    }
    for (let i = 0; i < n; i++) if (!pos[i]) pos[i] = { x: i * step, y: 0 };
    return pos;
  }

  root.MLFold = { foldStructure, layout, PAIR, MIN_LOOP };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLFold;
})(typeof globalThis !== 'undefined' ? globalThis : this);
