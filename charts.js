/* Small SVG chart helpers. Colors come from CSS classes (style.css), so light and dark
   mode both work, and no style attributes are needed under the page's security policy. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => (root.MLAgent ? root.MLAgent.fmt(v) : String(v));

  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { hi = lo + 1; }
    const span = hi - lo, step0 = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
    return ticks;
  }
  function widthOf(el) { return Math.max(300, Math.min(900, (el && el.clientWidth) || 600)); }
  function svg(w, h, label, body) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">' + body + '</svg>';
  }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // Horizontal bars: magnitude comparison across named items.
  function hbar(el, items, opt) {
    opt = opt || {};
    const W = opt.width || widthOf(el), rowH = 28, top = 8, bottom = 26;
    const labelChars = Math.min(28, Math.max(...items.map(i => String(i.label).length), 4));
    const left = Math.min(W * 0.42, 14 + labelChars * 7), right = 64;
    const H = top + items.length * rowH + bottom;
    const lo = opt.min !== undefined ? opt.min : Math.min(0, ...items.map(i => i.value));
    let hi = opt.max !== undefined ? opt.max : Math.max(...items.map(i => i.value), opt.ref ? opt.ref.value : 0);
    if (!(hi > lo)) hi = lo + 1;
    const x = v => left + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - left - right);
    let b = '';
    for (const t of niceTicks(lo, hi, 4)) if (t >= lo && t <= hi) {
      b += '<line class="gridline" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + (H - bottom) + '"/>';
      b += '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(opt.tickFmt ? opt.tickFmt(t) : fmt(t)) + '</text>';
    }
    items.forEach((it, i) => {
      const y = top + i * rowH;
      const x0 = x(Math.max(lo, 0)), x1 = x(it.value);
      const bx = Math.min(x0, x1), bw = Math.max(1.5, Math.abs(x1 - x0));
      const tip = it.tip || it.label + ': ' + (it.text || fmt(it.value));
      b += '<g data-tip="' + esc(tip) + '">';
      b += '<rect class="hit" x="0" y="' + y + '" width="' + W + '" height="' + rowH + '"/>';
      b += '<text x="' + (left - 8) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end"' + (it.cls && it.cls.indexOf('hi') >= 0 ? ' class="lbl-strong"' : '') + '>' + esc(trunc(it.label, labelChars)) + '</text>';
      b += '<rect class="bar ' + (it.cls || '') + '" x="' + bx + '" y="' + (y + 6) + '" width="' + bw + '" height="' + (rowH - 12) + '" rx="3"/>';
      b += '<text x="' + (Math.max(x0, x1) + 6) + '" y="' + (y + rowH / 2 + 4) + '"' + (it.cls && it.cls.indexOf('hi') >= 0 ? ' class="lbl-strong"' : '') + '>' + esc(it.text || fmt(it.value)) + '</text>';
      b += '</g>';
    });
    b += '<line class="axis" x1="' + x(Math.max(lo, 0)) + '" x2="' + x(Math.max(lo, 0)) + '" y1="' + top + '" y2="' + (H - bottom) + '"/>';
    if (opt.ref) {
      b += '<line class="ref" x1="' + x(opt.ref.value) + '" x2="' + x(opt.ref.value) + '" y1="' + (top - 4) + '" y2="' + (H - bottom) + '"/>';
    }
    el.innerHTML = svg(W, H, opt.label || 'Bar chart', b);
  }

  const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross', 'ring'];
  function marker(shape, cx, cy, r, cls) {
    const c = ' class="' + cls + '"';
    switch (shape) {
      case 'square': return '<rect' + c + ' x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" rx="1"/>';
      case 'triangle': return '<path' + c + ' d="M' + cx + ' ' + (cy - r * 1.2) + 'L' + (cx + r * 1.1) + ' ' + (cy + r * 0.8) + 'L' + (cx - r * 1.1) + ' ' + (cy + r * 0.8) + 'Z"/>';
      case 'diamond': return '<path' + c + ' d="M' + cx + ' ' + (cy - r * 1.3) + 'L' + (cx + r * 1.3) + ' ' + cy + 'L' + cx + ' ' + (cy + r * 1.3) + 'L' + (cx - r * 1.3) + ' ' + cy + 'Z"/>';
      case 'cross': return '<path' + c + ' d="M' + (cx - r) + ' ' + (cy - r / 3) + 'h' + (r * 2 / 3) + 'v' + (-r * 2 / 3) + 'h' + (r * 2 / 3) + 'v' + (r * 2 / 3) + 'h' + (r * 2 / 3) + 'v' + (r * 2 / 3) + 'h' + (-r * 2 / 3) + 'v' + (r * 2 / 3) + 'h' + (-r * 2 / 3) + 'v' + (-r * 2 / 3) + 'h' + (-r * 2 / 3) + 'Z"/>';
      case 'ring': return '<circle' + c + ' cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill-opacity=".35"/>';
      default: return '<circle' + c + ' cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
    }
  }
  function legend(items) {
    return '<ul class="legend">' + items.map(it =>
      '<li><svg viewBox="0 0 12 12" aria-hidden="true" class="chart">' + marker(it.shape || 'circle', 6, 6, 4.5, it.cls) + '</svg>' + esc(it.label) + '</li>').join('') + '</ul>';
  }

  // Scatter: relationship between two numbers. Optional y = x diagonal for predicted vs actual.
  function scatter(el, pts, opt) {
    opt = opt || {};
    const W = widthOf(el), H = Math.round(Math.min(420, W * 0.62)), L = 56, R = 14, T = 12, B = 42;
    let xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    let xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
    if (opt.diagonal) { xlo = ylo = Math.min(xlo, ylo); xhi = yhi = Math.max(xhi, yhi); }
    const pad = (a, b) => { const d = (b - a) || 1; return [a - d * 0.05, b + d * 0.05]; };
    [xlo, xhi] = pad(xlo, xhi); [ylo, yhi] = pad(ylo, yhi);
    const sx = v => L + (v - xlo) / (xhi - xlo) * (W - L - R);
    const sy = v => H - B - (v - ylo) / (yhi - ylo) * (H - T - B);
    let b = '';
    for (const t of niceTicks(ylo, yhi, 5)) if (t >= ylo && t <= yhi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + esc(fmt(t)) + '</text>';
    for (const t of niceTicks(xlo, xhi, 5)) if (t >= xlo && t <= xhi) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + esc(fmt(t)) + '</text>';
    b += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    if (opt.diagonal) b += '<line class="diag" x1="' + sx(xlo) + '" y1="' + sy(xlo) + '" x2="' + sx(xhi) + '" y2="' + sy(xhi) + '"/>';
    const r = pts.length > 800 ? 3 : 4.5;
    for (const p of pts) b += '<g data-tip="' + esc(p.tip || '') + '">' + marker(p.shape || 'circle', sx(p.x), sy(p.y), r, p.cls || 'dot') + '</g>';
    if (opt.xLabel) b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(opt.xLabel) + '</text>';
    if (opt.yLabel) b += '<text class="lbl-strong" transform="translate(14 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + esc(opt.yLabel) + '</text>';
    el.innerHTML = svg(W, H, opt.label || 'Scatter plot', b);
  }

  // Lines over an ordered x (levels, k values). Shared y-axis when yDomain is given.
  function lines(el, series, opt) {
    opt = opt || {};
    const W = opt.width || widthOf(el), H = opt.height || Math.round(Math.min(300, W * 0.55)), L = 52, R = 16, T = 14, B = 40;
    const all = series.reduce((a, s) => a.concat(s.points), []);
    const xs = all.map(p => p.x);
    let [ylo, yhi] = opt.yDomain || [Math.min(...all.map(p => p.y)), Math.max(...all.map(p => p.y))];
    const d = (yhi - ylo) || 1; ylo -= d * 0.08; yhi += d * 0.08;
    const xlo = Math.min(...xs), xhi = Math.max(...xs);
    const sx = v => (xhi === xlo ? (L + W - R) / 2 : L + 12 + (v - xlo) / (xhi - xlo) * (W - L - R - 24));
    const sy = v => H - B - (v - ylo) / (yhi - ylo) * (H - T - B);
    let b = '';
    for (const t of niceTicks(ylo, yhi, 4)) if (t >= ylo && t <= yhi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + esc(fmt(t)) + '</text>';
    const xt = opt.xTicks || Array.from(new Set(xs)).sort((a, c) => a - c);
    const xLab = opt.xTickFmt || fmt;
    for (const t of xt) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + esc(xLab(t)) + '</text>';
    b += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    series.forEach((s, si) => {
      const cls = s.cls || (si ? 's2' : '');
      b += '<path class="line ' + cls + '" d="' + s.points.map((p, i) => (i ? 'L' : 'M') + sx(p.x) + ' ' + sy(p.y)).join('') + '"/>';
      // noDots: long series (like a loss curve) draw only the highlighted points.
      for (const p of s.points) if (!opt.noDots || p.big) b += '<g data-tip="' + esc(p.tip || (s.name ? s.name + ': ' : '') + fmt(p.y)) + '"><circle class="hit" cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="12"/><circle class="pt ' + cls + '" cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="' + (p.big ? 6.5 : 4.5) + '"/></g>';
    });
    if (opt.xLabel) b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(opt.xLabel) + '</text>';
    if (opt.yLabel) b += '<text class="lbl-strong" transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + esc(opt.yLabel) + '</text>';
    el.innerHTML = svg(W, H, opt.label || 'Line chart', b);
  }

  // Confusion matrix: one steel hue, darker = more rows.
  function confusion(el, cm, classes) {
    const K = classes.length, W = widthOf(el);
    const lab = Math.min(110, 20 + Math.max(...classes.map(c => String(c).length)) * 7);
    const cell = Math.min(80, (W - lab - 30) / K), T = 30, H = T + cell * K + 30;
    const max = Math.max(1, ...cm.map(r => Math.max(...r)));
    let b = '<text class="lbl-strong" x="' + (lab + cell * K / 2) + '" y="14" text-anchor="middle">Predicted</text>';
    classes.forEach((c, j) => { b += '<text x="' + (lab + cell * j + cell / 2) + '" y="' + (T - 4) + '" text-anchor="middle">' + esc(trunc(c, 10)) + '</text>'; });
    cm.forEach((row, i) => {
      b += '<text x="' + (lab - 8) + '" y="' + (T + cell * i + cell / 2 + 4) + '" text-anchor="end">' + esc(trunc(classes[i], 14)) + '</text>';
      const tot = row.reduce((a, c) => a + c, 0) || 1;
      row.forEach((v, j) => {
        const op = 0.08 + 0.85 * v / max;
        b += '<g data-tip="' + esc('Actual ' + classes[i] + ', predicted ' + classes[j] + ': ' + v + ' rows (' + Math.round(100 * v / tot) + '% of actual ' + classes[i] + ')') + '">';
        b += '<rect class="cm" x="' + (lab + cell * j + 1) + '" y="' + (T + cell * i + 1) + '" width="' + (cell - 2) + '" height="' + (cell - 2) + '" rx="3" fill-opacity="' + op.toFixed(3) + '"/>';
        b += '<text class="cm-text' + (op > 0.55 ? ' inv' : '') + '" x="' + (lab + cell * j + cell / 2) + '" y="' + (T + cell * i + cell / 2 + 4) + '" text-anchor="middle">' + v + '</text></g>';
      });
    });
    b += '<text class="lbl-strong" transform="translate(10 ' + (T + cell * K / 2) + ') rotate(-90)" text-anchor="middle">Actual</text>';
    el.innerHTML = svg(Math.max(W, lab + cell * K + 10), H, 'Confusion matrix', b);
  }

  // One shared tooltip for every [data-tip] element on the page.
  function bindTips(tip) {
    const show = (e, text) => {
      tip.textContent = text; tip.hidden = false;
      const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
    };
    // pointerdown as well as pointermove, so a tap shows the tip on touch screens.
    const onPointer = e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t && t.getAttribute('data-tip')) show(e, t.getAttribute('data-tip')); else tip.hidden = true;
    };
    document.addEventListener('pointermove', onPointer);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  }

  function wrap(text, max) {
    const words = String(text).split(' '), out = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
    }
    if (line) out.push(line);
    return out.slice(0, 3).map((l, i, a) => (i === 2 && a.length === 3 && out.length > 3 ? trunc(l, max - 1) + '…' : trunc(l, max)));
  }

  /* Decision tree as a flowchart. opt.question(f, t) -> { q, leftIsYes }, opt.leaf(node) ->
     [line, line], opt.leafClass(node) -> css class, opt.path: Set of nodes to highlight,
     opt.maxDepth: deeper branches collapse into a "more questions" box. */
  function treeDiagram(el, tree, opt) {
    opt = opt || {};
    const colW = opt.colW || 132, rowH = opt.rowH || 92, boxH = 50, maxDepth = opt.maxDepth || 99;
    const nodes = [];
    let leafCount = 0;
    (function walk(node, depth) {
      const v = { node, depth, cut: !node.leaf && depth >= maxDepth };
      nodes.push(v);
      if (node.leaf || v.cut) { v.x = leafCount++ * colW + colW / 2; return v; }
      v.kids = [walk(node.left, depth + 1), walk(node.right, depth + 1)];
      v.x = (v.kids[0].x + v.kids[1].x) / 2;
      return v;
    })(tree, 0);
    const W = Math.max(leafCount * colW, 200), depthMax = Math.max(...nodes.map(n => n.depth));
    const H = (depthMax + 1) * rowH - rowH + boxH + 12;
    const bw = colW - 14, chars = Math.floor(bw / 6.6);
    const path = opt.path || new Set();
    let edges = '', boxes = '';
    for (const v of nodes) {
      const y = v.depth * rowH + 4;
      if (v.kids) {
        const qq = opt.question(v.node.f, v.node.t);
        v.kids.forEach((k, i) => {
          const yes = (i === 0) === qq.leftIsYes;
          const ky = k.depth * rowH + 4, on = path.has(v.node) && path.has(k.node);
          edges += '<path class="tedge' + (on ? ' on' : '') + '" d="M' + v.x + ' ' + (y + boxH) + ' C' + v.x + ' ' + (y + boxH + 22) + ' ' + k.x + ' ' + (ky - 22) + ' ' + k.x + ' ' + ky + '"/>';
          edges += '<text class="tedge-lbl" x="' + ((v.x + k.x) / 2 + (i ? 8 : -8)) + '" y="' + (y + boxH + 20) + '" text-anchor="' + (i ? 'start' : 'end') + '">' + (yes ? 'yes' : 'no') + '</text>';
        });
        const lines = wrap(qq.q, chars);
        boxes += '<g data-tip="' + esc(qq.q + '\n' + v.node.n + ' rows reach this question') + '"><rect class="tnode' + (path.has(v.node) ? ' on' : '') + '" x="' + (v.x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + boxH + '" rx="6"/>';
        lines.forEach((l, i) => { boxes += '<text class="tq" x="' + v.x + '" y="' + (y + boxH / 2 + 4 + (i - (lines.length - 1) / 2) * 14) + '" text-anchor="middle">' + esc(l) + '</text>'; });
        boxes += '</g>';
      } else {
        const lines = v.cut ? ['more questions…', v.node.n + ' rows'] : opt.leaf(v.node);
        const cls = v.cut ? 'cut' : opt.leafClass ? opt.leafClass(v.node) : '';
        boxes += '<g data-tip="' + esc(lines.join('\n')) + '"><rect class="tleaf ' + cls + (path.has(v.node) ? ' on' : '') + '" x="' + (v.x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + boxH + '" rx="' + (boxH / 2) + '"/>';
        lines.slice(0, 2).forEach((l, i) => { boxes += '<text class="' + (i ? 'tsub' : 'tq') + '" x="' + v.x + '" y="' + (y + 21 + i * 15) + '" text-anchor="middle">' + esc(trunc(l, chars)) + '</text>'; });
        boxes += '</g>';
      }
    }
    el.innerHTML = '<svg class="chart tree" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.label || 'Decision tree diagram') + '">' + edges + boxes + '</svg>';
    // Shrinks to fit narrow containers, but never grows past its natural size.
    el.firstChild.style.maxWidth = W + 'px';
  }

  // Histogram with optional spec limits, target and a fitted normal curve.
  function histogram(el, values, opt) {
    opt = opt || {};
    const W = widthOf(el), H = Math.round(Math.min(320, W * 0.55)), L = 46, R = 14, T = 22, B = 40;
    const marks = [opt.lsl, opt.usl, opt.target].filter(v => v !== null && v !== undefined);
    let lo = Math.min(...values, ...marks), hi = Math.max(...values, ...marks);
    const padX = (hi - lo) * 0.06 || 1; lo -= padX; hi += padX;
    const nb = Math.max(8, Math.min(30, Math.round(Math.sqrt(values.length) * 1.5)));
    const bw = (hi - lo) / nb, counts = new Array(nb).fill(0);
    values.forEach(v => { counts[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / bw)))]++; });
    const n = values.length, m = opt.mean, s = opt.sd;
    const curve = s ? Array.from({ length: 80 }, (_, i) => { const x = lo + (hi - lo) * i / 79; return [x, n * bw * Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI))]; }) : [];
    const ymax = Math.max(...counts, ...curve.map(c => c[1])) * 1.08 || 1;
    const sx = v => L + (v - lo) / (hi - lo) * (W - L - R), sy = v => H - B - v / ymax * (H - T - B);
    let b = '';
    for (const t of niceTicks(0, ymax, 4)) if (t <= ymax) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + esc(fmt(t)) + '</text>';
    for (const t of niceTicks(lo, hi, 6)) if (t >= lo && t <= hi) b += '<text x="' + sx(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + esc(fmt(t)) + '</text>';
    counts.forEach((c, i) => {
      const x0 = lo + i * bw, out = (opt.lsl !== null && opt.lsl !== undefined && x0 + bw <= opt.lsl) || (opt.usl !== null && opt.usl !== undefined && x0 >= opt.usl);
      b += '<g data-tip="' + esc(fmt(x0) + ' to ' + fmt(x0 + bw) + ': ' + c + ' rows') + '"><rect class="bar' + (out ? ' out' : '') + '" x="' + (sx(x0) + 1) + '" y="' + sy(c) + '" width="' + Math.max(1, sx(x0 + bw) - sx(x0) - 2) + '" height="' + (sy(0) - sy(c)) + '" rx="2"/></g>';
    });
    b += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(0) + '" y2="' + sy(0) + '"/>';
    if (curve.length) b += '<path class="line" d="' + curve.map((c, i) => (i ? 'L' : 'M') + sx(c[0]).toFixed(1) + ' ' + sy(c[1]).toFixed(1)).join('') + '"/>';
    [['LSL', opt.lsl, 'ref'], ['USL', opt.usl, 'ref'], ['Target', opt.target, 'target-line']].forEach(([lab, v, cls]) => {
      if (v === null || v === undefined) return;
      b += '<line class="' + cls + '" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + sy(0) + '"/><text class="lbl-strong" x="' + sx(v) + '" y="' + (T - 6) + '" text-anchor="middle">' + lab + ' ' + esc(fmt(v)) + '</text>';
    });
    if (opt.xLabel) b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(opt.xLabel) + '</text>';
    el.innerHTML = svg(W, H, opt.label || 'Histogram', b);
  }

  // Control chart: center line, control limits, and flagged points.
  function controlChart(el, ys, opt) {
    const W = widthOf(el), H = opt.height || 230, L = 52, R = 70, T = 12, B = 34;
    const vals = ys.filter(v => v !== null);
    const lo0 = Math.min(...vals, opt.lcl !== null && opt.lcl !== undefined ? opt.lcl : Infinity), hi0 = Math.max(...vals, opt.ucl);
    const pad = (hi0 - lo0) * 0.08 || 1, lo = lo0 - pad, hi = hi0 + pad;
    const sx = i => L + (ys.length > 1 ? i / (ys.length - 1) : 0.5) * (W - L - R), sy = v => H - B - (v - lo) / (hi - lo) * (H - T - B);
    let b = '';
    for (const t of niceTicks(lo, hi, 4)) if (t >= lo && t <= hi) b += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/><text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + esc(fmt(t)) + '</text>';
    [['UCL', opt.ucl, 'ref'], ['CL', opt.cl, 'cl-line'], ['LCL', opt.lcl, 'ref']].forEach(([lab, v, cls]) => {
      if (v === null || v === undefined) return;
      b += '<line class="' + cls + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (W - R + 4) + '" y="' + (sy(v) + 4) + '">' + lab + ' ' + esc(fmt(v)) + '</text>';
    });
    let d = '', started = false;
    ys.forEach((v, i) => { if (v === null) { started = false; return; } d += (started ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1); started = true; });
    b += '<path class="line thin" d="' + d + '"/>';
    const r = ys.length > 200 ? 2.2 : 3.2;
    ys.forEach((v, i) => {
      if (v === null) return;
      const f = opt.flags && opt.flags[i] && opt.flags[i].length;
      b += '<g data-tip="' + esc((opt.rowLabel ? opt.rowLabel(i) + '\n' : '') + fmt(v) + (f ? '\nSignal: ' + opt.flags[i].join(', ') : '')) + '"><circle class="' + (f ? 'pt flag' : 'pt small') + '" cx="' + sx(i) + '" cy="' + sy(v) + '" r="' + (f ? r + 2 : r) + '"/></g>';
    });
    if (opt.yLabel) b += '<text class="lbl-strong" transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + esc(opt.yLabel) + '</text>';
    b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(opt.xLabel || 'Row (time order)') + '</text>';
    el.innerHTML = svg(W, H, opt.label || 'Control chart', b);
  }

  // Horizontal box plots, one per group, on a shared scale; optional spec lines.
  function boxplot(el, groups, opt) {
    opt = opt || {};
    const W = widthOf(el), rowH = 34, T = 22, B = 30;
    const labelChars = Math.min(22, Math.max(...groups.map(g => String(g.label).length), 4));
    const L = Math.min(W * 0.35, 18 + labelChars * 7), R = 18, H = T + groups.length * rowH + B;
    const marks = [opt.lsl, opt.usl].filter(v => v !== null && v !== undefined);
    let lo = Math.min(...groups.map(g => g.stats.min), ...marks), hi = Math.max(...groups.map(g => g.stats.max), ...marks);
    const pad = (hi - lo) * 0.05 || 1; lo -= pad; hi += pad;
    if (opt.domain) [lo, hi] = opt.domain; // a shared scale lines up several box-plot panels
    const sx = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let b = '';
    for (const t of niceTicks(lo, hi, 5)) if (t >= lo && t <= hi) b += '<line class="gridline" x1="' + sx(t) + '" x2="' + sx(t) + '" y1="' + T + '" y2="' + (H - B) + '"/><text x="' + sx(t) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(fmt(t)) + '</text>';
    [['LSL', opt.lsl], ['USL', opt.usl]].forEach(([lab, v]) => { if (v !== null && v !== undefined) b += '<line class="ref" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + (T - 4) + '" y2="' + (H - B) + '"/><text class="lbl-strong" x="' + sx(v) + '" y="' + (T - 8) + '" text-anchor="middle">' + lab + '</text>'; });
    groups.forEach((g, i) => {
      const s = g.stats, y = T + i * rowH + rowH / 2, hh = 9;
      const tip = g.label + ' (' + s.n + ' rows)\nMedian ' + fmt(s.median) + ', middle half ' + fmt(s.q1) + ' to ' + fmt(s.q3) + '\nRange ' + fmt(s.min) + ' to ' + fmt(s.max) + (s.outliers.length ? '\n' + s.outliers.length + ' outlier' + (s.outliers.length > 1 ? 's' : '') : '');
      b += '<g data-tip="' + esc(tip) + '"><rect class="hit" x="0" y="' + (y - rowH / 2) + '" width="' + W + '" height="' + rowH + '"/>';
      b += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(trunc(g.label, labelChars)) + '</text>';
      b += '<line class="whisker" x1="' + sx(s.whiskerLo) + '" x2="' + sx(s.whiskerHi) + '" y1="' + y + '" y2="' + y + '"/>';
      b += '<line class="whisker" x1="' + sx(s.whiskerLo) + '" x2="' + sx(s.whiskerLo) + '" y1="' + (y - 5) + '" y2="' + (y + 5) + '"/><line class="whisker" x1="' + sx(s.whiskerHi) + '" x2="' + sx(s.whiskerHi) + '" y1="' + (y - 5) + '" y2="' + (y + 5) + '"/>';
      b += '<rect class="box" x="' + sx(s.q1) + '" y="' + (y - hh) + '" width="' + Math.max(1.5, sx(s.q3) - sx(s.q1)) + '" height="' + 2 * hh + '" rx="2"/>';
      b += '<line class="median" x1="' + sx(s.median) + '" x2="' + sx(s.median) + '" y1="' + (y - hh) + '" y2="' + (y + hh) + '"/>';
      s.outliers.slice(0, 40).forEach(v => { b += '<circle class="hollow-pt" cx="' + sx(v) + '" cy="' + y + '" r="3"/>'; });
      b += '</g>';
    });
    if (opt.xLabel) b += '<text class="lbl-strong" x="' + ((L + W - R) / 2) + '" y="' + (H + 6) + '" text-anchor="middle">' + esc(opt.xLabel) + '</text>';
    el.innerHTML = svg(W, H + 10, opt.label || 'Box plots', b);
  }

  root.Charts = { hbar, scatter, lines, confusion, legend, bindTips, treeDiagram, histogram, controlChart, boxplot, SHAPES, esc, niceTicks };
})(typeof globalThis !== 'undefined' ? globalThis : this);
