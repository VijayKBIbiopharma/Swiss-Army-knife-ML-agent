# Executive demo script (about 12 minutes)

Every step below was run end to end. The times are from a laptop browser; your numbers should match closely because the agent uses fixed random seeds.

## 0. Before you start (2 minutes, not in front of the audience)
- Open the agent and the Academy (`learn.html`) in two tabs.
- Have `demo-data/` open in a file window, ready to drag.
- Optional: switch Wi-Fi off. Everything below still works, which is the strongest privacy proof you can give.

## 0b. The selector, for a mixed audience (30 seconds)
- The selector names the **technique**, not one department's use of it, and **Where this is used** underneath lists four or five areas across industries for whatever is selected.
- Useful when the room is not all from one function: flick through the techniques and let people find their own problem in the list before any data is loaded.
- Better still, ask the room: set the **modality** and their **function or group**, and the panel lists the unit operations they work on every day, each with what machine learning does at that step. Switching technique keeps the choice, so you can walk all four past the same audience without losing the thread.
- The quickest way to land it with a process audience: Microbial, Downstream process development, and read out step 3, *solubilisation and refolding &mdash; redox ratio, pH, protein concentration and additives searched together, a space far too large to run exhaustively*. Then switch the technique to genetic algorithms and point at the sequence optimizer doing exactly that.
- Say the caveat out loud once: *"These are uses of the method across industry. This page reads tables, and DNA sequences in the optimizer. It does not read images, audio or free text."*

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

## 4e. Method transfer in 90 seconds (for QC and analytical audiences)
- Pick **Method transfer &mdash; TOST equivalence test** from the selector, then **Example: a transfer that passes**. It sets a realistic &plusmn;2% margin.
- Run it. **Pass**: the 90% interval (&minus;1.40 to 1.60) sits inside &plusmn;1.97, using 81% of the margin.
- Tick **Match the same samples as pairs** and run again: the interval tightens to &minus;0.67 to 0.87, using 44%. Talking point: *"Same data, same labs. Measuring the same samples at both sites and pairing them halves the uncertainty for free."*
- Now press **Example: too few results** and run. **Inconclusive** &mdash; and the ordinary t-test on that same data says p = 0.69.
- This is the slide that matters: *"If we had run a t-test, we would have written 'no significant difference, methods equivalent' and signed it. The honest answer is that four results per lab cannot tell us. It says we would need about 16."*
- Finish with **Example: a real bias**: a 3.9-unit shift against a 2-unit margin, **Fail**, with the note that no amount of extra data fixes it.
- If someone asks *"our two labs send separate spreadsheets"*: switch **How is the data laid out?** to **Two files**, and drop one export into each box. They do not need matching column names or row order &mdash; the tool finds the result column in each, and pairs on the sample identifier across the two files.

## 4f. Catching a batch going wrong (3 minutes, the one process people lean forward for)
- Pick **PCA & multivariate SPC (golden batch)** and press **Load an example campaign**: 13 batches, 14 days each, five sensors.
- Untick **B-2411**, **B-2412** and **B-2413** as references &mdash; those are the ones being judged &mdash; and run it.
- The table triages the campaign: ten reference batches normal, three flagged, each with the hour it went off and the sensor to blame.
- Open **B-2413**. This is the slide. **T&sup2; never crosses its limit** &mdash; every sensor stayed inside its own range all run. But **Q goes through the roof from hour 131**, and the table underneath says pH owns **80%** of it. The pH probe drifted out of step with the vessel. *"Not one single-sensor chart on the plant would have caught this."*
- Then open **B-2411**: dissolved oxygen sliding away from day seven, flagged at hour 222, 25 of 60 checkpoints outside.
- Talking point: *"Thirty sensors is thirty charts nobody reads. This is one line per batch, and when it moves it tells you which sensor and which hour."*

