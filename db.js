'use strict';

/**
 * SQLite persistence for Lexicon (multi-user). See DESIGN.md §7.
 *
 * Uses Node's built-in `node:sqlite` (no native build — important for the
 * Termux/ARM target, where better-sqlite3 compiles awkwardly). The progress
 * object the frontend POSTs as one blob is decomposed into normalized tables
 * here and rebuilt on read, so the whole-blob GET/POST API stays unchanged.
 *
 * A seeded "default" user makes local/single-user use frictionless: any request
 * without a valid session cookie is treated as that user (see server.js).
 */

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'lexicon.db');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const USER_TEXTS_FILE = path.join(DATA_DIR, 'texts-user.json');

const DEFAULT_USERNAME = 'default';

let db = null;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  pw_hash    TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS progress_items (
  user_id   INTEGER NOT NULL,
  item_id   TEXT NOT NULL,
  lessons   INTEGER NOT NULL DEFAULT 0,
  seen      INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  due       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS units (
  user_id      INTEGER NOT NULL,
  unit_id      TEXT NOT NULL,
  lessons_done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, unit_id)
);
CREATE TABLE IF NOT EXISTS stats (
  user_id     INTEGER PRIMARY KEY,
  points      INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  last_day    INTEGER,
  freezes     INTEGER NOT NULL DEFAULT 0,
  freeze_week INTEGER
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           INTEGER PRIMARY KEY,
  romanization_style TEXT NOT NULL DEFAULT 'iso15919'
);
CREATE TABLE IF NOT EXISTS ottakshara (
  user_id  INTEGER NOT NULL,
  position INTEGER NOT NULL,
  glyph    TEXT NOT NULL,
  PRIMARY KEY (user_id, position)
);
CREATE TABLE IF NOT EXISTS texts (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER,
  title    TEXT,
  source   TEXT,
  body     TEXT,
  glossary TEXT
);
`;

// ---------------------------------------------------------------------------
// Passwords (scrypt, via node:crypto — no native dep)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ---------------------------------------------------------------------------
// Init + migration
// ---------------------------------------------------------------------------

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  // Seed the default (frictionless) user if it doesn't exist yet.
  let def = db.prepare('SELECT id FROM users WHERE is_default = 1').get();
  if (!def) {
    const randomPw = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO users (username, pw_hash, is_default, created) VALUES (?, ?, 1, ?)')
      .run(DEFAULT_USERNAME, hashPassword(randomPw), Date.now());
    def = db.prepare('SELECT id FROM users WHERE is_default = 1').get();
  }
  migrateLegacyFiles(def.id);
  return db;
}

// One-time import of the legacy single-user JSON files into the default user.
// Idempotent: only runs when the user has no rows yet, and renames the source
// file to *.migrated afterwards so it never re-imports (and survives as a backup).
function migrateLegacyFiles(defaultUserId) {
  const hasProgress = db.prepare('SELECT 1 FROM progress_items WHERE user_id = ? LIMIT 1').get(defaultUserId)
    || db.prepare('SELECT 1 FROM stats WHERE user_id = ? LIMIT 1').get(defaultUserId);
  if (!hasProgress && fs.existsSync(PROGRESS_FILE)) {
    try {
      const blob = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      saveProgress(defaultUserId, blob);
      fs.renameSync(PROGRESS_FILE, `${PROGRESS_FILE}.migrated`);
      console.log('Migrated progress.json → SQLite (default user).');
    } catch (e) {
      console.warn('progress.json migration skipped:', e.message);
    }
  }

  const hasTexts = db.prepare('SELECT 1 FROM texts WHERE user_id = ? LIMIT 1').get(defaultUserId);
  if (!hasTexts && fs.existsSync(USER_TEXTS_FILE)) {
    try {
      const store = JSON.parse(fs.readFileSync(USER_TEXTS_FILE, 'utf8'));
      for (const t of store.texts || []) {
        addText(defaultUserId, { id: t.id, title: t.title, source: t.source, body: t.body, glossary: t.glossary });
      }
      fs.renameSync(USER_TEXTS_FILE, `${USER_TEXTS_FILE}.migrated`);
      console.log('Migrated texts-user.json → SQLite (default user).');
    } catch (e) {
      console.warn('texts-user.json migration skipped:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Users / sessions
// ---------------------------------------------------------------------------

function getDefaultUserId() {
  return db.prepare('SELECT id FROM users WHERE is_default = 1').get().id;
}

function getUser(id) {
  return db.prepare('SELECT id, username, is_default FROM users WHERE id = ?').get(id) || null;
}

// Returns the new user row, or null if the username is taken.
function createUser(username, password) {
  const name = String(username || '').trim();
  if (!name || !password) return null;
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(name);
  if (exists) return null;
  const info = db.prepare('INSERT INTO users (username, pw_hash, is_default, created) VALUES (?, ?, 0, ?)')
    .run(name, hashPassword(password), Date.now());
  return getUser(Number(info.lastInsertRowid));
}

// Returns the user row on success, null otherwise.
function verifyUser(username, password) {
  const row = db.prepare('SELECT id, username, pw_hash, is_default FROM users WHERE username = ?').get(String(username || '').trim());
  if (!row || !verifyPassword(password, row.pw_hash)) return null;
  return { id: row.id, username: row.username, is_default: row.is_default };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)').run(token, userId, Date.now());
  return token;
}

function getUserIdByToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  return row ? row.user_id : null;
}

function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Promote the current default user (which holds the migrated single-user
// progress) into a real named account, and seed a fresh empty default in its
// place for anonymous/guest use. All progress rows keep their user_id — only the
// user's name/password/is_default flag change — so nothing has to be copied.
// One-shot: run once via scripts/claim-account.js.
function makeOwnerAccount(username, password) {
  const name = String(username || '').trim();
  if (!name || !password) throw new Error('username and password required');
  if (db.prepare('SELECT 1 FROM users WHERE username = ? AND is_default = 0').get(name)) {
    throw new Error(`account "${name}" already exists`);
  }
  const def = db.prepare('SELECT id FROM users WHERE is_default = 1').get();
  if (!def) throw new Error('no default user found');

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET username = ?, pw_hash = ?, is_default = 0 WHERE id = ?')
      .run(name, hashPassword(password), def.id);
    const randomPw = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO users (username, pw_hash, is_default, created) VALUES (?, ?, 1, ?)')
      .run(DEFAULT_USERNAME, hashPassword(randomPw), Date.now());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getUser(def.id);
}

// ---------------------------------------------------------------------------
// Progress (blob ↔ normalized tables)
// ---------------------------------------------------------------------------

function getProgress(userId) {
  const items = {};
  for (const r of db.prepare('SELECT item_id, lessons, seen, last_seen, due FROM progress_items WHERE user_id = ?').all(userId)) {
    items[r.item_id] = { lessons: r.lessons, seen: !!r.seen, lastSeen: r.last_seen, due: r.due };
  }
  const units = {};
  for (const r of db.prepare('SELECT unit_id, lessons_done FROM units WHERE user_id = ?').all(userId)) {
    units[r.unit_id] = { lessonsDone: r.lessons_done };
  }
  const s = db.prepare('SELECT points, streak, last_day, freezes, freeze_week FROM stats WHERE user_id = ?').get(userId);
  const stats = s
    ? { points: s.points, streak: s.streak, lastDay: s.last_day, freezes: s.freezes, freezeWeek: s.freeze_week }
    : { points: 0, streak: 0, lastDay: null, freezes: 0, freezeWeek: null };
  const cfg = db.prepare('SELECT romanization_style FROM user_settings WHERE user_id = ?').get(userId);
  const settings = { romanizationStyle: cfg ? cfg.romanization_style : 'iso15919' };
  const ottakshara = db.prepare('SELECT glyph FROM ottakshara WHERE user_id = ? ORDER BY position').all(userId).map((r) => r.glyph);

  return { items, units, settings, stats, ottakshara };
}

// Replace the user's progress wholesale (the frontend always POSTs the full
// object). Delete-and-reinsert inside one transaction — correct and simple at
// this scale (a few hundred items).
function saveProgress(userId, blob) {
  const items = blob.items || {};
  const units = blob.units || {};
  const stats = blob.stats || {};
  const settings = blob.settings || {};
  const ottakshara = Array.isArray(blob.ottakshara) ? blob.ottakshara : [];

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM progress_items WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM units WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM ottakshara WHERE user_id = ?').run(userId);

    const insItem = db.prepare('INSERT INTO progress_items (user_id, item_id, lessons, seen, last_seen, due) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [id, it] of Object.entries(items)) {
      insItem.run(userId, id, it.lessons || 0, it.seen ? 1 : 0, it.lastSeen || 0, it.due || 0);
    }
    const insUnit = db.prepare('INSERT INTO units (user_id, unit_id, lessons_done) VALUES (?, ?, ?)');
    for (const [id, u] of Object.entries(units)) {
      insUnit.run(userId, id, (u && u.lessonsDone) || 0);
    }
    const insOtt = db.prepare('INSERT INTO ottakshara (user_id, position, glyph) VALUES (?, ?, ?)');
    ottakshara.forEach((glyph, i) => insOtt.run(userId, i, glyph));

    db.prepare(`INSERT INTO stats (user_id, points, streak, last_day, freezes, freeze_week)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  points = excluded.points, streak = excluded.streak,
                  last_day = excluded.last_day, freezes = excluded.freezes,
                  freeze_week = excluded.freeze_week`)
      .run(userId, stats.points || 0, stats.streak || 0,
        stats.lastDay == null ? null : stats.lastDay,
        stats.freezes || 0,
        stats.freezeWeek == null ? null : stats.freezeWeek);

    db.prepare(`INSERT INTO user_settings (user_id, romanization_style)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET romanization_style = excluded.romanization_style`)
      .run(userId, settings.romanizationStyle || 'iso15919');

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

function getUserTexts(userId) {
  return db.prepare('SELECT id, title, source, body, glossary FROM texts WHERE user_id = ? ORDER BY rowid').all(userId)
    .map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      user: true,
      body: r.body,
      glossary: r.glossary ? JSON.parse(r.glossary) : {},
    }));
}

function addText(userId, { id, title, source, body, glossary }) {
  const textId = id || `user-${Date.now()}`;
  db.prepare('INSERT INTO texts (id, user_id, title, source, body, glossary) VALUES (?, ?, ?, ?, ?, ?)')
    .run(textId, userId, title || 'Untitled', source || 'imported', body, JSON.stringify(glossary || {}));
  return {
    id: textId,
    title: title || 'Untitled',
    source: source || 'imported',
    user: true,
    body,
    glossary: glossary || {},
  };
}

module.exports = {
  init,
  getDefaultUserId,
  getUser,
  createUser,
  makeOwnerAccount,
  verifyUser,
  createSession,
  getUserIdByToken,
  deleteSession,
  getProgress,
  saveProgress,
  getUserTexts,
  addText,
};
