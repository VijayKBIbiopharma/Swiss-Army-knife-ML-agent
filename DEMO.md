# Executive demo script (about 12 minutes)

Every step below was run end to end. The times are from a laptop browser; your numbers should match closely because the agent uses fixed random seeds.

## 0. Before you start (2 minutes, not in front of the audience)
- Open the agent and the Academy (`learn.html`) in two tabs.
- Have `demo-data/` open in a file window, ready to drag.
- Optional: switch Wi-Fi off. Everything below still works, which is the strongest privacy proof you can give.

## 1. Privacy first (1 minute)
- Point to the green badge: "Private: data never leaves this browser".
- Scroll to **How your data stays private** and press **Run privacy self-test**. The page tries to contact an outside server and the browser blocks it.
- Key line: *"There is no server, no database and no AI service. The math runs on this laptop, and the browser itself is told to block any outgoing connection."*

## 2. From data to an action plan: concrete strength (3 minutes)
- Drag `concrete-strength.csv` in. Target: `strength`. Goal: **Higher strength is better**. Run.
- Expect about 5 seconds, **Gradient boosting** chosen, about **90% of variation explained**.
- Read the **Action plan** aloud: raise cement, lower water, raise slag, and a sweet spot for age.
- Talking point: *"The agent doesn't know concrete. It found that more cement and less water make stronger concrete, which any civil engineer would confirm. It also flags `age` as a lever, but age is test age, not something you set. That is why the subject-matter expert stays in the loop."*
- Open **Peek inside the model** to show the readable decision tree.
- Scroll to the **What-if mixing desk** just below the action plan. Drag **cement** up and **water** down: the strength readout climbs live. Press **Apply the action plan**, then **Pin this scenario**, then **Reset to typical** and pin again, to show a side-by-side comparison.
- Talking point: *"This is a lightweight digital twin: try settings here before touching the real process. The yellow warning tells you when you've moved outside what the data has seen."*

## 3. Designed experiments: built-in 2⁴ factorial (2 minutes)
- Click the practice dataset **2⁴ factorial DOE + center points**, run.
- Show the **Pareto of effects**: Temperature, Catalyst and their interaction are significant.
- Show the **interaction plot** and the **best settings**.
- Scroll to the **DOE builder**: the next experiment is already drafted. Download the run sheet.
- Talking point: *"Historical data tells us where to look; a DOE proves cause and effect. The tool does both and hands over the run sheet."*

## 3c. Deep learning, honestly (1 minute)
- While any run is going, point at the **live learning curve** in the progress panel: that is the neural network training in the browser.
- In the results, open **Neural network: how it learned**. On small tables it often ranks below boosting, and the card says so. On the large diamonds file it wins.
- In the Academy, open **Neural networks: watch one learn**, choose **Checkerboard (XOR)** and press **Train**.
- Talking point: *"Deep learning is in the toolbox, but it has to earn its place on the leaderboard like every other model."*

## 4. Honesty: wine quality (1 minute, optional; takes about 15 to 20 seconds)
- Drag `wine-quality-white.csv`, target `quality`, run.
- Expect **Random forest**, about **45% explained**, flagged as **weak**.
- Talking point: *"It tells us when the data isn't good enough. Taste depends on things not in this file. A tool that always sounds confident is dangerous; this one isn't."*

## 3b. Six Sigma mode (2 minutes, for manufacturing audiences)
- Load **Injection molding yield**, choose **⚙ Six Sigma & process control**, enter LSL 88, USL 100, target 95, run.
- Expect **Cpk 0.29, not capable**. The agent explains that centering alone only reaches 0.49 and the spread must fall from about 4.1 to 1.5.
- Show the I-MR chart (one signal), box plots by Material (Resin C is tightest), and the Taguchi table.
- Talking point: *"Same data, two lenses: machine learning finds the levers, and classical capability tells us how far we are from the customer's spec."*

## 3d. Two files, several results: bioreactor + QC (3 minutes, for biopharma / QC audiences)
- Click the practice dataset **Bioreactor log + densitometer QC**. It loads the process log and stages the QC report. (The same two files are in `demo-data/`: load `bioreactor-process-log.csv`, then add `densitometer-qc-report.csv` under **Add a second file**.)
- The join panel suggests **BatchID = Batch ID**: 60 IDs match, 4 batches have no QC result, 2 QC results have no batch, and the two lanes per batch are averaged. Press **Join the files**.
- Show the **Role** column: Purity is the target; Titer, HMW, LMW and MainBand_kDa are recognized as other results and switched off as inputs; Analyst is record info.
- Turn on **⚙ Six Sigma & process control**, enter LSL 95, target 97 (no USL: purity is one-sided). Open **Optimize several results together**: Purity, Titer, HMW and LMW are pre-filled with sensible goals. Run.
- Expect about 98% of purity variation explained, Cpk around 0.2 against LSL 95, and a **best compromise** that lifts overall desirability from about 0.5 to about 0.9: higher temperature and dissolved oxygen, more feed, lower agitation, earlier harvest.
- Press **Load the compromise into the what-if desk** and move Temp_C: purity, titer and aggregates move together, and the overall score shows the trade-off.
- Press **Download audit package (.zip)**. Open `audit-trail.txt`: both files' SHA-256 fingerprints, the join, every excluded column and why, the models and the seed.
- Talking point: *"Purity, yield and aggregates fight each other. This finds the settings where none of them fails, and hands QA a package they can retrace."*

