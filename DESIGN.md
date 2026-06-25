# Lexicon — Design

A self-hosted web app for learning the **Kannada script** (ಕನ್ನಡ ಲಿಪಿ) and building
**reading vocabulary from real texts**. Modeled on Duolingo's alphabet learner, then
extended with a comprehensible-input reading mode.

This document describes the system as it stands plus what's left to build. For setup
and usage see [`README.md`](README.md).

---

## 1. Goals & constraints

| Area        | Decision |
|-------------|----------|
| **Purpose** | Learn the Kannada script (vowels, consonants, kagunita, conjuncts) and read real texts. |
| **Form**    | Web app, **no build step** — vanilla HTML/CSS/JS, no bundler/framework. Edit file → refresh. |
| **Hosting** | Small Node server in Termux on a phone, exposed at `lexicon.rgbored.com` via a Cloudflare tunnel. |
| **Audio**   | Browser TTS (Web Speech API, Android `kn-IN` voice). Pre-recorded clips were considered and dropped — TTS is good enough. |
| **Persistence** | Server-side JSON today (single user). Moving to **SQLite + accounts** for multi-user (see roadmap). |
| **Offline** | No runtime dependence on external services; the dictionary is bundled, not an API. |

### Why these choices
- **Web over native:** no app store, no signing, no reinstall per change. Deploy = `git pull` + restart.
- **Node over static:** durable server-side progress (not locked to one browser), and room for an API / accounts.
- **No LLM at runtime:** meanings come from a bundled dictionary, so the app stays private, free, and offline.

---

## 2. Content model

Kannada is an abugida with a regular Unicode layout, so the **character set is generated
programmatically** (`scripts/generate-characters.js`) rather than hand-typed.

### Character categories
1. **Swaragalu** — independent vowels (13) + yogavaahaka (anusvara ಂ, visarga ಃ).
2. **Vyanjanagalu** — consonants (34), grouped by *varga* (ಕ-varga … avargeeya).
3. **Kagunita** — each consonant × each vowel sign (matra): ಕ → ಕಾ ಕಿ ಕೀ … (408 forms).
4. **Ottakshara** — stacked conjuncts `consonant + virama (್) + consonant`. *Planned (M4).*

### Item shape
```js
{ id: "ka", glyph: "ಕ", roman: "ka", category: "consonant", group: "ka-varga" }
```
Reading **words** are items of the same shape: `{ id: "w:ಕಾಗೆ", glyph, roman, meaning, category: "word" }`.

### Romanization
ISO 15919-style (diacritics): vowels `a ā i ī u ū r̥ e ē ai o ō au`; consonants `ka kha ga
… śa ṣa sa ha ḷa`. Whole-word transliteration is done deterministically in `translit.js`.

---

## 3. Learning loop & progress

### Lessons
Each lesson introduces a few new items one at a time, **interleaving** drills so two new
items are never back-to-back and earlier items are mixed back in with a growing review
load. Consolidation adds a matching exercise and (for characters) a tracing pass.

### Spaced repetition — exposure-based strength
- Strength reflects **exposure**: an item gains strength each distinct lesson/review it
  appears in, reaching full (5/5) after ~15 sessions.
- Each session pushes the item's next-review time further out, so well-known items
  resurface less often. Review sessions surface the most-due items.

> **Item-agnostic SRS.** The engine (`srs.js`) tracks generic *items* by id — a character
> or a word — and never assumes which. This is what lets reading-mode words reuse the
> exact same scheduling and exercises.

### Motivation
- **Daily streak** with **streak freezes** (2 granted/week, max 5) to bridge missed days.
- **Points**: +5 per completed session (further uses TBD).
- Tracked in `stats.js` / `progress.stats`, shown in a header bar.

---

## 4. Exercise types

- **Intro** — show glyph + romanization (+ meaning for words), speak it.
- **Multiple choice (recognize)** — show glyph → pick the answer. For characters the
  answer is the romanization (sound); **for words it's the English meaning**, so the
  spoken audio can't give it away.
- **Multiple choice (recall)** — show the answer → pick the glyph.
- **Match** — glyphs ↔ romanizations (characters) or **glyphs ↔ English meanings** (words).
- **Tracing** (characters only) — handwrite the glyph on a `<canvas>` with **progressive
  scaffolding**: full guide → faint guide → blind, fading as strength grows. Scored by
  outline overlap (coverage + accuracy), not stroke order (no Kannada stroke dataset).
  Excluded for words — multi-character words don't fit the small canvas.

---

## 5. Alphabet navigation

To stay uncluttered as the set grows, the Alphabet tab **drills down** instead of listing
everything at once:

```
#/                 → section cards: Vowels · Consonants · Kagunita · (Ottakshara)
#/section/:id      → a section's lessons, OR a grid of series tiles (kagunita)
#/unit/:id         → one series' lessons (e.g. the ಕ series)
#/lesson/:unit/:i  → run a lesson
#/strength         → per-character strength (only items you've started), grouped by section
#/review           → review due items
```

Sections/units unlock sequentially (a unit opens once all earlier ones are complete).
Ottakshara will slot in as just one more section card.

---

## 6. Reading mode

