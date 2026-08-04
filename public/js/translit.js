'use strict';

/**
 * Transliteration support for Kannada and Japanese.
 * - Kannada: abugida rules (inherent 'a', virama suppression).
 * - Japanese: Hiragana and Katakana to Romaji (Hepburn-style).
 * - German: Returns the word as-is (already Latin script).
 */
const Translit = (() => {
  // Kannada tables
  const KN_VOWELS = {
    'ಅ': 'a', 'ಆ': 'ā', 'ಇ': 'i', 'ಈ': 'ī', 'ಉ': 'u', 'ಊ': 'ū', 'ಋ': 'r̥',
    'ಎ': 'e', 'ಏ': 'ē', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'ō', 'ಔ': 'au',
  };
  const KN_CONS = {
    'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'ṅ',
    'ಚ': 'c', 'ಛ': 'ch', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'ñ',
    'ಟ': 'ṭ', 'ಠ': 'ṭh', 'ಡ': 'ḍ', 'ಢ': 'ḍh', 'ಣ': 'ṇ',
    'ತ': 't', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
    'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
    'ಯ': 'y', 'ರ': 'r', 'ಲ': 'l', 'ವ': 'v',
    'ಶ': 'ś', 'ಷ': 'ṣ', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'ḷ',
  };
  const KN_SIGNS = {
    'ಾ': 'ā', 'ಿ': 'i', 'ೀ': 'ī', 'ು': 'u', 'ೂ': 'ū', 'ೃ': 'r̥',
    'ೆ': 'e', 'ೇ': 'ē', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'ō', 'ೌ': 'au',
  };
  const KN_VIRAMA = '್';
  const KN_ANUSVARA = 'ಂ';
  const KN_VISARGA = 'ಃ';

  function knWord(s) {
    let out = '';
    const a = [...s];
    for (let i = 0; i < a.length; i++) {
      const ch = a[i];
      if (KN_VOWELS[ch]) { out += KN_VOWELS[ch]; continue; }
      if (KN_CONS[ch]) {
        const next = a[i + 1];
        if (next === KN_VIRAMA) { out += KN_CONS[ch]; i += 1; }
        else if (KN_SIGNS[next]) { out += KN_CONS[ch] + KN_SIGNS[next]; i += 1; }
        else { out += KN_CONS[ch] + 'a'; }
        continue;
      }
      if (ch === KN_ANUSVARA) { out += 'ṁ'; continue; }
      if (ch === KN_VISARGA) { out += 'ḥ'; continue; }
    }
    return out;
  }

  // Japanese tables
  const JA_MAP = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',

    'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
    'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
    'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
    'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
    'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
    'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
    'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
    'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
    'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
    'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
    'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
    'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
    'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
    'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
    'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
  };

  const JA_YOON = {
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
    'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo'
  };

  function jaWord(s) {
    let out = '';
    const chars = [...s];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const next = chars[i + 1];

      // Sokuon (double consonant)
      if (ch === 'っ' || ch === 'ッ') {
        if (next && JA_MAP[next]) {
          const nextRomaji = JA_MAP[next];
          out += nextRomaji[0];
        }
        continue;
      }

      // Yōon combination (e.g. しゃ -> sha, きょ -> kyo)
      if (next && JA_YOON[next]) {
        const base = JA_MAP[ch] || '';
        const y = JA_YOON[next];
        let stem = base;
        if (base.endsWith('i')) stem = base.slice(0, -1);
        
        if (stem === 'sh') out += 'sha';
        else if (stem === 'ch') out += 'cha';
        else if (stem === 'j') out += 'ja';
        else out += stem + y;
        
        i++;
        continue;
      }

      if (JA_MAP[ch]) {
        out += JA_MAP[ch];
      } else {
        out += ch;
      }
    }
    return out;
  }

  function word(s) {
    const activeLang = Data.progressData()?.settings?.targetLang || 'kn';
    if (activeLang === 'kn') {
      return knWord(s);
    } else if (activeLang === 'ja') {
      return jaWord(s);
    } else {
      return s; // German is already Latin script
    }
  }

  return { word };
})();
