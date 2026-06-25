#!/usr/bin/env node
'use strict';

/**
 * Builds data/dictionary.json — a compact Kannada → English lookup — from the
 * open Alar dictionary (https://github.com/alar-dict/data, CC-licensed, ~150k
 * entries). Streams the 41 MB YAML line-by-line (no YAML lib needed) and keeps a
 * short gloss per headword.
 *
 *   node scripts/build-dictionary.js          # download + build
 *   ALAR_YML=/path/to/alar.yml node …         # build from a local copy
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Pinned to a specific commit so a branch rename (e.g. master→main) or content
// drift can't break the build. To refresh: bump this SHA to the latest commit at
// https://github.com/alar-dict/data and re-run.
const ALAR_SHA = '8651ccf8e92184ca17e234eeb6c947d8d52dd5c4';
const URL = `https://raw.githubusercontent.com/alar-dict/data/${ALAR_SHA}/alar.yml`;
const OUT = path.join(__dirname, '..', 'data', 'dictionary.json');

const dict = Object.create(null);
let curWord = null;
let gotDef = false;

function cleanGloss(s) {
  let g = s.trim().replace(/^["']|["']$/g, '');
  if (g.startsWith('=')) return '';          // cross-reference, not a gloss
  g = g.split(/;| - /)[0].trim();            // first sense / clause
  g = g.replace(/\s*\([^)]*\)/g, '').trim(); // drop parenthetical notes
  g = g.replace(/^(a|an|the) /i, '');        // drop leading article for brevity
  if (!g) return '';
  if (g.length > 48) g = g.slice(0, 48).replace(/\s+\S*$/, '') + '…';
  return g;
}

// Keep the first valid (non cross-reference) gloss per headword.
function addSense(word, gloss) {
  const g = cleanGloss(gloss);
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

function finish() {
  fs.writeFileSync(OUT, JSON.stringify(dict));
  const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
  console.log(`Wrote ${Object.keys(dict).length} entries to ${OUT} (${mb} MB)`);
}

const local = process.env.ALAR_YML;
if (local) {
  const rl = readline.createInterface({ input: fs.createReadStream(local) });
  rl.on('line', parseLine);
  rl.on('close', finish);
} else {
  console.log('Downloading Alar dictionary…');
  https.get(URL, (res) => {
    if (res.statusCode !== 200) { console.error('HTTP', res.statusCode); process.exit(1); }
    const rl = readline.createInterface({ input: res });
    rl.on('line', parseLine);
    rl.on('close', finish);
  }).on('error', (e) => { console.error(e); process.exit(1); });
}
