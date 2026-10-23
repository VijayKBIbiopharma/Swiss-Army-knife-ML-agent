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

## 4b. Moving customers up a tier (1 minute)
- Click the practice dataset **Customer loyalty tiers**, run.
- Above the action plan, set **Starting from: Rows now Bronze** and **Target outcome: Silver or better**. The plan re-aims instantly: raise spend, visits and tenure, cut support tickets, get them on the app.
- Switch to **Rows now Gold → Gold or better** to show the retention question.
- Talking point: *"Same model, different business question, one click. Region doesn't appear at all, because it truly doesn't matter in this data."*

## 5. Finding groups with no target: penguins (1 minute)
- Drag `penguins.csv`, choose **Nothing: find groups and patterns**, run.
- Show the groups chart and profiles: one group is entirely Gentoo penguins on Biscoe island. The agent found the species without being told.

## 6. Teaching (2 minutes)
- Switch to the Academy tab, lesson **Random forest**. Click the map and flip through the five trees to show them voting.
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