## 4g. Whose fault is the spread? (3 minutes, the one every OpEx manager recognises)
- Pick **Variance components, ANOVA & Gage R&R**, leave it on **Where is the variation coming from?**, and press **Example: one supplier lot is the problem**.
- Six resin lots, four assays each. **89% of the variance sits between lots**, and the pairwise table names R-4404 as the outlier with a gap of about 5 points. *"That is a supplier conversation, and now it has evidence behind it."*
- Now press **Example: the lots are fine, the assay is noisy**. Same shape of data, same kind of scatter on screen &mdash; and the verdict flips to **MEASUREMENT, NOT THE GROUPS**, with essentially 0% between lots and an ANOVA p of 0.72.
- This is the slide: *"These two pictures look the same to the eye. One is a supplier problem and one is an assay problem, and the only thing that tells them apart is the repeats. We have spent money on the wrong one of these before."*
- Then switch the question to **Can my measurement system see it?** and press **Example: a method fit for release**. Enter spec limits of **94** and **106** and run: 8.7% of the specification window, about 21 distinct levels, **ACCEPTABLE**.
- Finish with **Example: one analyst out of step**: 47% of the window, **NOT ACCEPTABLE**, and the output points at reproducibility &mdash; disagreement between analysts &mdash; rather than the instrument. *"That is a training and method-description fix, not a capital request. The split tells you which."*
- If someone asks what this replaces: this is the part of JMP a QC lab uses most.

## 4h. The specification nobody can hold (3 minutes, the one that saves money)
- Pick **Tolerance intervals, power & sample size** and press **Example: limits too tight for the process**.
- 24 batches, limits of 97.5 to 99. The verdict is **NOT SUPPORTED**, and the reason is the sentence to read aloud: *"This process cannot hold those limits, and no amount of extra data will change that."* The interval uses **464%** of the specification window.
- The point: *"Those limits were committed to on three batches. Twenty-four batches later we can prove they were never achievable. This is the calculation that should have been done first."*
- Then press **Example: too few batches to say**: four batches, and the tool says about **nine** would bring it inside. *"Same verdict on the screen, completely different action: one is a process problem, the other is just not enough data yet. Knowing which is the whole value."*
- Note the tolerance factor on four batches: **8.2**, against the 3 everyone writes down. *"That is why specifications set on three batches get broken."*
- Switch to **Work out how many results a study needs**, leave it on equivalence, and press the button: 9 per method. Then set the expected difference to 1.5 against the same ±2 margin and re-run &mdash; the number climbs steeply. *"An optimistic guess about bias is how a transfer study ends up half the size it needed to be."*

## 4i. A screen you can act on, and a formulation (3 minutes)
- Open the **DOE builder**, delete the categorical **Catalyst** factor, add three more, and pick **Definitive screening design**: 5 factors in **13 runs**.
- The talking point: *"A Plackett-Burman screen of this size confounds main effects with interactions &mdash; if an interaction is real, you can end up changing the wrong setting. This one doesn't, and it also runs every factor at mid-level, so it can tell us the optimum is inside the range."*
- The Academy lesson **Definitive screening** makes this visual: drag the factor count and watch the confounding bar sit at zero for the DSD and well above it for Plackett-Burman.
- Now switch the design to **Mixture: extreme vertices (with limits)**. Watch the table relabel itself: **Component / Minimum % / Maximum %**. Enter Buffer 40&ndash;70, Sugar 5&ndash;30, Surfactant 0&ndash;10, Water 10&ndash;40 and generate.
- Every run sums to exactly 100, and each cell shows both the amount and the share. *"A formulation has no dials. You cannot add buffer without everything else becoming a smaller share, which is why a factorial design cannot be used here at all."*
- Press **Load a worked example** underneath and fit the blending model: it finds **Buffer &times; Sugar synergy** and **Buffer &times; Surfactant antagonism**, and flags that the pure-component coefficients are extrapolations because those blends were never formulable. *"It tells us what it does not know. That is the part I trust."*

