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
