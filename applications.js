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
      scope: 'In this tool: rows and columns of numbers and categories.',
      groups: [
        { name: 'Process and manufacturing', text: 'Yield drivers out of dozens of candidates, run sheets that separate parameters production data confounds, settings that balance yield, purity and cost.' },
        { name: 'Product development', text: 'Formulation stability matrices, alloy ratios, flavour and texture balance, coating performance across substrate and cure conditions.' },
        { name: 'Energy and utilities', text: 'Grid load from weather and usage history, boiler fuel consumption, turbine pitch against measured conditions, solar array maintenance from performance drift.' },
        { name: 'Commercial analytics', text: 'Churn from engagement data, pricing experiments, lead conversion by channel, campaigns designed as experiments rather than one change at a time.' },
        { name: 'Reliability', text: 'Conditions that precede failure, remaining useful life from operating logs, real degradation told apart from normal variation, sensors worth their cost.' },
        { name: 'Where neural networks earn their place', note: true, text: 'Here a network competes on the same leaderboard as simpler models and wins only when it truly predicts better, which on tabular data is rarer than expected. The same technique drives visual inspection and speech and language work, all of which need inputs this page does not take.' }
      ]
    },
    stability: {
      tech: 'Linear regression with confidence limits, and poolability testing (ICH Q1E)',
      scope: 'In this tool: a measured attribute against time, by batch, against your specification limits.',
      groups: [
        { name: 'Pharmaceutical QA and regulatory', text: 'Expiry dates from the confidence limit, batch poolability across primary studies, potency and impurity kinetics, defensible extrapolation limits.' },
        { name: 'Food and beverage', text: 'Shelf life under variable cold chain, nutritional decay in packaged goods, lipid oxidation over storage, expiry labelling a regulator will accept.' },
        { name: 'Chemicals and packaging', text: 'Polymer strength loss under exposure, usable life of adhesives and sealants, UV additive depletion, storage limits for hot or humid markets.' },
        { name: 'Consumer goods', text: 'Emulsion stability over temperature cycling, active ingredient decay in skincare, expiry for over-the-counter products, packaging barrier performance.' },
        { name: 'Asset integrity', text: 'Corrosion allowance from inspection readings, insulation resistance decline, catalyst activity between changeouts, a trend turned into a dated intervention.' }
      ]
    },
    equivalence: {
      tech: 'Equivalence and non-inferiority testing by two one-sided tests (TOST)',
      scope: 'In this tool: results from two methods, labs, instruments or analysts, against a margin you set first.',
      groups: [
        { name: 'Method and technology transfer', text: 'Development lab against receiving QC site, instrument against instrument across plants, contract laboratory onboarding, method changes bridged without full revalidation.' },
        { name: 'Clinical and bioequivalence', text: 'Generic against reference formulation, biosimilar comparability after scale-up, bridging studies for a changed route, lot-to-lot equivalence of clinical supplies.' },
        { name: 'Supplier qualification', text: 'Second-vendor lots against the reference specification, alternative resins, reagents and excipients, dual sourcing justified to quality assurance.' },
        { name: 'Process and scale-up', text: 'Pilot against commercial vessels, alternative sterilization or cleaning methods, non-inferiority after a change control, a replacement machine against the one it replaced.' },
        { name: 'Beyond the laboratory', text: 'Any "is the new one close enough" question: a reformulated product in sensory panels, a scheduling rule against the incumbent, a cheaper component against the qualified part, a redesigned step against the validated one.' }
      ]
    },
    sequence: {
      tech: 'Genetic algorithms and multi-objective optimization (NSGA-II)',
      scope: 'In this tool: pointed at codon optimization, evolving synonymous codons while the protein stays identical.',
      groups: [
        { name: 'Sequence engineering', text: 'Host codon usage for CHO, HEK293 or E. coli, restriction sites and homopolymer runs removed, GC held in the synthesis window, the 5′ end kept unfolded.' },
        { name: 'Process and formulation design', text: 'Recipe and setpoint combinations too numerous to test, goals that genuinely conflict, the trade-off curve rather than one answer, hard constraints never violated.' },
        { name: 'Scheduling and logistics', text: 'Production schedules under changeover limits, vehicle routes against time windows, staff across shifts and skills, maintenance sequenced around service commitments.' },
        { name: 'Engineering and portfolios', text: 'Designs where weight, stiffness and cost compete, component choices under a budget, risk against return across projects, every defensible compromise surfaced.' },
        { name: 'Why multi-objective, not one score', note: true, text: 'Collapsing competing goals into one weighted number hides the trade-off and buries the argument in the weights. A Pareto front shows every option that cannot be improved on one goal without giving ground on another, which is the honest input to a decision somebody has to own.' }
      ]
    }
  };

  /* Tailored examples. Picking an industry and a function narrows the write-up from "what
     this technique is for" to "what it is for here", which is the difference between a
     reader nodding along and a reader recognising their own Tuesday.

     Both lists are deliberately short. The choice is held in memory for the session only:
     nothing is stored, so it resets on reload, like everything else here. */
  const INDUSTRIES = [
    ['pharma', 'Pharmaceutical and biotech'], ['device', 'Medical devices and diagnostics'],
    ['food', 'Food and beverage'], ['chem', 'Chemicals and materials'],
    ['auto', 'Automotive and industrial manufacturing'], ['semi', 'Electronics and semiconductors'],
    ['energy', 'Energy and utilities'], ['cpg', 'Consumer goods and retail'],
    ['logistics', 'Logistics and supply chain'], ['services', 'Financial and professional services']
  ];
  const FUNCTIONS = [
    ['ops', 'Manufacturing and operations'], ['quality', 'Quality and regulatory'],
    ['rnd', 'R&D and product development'], ['supply', 'Supply chain and procurement'],
    ['maint', 'Maintenance and reliability'], ['opex', 'Continuous improvement and OpEx'],
    ['commercial', 'Commercial and marketing'], ['finance', 'Finance and planning']
  ];

  const TAILORED = {
    analyze: {
      industries: {
        pharma: 'Batch yield and dissolution drivers, scale-up factor screening, deviation root cause mined from historical batch records.',
        device: 'Weld and seal strength drivers, moulding parameter screening, sterilisation cycle settings, test failures traced to process conditions.',
        food: 'Recipe and process effects on texture and taste, oven profile optimisation, line speed against defect rate, shelf stability drivers.',
        chem: 'Reaction yield and selectivity drivers, catalyst and solvent screening, polymer property prediction, distillation setpoints.',
        auto: 'Weld quality drivers, paint defects against booth conditions, machining tolerance factors, assembly torque settings.',
        semi: 'Wafer yield drivers, etch and deposition recipe screening, defect density by tool and chamber, bin failure prediction.',
        energy: 'Load forecasting from weather and usage, heat rate drivers, turbine output settings, outage risk from operating history.',
        cpg: 'Fill weight and seal drivers, changeover effects on waste, promotion response, complaints and returns prediction.',
        logistics: 'On-time delivery drivers, carrier and lane effects, damage rate by packaging, warehouse pick accuracy.',
        services: 'Loss and claim drivers, pricing and discount experiments, default prediction from account features, cycle-time factors.'
      },
      functions: {
        ops: 'Which settings actually move throughput, the experiment that would prove it, what to hold and what to change on Monday.',
        quality: 'Drivers behind out-of-spec results, batch records mined for patterns, the factor screen that closes a CAPA properly.',
        rnd: 'Many candidate factors screened cheaply, response surfaces around an optimum, designs that avoid confounding from the start.',
        supply: 'Supplier and lot effects on downstream results, lead-time drivers, which incoming attributes are worth testing at all.',
        maint: 'Operating conditions that precede failure, which sensors actually predict, intervals set from evidence rather than habit.',
        opex: 'The vital few separated from the trivial many, a designed experiment instead of one factor at a time, a baseline to prove improvement against.',
        commercial: 'Churn and conversion drivers, pricing and offer experiments, segments found without being told what to look for.',
        finance: 'Cost drivers across sites, forecast accuracy against history, scenarios tested on data rather than opinion.'
      }
    },
    stability: {
      industries: {
        pharma: 'API and drug product expiry, impurity growth to specification, poolability across primary batches, long-term against accelerated conditions.',
        device: 'Sterile barrier ageing, adhesive bond strength over time, battery capacity decline, packaging seal integrity across the claimed life.',
        food: 'Best-before dates from spoilage markers, vitamin loss in storage, oxidation in fats and oils, cold-chain sensitivity.',
        chem: 'Resin and adhesive pot life, additive depletion, viscosity drift in storage, tensile loss under environmental exposure.',
        auto: 'Elastomer and seal ageing, coating adhesion over exposure, fluid change intervals, warranty life projection.',
        semi: 'Reagent and wafer hold times, photoresist life, calibration drift between services, burn-in degradation curves.',
        energy: 'Insulation resistance decline, catalyst activity between changeouts, corrosion allowance consumption, additive stability in storage.',
        cpg: 'Emulsion stability over temperature cycling, fragrance fade, active decay in skincare, expiry for over-the-counter lines.',
        logistics: 'Quality decline in transit, the cost of temperature excursions over time, packaging performance across lanes and seasons.',
        services: 'Model performance decay, portfolio metric drift, contract value erosion, any projection that needs honest uncertainty attached.'
      },
      functions: {
        ops: 'When stored material stops being usable, hold-time limits between steps, re-test intervals taken from data.',
        quality: 'Expiry dates that survive a regulator, poolability evidence on file, extrapolation kept inside what the data supports.',
        rnd: 'Formulations ranked on degradation rate, accelerated against real-time agreement, early expiry estimates before the full study lands.',
        supply: 'Usable life of incoming material, ageing differences between supplier lots, stock rotation rules with a basis.',
        maint: 'Condition trends turned into a dated intervention, inspection intervals set by the measured degradation rate.',
        opex: 'Scrap caused by expiry, how much shelf life your assay precision is costing you, a re-test policy justified with numbers.',
        commercial: 'The shelf life you can actually claim on the label, returns risk from short dating.',
        finance: 'Write-off exposure from expiring stock, inventory policy set against real degradation rather than a rule of thumb.'
      }
    },
    equivalence: {
      industries: {
        pharma: 'Method transfer between sites, generic against reference, biosimilar comparability after scale-up, lot equivalence after a change.',
        device: 'Instrument against instrument, a new component supplier, an alternative sterilisation method, a line moved to another plant.',
        food: 'A reformulated recipe against the original, a second ingredient supplier, a new laboratory for nutritional panels.',
        chem: 'An alternative resin or reagent, a second production line, a replacement analyser, a process moved to another reactor.',
        auto: 'A replacement component against the qualified part, a second machining cell, an alternative test rig.',
        semi: 'Tool-to-tool and chamber matching, a new metrology set-up, a second fab making the same part.',
        energy: 'A rebuilt unit against the original, an alternative fuel blend, a replacement sensor set.',
        cpg: 'A reformulated product in sensory panels, a second co-packer, a new filling line.',
        logistics: 'A second carrier against the incumbent, alternative packaging, a new distribution centre.',
        services: 'A replacement model against the incumbent, an alternative data vendor, a changed process against its baseline.'
      },
      functions: {
        ops: 'A second line, machine or shift shown to match the one already qualified.',
        quality: 'Transfer and comparability evidence, with the margin fixed before the data is seen.',
        rnd: 'Whether the new method genuinely agrees, or the study simply lacked the power to tell.',
        supply: 'Second-source qualification, incoming lot comparability, dual sourcing justified to quality assurance.',
        maint: 'A rebuilt or replacement asset proven equivalent before it goes back into service.',
        opex: 'Proving a change did no harm, which is harder than proving it helped and far more often skipped.',
        commercial: 'A reformulated or re-sourced product shown to be the same to the customer.',
        finance: 'A cheaper alternative shown to be no worse, before the saving is booked.'
      }
    },
    sequence: {
      industries: {
        pharma: 'Codon optimisation for expression hosts, construct screening before synthesis, formulation search across competing targets.',
        device: 'Design parameters balancing weight, stiffness and cost, test campaigns sequenced around limited rigs.',
        food: 'Recipe search across cost, nutrition and taste, line schedules under allergen changeovers.',
        chem: 'Formulation search under competing property targets, reactor campaign sequencing, blend optimisation under constraints.',
        auto: 'Component selection under budget and weight, line balancing, maintenance sequenced around takt time.',
        semi: 'Recipe search across competing yield and throughput targets, tool and chamber scheduling under constraints, test sequencing on limited metrology.',
        energy: 'Dispatch and outage scheduling, asset mix under cost and emissions together, maintenance sequencing.',
        cpg: 'Assortment and pack-size search, promotion plans under a budget, line schedules across many SKUs.',
        logistics: 'Vehicle routing under time windows, load building, warehouse slotting, shift rostering.',
        services: 'Portfolio selection under risk and return, project prioritisation under a fixed budget, staff and case assignment under skill constraints.'
      },
      functions: {
        ops: 'Schedules and setpoints where the options outnumber anything you could ever test.',
        quality: 'Settings that satisfy several specifications at once, rather than one at a time in sequence.',
        rnd: 'Design search across competing targets, returning the trade-off curve instead of a single answer.',
        supply: 'Sourcing and routing optimised on cost, lead time and risk together.',
        maint: 'Work sequenced to minimise downtime without breaching service commitments.',
        opex: 'Where the trade-off genuinely sits, instead of an argument about what the weights should be.',
        commercial: 'Assortment, pricing and promotion plans built under a budget constraint.',
        finance: 'Project portfolios balanced across risk, return and the resource you actually have.'
      }
    }
  };

  root.MLApplications = APPLICATIONS;
  root.MLApplications.INDUSTRIES = INDUSTRIES;
  root.MLApplications.FUNCTIONS = FUNCTIONS;
  root.MLApplications.TAILORED = TAILORED;

  if (typeof module !== 'undefined' && module.exports) module.exports = APPLICATIONS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