## 4b. Moving customers up a tier (1 minute)
- Click the practice dataset **Customer loyalty tiers**, run.
- Above the action plan, set **Starting from: Rows now Bronze** and **Target outcome: Silver or better**. The plan re-aims instantly: raise spend, visits and tenure, cut support tickets, get them on the app.
- Switch to **Rows now Gold → Gold or better** to show the retention question.
- Talking point: *"Same model, different business question, one click. Region doesn't appear at all, because it truly doesn't matter in this data."*

## 4c. Codon optimization by evolution (3 minutes, for biologics and gene-therapy audiences)
- Pick **Sequence optimizer** from the selector at the top and press **Load an example gene** (a 238-codon sequence written with poor codons for a mammalian host, carrying an EcoRI site, a BsaI site and a GC-rich run).
- The line under the box reads the sequence straight away: *238 codons, 237 amino acids, CAI 0.600, GC 43.8%, 4 sites to remove.*
- Leave the host on **CHO**, the GC window at **45&ndash;55%**, and press **Optimize the sequence**. Scroll the page while it runs: it stays perfectly smooth, because the algorithm is on a background thread.
- Watch the two live charts: the best and average score climbing, and population diversity falling as the population converges.
- Expect **CAI 0.60 &rarr; about 0.92**, **GC 43.8% &rarr; about 51%**, **4 sites &rarr; 0**, and a green line confirming the protein is unchanged, every one of the 237 amino acids.
- Click a point on the **trade-off plot** to see what a higher CAI would cost in GC or folding, then download the **FASTA** and the before-and-after **CSV**.
- Talking point: *"Same protein, better spelling for this host. Nothing left the laptop, and the before-and-after is on one page a reviewer can sign."*
- Honest caveat to say out loud: *"The codon tables shipped here are reference values, and the folding number is a base-pairing score, not a kcal/mol free energy. Confirm the table for your host and have the sequence reviewed before synthesis."*

## 4d. Shelf life in one minute (for QA, stability and regulatory audiences)
- Pick **Shelf life &mdash; ICH Q1E stability study** from the selector at the top, then press **Load an example study** (3 batches, 0 to 24 months, two storage conditions). It picks the long-term condition automatically.
- Enter a lower specification limit of **95**, press **Estimate the shelf life**.
- Expect **about 27 months**, **fully pooled** (slopes p 0.33, intercepts p 0.83, both above the 0.25 level Q1E sets), limiting batch: the pooled line.
- Point at the chart: *"The solid line is the trend. The dashed line is the 95% confidence limit. Q1E says the date comes from the dashed line, not the solid one."*
- Press **Example: batches that differ** and run it again: now the batches fail the slope test, nothing is pooled, and the fastest-degrading batch drags the answer down to about **12 months**.
- Talking point: *"Same tool, same two minutes, and it shows its working: which test, which p-value, which batch decided."*
- Honest caveat: *"This is decision support. A shelf life in a submission needs validated software and an independent check of the arithmetic."*

## 5. Finding groups with no target: penguins (1 minute)
- Drag `penguins.csv`, choose **Nothing: find groups and patterns**, run.
- Show the groups chart and profiles: one group is entirely Gentoo penguins on Biscoe island. The agent found the species without being told.

## 6. Teaching (2 minutes)
- Switch to the Academy tab, lesson **Random forest**. Click the map and flip through the five trees to show them voting.
- For a biologics audience, use **Codon optimization** instead: press Play and watch the codon track turn from red to green, generation by generation, while the protein stays identical.
- Talking point: *"Anyone in the team can learn what the model is doing, with analogies, in their own time."*

## 7. Close (1 minute)
- Press **Save as PDF** to show the shareable report (about 2 seconds), then open it.
- Back in the agent, press **Finish and delete my data**. Everything is gone.
- Ask: *"Where would we use this first?"* Have one internal use case ready, such as yield drivers on one line or a DOE for one stubborn defect.

## Questions executives usually ask

| Question | Answer |
|---|---|
| Where does our data go? | Nowhere. It stays in the browser tab and is wiped on delete, after 30 idle minutes, or when the tab closes. The page is technically blocked from sending anything. |
| Does it use ChatGPT or another AI service? | No. It uses classical statistics and machine learning that run on the laptop. No data is shared with any AI vendor. |
| What does IT need to host it? | A folder of static files on any internal web server. No database, no backend, no internet access. See `DEPLOY.md`. |
| Is it validated for GxP decisions? | No. It is a decision-support and learning tool. Use it to find hypotheses and design experiments, and use your validated systems for release decisions. |
| How big a file can it take? | Up to 50 MB. It models up to 3,000 rows (a random sample above that), so even large files finish in under about 20 seconds. |
| Who maintains it? | The code is small, dependency-free and covered by automated tests, including a test that fails if anyone adds code that could send data out. |
