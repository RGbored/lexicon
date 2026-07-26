'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const TEXTS_FILE = path.join(DATA_DIR, 'texts.json');            // bundled samples

const SESSION_COOKIE = 'sid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year, in seconds

db.init(); // create tables, seed default user, migrate legacy JSON files

app.use(express.json());
// no-cache so the browser revalidates every load and always picks up the latest
// deploy (a normal refresh suffices; no hard-refresh needed on mobile).
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// --- Cookies / current user --------------------------------------------------

// Minimal cookie parsing (no cookie-parser dependency).
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Resolve the request's user: a valid session cookie, else the default user so
// local/single-user use stays login-free (DESIGN.md §9, "frictionless default").
app.use((req, res, next) => {
  const token = getCookie(req, SESSION_COOKIE);
  req.sessionToken = token;
  const uid = db.getUserIdByToken(token);
  req.userId = uid || db.getDefaultUserId();
  next();
});

// --- Auth --------------------------------------------------------------------

app.get('/api/me', (req, res) => {
  const user = db.getUser(req.userId);
  res.json({ username: user.username, isDefault: !!user.is_default });
});

app.post('/api/signup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const user = db.createUser(username, password);
  if (!user) return res.status(409).json({ error: 'That username is taken.' });
  setSessionCookie(res, db.createSession(user.id));
  res.json({ username: user.username, isDefault: false });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.verifyUser(username, password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password.' });
  setSessionCookie(res, db.createSession(user.id));
  res.json({ username: user.username, isDefault: !!user.is_default });
});

app.post('/api/logout', (req, res) => {
  db.deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// --- Characters (shared, static) --------------------------------------------

app.get('/api/characters', (req, res) => {
  const lang = req.query.lang || 'kn';
  const charFile = path.join(DATA_DIR, `characters_${lang}.json`);
  fs.readFile(charFile, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: `Character data for language '${lang}' not generated. Run \`npm run generate\`.` });
    }
    res.type('application/json').send(data);
  });
});

// --- Progress (per user) -----------------------------------------------------

app.get('/api/progress', (req, res) => {
  res.json(db.getProgress(req.userId));
});

app.post('/api/progress', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid progress payload.' });
  }
  try {
    db.saveProgress(req.userId, body);
    res.json({ ok: true });
  } catch (e) {
    console.error('saveProgress failed:', e.message);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

// --- Dictionary / glossary helpers -------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Dictionaries loaded once at startup; used to auto-fill meanings for imported texts.
const DICTIONARY_KN = readJson(path.join(DATA_DIR, 'dictionary_kn.json'), {});
const DICTIONARY_JA = readJson(path.join(DATA_DIR, 'dictionary_ja.json'), {});
const DICTIONARY_DE = readJson(path.join(DATA_DIR, 'dictionary_de.json'), {});

console.log(`Dictionaries loaded: Kannada (${Object.keys(DICTIONARY_KN).length}), Japanese (${Object.keys(DICTIONARY_JA).length}), German (${Object.keys(DICTIONARY_DE).length})`);

const SUFFIXES_KN = ['ಗಳನ್ನು', 'ಗಳಲ್ಲಿ', 'ಗಳಿಗೆ', 'ವನ್ನು', 'ಯನ್ನು', 'ನ್ನು', 'ಗಳು', 'ಗಳ', 'ದಲ್ಲಿ', 'ಯಲ್ಲಿ', 'ಅಲ್ಲಿ', 'ಲ್ಲಿ', 'ದಿಂದ', 'ಯಿಂದ', 'ಇಂದ', 'ಕ್ಕೆ', 'ಗೆ'];
const SUFFIXES_DE = ['en', 'em', 'er', 'es', 'e', 'n'];

function lookupMeaning(word, lang = 'kn') {
  const dict = lang === 'ja' ? DICTIONARY_JA : lang === 'de' ? DICTIONARY_DE : DICTIONARY_KN;
  
  if (dict[word]) return dict[word];
  
  // Case-insensitive lookup (important for German/Japanese input)
  const lowerWord = word.toLowerCase();
  if (dict[lowerWord]) return dict[lowerWord];
  
  if (lang === 'kn') {
    for (const suf of SUFFIXES_KN) {
      if (word.length > suf.length + 1 && word.endsWith(suf)) {
        const base = word.slice(0, -suf.length);
        if (dict[base]) return dict[base];
      }
    }
  } else if (lang === 'de') {
    for (const suf of SUFFIXES_DE) {
      if (word.length > suf.length + 2 && word.endsWith(suf)) {
        const base = word.slice(0, -suf.length);
        if (dict[base]) return dict[base];
        if (dict[base.toLowerCase()]) return dict[base.toLowerCase()];
      }
    }
  }
  return '';
}

function tokenize(textStr, lang = 'kn') {
  if (lang === 'ja') {
    const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
    return [...segmenter.segment(textStr)]
      .filter(s => s.isWordLike)
      .map(s => s.segment);
  } else if (lang === 'de') {
    return textStr.match(/[A-Za-zÄäÖöÜüß]+/g) || [];
  } else {
    return textStr.match(/[ಀ-೿]+/g) || [];
  }
}

function buildGlossary(body, lang = 'kn') {
  const glossary = {};
  const tokens = tokenize(body, lang);
  for (const w of new Set(tokens)) {
    const m = lookupMeaning(w, lang);
    if (m) glossary[w] = m;
  }
  return glossary;
}

// --- Texts (bundled shared + per-user imported) -----------------------------

app.get('/api/texts', (req, res) => {
  const lang = req.query.lang || 'kn';
  const bundled = readJson(TEXTS_FILE, { texts: [] }).texts || [];
  const filteredBundled = bundled.filter(t => (t.lang || 'kn') === lang);
  const user = db.getUserTexts(req.userId, lang);
  res.json({ texts: [...filteredBundled, ...user] });
});

app.post('/api/texts', (req, res) => {
  const { title, body, lang = 'kn' } = req.body || {};
  if (!body || typeof body !== 'string') {
    return res.status(400).json({ error: 'Body must be a string.' });
  }
  
  // Validation based on script/language
  let isValid = false;
  if (lang === 'ja') {
    isValid = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/.test(body);
  } else if (lang === 'de') {
    isValid = /[a-zA-ZäöüÄÖÜß]/.test(body);
  } else {
    isValid = /[ಀ-೿]/.test(body);
  }

  if (!isValid) {
    return res.status(400).json({ error: `Body must contain text matching target language '${lang}'.` });
  }

  try {
    const text = db.addText(req.userId, {
      title: (typeof title === 'string' && title.trim()) || 'Untitled',
      source: 'imported',
      body,
      glossary: buildGlossary(body, lang),
      lang,
    });
    res.json({ text });
  } catch (e) {
    console.error('addText failed:', e.message);
    res.status(500).json({ error: 'Could not save text.' });
  }
});

app.listen(PORT, () => {
  console.log(`Lexicon running at http://localhost:${PORT}`);
});
