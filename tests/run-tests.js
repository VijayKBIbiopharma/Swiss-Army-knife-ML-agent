/* ML Agent tests. Run with: node --test tests/run-tests.js
   Covers parsing, models, DOE math, the agent's decisions, and a privacy lint that fails
   if code that could send or store data is ever added. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'engine.js'));
const D = require(path.join(ROOT, 'doe.js'));
const A = require(path.join(ROOT, 'agent.js'));
const S = require(path.join(ROOT, 'samples.js'));
const SPC = require(path.join(ROOT, 'spc.js'));

test('CSV parser handles quotes, BOM, tabs and blank lines', () => {
  const t = E.parseCSV('﻿Name,Note,Value\r\n"Smith, J","said ""hi""",3\n\nLee,,4\n');
  assert.deepStrictEqual(t.columns, ['Name', 'Note', 'Value']);
  assert.deepStrictEqual(t.rows, [['Smith, J', 'said "hi"', '3'], ['Lee', '', '4']]);
  const tab = E.parseCSV('a\tb\n1\t2\n');
  assert.deepStrictEqual(tab.columns, ['a', 'b']);
  const semi = E.parseCSV('a;b\n1,5;2\n');
  assert.deepStrictEqual(semi.rows[0], ['1,5', '2']);
});

test('profiling detects numbers, categories, IDs and missing values', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(['ID' + i, String(i * 1.5), i % 3 ? 'A' : 'B', i === 4 ? 'NA' : '1,2' + (i % 10) + '0', '5']);
  const p = E.profile({ columns: ['Sample ID', 'Temp', 'Line', 'Count', 'Const'], rows });
  const kinds = p.columns.map(c => c.kind);
  assert.deepStrictEqual(kinds, ['id', 'numeric', 'categorical', 'numeric', 'constant']);
  assert.strictEqual(p.columns[3].missing, 1);
  assert.strictEqual(p.columns[3].values[0], 1200);
});

test('t-distribution p-values match tables', () => {
  assert.ok(Math.abs(E.tTestP(2.228, 10) - 0.05) < 0.001);
  assert.ok(Math.abs(E.tTestP(1.96, 1e6) - 0.05) < 0.001);
  assert.ok(Math.abs(E.tTestP(0, 5) - 1) < 1e-9);
});

function linearData(n, seed) {
  const rand = E.rng(seed), rows = [];
  for (let i = 0; i < n; i++) {
    const x1 = rand() * 10, x2 = rand() * 5, g = rand() < 0.5 ? 'P' : 'Q';
    rows.push([x1.toFixed(3), x2.toFixed(3), g, (3 * x1 - 2 * x2 + (g === 'Q' ? 4 : 0) + (rand() - 0.5) * 0.5).toFixed(3)]);
  }
  return { columns: ['x1', 'x2', 'grp', 'y'], rows };
}

test('linear regression recovers a known relationship', () => {
  const prof = E.profile(linearData(120, 1));
  const [x1, x2, grp, y] = prof.columns;
  const data = E.supervisedData(prof, y, [x1, x2, grp], 'regression');
  const model = E.MODELS.find(m => m.id === 'linear');
  const folds = E.makeFolds(data.rows.length, 5, E.rng(1));
  const oof = E.crossValidate(model, data, 'regression', folds, 5, 1);
  assert.ok(E.regressionMetrics(data.y, oof).r2 > 0.99);
});

test('every model runs and beats the baseline on a clear signal', () => {
  const prof = E.profile(linearData(150, 2));
  const [x1, x2, grp, y] = prof.columns;
  const data = E.supervisedData(prof, y, [x1, x2, grp], 'regression');
  const folds = E.makeFolds(data.rows.length, 5, E.rng(2));
  for (const m of E.MODELS.filter(m => m.task !== 'classification')) {
    const r2 = E.regressionMetrics(data.y, E.crossValidate(m, data, 'regression', folds, 5, 2)).r2;
    if (m.id === 'baseline') assert.ok(r2 < 0.05, 'baseline ' + r2);
    else assert.ok(r2 > 0.7, m.id + ' r2 ' + r2);
  }
  // Classification: label is whether y is above its median.
  const med = E.median(data.y);
  const cTable = { columns: ['x1', 'x2', 'grp', 'label'], rows: linearData(150, 2).rows.map(r => [r[0], r[1], r[2], Number(r[3]) > med ? 'High' : 'Low']) };
  const cp = E.profile(cTable);
  const cd = E.supervisedData(cp, cp.columns[3], cp.columns.slice(0, 3), 'classification');
  const cf = E.makeFolds(cd.rows.length, 5, E.rng(3), cd.y);
  for (const m of E.MODELS.filter(m => m.task !== 'regression' && (!m.applicable || m.applicable(150, 3, 'classification', 2)))) {
    const met = E.classificationMetrics(cd.y, E.crossValidate(m, cd, 'classification', cf, 5, 3), 2);
    if (m.id === 'baseline') assert.ok(met.balancedAccuracy <= 0.55);
    else assert.ok(met.balancedAccuracy > 0.8, m.id + ' ' + met.balancedAccuracy);
  }
});

test('k-means finds well separated groups', () => {
  const rand = E.rng(5), X = [];
  for (const c of [[0, 0], [10, 10], [0, 10]]) for (let i = 0; i < 30; i++) X.push([c[0] + rand(), c[1] + rand()]);
  const km = E.kmeans(X, 3, E.rng(1), 5);
  for (let g = 0; g < 3; g++) assert.strictEqual(new Set(km.labels.slice(g * 30, g * 30 + 30)).size, 1);
  assert.ok(E.silhouette(X, km.labels, 3, E.rng(1)) > 0.8);
});

test('DOE designs have the right size and balance', () => {
  assert.strictEqual(D.fullFactorial(3).length, 8);
  const half = D.fractional(5, 1);
  assert.strictEqual(half.runs.length, 16);
  assert.strictEqual(half.resolution, 'V');
  const pb = D.plackettBurman(11);
  assert.strictEqual(pb.length, 12);
  for (let j = 0; j < 11; j++) {
    assert.strictEqual(pb.reduce((s, r) => s + r[j], 0), 0, 'column ' + j + ' balanced');
    for (let k = j + 1; k < 11; k++) assert.strictEqual(pb.reduce((s, r) => s + r[j] * r[k], 0), 0, 'columns orthogonal');
  }
  const pb20 = D.plackettBurman(15);
  for (let j = 0; j < 15; j++) for (let k = j + 1; k < 15; k++) assert.strictEqual(pb20.reduce((s, r) => s + r[j] * r[k], 0), 0);
  for (const k of [6, 7, 8]) {
    const f = D.fractional(k, k - 4);
    assert.strictEqual(f.runs.length, 16);
    for (let j = 0; j < k; j++) for (let m = j + 1; m < k; m++) assert.strictEqual(f.runs.reduce((s, r) => s + r[j] * r[m], 0), 0);
  }
  const ccd = D.generate([{ name: 'A', low: 10, high: 20 }, { name: 'B', low: 1, high: 3 }], { type: 'ccd', centerPoints: 5, randomize: false });
  assert.strictEqual(ccd.runs.length, 4 + 4 + 5);
  assert.ok(Math.abs(ccd.runs[4].actual[0] - (15 - 5 * Math.SQRT2)) < 0.01, 'rotatable alpha = 1.414');
  const bbd = D.generate(['A', 'B', 'C'].map(n => ({ name: n, low: 0, high: 1 })), { type: 'bbd', centerPoints: 3, randomize: false });
  assert.strictEqual(bbd.runs.length, 15);
  const cat = D.generate([{ name: 'T', low: 100, high: 200 }, { name: 'Supplier', low: 'North', high: 'East', categorical: true }], { type: 'full', centerPoints: 2, seed: 4 });
  assert.strictEqual(cat.runs.length, 6);
  assert.ok(cat.runs.every(r => ['North', 'East'].includes(r.actual[1])));
  assert.throws(() => D.generate([{ name: 'A', low: 0, high: 1 }], { type: 'bbd' }));
  const csv = D.toCSV(cat, [{ name: 'T' }, { name: 'Supplier' }], 'Yield');
  assert.ok(csv.startsWith('RunOrder,StdOrder,T,Supplier,Yield\n'));
});

test('DOE analysis recovers known effects from a replicated 2^3 factorial', () => {
  const rows = [];
  const rand = E.rng(9);
  for (let rep = 0; rep < 2; rep++) for (const x of D.fullFactorial(3)) {
    const [a, b, c] = x;
    rows.push([String(50 + 10 * a), String(5 + b), c > 0 ? 'Fast' : 'Slow', String(100 + 4 * a - 3 * b + 2 * a * b + (rand() - 0.5) * 0.2)]);
  }
  const prof = E.profile({ columns: ['Temp', 'Time', 'Mode', 'Y'], rows });
  const det = D.detect(prof, prof.columns.slice(0, 3), prof.columns[3]);
  assert.ok(det.isDOE, det.reason);
  const res = D.analyze(det, prof.columns[3]);
  const eff = n => res.terms.find(t => t.name === n);
  assert.ok(Math.abs(eff('Temp').effect - 8) < 0.2);
  assert.ok(Math.abs(eff('Time').effect + 6) < 0.2);
  assert.ok(Math.abs(eff('Temp × Time').effect - 4) < 0.2);
  assert.ok(eff('Temp').p < 0.001 && eff('Mode').p > 0.05);
  assert.strictEqual(res.optimum.max.settings[0].actual, 60);
});

test('DOE analysis flags aliasing in a half fraction', () => {
  const f = D.fractional(4, 1);
  const rows = f.runs.map(x => x.map(String).concat([String(10 + 3 * x[0] + 2 * x[1])]));
  const prof = E.profile({ columns: ['A', 'B', 'C', 'D', 'Y'], rows });
  const det = D.detect(prof, prof.columns.slice(0, 4), prof.columns[4]);
  const res = D.analyze(det, prof.columns[4]);
  assert.ok(res.aliases.length >= 3, 'two-factor interactions are aliased in pairs');
});

test('the agent picks the right task for each practice dataset', async () => {
  const expect = { molding: 'regression', factorial: 'regression', batches: 'classification', loyalty: 'classification', segments: 'clustering' };
  for (const s of S.filter(x => !x.files)) {
    const rep = await A.run(E.parseCSV(s.make()), { target: s.target });
    assert.strictEqual(rep.task, expect[s.id], s.id);
    assert.ok(rep.insights.length > 0 && rep.nextSteps.length > 0);
    if (s.id === 'factorial') {
      assert.ok(rep.doe, 'factorial detected as a DOE');
      const sig = rep.doe.terms.filter(t => t.p < 0.05).map(t => t.name);
      assert.ok(sig.includes('Temperature') && sig.includes('Catalyst') && sig.includes('Temperature × Catalyst'));
    }
    if (s.id === 'molding') {
      assert.ok(rep.best.metrics.r2 > 0.8);
      assert.strictEqual(rep.importance[0].name, 'MeltTemp');
      assert.ok(rep.doeRecommendation && rep.doeRecommendation.factors.length >= 2);
    }
    if (s.id === 'segments') assert.strictEqual(rep.clustering.k, 3);
  }
});

test('the agent gives a clear error instead of crashing on bad input', async () => {
  await assert.rejects(A.run({ columns: ['a', 'b'], rows: [] }, {}), /No data rows/);
  await assert.rejects(A.run(E.parseCSV('id,y\n1,2\n2,3\n3,4\n'), { target: 'y' }), /No usable input|at least 8/);
});

// ---------- Privacy lint ----------
// Fails if any code that could send data off the device or keep it after the tab closes
// appears in the app. The privacy self-test probes are the only allowed exceptions, and
// each such line must carry the PRIVACY-SELF-TEST marker.
test('privacy lint: no network, storage or tracking code', () => {
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /localStorage/, /sessionStorage/,
    /indexedDB/, /document\.cookie/, /serviceWorker/, /new\s+Worker/, /importScripts/, /new\s+Image\b/, /https?:\/\//, /\.src\s*=/, /window\.open/, /postMessage/];
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('PRIVACY-SELF-TEST')) return;
      // Charts become PDF images from an in-memory copy only: a data: URL, never a web address.
      if (line.includes('PRIVACY-LOCAL-IMAGE') && /\.src = 'data:image\/svg\+xml/.test(line) && !/https?:/.test(line)) return;
      /* The sequence optimizer runs in a Web Worker. A worker inherits the page's policy, so
         it can reach no further than the page can, but the file it loads and the messages it
         exchanges still have to be local: only this site's own relative .js files, and
         postMessage only between the page and that worker. */
      if (line.includes('PRIVACY-LOCAL-WORKER')) {
        const code = line.replace(/\/\/.*$/, '');
        assert.ok(!/https?:|\/\//.test(code), 'worker line must not reference another origin: ' + line.trim());
        const paths = [...code.matchAll(/'([^']*\.js)'/g)].map(m => m[1]);
        for (const q of paths) assert.ok(/^[a-z0-9-]+\.js$/.test(q), 'worker may only load this site\'s own files: ' + q);
        assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|document\.cookie/.test(code), 'worker line must not add network or storage: ' + line.trim());
        return;
      }
      const code = line.replace(/\/\/.*$/, '').replace(/'http:\/\/www\.w3\.org\/2000\/svg'/, '');
      for (const re of forbidden) if (re.test(code)) hits.push(f + ':' + (i + 1) + ' ' + re + ' → ' + line.trim());
    });
  }
  assert.deepStrictEqual(hits, []);
  const marked = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n').filter(l => l.includes('PRIVACY-SELF-TEST'));
  assert.ok(marked.every(l => /example\.com|new Image|document\.cookie/.test(l)), 'self-test lines only probe example.com');
});

