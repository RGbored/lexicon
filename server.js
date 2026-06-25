'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const TEXTS_FILE = path.join(DATA_DIR, 'texts.json');            // bundled samples
const USER_TEXTS_FILE = path.join(DATA_DIR, 'texts-user.json');  // imported texts
const DICTIONARY_FILE = path.join(DATA_DIR, 'dictionary.json');  // Alar Kn→En

// Progress is keyed by generic item id (a character today, a word later) so the
// same store works once the Reading & Vocabulary module lands. See DESIGN.md §3.
const DEFAULT_PROGRESS = {
  items: {},                                   // id -> { lessons, seen, lastSeen, due }
  units: {},                                   // unit -> { lessonsDone }
  settings: { romanizationStyle: 'iso15919' },
};

app.use(express.json());
// no-cache so the browser revalidates every load and always picks up the latest
// deploy (a normal refresh suffices; no hard-refresh needed on mobile).
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

app.get('/api/characters', (req, res) => {
  fs.readFile(CHARACTERS_FILE, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Character data not generated. Run `npm run generate`.' });
    }
    res.type('application/json').send(data);
  });
});

app.get('/api/progress', (req, res) => {
  fs.readFile(PROGRESS_FILE, 'utf8', (err, data) => {
    if (err) return res.json(DEFAULT_PROGRESS); // none saved yet
    try {
      res.json(JSON.parse(data));
    } catch {
      res.json(DEFAULT_PROGRESS); // corrupt file -> start fresh rather than 500
    }
  });
});

app.post('/api/progress', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid progress payload.' });
  }
  fs.mkdir(DATA_DIR, { recursive: true }, (mkErr) => {
    if (mkErr) return res.status(500).json({ error: 'Could not prepare data directory.' });
    fs.writeFile(PROGRESS_FILE, JSON.stringify(body, null, 2), (wErr) => {
      if (wErr) return res.status(500).json({ error: 'Could not save progress.' });
      res.json({ ok: true });
    });
  });
});

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Kannada → English dictionary (built from Alar via `npm run dictionary`).
// Loaded once; used to auto-fill meanings for imported texts. Empty if not built.
const DICTIONARY = readJson(DICTIONARY_FILE, {});
console.log(`Dictionary: ${Object.keys(DICTIONARY).length} entries`);

// Common inflectional suffixes, longest first — best-effort stemming so inflected
// surface forms still resolve to their dictionary headword.
const SUFFIXES = ['ಗಳನ್ನು', 'ಗಳಲ್ಲಿ', 'ಗಳಿಗೆ', 'ವನ್ನು', 'ಯನ್ನು', 'ನ್ನು', 'ಗಳು', 'ಗಳ', 'ದಲ್ಲಿ', 'ಯಲ್ಲಿ', 'ಅಲ್ಲಿ', 'ಲ್ಲಿ', 'ದಿಂದ', 'ಯಿಂದ', 'ಇಂದ', 'ಕ್ಕೆ', 'ಗೆ'];
function lookupMeaning(word) {
  if (DICTIONARY[word]) return DICTIONARY[word];
  for (const suf of SUFFIXES) {
    if (word.length > suf.length + 1 && word.endsWith(suf)) {
      const base = word.slice(0, -suf.length);
      if (DICTIONARY[base]) return DICTIONARY[base];
    }
  }
  return '';
}
function buildGlossary(body) {
  const glossary = {};
  for (const w of new Set(body.match(/[ಀ-೿]+/g) || [])) {
    const m = lookupMeaning(w);
    if (m) glossary[w] = m;
  }
  return glossary;
}

// Bundled sample texts + any imported by the user.
app.get('/api/texts', (req, res) => {
  const bundled = readJson(TEXTS_FILE, { texts: [] }).texts || [];
  const user = readJson(USER_TEXTS_FILE, { texts: [] }).texts || [];
  res.json({ texts: [...bundled, ...user] });
});

app.post('/api/texts', (req, res) => {
  const { title, body } = req.body || {};
  if (!body || typeof body !== 'string' || !/[ಀ-೿]/.test(body)) {
    return res.status(400).json({ error: 'Body must contain Kannada text.' });
  }
  const store = readJson(USER_TEXTS_FILE, { texts: [] });
  if (!Array.isArray(store.texts)) store.texts = [];
  const text = {
    id: `user-${Date.now()}`,
    title: (typeof title === 'string' && title.trim()) || 'Untitled',
    source: 'imported',
    user: true,
    body,
    glossary: buildGlossary(body), // auto-filled from the bundled dictionary
  };
  store.texts.push(text);
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(USER_TEXTS_FILE, JSON.stringify(store, null, 2), (err) => {
      if (err) return res.status(500).json({ error: 'Could not save text.' });
      res.json({ text });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Lexicon running at http://localhost:${PORT}`);
});
