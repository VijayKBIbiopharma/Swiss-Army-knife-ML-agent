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

  root.MLApplications = APPLICATIONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = APPLICATIONS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
