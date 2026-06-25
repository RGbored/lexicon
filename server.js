'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

// Progress is keyed by generic item id (a character today, a word later) so the
// same store works once the Reading & Vocabulary module lands. See DESIGN.md §3.
const DEFAULT_PROGRESS = {
  items: {},                                   // id -> { strength, lastSeen, due }
  units: {},                                   // unit -> { lessonsDone }
  settings: { romanizationStyle: 'iso15919' },
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
  console.log(`Lexicon running at http://localhost:${PORT}`);
});