## 4j. The front door (2 minutes &mdash; open with this)
- Before touching the tool selector, type into the box at the top: **"purity jumps around between resin lots and I cant tell if its the assay"**.
- It names the tool, the mode, what to bring, what it will tell you, and what to do next &mdash; and shows the words it matched on. Click **Take me there**: the right tool opens with the right mode already chosen.
- Now type something it cannot handle: **"what colour is the sky"**. It says nothing matched. *"It does not bluff. That is deliberate &mdash; a tool that confidently sends you to the wrong analysis is worse than one that admits it does not know."*
- Then type **"are these two lots the same or just noisy"**. It comes back unsure and asks the one question that separates the two tools. *"That is the sentence where routing confidently would send you down the wrong path."*
- Open **How this works, and what it cannot do**. It shows the measured accuracy, computed live from the examples shipped in the file: high on phrasings it was built around, lower on phrasings written to avoid its vocabulary. *"It tells you how often it is right, including the number that is not flattering. And there is no AI in it &mdash; it is a word list you can read, which is why it works with the WiFi off."*

## 4k. The protein, and the hairpin (3 minutes &mdash; the one biologists lean in for)
- In the sequence optimizer, load the example, tick **No hairpins near the start**, and run.
- Scroll to **The start of the message**. Two diagrams side by side: **before**, a stem-loop with the base pairs drawn as rungs; **after**, an open strand. *"That structure sits where the ribosome has to load. We did not trade it off against codon usage &mdash; we made it a requirement, and the search had to satisfy it."*
- Then **The protein, and the codons underneath it**: every residue coloured by chemical character, the codon beneath each one, underlined where it changed. *"176 of 238 codons changed. Not one amino acid changed. You are looking at the proof, not taking my word for it."*
- Hover a residue: it names the amino acid, the codon before and after, and how strongly this host favours that codon.
- If somebody asks about free energy: *"There is none here on purpose. A kcal/mol figure needs a thermodynamic parameter set we do not ship. We would rather show you exactly what we detected than put a convincing number next to it. Before you commit a design, run the final sequence through a folding tool that does carry those parameters."*

## 4l. Don't trust one model (1 minute)
- After any run, scroll to **Do the models agree on what matters?**
- Three different model families &mdash; a curve fit, a boosted ensemble, a neural network &mdash; each refit and asked separately which inputs they lean on. *"They all put MeltTemp first. That is three unrelated methods reaching the same answer, which is worth much more than one model's chart."*
- The honest counter-case: *"If they had disagreed, it would say so. A driver only one model likes is a lead to check, not a finding to act on."*

