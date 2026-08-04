#!/usr/bin/env node
'use strict';

/**
 * Builds data/dictionary_*.json lookups for Kannada, Japanese, and German.
 *
 * Usage:
 *   node scripts/build-dictionary.js --lang=kn
 *   node scripts/build-dictionary.js --lang=ja
 *   node scripts/build-dictionary.js --lang=de
 *   node scripts/build-dictionary.js --all (default)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Kannada (Alar) ---
const ALAR_SHA = '8651ccf8e92184ca17e234eeb6c947d8d52dd5c4';
const ALAR_URL = `https://raw.githubusercontent.com/alar-dict/data/${ALAR_SHA}/alar.yml`;
const KN_OUT = path.join(DATA_DIR, 'dictionary_kn.json');

function cleanKannadaGloss(s) {
  let g = s.trim().replace(/^["']|["']$/g, '');
  if (g.startsWith('=')) return '';          // cross-reference, not a gloss
  g = g.split(/;| - /)[0].trim();            // first sense / clause
  g = g.replace(/\s*\([^)]*\)/g, '').trim(); // drop parenthetical notes
  g = g.replace(/^(a|an|the) /i, '');        // drop leading article for brevity
  if (!g) return '';
  if (g.length > 48) g = g.slice(0, 48).replace(/\s+\S*$/, '') + '…';
  return g;
}

function buildKannadaDict() {
  console.log('Downloading/Building Kannada dictionary from Alar (this may take a minute, ~41 MB)...');
  return new Promise((resolve, reject) => {
    const dict = Object.create(null);
    let curWord = null;
    let gotDef = false;

    function addSense(word, gloss) {
      const g = cleanKannadaGloss(gloss);
      if (!g) return false;
      if (!dict[word]) dict[word] = g;
      return true;
    }

    function parseLine(line) {
      if (line.startsWith('  entry: ')) {           // headword (2-space indent)
        curWord = line.slice(9).trim().replace(/^["']|["']$/g, '');
        gotDef = false;
      } else if (line.startsWith('    entry: ')) {   // definition (4-space indent)
        if (curWord && !gotDef && addSense(curWord, line.slice(11))) gotDef = true;
      }
    }

    https.get(ALAR_URL, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Kannada download failed with status ${res.statusCode}`));
      }
      const rl = readline.createInterface({ input: res });
      rl.on('line', parseLine);
      rl.on('close', () => {
        fs.writeFileSync(KN_OUT, JSON.stringify(dict, null, 2));
        const mb = (fs.statSync(KN_OUT).size / 1e6).toFixed(2);
        console.log(`Wrote ${Object.keys(dict).length} Kannada entries to ${KN_OUT} (${mb} MB)`);
        resolve();
      });
    }).on('error', reject);
  });
}

// --- Japanese (JLPT N5 Words) ---
// Pinned to a specific commit to prevent supply-chain attacks (same policy as Alar/Kannada).
const JA_SHA = 'cc5e3480b3d6195677cbbfc525ba39ef533bf1b2';
const JA_URL = `https://raw.githubusercontent.com/9elt/jlpt-n5-word-list/${JA_SHA}/src/wordlist.js`;
const JA_OUT = path.join(DATA_DIR, 'dictionary_ja.json');

function buildJapaneseDict() {
  console.log('Downloading/Building Japanese dictionary...');
  return new Promise((resolve, reject) => {
    https.get(JA_URL, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Japanese download failed with status ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          // Extract the array contents
          const startIdx = body.indexOf('[');
          const endIdx = body.lastIndexOf(']') + 1;
          if (startIdx === -1 || endIdx === -1) {
            throw new Error('Could not find wordlist array in javascript file');
          }
          const jsonText = body.substring(startIdx, endIdx);
          
          // Evaluate safely
          const list = JSON.parse(jsonText);
          const dict = Object.create(null);
          
          for (const item of list) {
            if (!item || !item.examples) continue;
            
            // The first line of example field is typically the English meaning
            const parts = item.examples.split('\n');
            let gloss = parts[0].trim();
            if (!gloss) continue;
            
            // Clean up leading dots/spaces (e.g. "... station" -> "station")
            gloss = gloss.replace(/^\.{2,}\s*/, '').trim();
            
            // Add entries for both Kanji (if exists) and Hiragana
            if (item.kanji) {
              const cleanKanji = item.kanji.replace(/^～/, '');
              dict[cleanKanji] = gloss;
            }
            if (item.hiragana) {
              const cleanHira = item.hiragana.replace(/^～/, '');
              dict[cleanHira] = gloss;
            }
          }
          
          fs.writeFileSync(JA_OUT, JSON.stringify(dict, null, 2));
          const kb = (fs.statSync(JA_OUT).size / 1024).toFixed(1);
          console.log(`Wrote ${Object.keys(dict).length} Japanese entries to ${JA_OUT} (${kb} KB)`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// --- German (Mr. Honey's German-English Dictionary) ---
const DE_SHA = 'c3e495175d86f6680b23dc45cf5c4f4e2fd0c5c9';
const DE_URL = `https://raw.githubusercontent.com/hathibelagal/German-English-JSON-Dictionary/${DE_SHA}/german_english.json`;
const DE_OUT = path.join(DATA_DIR, 'dictionary_de.json');

function buildGermanDict() {
  console.log('Downloading/Building German dictionary...');
  return new Promise((resolve, reject) => {
    https.get(DE_URL, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`German download failed with status ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const rawDict = JSON.parse(body);
          const dict = Object.create(null);
          
          for (const [word, gloss] of Object.entries(rawDict)) {
            // German words could be capitalized (nouns) or lowercase (verbs/adjectives).
            // Clean up and store
            let cleanGloss = gloss.trim();
            if (cleanGloss.startsWith('to ')) {
              cleanGloss = cleanGloss.slice(3).trim(); // "to open" -> "open"
            }
            dict[word] = cleanGloss;
            // Only add lowercase alias when it won't overwrite a distinct entry
            // (German: Sie/sie, Weg/weg have different meanings)
            if (!dict[word.toLowerCase()]) {
              dict[word.toLowerCase()] = cleanGloss;
            }
          }
          
          fs.writeFileSync(DE_OUT, JSON.stringify(dict, null, 2));
          const kb = (fs.statSync(DE_OUT).size / 1024).toFixed(1);
          console.log(`Wrote ${Object.keys(dict).length} German entries to ${DE_OUT} (${kb} KB)`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// --- Runner ---
async function main() {
  const args = process.argv.slice(2);
  let lang = 'all';
  for (const arg of args) {
    if (arg.startsWith('--lang=')) {
      lang = arg.slice(7).toLowerCase();
    } else if (arg === '--all') {
      lang = 'all';
    }
  }

  try {
    if (lang === 'kn') {
      await buildKannadaDict();
    } else if (lang === 'ja') {
      await buildJapaneseDict();
    } else if (lang === 'de') {
      await buildGermanDict();
    } else {
      // Build all, but skip Kannada if it's already generated (since it takes time and is 41MB)
      if (!fs.existsSync(KN_OUT)) {
        await buildKannadaDict();
      } else {
        console.log('Kannada dictionary already built. Skipping (use --lang=kn to rebuild).');
      }
      await buildJapaneseDict();
      await buildGermanDict();
    }
  } catch (e) {
    console.error('Error building dictionaries:', e);
    process.exit(1);
  }
}

main();
