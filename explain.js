/* Plain-English explanations shared by the results page, the downloadable report and the
   Learn page, so a concept is explained the same way everywhere. Text only. */
(function (root) {
  'use strict';

  // Which Learn lesson explains each model.
  const MODEL_TOPIC = {
    baseline: 'scores', linear: 'linear', ridge: 'ridge-lasso', lasso: 'ridge-lasso', quadratic: 'quadratic',
    logistic: 'logistic', naivebayes: 'naive-bayes', knn: 'knn', tree: 'tree', forest: 'forest', boosting: 'boosting', mlp: 'neural-network'
  };

  const MODEL_ANALOGY = {
    baseline: 'A control group: always guess the average. Every real model has to beat it.',
    linear: 'A recipe: each ingredient adds or subtracts a fixed amount.',
    ridge: 'A recipe with a seat belt, so it does not over-react to noisy or overlapping ingredients.',
    lasso: 'A recipe that crosses out the ingredients that do not matter: the vital few, not the trivial many.',
    quadratic: 'Baking temperature: too low or too high both ruin the cake. It finds the sweet spot.',
    logistic: 'A credit-score card that adds up points and turns them into odds.',
    naivebayes: 'A detective matching a suspect to the profile each group usually fits.',
    knn: 'Asking the neighbours: "what happened the last few times conditions looked like this?"',
    tree: 'A troubleshooting flowchart, or a game of 20 questions.',
    forest: 'Asking 60 experienced operators separately and going with the majority.',
    boosting: 'Golf: each shot corrects the miss of the one before.',
    mlp: 'A team of specialists passing notes forward, building up from simple clues to complex conclusions.'
  };

  // "How to read this" text for each result chart: [what it shows, analogy, lesson id].
  const READ = {
    leaderboard: ['Each bar is one model\'s score on rows it never saw while learning. An R² of 0.80 means the model explains 80% of the ups and downs in the result; 0 means no better than always guessing the average. The yellow bar is the model the agent chose: the simplest one within a hair of the best.',
      'It is like grading students on a surprise exam, not on homework they could have copied.', 'cross-validation'],
    fitScatter: ['Each dot is one row. Left to right is what actually happened; bottom to top is what the model predicted without seeing that row. Dots hugging the dashed line are good predictions. A fan shape means the model is less reliable at that end. Dots far from the line are rows worth a closer look.',
      'Think of a target: the dashed line is the bullseye.', 'scores'],
    confusion: ['Rows are what really happened; columns are what the model said. The diagonal holds the correct calls. The other cells are the two kinds of mistakes.',
      'Like a smoke alarm: one mistake is a false alarm, the other is a missed fire. Decide which one costs you more.', 'scores'],
    drivers: ['The agent scrambled one column at a time and checked how much worse the model got. A big drop means the model leans on that column: a key driver. It measures predictive power, not cause and effect.',
      'Like removing one player from a team to see how much the score suffers.', 'reading-results'],
    pd: ['Each panel shows what the model expects as one driver changes while everything else stays as it was. A rising line means more of this driver goes with a higher result. A hump is a sweet spot. A flat line means it barely matters in this range. The dashed marker is your typical value.',
      'Like turning one knob on a mixing desk while leaving the others alone and listening to the change.', 'reading-results'],
    desirability: ['Each result gets a score d from 0 (fails its acceptable range) to 1 (fully met). D is their weighted geometric mean, so one failing result gives D = 0. "Typical" is every input at its median; "Compromise" is the best D the agent found inside the middle 90% of your data. Each result has its own model; its R² says how far to trust that column.',
      'Like tuning a car for speed, fuel and comfort at once: the best tune is where nothing fails, not where one gauge is maxed out.', 'desirability'],
    whatif: ['Each knob is a top driver, starting at its typical (median or most common) value. The big number is what the chosen model predicts for the current settings, and the arrow compares it with typical settings. The curve under each knob sweeps that knob across its range while the other knobs stay where they are; the dot is where you are now, and the shaded band is where 90% of your data sits. Pin scenarios to compare them side by side; they go into the PDF.',
      'A mixing desk, or a flight simulator: safe for practice, but confirm in the real world with a trial before changing the process.', 'reading-results'],
    tree: ['Read it like a troubleshooting flowchart: start at the top, answer each question, and follow yes or no down to a rounded box with the expected result. Green boxes are the best outcomes, red the worst. This is a simplified 3-question tree trained on your data to show the main patterns. The chosen model is more detailed.',
      'It is the game of 20 questions, played with your data.', 'tree'],
    forest: ['Your random forest grew many trees. Here are the top levels of three of them. Each tree saw a different random sample of rows and columns, so each asks different questions. The forest averages all their answers, which cancels out the quirks of any single tree.',
      'Wisdom of the crowd: many independent opinions beat one expert who might be having a bad day.', 'forest'],
    boosting: ['Gradient boosting builds small trees in a chain. The first tree makes a rough guess, and every later tree learns only the part the earlier trees still got wrong. Here are the first three; the rounded boxes show the correction each one adds.',
      'Golf: each shot corrects the miss of the one before, until you are on the green.', 'boosting'],
    recipe: ['Start from the base value, then each column adds or subtracts a fixed amount per unit. Category columns are compared with the most common category.',
      'A recipe card: two more spoons of sugar always adds the same sweetness.', 'linear'],
    pareto: ['Each bar is one effect, scaled by how much it stands out from noise. Bars that cross the red dashed line are real effects: there is less than a 5% chance that noise alone would produce them.',
      'Signal versus static on a radio: the tall bars are the voices you can actually hear.', 'significance'],
    effects: ['Effect = how much the result changes when a factor goes from its low to its high level. The p-value is the chance of seeing an effect this big from noise alone; below 0.05 counts as real. A coefficient is half the effect, because coded levels run from −1 to +1.',
      'p-value: if nothing were really going on, how surprised should you be?', 'significance'],
    mainEffects: ['Each panel plots the average result at each level of one factor. A steeper line is a stronger factor. A flat line means the factor does not matter in this range. All panels share one scale, so you can compare them.',
      'Like comparing how hard each pedal on a bike pushes you forward.', 'factorial'],
    interaction: ['If the two lines are parallel, the factors act independently. If they spread apart or cross, the effect of one factor depends on the setting of the other.',
      'Fertilizer only helps when there is enough water: the two work together.', 'interactions'],
    optimum: ['The agent searched the tested region for the settings its model expects to give the best result. It does not look beyond the levels you ran.',
      'A map is only reliable for the area that was surveyed.', 'reading-results'],
    pca: ['PCA squeezes many columns into the two directions in which rows differ the most, so you can see the whole dataset on one flat chart. Points close together are similar rows. Color and shape show the group each row was put in.',
      'Like photographing a 3D object from its most informative angle.', 'pca'],
    silhouette: ['For every row, silhouette compares how close it is to its own group with how close it is to the next nearest group. Near 1 means clear, separate groups; near 0 means groups that overlap.',
      'Like checking whether each guest is clearly sitting at one table, or standing between two.', 'kmeans'],
    profiles: ['Average of each numeric column in each group, next to the overall average. The last column says what makes each group different from the rest.',
      'A customer persona card, written from the data.', 'kmeans'],
    capability: ['Cp compares the width of your spec window with the width of the process (6 standard deviations). Cpk does the same but counts only the nearer spec limit, so an off-center process scores lower. Pp and Ppk use the overall long-term spread; Cp and Cpk use short-term spread between neighbouring rows. 1.33 or more is capable, 1.0 to 1.33 is marginal, below 1.0 makes defects. Z.bench and PPM say the same thing as a defect rate.',
      'Parking a car in a garage: Cp asks whether the car is narrower than the garage; Cpk asks whether it is parked in the middle, or scraping one wall.', 'capability'],
    histogram: ['Bars show how often each value happened. The curve is the bell shape the capability numbers assume. Red dashed lines are the spec limits and red bars fall outside them. The green line is the target.',
      'A shooting target seen from the side: you want a tall, narrow pile centered on the bullseye.', 'capability'],
    controlChart: ['Each dot is one row in time order. The center line is the average, and the red dashed lines are control limits: where common, everyday variation should stay. A red dot is a signal: beyond a limit, 8 in a row on one side, or a sudden jump. Signals point to special causes worth investigating. The lower chart (moving range) tracks how much each point jumps from the last.',
      'A heart monitor: normal beats wiggle inside a band; a spike outside the band means something happened.', 'control-charts'],
    boxplot: ['Each box holds the middle half of the values; the thick line is the median; whiskers reach the usual range; circles are unusual values. Compare groups: a box shifted sideways changes the average, and a wider box means more variation.',
      'Five-number summary at a glance, like comparing the spread of lap times between drivers.', 'taguchi'],
    taguchi: ['The signal-to-noise ratio (in decibels) scores each factor level for consistency as well as for the average. Higher S/N is always better. The type follows your goal: larger is better, smaller is better, or on target is best when a target is set. Factors with a big S/N range matter most for robustness.',
      'A recipe that tastes good every time, not just on a good day: robustness against noise you cannot control.', 'taguchi'],
    sigma: ['For pass/fail results, the defect rate is converted to defects per million opportunities (DPMO) and a sigma level, using the standard 1.5 sigma shift. 3 sigma is about 66,800 per million, 4 sigma 6,210, 5 sigma 233, and 6 sigma 3.4.',
      'Like a golf handicap for quality: one number that lets very different processes be compared.', 'capability'],
    nn: ['The neural network learns in rounds called epochs. The solid line is its error on the rows it learns from; the orange line is its error on 15% of rows held back to check it. Both fall at first. When the check error stops falling, more training would only memorize noise, so training stops (early stopping) and the network keeps its best version, marked with the large dot.',
      'Practice exams: keep studying while your practice score improves, and stop when it plateaus, before you start memorizing the answer key.', 'neural-network'],
    correlations: ['Correlation runs from −1 to 1 and says how tightly two columns move together. Close to ±1 is a strong link; near 0 is no straight-line link. It never proves that one causes the other.',
      'Ice-cream sales and sunburns rise together, but neither causes the other: the sun drives both.', 'why-doe']
  };

  const GLOSSARY = [
    ['Target', 'The column you want to predict or improve (the Y).'],
    ['Driver / factor', 'An input column that may influence the target (an X).'],
    ['Regression', 'Predicting a number, such as yield or cycle time.'],
    ['Classification', 'Predicting a category, such as pass or fail.'],
    ['Unsupervised', 'Finding structure (groups, unusual rows) when there is no target.'],
    ['Cross-validation', 'Scoring a model only on rows it did not learn from, round by round.'],
    ['R²', 'Share of the variation in the target that the model explains (0 to 1).'],
    ['RMSE', 'Typical size of a prediction error, in the target\'s own units.'],
    ['Balanced accuracy', 'Average of the hit rate for each class, so a rare class counts as much as a common one.'],
    ['Overfitting', 'Memorizing noise in the training data instead of learning the real pattern.'],
    ['p-value', 'Chance of seeing an effect this large from noise alone. Below 0.05 is usually called significant.'],
    ['Interaction', 'When the effect of one factor depends on the level of another.'],
    ['Center point', 'A DOE run with every factor in the middle of its range; it tests for curvature.'],
    ['Aliasing', 'When a smaller design cannot tell two effects apart.'],
    ['Cp / Cpk', 'Process capability: spec width versus process width; Cpk also penalizes being off center. 1.33+ is capable.'],
    ['Pp / Ppk', 'Like Cp / Cpk but using the overall, long-term spread.'],
    ['Z.bench / PPM', 'Expected defect rate from capability, as a Z value or parts per million.'],
    ['Control limits', 'The band where everyday (common-cause) variation stays. Points outside are special-cause signals.'],
    ['S/N ratio', 'Taguchi signal-to-noise: a consistency score for a factor level. Higher is more robust.']
  ];

  root.MLExplain = { MODEL_TOPIC, MODEL_ANALOGY, READ, GLOSSARY };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLExplain;
})(typeof globalThis !== 'undefined' ? globalThis : this);
