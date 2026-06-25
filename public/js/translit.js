'use strict';

/**
 * Deterministic Kannada → Latin (ISO 15919-ish) transliteration of whole words.
 * Walks the Unicode sequence, applying the abugida rules: a bare consonant
 * carries an inherent 'a' unless a vowel sign replaces it or a virama (್)
 * suppresses it (conjuncts).
 */
const Translit = (() => {
  const VOWELS = {
    'ಅ': 'a', 'ಆ': 'ā', 'ಇ': 'i', 'ಈ': 'ī', 'ಉ': 'u', 'ಊ': 'ū', 'ಋ': 'r̥',
    'ಎ': 'e', 'ಏ': 'ē', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'ō', 'ಔ': 'au',
  };
  const CONS = {
    'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'ṅ',
    'ಚ': 'c', 'ಛ': 'ch', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'ñ',
    'ಟ': 'ṭ', 'ಠ': 'ṭh', 'ಡ': 'ḍ', 'ಢ': 'ḍh', 'ಣ': 'ṇ',
    'ತ': 't', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
    'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
    'ಯ': 'y', 'ರ': 'r', 'ಲ': 'l', 'ವ': 'v',
    'ಶ': 'ś', 'ಷ': 'ṣ', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'ḷ',
  };
  const SIGNS = {
    'ಾ': 'ā', 'ಿ': 'i', 'ೀ': 'ī', 'ು': 'u', 'ೂ': 'ū', 'ೃ': 'r̥',
    'ೆ': 'e', 'ೇ': 'ē', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'ō', 'ೌ': 'au',
  };
  const VIRAMA = '್';
  const ANUSVARA = 'ಂ';
  const VISARGA = 'ಃ';

  function word(s) {
    let out = '';
    const a = [...s];
    for (let i = 0; i < a.length; i++) {
      const ch = a[i];
      if (VOWELS[ch]) { out += VOWELS[ch]; continue; }
      if (CONS[ch]) {
        const next = a[i + 1];
        if (next === VIRAMA) { out += CONS[ch]; i += 1; }      // conjunct: no vowel
        else if (SIGNS[next]) { out += CONS[ch] + SIGNS[next]; i += 1; }
        else { out += CONS[ch] + 'a'; }                         // inherent 'a'
        continue;
      }
      if (ch === ANUSVARA) { out += 'ṁ'; continue; }
      if (ch === VISARGA) { out += 'ḥ'; continue; }
      // unknown / stray combining mark — skip
    }
    return out;
  }

  return { word };
})();
