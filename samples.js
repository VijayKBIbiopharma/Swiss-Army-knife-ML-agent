/* Built-in practice datasets, generated in the browser from fixed seeds.

   They are synthetic: no real company, patient or batch data. Every one is a biologics
   development or manufacturing dataset, and every one is tagged with the function it belongs
   to, so somebody opening the tool sees the datasets their own group would recognise rather
   than a tour of unrelated industries. The generating process behind each is written to have
   a real, findable structure - an interaction, a curved optimum, a confounded pair - because
   a practice dataset with nothing in it teaches the wrong lesson about what the tool can do.

   `fn` must be one of the function ids in applications.js, and `target` must be a column the
   generator actually emits. Both are checked by the tests, because a practice dataset that
   points at a column it does not produce fails in front of whoever trusted it first. */
(function (root) {
  'use strict';
  const E = root.MLEngine || require('./engine.js');

  function noise(rand) { // approx. standard normal (Box-Muller)
    const u = Math.max(1e-12, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;
  const toCSV = (cols, rows) => [cols.join(',')].concat(rows.map(r => r.join(','))).join('\n');

  const SAMPLES = [
    {
      id: 'clones', fn: 'cld', title: 'Clone screening: which early reads predict final titer',
      kind: 'Regression · clone selection',
      blurb: '180 clones. Construct features against final titer \u2014 and the day 3 reads are set aside by default, which is the lesson.',
      target: 'Final_Titer_gL',
      make() {
        const rand = E.rng(7), rows = [];
        const prom = ['CMV', 'EF1a', 'CAG', 'SV40'];
        for (let i = 0; i < 180; i++) {
          const pr = prom[Math.floor(rand() * 4)];
          const ps = pr === 'CMV' ? 1 : pr === 'CAG' ? 0.95 : pr === 'EF1a' ? 0.8 : 0.45;
          const copy = Math.max(1, Math.round(2 + 8 * rand()));
          const vcd = 1.2 + 2.4 * rand();                 // day 3 viable cell density
          const lac = 0.4 + 2.6 * rand();                 // day 3 lactate: high is bad later
          const qp = 6 + 16 * ps + 2.2 * noise(rand);     // specific productivity
          const stab = 70 + 28 * rand();                  // passage stability
          /* Copy number helps and then stops helping - the curve is the point, because a
             two-level screen is blind to an optimum that sits inside the range. */
          const titer = 0.6 + 0.42 * qp * 0.18 + 2.6 * ps + 0.55 * vcd - 0.62 * lac
            + 0.34 * copy - 0.021 * copy * copy + 0.018 * (stab - 70) + 0.22 * noise(rand);
          rows.push(['CL-' + String(i + 1).padStart(3, '0'), pr, copy, r2(vcd), r2(lac), r1(qp), r1(stab), r2(Math.max(0.1, titer))]);
        }
        return toCSV(['CloneID', 'Promoter', 'Copy_Number', 'Day3_VCD_e6', 'Day3_Lactate_gL',
          'Specific_Productivity_qp', 'Passage_Stability_Pct', 'Final_Titer_gL'], rows);
      }
    },
    {
      id: 'clonegroups', fn: 'cld', title: 'Clone phenotypes, with no outcome column',
      kind: 'Unsupervised · clustering',
      blurb: '240 clones, nothing marked good or bad. What phenotypes are in the pool?',
      target: '__none__',
      make() {
        const rand = E.rng(31), rows = [];
        /* Three phenotypes a cell line group would recognise, plus one clone that belongs to
           none of them - the outlier is deliberate, so the tool has something to flag. */
        const groups = [
          { n: 100, growth: 0.62, vcd: 9.5, lac: 1.1, qp: 11 },   // fast grower, modest producer
          { n: 85, growth: 0.38, vcd: 5.8, lac: 0.6, qp: 26 },    // slow grower, high producer
          { n: 54, growth: 0.52, vcd: 7.9, lac: 2.6, qp: 15 }     // lactate accumulator
        ];
        let id = 1;
        for (const g of groups) for (let i = 0; i < g.n; i++) {
          rows.push(['CL-' + String(id++).padStart(3, '0'),
            r3(Math.max(0.05, g.growth * (1 + 0.14 * noise(rand)))),
            r2(Math.max(0.5, g.vcd * (1 + 0.16 * noise(rand)))),
            r2(Math.max(0.05, g.lac + 0.22 * noise(rand))),
            r1(Math.max(1, g.qp * (1 + 0.18 * noise(rand))))]);
        }
        rows.push(['CL-' + String(id++).padStart(3, '0'), 0.08, 1.1, 7.4, 2.0]);
        E.shuffle(rows, rand);
        return toCSV(['CloneID', 'Growth_Rate_perDay', 'Peak_VCD_e6', 'Lactate_gL', 'Specific_Productivity_qp'], rows);
      }
    },
    {
      id: 'fedbatch', fn: 'uspd', title: 'Fed-batch bioreactor: 2⁴ factorial with centre points',
      kind: 'DOE analysis',
      blurb: '19 runs: temperature, pH, feed rate and dissolved oxygen against titer.',
      target: 'Titer_gL',
      make() {
        const rand = E.rng(11), rows = [], runs = [];
        for (let i = 0; i < 16; i++) runs.push([0, 1, 2, 3].map(j => ((i >> j) & 1 ? 1 : -1)));
        for (let c = 0; c < 3; c++) runs.push([0, 0, 0, 0]);
        runs.forEach((x, i) => {
          const [T, pH, F, DO] = x;
          /* Temperature and feed interact, which is the finding worth having: a feed that
             helps at 36 degrees hurts at 34. The centre points carry curvature, so the
             design can say the optimum is inside the range rather than at a corner. */
          const y = 3.4 + 0.52 * T + 0.34 * F + 0.11 * pH + 0.07 * DO
            + 0.29 * T * F - 0.22 * (T === 0 ? 1 : 0) + 0.09 * noise(rand);
          rows.push([i + 1, r1(35 + 1.5 * T), r2(7.0 + 0.15 * pH), r1(12 + 4 * F), Math.round(40 + 15 * DO), r2(y)]);
        });
        return toCSV(['StdOrder', 'Temp_C', 'pH', 'FeedRate_mL_h', 'DO_Pct', 'Titer_gL'], rows);
      }
    },
    {
      id: 'capture', fn: 'dspd', title: 'Protein A capture: yield and purity pull against each other',
      kind: 'Regression · two results',
      blurb: '160 capture runs. Load, wash and elution conditions against step yield and purity.',
      target: 'Step_Yield_Pct',
      make() {
        const rand = E.rng(19), rows = [];
        const lots = ['RL-221', 'RL-224', 'RL-231'];
        for (let i = 0; i < 160; i++) {
          const load = 20 + 25 * rand();          // g product per L resin
          const wash = 2 + 18 * rand();           // wash conductivity
          const elpH = 3.2 + 0.9 * rand();
          const rt = 2 + 6 * rand();              // residence time
          const lot = lots[Math.floor(rand() * 3)];
          const lotShift = lot === 'RL-224' ? -1.8 : lot === 'RL-231' ? 0.9 : 0;
          /* Pushing the load raises yield a little and costs purity a lot. That tension is
             the whole reason the multi-result optimiser exists, so it is built in. */
          const yld = 88 + 0.22 * load - 0.006 * load * load - 0.9 * (elpH - 3.6) * (elpH - 3.6) * 4
            + 0.35 * rt + lotShift + 0.8 * noise(rand);
          const pur = 97.5 - 0.085 * load + 0.14 * wash - 0.015 * wash * wash
            - 0.6 * Math.abs(elpH - 3.5) + 0.3 * noise(rand);
          rows.push(['CR-' + String(i + 1).padStart(3, '0'), r1(load), r1(wash), r2(elpH), r1(rt), lot,
            r2(Math.min(99.5, yld)), r2(Math.min(99.9, pur))]);
        }
        return toCSV(['RunID', 'Load_g_per_L_resin', 'Wash_Conductivity_mS', 'Elution_pH',
          'Residence_Time_min', 'Resin_Lot', 'Step_Yield_Pct', 'Purity_Pct'], rows);
      }
    },
    {
      id: 'formulation', fn: 'afs', title: 'Formulation screen: aggregation after four weeks at 40 °C',
      kind: 'Regression · stability',
      blurb: '144 formulations. Buffer, pH, sugar and surfactant against how much HMW formed.',
      target: 'HMW_Increase_Pct',
      make() {
        const rand = E.rng(29), rows = [];
        const buf = ['Histidine', 'Citrate', 'Acetate'];
        for (let i = 0; i < 144; i++) {
          const b = buf[Math.floor(rand() * 3)];
          const ph = 5.0 + 1.6 * rand(), suc = 2 + 8 * rand(), ps80 = 0.005 + 0.075 * rand(), conc = 20 + 130 * rand();
          const bShift = b === 'Citrate' ? 0.35 : b === 'Acetate' ? 0.18 : 0;
          /* A pH optimum away from the edges, and surfactant that helps sharply then flattens
             - both are curves, which is what the stability tool is for. */
          const hmw = 0.55 + 1.9 * (ph - 5.9) * (ph - 5.9) - 0.042 * suc
            - 7.5 * ps80 + 45 * ps80 * ps80 + 0.0042 * conc + bShift + 0.09 * noise(rand);
          rows.push(['F-' + String(i + 1).padStart(3, '0'), b, r2(ph), r1(suc), r3(ps80), Math.round(conc), r2(Math.max(0.05, hmw))]);
        }
        return toCSV(['FormulationID', 'Buffer', 'pH', 'Sucrose_Pct', 'Polysorbate80_Pct',
          'Protein_mg_mL', 'HMW_Increase_Pct'], rows);
      }
    },
    {
      id: 'scaleup', fn: 'msat', title: 'Scale-up: where the at-scale gap comes from',
      kind: 'Regression · tech transfer',
      blurb: '200 runs across two sites and three scales. Why does titer drop at scale?',
      target: 'Titer_gL',
      make() {
        const rand = E.rng(37), rows = [];
        const sites = ['Site A', 'Site B'], scales = [50, 500, 2000];
        for (let i = 0; i < 200; i++) {
          const site = sites[Math.floor(rand() * 2)];
          const scale = scales[Math.floor(rand() * 3)];
          /* kLa falls as the vessel grows, and that - not the site - is what costs titer.
             Site B happens to run the big vessels more often, so a careless read blames the
             site. The confounding is deliberate: the tool should name it. */
          const kla = 18 - 3.4 * Math.log10(scale / 50) * 2.2 + 1.1 * noise(rand);
          const temp = 35 + 1.4 * rand(), ph = 6.9 + 0.3 * rand();
          const feed = ['Bolus', 'Continuous'][Math.floor(rand() * 2)];
          const titer = 1.1 + 0.19 * kla + 0.42 * (temp - 35) - 4.2 * (ph - 7.05) * (ph - 7.05)
            + (feed === 'Continuous' ? 0.38 : 0) + (site === 'Site B' ? 0.05 : 0) + 0.14 * noise(rand);
          rows.push(['R-' + String(i + 1).padStart(3, '0'), site, scale, r1(kla), r2(temp), r2(ph), feed, r2(Math.max(0.1, titer))]);
        }
        return toCSV(['RunID', 'Site', 'Scale_L', 'kLa_per_h', 'Temp_C', 'pH', 'Feed_Strategy', 'Titer_gL'], rows);
      }
    },
    {
      id: 'batches', fn: 'mfg', title: 'Batch release: pass or fail',
      kind: 'Classification',
      blurb: '300 GMP batches. What predicts a failed release test?',
      target: 'Result',
      make() {
        const rand = E.rng(23), rows = [];
        const sup = ['Supplier-N', 'Supplier-E', 'Supplier-W'];
        for (let i = 0; i < 300; i++) {
          const ph = 6.4 + 1.2 * rand(), temp = 34 + 6 * rand(), mix = 20 + 40 * rand(), hold = 2 + 22 * rand();
          const s = sup[Math.floor(rand() * 3)];
          const score = -1.2 + 3.2 * Math.abs(ph - 7) + 0.35 * (temp - 37) + 0.06 * (hold - 12)
            + (s === 'Supplier-W' ? 1.1 : 0) - 0.01 * mix + 0.6 * noise(rand);
          rows.push(['B' + (5000 + i), r2(ph), r1(temp), r1(mix), r1(hold), s, score > 0.6 ? 'Fail' : 'Pass']);
        }
        return toCSV(['BatchID', 'pH', 'Temperature', 'MixingTime', 'HoldHours', 'Media_Supplier', 'Result'], rows);
      }
    },
    {
      id: 'disposition', fn: 'qa', title: 'Batch disposition: four outcomes, in order',
      kind: 'Classification · 4 ranked classes',
      blurb: '400 batches from Reject to Release. What moves a batch up a disposition tier?',
      target: 'Disposition',
      make() {
        const rand = E.rng(47), rows = [], lines = ['Line 1', 'Line 2', 'Line 3'];
        for (let i = 0; i < 400; i++) {
          const devs = Math.max(0, Math.round(noise(rand) * 1.1 + 1.4));
          const oos = Math.max(0, Math.round(noise(rand) * 0.7 + 0.4));
          const hold = Math.round(4 + 68 * rand());
          const exp = Math.round(6 + 114 * rand());        // operator experience, months
          const env = Math.max(0, Math.round(noise(rand) * 0.8 + 0.5));
          const line = lines[Math.floor(rand() * 3)];
          /* Ranked outcomes, so "what moves a batch up a tier" is a real question. Operator
             experience and hold time dominate; the line barely matters, which is usually the
             opposite of what the room expects. */
          const score = 5.6 - 1.25 * devs - 1.9 * oos - 0.021 * hold + 0.019 * exp - 0.75 * env
            + (line === 'Line 3' ? -0.2 : 0) + 0.42 * noise(rand);
          const d = score > 4.4 ? 'Release' : score > 3.2 ? 'Release with deviation' : score > 1.9 ? 'Rework' : 'Reject';
          rows.push(['B' + (7000 + i), devs, oos, hold, exp, env, line, d]);
        }
        return toCSV(['BatchID', 'Deviation_Count', 'OOS_Count', 'Hold_Time_Hours',
          'Operator_Experience_Months', 'Env_Excursions', 'Line', 'Disposition'], rows);
      }
    },
    {
      id: 'bioqc', fn: 'qc', title: 'Bioreactor log joined to the densitometer report',
      kind: 'Two files · join · QC',
      blurb: 'Process log and purity report for 64 batches. Join on BatchID, then find what drives purity.',
      target: 'Purity_Pct',
      files: [{ name: 'bioreactor-process-log.csv', make: () => bioqc().log },
        { name: 'densitometer-qc-report.csv', make: () => bioqc().qc }]
    }
  ];

  /* Two linked files: a bioreactor process log (one row per batch) and a densitometer
     QC report (two replicate lanes per batch, a few batches only in one file). Warmer
     runs make more product (titer) but more aggregate (HMW), which lowers purity. */
  let bioCache = null;
  function bioqc() {
    if (bioCache) return bioCache;
    const rand = E.rng(83), log = [], qc = [], truth = {};
    for (let i = 0; i < 64; i++) {
      const id = 'B' + (1001 + i);
      const temp = r2(36 + 1.6 * rand()), ph = r2(6.8 + 0.4 * rand()), dO = r1(30 + 30 * rand()), feed = r1(8 + 8 * rand()), agit = Math.round(90 + 60 * rand()), harvest = 12 + Math.floor(rand() * 5);
      const br = ['BR-1', 'BR-2', 'BR-3'][i % 3];
      const titer = 2 + 0.9 * (temp - 36) + 0.08 * (feed - 8) + 0.12 * (harvest - 12) - 6 * (ph - 7) ** 2 + 0.12 * noise(rand);
      log.push([id, br, temp, ph, dO, feed, agit, harvest, r2(titer)]);
      truth[id] = { hmw: 1.2 + 1.1 * (temp - 36) + 0.04 * (agit - 90) - 0.02 * (dO - 30), lmw: 0.8 + 0.35 * (harvest - 12) };
    }
    const qcIds = Object.keys(truth).slice(0, 60).concat(['B1065', 'B1066']);
    for (const id of qcIds) {
      const t = truth[id] || { hmw: 2.8, lmw: 1.4 };
      for (const lane of [1, 2]) {
        const hmw = Math.max(0.2, t.hmw + 0.15 * noise(rand)), lmw = Math.max(0.1, t.lmw + 0.1 * noise(rand));
        qc.push([id, lane, r2(100 - hmw - lmw), r2(hmw), r2(lmw), r1(148 + 0.6 * noise(rand)), lane === 1 ? 'A.R.' : 'J.K.']);
      }
    }
    bioCache = {
      log: toCSV(['BatchID', 'Bioreactor', 'Temp_C', 'pH', 'DO_Pct', 'FeedRate_mL_h', 'Agitation_rpm', 'HarvestDay', 'Titer_g_L'], log),
      qc: toCSV(['Batch ID', 'Lane', 'Purity_Pct', 'HMW_Pct', 'LMW_Pct', 'MainBand_kDa', 'Analyst'], qc)
    };
    return bioCache;
  }

  root.MLSamples = SAMPLES;
  if (typeof module !== 'undefined' && module.exports) module.exports = SAMPLES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
