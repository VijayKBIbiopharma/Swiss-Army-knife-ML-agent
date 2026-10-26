/* The front door: you type what you are trying to find out, and it names the tool and the
   first move.

   This is a triage desk, not a doctor. It recognises the words you used, matches them
   against known ways of describing a problem, and routes you with the paperwork you will
   need. It does not understand your sentence, and it is built to say so rather than guess:
   when two tools are close it asks the one question that separates them, and when nothing
   matches it says nothing matched.

   Deliberately not a language model. Everything here is string matching against a lexicon
   you can read, so it is instant, works with the network off, gives the same answer every
   time, and what you type never leaves the page. A model good enough to parse free English
   would be gigabytes of opaque weights and would need a server to talk to; that is a
   different product with a different promise. */
(function (root) {
  'use strict';

  /* ---------- normalising what was typed ----------
     The aim is that "Analysing lot-to-lot variability" and "analyze variability between
     lots" land on the same tokens. Spelling conventions are unified first, then the
     domain's acronyms are expanded, then plurals and tenses are stripped. */
  const SPELLING = [
    [/\bisation\b/g, 'ization'], [/isation/g, 'ization'], [/ise\b/g, 'ize'], [/ising\b/g, 'izing'],
    [/yse\b/g, 'yze'], [/ysing\b/g, 'yzing'], [/\bcentre/g, 'center'], [/\btitre/g, 'titer'],
    [/\bfibre/g, 'fiber'], [/\blitre/g, 'liter'], [/\bcolour/g, 'color'], [/\bbehaviour/g, 'behavior']
  ];
  // Acronyms a biopharma site actually uses. Expanded so the lexicon can stay in plain words.
  const ACRONYMS = {
    grr: 'gage repeatability reproducibility measurement system',
    'r&r': 'gage repeatability reproducibility',
    msa: 'measurement system analysis',
    gage: 'gage', gauge: 'gage',
    cqa: 'critical quality attribute',
    cpp: 'critical process parameter',
    ppq: 'process performance qualification batches',
    pv: 'process validation',
    cpv: 'continued process verification',
    oos: 'out of specification',
    oot: 'out of trend',
    capa: 'corrective action investigation',
    doe: 'design of experiments',
    dsd: 'definitive screening design',
    rsm: 'response surface',
    tost: 'equivalence two one sided test',
    spc: 'control chart statistical process control',
    mspc: 'multivariate control chart',
    mvda: 'multivariate analysis',
    pca: 'principal component analysis',
    pls: 'partial least squares',
    cpk: 'process capability', ppk: 'process capability', cp: 'process capability',
    dpmo: 'defects per million',
    ich: 'ich guideline',
    q1e: 'ich q1e shelf life',
    sec: 'assay', hplc: 'assay instrument', uplc: 'assay instrument',
    cex: 'chromatography', aex: 'chromatography', hic: 'chromatography',
    hcp: 'host cell protein', dna: 'dna',
    lmw: 'low molecular weight', hmw: 'aggregate',
    ds: 'drug substance', dp: 'drug product',
    tff: 'filtration', uf: 'filtration', df: 'filtration',
    nir: 'spectra', pat: 'process analytical technology',
    ndc: 'number of distinct categories',
    icc: 'intraclass correlation variance component',
    anova: 'anova analysis of variance',
    sop: 'procedure', qa: 'quality assurance', qc: 'quality control',
    msat: 'technology transfer', pd: 'process development', afs: 'analytical formulation sciences',
    cho: 'cho mammalian cell', hek: 'mammalian cell',
    llm: 'language model artificial intelligence', ai: 'artificial intelligence',
    gxp: 'gxp regulated validated', gmp: 'gmp regulated'
  };
  /* Stripping "ing" or "ed" from a doubled consonant leaves a stem nothing else reaches:
     transferring becomes transferr, which never matches transfer. Collapse the double, but
     leave ll, ss, ff and zz alone or calling becomes cal. */
  const undouble = w => (/([^aeiou])\1$/.test(w) && !/(ll|ss|ff|zz)$/.test(w) ? w.slice(0, -1) : w);
  /* "measured" loses its "ed" and becomes measur, while "measure" keeps its e - two stems
     for one word, so the lexicon matches one form and silently misses the other. Dropping a
     trailing e from both is what makes them meet. */
  const dropE = w => (w.length > 4 && /e$/.test(w) ? w.slice(0, -1) : w);
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /ing$/.test(w)) return dropE(undouble(w.slice(0, -3)));
    if (w.length > 5 && /ed$/.test(w)) return dropE(undouble(w.slice(0, -2)));
    if (w.length > 4 && /(ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /es$/.test(w)) return dropE(w.slice(0, -1));
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return dropE(w.slice(0, -1));
    return dropE(w);
  }
  function tokenize(text) {
    let s = ' ' + String(text || '').toLowerCase() + ' ';
    s = s.replace(/&/g, ' and ');
    for (const [re, to] of SPELLING) s = s.replace(re, to);
    s = s.replace(/[^a-z0-9]+/g, ' ');
    const raw = s.split(' ').filter(Boolean);
    const out = [];
    for (const w of raw) {
      const exp = ACRONYMS[w];
      if (exp) { for (const e of exp.split(' ')) out.push(stem(e)); continue; }
      out.push(stem(w));
    }
    return out;
  }
  // A phrase token ending in * matches by prefix, which covers families like optimiz*.
  const phraseTokens = p => tokenize(p).map(t => (/\*$/.test(p) && t === tokenize(p).slice(-1)[0] ? t : t));
  function compilePhrase(p) {
    const star = /\*\s*$/.test(p);
    const toks = tokenize(p.replace(/\*/g, ''));
    return { toks, star };
  }
  function findAll(tokens, ph) {
    const out = [], n = ph.toks.length;
    if (!n) return out;
    for (let i = 0; i + n <= tokens.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) {
        const a = tokens[i + j], b = ph.toks[j];
        const last = j === n - 1;
        if (last && ph.star ? a.indexOf(b) !== 0 : a !== b) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
    return out;
  }
  const NEGATIONS = new Set(['not', 'no', 'dont', 'doesnt', 'didnt', 'without', 'rather', 'instead', 'never', 'isnt', 'arent', 'cant', 'cannot', 'neither', 'nor']);

  /* ---------- the playbooks ----------
     Each one is a way people describe a problem, the tool that answers it, and what to do
     when they get there. Weights: 3 names the problem unmistakably, 2 is strong supporting
     language, 1 is a hint that only matters alongside something else. */
  const PLAYBOOKS = [
    {
      id: 'variance-components', tool: 'variance', mode: { sel: 'vc-mode', value: 'components' },
      title: 'Split the spread into named sources',
      what: 'Variance components with Tukey comparisons',
      distinguish: 'you want to know which source — lot, analyst, vessel — owns the spread',
      bring: 'One row per measurement: the group it came from (lot, analyst, vessel, shift) and the number. Several measurements per group — without repeats no split is possible.',
      first: 'It splits the total spread into real between-group differences and the scatter of repeat measurements, then names which pairs genuinely differ.',
      then: 'If almost all the spread turns out to be within groups, the groups are not your problem — run a Gage R&R on the method that produced the numbers.',
      phrases: [[3, 'variance component'], [3, 'where is the variation coming from'], [3, 'source of variation'],
        [3, 'lot to lot'], [3, 'batch to batch'], [3, 'analyst to analyst'], [3, 'vessel to vessel'],
        [3, 'one way anova'], [3, 'between lot'], [3, 'within lot'], [3, 'nested variation'],
        [3, 'which lot'], [3, 'intraclass correlation'], [3, 'whose fault'],
        [2, 'all over the place'], [2, 'variability'], [2, 'variation'], [2, 'inconsistent'],
        [2, 'supplier lot'], [2, 'resin lot'], [2, 'media lot'], [2, 'raw material'], [2, 'incoming material'],
        [2, 'analysis of variance'], [2, 'tukey'], [2, 'which group differ'], [2, 'shift'],
        [2, 'operator differ'], [2, 'blame'], [2, 'to blame'], [2, 'spread'], [2, 'scatter'],
        [1, 'supplier'], [1, 'vendor'], [1, 'noisy'], [1, 'root cause'], [1, 'why so different'], [1, 'vary']]
    },
    {
      id: 'gage-rr', tool: 'variance', mode: { sel: 'vc-mode', value: 'grr' },
      title: 'Find out whether the measurement system can see it',
      what: 'Gage R&R (crossed, ANOVA method)',
      distinguish: 'you suspect the assay or instrument itself is what is moving',
      bring: 'A balanced study: every operator measures every sample, at least twice. Ten samples spanning the range you really see, three operators, two or three repeats. Plus your spec limits.',
      first: 'It splits what you observe into the instrument repeating itself, operators disagreeing with each other, and genuine part-to-part differences — then judges it against your specification window.',
      then: 'If the method is not fit, the split tells you where to spend: repeatability points at hardware and replicates, reproducibility at the method description and training.',
      phrases: [[3, 'gage'], [3, 'repeatability'], [3, 'reproducibility'], [3, 'measurement system'],
        [3, 'measurement system analysis'], [3, 'assay precision'], [3, 'method precision'],
        [3, 'number of distinct categories'], [3, 'can the assay'], [3, 'can my assay'], [3, 'trust the assay'], [3, 'measur* system'],
        [3, 'is it the assay'], [3, 'is it the method'], [3, 'measurement error'], [3, 'intermediate precision'],
        [2, 'same sample twice'], [2, 'analyst disagree'], [2, 'operator disagree'], [2, 'two analyst'],
        [2, 'assay noise'], [2, 'method noise'], [2, 'instrument noise'], [2, 'qualify the method'],
        [2, 'replicate disagree'], [2, 'measure the same'], [2, 'balance'], [2, 'resolve'],
        [1, 'assay'], [1, 'instrument'], [1, 'measurement'], [1, 'precision'], [1, 'analyst']]
    },
    {
      id: 'spec-limits', tool: 'limits', mode: { sel: 'tl-mode', value: 'spec' },
      title: 'Work out which specification limits the data can defend',
      what: 'Tolerance intervals',
      distinguish: 'you need to set or defend a limit from batches you already have',
      bring: 'One column of independent results — one number per batch, on the scale the specification is written on. Not every replicate of every assay, or the spread will look smaller than reality.',
      first: 'It builds the interval that covers a stated share of future production with stated confidence, then checks it against the limits you already hold.',
      then: 'If your limits are not supported, it says whether more batches would fix it or whether no sample size ever will — which is the difference between a data problem and a process problem.',
      phrases: [[3, 'specification limit'], [3, 'set a spec'], [3, 'set specification'], [3, 'spec setting'],
        [3, 'tolerance interval'], [3, 'release limit'], [3, 'acceptance criteria'], [3, 'action limit'],
        [3, 'alert limit'], [3, 'justify the limit'], [3, 'defend the limit'], [3, 'what limit'],
        [3, 'mean plus three'], [3, 'three sigma'], [3, 'widen the spec'], [3, 'tighten the spec'],
        [3, 'can we hold'], [3, 'out of specification'],
        [2, 'specification'], [2, 'spec'], [2, 'limit'], [2, 'cover of production'], [2, 'release criteria'],
        [2, 'in process limit'], [2, 'upper limit'], [2, 'lower limit'], [2, 'out of trend'],
        [1, 'release'], [1, 'criteria'], [1, 'commit']]
    },
    {
      id: 'study-size', tool: 'limits', mode: { sel: 'tl-mode', value: 'size' },
      title: 'Work out how big the study needs to be',
      what: 'Power and sample size',
      distinguish: 'you have not run it yet and want to know how many',
      bring: 'Nothing but numbers you already know: the scatter you expect, and the difference or margin that matters. No data needed.',
      first: 'It gives the smallest study with a fair chance of answering the question, plus a table of what each study size actually buys.',
      then: 'If the honest answer is that no affordable study can settle it, you have saved the instrument time — which is a result worth having before the protocol is signed.',
      phrases: [[3, 'sample size'], [3, 'how many batches'], [3, 'how many run'], [3, 'how many result'],
        [3, 'how many sample'], [3, 'how many lot'], [3, 'how many do i need'], [3, 'how many will i need'],
        [3, 'statistical power'], [3, 'power calculation'], [3, 'power analysis'], [3, 'underpowered'],
        [3, 'size the study'], [3, 'justify the number'], [3, 'is it worth running'], [3, 'before the study'],
        [3, 'process performance qualification batches'],
        [2, 'power'], [2, 'how many'], [2, 'enough data'], [2, 'enough batches'], [2, 'plan the study'],
        [2, 'number of batches'], [2, 'number of run'], [2, 'protocol'], [2, 'how big'],
        [1, 'plan'], [1, 'design the study']]
    },
    {
      id: 'equivalence', tool: 'equivalence',
      title: 'Show two things agree closely enough',
      what: 'Equivalence testing by two one-sided tests (TOST)',
      distinguish: 'you want to demonstrate sameness between two methods, labs or sites',
      bring: 'Results from both sides — one file with a column saying which, or a separate file from each lab. A sample identifier lets the same samples be paired, which is far more sensitive.',
      first: 'You declare the margin you are willing to call unimportant, and it tests both edges of it. Three outcomes: equivalent, a real difference, or honestly not yet.',
      then: 'If it comes back inconclusive, the sample-size tool tells you how many results per method would settle it. Do not record "no significant difference" as equivalence — that is the mistake this test exists to prevent.',
      phrases: [[3, 'method transfer'], [3, 'equivalence'], [3, 'equivalent'], [3, 'two one sided test'],
        [3, 'non inferiority'], [3, 'comparability'], [3, 'show they are the same'], [3, 'prove they are the same'], [3, 'show it match'],
        [3, 'show they match'], [3, 'show it agree'], [3, 'transfer*'], [3, 'match the old'],
        [3, 'bridging study'], [3, 'same as the old'], [3, 'agree with the old'], [3, 'transfer to quality control'],
        [3, 'lab to lab'], [3, 'site to site'], [3, 'instrument to instrument'], [3, 'before and after'],
        [3, 'second supplier'], [3, 'alternative supplier'], [3, 'second source'], [3, 'post change'],
        [2, 'two lab'], [2, 'two site'], [2, 'two method'], [2, 'comparable'], [2, 'margin'],
        [2, 'no significant difference'], [2, 'receiving lab'], [2, 'sending site'], [2, 'change control'],
        [2, 'scale down model'], [2, 'biosimilar'], [2, 'did the change'],
        [1, 'compare'], [1, 'same'], [1, 'differ'], [1, 'transfer']]
    },
    {
      id: 'shelf-life', tool: 'stability',
      title: 'Take a shelf life off the data',
      what: 'ICH Q1E regression with confidence limits',
      distinguish: 'the thing you care about changes with time',
      bring: 'One row per timepoint per batch: batch, months elapsed, the measured attribute. Plus the specification it has to stay inside.',
      first: 'It tests whether batches may be pooled, fits the trend, and takes the date off the confidence limit rather than the fitted line — which is what the guideline requires.',
      then: 'It caps extrapolation at what the data supports, so if you want a longer claim it tells you that you need longer data rather than a bolder fit.',
      phrases: [[3, 'shelf life'], [3, 'expiry'], [3, 'expiration'], [3, 'stability study'], [3, 'ich q1e'],
        [3, 'poolability'], [3, 'hold time'], [3, 'retest date'], [3, 'how long can we store'],
        [3, 'degradation over time'], [3, 'degrade over time'], [3, 'usable life'], [3, 'resin lifetime'],
        [3, 'membrane lifetime'], [3, 'shelf'],
        [2, 'stability'], [2, 'over time'], [2, 'trend against time'], [2, 'degrade'], [2, 'degradation'],
        [2, 'accelerated condition'], [2, 'long term condition'], [2, 'storage'], [2, 'month'],
        [2, 'aggregate over'], [2, 'slope per month'],
        [1, 'time'], [1, 'store'], [1, 'age']]
    },
    {
      id: 'golden-batch', tool: 'golden',
      title: 'Watch a batch against the path the good ones took',
      what: 'PCA with Hotelling T² and Q residuals',
      distinguish: 'you have many sensors over time and want to know if a run is going wrong',
      bring: 'One row per reading: batch, how far into the batch it was, and the sensor values at that moment. Three good batches minimum; ten or more makes the envelope mean something.',
      first: 'It learns the path your reference batches followed, scores every batch against it as one number, and names the sensor to blame at the hour it strays.',
      then: 'Q catches the case a wall of single-sensor charts cannot: every reading inside its own limits while the sensors stop agreeing with each other — a drifting probe, for instance.',
      phrases: [[3, 'golden batch'], [3, 'batch trajectory'], [3, 'multivariate control chart'], [3, 'hotelling'],
        [3, 'q residual'], [3, 'batch monitoring'], [3, 'watch a batch'], [3, 'watch the batch'],
        [3, 'which sensor'], [3, 'sensor drift'], [3, 'batch went wrong'], [3, 'many sensor'],
        [3, 'thirty chart'], [3, 'during the run'], [3, 'catch it during'], [3, 'probe drift'],
        [3, 'principal component analysis'], [3, 'campaign review'],
        [2, 'time series'], [2, 'sensor'], [2, 'probe'], [2, 'bioreactor run'], [2, 'fermenter'],
        [2, 'deviation investigation'], [2, 'historian'], [2, 'trajectory'], [2, 'profile'],
        [2, 'multivariate'], [2, 'all at once'], [2, 'early warning'],
        [1, 'monitor'], [1, 'drift'], [1, 'batch record']]
    },
    {
      id: 'ml-doe', tool: 'analyze',
      title: 'Find what drives the result, and what to change',
      what: 'Model leaderboard with drivers and next steps',
      distinguish: 'you have a table of data and want to know what is driving the outcome',
      bring: 'A table: one row per batch or run, one column per thing you recorded, and the outcome you care about. Historian pulls and batch records work well.',
      first: 'It tests up to a dozen models on rows they have never seen, keeps the simplest one that wins, and names the drivers in plain English.',
      then: 'It then designs the experiment that separates the drivers history has confounded, because a model built on observational data cannot tell you cause.',
      phrases: [[3, 'which factor matter'], [3, 'what drive'], [3, 'what is driving'], [3, 'find the driver'], [3, 'driv*'],
        [3, 'which parameter'], [3, 'process parameter'], [3, 'which process parameter'],
        [3, 'what affect'], [3, 'what cause'], [3, 'machine learning'], [3, 'important variable'],
        [3, 'feature importance'], [3, 'predict'], [3, 'prediction'], [3, 'model my data'],
        [3, 'find group'], [3, 'cluster'], [3, 'classify'], [3, 'which parameter matter'],
        [2, 'regression'], [2, 'random forest'], [2, 'neural network'], [2, 'correlation'],
        [2, 'relationship'], [2, 'yield'], [2, 'titer'], [2, 'best setting'], [2, 'optimize'],
        [2, 'historical data'], [2, 'batch record'], [2, 'mine the data'], [2, 'pattern'],
        [1, 'analyze my data'], [1, 'model'], [1, 'data']]
    },
    {
      id: 'doe-screen', tool: 'analyze', open: 'doe-wrap', mode: { sel: 'design-type', value: 'dsd' },
      title: 'Design the experiment before you run it',
      what: 'DOE builder, starting from a definitive screening design',
      distinguish: 'you have not run the experiments yet and need a run sheet',
      bring: 'Just the factors and the low and high setting that is safe and practical for each. No data yet.',
      first: 'It produces a randomised run sheet you take to the bench. A definitive screening design keeps main effects clean of every two-factor interaction and still shows curvature.',
      then: 'Run it, record the response, then load the file back in step 1 — the agent recognises the design and analyses it.',
      phrases: [[3, 'design an experiment'], [3, 'design of experiment'], [3, 'design experiment'],
        [3, 'screening design'], [3, 'plan an experiment'], [3, 'definitive screening'], [3, 'plackett burman'],
        [3, 'factorial'], [3, 'too many factor'], [3, 'screen factor'], [3, 'which experiment'],
        [3, 'run sheet'], [3, 'central composite'], [3, 'box behnken'], [3, 'response surface'],
        [3, 'next experiment'], [3, 'characterization study'], [3, 'design space'],
        [2, 'screen'], [2, 'experiment'], [2, 'many factor'], [2, 'trial'], [2, 'study design'],
        [1, 'design'], [1, 'factor']]
    },
    {
      id: 'mixture', tool: 'analyze', open: 'doe-wrap', mode: { sel: 'design-type', value: 'mixVertices' },
      title: 'Design a formulation where the components must add up',
      what: 'Mixture designs with a Scheffé blending model',
      distinguish: 'your factors are shares of one blend, so they cannot move independently',
      bring: 'The components and a realistic minimum and maximum percentage for each. The tool handles the constraint that they total 100%.',
      first: 'It puts runs at the corners of what is actually formulable, with amounts rounded so every run weighs out to the batch total exactly.',
      then: 'Paste the finished run sheet back underneath and it fits a Scheffé model, reporting each pair as synergy or antagonism — effects an ordinary factorial design cannot find here.',
      phrases: [[3, 'formulation'], [3, 'excipient'], [3, 'mixture design'], [3, 'blend'], [3, 'recipe'],
        [3, 'buffer composition'], [3, 'media composition'], [3, 'feed composition'], [3, 'simplex'],
        [3, 'add up to 100'], [3, 'proportion of the blend'], [3, 'component add up'], [3, 'formulate'],
        [2, 'surfactant'], [2, 'polysorbate'], [2, 'trehalose'], [2, 'sucrose'], [2, 'sugar'],
        [2, 'ingredient'], [2, 'component'], [2, 'percentage of'], [2, 'composition'],
        [1, 'buffer'], [1, 'media'], [1, 'ph']]
    },
    {
      id: 'capability', tool: 'analyze',
      title: 'Say whether the process is capable and in control',
      what: 'Capability indices and control charts',
      distinguish: 'you want Cpk, or to tell a real shift from ordinary noise',
      bring: 'One column of results in production order, plus the specification limits. Time order matters: within-subgroup sigma comes from the moving range.',
      first: 'It reports Cp, Cpk, Ppk and sigma level against your limits, and an individuals and moving-range chart that separates special causes from common ones.',
      then: 'Worth doing a Gage R&R first: measurement noise inflates the spread that Cpk is calculated from, so a poor index can be the assay rather than the process.',
      phrases: [[3, 'process capability'], [3, 'capability index'], [3, 'control chart'], [3, 'six sigma'],
        [3, 'defects per million'], [3, 'sigma level'], [3, 'in control'], [3, 'special cause'],
        [3, 'common cause'], [3, 'individual moving range'], [3, 'is my process capable'],
        [3, 'statistical process control'], [3, 'out of control'], [3, 'control limit'],
        [2, 'capability'], [2, 'capable'], [2, 'defect rate'], [2, 'process shift'], [2, 'trend report'],
        [1, 'chart'], [1, 'stable']]
    },
    {
      id: 'codon', tool: 'sequence',
      title: 'Optimise a gene, or search competing objectives',
      what: 'Genetic algorithm (NSGA-II), pointed at codon optimisation',
      distinguish: 'you are working on a DNA sequence or a many-objective search',
      bring: 'A clean coding sequence, and the host you are expressing in.',
      first: 'It evolves synonymous codons while the protein stays identical, trading off codon usage, GC window, restriction sites and 5-prime folding at once.',
      then: 'The output is a Pareto front, not one answer: every option that cannot be improved on one goal without giving ground on another.',
      phrases: [[3, 'codon'], [3, 'codon optimiz'], [3, 'dna sequence'], [3, 'gene sequence'],
        [3, 'synonymous'], [3, 'restriction site'], [3, 'expression construct'], [3, 'genetic algorithm'],
        [3, 'multi objective'], [3, 'pareto'], [3, 'construct design'], [3, 'host codon'],
        [3, 'gc content'], [3, 'codon adaptation'],
        [2, 'sequence optimiz'], [2, 'trade off curve'], [2, 'competing objective'], [2, 'escherichia coli'],
        [2, 'expression'], [2, 'nucleotide'],
        [1, 'sequence'], [1, 'gene'], [1, 'protein']]
    },
    {
      id: 'privacy', tool: 'privacy',
      title: 'See exactly where your data goes',
      what: 'Privacy and data handling, with a self-test you can run',
      distinguish: 'you are asking about confidentiality rather than about statistics',
      bring: 'Nothing. This page explains the guarantees and lets you verify them yourself.',
      first: 'The page has no network permission at all, enforced by its own Content Security Policy. It explains how to confirm that from your browser rather than take it on trust.',
      then: 'The short version: turn your WiFi off and everything still works. Nothing is uploaded, nothing is stored, and no AI service is involved.',
      phrases: [[3, 'is my data safe'], [3, 'data privacy'], [3, 'where does my data go'], [3, 'is it stored'],
        [3, 'upload*'], [3, 'data leave'], [3, 'send my data'], [3, 'data security'], [3, 'leave the laptop'],
        [3, 'leave my machine'], [3, 'anywhere else'], [3, 'phone home'],
        [3, 'confidential'], [3, 'is it secure'], [3, 'keep my data'], [3, 'customer data'],
        [3, 'artificial intelligence'], [3, 'language model'],
        [2, 'privacy'], [2, 'safe'], [2, 'secure'], [2, 'store'], [2, 'network'],
        [2, 'internet'], [2, 'cloud'], [2, 'offline'], [2, 'gxp regulated'], [2, 'validated'],
        [1, 'audit'], [1, 'trust']]
    }
  ];
  // Compile once: phrases are matched against stemmed tokens, so they are stemmed too.
  PLAYBOOKS.forEach(p => { p.compiled = p.phrases.map(([w, text]) => ({ w, text, ph: compilePhrase(text) })); });

  /* ---------- the concept layer ----------

     The phrase lists above are domain jargon, and they only fire when somebody already
     knows the name of the thing they need. Measured against phrasings written without that
     vocabulary, matching jargon alone recognised almost nothing - not routing wrongly, just
     failing to fire. People do not type "variance component analysis", they type "results
     jump around between lots".

     So underneath the jargon sits a layer of ordinary words grouped by what they MEAN, and
     the playbooks are scored on COMBINATIONS of those meanings. "Jump around" plus "lots"
     is a question about where variation comes from, whatever words carry it. This is
     written from what each tool's question is about, not from any list of phrasings, so it
     generalises instead of memorising. */
  const CONCEPTS = {
    VARY: ['vary', 'varies', 'variation', 'variability', 'variable', 'scatter', 'spread', 'jump around', 'jump', 'bounce',
      'swing', 'fluctuate', 'inconsistent', 'differ', 'different', 'difference', 'unstable', 'noisy', 'noise',
      'move around', 'moves around', 'wander', 'all over', 'not the same', 'never agree', 'disagree'],
    SOURCE_Q: ['which', 'who', 'where', 'where from', 'coming from', 'comes from', 'owns', 'own it', 'blame', 'fault', 'explain',
      'explains', 'cause', 'caused', 'responsible', 'due to', 'because of', 'behind', 'how much of'],
    GROUPING: ['lot', 'batch', 'drum', 'supplier', 'vendor', 'analyst', 'operator', 'technician', 'shift', 'day',
      'week', 'vessel', 'reactor', 'site', 'line', 'material', 'group', 'source', 'column', 'bag'],
    MEASURE: ['measure', 'measurement', 'assay', 'test', 'instrument', 'balance', 'reader', 'method', 'precision',
      'reading', 'certificate', 'analyst', 'technician', 'detector', 'gage', 'probe'],
    REPEAT: ['twice', 'again', 'repeat', 'replicate', 'duplicate', 'same sample', 'same vial', 'same lot', 'over and over',
      'two technician', 'two analyst', 'two operator', 'same material'],
    TIME: ['month', 'year', 'hour', 'week', 'day', 'long', 'age', 'ages', 'store', 'storage', 'keep', 'expire',
      'expiry', 'date', 'shelf', 'stability', 'degrade', 'over time', 'as it age', 'hold'],
    LIMIT: ['limit', 'spec', 'specification', 'range', 'bound', 'inside', 'within', 'criteria', 'criterion',
      'certificate', 'upper', 'lower', 'tolerance', 'pass', 'fail', 'cross the'],
    SET: ['set', 'write', 'pick', 'choose', 'decide', 'defend', 'justify', 'commit', 'committed', 'claim',
      'put on', 'quote', 'agree on', 'propose'],
    SAME: ['same', 'match', 'agree', 'identical', 'comparable', 'equivalent', 'behaves like', 'behave like',
      'nothing moved', 'no difference', 'unchanged', 'like the old', 'interchangeable', 'live with'],
    PROVE: ['prove', 'show', 'demonstrate', 'confirm', 'establish', 'evidence', 'convince', 'defend'],
    COUNT: ['how many', 'how much', 'number of', 'minimum', 'enough', 'big enough', 'size', 'sample size',
      'how big', 'bigger', 'too few', 'only four', 'how long a'],
    STUDY: ['study', 'trial', 'run', 'experiment', 'protocol', 'booking', 'book', 'instrument time', 'comparison',
      'campaign', 'exercise'],
    PLAN: ['before', 'plan', 'should we', 'should i', 'worth', 'start', 'next', 'lay out', 'take to the bench',
      'where do we start', 'what run', 'conditions'],
    SENSOR: ['sensor', 'tag', 'trace', 'probe', 'chart', 'logged', 'logging', 'minute', 'historian', 'profile',
      'trajectory', 'vessel', 'bioreactor', 'fermenter', 'online', 'every minute'],
    EARLY: ['during', 'while', 'still running', 'warning', 'early', 'in time', 'before it fail', 'as it happen',
      'the hour', 'left the', 'normal path'],
    RECORDS: ['record', 'history', 'historical', 'years of', 'past', 'previous', 'existing data', 'what we have',
      'batch record', 'data we have'],
    RANK: ['rank', 'important', 'matter', 'drive', 'driver', 'influence', 'affect', 'biggest', 'key', 'explain',
      'contribute', 'estimate', 'predict'],
    OUTCOME: ['yield', 'titer', 'purity', 'outcome', 'result', 'performance', 'quality', 'good lot', 'better',
      'best', 'potency', 'recovery'],
    BLEND: ['ingredient', 'proportion', 'percent', 'percentage', 'recipe', 'formulation', 'formulate',
      'blend', 'mixture', 'excipient', 'composition'],
    CONSTRAINT: ['add up', 'total', 'hundred', 'sum to', 'raise one', 'without lowering', 'cannot raise',
      'at the expense', 'share of'],
    PRIVACY_V: ['paste', 'send', 'sent', 'upload', 'leave', 'leaves', 'goes', 'go', 'stored', 'share', 'show to'],
    PRIVACY_N: ['data', 'number', 'information', 'laptop', 'machine', 'client', 'customer', 'wifi', 'internet',
      'cloud', 'network', 'service', 'offline', 'anywhere', 'confidential'],
    GENE: ['gene', 'dna', 'protein', 'host', 'codon', 'nucleotide', 'expression', 'construct', 'sequence'],
    OBJECTIVES: ['objective', 'goal', 'trade off', 'tradeoff', 'compromise', 'competing', 'pull against', 'at once'],
    STATE: ['steady', 'stable', 'control', 'drifting', 'odd', 'normal', 'usual', 'behaving', 'consistent', 'settled'],
    FREQ: ['how often', 'often', 'rate', 'proportion of the time', 'percentage of the time', 'comfortably', 'how likely'],
    SEPARATE: ['separable', 'separate', 'tell apart', 'tell these', 'confounded', 'distinguish', 'resolve', 'pick apart'],
    // Connectivity is its own topic: someone asking whether it needs a connection is asking
    // about data handling, whatever verb they hang it on.
    OFFLINE: ['wifi', 'offline', 'internet', 'network', 'air gapped', 'switched off', 'disconnected',
      'no connection', 'cloud', 'server', 'phone home']
  };
  const COMPILED_CONCEPTS = {};
  Object.keys(CONCEPTS).forEach(k => { COMPILED_CONCEPTS[k] = CONCEPTS[k].map(compilePhrase); });

  /* Which combinations of meanings point at which tool. A rule fires only when every one of
     its concepts is present, which is what keeps a single common word from routing anything. */
  const RULES = [
    { id: 'variance-components', w: 5, need: ['VARY', 'SOURCE_Q'] },
    { id: 'variance-components', w: 5, need: ['VARY', 'GROUPING'] },
    { id: 'variance-components', w: 3, need: ['SOURCE_Q', 'GROUPING', 'OUTCOME'] },
    { id: 'gage-rr', w: 6, need: ['MEASURE', 'REPEAT'] },
    { id: 'gage-rr', w: 4, need: ['MEASURE', 'VARY'] },
    { id: 'gage-rr', w: 5, need: ['MEASURE', 'SEPARATE'] },
    { id: 'gage-rr', w: 4, need: ['MEASURE', 'PROVE', 'VARY'] },
    { id: 'spec-limits', w: 6, need: ['LIMIT', 'SET'] },
    { id: 'spec-limits', w: 4, need: ['LIMIT', 'PROVE'] },
    { id: 'spec-limits', w: 4, need: ['LIMIT', 'GROUPING', 'SET'] },
    { id: 'study-size', w: 6, need: ['COUNT', 'STUDY'] },
    { id: 'study-size', w: 5, need: ['COUNT', 'GROUPING'] },
    { id: 'study-size', w: 4, need: ['COUNT', 'PLAN'] },
    { id: 'equivalence', w: 6, need: ['SAME', 'PROVE'] },
    { id: 'equivalence', w: 4, need: ['SAME', 'GROUPING'] },
    { id: 'equivalence', w: 4, need: ['SAME', 'MEASURE'] },
    { id: 'shelf-life', w: 6, need: ['TIME', 'LIMIT'] },
    { id: 'shelf-life', w: 5, need: ['TIME', 'SET'] },
    { id: 'shelf-life', w: 4, need: ['TIME', 'VARY'] },
    { id: 'golden-batch', w: 6, need: ['SENSOR', 'EARLY'] },
    { id: 'golden-batch', w: 5, need: ['SENSOR', 'VARY'] },
    { id: 'golden-batch', w: 5, need: ['SENSOR', 'SOURCE_Q'] },
    { id: 'golden-batch', w: 4, need: ['SENSOR', 'LIMIT'] },
    { id: 'ml-doe', w: 5, need: ['RANK', 'OUTCOME'] },
    { id: 'ml-doe', w: 5, need: ['RECORDS', 'RANK'] },
    { id: 'ml-doe', w: 4, need: ['RECORDS', 'OUTCOME'] },
    { id: 'doe-screen', w: 5, need: ['PLAN', 'STUDY'] },
    { id: 'doe-screen', w: 4, need: ['STUDY', 'SEPARATE'] },
    { id: 'doe-screen', w: 4, need: ['PLAN', 'OUTCOME', 'STUDY'] },
    { id: 'mixture', w: 6, need: ['BLEND', 'CONSTRAINT'] },
    { id: 'mixture', w: 4, need: ['BLEND', 'OUTCOME'] },
    { id: 'mixture', w: 4, need: ['BLEND', 'SET'] },
    { id: 'capability', w: 5, need: ['LIMIT', 'FREQ'] },
    { id: 'capability', w: 5, need: ['STATE', 'LIMIT'] },
    { id: 'capability', w: 4, need: ['STATE', 'VARY'] },
    { id: 'codon', w: 5, need: ['GENE', 'OUTCOME'] },
    { id: 'codon', w: 5, need: ['GENE', 'SET'] },
    { id: 'codon', w: 4, need: ['OBJECTIVES', 'SEPARATE'] },
    { id: 'codon', w: 5, need: ['OBJECTIVES', 'COMPETE'] },
    { id: 'privacy', w: 6, need: ['PRIVACY_V', 'PRIVACY_N'] },
    /* A few meanings are unambiguous in this toolkit on their own: nothing else here is
       about genes, or about competing objectives, or about whether a run is still on its
       normal path. Those fire alone, at a lower weight than any combination, so a sentence
       carrying one clear idea is routed instead of rejected - while two ideas together
       still outrank one. */
    { id: 'codon', w: 4, need: ['GENE'] },
    { id: 'codon', w: 4, need: ['OBJECTIVES'] },
    { id: 'golden-batch', w: 4, need: ['EARLY'] },
    { id: 'golden-batch', w: 3, need: ['SENSOR'] },
    { id: 'capability', w: 3, need: ['STATE'] },
    { id: 'mixture', w: 4, need: ['CONSTRAINT'] },
    { id: 'mixture', w: 3, need: ['BLEND'] },
    { id: 'capability', w: 3, need: ['FREQ'] },
    { id: 'privacy', w: 5, need: ['OFFLINE'] },
    { id: 'privacy', w: 5, need: ['PRIVACY_V', 'SOURCE_Q'] }
  ].filter(r => r.need.every(c => CONCEPTS[c]));

  const MIN_SCORE = 3;        // below this, nothing was really recognised
  const CLOSE = 0.78;         // second place this near the first means ask rather than assert

  function advise(text) {
    const tokens = tokenize(text);
    const typed = String(text || '').trim();
    if (!typed) return { status: 'empty', recommendations: [] };
    // Which meanings are present, once, for every rule to draw on.
    const present = {};
    const conceptHits = {};
    Object.keys(COMPILED_CONCEPTS).forEach(k => {
      /* Negation is deliberately NOT applied here. "Rewrite the gene without changing the
         protein" and "I cannot raise one ingredient without lowering the others" are
         squarely about genes and about blends: the "not" modifies a clause, it does not
         change the subject. Suppressing topic words near a negation threw away more right
         answers than it saved. It still applies to the jargon phrases below, where someone
         writing "not a stability study" means exactly that. */
      for (const ph of COMPILED_CONCEPTS[k]) {
        if (!findAll(tokens, ph).length) continue;
        present[k] = true;
        if (!conceptHits[k]) conceptHits[k] = ph.toks.join(' ');
        break;
      }
    });
    const ruleScore = {}, ruleWhy = {};
    for (const r of RULES) {
      if (!r.need.every(c => present[c])) continue;
      ruleScore[r.id] = (ruleScore[r.id] || 0) + r.w;
      (ruleWhy[r.id] = ruleWhy[r.id] || []).push(r.need.map(c => conceptHits[c]).join(' + '));
    }

    const scored = PLAYBOOKS.map(p => {
      let score = ruleScore[p.id] || 0;
      const hits = (ruleWhy[p.id] || []).map(t => ({ text: t, w: 3 }));
      for (const c of p.compiled) {
        const at = findAll(tokens, c.ph);
        if (!at.length) continue;
        // A phrase the typist negated counts against the match instead of for it.
        const clean = at.filter(i => !(i > 0 && NEGATIONS.has(tokens[i - 1])) && !(i > 1 && NEGATIONS.has(tokens[i - 2])));
        if (clean.length) { score += c.w; hits.push({ text: c.text, w: c.w }); }
        else score -= c.w * 0.5;
      }
      hits.sort((a, b) => b.w - a.w);
      return { playbook: p, score, hits };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.playbook.id.localeCompare(b.playbook.id));

    if (!scored.length || scored[0].score < MIN_SCORE) {
      return {
        status: 'nomatch', tokens, recommendations: [],
        message: 'Nothing in that matched the vocabulary this router knows. It recognises words, not meaning, so it is quite possible the tool you need is here and you simply phrased it differently. Try naming the thing you measured and what you want to know about it — or pick from the list below.'
      };
    }
    const top = scored.slice(0, 3).map(s => ({
      id: s.playbook.id, tool: s.playbook.tool, mode: s.playbook.mode, open: s.playbook.open,
      title: s.playbook.title, what: s.playbook.what, bring: s.playbook.bring,
      first: s.playbook.first, then: s.playbook.then, distinguish: s.playbook.distinguish,
      score: s.score, hits: s.hits.slice(0, 6).map(h => h.text)
    }));
    const unsure = scored.length > 1 && scored[1].score >= scored[0].score * CLOSE;
    return {
      status: unsure ? 'unsure' : 'ok', tokens, recommendations: top,
      question: unsure ? 'Which is closer to what you need: ' + top[0].distinguish + ', or ' + top[1].distinguish + '?' : null
    };
  }

  root.MLAdvisor = { advise, tokenize, stem, PLAYBOOKS, MIN_SCORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLAdvisor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
