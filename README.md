# Lexicon

A self-hosted web app for learning the **Kannada script** (ಕನ್ನಡ ಲಿಪಿ), modeled on
Duolingo's alphabet learner. Built to run from a small Node server — e.g. in
Termux on a phone — so you can practice at your convenience with no app to install.

See [`DESIGN.md`](DESIGN.md) for the full design and roadmap.

## Features

- **Progressive units** — Vowels → Consonants (by varga), unlocked lesson by lesson.
- **Interleaved teaching** — new characters are introduced one at a time, each
  followed by drills, so you never meet two new characters back-to-back.
- **Four exercise types** — intro cards, multiple-choice (recognize & recall),
  match-the-pairs, and **tracing** (handwrite the glyph on a canvas).
- **Tracing with fading scaffolding** — full guide → faint guide → blind, driven
  by how well you know each character.
- **Spaced repetition** — every character has a strength score; weak ones resurface
  in review sessions.
- **Strength dashboard** — see your 0–5 mastery of each character at a glance.
- **Audio** — characters are spoken via the browser's Kannada voice (Web Speech
  API), always shown alongside the romanization.
- **Durable progress** — saved server-side to a JSON file, so it survives across
  browsers and devices.

## Requirements

- **Node.js** (tested on v24) — no build step, no bundler, no framework.
- A modern browser. Audio needs a Kannada (`kn-IN`) voice installed:
  - **Android Chrome** — Google's `kn-IN` voice (recommended target).
  - **macOS** — the "Soumya" Kannada voice (Safari & Chrome).
  - Devices without a Kannada voice still work; they just won't speak.

## Setup

```bash
npm install        # install Express
npm run generate   # build the character data → data/characters.json
npm start          # serve at http://localhost:3000
```

Open <http://localhost:3000> and start with the first Vowels lesson.

### Scripts

| Command | What it does |
|---|---|
| `npm run generate` | Generate vowels + consonants into `data/characters.json` |
| `npm run generate:all` | Also generate the kagunita grid (consonant × vowel-sign) |
| `npm start` | Start the server (honors `PORT`, default `3000`) |

## Running on a phone (Termux)

```bash
pkg install nodejs git
git clone <your-repo-url> lexicon && cd lexicon
npm install
npm run generate
npm start            # or: PORT=8080 npm start
```

Then open `http://localhost:3000` on the phone, or
`http://<phone-lan-ip>:3000` from another device on the same network.

## Project structure

```
lexicon/
├── DESIGN.md                    # design & roadmap
├── server.js                    # Express: static files + progress API
├── scripts/
│   └── generate-characters.js   # builds character data from Unicode rules
├── data/
│   ├── characters.json          # generated character set
│   └── progress.json            # runtime progress (gitignored)
└── public/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── tts.js               # Web Speech API wrapper
        ├── srs.js               # spaced-repetition engine (item-agnostic)
        ├── data.js              # loads characters + progress
        ├── curriculum.js        # builds units → lessons
        ├── session.js           # exercise queue + renderers
        └── app.js               # router + home / lesson map
```

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/characters` | The generated character set |
| `GET` | `/api/progress` | Current progress (defaults if none saved) |
| `POST` | `/api/progress` | Persist progress to `data/progress.json` |

## Status

Vowels + consonants are fully playable (milestones M1–M2). Next up: the kagunita
grid (M3), conjuncts (M4), and an audio upgrade to pre-recorded clips. See
[`DESIGN.md`](DESIGN.md) §7 for the roadmap.
