#!/usr/bin/env node
'use strict';

/**
 * Generates character sets for Kannada, Japanese, and German into data/characters_*.json.
 *
 * Each character: { id, glyph, roman, category, group }
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Kannada Data
// ============================================================================

const VOWELS_KN = [
  ['ಅ', 'a', 'a'], ['ಆ', 'ā', 'aa'], ['ಇ', 'i', 'i'], ['ಈ', 'ī', 'ii'],
  ['ಉ', 'u', 'u'], ['ಊ', 'ū', 'uu'], ['ಋ', 'r̥', 'ru'],
  ['ಎ', 'e', 'e'], ['ಏ', 'ē', 'ee'], ['ಐ', 'ai', 'ai'],
  ['ಒ', 'o', 'o'], ['ಓ', 'ō', 'oo'], ['ಔ', 'au', 'au'],
];

const YOGAVAAHAKA_KN = [
  ['ಅಂ', 'aṁ', 'am'], ['ಅಃ', 'aḥ', 'ah'],
];

const CONSONANT_GROUPS_KN = {
  'ka-varga':   [['ಕ', 'ka', 'ka'], ['ಖ', 'kha', 'kha'], ['ಗ', 'ga', 'ga'], ['ಘ', 'gha', 'gha'], ['ಙ', 'ṅa', 'nga']],
  'ca-varga':   [['ಚ', 'ca', 'ca'], ['ಛ', 'cha', 'cha'], ['ಜ', 'ja', 'ja'], ['ಝ', 'jha', 'jha'], ['ಞ', 'ña', 'nya']],
  'tta-varga':  [['ಟ', 'ṭa', 'tta'], ['ಠ', 'ṭha', 'ttha'], ['ಡ', 'ḍa', 'dda'], ['ಢ', 'ḍha', 'ddha'], ['ಣ', 'ṇa', 'nna']],
  'ta-varga':   [['ತ', 'ta', 'ta'], ['ಥ', 'tha', 'tha'], ['ದ', 'da', 'da'], ['ಧ', 'dha', 'dha'], ['ನ', 'na', 'na']],
  'pa-varga':   [['ಪ', 'pa', 'pa'], ['ಫ', 'pha', 'pha'], ['ಬ', 'ba', 'ba'], ['ಭ', 'bha', 'bha'], ['ಮ', 'ma', 'ma']],
  'avargeeya':  [['ಯ', 'ya', 'ya'], ['ರ', 'ra', 'ra'], ['ಲ', 'la', 'la'], ['ವ', 'va', 'va'], ['ಶ', 'śa', 'sha'], ['ಷ', 'ṣa', 'ssha'], ['ಸ', 'sa', 'sa'], ['ಹ', 'ha', 'ha'], ['ಳ', 'ḷa', 'lla']],
};

const VOWEL_SIGNS_KN = [
  ['ಾ', 'ā', 'aa'], ['ಿ', 'i', 'i'], ['ೀ', 'ī', 'ii'], ['ು', 'u', 'u'], ['ೂ', 'ū', 'uu'],
  ['ೃ', 'r̥', 'ru'], ['ೆ', 'e', 'e'], ['ೇ', 'ē', 'ee'], ['ೈ', 'ai', 'ai'],
  ['ೊ', 'o', 'o'], ['ೋ', 'ō', 'oo'], ['ೌ', 'au', 'au'],
];

function buildKannada() {
  const out = [];
  for (const [glyph, roman, id] of VOWELS_KN) {
    out.push({ id, glyph, roman, category: 'vowel', group: 'vowels' });
  }
  for (const [glyph, roman, id] of YOGAVAAHAKA_KN) {
    out.push({ id, glyph, roman, category: 'yogavaahaka', group: 'yogavaahaka' });
  }
  for (const [group, list] of Object.entries(CONSONANT_GROUPS_KN)) {
    for (const [glyph, roman, id] of list) {
      out.push({ id, glyph, roman, category: 'consonant', group });
    }
  }
  
  // Kagunita: each consonant × each non-inherent vowel sign
  for (const list of Object.values(CONSONANT_GROUPS_KN)) {
    for (const [cGlyph, cRoman, cId] of list) {
      const stem = cRoman.replace(/a$/, ''); // "ka" -> "k"
      for (const [sign, vRoman, suffix] of VOWEL_SIGNS_KN) {
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

// ============================================================================
// Japanese Data
// ============================================================================

const HIRAGANA_BASE = [
  // Vowels
  ['あ', 'a', 'a', 'vowels'], ['い', 'i', 'i', 'vowels'], ['う', 'u', 'u', 'vowels'], ['え', 'e', 'e', 'vowels'], ['お', 'o', 'o', 'vowels'],
  // K-row
  ['か', 'ka', 'ka', 'k-row'], ['き', 'ki', 'ki', 'k-row'], ['く', 'ku', 'ku', 'k-row'], ['け', 'ke', 'ke', 'k-row'], ['こ', 'ko', 'ko', 'k-row'],
  // S-row
  ['さ', 'sa', 'sa', 's-row'], ['し', 'shi', 'shi', 's-row'], ['す', 'su', 'su', 's-row'], ['せ', 'se', 'se', 's-row'], ['そ', 'so', 'so', 's-row'],
  // T-row
  ['た', 'ta', 'ta', 't-row'], ['ち', 'chi', 'chi', 't-row'], ['つ', 'tsu', 'tsu', 't-row'], ['て', 'te', 'te', 't-row'], ['と', 'to', 'to', 't-row'],
  // N-row
  ['な', 'na', 'na', 'n-row'], ['に', 'ni', 'ni', 'n-row'], ['ぬ', 'nu', 'nu', 'n-row'], ['ね', 'ne', 'ne', 'n-row'], ['の', 'no', 'no', 'n-row'],
  // H-row
  ['は', 'ha', 'ha', 'h-row'], ['ひ', 'hi', 'hi', 'h-row'], ['ふ', 'fu', 'fu', 'h-row'], ['へ', 'he', 'he', 'h-row'], ['ほ', 'ho', 'ho', 'h-row'],
  // M-row
  ['ま', 'ma', 'ma', 'm-row'], ['み', 'mi', 'mi', 'm-row'], ['む', 'mu', 'mu', 'm-row'], ['め', 'me', 'me', 'm-row'], ['も', 'mo', 'mo', 'm-row'],
  // Y-row (only 3)
  ['や', 'ya', 'ya', 'y-row'], ['ゆ', 'yu', 'yu', 'y-row'], ['よ', 'yo', 'yo', 'y-row'],
  // R-row
  ['ら', 'ra', 'ra', 'r-row'], ['り', 'ri', 'ri', 'r-row'], ['る', 'ru', 'ru', 'r-row'], ['れ', 're', 're', 'r-row'], ['ろ', 'ro', 'ro', 'r-row'],
  // W-row & N
  ['わ', 'wa', 'wa', 'w-row'], ['を', 'wo', 'wo', 'w-row'], ['ん', 'n', 'n', 'w-row'],
  // Dakuten
  ['が', 'ga', 'ga', 'dakuten'], ['ぎ', 'gi', 'gi', 'dakuten'], ['ぐ', 'gu', 'gu', 'dakuten'], ['げ', 'ge', 'ge', 'dakuten'], ['ご', 'go', 'go', 'dakuten'],
  ['ざ', 'za', 'za', 'dakuten'], ['じ', 'ji', 'ji', 'dakuten'], ['ず', 'zu', 'zu', 'dakuten'], ['ぜ', 'ze', 'ze', 'dakuten'], ['zo', 'zo', 'zo', 'dakuten'], // Wait, glyph 'ぞ' was typo 'zo'
  ['だ', 'da', 'da', 'dakuten'], ['ぢ', 'ji', 'dji', 'dakuten'], ['づ', 'zu', 'dzu', 'dakuten'], ['で', 'de', 'de', 'dakuten'], ['ど', 'do', 'do', 'dakuten'],
  ['ば', 'ba', 'ba', 'dakuten'], ['び', 'bi', 'bi', 'dakuten'], ['ぶ', 'bu', 'bu', 'dakuten'], ['べ', 'be', 'be', 'dakuten'], ['ぼ', 'bo', 'bo', 'dakuten'],
  // Handakuten
  ['ぱ', 'pa', 'pa', 'handakuten'], ['ぴ', 'pi', 'pi', 'handakuten'], ['ぷ', 'pu', 'pu', 'handakuten'], ['ぺ', 'pe', 'pe', 'handakuten'], ['ぽ', 'po', 'po', 'handakuten'],
];

// Fix the typo in base list
for (let item of HIRAGANA_BASE) {
  if (item[2] === 'zo') item[0] = 'ぞ';
}

function hiraganaToKatakana(h) {
  const code = h.charCodeAt(0);
  if (code >= 0x3041 && code <= 0x3096) {
    return String.fromCharCode(code + 0x60);
  }
  return h;
}

function buildJapanese() {
  const out = [];
  
  // 1. Hiragana
  for (const [glyph, roman, idSuffix, groupSuffix] of HIRAGANA_BASE) {
    out.push({
      id: `ja:h_${idSuffix}`,
      glyph,
      roman,
      category: 'hiragana',
      group: `hiragana-${groupSuffix}`
    });
  }
  
  // 2. Katakana
  for (const [hGlyph, roman, idSuffix, groupSuffix] of HIRAGANA_BASE) {
    const kGlyph = [...hGlyph].map(hiraganaToKatakana).join('');
    out.push({
      id: `ja:k_${idSuffix}`,
      glyph: kGlyph,
      roman,
      category: 'katakana',
      group: `katakana-${groupSuffix}`
    });
  }
  
  return out;
}

// ============================================================================
// German Data
// ============================================================================

const GERMAN_BASE = [
  // Group 1: A-E
  ['A a', 'ah', 'a', 'group1'], ['B b', 'beh', 'b', 'group1'], ['C c', 'tseh', 'c', 'group1'], ['D d', 'deh', 'd', 'group1'], ['E e', 'eh', 'e', 'group1'],
  // Group 2: F-J
  ['F f', 'eff', 'f', 'group2'], ['G g', 'geh', 'g', 'group2'], ['H h', 'hah', 'h', 'group2'], ['I i', 'eeh', 'i', 'group2'], ['J j', 'yot', 'j', 'group2'],
  // Group 3: K-O
  ['K k', 'kah', 'k', 'group3'], ['L l', 'ell', 'l', 'group3'], ['M m', 'emm', 'm', 'group3'], ['N n', 'enn', 'n', 'group3'], ['O o', 'oh', 'o', 'group3'],
  // Group 4: P-T
  ['P p', 'peh', 'p', 'group4'], ['Q q', 'koo', 'q', 'group4'], ['R r', 'err', 'r', 'group4'], ['S s', 'ess', 's', 'group4'], ['T t', 'teh', 't', 'group4'],
  // Group 5: U-Z
  ['U u', 'ooh', 'u', 'group5'], ['V v', 'fow', 'v', 'group5'], ['W w', 'veh', 'w', 'group5'], ['X x', 'iks', 'x', 'group5'], ['Y y', 'ypsilon', 'y', 'group5'], ['Z z', 'tsett', 'z', 'group5'],
  // Group 6: Umlauts
  ['Ä ä', 'ae', 'ae', 'umlauts'], ['Ö ö', 'oe', 'oe', 'umlauts'], ['Ü ü', 'ue', 'ue', 'umlauts'], ['ß', 'ess-tsett', 'ss', 'umlauts'],
];

function buildGerman() {
  const out = [];
  for (const [glyph, roman, idSuffix, groupSuffix] of GERMAN_BASE) {
    out.push({
      id: `de:${idSuffix}`,
      glyph,
      roman,
      category: groupSuffix === 'umlauts' ? 'umlauts' : 'alphabet',
      group: `de-${groupSuffix}`
    });
  }
  return out;
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const sets = {
    kn: buildKannada(),
    ja: buildJapanese(),
    de: buildGerman(),
  };

  for (const [lang, characters] of Object.entries(sets)) {
    // Sanity check
    const seen = new Set();
    for (const c of characters) {
      if (seen.has(c.id)) {
        throw new Error(`Duplicate character id in ${lang}: ${c.id}`);
      }
      seen.add(c.id);
    }

    const outFile = path.join(dataDir, `characters_${lang}.json`);
    const payload = {
      generatedAt: new Date().toISOString(),
      count: characters.length,
      characters,
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${characters.length} characters for ${lang} to ${outFile}`);
  }
}

main();
