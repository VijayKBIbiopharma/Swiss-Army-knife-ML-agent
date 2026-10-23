# Swiss Army Knife ML Agent

One private, in-browser tool for regression, classification, clustering, design of experiments (DOE), shelf-life estimation, method-transfer equivalence and sequence optimization, with a built-in academy that teaches every method.

One tool is on screen at a time, and the selector at the top names the **technique**, not one industry's use of it: **Machine learning & design of experiments**, **Linear regression & confidence limits (ICH Q1E)**, **Equivalence & non-inferiority testing (TOST)**, **Genetic algorithms & multi-objective optimization**, and **Privacy & data handling**. Each is linkable directly (`#stability`, `#equivalence`, `#sequence`).

Under the selector, a **Where this is used** panel names what the chosen technique is used for across industries and functions &mdash; four or five short areas, each a comma-separated list. Pick **my industry** and **my function** and it adds two lines written for that combination: 10 industries &times; 8 functions &times; 4 techniques, so a quality manager in food gets food and quality examples rather than the author's. The choice follows you between techniques and is held in memory only, so it resets on reload like everything else. The panel opens by default on a desktop, stays folded on a phone, and states plainly that it describes the technique in general, not what this page can read, so nobody leaves a demo thinking the tool does computer vision. Inside each tool, panels open only when they earn their place: the practice datasets while nothing is loaded, the settings once there is something to set them for, the DOE builder when the agent has filled it in.

Drop in a CSV and it:

1. **Profiles the data.** It finds numbers, categories, IDs, missing values and correlated inputs.
   - **Joins two files on a key.** Load a process log, then a QC report, and it suggests the shared key (BatchID = Batch ID, matched ignoring case and spaces), averages replicate rows (lanes, injections), drops replicate counters, and lists IDs found in only one file before you join. Inner or left join, with undo.
   - **Recognizes column roles.** Analytical results (Purity, Main peak, Titer, Potency, HMW / aggregates, LMW / fragments, impurities), analytical measurements (Retention time, Molecular weight, kDa), record info (Analyst, Lane) and dates are tagged in the profile. The most important result becomes the target, and the other results are set aside as inputs by default so they cannot leak the answer.
