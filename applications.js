/* What each technique in this tool is used for across industries and functions.

   Written to be read standing up: one line per area, as a comma-separated list of uses.
   These describe the technique in general. Every tool here works on tabular data (and DNA
   sequences in the optimizer), never on images, audio or free text, and each entry's scope
   line says so, so the panel can be shown to an audience without overselling it.

   Content only; no computation, no network, no storage. */
(function (root) {
  'use strict';

  const APPLICATIONS = {
    analyze: {
      tech: 'Supervised and unsupervised learning, neural networks, design of experiments',
      scope: 'In this tool: rows and columns of numbers and categories — batch records, run logs, assay results.',
      groups: [
        { name: 'Upstream', text: 'Clone and feed screening, bioreactor and fermenter parameter effects on titer and quality, scale-down model agreement, harvest timing against what downstream can process.' },
        { name: 'Downstream', text: 'Load, wash and elution conditions against yield and purity, resin and membrane lifetime, pooling criteria, step yields reconciled across the train.' },
        { name: 'Analytical and formulation', text: 'Assay variability split across analyst, instrument and day, excipient and pH effects on stability, method robustness factors, specifications set from real capability.' },
        { name: 'Manufacturing and MSAT', text: 'Batch records mined for deviation causes, site-to-site and scale-to-scale differences, characterisation designs, parameters ranked for the control strategy.' },
        { name: 'Where neural networks earn their place', note: true, text: 'Here a network competes on the same leaderboard as simpler models and wins only when it truly predicts better, which on tabular data is rarer than expected. The same technique drives visual inspection and speech and language work, all of which need inputs this page does not take.' }
      ]
    },
    stability: {
      tech: 'Linear regression with confidence limits, and poolability testing (ICH Q1E)',
      scope: 'In this tool: a measured attribute against time, by batch, against your specification limits.',
      groups: [
        { name: 'Drug substance and drug product', text: 'Purity, aggregate and potency trends to specification, expiry taken from the confidence limit, poolability across primary batches, long-term against accelerated conditions.' },
        { name: 'Formulation development', text: 'Candidate formulations ranked on degradation rate, accelerated against real-time agreement, excipient and pH effects on shelf life, container closure comparisons.' },
        { name: 'Materials and intermediates', text: 'Harvest and pool hold times, buffer and media usable life, resin and membrane lifetime, incoming material expiry set from measured degradation.' },
        { name: 'Filings and claims', text: 'Shelf life with the extrapolation limits the guideline sets, poolability evidence on file, condition-by-condition reporting, expiry maintained as commercial data accrues.' }
      ]
    },
    golden: {
      tech: 'Principal component analysis and multivariate statistical process control (Hotelling T², Q residuals)',
      scope: 'In this tool: time-series readings from several sensors across many batches, aligned on how far through the batch each reading was.',
      groups: [
        { name: 'Live batch monitoring', text: 'A running batch compared against the path good ones took, drift caught during the run rather than in the deviation report, the sensor to blame named as it strays, hours of warning instead of hindsight.' },
        { name: 'Campaign review', text: 'A whole campaign triaged in one table, the unusual batches picked out for review, release supported by how far each batch sat from normal, trends across a campaign rather than one run.' },
        { name: 'Deviation investigation', text: 'The hour a batch went off, the sensors that moved together, whether that pattern ever appeared in a good run, a starting point instead of the whole batch record.' },
        { name: 'Scale-up and transfer', text: 'At-scale batches scored against the scale-down envelope, a receiving site compared with the sending site, a new line judged against the qualified one, trajectories compared rather than endpoints.' },
        { name: 'Probe and equipment health', text: 'A sensor drifting out of step with the rest of the vessel, a seal or valve degrading, calibration slipping between services, all visible before the reading itself leaves its own limits.' },
        { name: 'Why one number beats thirty charts', note: true, text: 'A batch can sit inside every single sensor limit and still be wrong, because what went wrong was the combination: temperature a little high while dissolved oxygen ran low and feed lagged. Thirty charts cannot show a combination. T² is that combination as one line, and Q catches the case where the sensors stop agreeing with each other at all.' }
      ]
    },
    equivalence: {
      tech: 'Equivalence and non-inferiority testing by two one-sided tests (TOST)',
      scope: 'In this tool: results from two methods, labs, instruments or analysts, against a margin you set first.',
      groups: [
        { name: 'Analytical method transfer', text: 'Development laboratory against receiving QC, instrument against instrument, analyst against analyst, a method bridged after a change without full revalidation.' },
        { name: 'Process and scale', text: 'Scale-down model against at-scale, pilot against GMP, site against site, a clone or strain change shown comparable, a suite qualified against the first one.' },
        { name: 'Materials and consumables', text: 'A second resin or media lot, an alternative single-use assembly, a new filter or membrane supplier, a second-source excipient.' },
        { name: 'Comparability after change', text: 'Pre-change against post-change product, biosimilar against reference, a bridging exercise for a process improvement, lot-to-lot equivalence of clinical supplies.' }
      ]
    },
    variance: {
      tech: 'Variance component analysis, one-way ANOVA with Tukey comparisons, and measurement system analysis (Gage R&R)',
      scope: 'In this tool: repeated measurements labelled by the source you suspect \u2014 lot, analyst, instrument, vessel, shift \u2014 or a crossed study of samples by operators.',
      groups: [
        { name: 'Raw materials and suppliers', text: 'Resin, media and buffer lot effects on yield and quality, one supplier against another, incoming lot variability against process variability, the case for tightening or relaxing an incoming specification, a lot disqualified on evidence rather than on suspicion.' },
        { name: 'Analytical methods', text: 'Assay variation split across analyst, instrument, column and day, method precision quantified before a transfer, replicate strategy chosen from measured noise, system suitability limits set from capability, an apparent out-of-trend result tested against the method that produced it.' },
        { name: 'Equipment and measurement systems', text: 'Gage R&R on balances, HPLCs, plate readers and probes, repeatability separated from operator-to-operator disagreement, distinct categories checked before a control chart is trusted, qualification repeated after a service or a software change.' },
        { name: 'Process and equipment trains', text: 'Vessel-to-vessel and skid-to-skid differences, shift and site effects, column and membrane position, nested variation across campaign, batch and sample, the share of spread that is genuinely controllable named before a project is scoped.' },
        { name: 'Specifications and capability', text: 'Specification limits built from the real components of variation rather than from historical ranges, measurement noise removed before capability is quoted, sample sizes justified from the variance structure, tolerance intervals argued from the right error term.' },
        { name: 'Why this comes before everything else', note: true, text: 'A capability index, a trend report and a comparability study all take the measurement at face value. If a third of what you observe is the assay, every one of those numbers is partly about the assay, and no amount of further analysis will separate them after the fact. Splitting the variation first is what tells you whether the rest of the work is measuring your process or your instrument.' }
      ]
    },
    limits: {
      tech: 'Tolerance intervals, statistical power and sample size',
      scope: 'In this tool: one column of independent results for a limit, or the scatter you expect and the difference that matters for a study size.',
      groups: [
        { name: 'Specification setting', text: 'Release and shelf-life limits argued from measured capability, limits defended at a filing or an inspection, in-process action and alert levels, a specification widened or tightened on evidence, the gap between what a process holds and what was committed to on three batches.' },
        { name: 'Study design', text: 'Comparability and method-transfer studies sized before instrument time is booked, characterisation runs costed honestly, stability designs with enough batches to matter, Gage R&R and variance studies sized so their own estimates mean something.' },
        { name: 'Process validation', text: 'Process performance qualification batch numbers justified statistically, continued process verification limits set from the qualification data, acceptance criteria agreed in advance rather than fitted afterwards, sampling plans defended on coverage.' },
        { name: 'Materials and suppliers', text: 'Incoming specifications set from supplier history, a second-source qualification sized to a margin agreed first, certificate-of-analysis limits checked against what the vendor can really hold, hold-time and usable-life limits taken from the data behind them.' },
        { name: 'Deciding not to run a study', text: 'The calculation that shows a planned comparison could never have reached a conclusion, the margin that no achievable study can support, the difference too small to detect against the method noise, and the honest case for improving the measurement first.' },
        { name: 'Why not mean plus three standard deviations', note: true, text: 'On a handful of batches the standard deviation is itself a rough guess, and plugging it into a formula meant for a known sigma produces limits that cover far less than they claim. On ten results the honest factor for 99% coverage is about 4.4, not 3. That gap is the whole reason specifications set on early batches get broken later, and it is arithmetic rather than bad luck.' }
      ]
    },
    sequence: {
      tech: 'Genetic algorithms and multi-objective optimization (NSGA-II)',
      scope: 'In this tool: pointed at codon optimization, evolving synonymous codons while the protein stays identical.',
      groups: [
        { name: 'Construct and strain design', text: 'Host codon usage for CHO, HEK293 or E. coli, restriction sites and homopolymer runs designed out, GC held in the synthesis window, the 5′ end kept unfolded.' },
        { name: 'Process optimisation', text: 'Feed, pH and temperature combinations too numerous to run, objectives that genuinely conflict such as titer against glycans, the trade-off curve rather than one setpoint.' },
        { name: 'Formulation search', text: 'Excipient, buffer and surfactant combinations under competing stability, viscosity and concentration targets, with hard constraints never violated.' },
        { name: 'Scheduling and capacity', text: 'Suite and skid scheduling, campaign sequencing under changeover limits, cleaning and turnaround windows, analytical queues under instrument and analyst constraints.' },
        { name: 'Why multi-objective, not one score', note: true, text: 'Collapsing competing goals into one weighted number hides the trade-off and buries the argument in the weights. A Pareto front shows every option that cannot be improved on one goal without giving ground on another, which is the honest input to a decision somebody has to own.' }
      ]
    }
  };

  /* Tailored examples for recombinant protein CDMO work.

     Two modalities, because that is the real split in how a molecule is made, and the
     functions a development and manufacturing site is actually organised into. Pick a
     function and the panel lists the unit operations that sit inside it, each with what
     machine learning is used for at that step. Zooming in: technique, then function, then
     the step in front of you.

     Function names and unit operations follow common industry practice, not any one
     company's org chart. Rename them to match your own site if they differ.

     The choice is held in memory for the session only: nothing is stored, so it resets on
     reload, like everything else here. */
  const MODALITIES = [
    ['mammalian', 'Mammalian (CHO) recombinant protein'],
    ['microbial', 'Microbial (E. coli) recombinant protein']
  ];
  const FUNCTIONS = [
    ['cld', 'Cell line / strain development'],
    ['uspd', 'Upstream process development'],
    ['dspd', 'Downstream process development'],
    ['afs', 'Analytical & formulation sciences (AFS)'],
    ['msat', 'MSAT & technology transfer'],
    ['mfg', 'GMP manufacturing'],
    ['qc', 'Quality control'],
    ['qa', 'Quality assurance & regulatory']
  ];

  /* Unit operations inside each function, with what machine learning is used for at that
     step. These are uses of the methods in general; what this page itself does with your
     data is whatever tool you have selected. */
  const UNITOPS = {
    mammalian: {
      cld: [
        ['Transfection and selection', 'Pool performance predicted from early growth and titer reads, so weak pools are cut before they take up incubator space.'],
        ['Single-cell cloning', 'Imaging and outgrowth features used to rank clones on survival probability, rather than on a day-14 titer alone.'],
        ['Clone screening (deep well, shake)', 'Small-scale reads modelled against later bioreactor performance, to learn which screens actually predict and which are noise.'],
        ['Clonal stability study', 'Titer and quality drift over generations fitted as a trend with confidence limits, so the generation limit has evidence behind it.'],
        ['Cell banking (MCB, WCB)', 'Post-thaw viability and recovery tracked across vials and runs, flagging cryopreservation or bank drift early.']
      ],
      uspd: [
        ['Vial thaw and seed train', 'Growth rate and doubling time through the train modelled against production-stage outcome, so a slow train is caught before inoculation.'],
        ['Scale-down model (shake flask, ambr)', 'Agreement between scale-down and at-scale tested formally rather than assumed, before the model carries a characterisation study.'],
        ['Production bioreactor (fed-batch, perfusion)', 'DO, pH, temperature, agitation and sparge ranked for their effect on titer and quality, with a design that breaks the correlations historical runs leave behind.'],
        ['Feed and supplement strategy', 'Feed timing, volume and composition searched against titer, glycans and lactate together, where those goals genuinely conflict.'],
        ['Harvest timing', 'Viability, aggregate and host cell protein at harvest modelled to choose a day downstream can actually process.']
      ],
      dspd: [
        ['Clarification and depth filtration', 'Throughput and filter loading predicted from harvest turbidity and debris, so the step is sized before it blinds mid-batch.'],
        ['Protein A capture', 'Load density, residence time and wash conditions against yield, host cell protein and aggregate clearance, with resin lifetime tracked across cycles.'],
        ['Low-pH viral inactivation', 'Hold time, pH and temperature against aggregate formation, to find the window that inactivates without damaging product.'],
        ['Polishing (AEX, CEX, HIC)', 'Load conductivity, pH and gradient slope tuned for the purity against yield trade-off, with pooling criteria set from data rather than habit.'],
        ['Viral filtration', 'Flux decay and throughput predicted from feed quality, to avoid a filter change in the middle of a batch.'],
        ['UF/DF and bulk formulation', 'Transmembrane pressure, concentration factor and diafiltration volumes against aggregation and final concentration accuracy.']
      ],
      afs: [
        ['Titer and cell counting', 'Assay variability partitioned across analyst, instrument and day, so method noise is not read as a process signal.'],
        ['Purity (SEC, CE-SDS)', 'Aggregate and fragment results trended against process conditions, with specification limits set from measured capability.'],
        ['Charge variants (iCIEF, IEX)', 'Acidic and basic species modelled against culture conditions and harvest timing.'],
        ['Glycan profiling (HILIC)', 'Glycoform distribution against feed, pH and temperature, where several glycan targets compete with each other.'],
        ['Potency bioassay', 'Plate and operator variation separated from true sample differences, and the method transferred with an equivalence test rather than a t-test.'],
        ['Formulation and stability screening', 'Excipient, pH and surfactant combinations ranked on degradation rate, then confirmed with a shelf-life fit.']
      ],
      msat: [
        ['Scale-down model qualification', 'Formal equivalence between scale-down and at-scale, with a margin set before the runs, instead of an eyeball comparison.'],
        ['Technology transfer runs', 'Receiving site compared with sending site against an agreed margin, so "comparable" means something specific.'],
        ['Process characterisation (PC)', 'Factorial and response-surface designs that separate critical parameters from noise, and give a filing the ranges it needs.'],
        ['PPQ and continued process verification', 'Capability and control charts across PPQ and commercial batches, watching several parameters together rather than thirty charts separately.'],
        ['Deviation and investigation support', 'Historical batch records mined for what the deviating batch had in common with others.']
      ],
      mfg: [
        ['Media and buffer preparation', 'Weighing, pH and conductivity records trended for prep-to-prep drift that surfaces later as a chromatography problem.'],
        ['Seed train and bioreactor operation', 'The live batch trajectory compared with the envelope of good batches, so drift is caught during the run and not in the deviation report.'],
        ['Harvest and chromatography skids', 'Step yields and pool attributes reconciled across the train, identifying the step that actually lost the material.'],
        ['TFF and filtration', 'Flux and pressure profiles compared with previous batches to anticipate a membrane or filter issue.'],
        ['Fill and finish', 'Fill weight capability, stopper and seal attributes, and line speed against reject rate.']
      ],
      qc: [
        ['Raw material and component release', 'Incoming lot attributes linked to downstream performance, to learn which specifications genuinely matter.'],
        ['In-process testing', 'Turnaround and variability trended, with out-of-trend results separated from ordinary assay scatter.'],
        ['Release testing', 'Capability against specification for every released attribute, reported as PPM and sigma level rather than a pass count.'],
        ['Stability programme', 'Trend fits with confidence limits per condition, poolability across batches, expiry maintained as data accrues.'],
        ['OOS and OOT investigations', 'Whether a result is a real shift or sits inside assay capability, decided with numbers rather than argument.']
      ],
      qa: [
        ['Batch record review', 'Records mined across batches for recurring patterns, ahead of the trend report rather than after it.'],
        ['Deviation and CAPA', 'Effectiveness evidenced with before-and-after capability, instead of an absence of repeats.'],
        ['Change control', 'Comparability and equivalence evidence assembled for the change, with the margin fixed before the data was seen.'],
        ['Annual product quality review', 'Capability, stability trends and control charts for the year built from the raw data, not from summaries of summaries.'],
        ['Data integrity and audit readiness', 'Every analysis exported with its input fingerprints, settings and the model that produced it.']
      ]
    },
    microbial: {
      cld: [
        ['Construct and codon design', 'Codon usage matched to the host, restriction sites and repeats designed out, GC held inside the synthesis window.'],
        ['Expression screening', 'Small-scale expression reads modelled against fermenter performance, to learn which screens predict and which mislead.'],
        ['Plasmid and strain stability', 'Plasmid retention and expression over generations fitted as a trend, so the generation limit rests on data.'],
        ['Cell banking (WCB)', 'Post-thaw viability and lag time tracked across vials for bank-to-bank consistency.']
      ],
      uspd: [
        ['Inoculum and seed', 'Seed density and growth rate against fermentation outcome, so a weak inoculum is caught before the production vessel.'],
        ['Fed-batch fermentation', 'DO, pH, temperature, feed rate and agitation ranked for their effect on titer and soluble fraction, with a design that breaks historical correlation.'],
        ['Induction strategy', 'Induction density, inducer concentration and post-induction temperature against yield and inclusion-body quality.'],
        ['Scale-up parameters', 'Oxygen transfer, tip speed and mixing time compared between scales, with the scale-down model formally qualified.'],
        ['Biomass harvest', 'Centrifugation and resuspension conditions against cell integrity and how well the lysis step will then perform.']
      ],
      dspd: [
        ['Cell lysis (homogenisation)', 'Pressure and pass count against release and fines generation, which decides how hard clarification becomes.'],
        ['Inclusion body wash', 'Wash composition and cycle count against the purity entering refolding.'],
        ['Solubilisation and refolding', 'Redox ratio, pH, protein concentration and additives searched together against refold yield and aggregate, a space far too large to run exhaustively.'],
        ['Capture chromatography', 'Load and wash conditions against yield, host cell protein and endotoxin clearance.'],
        ['Polishing and endotoxin clearance', 'Conditions tuned for purity against yield, with endotoxin and host cell protein treated as competing objectives.'],
        ['UF/DF and bulk formulation', 'Concentration and buffer exchange against aggregation and final concentration accuracy.']
      ],
      afs: [
        ['Purity (RP-HPLC, CE-SDS)', 'Purity and related substances trended against fermentation and refold conditions.'],
        ['Aggregates (SEC)', 'High molecular weight species against refolding and concentration conditions, with method variability separated out first.'],
        ['Host cell protein ELISA', 'Clearance across the train, with assay variability distinguished from real carryover.'],
        ['Endotoxin (LAL)', 'Clearance modelled step by step, identifying which step actually limits it.'],
        ['Refolding yield assays', 'Yield reads linked back to redox and additive conditions, confirming whether the optimiser was right.'],
        ['Formulation and stability screening', 'Buffer, pH and excipient combinations ranked on degradation rate, then confirmed with a shelf-life fit.']
      ],
      msat: [
        ['Scale-down model qualification', 'Equivalence between bench fermenter and production scale, tested rather than assumed.'],
        ['Technology transfer runs', 'Receiving-site fermentations compared with the sending site against a margin agreed in advance.'],
        ['Process characterisation (PC)', 'Designs that separate critical fermentation and refold parameters from noise, with ranges a filing can use.'],
        ['PPQ and continued process verification', 'Capability and multivariate control across PPQ and commercial campaigns.'],
        ['Deviation and investigation support', 'Campaign records mined for what the failing run shared with others.']
      ],
      mfg: [
        ['Media preparation and sterilisation', 'Prep records and sterilisation cycles trended for the drift that later shows up as a slow fermentation.'],
        ['Fermentation operation', 'The live trajectory compared with the envelope of good campaigns, so drift is caught during the run.'],
        ['Harvest and homogenisation', 'Centrifuge and homogeniser performance against how filterable the stream then is.'],
        ['Refold and chromatography', 'Step yields reconciled across the train, identifying the limiting step rather than guessing at it.'],
        ['UF/DF and fill', 'Flux profiles and fill weight capability trended batch to batch.']
      ],
      qc: [
        ['Raw material and component release', 'Incoming lot attributes linked to fermentation and refold performance, to learn which specifications matter.'],
        ['In-process testing (density, bioburden, endotoxin)', 'Turnaround and variability trended, with out-of-trend results separated from assay scatter.'],
        ['Release testing', 'Capability against specification for every released attribute, as PPM and sigma level rather than a pass count.'],
        ['Stability programme', 'Trend fits with confidence limits per condition, poolability across batches, expiry maintained as data accrues.'],
        ['OOS and OOT investigations', 'Whether a result is a real shift or inside assay capability, decided with numbers.']
      ],
      qa: [
        ['Batch record review', 'Campaign records mined across batches for recurring patterns ahead of the trend report.'],
        ['Deviation and CAPA', 'Effectiveness evidenced with before-and-after capability rather than an absence of repeats.'],
        ['Change control', 'Comparability and equivalence evidence assembled for the change, with the margin fixed beforehand.'],
        ['Annual product quality review', 'Capability, stability trends and control charts for the year built from raw data.'],
        ['Data integrity and audit readiness', 'Every analysis exported with input fingerprints, settings and the model that produced it.']
      ]
    }
  };

  // What the selected technique specifically does for that function.
  const BYFUNCTION = {
    analyze: {
      cld: 'Rank clones and strains on the screen reads that actually predict later performance, and design the confirmation study.',
      uspd: 'Find which bioreactor or fermenter parameters move titer and quality, then design the experiment that separates the ones history has confounded.',
      dspd: 'Model yield and purity against load, wash and elution conditions, and design the characterisation runs around the optimum.',
      afs: 'Partition assay variability across analyst, instrument and day, and model which process conditions move the attribute.',
      msat: 'Mine batch records for what distinguishes a good campaign, and produce the characterisation design a filing needs.',
      mfg: 'Turn historical batch data into the few parameters worth controlling, and the settings to run with.',
      qc: 'Separate assay noise from real process shifts, and show capability against specification rather than a pass count.',
      qa: 'Evidence for trend reports, CAPA effectiveness and annual reviews, drawn from raw data rather than from summaries.'
    },
    stability: {
      cld: 'Fit titer and quality drift over generations, to set a generation limit that can be defended.',
      uspd: 'Hold-time limits for harvest and intermediates, taken from measured degradation rather than convention.',
      dspd: 'Pool and intermediate hold times, resin and membrane life, from trends with confidence limits attached.',
      afs: 'The core use: expiry from the confidence limit, poolability across batches, formulations ranked on degradation rate.',
      msat: 'Shelf life maintained as commercial batches accrue, with extrapolation kept inside what the data supports.',
      mfg: 'In-process hold limits and material usable life, set from data and auditable afterwards.',
      qc: 'The stability programme itself: per-condition trend fits, poolability, expiry updated as the study matures.',
      qa: 'Shelf-life claims with the extrapolation limits documented and the poolability evidence on file.'
    },
    golden: {
      cld: 'Screening runs compared against the pattern good clones produced, so an odd one is spotted before it reaches the bioreactor.',
      uspd: 'The core use: every bioreactor or fermenter run scored against the path good batches took, with the sensor to blame named at the hour it drifts.',
      dspd: 'Chromatography and filtration profiles compared run to run, so a column or membrane degrading shows up before the pool fails its test.',
      afs: 'Instrument traces compared against normal, flagging the runs where the detector, column or sample handling behaved unlike any good sequence.',
      msat: 'At-scale batches scored against the scale-down envelope, and a receiving site against the sending site, on trajectories rather than endpoints.',
      mfg: 'A running batch watched against the envelope of good ones, with hours of warning instead of a deviation report after the fact.',
      qc: 'Analytical sequences and system suitability trends watched together, separating a real shift from ordinary instrument scatter.',
      qa: 'Campaign review with every batch triaged in one table, and an investigation that starts from the hour and the sensor rather than from the whole record.'
    },
    equivalence: {
      cld: 'A new clone or strain shown comparable to the one it replaces, within a margin set in advance.',
      uspd: 'Scale-down model against at-scale, and a process change shown to have done no harm.',
      dspd: 'A second resin lot, an alternative membrane, or a re-sequenced train shown to match the qualified one.',
      afs: 'Method transfer to QC, instrument to instrument, analyst to analyst, with power behind it rather than a quiet t-test.',
      msat: 'The heart of tech transfer: receiving site against sending site, with the margin agreed before the runs.',
      mfg: 'A second suite, skid or line shown to match the qualified one before anything is released from it.',
      qc: 'Method bridging after a change, and whether an apparent shift is real or sits inside capability.',
      qa: 'Comparability evidence for change control, with the margin fixed before the data was seen.'
    },
    variance: {
      cld: 'Split clone screening spread into real clone differences and plate or assay noise, so a top performer is not simply a lucky well.',
      uspd: 'Separate vessel, shift and media-lot effects from process variation, and size the replication a development study actually needs.',
      dspd: 'Separate resin lot, column position and operator effects from step-yield variation, so a column is retired on evidence rather than on age.',
      afs: 'The core use: assay precision partitioned across analyst, instrument and day, and Gage R&R run before a method is trusted to release product.',
      msat: 'Split site, scale and train differences from ordinary batch noise, and show which part of a scale-up gap is real.',
      mfg: 'Name how much of batch-to-batch spread is the equipment, the shift or the material, before a CAPA is written against the wrong one.',
      qc: 'Measurement system analysis on each instrument, and incoming lot variation tested against the method that measures it.',
      qa: 'Variation attributed to a named source in trend reports and investigations, with the measurement system qualified so capability is about product rather than assay.'
    },
    limits: {
      cld: 'Size a clone screen so the winner is a real winner, and set generation-limit criteria from the data rather than from convention.',
      uspd: 'Size characterisation and scale-down studies honestly, and set in-process action levels from measured capability.',
      dspd: 'Set pool and intermediate acceptance limits from what the train really delivers, and size the runs needed to defend them.',
      afs: 'Set specification and system-suitability limits with the coverage stated, and size method-transfer studies so they can actually conclude.',
      msat: 'Justify process performance qualification batch numbers, and set continued verification limits from the qualification data.',
      mfg: 'Alert and action levels that reflect real capability, and sampling plans defended on how much of production they cover.',
      qc: 'Release limits argued from capability rather than from history, and the number of replicates a result needs to be trusted.',
      qa: 'Specification limits with the statistical argument attached for filings and inspections, and study protocols with the sample size justified in advance.'
    },
    sequence: {
      cld: 'Codon-optimise the construct for the host while removing restriction sites and holding GC inside the synthesis window.',
      uspd: 'Search feed, pH and temperature combinations too numerous to run, returning the trade-off curve rather than a single setpoint.',
      dspd: 'Search refold and elution conditions where yield, aggregate and clearance pull against each other.',
      afs: 'Search excipient, pH and surfactant combinations under competing stability and viscosity targets.',
      msat: 'Search inside characterised ranges for settings that satisfy every quality attribute at once.',
      mfg: 'Sequence campaigns and suites under changeover and cleaning constraints.',
      qc: 'Schedule the analytical queue under instrument and analyst constraints.',
      qa: 'A search that is reproducible on demand: same seed, same inputs, same answer, which is what a reviewer asks for.'
    }
  };

  root.MLApplications = APPLICATIONS;
  root.MLApplications.MODALITIES = MODALITIES;
  root.MLApplications.FUNCTIONS = FUNCTIONS;
  root.MLApplications.UNITOPS = UNITOPS;
  root.MLApplications.BYFUNCTION = BYFUNCTION;

  if (typeof module !== 'undefined' && module.exports) module.exports = APPLICATIONS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