## 4m. Forecasting the run sheet before you book it (3 minutes &mdash; the one that saves a programme)
- Open **Plasmid & vector selection**, click **Load an example corpus** (160 screened constructs), then **Fit and calibrate**. Point at the fit table: *"Forty-eight of those runs were held back and never trained on. They are what the interval is measured from, which is why it is a calibrated interval and not a multiple of a standard deviation."*
- Move the **Plasmid_Size_kb** slider past the end of the corpus range. The badge turns amber and the band visibly widens. *"That widening is measured, not decorative. A fixed two-sigma band covered 99% of runs inside the data and 60% outside it &mdash; it is most confident exactly where it is least justified. The conformal band held 90% out there, at the same nominal confidence."*
- Now the part a programme runs on. Scroll to **Forecast a proposed run sheet** and click **Load an example sheet**. Sixteen runs come back, each with its own prediction, its own interval and its own standing. *"This is the sheet you were going to book. Every row is forecast, not just the one setting on my screen."*
- Point at the **beyond range** flags: ten of the sixteen. Then at the standing column: none of them read "far from the data". *"Those are two different questions and we keep them apart. One row is past the end of one column. None of them is far from the corpus once you take every feature together. A tool that merged those into one badge would be telling you something false about ten of your sixteen runs."*
- Then the verdict block, **"will this sheet settle anything?"** *"It tells you whether the runs can be told apart at all. If the best run's band overlaps everything, the sheet will not rank your candidates however carefully your team executes it &mdash; the difference you are chasing is smaller than the uncertainty you are carrying. That is a conversation worth having before the reagents are ordered, not after."*
- Switch **What the intervals should claim** to **Every run at once**. The bands widen and the header shows each one built at 99.38%. *"A 90% interval covers 90% of runs on average. It does not mean all sixteen land inside. We measured it: per run, 0.908 against the 0.900 we claim &mdash; but only 0.344 of twelve-run sheets had every row inside. Independence alone would predict 0.282. This mode spends the error budget across the sheet and takes that to 0.978."*
- On this example a red panel appears saying the calibration slice cannot back that claim. Do not skip it &mdash; it is the best thirty seconds in the demo. *"Forty-eight held-back runs can only resolve a tail out to 97.96%, and holding sixteen bands at once needs 99.38%. So it tells you the bands are a floor, not a guarantee. We measured that shortfall on a corpus too small to back the claim: sheet-wide coverage came in at 0.86 on average and as low as 0.74, against the 0.90 asked for. It would have been trivial to print the same-looking number and say nothing. Add runs to the corpus and the claim becomes real."*
- Close on the correlation caveat under the table: *"Every row came off one fitted model, so if the fit is biased in a region, every run there is wrong in the same direction. Neither mode is a substitute for running the thing. What this does is tell you which runs are worth running."*
- **Download the forecast run sheet (.csv)** and open it: every prediction, interval, standing, substitution, refusal reason, and the methodology note at the foot.

## 4n. How wrong might it be? (3 minutes &mdash; the one that earns trust)
- Load **Injection molding yield** and run the agent. Go to the **Model leaderboard** first. *"R&sup2; 0.897 &mdash; and underneath, the data cannot separate that from anything between 0.862 and 0.923. Most tools print the first number to three decimals and stop. The range is what tells you whether the model is worth acting on, and it is the first thing a small sample destroys."*
- Then **What drives Yield**. Point at the whiskers. *"Each bar is an average over ten shuffles, and the whisker is how much it moved. MeltTemp is genuinely ahead of Material &mdash; that gap is bigger than the noise in both. Where two drivers overlap, the tool calls them joint leaders instead of ranking them, because a second run could swap them."*
- Now the line that usually stops the room. *"Three of these inputs are at or below the blank. We shuffled the Yield column into nonsense, refit the same model, and it still handed out importances that big. On the bench that is your blank well: if the blank reads as high as the sample, the sample told you nothing."* If asked why not just check the bar against zero: *"We measured that. Three columns of pure random numbers scored 0.005 to 0.007 against standard errors near 0.002 &mdash; 'significant' by their own spread and worthless. A model leans on any column you hand it, because importance is measured on the rows it was fitted on. Zero is the wrong reference."*
- Scroll to the **what-if desk**. It reads **92.6 to 97.3, 90% of runs at these settings should land in that range**. *"That used to say 'typical error plus or minus RMSE'. One number for the whole dataset, identical everywhere &mdash; so it was most reassuring exactly where it was least justified. A fixed two-sigma band covered 93% of runs inside the data and 35% outside it. This one is calibrated on rows held back from a second fit, and it widens."*
- Then drive several sliders to opposite extremes. The badge turns amber &mdash; **edge of the data** &mdash; and the band opens to **73.7 to 80.3**. *"Notice no single slider has left its own range. Every setting here is one this plant has run. It is the combination nobody has run. That is the failure mode a dataset-wide error bar cannot express, and it is the one that bites in a transfer."*
- The honest caveat, if someone asks whether the 90% is a guarantee: *"No, and we say so on the page. The model is refit on every row while the band comes from a model fitted on part of them, so they are not perfectly exchangeable. On 300 rows a single calibration slice landed between 91% and 98% across four corpora. It is a close approximation with the slice size shown next to it, not a promise &mdash; and where the slice is too small to support the confidence you asked for, it tells you the band is a floor."*

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