A separate **Reading** tab (`reading.js`); routes `#/reading`, `#/text/:id`,
`#/text/:id/lesson/:i`, `#/text/:id/read`. Model: comprehensible input (à la LingQ).

- **Import** a Kannada text by pasting or uploading a `.txt` file. Bundled sample stories
  ship with curated glossaries.
- **Tokenize → frequency-rank → path of lessons** (most frequent words first).
- Words are items reusing the SRS + exercises; meaning-based MCQ + word↔meaning match.
- **Coverage** per text (frequency-weighted, based on lessons-encountered: moves after the
  first lesson, full credit after 3) — "how much can I read".
- **Read-it-yourself** view: full text with **new / learning / known** highlighting and
  tap-to-reveal pronunciation + meaning.
- **Vocabulary carries over** between texts automatically (shared `w:<word>` ids).

### Meaning enrichment (no LLM)
Imported words are auto-glossed server-side from a bundled **Kannada→English dictionary**
built from the open **Alar** dataset (`scripts/build-dictionary.js` → `data/dictionary.json`,
~106k headwords, pinned to a commit). Best-effort **suffix stemming** resolves inflected
nouns to their headword.

**Limits:** Alar glosses are descriptive/verbose; **verb conjugations** and complex
inflections still miss (stemming covers noun case-endings only). PDF/OCR import is future
work (legacy non-Unicode Kannada fonts make extraction unreliable).

---

## 7. Architecture

```
Browser ──(HTML/CSS/vanilla JS, Web Speech API)──► Node + Express (Termux) ──► JSON files
                                                     serves static + JSON APIs
```

### Frontend modules (`public/js`)
| File | Role |
|---|---|
| `app.js` | Router + alphabet navigation + stats bar |
| `data.js` | Loads characters + progress; item registry (`registerItems`/`itemsByCategory`) |
| `curriculum.js` | Builds alphabet units → lessons (tagged by section) |
| `session.js` | Exercise queue + renderers (shared by alphabet & reading) |
| `srs.js` | Exposure-based strength + review scheduling (item-agnostic) |
| `stats.js` | Streak, freezes, points |
| `reading.js` | Reading mode: import, frequency paths, coverage, read view |
| `translit.js` | Kannada → Latin transliteration |
| `tts.js` | Web Speech API wrapper |

### Backend (`server.js`)
- Static serving with `Cache-Control: no-cache` (Cloudflare edge cache is bypassed via a
  Cache Rule on the hostname).
- APIs: `GET /api/characters`, `GET/POST /api/progress`, `GET/POST /api/texts`.
- Loads the dictionary once at startup; auto-glosses texts on import.

### Persistence model (`progress.json`, single user — to be replaced by SQLite)
```js
{
  items:    { "ka": { lessons, seen, lastSeen, due }, "w:ಕಾಗೆ": { … } },
  units:    { vowels: { lessonsDone }, "kagunita-ka": { lessonsDone }, … },
  settings: { romanizationStyle },
  stats:    { points, streak, lastDay, freezes, freezeWeek }
}
```

---

## 8. Project structure

```
lexicon/
├── DESIGN.md  README.md
├── server.js              # Express: static + progress/texts API
├── deploy.sh  run.sh      # pull/rebuild/restart + start (Termux/tmux)
├── scripts/
│   ├── generate-characters.js
│   └── build-dictionary.js
├── data/                  # characters.json, dictionary.json, texts.json,
│                          # texts-user.json, progress.json (most gitignored)
└── public/                # index.html, css/styles.css, js/*.js
```

---

## 9. Roadmap (remaining)

### M4 — Ottakshara (conjuncts)
Generate conjunct forms (`consonant + virama + consonant`) and add them as a new section,
taught with the existing exercises. The combinatorial space is large (~1,150 pairs), so
teach a **curated common set** (doubles ಕ್ಕ ತ್ತ ನ್ನ ಲ್ಲ ಮ್ಮ, frequent clusters ಸ್ತ ಸ್ವ ಕ್ಷ ಜ್ಞ …) —
optionally seeded from conjuncts that actually appear in the reading texts.

### Multi-user — SQLite + accounts
Let other people use the app with their own accounts and progress.
- **Storage:** replace the per-file JSON (`progress.json`, `texts-user.json`) with
  **SQLite**. Prefer Node's built-in `node:sqlite` to avoid a native build (better-sqlite3
  compiles awkwardly on Termux/ARM).
- **Schema (sketch):** `users(id, username, pw_hash, created)`, `progress(user_id, item_id,
  lessons, seen, last_seen, due)`, `units(user_id, unit_id, lessons_done)`,
  `stats(user_id, …)`, `texts(id, user_id NULL=shared, title, body, glossary)`.
- **Auth:** lightweight username + password (hashed), session cookie. Optional —
  single-user/local use stays frictionless via a default account.
- **Scope:** `/api/progress` and `/api/texts` keyed to the logged-in user; bundled texts
  shared. One-time migration of the existing `progress.json` into a user row.

### Dropped
- **Baked audio clips** (former M6) — browser TTS is sufficient on the target devices.

### Smaller open items
- Better dictionary coverage for **verbs / complex inflections** (a real lemmatizer, or an
  optional LLM refinement pass).
- Romanization display toggle (ISO 15919 vs simplified ASCII).
- PDF/OCR import for texts.
