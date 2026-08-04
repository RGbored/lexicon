# Lexicon

A self-hosted web app for learning the **Kannada** (ಕನ್ನಡ ಲಿಪಿ), **Japanese** (日本語),
or **German** script and building **reading vocabulary from real texts**. Choose your
language with a dropdown — each has its own character set, dictionary, and TTS voice.
Modeled on Duolingo's alphabet learner, then extended with a reading mode. Built to run
from a small Node server — e.g. in Termux on a phone — so you can practice at your
convenience with no app to install.

**Live:** <https://lexicon.rgbored.com>

See [`DESIGN.md`](DESIGN.md) for the full design, roadmap, and instructions on how to add a new language.

## Features

### Alphabet learner

- **Progressive units** — Kannada: Vowels → Consonants → Kagunita → Ottakshara;
  Japanese: Hiragana → Katakana; German: Alphabet → Umlauts. Unlocked lesson by lesson.
- **Interleaved teaching** — new characters are introduced one at a time and drilled
  with a growing mix of earlier ones, so you never meet two new characters in a row.
- **Varied exercises** — intro cards, multiple-choice (recognize & recall),
  match-the-pairs, and **tracing** (handwrite the glyph on a canvas).
- **Tracing with fading scaffolding** — full guide → faint guide → blind, based on how
  well you know each character.
- **Strength dashboard** — your 0–5 mastery of every character at a glance.
- **Audio** — characters are spoken via the browser's TTS (Kannada `kn-IN`, Japanese
  `ja-JP`, or German `de-DE` voice, auto-selected), always shown next to the romanization.

### Reading mode (separate tab)

Learn to read real text by working through it the way comprehensible-input apps
(like LingQ) do — but self-hosted and offline.

- **Import any text** — paste text in your active language or upload a `.txt` file.
  *Benefit:* learn from content you actually want to read, not a fixed word list.
- **Frequency-ordered path** — words are taught most-common-first, in lessons.
  *Benefit:* the handful of words that unlock most of a text come first, so your
  ability to read it climbs fast.
- **Meaning-based practice** — word multiple-choice tests the **English meaning**
  (with a word ↔ meaning matching exercise), using the same SRS as the alphabet.
  *Benefit:* you build comprehension, and hearing a word never gives away the answer.
