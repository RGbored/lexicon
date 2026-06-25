#!/usr/bin/env node
'use strict';

/**
 * Generates the Kannada character set from rule tables into data/characters.json.
 *
 * Each character: { id, glyph, roman, category, group }
 *   - id       stable ASCII slug (unique across the whole set)
 *   - glyph    the Kannada character (may be a multi-codepoint sequence)
 *   - roman    ISO 15919-style romanization (with diacritics)
 *   - category vowel | yogavaahaka | consonant | kagunita
 *   - group    sub-grouping used for lesson ordering
 *
 * Default run emits vowels + yogavaahaka + consonants (M1 scope).
 * Run with `--all` to also emit the kagunita grid (M3).
 */

const fs = require('fs');
const path = require('path');

// ── Source tables ──────────────────────────────────────────────────────────
// [ glyph, roman, id ]
const VOWELS = [
  ['ಅ', 'a', 'a'], ['ಆ', 'ā', 'aa'], ['ಇ', 'i', 'i'], ['ಈ', 'ī', 'ii'],
  ['ಉ', 'u', 'u'], ['ಊ', 'ū', 'uu'], ['ಋ', 'r̥', 'ru'],
  ['ಎ', 'e', 'e'], ['ಏ', 'ē', 'ee'], ['ಐ', 'ai', 'ai'],
  ['ಒ', 'o', 'o'], ['ಓ', 'ō', 'oo'], ['ಔ', 'au', 'au'],
];

// Yogavaahaka shown applied to ಅ (anusvara, visarga)
const YOGAVAAHAKA = [
  ['ಅಂ', 'aṁ', 'am'], ['ಅಃ', 'aḥ', 'ah'],
];

// Consonants grouped by varga. [ glyph, roman, id ]
const CONSONANT_GROUPS = {
  'ka-varga':   [['ಕ', 'ka', 'ka'], ['ಖ', 'kha', 'kha'], ['ಗ', 'ga', 'ga'], ['ಘ', 'gha', 'gha'], ['ಙ', 'ṅa', 'nga']],
  'ca-varga':   [['ಚ', 'ca', 'ca'], ['ಛ', 'cha', 'cha'], ['ಜ', 'ja', 'ja'], ['ಝ', 'jha', 'jha'], ['ಞ', 'ña', 'nya']],
  'tta-varga':  [['ಟ', 'ṭa', 'tta'], ['ಠ', 'ṭha', 'ttha'], ['ಡ', 'ḍa', 'dda'], ['ಢ', 'ḍha', 'ddha'], ['ಣ', 'ṇa', 'nna']],
  'ta-varga':   [['ತ', 'ta', 'ta'], ['ಥ', 'tha', 'tha'], ['ದ', 'da', 'da'], ['ಧ', 'dha', 'dha'], ['ನ', 'na', 'na']],
  'pa-varga':   [['ಪ', 'pa', 'pa'], ['ಫ', 'pha', 'pha'], ['ಬ', 'ba', 'ba'], ['ಭ', 'bha', 'bha'], ['ಮ', 'ma', 'ma']],
  'avargeeya':  [['ಯ', 'ya', 'ya'], ['ರ', 'ra', 'ra'], ['ಲ', 'la', 'la'], ['ವ', 'va', 'va'], ['ಶ', 'śa', 'sha'], ['ಷ', 'ṣa', 'ssha'], ['ಸ', 'sa', 'sa'], ['ಹ', 'ha', 'ha'], ['ಳ', 'ḷa', 'lla']],
};

// Vowel signs (matras) for kagunita. [ sign, vowelRoman, idSuffix ]
const VOWEL_SIGNS = [
  ['ಾ', 'ā', 'aa'], ['ಿ', 'i', 'i'], ['ೀ', 'ī', 'ii'], ['ು', 'u', 'u'], ['ೂ', 'ū', 'uu'],
  ['ೃ', 'r̥', 'ru'], ['ೆ', 'e', 'e'], ['ೇ', 'ē', 'ee'], ['ೈ', 'ai', 'ai'],
  ['ೊ', 'o', 'o'], ['ೋ', 'ō', 'oo'], ['ೌ', 'au', 'au'],
];

// ── Builders ─────────────────────────────────────────────────────────────────
function buildBase() {
  const out = [];
  for (const [glyph, roman, id] of VOWELS) {
    out.push({ id, glyph, roman, category: 'vowel', group: 'vowels' });
  }
  for (const [glyph, roman, id] of YOGAVAAHAKA) {
    out.push({ id, glyph, roman, category: 'yogavaahaka', group: 'yogavaahaka' });
  }
  for (const [group, list] of Object.entries(CONSONANT_GROUPS)) {
    for (const [glyph, roman, id] of list) {
      out.push({ id, glyph, roman, category: 'consonant', group });
    }
  }
  return out;
}

// Kagunita: each consonant × each non-inherent vowel sign (M3). The bare
// consonant already covers the inherent 'a', so it is not repeated here.
function buildKagunita() {
  const out = [];
  for (const list of Object.values(CONSONANT_GROUPS)) {
    for (const [cGlyph, cRoman, cId] of list) {
      const stem = cRoman.replace(/a$/, ''); // "ka" -> "k", "ṅa" -> "ṅ"
      for (const [sign, vRoman, suffix] of VOWEL_SIGNS) {
        out.push({
          id: `${cId}_${suffix}`,
          glyph: cGlyph + sign,
          roman: stem + vRoman,
          category: 'kagunita',
          group: `${cId}-kagunita`,
        });
      }
    }
  }
  return out;
}

// ── Emit ─────────────────────────────────────────────────────────────────────
function main() {
  // Base (vowels + consonants) and the kagunita grid are always generated.
  // Ottakshara (conjuncts) will arrive in M4 behind --all.
  const characters = buildBase().concat(buildKagunita());

  // Sanity: ids must be unique.
  const seen = new Set();
  for (const c of characters) {
    if (seen.has(c.id)) throw new Error(`Duplicate character id: ${c.id}`);
    seen.add(c.id);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const outFile = path.join(dataDir, 'characters.json');
  const payload = { generatedAt: new Date().toISOString(), count: characters.length, characters };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${characters.length} characters to ${outFile}`);
}

main();