test('privacy lint: every page locks itself down and loads nothing from other servers', () => {
  for (const page of ['index.html', 'learn.html']) checkPage(page);
});

/* The pages carry the policy in a meta tag; a server may also send it as a header, and a
   browser enforces both. If the two ever disagree the stricter one silently wins, which is
   how a feature works on one host and breaks on another. They must match. */
test('the server configs send the same policy the pages carry', () => {
  const page = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  const rules = page.split(';').map(r => r.trim()).filter(Boolean);
  for (const file of ['web.config', 'DEPLOY.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const policies = [...text.matchAll(/"(default-src[^"]*)"/g)].map(m => m[1]);
    assert.ok(policies.length, file + ' should document the policy');
    for (const p of policies) for (const rule of rules) assert.ok(p.includes(rule), file + ' is missing "' + rule + '"');
  }
});
function checkPage(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  for (const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "script-src 'self'", "img-src data: blob:", "base-uri 'none'"]) {
    assert.ok(csp.includes(rule), 'CSP must include ' + rule);
  }
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), 'no unsafe CSP keywords');
  // Workers, where a page allows them at all, may only come from this site.
  assert.ok(/worker-src '(none|self)'/.test(csp), 'worker-src must be none or self');
  const srcs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const s of srcs) assert.ok(!/^(https?:)?\/\//.test(s), 'external resource: ' + s);
  assert.ok(!/<script>[^<]/.test(html), 'no inline scripts');
  assert.ok(!/\son[a-z]+="/.test(html), 'no inline event handlers');
}

test('round trip: a generated run sheet, once filled in, is analyzed as a DOE', async () => {
  const factors = [{ name: 'Temp', low: 150, high: 180 }, { name: 'Time', low: 30, high: 60 }, { name: 'Supplier', low: 'North', high: 'East', categorical: true }];
  const design = D.generate(factors, { type: 'full', centerPoints: 4, replicates: 1, seed: 3 });
  const rand = E.rng(8);
  const lines = D.toCSV(design, factors, 'Yield').trim().split('\n');
  const filled = [lines[0]].concat(design.runs.map((r, i) => {
    const a = (r.actual[0] - 165) / 15, b = (r.actual[1] - 45) / 15;
    return lines[i + 1] + (60 + 5 * a + 2 * b + (r.actual[2] === 'East' ? 1 : 0) + (rand() - 0.5) * 0.4).toFixed(2);
  })).join('\n');
  const rep = await A.run(E.parseCSV(filled), { target: 'Yield' });
  assert.ok(rep.doe, 'detected as a designed experiment');
  assert.ok(rep.dropped.some(d => d.name === 'RunOrder') && rep.dropped.some(d => d.name === 'StdOrder'));
  const temp = rep.doe.terms.find(t => t.name === 'Temp');
  assert.ok(Math.abs(temp.effect - 10) < 0.5 && temp.p < 0.01);
});

test('action plan turns drivers into plain-English moves', async () => {
  const get = id => S.find(s => s.id === id);
  const mold = await A.run(E.parseCSV(get('molding').make()), { target: 'Yield', goal: 'max' });
  const items = mold.actionPlan.items;
  const temp = items.find(i => i.factor === 'MeltTemp');
  assert.strictEqual(temp.verb, 'Target', 'MeltTemp has a sweet spot');
  const mat = items.find(i => i.factor === 'Material');
  assert.ok(mat && /Resin C/.test(mat.text) && /Resin B/.test(mat.text), 'best and worst material named');
  assert.ok(items.find(i => i.factor === 'Pressure').verb === 'Increase');
  assert.ok(/would average/.test(mold.actionPlan.combined));
  // Flipping the goal flips the advice.
  const low = await A.run(E.parseCSV(get('molding').make()), { target: 'Yield', goal: 'min' });
  assert.strictEqual(low.actionPlan.items.find(i => i.factor === 'Pressure').verb, 'Decrease');

  const doe = await A.run(E.parseCSV(get('factorial').make()), { target: 'Yield' });
  assert.ok(doe.actionPlan.items.some(i => i.factor === 'Temperature' && i.verb === 'Increase'));
  assert.ok(doe.actionPlan.items.some(i => i.verb === 'Combine'), 'interaction becomes a "change together" action');
  assert.ok(doe.actionPlan.quiet.includes('Time'));

  const bat = await A.run(E.parseCSV(get('batches').make()), { target: 'Result' });
  assert.strictEqual(bat.classes[bat.favorable], 'Pass');
  assert.ok(bat.actionPlan.items.some(i => i.factor === 'Temperature' && i.verb === 'Decrease'));
  assert.ok(bat.explain.tree && bat.explain.trees.length === 3);
});

test('favorable outcome is guessed sensibly', () => {
  assert.strictEqual(A.guessFavorable(['Fail', 'Pass']), 1);
  assert.strictEqual(A.guessFavorable(['Late', 'OnTime']), 1);
  assert.strictEqual(A.guessFavorable(['Defect', 'OK']), 1);
  assert.strictEqual(A.guessFavorable(['Churned', 'Stayed']), 1);
  assert.strictEqual(A.guessFavorable(['0', '1']), 1);
});

test('every "learn more" link points to a lesson that exists', () => {
  const X = require(path.join(ROOT, 'explain.js'));
  const learn = fs.readFileSync(path.join(ROOT, 'learn.js'), 'utf8');
  const ids = new Set([...learn.matchAll(/id: '([a-z-]+)', group/g)].map(m => m[1]));
  assert.ok(ids.size >= 20, ids.size + ' lessons');
  for (const t of Object.values(X.MODEL_TOPIC)) assert.ok(ids.has(t), 'model topic ' + t);
  for (const [k, v] of Object.entries(X.READ)) assert.ok(ids.has(v[2]), 'chart ' + k + ' → ' + v[2]);
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'agent.js'), 'utf8');
  for (const m of app.matchAll(/learnLink\('([a-z-]+)'/g)) assert.ok(ids.has(m[1]), 'link ' + m[1]);
  // Links written straight into a page must point at a real lesson too.
  for (const page of ['index.html', 'learn.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/href="learn\.html#([a-z-]+)"/g)) assert.ok(ids.has(m[1]), page + ' links to missing lesson ' + m[1]);
  }
});

test('columns that copy the target (data leakage) are set aside', async () => {
  const rand = E.rng(12), rows = [];
  for (let i = 0; i < 200; i++) {
    const t = 150 + rand() * 100, pass = (t > 190 && rand() > 0.2) ? 'Pass' : 'Fail';
    rows.push([t.toFixed(1), (rand() * 10).toFixed(2), pass === 'Pass' ? 'green' : 'red', pass]);
  }
  const rep = await A.run({ columns: ['Temp', 'Noise', 'Tag', 'Result'], rows }, { target: 'Result' });
  assert.ok(rep.dropped.some(d => d.name === 'Tag' && /copy of the result/.test(d.reason)));
  assert.ok(!rep.features.includes('Tag') && rep.features.includes('Temp'));
  assert.ok(rep.best.metrics.balancedAccuracy < 0.99, 'no fake perfect score');
  // A real but strong driver is not flagged.
  const reg = await A.run(E.parseCSV(S.find(s => s.id === 'molding').make()), { target: 'Yield' });
  assert.ok(!(reg.leaks || []).length);
});

test('PDF writer produces a well-formed file', () => {
  const P = require(path.join(ROOT, 'pdf.js'));
  const doc = P.create({ title: 'Test (report)', footer: 'footer' });
  doc.h1('Heading').p('R² explains 89% of variation − with “quotes”, ≤ and ≥ signs. '.repeat(20)).h2('Table');
  doc.table([['A', 'B'], ['1', 'two'], ['3', 'a much longer cell that has to wrap onto several lines in its column']]);
  for (let i = 0; i < 80; i++) doc.p('Line ' + i, { bullet: '·' });
  doc.band('Increase', 'Raise pressure toward 98', 'Expected change +1.9');
  const bytes = doc.output();
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.strictEqual(s.slice(xref, xref + 4), 'xref');
  const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map(m => Number(m[1]));
  offs.forEach((o, i) => assert.ok(s.startsWith((i + 1) + ' 0 obj', o), 'object ' + (i + 1) + ' offset'));
  assert.ok(/\/Count [2-9]/.test(s), 'long content flows onto more pages');
  assert.ok(s.includes('R\xb2 explains'), 'superscript two kept in WinAnsi');
  assert.ok(!/[\u0100-\uffff]/.test(s), 'single-byte text only');
});

test('target outcome selector: ranked tiers, starting class and no re-training', async () => {
  const rep = await A.run(E.parseCSV(S.find(s => s.id === 'loyalty').make()), { target: 'Tier' });
  const ci = n => rep.classes.indexOf(n);
  assert.strictEqual(rep.classes[rep.favorable], 'Platinum', 'top tier is the default target');
  assert.deepStrictEqual(A.classOrder(rep.classes).map(k => rep.classes[k]), ['Platinum', 'Gold', 'Silver', 'Bronze']);
  const best = rep.best;
  A.retarget(rep, ci('Silver'), ci('Bronze'));
  assert.strictEqual(rep.best, best, 'same model, no re-training');
  assert.deepStrictEqual(rep.favorableSet.map(k => rep.classes[k]).sort(), ['Gold', 'Platinum', 'Silver'], 'Silver means Silver or better');
  const plan = rep.actionPlan;
  assert.ok(/now Tier = Bronze to Silver or better/.test(plan.headline));
  const spend = plan.items.find(i => i.factor === 'MonthlySpend');
  assert.strictEqual(spend.verb, 'Increase');
  assert.ok(/typical Bronze level/.test(spend.text));
  assert.ok(!plan.items.some(i => i.factor === 'Region'), 'Region has no real effect');
  const m = plan.combined.match(/average (\d+)% instead of (\d+)%/);
  assert.ok(m && Number(m[1]) > Number(m[2]), 'levers together help rather than overshoot');
  A.retarget(rep, ci('Gold'), ci('Gold'));
  assert.ok(/keep rows that are now Tier = Gold at Gold or better/.test(rep.actionPlan.headline));
  // Unranked classes keep the exact class.
  const pen = await A.run(E.parseCSV(fs.readFileSync(path.join(ROOT, 'demo-data', 'penguins.csv'), 'utf8')), { target: 'species' });
  A.retarget(pen, pen.classes.indexOf('Chinstrap'), pen.classes.indexOf('Adelie'));
  assert.deepStrictEqual(pen.favorableSet, [pen.classes.indexOf('Chinstrap')]);
  assert.ok(/to Chinstrap,/.test(pen.actionPlan.headline));
});

test('Six Sigma statistics match textbook values', () => {
  assert.ok(Math.abs(SPC.normCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(SPC.normInv(0.975) - 1.96) < 1e-3);
  assert.ok(Math.abs(SPC.normInv(1 - 3.4e-6) - 4.5) < 0.01, '3.4 PPM is 4.5 sigma long term');
  const a = SPC.attribute(9332, 10000);
  assert.ok(Math.abs(a.sigmaLevel - 3) < 0.02, '6.68% defects is 3 sigma');
  // Symmetric data, mean 100, spec 94 to 106.
  const y = []; for (let i = 0; i < 400; i++) y.push(100 + 2 * SPC.normInv((i + 0.5) / 400));
  const c = SPC.capability(y, { lsl: 94, usl: 106, target: 100 }, false);
  assert.ok(Math.abs(c.mean - 100) < 1e-9 && Math.abs(c.Pp - 1) < 0.03 && Math.abs(c.Ppk - c.Pp) < 1e-6, 'Pp = Ppk = 1 when centered at 3 sigma');
  assert.strictEqual(c.Cp, null, 'no short-term Cp without time order');
  assert.ok(Math.abs(c.ppm - 2700) < 250, 'about 2,700 PPM at plus or minus 3 sigma');
  const off = SPC.capability(y.map(v => v + 2), { lsl: 94, usl: 106 }, false);
  assert.ok(off.Ppk < off.Pp - 0.3 && Math.abs(off.centeredCpk - off.Pp) < 1e-9);
  assert.ok(Math.abs(SPC.snRatio([10, 10], 'larger') - 20) < 1e-9 && Math.abs(SPC.snRatio([10, 10], 'smaller') + 20) < 1e-9);
  const t = SPC.taguchi([10, 11, 10, 11, 5, 15, 4, 16], [{ name: 'Supplier', values: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'] }], 'nominal');
  assert.strictEqual(t[0].best.level, 'A', 'the consistent supplier is the robust one');
  const steady = []; const rand = E.rng(2); for (let i = 0; i < 40; i++) steady.push(50 + (rand() - 0.5) * 2 + (i >= 25 ? 3 : 0));
  const m = SPC.imr(steady);
  assert.ok(m.signals.some(s => s.i >= 25), 'a shift is flagged');
  const b = SPC.box([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
  assert.deepStrictEqual(b.outliers, [100]);
});

test('Six Sigma mode in the agent', async () => {
  const get = id => S.find(s => s.id === id);
  const mold = await A.run(E.parseCSV(get('molding').make()), { target: 'Yield', sixSigma: { lsl: 88, usl: 100, target: 95, timeOrdered: true } });
  const c = mold.spc.capability;
  assert.ok(c && c.Cpk < c.Cp && c.verdict === 'not capable');
  assert.ok(mold.spc.imr && mold.spc.boxes.by.some(b => b.name === 'Material') && mold.spc.taguchi.type === 'nominal');
  assert.ok(mold.insights.some(i => /Process capability: Cpk/.test(i.text)));
  assert.ok(mold.nextSteps.some(s => /Gage R&R/.test(s.text)) && mold.nextSteps.some(s => /Center the process/.test(s.title)));
  const plain = await A.run(E.parseCSV(get('molding').make()), { target: 'Yield' });
  assert.strictEqual(plain.spc, undefined, 'standard mode adds nothing');
  const doe = await A.run(E.parseCSV(get('factorial').make()), { target: 'Yield', sixSigma: { lsl: 60 } });
  assert.ok(doe.spc.designed && !doe.spc.imr, 'no control chart on a designed experiment');
  assert.ok(doe.insights.some(i => /designed experiment: its spread/.test(i.text)));
  const bat = await A.run(E.parseCSV(get('batches').make()), { target: 'Result', sixSigma: {} });
  assert.ok(Math.abs(bat.spc.attribute.p - bat.actual.filter(k => bat.classes[k] !== 'Pass').length / bat.actual.length) < 1e-12);
});

test('neural network learns non-linear patterns, stops early and is reproducible', async () => {
  const rand = E.rng(3), X = [], y = [], yc = [];
  for (let i = 0; i < 500; i++) { const a = rand() * 4 - 2, b = rand() * 4 - 2; X.push([a, b]); y.push(Math.sin(a * 2) * b); yc.push(a * a + b * b < 1.5 ? 1 : 0); }
  const run = () => { const t = E.mlpTrainer(X, y, { task: 'regression', rand: E.rng(1) }); while (!t.step(20)); return t; };
  const t1 = run(), m = t1.model();
  assert.ok(E.regressionMetrics(y, m.predict(X)).r2 > 0.95, 'fits sin(2a) * b');
  assert.ok(E.regressionMetrics(y, E.fitRidgeCore(X, y, 1e-6).predict(X)).r2 < 0.1, 'a straight line cannot');
  assert.ok(t1.bestEpoch <= t1.epoch && t1.history.length === t1.epoch && t1.history[0].val !== null);
  assert.deepStrictEqual(run().model().predict(X.slice(0, 5)), m.predict(X.slice(0, 5)), 'same seed, same network');
  const tc = E.mlpTrainer(X, yc, { task: 'classification', nClasses: 2, rand: E.rng(2) }); while (!tc.step(20));
  assert.ok(E.classificationMetrics(yc, tc.model().predict(X), 2).accuracy > 0.95);
  const rep = await A.run(E.parseCSV(S.find(s => s.id === 'molding').make()), { target: 'Yield' });
  const nn = rep.leaderboard.find(b => b.id === 'mlp');
  assert.ok(nn && nn.metrics.r2 > 0.5, 'on the leaderboard with a real score (150 rows is small for a network)');
  assert.ok(rep.nn && rep.nn.history.length > 5 && rep.nn.sizes[1] === 32 && rep.nn.sizes[2] === 16);
  const tiny = await A.run(E.parseCSV(S.find(s => s.id === 'factorial').make()), { target: 'Yield' });
  assert.ok(!tiny.leaderboard.some(b => b.id === 'mlp') && !tiny.nn, 'skipped on tiny data');
});

const M = require(path.join(ROOT, 'merge.js'));
const AU = require(path.join(ROOT, 'audit.js'));
const bioFiles = () => { const s = S.find(x => x.id === 'bioqc'); return s.files.map(f => E.parseCSV(f.make())); };
const joinBio = () => { const [log, qc] = bioFiles(); return M.join(log, qc, { leftKey: 'BatchID', rightKey: 'Batch ID', how: 'inner', bName: 'QC' }); };

test('key-based merge: suggested keys, replicate averaging and unmatched IDs', () => {
  const [log, qc] = bioFiles();
  const sug = M.suggestKeys(log, qc);
  assert.strictEqual(sug[0].left, 'BatchID');
  assert.strictEqual(sug[0].right, 'Batch ID');
  assert.ok(!sug.some(s => /Titer|HMW/.test(s.left + s.right)), 'measured decimals are never suggested as keys');
  const { table, stats } = joinBio();
  assert.strictEqual(stats.matchedKeys, 60);
  assert.strictEqual(stats.outputRows, 60);
  assert.deepStrictEqual(stats.unmatchedLeft, ['B1061', 'B1062', 'B1063', 'B1064']);
  assert.deepStrictEqual(stats.unmatchedRight, ['B1065', 'B1066']);
  assert.deepStrictEqual(stats.droppedReplicateColumns, ['Lane']);
  assert.ok(!table.columns.includes('Lane'));
  // Averaging: the joined purity for B1001 is the mean of its two lanes.
  const lanes = qc.rows.filter(r => r[0] === 'B1001').map(r => Number(r[2]));
  const row = table.rows.find(r => r[0] === 'B1001');
  assert.ok(Math.abs(Number(row[table.columns.indexOf('Purity_Pct')]) - (lanes[0] + lanes[1]) / 2) < 1e-9);
  assert.strictEqual(row[table.columns.indexOf('Analyst')], 'A.R. | J.K.');
  assert.strictEqual(row[table.columns.indexOf('Replicates (QC)')], '2');
  // Keys match after trimming and ignoring case; a left join keeps unmatched rows.
  const a = { columns: ['Lot', 'x'], rows: [[' lot-1 ', '1'], ['LOT-2', '2'], ['LOT-3', '3']] }, b = { columns: ['lot', 'y'], rows: [['LOT-1', '5'], ['lot-2', '6']] };
  assert.strictEqual(M.join(a, b, { leftKey: 'Lot', rightKey: 'lot', how: 'inner' }).table.rows.length, 2);
  const left = M.join(a, b, { leftKey: 'Lot', rightKey: 'lot', how: 'left' });
  assert.strictEqual(left.table.rows.length, 3);
  assert.strictEqual(left.table.rows[2][2], '');
});

test('column roles: analytical results, measurements, record info and dates', () => {
  const p = E.profile({ columns: ['BatchID', 'Temp', 'Time', 'VisitsPerMonth', 'Purity', 'HMW_Pct', 'LMW_Pct', 'RetentionTime', 'MolecularWeight', 'MainBand_kDa', 'Analyst', 'RunDate', 'Yield'],
    rows: Array.from({ length: 30 }, (_, i) => ['B' + i, String(30 + i % 7), String(10 + i % 4), String(i % 9), String(95 + (i % 5) / 2), String(1 + i % 3), String(0.5 + i % 2), String(12 + (i % 4) / 10), String(148 + i % 3), String(150 + i % 2), i % 2 ? 'AB' : 'CD', '2024-01-' + String(1 + i % 28).padStart(2, '0'), String(80 + i % 6)]) });
  const r = A.columnRoles(p);
  const role = n => r[n].role;
  assert.strictEqual(role('Purity'), 'result');
  assert.strictEqual(role('HMW_Pct'), 'result');
  assert.strictEqual(r.HMW_Pct.label, 'result: impurity');
  assert.strictEqual(role('LMW_Pct'), 'result');
  assert.strictEqual(role('Yield'), 'result');
  assert.strictEqual(role('RetentionTime'), 'measurement');
  assert.strictEqual(role('MolecularWeight'), 'measurement');
  assert.strictEqual(role('MainBand_kDa'), 'measurement');
  assert.strictEqual(role('Analyst'), 'meta');
  assert.strictEqual(role('RunDate'), 'time');
  assert.strictEqual(role('Temp'), 'input');
  assert.strictEqual(role('Time'), 'input', 'a numeric Time column is a process setting');
  assert.strictEqual(role('VisitsPerMonth'), 'input');
  assert.strictEqual(A.guessTarget(p), 'Purity');
  assert.deepStrictEqual(A.otherResults(p, 'Purity').sort(), ['Analyst', 'HMW_Pct', 'LMW_Pct', 'MainBand_kDa', 'MolecularWeight', 'RetentionTime', 'RunDate', 'Yield'].sort());
});

test('merged QC data: other results are set aside, so purity is not leaked', async () => {
  const { table } = joinBio();
  const rep = await A.run(table, { target: 'Purity_Pct' });
  assert.ok(!rep.features.includes('HMW_Pct') && !rep.features.includes('LMW_Pct') && !rep.features.includes('Titer_g_L'));
  assert.ok(rep.features.includes('Temp_C'));
  assert.ok(rep.best.metrics.r2 > 0.8 && rep.best.metrics.r2 < 0.999, 'R² ' + rep.best.metrics.r2);
  // Aggregates (HMW) rise with agitation and temperature, fragments (LMW) with harvest day.
  assert.deepStrictEqual(rep.importance.slice(0, 3).map(v => v.name).sort(), ['Agitation_rpm', 'HarvestDay', 'Temp_C']);
});

test('QC spec limits: one-sided LSL on purity', async () => {
  const { table } = joinBio();
  const rep = await A.run(table, { target: 'Purity_Pct', sixSigma: { lsl: 95, usl: null, target: 97, timeOrdered: true } });
  const c = rep.spc.capability;
  assert.strictEqual(c.Cp, null, 'no Cp without both limits');
  assert.strictEqual(c.Pp, null);
  assert.ok(c.Cpk !== null && Math.abs(c.Cpk - c.Cpl) < 1e-12, 'Cpk is the lower side only');
  assert.ok(c.pAbove === 0 && c.ppm > 0);
  assert.ok(c.loss !== null && c.loss > 0, 'Taguchi loss uses the target');
  assert.ok(rep.spc.taguchi && rep.spc.taguchi.type === 'nominal');
});

test('desirability: scores, overall D and a better compromise on the QC data', async () => {
  assert.strictEqual(A.dScore({ goal: 'max', low: 90, high: 98 }, 94), 0.5);
  assert.strictEqual(A.dScore({ goal: 'min', low: 1, high: 3 }, 3.5), 0);
  assert.strictEqual(A.dScore({ goal: 'target', low: 10, high: 20, target: 12 }, 11), 0.5);
  assert.strictEqual(A.dScore({ goal: 'target', low: 10, high: 20, target: 12 }, 16), 0.5);
  assert.strictEqual(A.dOverall([1, 0], [1, 1]), 0, 'one failing result makes D zero');
  assert.ok(Math.abs(A.dOverall([0.25, 1], [1, 1]) - 0.5) < 1e-12);
  assert.ok(Math.abs(A.dOverall([0.25, 1], [2, 1]) - Math.pow(0.25, 2 / 3)) < 1e-12, 'weights tilt the geometric mean');
  const { table } = joinBio();
  const multi = { responses: [
    { name: 'Purity_Pct', goal: 'max', low: 94, high: 97.5, weight: 3 },
    { name: 'Titer_g_L', goal: 'max', low: 2, high: 3.5, weight: 2 },
    { name: 'LMW_Pct', goal: 'min', low: 0.6, high: 1.6, weight: 1 }
  ] };
  const rep = await A.run(table, { target: 'Purity_Pct', multi });
  const d = rep.desirability;
  assert.ok(d && d.specs.length === 3);
  assert.ok(!rep.features.includes('Titer_g_L') && !rep.features.includes('LMW_Pct'), 'optimized results are never inputs');
  assert.ok(d.best.D > d.typical.D + 0.1, 'D ' + d.typical.D + ' → ' + d.best.D);
  assert.ok(Number.isInteger(d.best.values.HarvestDay) && Number.isInteger(d.best.values.Agitation_rpm), 'whole-number inputs stay whole');
  const again = d.evaluate(d.best.values);
  assert.ok(Math.abs(again.D - d.best.D) < 1e-9);
  assert.ok(rep.nextSteps.some(s => /compromise/.test(s.title)));
  await assert.rejects(A.run(table, { target: 'Purity_Pct', multi: { responses: [{ name: 'Purity_Pct', goal: 'max', low: 98, high: 94 }, { name: 'Titer_g_L', goal: 'max', low: 2, high: 3 }] } }), /low value must be below/);
});

test('audit package: SHA-256, zip and xlsx structure, audit trail content', async () => {
  assert.strictEqual(AU.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(AU.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(AU.sha256('a'.repeat(1000)), require('node:crypto').createHash('sha256').update('a'.repeat(1000)).digest('hex'));
  const z = AU.zip([{ name: 'a.txt', data: 'hello' }, { name: 'b/c.txt', data: 'world!' }]);
  const dv = new DataView(z.buffer);
  assert.strictEqual(dv.getUint32(0, true), 0x04034b50);
  assert.strictEqual(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.strictEqual(dv.getUint16(z.length - 12, true), 2, 'two entries');
  assert.strictEqual(dv.getUint32(14, true), AU.crc32(AU.utf8('hello')));

  const [log, qc] = bioFiles();
  const { table, stats } = joinBio();
  const opts = { target: 'Purity_Pct', sixSigma: { lsl: 95, usl: null, target: null, timeOrdered: true }, multi: { responses: [{ name: 'Purity_Pct', goal: 'max', low: 94, high: 97.5, weight: 1 }, { name: 'LMW_Pct', goal: 'min', low: 0.6, high: 1.6, weight: 1 }] } };
  const rep = await A.run(table, opts);
  const src = (name, t) => ({ name, bytes: 100, rows: t.rows.length, cols: t.columns.length, sha256: AU.sha256(name) });
  const ctx = { sources: [src('log.csv', log), src('qc.csv', qc)], merge: Object.assign({ left: 'log.csv', right: 'qc.csv', leftKey: 'BatchID', rightKey: 'Batch ID' }, stats), options: opts, when: new Date(Date.UTC(2026, 0, 2)), table };
  const tr = AU.trail(rep, ctx), txt = AU.trailText(tr);
  for (const want of ['Input files', 'Merge (join)', 'Analysis settings', 'Agent log', 'Data handling', 'Review and approval', 'SHA-256 ' + AU.sha256('qc.csv'), 'Lane', 'B1065', 'cross-validation', 'Not a validated GxP system', 'LSL 95', 'Random seed']) assert.ok(txt.includes(want), 'audit trail mentions ' + want);
  const sh = AU.sheets(rep, ctx), names = sh.map(s => s.name);
  for (const n of ['Summary', 'Audit trail', 'Columns', 'Models', 'Drivers', 'Capability', 'Control chart', 'Desirability', 'Data analyzed']) assert.ok(names.includes(n), 'sheet ' + n);
  const models = sh.find(s => s.name === 'Models').rows;
  assert.strictEqual(typeof models[1][1], 'number', 'scores stay numbers');
  assert.strictEqual(sh.find(s => s.name === 'Data analyzed').rows.length, table.rows.length + 1);
  const book = AU.xlsx(sh, { title: 'Test' });
  assert.strictEqual(new DataView(book.buffer).getUint32(0, true), 0x04034b50);
  const text = Buffer.from(book).toString('latin1');
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet' + sh.length + '.xml']) assert.ok(text.includes(part), part);
  assert.ok(text.includes('<sheet name="Audit trail"'));
});

const CD = require(path.join(ROOT, 'codon.js'));
const GA = require(path.join(ROOT, 'ga.js'));

test('genetic code: translation, synonyms and reverse complement', () => {
  assert.strictEqual(Object.keys(CD.CODE).length, 64);
  assert.strictEqual(CD.CODE.ATG, 'M');
  assert.strictEqual(CD.CODE.TGG, 'W');
  assert.deepStrictEqual(['TAA', 'TAG', 'TGA'].map(c => CD.CODE[c]), ['*', '*', '*']);
  assert.strictEqual(CD.translate('ATGGCCTGCGATTAA'), 'MACD*');
  assert.strictEqual(CD.SYN.L.length, 6);
  assert.strictEqual(CD.SYN.R.length, 6);
  assert.strictEqual(CD.SYN.S.length, 6);
  assert.strictEqual(CD.SYN.M.length, 1);
  assert.strictEqual(CD.SYN.W.length, 1);
  // Every codon maps back to the amino acid whose synonym list holds it.
  for (const c of Object.keys(CD.CODE)) assert.ok(CD.SYN[CD.CODE[c]].includes(c));
  assert.strictEqual(CD.revComp('GGTCTC'), 'GAGACC');
  assert.strictEqual(CD.clean('  atg gcc\nu  '), 'ATGGCCT');
});

test('CAI, GC content and 5-prime folding behave as defined', () => {
  const w = CD.relativeAdaptiveness('E_coli');
  // The host's favourite codon for an amino acid scores 1 by definition.
  assert.strictEqual(w.CTG, 1);
  assert.strictEqual(w.AAA, 1);
  assert.ok(w.CTA < 0.1 && w.CTA > 0);
  // A gene built only from favourite codons has CAI 1; swapping in rare ones drops it.
  const best = 'ATG' + 'CTG'.repeat(10) + 'AAA'.repeat(10) + 'TAA';
  const worst = 'ATG' + 'CTA'.repeat(10) + 'AAG'.repeat(10) + 'TAA';
  assert.ok(Math.abs(CD.cai(best, w) - 1) < 1e-12);
  assert.ok(CD.cai(worst, w) < 0.4);
  // Met, Trp and the stop carry no choice, so a gene of only those is undefined, not zero.
  assert.strictEqual(CD.cai('ATGTGGTAA', w), 0);

  assert.strictEqual(CD.gcOf('GGCC'), 1);
  assert.strictEqual(CD.gcOf('ATAT'), 0);
  const p = CD.gcProfile('G'.repeat(50) + 'A'.repeat(50), { gcLow: 0.45, gcHigh: 0.55, gcWindow: 50, gcStep: 50 });
  assert.strictEqual(p.overall, 0.5);
  assert.ok(!p.ok, 'two halves at 100% and 0% must fail the window test even though the mean is 50%');
  assert.ok(Math.abs(p.worstWindow - 0.45) < 1e-9);
  assert.ok(CD.gcProfile('GCAT'.repeat(25), { gcLow: 0.45, gcHigh: 0.55, gcWindow: 50, gcStep: 10 }).ok);

  // A perfect hairpin pairs with itself far more than a sequence that cannot pair at all.
  const stem = 'GGGGGGGGGG', loop = 'TTTT';
  assert.ok(CD.foldScore(stem + loop + CD.revComp(stem)) > CD.foldScore('AAAAAAAAAAAAAAAAAAAAAAAA'));
  assert.strictEqual(CD.foldScore('AAAAAAAAAAAA'), 0, 'A cannot pair with A');
});

test('restriction sites are found on both strands, with homopolymer runs', () => {
  const motifs = CD.motifList(['EcoRI', 'BsaI', 'gaattc']);
  const dna = 'AAAGAATTCAAA' + 'GGTCTC' + 'TTT' + 'GAGACC' + 'TTT' + 'CCCCCCCC';
  const hits = CD.findMotifs(dna, motifs, 6);
  const labels = hits.map(x => x.label);
  assert.ok(labels.includes('EcoRI'));
  assert.ok(labels.includes('BsaI'), 'BsaI on the top strand');
  assert.ok(labels.includes('BsaI (bottom strand)'), 'BsaI is not a palindrome: GAGACC cuts too');
  assert.ok(labels.some(l => /^C run/.test(l)), 'an 8-base C run is flagged when the limit is 6');
  assert.strictEqual(CD.findMotifs(dna, motifs, 0).filter(x => /run/.test(x.label)).length, 0, 'runs are off when the limit is 0');
  assert.strictEqual(CD.findMotifs('ACGTACGT', motifs, 6).length, 0);
});

test('a sequence that is not a clean coding sequence is refused with a reason', () => {
  assert.throws(() => GA.plan({ dna: 'ATGGCCT' }), /whole number of codons/);
  assert.throws(() => GA.plan({ dna: '' }), /No DNA sequence/);
  assert.throws(() => GA.plan({ dna: 'ATGTAAGCCTAA' }), /stop codon appears at codon 2/);
  const p = GA.plan({ dna: 'ATGCTGTGGTAA' });
  assert.deepStrictEqual(p.positions.map(x => x.fixed), [true, false, true, true], 'Met, Trp and the stop have nothing to choose');
});

test('codon optimization: same protein, higher CAI, sites removed, GC in window', () => {
  // A gene built from the codons CHO uses least, carrying an EcoRI site and a BsaI site.
  const r = GA.rng(5), aas = 'ACDEFGHIKLMNPQRSTVY';
  let dna = 'ATG';
  for (let i = 0; i < 200; i++) {
    const aa = aas[Math.floor(r() * aas.length)], syn = CD.SYN[aa].slice().sort((x, y) => CD.TABLES.CHO.usage[x] - CD.TABLES.CHO.usage[y]);
    dna += syn[0];
  }
  dna = dna.slice(0, 30) + 'GAATTC' + dna.slice(36);
  dna = dna.slice(0, 120) + 'GGTCTC' + dna.slice(126);
  dna += 'TGA';
  const job = { dna, host: 'CHO', gcLow: 0.45, gcHigh: 0.55, avoid: ['EcoRI', 'BsaI'], maxRun: 6, popSize: 60, generations: 120, seed: 42 };

  const run = GA.create(job);
  const before = run.state.baseline;
  assert.ok(before.violations >= 2, 'the starting sequence carries the planted sites');
  run.step(120);
  const res = run.result();

  assert.strictEqual(CD.translate(res.dna), CD.translate(dna), 'the protein must be identical');
  assert.ok(res.proteinUnchanged);
  assert.strictEqual(res.dna.length, dna.length);
  assert.strictEqual(res.dna.slice(-3), 'TGA', 'the stop codon is left as it came in');
  assert.strictEqual(res.after.violations, 0, 'every forbidden site is gone');
  assert.ok(res.after.cai > res.before.cai + 0.25, 'CAI ' + res.before.cai + ' -> ' + res.after.cai);
  assert.ok(res.after.cai > 0.8);
  assert.ok(res.after.gc >= 0.45 && res.after.gc <= 0.55, 'GC ' + res.after.gc);
  assert.strictEqual(CD.findMotifs(res.dna, CD.motifList(['EcoRI', 'BsaI']), 6).length, 0);
  // The Pareto front is a set of genuine trade-offs, sorted best-CAI first.
  assert.ok(res.front.length > 1);
  assert.ok(res.front.every(f => f.cai > 0 && f.dna.length === dna.length));
  assert.ok(res.history.length === res.generations + 1 && res.history[res.history.length - 1].best >= res.history[0].best);

  // Same seed, same answer: a run can be repeated and checked.
  const again = GA.create(job); again.step(120);
  assert.strictEqual(again.result().dna, res.dna);
  // A different host pulls the sequence somewhere else.
  const ecoli = GA.create(Object.assign({}, job, { host: 'E_coli' })); ecoli.step(120);
  const eRes = ecoli.result();
  assert.strictEqual(CD.translate(eRes.dna), CD.translate(dna));
  assert.notStrictEqual(eRes.dna, res.dna);
  assert.ok(CD.cai(eRes.dna, CD.relativeAdaptiveness('E_coli')) > CD.cai(res.dna, CD.relativeAdaptiveness('E_coli')),
    'optimizing for E. coli beats the CHO sequence on the E. coli table');
});

test('the optimizer never silently keeps a forbidden site it cannot remove', () => {
  // TGG (Trp) is the only codon for W, so a planted TGGTGG cannot be designed out.
  const dna = 'ATG' + 'TGGTGG' + 'GCCGCCGCCGCC' + 'TAA';
  const run = GA.create({ dna, host: 'HEK293', gcLow: 0.4, gcHigh: 0.6, avoid: ['TGGTGG'], maxRun: 6, popSize: 20, generations: 20, seed: 1 });
  run.step(20);
  const res = run.result();
  assert.strictEqual(res.after.violations, 1, 'the impossible site is still reported, not hidden');
  assert.strictEqual(CD.translate(res.dna), CD.translate(dna));
});

const ST = require(path.join(ROOT, 'stability.js'));
const stabRows = (specs, noise, seed, times) => {
  const r = E.rng(seed), out = [];
  for (const s of specs) for (const t of (times || [0, 3, 6, 9, 12, 18, 24])) out.push({ batch: s.b, time: t, y: s.i + s.m * t + (r() - 0.5) * (noise || 0) });
  return out;
};

test('F and t distributions match published tables', () => {
  // F(0.05; 3, 10) = 3.708; F(0.025; 4, 12) = 4.121; t(0.95; 10) = 1.8125; t(0.975; 20) = 2.0860
  assert.ok(Math.abs(ST.fTestP(3.708, 3, 10) - 0.05) < 1e-4);
  assert.ok(Math.abs(ST.fTestP(4.121, 4, 12) - 0.025) < 1e-4);
  assert.ok(Math.abs(ST.tQuantile(0.05, 10) - 1.8125) < 1e-4);
  assert.ok(Math.abs(ST.tQuantile(0.025, 20) - 2.0860) < 1e-4);
  assert.strictEqual(ST.fTestP(0, 1, 1), 1);
});

test('shelf life: a noiseless line crosses the spec exactly where algebra says', () => {
  // 100 - 0.5t meets 95 at t = 10. With no scatter the confidence limit is the line itself.
  const rows = [0, 3, 6, 9, 12, 18].map(t => ({ batch: 'B1', time: t, y: 100 - 0.5 * t }));
  const r = ST.analyze(rows, { lsl: 95, direction: 'decreasing' });
  assert.ok(Math.abs(r.curves[0].slope + 0.5) < 1e-9);
  assert.ok(Math.abs(r.shelfLife - 10) < 1e-6, 'shelf life ' + r.shelfLife);
  // An impurity rising to an upper limit is the mirror image.
  const imp = [0, 3, 6, 9, 12].map(t => ({ batch: 'B1', time: t, y: 0.5 + 0.25 * t }));
  assert.ok(Math.abs(ST.analyze(imp, { usl: 5, direction: 'increasing' }).shelfLife - 18) < 1e-6);
});

test('the confidence limit is the textbook one, and more scatter shortens the shelf life', () => {
  const rows = stabRows([{ b: 'B1', i: 100, m: -0.2 }], 1.2, 5);
  const r = ST.analyze(rows, { lsl: 95, direction: 'decreasing' });
  const c = r.curves[0];
  // At the mean time the band is exactly t * s / sqrt(n) wide.
  const expected = c.fit(c.tBar) - c.tq * c.s / Math.sqrt(c.nB);
  assert.ok(Math.abs(c.lower(c.tBar) - expected) < 1e-9);
  assert.ok(c.lower(0) < c.fit(0) && c.upper(0) > c.fit(0));
  // Away from the mean the band is wider: that is why extrapolation costs shelf life.
  assert.ok(c.fit(0) - c.lower(0) > c.fit(c.tBar) - c.lower(c.tBar));
  let previous = Infinity;
  for (const noise of [0.1, 0.8, 2.5]) {
    const s = ST.analyze(stabRows([{ b: 'B1', i: 100, m: -0.2 }], noise, 5), { lsl: 95, direction: 'decreasing' }).shelfLife;
    assert.ok(s < previous, 'noise ' + noise + ' gave ' + s + ', not shorter than ' + previous);
    previous = s;
  }
});

test('ICH Q1E poolability: the three models are chosen for the right reasons', () => {
  const opt = { lsl: 95, direction: 'decreasing' };
  const SAME = [{ b: 'A', i: 99.5, m: -0.16 }, { b: 'B', i: 99.45, m: -0.16 }, { b: 'C', i: 99.55, m: -0.16 }];
  // Same rate, same start, realistic scatter: everything pools into one line.
  const same = ST.analyze(stabRows(SAME, 0.55, 1), opt);
  assert.strictEqual(same.model, 'C');
  assert.strictEqual(same.tests.length, 2);
  assert.ok(same.tests.every(t => t.pass && t.p >= 0.25));

  /* Q1E's 0.25 level means the slope test wrongly splits identical batches about a quarter
     of the time, by design. Over twenty studies the rate has to land near that, or the test
     is not doing what Q1E describes. (Expect ~15 of 20 slope-pooled, ~11 fully pooled.) */
  let slopesPooled = 0, fullyPooled = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = ST.analyze(stabRows(SAME, 0.55, seed), opt);
    if (r.tests[0].pass) slopesPooled++;
    if (r.model === 'C') fullyPooled++;
  }
  assert.ok(slopesPooled >= 10, slopesPooled + ' of 20 pooled on slope, expected about 15');
  assert.ok(fullyPooled >= 6, fullyPooled + ' of 20 fully pooled, expected about 11');
  assert.ok(slopesPooled < 20, 'at this level some identical batches must still be split');

  // Same rate, clearly different starting levels: a common slope, separate intercepts.
  const offset = ST.analyze(stabRows([{ b: 'A', i: 99.5, m: -0.16 }, { b: 'B', i: 97.5, m: -0.16 }, { b: 'C', i: 101, m: -0.16 }], 0.3, 1), opt);
  assert.strictEqual(offset.model, 'B');
  assert.ok(offset.tests[0].pass && !offset.tests[1].pass);

  // Clearly different rates: no pooling at all, and the fastest decline decides.
  const spread = ST.analyze(stabRows([{ b: 'A', i: 99.5, m: -0.09 }, { b: 'B', i: 99.4, m: -0.22 }, { b: 'C', i: 99.5, m: -0.36 }], 0.25, 4), opt);
  assert.strictEqual(spread.model, 'A');
  assert.ok(!spread.tests[0].pass && spread.tests[0].p < 0.25);
  assert.strictEqual(spread.tests.length, 1, 'once slopes differ there is no point testing intercepts');
  assert.strictEqual(spread.limiting.name, 'C', 'the fastest-degrading batch sets the shelf life');
  assert.ok(spread.shelfLife <= Math.min.apply(null, spread.batches.map(b => b.alone)) + 1e-6);

  /* The level is a dial on how readily batches are split. Seed 4 is one of the studies that
     the 0.25 level splits (p 0.073) although the true slopes are identical; at a lower level
     the same data pools. Q1E chooses 0.25 precisely to err towards splitting, because
     splitting gives the shorter, more conservative shelf life. */
  const borderline = stabRows(SAME, 0.55, 4);
  const atQ1E = ST.analyze(borderline, opt);
  const atLoose = ST.analyze(borderline, Object.assign({}, opt, { poolAlpha: 0.001 }));
  assert.strictEqual(atQ1E.model, 'A');
  assert.strictEqual(atLoose.model, 'C');
  assert.ok(atQ1E.shelfLife < atLoose.shelfLife, 'splitting must give the shorter shelf life');
});

test('pooling buys shelf life, and every batch is also reported on its own', () => {
  const specs = [{ b: 'A', i: 99.5, m: -0.16 }, { b: 'B', i: 99.45, m: -0.16 }, { b: 'C', i: 99.55, m: -0.16 }];
  const r = ST.analyze(stabRows(specs, 0.55, 1), { lsl: 95, direction: 'decreasing' });
  assert.strictEqual(r.model, 'C');
  assert.strictEqual(r.batches.length, 3);
  // Every batch gets its own estimate whatever the pooling decision, and pooling (three
  // times the data, so a tighter band) must not come out worse than the best single batch.
  assert.ok(r.batches.every(b => b.alone !== null && b.alone > 0));
  assert.ok(r.shelfLife > Math.max.apply(null, r.batches.map(b => b.alone)));
});

test('Q1E extrapolation cap and out-of-spec data are reported honestly', () => {
  // Barely any decline over 12 months: the statistics run far past the data.
  const slow = ST.analyze(stabRows([{ b: 'A', i: 99.9, m: -0.02 }], 0.05, 9, [0, 3, 6, 9, 12]), { lsl: 95, direction: 'decreasing' });
  assert.ok(slow.shelfLife > slow.allowed, 'statistical ' + slow.shelfLife);
  assert.strictEqual(slow.allowed, 24, 'twice 12 months, and no more than 12 beyond');
  assert.strictEqual(slow.reported, 24);
  assert.ok(slow.capped && slow.extrapolated);

  // Inside the data there is nothing to cap.
  const fast = ST.analyze(stabRows([{ b: 'A', i: 99.5, m: -0.5 }], 0.1, 9), { lsl: 95, direction: 'decreasing' });
  assert.ok(!fast.extrapolated && !fast.capped && fast.reported === fast.shelfLife);

  // Material already below the limit on day one gets zero, not a negative number.
  const bad = ST.analyze([0, 3, 6].map(t => ({ batch: 'A', time: t, y: 94 - 0.2 * t })), { lsl: 95, direction: 'decreasing' });
  assert.strictEqual(bad.shelfLife, 0);
  assert.ok(bad.startsOutOfSpec);
});

test('stability input is checked before anything is fitted', () => {
  const rows = stabRows([{ b: 'A', i: 99, m: -0.1 }], 0.2, 2);
  assert.throws(() => ST.analyze(rows, {}), /specification limit/);
  assert.throws(() => ST.analyze(rows, { lsl: 99, usl: 95 }), /lower limit must be below/);
  assert.throws(() => ST.analyze([{ batch: 'A', time: 0, y: 1 }], { lsl: 0 }), /at least 3 time points/);
  assert.throws(() => ST.analyze([0, 1, 2].map(() => ({ batch: 'A', time: 0, y: 99 })), { lsl: 95 }), /only one time point/);
  /* Rows with no number are dropped rather than poisoning the fit. This matters more than
     it looks: isFinite(null) and isFinite('') are both true in JavaScript, so a blank result
     cell would otherwise be fitted as a zero and wreck the slope. */
  const dirty = rows.concat([{ batch: 'A', time: NaN, y: 99 }, { batch: 'A', time: 6, y: null }, { batch: 'A', time: 9, y: '' }, { batch: 'A', time: null, y: 98 }, { batch: 'A', time: 3, y: 'n/a' }]);
  const kept = ST.analyze(dirty, { lsl: 95, direction: 'decreasing' });
  assert.strictEqual(kept.rows.length, rows.length);
  assert.ok(kept.rows.every(p => p.y > 90), 'a blank result must never be read as zero');
  // Numbers arriving as text are still numbers.
  assert.strictEqual(ST.analyze([{ batch: 'A', time: '0', y: '100' }, { batch: 'A', time: '6', y: '98' }, { batch: 'A', time: '12', y: '96' }], { lsl: 95, direction: 'decreasing' }).rows.length, 3);
});

const TT = require(path.join(ROOT, 'tost.js'));
const twoGroups = (ref, test, withIds) => ref.map((v, i) => ({ group: 'A', value: v, sample: withIds ? 'S' + i : '' }))
  .concat(test.map((v, i) => ({ group: 'B', value: v, sample: withIds ? 'S' + i : '' })));
const REF10 = [100, 101, 99, 100.5, 99.5, 100.2, 99.8, 100.1, 100.3, 99.7];

test('TOST: the exact boundary cases land where algebra says', () => {
  // When the observed difference sits exactly on the margin, that one-sided test is a coin
  // flip: t = 0, so p = 0.5 precisely.
  const atUpper = TT.analyze(twoGroups(REF10, REF10.map(v => v + 2)), { reference: 'A', test: 'B', margin: 2 });
  assert.ok(Math.abs(atUpper.diff - 2) < 1e-12);
  assert.ok(Math.abs(atUpper.p2 - 0.5) < 1e-9, 'p2 ' + atUpper.p2);
  assert.ok(!atUpper.equivalent);
  const atLower = TT.analyze(twoGroups(REF10, REF10.map(v => v - 2)), { reference: 'A', test: 'B', margin: 2 });
  assert.ok(Math.abs(atLower.p1 - 0.5) < 1e-9);

  // With no difference at all and a margin of exactly t(0.95,df) x SE, both tests sit on the
  // 0.05 line, which is the definition of the boundary of equivalence.
  const probe = TT.analyze(twoGroups(REF10, REF10.slice()), { reference: 'A', test: 'B', margin: 1 });
  const edge = TT.analyze(twoGroups(REF10, REF10.slice()), { reference: 'A', test: 'B', margin: E.tQuantile(0.05, probe.df) * probe.se });
  assert.ok(Math.abs(edge.p1 - 0.05) < 1e-6 && Math.abs(edge.p2 - 0.05) < 1e-6, edge.p1 + ' / ' + edge.p2);
  assert.ok(Math.abs(edge.diff) < 1e-12);
});

test('TOST and the confidence interval always say the same thing', () => {
  /* The whole point of TOST is that "both one-sided tests pass at alpha" and "the
     100(1-2a)% interval fits inside the margins" are one statement. If these ever disagree
     the module is wrong, so it is checked over a few hundred shapes of data. */
  const r = E.rng(7);
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const n1 = 3 + Math.floor(r() * 12), n2 = 3 + Math.floor(r() * 12), shift = (r() - 0.5) * 6, sd = 0.5 + r() * 3;
    const a = [], b = [];
    for (let j = 0; j < n1; j++) a.push(100 + (r() - 0.5) * sd * 3.4);
    for (let j = 0; j < n2; j++) b.push(100 + shift + (r() - 0.5) * sd * 3.4);
    const res = TT.analyze(twoGroups(a, b), { reference: 'A', test: 'B', margin: 0.5 + r() * 5 });
    const byInterval = res.ciLow > -res.margin && res.ciHigh < res.margin;
    assert.strictEqual(byInterval, res.equivalent, 'disagreement at i=' + i);
    checked++;
  }
  assert.strictEqual(checked, 400);
});

test('TOST reports three outcomes, and tells "not proven" from "different"', () => {
  const opt = { reference: 'A', test: 'B', margin: 2 };
  const PRECISE = [100, 100.3, 99.8, 100.1, 99.9, 100.2, 99.7, 100.4, 100, 99.95];

  // Tight agreement: the interval is a fraction of the margin.
  const tight = TT.analyze(twoGroups(PRECISE, [100.1, 100.2, 99.9, 100.3, 100, 100.1, 99.8, 100.2, 100.05, 100]), opt);
  assert.strictEqual(tight.verdict, 'equivalent');
  assert.ok(tight.equivalent && tight.bandUsed < 0.2 && tight.needed === null);

  // A 3-unit bias against a 2-unit margin: a real difference, and too big to accept.
  const biased = TT.analyze(twoGroups(PRECISE, PRECISE.map(v => v + 3)), opt);
  assert.strictEqual(biased.verdict, 'different');
  assert.ok(biased.differs && !biased.equivalent);
  assert.strictEqual(biased.needed, null, 'no sample size rescues a difference bigger than the margin');

  /* Five noisy results each: neither equivalent nor different. This is the case people
     wrongly write up as "no significant difference, therefore the methods are the same" —
     the ordinary t-test is quiet (p 0.69) precisely because the study is too small. */
  const thin = TT.analyze(twoGroups([98, 102, 99, 103, 100], [99, 103, 98, 104, 101]), opt);
  assert.strictEqual(thin.verdict, 'inconclusive');
  assert.ok(!thin.equivalent && !thin.differs);
  assert.ok(thin.ciLow < -thin.margin && thin.ciHigh > 0, 'the interval runs past the margin but still covers zero');
  assert.ok(thin.pDiff > 0.05, 'the ordinary t-test is quiet here, which is exactly the trap');
  assert.strictEqual(thin.needed, 16, 'it should say how many results per method would settle it');
});

test('TOST: pairing, percentage margins, and the invariances that must hold', () => {
  const rnd = E.rng(21);
  const norm = () => { const u = Math.max(1e-12, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const truth = 90 + norm() * 6;              // samples differ a lot from each other
    rows.push({ group: 'A', value: truth + norm() * 0.25, sample: 'S' + i });
    rows.push({ group: 'B', value: truth + 0.3 + norm() * 0.25, sample: 'S' + i });
  }
  const paired = TT.analyze(rows, { reference: 'A', test: 'B', margin: 2, paired: true });
  const unpaired = TT.analyze(rows, { reference: 'A', test: 'B', margin: 2 });
  assert.ok(Math.abs(paired.diff - unpaired.diff) < 1e-9, 'the mean difference is the same either way');
  // Pairing removes sample-to-sample spread, so the same data becomes far more conclusive.
  assert.ok(paired.se < unpaired.se / 5);
  assert.strictEqual(paired.verdict, 'equivalent');
  assert.strictEqual(unpaired.verdict, 'inconclusive');
  assert.strictEqual(paired.df, 11);
  assert.strictEqual(paired.pairs.length, 12);

  // A percentage margin is a percentage of the reference mean.
  const pct = TT.analyze(rows, { reference: 'A', test: 'B', margin: 3, marginType: 'percent' });
  assert.ok(Math.abs(pct.margin - Math.abs(pct.refStats.mean) * 0.03) < 1e-9);

  // Swapping which method is the reference flips the sign and nothing else.
  const flipped = TT.analyze(rows, { reference: 'B', test: 'A', margin: 2 });
  assert.ok(Math.abs(flipped.diff + unpaired.diff) < 1e-9);
  assert.strictEqual(flipped.verdict, unpaired.verdict);
  assert.ok(Math.abs(flipped.pTost - unpaired.pTost) < 1e-9);

  // Changing the unit of measurement changes nothing that matters.
  const scaled = rows.map(x => ({ group: x.group, value: x.value * 1000, sample: x.sample }));
  const big = TT.analyze(scaled, { reference: 'A', test: 'B', margin: 2000 });
  assert.ok(Math.abs(big.pTost - unpaired.pTost) < 1e-9);
  assert.strictEqual(big.verdict, unpaired.verdict);

  // Welch and pooled agree exactly when the groups are the same size and spread.
  const even = twoGroups(REF10, REF10.map(v => v + 0.5));
  const w = TT.analyze(even, { reference: 'A', test: 'B', margin: 2 });
  const p = TT.analyze(even, { reference: 'A', test: 'B', margin: 2, welch: false });
  assert.ok(Math.abs(w.df - p.df) < 1e-6 && Math.abs(w.se - p.se) < 1e-12);
});

test('equivalence input is checked before anything is tested', () => {
  const ok = twoGroups(REF10, REF10.map(v => v + 0.4));
  assert.throws(() => TT.analyze(ok, { reference: 'A', test: 'B' }), /margin greater than zero/);
  assert.throws(() => TT.analyze(ok, { reference: 'A', test: 'B', margin: -1 }), /margin greater than zero/);
  assert.throws(() => TT.analyze([{ group: 'A', value: 1 }, { group: 'A', value: 2 }], { margin: 1 }), /Two methods are needed/);
  assert.throws(() => TT.analyze([{ group: 'A', value: 1 }, { group: 'B', value: 2 }], { margin: 1 }), /at least 2 results/);
  assert.throws(() => TT.analyze(twoGroups([5, 5, 5], [5, 5, 5]), { reference: 'A', test: 'B', margin: 1 }), /no scatter/);
  assert.throws(() => TT.analyze(ok.concat([{ group: 'C', value: 99 }, { group: 'C', value: 98 }]), { margin: 1 }), /Choose which two/);
  assert.throws(() => TT.analyze(ok, { reference: 'A', test: 'B', margin: 2, paired: true }), /sample identifier/);
  // Blanks and text are dropped rather than read as zero.
  const dirty = ok.concat([{ group: 'A', value: null }, { group: 'B', value: '' }, { group: 'A', value: 'n/a' }]);
  const r = TT.analyze(dirty, { reference: 'A', test: 'B', margin: 2 });
  assert.strictEqual(r.refStats.n + r.testStats.n, ok.length);
  assert.ok(r.refStats.mean > 90, 'a blank result must never be read as zero');
});

test('every tool has an applications write-up, and none of it overclaims', () => {
  const apps = require(path.join(ROOT, 'applications.js'));
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Every selectable tool but the privacy page must have one.
  // Only the tool selector's own options, not every <option> on the page.
  const selector = (html.match(/<select id="tool">([\s\S]*?)<\/select>/) || [])[1] || '';
  assert.ok(selector, 'the tool selector should be findable');
  const tools = [...selector.matchAll(/<option value="([a-z]+)"/g)].map(m => m[1]).filter(t => t !== 'privacy');
  assert.ok(tools.length >= 4, tools.join(','));
  for (const t of tools) {
    assert.ok(apps[t], 'no applications entry for ' + t);
    assert.ok(apps[t].tech && apps[t].scope, t + ' needs a technology name and a scope line');
    assert.ok(apps[t].groups.length >= 4, t + ' has only ' + apps[t].groups.length + ' areas');
    assert.ok(apps[t].groups.filter(g => !g.note).length >= 4, t + ' needs at least four application areas');
    for (const g of apps[t].groups) {
      assert.ok(g.name && g.text.length > 80, t + ': "' + g.name + '" is too thin');
      // Application paragraphs read as comma-separated lists of uses, which is what makes
      // them scannable. A paragraph flagged as a note is a closing remark and is exempt.
      if (!g.note) assert.ok((g.text.match(/,/g) || []).length >= 3, t + ': "' + g.name + '" should read as a comma-separated list of uses');
    }
    // The scope line is what stops a reader assuming the page takes images or audio.
    assert.ok(/In this tool:/.test(apps[t].scope), t + ': the scope line must say what this page actually reads');
  }
  // The panel must carry the caveat, not just the data file.
  assert.ok(/not a claim about what this page reads/.test(app), 'the panel must print the scope caveat, not just carry it in the data file');
  /* The tailored examples must cover every industry and function offered, for every
     technique. A missing combination shows the reader an empty panel, which is worse than
     not offering the choice. */
  const { INDUSTRIES, FUNCTIONS, TAILORED } = apps;
  assert.ok(INDUSTRIES.length >= 8 && FUNCTIONS.length >= 6);
  for (const t of tools) {
    assert.ok(TAILORED[t], 'no tailored examples for ' + t);
    for (const [key, label] of INDUSTRIES) {
      const line = TAILORED[t].industries[key];
      assert.ok(line && line.length > 60, t + ' has nothing for ' + label);
      assert.ok((line.match(/,/g) || []).length >= 2, t + '/' + label + ' should read as a list of uses');
    }
    for (const [key, label] of FUNCTIONS) {
      const line = TAILORED[t].functions[key];
      assert.ok(line && line.length > 50, t + ' has nothing for ' + label);
    }
  }
  // Every industry and function the data offers must also be a real option in the page.
  assert.ok(/apps-industry/.test(app) && /apps-function/.test(app), 'the panel must offer both pickers');
  assert.ok(/Nothing is stored/.test(app), 'the choice must be documented as session-only');

  // The selector is named by technology, not by one industry's use case.
  for (const bad of ['Chromatography', 'Bioreactor', 'Densitometer']) assert.ok(!new RegExp('<option[^>]*>[^<]*' + bad).test(html), 'selector should not name a specific application: ' + bad);
});