- **Offline auto-glossing** — imported words are looked up in bundled dictionaries
  (**Kannada–English** from [Alar](https://github.com/alar-dict/data), ~106k entries;
  **Japanese–English** from JLPT N5; **German–English** from Hathibelagal) with
  best-effort stemming for inflected forms. All sources pinned to specific commits.
  *Benefit:* real meanings for your own texts with **no LLM, no API, no runtime
  network** — private and free.
- **Coverage tracking** — each text shows a "how much can I read" bar, weighted by word
  frequency. *Benefit:* a concrete, motivating measure of progress toward reading it
  unaided.
- **Read-it-yourself view** — the whole text with **new / learning / known**
  highlighting and tap-to-reveal pronunciation + meaning.
  *Benefit:* read authentic text with a safety net, and watch the highlights fade as
  you learn.
- **Vocabulary carries over** — a word learned in one text keeps its strength in every
  other text that uses it. *Benefit:* cumulative vocabulary, so each new text starts
  with higher coverage.
- **Bundled sample stories** — start immediately without importing anything.

### Progress & motivation (shared)

- **Spaced repetition** — strength grows with exposure (full after ~15 sessions with an
  item); weaker/older items resurface in review.
- **Daily streak + freezes** — a streak for practicing each day; missed days are bridged
  by streak freezes (2 granted per week, capped at 5).
- **Points** — every completed session awards points (more uses planned).
- **Durable progress** — saved server-side to SQLite, so it survives across browsers and
  devices.

## Requirements

- **Node.js** (tested on v24) — no build step, no bundler, no framework.
- A modern browser. Audio works best with language-specific voices:
  - **Android Chrome** — Google's `kn-IN` voice (the recommended target for Kannada).
  - **macOS** — the "Soumya" Kannada voice (Safari & Chrome).
  - Japanese and German voices are widely available on all platforms.
  - Devices without the right voice still work; they just won't speak.

## Setup

```bash
npm install         # install Express
npm run generate    # build character data → data/characters_{kn,ja,de}.json
npm run dictionary  # optional: build all dictionaries (Kannada, Japanese, German)
npm start           # serve at http://localhost:3000
```

Open <http://localhost:3000> and start with the first lesson, or switch to the
**Reading** tab. The dictionaries are only needed to auto-gloss *imported* texts — the
bundled stories already include meanings, and the app runs fine without them.

### Scripts

| Command | What it does |
|---|---|
| `npm run generate` | Generate character sets for all languages → `data/characters_{kn,ja,de}.json` |
| `npm run dictionary` | (Re)build dictionaries for all languages (`data/dictionary_{kn,ja,de}.json`) from pinned sources |
| `npm start` | Start the server (honors `PORT`, default `3000`) |

## Running on a phone (Termux)

```bash
pkg install nodejs git
git clone <your-repo-url> lexicon && cd lexicon
npm install
npm run generate
npm start            # or: PORT=3000 ./run.sh
```

Open `http://localhost:3000` on the phone, or `http://<phone-lan-ip>:3000` from another
device on the same network.

### Updating

`deploy.sh` pulls the latest, reinstalls deps only if they changed, regenerates data,
builds any missing dictionaries, and restarts the app (via a `tmux` session
running `run.sh`):

```bash
./deploy.sh
```

If you serve the app through **Cloudflare**, note that Cloudflare caches static
`.js`/`.css` at its edge (default 4-hour browser-cache TTL), which can hide a fresh
deploy. Fix it with a Cache Rule that **bypasses cache** for your hostname (and purge
once), or set Browser Cache TTL to "Respect Existing Headers" — the server already
sends `Cache-Control: no-cache`.

## Project structure

```
lexicon/
├── DESIGN.md                    # design & roadmap
├── server.js                    # Express: static files + progress/texts API
├── deploy.sh                    # pull + rebuild + restart (Termux/tmux)
├── run.sh                       # start the server
├── scripts/
│   ├── generate-characters.js   # builds character data for all languages
│   └── build-dictionary.js      # builds dictionaries from pinned sources
├── data/
│   ├── characters_{kn,ja,de}.json  # generated character sets (gitignored)
│   ├── dictionary_{kn,ja,de}.json  # generated dictionaries (gitignored)
│   ├── texts.json               # bundled sample stories (with glossaries)
│   └── lexicon.db               # SQLite database (per-user state; gitignored)
└── public/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── tts.js               # Web Speech API wrapper (auto-selects voice per language)
        ├── srs.js               # spaced-repetition engine (item-agnostic)
        ├── stats.js             # streak, freezes, points
        ├── translit.js          # Kannada/Japanese/German transliteration
        ├── data.js              # loads characters + progress; item registry
        ├── curriculum.js        # builds alphabet units → lessons
        ├── session.js           # exercise queue + renderers (shared by both modes)
        ├── reading.js           # reading mode: import, paths, coverage, read view
        └── app.js               # router + home / lesson map / stats bar
```

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/characters?lang=kn\|ja\|de` | Character set for a language |
| `GET` | `/api/progress` | Current progress (defaults if none saved) |
| `POST` | `/api/progress` | Persist progress |
| `GET` | `/api/texts?lang=kn\|ja\|de` | Bundled + imported texts for a language |
| `POST` | `/api/texts` | Import a text (auto-glossed from the dictionary) |

## Status

Playable end to end: multi-language support (Kannada, Japanese, German) with
language-specific characters, dictionaries, and TTS. The alphabet learner with tracing
(disabled for German), spaced repetition, streak/points, and the reading mode (import,
frequency paths, offline dictionary glossing, coverage, read-it-yourself). See
[`DESIGN.md`](DESIGN.md) §9 for the roadmap.
