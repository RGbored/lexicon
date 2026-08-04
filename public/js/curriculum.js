'use strict';

/**
 * Builds units → lessons from the character set.
 * Orders them dynamically based on the active target language.
 */
const Curriculum = (() => {
  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function build(characters) {
    const activeLang = Data.progressData()?.settings?.targetLang || 'kn';
    const units = [];

    if (activeLang === 'kn') {
      // Unit 1 — Vowels (+ yogavaahaka), in batches of 5.
      const vowels = characters
        .filter((c) => c.category === 'vowel' || c.category === 'yogavaahaka')
        .map((c) => c.id);
      units.push({
        id: 'vowels',
        section: 'vowels',
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
      units.push({ id: 'consonants', section: 'consonants', title: 'Consonants', lessons });

      // Units 3+ — Kagunita, one unit per consonant series (its 12 vowel forms),
      // 6 forms per lesson. Skipped automatically if kagunita wasn't generated.
      const kagunita = characters.filter((c) => c.category === 'kagunita');
      if (kagunita.length) {
        for (const cons of consonants) {
          const series = kagunita.filter((k) => k.group === `${cons.id}-kagunita`).map((k) => k.id);
          if (!series.length) continue;
          units.push({
            id: `kagunita-${cons.id}`,
            section: 'kagunita',
            glyph: cons.glyph,
            title: `Kagunita ${cons.glyph} (${cons.roman})`,
            lessons: chunk(series, 6).map((ids) => ({ ids })),
          });
        }
      }
    } else if (activeLang === 'ja') {
      // Japanese: Hiragana unit & Katakana unit
      const hiragana = characters.filter((c) => c.category === 'hiragana').map((c) => c.id);
      if (hiragana.length) {
        units.push({
          id: 'hiragana',
          section: 'hiragana',
          title: 'Hiragana',
          lessons: chunk(hiragana, 5).map((ids) => ({ ids })),
        });
      }

      const katakana = characters.filter((c) => c.category === 'katakana').map((c) => c.id);
      if (katakana.length) {
        units.push({
          id: 'katakana',
          section: 'katakana',
          title: 'Katakana',
          lessons: chunk(katakana, 5).map((ids) => ({ ids })),
        });
      }
    } else if (activeLang === 'de') {
      // German: Alphabet unit & Umlauts unit
      const alphabet = characters.filter((c) => c.category === 'alphabet').map((c) => c.id);
      if (alphabet.length) {
        units.push({
          id: 'alphabet',
          section: 'alphabet',
          title: 'German Alphabet',
          lessons: chunk(alphabet, 5).map((ids) => ({ ids })),
        });
      }

      const umlauts = characters.filter((c) => c.category === 'umlauts').map((c) => c.id);
      if (umlauts.length) {
        units.push({
          id: 'umlauts',
          section: 'umlauts',
          title: 'Umlauts & Special Characters',
          lessons: chunk(umlauts, 4).map((ids) => ({ ids })),
        });
      }
    }

    return units;
  }

  return { build };
})();
