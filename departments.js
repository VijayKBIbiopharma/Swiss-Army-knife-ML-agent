/* Department workbenches: the same nine tools, entered from the job rather than the method.

   The tool selector names techniques - tolerance intervals, TOST, PCA - which is right for
   someone who already knows which one they want and wrong for everybody else. A process
   engineer does not come looking for "variance components". They come because purity moves
   between resin lots and nobody can say whether it is the resin or the assay.

   So each department here lists JOBS, and each job says four things: which tool it opens,
   what data to bring, what comes back, and - the part most of this file exists for - what
   the tool will not do for that job.

   That last field is not hedging. Two of these departments want documents written, and this
   page cannot write a document: there is no language model here, by deliberate choice. A
   regulatory writer who is told "this drafts your technical development report" will find
   out otherwise at the worst possible moment, and will be right never to trust the rest of
   it again. So the regulatory and business-development benches say plainly that the prose
   is not theirs to get here, and then do the thing that is actually valuable - name which
   tool produces which section's numbers, and which export carries the audit trail that a
   reviewer will ask for.

   Content only; no computation, no network, no storage. `tool` values must match the tool
   selector, and `sample` values a practice dataset, which the tests check, because a
   workbench that routes somewhere that no longer exists is worse than no workbench. */
(function (root) {
  'use strict';

  const DEPARTMENTS = [
    {
      id: 'upstream',
      name: 'Upstream bioprocessing',
      fn: 'uspd',
      blurb: 'Constructs, clones, feeds and bioreactor runs: what to build, what to run, and what the run is telling you.',
      jobs: [
        {
          title: 'Pick the vector for a programme that has not started yet',
          tool: 'plasmid',
          data: 'Three files, Excel, CSV or JSON: the runs you have already screened (with the protein each was for), the factors and levels you can actually order, and the incoming programme\u2019s protein attributes. Twelve complete runs is the minimum.',
          out: 'A balanced run sheet per programme: which vector to build, its predicted titer with a calibrated interval, and which rows reach past your evidence. Two recommendations where they differ \u2014 the best central estimate and the best worst case.',
          not: 'It does not design the plasmid, pick restriction sites, or predict folding. And if every historical run is the same molecule, it will not pretend to know how a different one behaves \u2014 it says the history cannot answer that, rather than returning a confident number with a narrow band.'
        },
        {
          title: 'Forecast a screening programme before the reagents are ordered',
          tool: 'plasmid',
          data: 'The run sheet you intend to execute - only the columns you are varying. Anything else is held at the settings on the desk and reported as held.',
          out: 'Every row predicted with its own interval and standing, the rows that reach past your historical range flagged, and a verdict on whether the sheet can rank its own candidates at all.',
          not: 'It cannot tell you the sheet will work. If the spread you are chasing is smaller than the uncertainty you carry, it says so - which is the point, but it is a warning, not a design service.'
        },
        {
          title: 'Find what actually moves titer or purity in the bioreactor',
          tool: 'analyze',
          sample: 'bioqc',
          data: 'A run log - one row per batch, with the parameters you set and the result you got. A separate QC file joins on batch ID.',
          out: 'The drivers ranked with whiskers, a blank control showing which inputs carry no evidence at all, a what-if desk with calibrated bands, and a designed experiment to settle what history has confounded.',
          not: 'Observational run logs cannot separate parameters that always moved together. The tool names the confounding rather than resolving it, and the experiment it designs is how you resolve it.'
        },
        {
          title: 'Catch a running batch drifting from the ones that worked',
          tool: 'golden',
          data: 'Time-series sensor readings across a campaign - batch, hours in, and several sensors - with the runs you were happy with nominated.',
          out: 'Every batch scored against the path the good ones took, the hour a drift began, and the sensor furthest out of step.',
          not: 'It will not tell you why. It gives the hour and the sensor so an investigation starts somewhere narrower than the whole batch record.'
        }
      ],
      cannot: 'Nothing here reads images, chromatograms as traces, or free text. Titer prediction is decision support for screening, not a release calculation.'
    },
    {
      id: 'regwriting',
      name: 'Regulatory & technical writing',
      fn: 'qa',
      blurb: 'Protocols, technical development reports and filing sections: the numbers, the assumptions behind them, and the audit trail a reviewer will ask for.',
      honesty: 'This page will not write your document. There is no language model here - that is a deliberate design choice, and it is why your data never leaves the browser. What it does is produce the defensible numbers a section needs, state the assumptions in the open, and export an audit trail that shows how each figure was reached. The prose is yours.',
      jobs: [
        {
          title: 'The shelf-life section of a stability report',
          tool: 'stability',
          data: 'The stability study: batch, time point, result, and the storage condition if you have more than one, plus your specification limits.',
          out: 'Shelf life read off the 95% one-sided confidence limit, both ICH Q1E poolability F tests at the 0.25 level with their outcomes stated, what each batch would give alone, the extrapolation cap applied, and a Q1E report CSV.',
          not: 'It does not write the narrative, format to your template, or cite the guideline text. It gives you the figure, the model the tests chose, and why.'
        },
        {
          title: 'The method-transfer or comparability section',
          tool: 'equivalence',
          data: 'Results from both labs, instruments or analysts - one file with a method column, or a separate file from each - and the margin you are prepared to accept, set before you look.',
          out: 'Both one-sided tests, the confidence interval against your margin, and three possible answers rather than two: equivalent, different, or inconclusive. For an inconclusive result, how many results per method would settle it.',
          not: 'It will not let you report "no significant difference, therefore the same". That conflation is the single most common error in transfer reports, and the tool refuses to make it for you.'
        },
        {
          title: 'Justifying a specification you have to defend',
          tool: 'limits',
          data: 'The results you hold for the attribute, and the limits you are proposing or already committed to.',
          out: 'A tolerance interval - the honest version of "mean plus three standard deviations" - a verdict on whether this data supports those limits, and if not, whether more results would fix it or no sample size ever could. Normality is tested, not assumed.',
          not: 'It cannot make an indefensible limit defensible. The most useful answer it gives is that no study size will support the limit you were hoping for, which saves the most time of anything here.'
        },
        {
          title: 'The audit trail that has to travel with the numbers',
          tool: 'analyze',
          data: 'Whatever you analysed. The package is built from the run you just did.',
          out: 'A zip with the PDF, the workbook, every input file’s SHA-256 fingerprint, the join, the target, the settings, every column set aside and why, the leakage check, the validation scheme, the models, the selection rule, the seed, and signature lines.',
          not: 'It is decision support, not a validated GxP system, and the audit trail says so on its face. Do not represent it as qualified software.'
        }
      ],
      cannot: 'No drafting, no templating, no guidance citation, no document assembly. Every number it gives you still needs a human to put it in context and sign it.'
    },
    {
      id: 'qa',
      name: 'Quality assurance & deviation management',
      fn: 'qa',
      blurb: 'Deviations, investigations and change control: narrowing where to look, and telling a real signal from the noise of the measurement.',
      jobs: [
        {
          title: 'Narrow a deviation to an hour and a sensor',
          tool: 'golden',
          data: 'The campaign’s time-series readings with the acceptable runs nominated, including the batch under investigation.',
          out: 'The hour the batch left the envelope, the sensor furthest out, and whether that same pattern ever appeared in a run you accepted - which is the question that separates a real excursion from normal variation.',
          not: 'It does not assign root cause or decide disposition. It replaces "review the whole batch record" with "start at hour 14, look at the dissolved oxygen probe".'
        },
        {
          title: 'Settle whether the spread is the process or the assay',
          tool: 'variance',
          data: 'Repeated measurements labelled by the source you suspect - lot, analyst, instrument, vessel, shift - or a crossed samples-by-operators study for a full Gage R&R.',
          out: 'The total spread split into real between-group differences and repeat-measurement scatter, which pairs genuinely differ by Tukey’s method, and how much of what you see is the measurement system.',
          not: 'A negative variance estimate is reported as zero and said out loud rather than hidden. If a third of what you observe is the assay, then a third of every capability number you have ever quoted is about the assay.'
        },
        {
          title: 'Show whether a change actually changed anything',
          tool: 'equivalence',
          data: 'Results from before and after the change, and the margin you consider practically irrelevant, declared first.',
          out: 'An equivalence verdict against that margin, with "inconclusive" available as an answer.',
          not: 'It cannot retrospectively justify a margin chosen after seeing the data. Declare it first or the result means nothing, and nothing in the tool can police that for you.'
        },
        {
          title: 'Find what separates the batches that failed',
          tool: 'analyze',
          sample: 'batches',
          data: 'One row per batch with the parameters and the pass or fail outcome.',
          out: 'The drivers of failure with a blank control, the confusion matrix on batches the model never saw, and a what-if desk for the settings in question.',
          not: 'Correlation in a batch record is not cause. The tool reports what distinguishes the failures and designs the experiment that would establish cause.'
        }
      ],
      cannot: 'It does not make disposition decisions, write the investigation, assess GMP impact, or replace an investigator. It narrows where a human should look.'
    },
    {
      id: 'bd',
      name: 'Business development',
      fn: '',
      blurb: 'Capability claims and client conversations: what your process can actually hold, stated so it survives a technical audience.',
      honesty: 'This page will not build your deck. It has no language model and no slide export - what it has is the figures and the exports a technical buyer will push on, and the honesty to show you where a claim does not hold up before a client finds it.',
      jobs: [
        {
          title: 'A capability claim you can defend in a technical audit',
          tool: 'limits',
          data: 'Your historical results for the attribute, and the limits or capability you are thinking of claiming.',
          out: 'Whether the data supports the claim, the tolerance interval behind it, and the sample size that would be needed if it does not. Normality tested rather than assumed, because a capability claim is a claim about the tails.',
          not: 'It will tell you a number you wanted to put on a slide is not supported. That is the feature. Taking it to a client anyway is a decision you make with your eyes open.'
        },
        {
          title: 'Show a prospect the analysis rather than the conclusion',
          tool: 'analyze',
          sample: 'capture',
          data: 'A dataset you are permitted to show, or one of the practice sets for a live demonstration.',
          out: 'A PDF report leading with a plain-English finding, every chart with a how-to-read-it note, the models in plain words, and an audit trail. It runs with the network off, which is itself the answer to the first question a client’s IT team will ask.',
          not: 'No slides, no proposal text, no formatting to your brand. Export the PDF or the workbook and build the deck yourself.'
        },
        {
          title: 'Answer "where is our data going?" in one screen',
          tool: 'privacy',
          data: 'None. That is the point.',
          out: 'The data-handling statement and a self-test the client can watch run: no network calls, no storage, everything computed in the browser tab, gone on reload.',
          not: 'It is a statement about this page, not about your company’s systems. Do not let it stand in for your own IT attestation.'
        }
      ],
      cannot: 'No deck building, no proposal writing, no competitor benchmarking, no pricing. It makes claims checkable, which is a different job from making them persuasive.'
    }
  ];

  root.MLDepartments = DEPARTMENTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = DEPARTMENTS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
