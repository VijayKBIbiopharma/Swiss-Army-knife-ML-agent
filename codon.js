/* Codon biology for sequence optimization: the standard genetic code, host codon-usage
   tables, Codon Adaptation Index, GC content (overall and in sliding windows), a 5'
   base-pairing propensity score, and forbidden-motif detection. Pure computation; no
   network, no storage.

   The codon-usage tables below are reference values (counts per thousand) for
   demonstration and training. Confirm them against your own host and expression system
   before ordering synthesis. */
(function (root) {
  'use strict';

  // ---------- The standard genetic code ----------
  // Bases in the conventional T, C, A, G order; one letter per codon, * = stop.
  const AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const BASES = 'TCAG';
  const CODE = {};
  (function () {
    let i = 0;
    for (const a of BASES) for (const b of BASES) for (const c of BASES) CODE[a + b + c] = AA[i++];
  })();
  // Amino acid -> its synonymous codons.
  const SYN = {};
  for (const c of Object.keys(CODE)) (SYN[CODE[c]] = SYN[CODE[c]] || []).push(c);

  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  const revComp = s => s.split('').reverse().map(c => COMP[c] || 'N').join('');
  const clean = s => String(s || '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');

  function translate(dna) {
    let p = '';
    for (let i = 0; i + 3 <= dna.length; i += 3) p += CODE[dna.slice(i, i + 3)] || 'X';
    return p;
  }

  /* Codon usage per thousand. Human (Homo sapiens) and E. coli K-12 follow the widely
     published genome-wide counts; CHO is Cricetulus griseus, close to human but with its
     own biases. Treat all three as reference values, not as a substitute for your own
     expression data. */
  const TABLES = {
    HEK293: { name: 'HEK293 (Homo sapiens)', note: 'Human genome-wide codon usage. Applies to HEK293 and other human cell lines.', usage: {
      TTT: 17.6, TTC: 20.3, TTA: 7.7, TTG: 12.9, CTT: 13.2, CTC: 19.6, CTA: 7.2, CTG: 39.6,
      ATT: 16.0, ATC: 20.8, ATA: 7.5, ATG: 22.0, GTT: 11.0, GTC: 14.5, GTA: 7.1, GTG: 28.1,
      TCT: 15.2, TCC: 17.7, TCA: 12.2, TCG: 4.4, CCT: 17.5, CCC: 19.8, CCA: 16.9, CCG: 6.9,
      ACT: 13.1, ACC: 18.9, ACA: 15.1, ACG: 6.1, GCT: 18.4, GCC: 27.7, GCA: 15.8, GCG: 7.4,
      TAT: 12.2, TAC: 15.3, TAA: 1.0, TAG: 0.8, CAT: 10.9, CAC: 15.1, CAA: 12.3, CAG: 34.2,
      AAT: 17.0, AAC: 19.1, AAA: 24.4, AAG: 31.9, GAT: 21.8, GAC: 25.1, GAA: 29.0, GAG: 39.6,
      TGT: 10.6, TGC: 12.6, TGA: 1.6, TGG: 13.2, CGT: 4.5, CGC: 10.4, CGA: 6.2, CGG: 11.4,
      AGT: 12.1, AGC: 19.5, AGA: 12.2, AGG: 12.0, GGT: 10.8, GGC: 22.2, GGA: 16.5, GGG: 16.5 } },
    CHO: { name: 'CHO (Cricetulus griseus)', note: 'Chinese hamster ovary cells, the workhorse for therapeutic antibodies. Close to human usage.', usage: {
      TTT: 17.3, TTC: 19.4, TTA: 6.0, TTG: 12.3, CTT: 12.6, CTC: 19.0, CTA: 6.6, CTG: 40.0,
      ATT: 15.5, ATC: 21.0, ATA: 6.0, ATG: 22.0, GTT: 10.5, GTC: 15.0, GTA: 6.5, GTG: 29.0,
      TCT: 15.0, TCC: 18.0, TCA: 11.0, TCG: 4.3, CCT: 17.5, CCC: 19.0, CCA: 16.5, CCG: 6.5,
      ACT: 13.0, ACC: 19.5, ACA: 15.0, ACG: 6.0, GCT: 19.0, GCC: 27.0, GCA: 15.5, GCG: 6.5,
      TAT: 12.0, TAC: 15.5, TAA: 1.0, TAG: 0.7, CAT: 10.5, CAC: 15.0, CAA: 12.0, CAG: 34.0,
      AAT: 16.5, AAC: 19.5, AAA: 23.5, AAG: 32.0, GAT: 22.0, GAC: 25.0, GAA: 28.0, GAG: 40.0,
      TGT: 10.5, TGC: 12.5, TGA: 1.5, TGG: 12.5, CGT: 4.8, CGC: 10.0, CGA: 6.0, CGG: 10.5,
      AGT: 12.0, AGC: 19.0, AGA: 12.0, AGG: 11.5, GGT: 11.5, GGC: 22.0, GGA: 17.0, GGG: 15.5 } },
    E_coli: { name: 'E. coli K-12', note: 'Bacterial expression. Strongly biased: a few codons dominate each amino acid.', usage: {
      TTT: 22.3, TTC: 16.6, TTA: 13.9, TTG: 13.7, CTT: 11.0, CTC: 11.0, CTA: 3.9, CTG: 52.6,
      ATT: 30.3, ATC: 25.1, ATA: 4.4, ATG: 27.9, GTT: 18.3, GTC: 15.3, GTA: 10.9, GTG: 26.4,
      TCT: 8.5, TCC: 8.6, TCA: 7.2, TCG: 8.9, CCT: 7.0, CCC: 5.5, CCA: 8.4, CCG: 23.2,
      ACT: 8.9, ACC: 23.4, ACA: 7.1, ACG: 14.4, GCT: 15.3, GCC: 25.5, GCA: 20.2, GCG: 33.6,
      TAT: 16.2, TAC: 12.2, TAA: 2.0, TAG: 0.2, CAT: 12.9, CAC: 9.7, CAA: 15.4, CAG: 28.8,
      AAT: 17.7, AAC: 21.7, AAA: 33.6, AAG: 10.3, GAT: 32.2, GAC: 19.1, GAA: 39.4, GAG: 17.8,
      TGT: 5.2, TGC: 6.4, TGA: 1.0, TGG: 15.2, CGT: 20.9, CGC: 22.0, CGA: 3.6, CGG: 5.4,
      AGT: 8.8, AGC: 16.1, AGA: 2.1, AGG: 1.2, GGT: 24.7, GGC: 29.6, GGA: 8.2, GGG: 11.3 } }
  };

  /* Relative adaptiveness w: each codon's usage divided by the most-used codon for the same
     amino acid, so the host's favourite codon scores 1. (Sharp and Li, 1987.) */
  function relativeAdaptiveness(hostId) {
    const t = TABLES[hostId];
    if (!t) throw new Error('Unknown host "' + hostId + '".');
    const w = {};
    for (const aa of Object.keys(SYN)) {
      const syns = SYN[aa], top = Math.max.apply(null, syns.map(c => t.usage[c]));
      // A floor keeps log(w) finite for codons a host almost never uses.
      syns.forEach(c => { w[c] = Math.max(t.usage[c] / top, 0.005); });
    }
    return w;
  }

  /* Codon Adaptation Index: the geometric mean of w across the coding sequence. Single-codon
     amino acids (Met, Trp) and stops carry no choice, so they are left out by convention. */
  function cai(dna, w) {
    let sum = 0, n = 0;
    for (let i = 0; i + 3 <= dna.length; i += 3) {
      const c = dna.slice(i, i + 3), aa = CODE[c];
      if (!aa || aa === '*' || SYN[aa].length < 2) continue;
      sum += Math.log(w[c]); n++;
    }
    return n ? Math.exp(sum / n) : 0;
  }

  const gcOf = s => { let g = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === 'G' || c === 'C') g++; } return s.length ? g / s.length : 0; };

  /* GC content overall and in sliding windows. Synthesis houses fail on local GC extremes
     even when the whole gene looks fine, so windows are scored as well as the total. */
  function gcProfile(dna, opt) {
    const lo = opt.gcLow, hi = opt.gcHigh, win = opt.gcWindow || 50, step = opt.gcStep || 10;
    const overall = gcOf(dna);
    const windows = [];
    let worst = 0, penalty = 0;
    for (let i = 0; i + win <= dna.length; i += step) {
      const g = gcOf(dna.substr(i, win));
      windows.push({ at: i, gc: g });
      const d = g < lo ? lo - g : g > hi ? g - hi : 0;
      if (d > worst) worst = d;
      penalty += d * d;
    }
    const od = overall < lo ? lo - overall : overall > hi ? overall - hi : 0;
    // The overall deviation counts as much as the windows together, so a gene cannot pass
    // by averaging two bad halves.
    return { overall, windows, worstWindow: worst, deviation: od, penalty: od * od * (windows.length || 1) + penalty, ok: od === 0 && worst === 0 };
  }

  /* 5' folding propensity. A tight hairpin over the start codon blocks the ribosome from
     loading, so this counts how much of the 5' end can pair with itself (Nussinov maximum
     base pairing, minimum hairpin loop of 3). It is a structure score, not a kcal/mol MFE:
     higher means more self-pairing and a more rigid start. */
  const PAIR = { GC: 3, CG: 3, AT: 2, TA: 2, GT: 1, TG: 1 };
  function foldScore(seq) {
    const n = seq.length;
    if (n < 5) return 0;
    const dp = new Float32Array(n * n);
    for (let span = 4; span < n; span++) {
      for (let i = 0; i + span < n; i++) {
        const j = i + span;
        let best = dp[i * n + j - 1];                       // j unpaired
        const p = PAIR[seq[i] + seq[j]];
        if (p) best = Math.max(best, dp[(i + 1) * n + j - 1] + p);  // i pairs with j
        for (let k = i + 1; k < j; k++) best = Math.max(best, dp[i * n + k] + dp[(k + 1) * n + j]);
        dp[i * n + j] = best;
      }
    }
    // Per base, so the number means the same thing whatever window length is used.
    return dp[n - 1] / n;
  }

  // ---------- Forbidden motifs ----------
  const ENZYMES = {
    EcoRI: 'GAATTC', BamHI: 'GGATCC', HindIII: 'AAGCTT', XhoI: 'CTCGAG', NotI: 'GCGGCCGC',
    XbaI: 'TCTAGA', SalI: 'GTCGAC', NheI: 'GCTAGC', KpnI: 'GGTACC', SacI: 'GAGCTC',
    PstI: 'CTGCAG', NcoI: 'CCATGG', NdeI: 'CATATG', AgeI: 'ACCGGT', SpeI: 'ACTAGT',
    EcoRV: 'GATATC', BglII: 'AGATCT', MluI: 'ACGCGT', AvrII: 'CCTAGG', AscI: 'GGCGCGCC',
    PacI: 'TTAATTAA', SbfI: 'CCTGCAGG', PmeI: 'GTTTAAAC', SmaI: 'CCCGGG', ApaI: 'GGGCCC',
    BsaI: 'GGTCTC', BsmBI: 'CGTCTC', BbsI: 'GAAGAC', SapI: 'GCTCTTC'
  };
  /* Each site is searched on both strands: BsaI and friends are not palindromes, so
     GGTCTC on the bottom strand (GAGACC on the top) cuts just the same. */
  function motifList(names) {
    const out = [];
    for (const raw of names) {
      const key = String(raw).trim();
      if (!key) continue;
      const site = ENZYMES[key] || clean(key);
      if (!site) continue;
      const label = ENZYMES[key] ? key : site;
      out.push({ label, site });
      const rc = revComp(site);
      if (rc !== site) out.push({ label: label + ' (bottom strand)', site: rc });
    }
    return out;
  }
  function findMotifs(dna, motifs, maxRun) {
    const hits = [];
    for (const m of motifs) {
      let i = dna.indexOf(m.site);
      while (i >= 0) { hits.push({ label: m.label, site: m.site, at: i }); i = dna.indexOf(m.site, i + 1); }
    }
    if (maxRun) {
      const re = new RegExp('(A{' + (maxRun + 1) + ',}|C{' + (maxRun + 1) + ',}|G{' + (maxRun + 1) + ',}|T{' + (maxRun + 1) + ',})', 'g');
      let m;
      while ((m = re.exec(dna))) hits.push({ label: m[1][0] + ' run (' + m[1].length + ')', site: m[1], at: m.index });
    }
    return hits;
  }

  /* Everything a sequence is judged on, in one pass. `w` is the host's relative
     adaptiveness, so it is computed once and reused for the whole run. */
  function score(dna, ctx) {
    const gc = gcProfile(dna, ctx);
    const five = foldScore(dna.slice(0, ctx.foldWindow || 45));
    const hits = findMotifs(dna, ctx.motifs, ctx.maxRun);
    return { cai: cai(dna, ctx.w), gc, fold: five, motifs: hits, violations: hits.length };
  }

  root.MLCodon = { CODE, SYN, TABLES, ENZYMES, translate, revComp, clean, relativeAdaptiveness, cai, gcOf, gcProfile, foldScore, motifList, findMotifs, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLCodon;
})(typeof globalThis !== 'undefined' ? globalThis : this);
