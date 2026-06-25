'use strict';

/**
 * Builds units → lessons from the character set (DESIGN.md §3).
 * A unit is an ordered list of lessons; a lesson is a small set of character
 * ids to introduce. Order follows the generated character order, so the
 * pedagogical sequence lives in the generator, not here.
 */
const Curriculum = (() => {
  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function build(characters) {
    const units = [];

    // Unit 1 — Vowels (+ yogavaahaka), in batches of 5.
    const vowels = characters
      .filter((c) => c.category === 'vowel' || c.category === 'yogavaahaka')
      .map((c) => c.id);
    units.push({
      id: 'vowels',
      title: 'Vowels',
      lessons: chunk(vowels, 5).map((ids) => ({ ids })),
    });

    // Unit 2 — Consonants, one varga group per lesson (split if >5).
    const consonants = characters.filter((c) => c.category === 'consonant');
    const groupOrder = [];
    const seen = new Set();
    for (const c of consonants) {
      if (!seen.has(c.group)) { seen.add(c.group); groupOrder.push(c.group); }
    }
    const lessons = [];
    for (const group of groupOrder) {
      const ids = consonants.filter((c) => c.group === group).map((c) => c.id);
      for (const part of chunk(ids, 5)) lessons.push({ ids: part });
    }
    units.push({ id: 'consonants', title: 'Consonants', lessons });

    // Units 3+ — Kagunita, one unit per consonant series (its 12 vowel forms),
    // 6 forms per lesson. Skipped automatically if kagunita wasn't generated.
    const kagunita = characters.filter((c) => c.category === 'kagunita');
    if (kagunita.length) {
      for (const cons of consonants) {
        const series = kagunita.filter((k) => k.group === `${cons.id}-kagunita`).map((k) => k.id);
        if (!series.length) continue;
        units.push({
          id: `kagunita-${cons.id}`,
          title: `Kagunita ${cons.glyph} (${cons.roman})`,
          lessons: chunk(series, 6).map((ids) => ({ ids })),
        });
      }
    }

    return units;
  }

  return { build };
})();