2. **Decides the problem type.** A numeric target means regression, a category means classification, and no target means unsupervised (clustering, PCA, outliers). Data that looks like a designed experiment also gets a full DOE effects analysis.
3. **Runs every suitable model with cross-validation** and keeps the simplest one within 0.01 of the top score:
   - Regression: linear, ridge, lasso, quadratic (response surface), k-nearest neighbours, decision tree, random forest, gradient boosting, neural network.
   - Classification: logistic regression, naive Bayes, k-nearest neighbours, decision tree, random forest, gradient boosting (binary), neural network.
   - Neural network (MLP): inputs → 32 → 16 ReLU units → linear or softmax output, trained with Adam and early stopping on 15% held-back rows. Written in plain JavaScript (no TensorFlow.js), so the privacy lock and offline use are unchanged. The learning curve is drawn live while it trains, and a results card explains how it learned. Skipped below 40 rows.
   - Unsupervised: k-means with silhouette-based choice of k, PCA, outlier scoring.
   - DOE: effects, t and p values (or Lenth's method for saturated designs), aliasing, curvature from center points, main-effect and interaction plots, and the best settings.
4. **Explains the result** in plain language:
   - an **action plan**, such as "Raise Pressure toward 98", "Keep MeltTemp near 217 (sweet spot)" or "Use Resin C, not Resin B", ranked by impact with a confidence level;
   - for categories, a **Target outcome** and **Starting from** selector that re-aims the plan instantly (no re-training), answering questions like "what moves a Bronze customer to Silver or better?" or "how do we keep Gold customers at Gold?". Ranked labels (Bronze < Silver < Gold < Platinum, Low < Medium < High) are treated as "that tier or better";
   - a **what-if mixing desk** right below the plan: one knob per top driver (sliders, or buttons for categories), a live animated prediction with the change versus typical settings, a response curve under each knob that updates with the other knobs, "Apply the action plan" and "Reset" buttons, a warning outside the usual data range, an in-spec badge in Six Sigma mode, and pinned scenarios that carry into the PDF;
   - "how each driver moves the result" curves and a **peek inside the model** (a readable decision tree trained on your data, real trees from the forest or boosting chain, or the recipe of a linear model);
   - a "How to read this" note with an analogy on every chart, linked to the matching lesson;
   - warnings about small samples, gaps, imbalance and overfitting.
5. **Optimizes several results together** (optional, step 2). Pick each result's goal (maximize, minimize or hit a target), its acceptable range and an importance weight. The agent models every result, scores each 0 to 1 (Derringer-Suich desirability), and searches the usual operating range for the best compromise (the highest weighted geometric mean, so no single result is allowed to fail). The results show typical versus best-compromise settings, and the what-if desk shows every result and the overall score live.
6. **Six Sigma & process control mode** (a switch in step 2, off by default). Enter optional spec limits (LSL, USL, target) and get Cp, Cpk, Pp, Ppk, Cpm, Z.bench, expected PPM and sigma level, a histogram against the spec, an I-MR control chart with special-cause signals, box plots by factor, Taguchi signal-to-noise by factor level, and a quality-loss index. Pass/fail targets get defect rate, DPMO and sigma level. Designed experiments are flagged, because their spread is deliberate.
7. **Writes next steps mapped to DMAIC** and pre-fills a **DOE builder** with the drivers it found: full or fractional factorial, Plackett-Burman, central composite or Box-Behnken. It produces a randomized run sheet. Fill in the results, load the sheet back, and the agent analyzes it.

8. **Optimizes DNA sequences by genetic algorithm** (the "Sequence optimizer" tool). Paste a coding sequence and it evolves synonymous codons &mdash; the same protein, spelled differently &mdash; against four goals at once: raise the **Codon Adaptation Index** for CHO, HEK293 or E. coli; hold **GC content** inside a window, overall and in every 50-base stretch; keep the **5' end unfolded** so the ribosome can load; and **remove restriction sites** and long single-base runs, on both strands. It uses NSGA-II (non-dominated sorting, crowding distance, constrained domination), runs in a **Web Worker** so the page stays at full frame rate, and shows the convergence curves, the population diversity and a clickable **trade-off (Pareto) plot** live. The protein is re-translated and checked at the end. Results download as FASTA or a before-and-after CSV.
9. **Estimates shelf life to ICH Q1E** (the "Shelf life" tool). Paste a stability study &mdash; batch, month, result, optionally a storage condition &mdash; set the specification limits, and it fits the degradation trend, runs Q1E's two poolability F tests (equal slopes, then equal intercepts, both at the 0.25 level), and reads the shelf life off the point where the 95% one-sided confidence limit meets the specification. It reports which model the tests chose and why, what each batch would give on its own, and applies Q1E's extrapolation cap (at most twice the data in hand, and never more than 12 months beyond it). Downloads as a Q1E report CSV, and joins the audit package when one is exported.
10. **Tests method-transfer equivalence by TOST** (the "Method transfer" tool). Load results from two labs, instruments or analysts &mdash; either as one file with a method column, or as **a separate file from each lab**, which is how they usually arrive. The two files need not share column names or row order: pick the result column in each, and if both carry a sample identifier the same samples are matched as pairs across the files. Declare the margin you are willing to accept, and it runs both one-sided tests and reports the confidence interval against that margin. Paired (same samples measured twice) or unpaired, Welch or pooled. It gives **three** answers, not two: equivalent, a real difference, or **inconclusive** &mdash; the case people routinely misreport as "no significant difference, therefore the same" &mdash; and for an inconclusive result it says how many results per method would settle it. Downloads as a CSV, and joins the audit package when one is exported.
11. **Teaches the concepts.** `learn.html` (ML Agent Academy) has 30 interactive lessons, each with an analogy, a hands-on visual and a quick check. Examples: grow a decision tree and watch it carve up the data, send a batch through five trees of a random forest and see them vote, step through k-means, drag the boosting rounds, see design shapes (factorial cube, central composite, Box-Behnken), and turn noise up on a Pareto chart.

Ways to share results, all built in the browser:
- **Save as PDF**: an A4 report (action plan, what-if scenarios, every chart with its "how to read this" note, the DOE run sheet, the models in plain words, a glossary, and an audit trail).
- **Download Excel (.xlsx)**: every number behind the report, one sheet per topic (summary, audit trail, columns and roles, models, drivers, action plan, capability, control chart, desirability, DOE effects, what-if scenarios, DOE run sheet, data analyzed). Numbers stay numbers.
- **Download audit package (.zip)**: the PDF, the workbook, `audit-trail.txt`, the DOE run sheet, a README and `SHA256SUMS.txt`. The audit trail records the tool version, time, each input file's SHA-256 fingerprint, size and shape, the join (keys, unmatched IDs, averaged replicates), the target, settings and spec limits, every column set aside and why, the leakage check, the validation scheme, the models and the selection rule, the seed, the agent's log, the data-handling statement, and signature lines. It is decision support, not a validated GxP system.
- **Print** (clean, light-themed) and **Download as web page** (.html).

**Live:** https://vjpowerhouse.github.io/Swiss-Army-knife-ML-agent/ · **Academy:** https://vjpowerhouse.github.io/Swiss-Army-knife-ML-agent/learn.html

(Served by GitHub Pages from the `main` branch root. To turn it on: Settings → Pages → Deploy from a branch → `main` / root.)

## Privacy guarantees

| Guarantee | How it is enforced |
|---|---|
| Data is never uploaded | Files are read with the browser's `FileReader`. All math is local JavaScript in this repository. |
| Nothing can be sent out, even by mistake | The page's Content-Security-Policy sets `connect-src 'none'`, `img-src data: blob:`, `form-action 'none'` and `default-src 'none'`, so the browser itself refuses outgoing requests. |
| The background thread is no exception | The sequence optimizer runs in a Web Worker. `worker-src 'self'` allows only this site's own `ga-worker.js`, and a worker inherits the page's policy, so it can reach no further than the page can. A test checks that the worker loads nothing but local files. |
| Nothing is stored | No cookies, local storage, IndexedDB or service worker. Closing the tab erases everything. |
| Deleted when you are done | **Finish and delete my data** wipes the data and every result from the page. It is also wiped after 30 idle minutes (on by default) and when you leave the page, so the back button cannot bring it back. |
| No LLM or AI service | The agent is classical statistics and ML plus written rules. There are no API keys or prompts. |
| No third parties | No CDN, analytics, ads or web fonts. Every file is served from this repository. |
| Stays true over time | `tests/run-tests.js` includes a privacy lint that fails CI if network, storage or tracking code is ever added. |

**Verify it yourself:** open DevTools → Network and run the agent, or press **Run privacy self-test** on the page. It deliberately tries to reach an outside server and shows that the browser blocks it.

**Fine print:** GitHub Pages, like any web host, logs that the page was opened. It never receives your data. Browser extensions can read any page you open, so use a clean browser profile for sensitive data. For the strictest setup, download this repository (or the intranet zip) and open `index.html` from disk with Wi-Fi off. It works fully offline.

## Demo and intranet rollout

- `DEMO.md`: a 12-minute executive demo script using the public datasets in `demo-data/`, with expected results and answers to common questions.
- `DEPLOY.md`: hosting on IIS, Apache, nginx or a shared drive, the security summary for IT, integrity checks and a smoke test.
- `package.sh` builds `dist/ml-agent-intranet-<version>.zip` (runtime files, demo data, docs, `SHA256SUMS.txt`). CI builds the same zip on every push: open the "ML Agent tests" run in the Actions tab and download the `ml-agent-intranet` artifact.

## Run locally

```sh
python3 -m http.server 8000   # from the repo root, then open http://localhost:8000/
node --test tests/run-tests.js
```

## Files

| File | Role |
|---|---|
| `engine.js` | CSV parsing, profiling, encoding, models, cross-validation, k-means, PCA |
| `doe.js` | DOE detection, analysis and design generation |
| `spc.js` | Six Sigma statistics: capability, I-MR, box plots, Taguchi S/N, DPMO |
| `merge.js` | Joining two files on a key, with replicate averaging |
| `audit.js` | SHA-256, zip and Excel writers, audit trail and results workbook |
| `applications.js` | Where each technique is used across industries (content for the selector panel) |
| `stability.js` | ICH Q1E: regression, poolability F tests, confidence limits, shelf life |
| `tost.js` | Equivalence testing: two one-sided tests, paired and unpaired |
| `tost-ui.js` | Method-transfer panel: interval-against-margin chart, result strip, report |
| `stab.js` | Shelf-life panel: input, poolability tables, trend chart, Q1E report |
| `codon.js` | Genetic code, host codon-usage tables, CAI, GC windows, 5' folding, restriction sites |
| `ga.js` | NSGA-II genetic algorithm for codon optimization |
| `ga-worker.js` | Runs the GA off the main thread |
| `seq.js` | Sequence optimizer panel: input, live charts, Pareto plot, FASTA and CSV export |
| `agent.js` | Orchestration, column roles, model choice, desirability, findings and DMAIC next steps |
| `charts.js` | Dependency-free SVG charts |
| `app.js` | Page logic, report, delete and privacy self-test |
| `pdf.js` | Dependency-free PDF writer for "Save as PDF" |
| `explain.js` | Plain-English explanations and analogies shared by results, report and lessons |
| `learn.html`, `learn.js` | ML Agent Academy: interactive lessons |
| `samples.js` | Synthetic practice datasets |

Limits: up to 3,000 rows are used for modeling (a random sample above that), classification supports up to 20 classes, and gradient boosting for classification is binary only.
