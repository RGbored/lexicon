# Lexicon — Kannada Alphabet Learner

A self-hosted web app for learning the Kannada script (ಕನ್ನಡ ಲಿಪಿ), modeled on
Duolingo's alphabet learner. Built for personal use, served from a Node server
running in Termux on an Android phone.

---

## 1. Goals & Constraints

| Area        | Decision                                                                 |
|-------------|--------------------------------------------------------------------------|
| **Purpose** | Learn the full Kannada script: vowels, consonants, kagunita, conjuncts.  |
| **Form**    | Web app (no native app, no install/build cycle). Edit file → refresh.    |
| **Hosting** | Small Node server in Termux, alongside an existing Go game server.        |
| **Audio**   | Browser TTS (Web Speech API, Android `kn-IN` voice) for now. No audio files yet. |
| **Devices** | Primary target Android (Chrome). Should degrade gracefully elsewhere.     |
| **Build**   | No bundler, no framework. Vanilla HTML/CSS/JS. Zero build step.           |

### Why these choices
- **Web over native:** no app store, no signing, no reinstall per change. Deploy = copy/pull files + restart server.
- **Node over static:** user already runs a server in Termux; a tiny server lets us persist progress server-side (durable, not locked to one browser's localStorage) and leaves room for an API later.
- **TTS now, baked audio later:** Android's Google `kn-IN` voice is good enough to start. Per-character pronunciation can be unreliable in TTS (engines are tuned for words, not isolated syllables), so the plan is to later **generate audio clips once** with a high-quality cloud TTS, verify them, and ship them as static files. The data model reserves an `audio` field per character so this is a drop-in upgrade, not a rearchitecture.

---

## 2. Content Model

Kannada is an abugida and its Unicode layout is regular, so the **entire character
set is generated programmatically** from rules rather than hand-typed.

### Character categories

1. **Swaragalu** (independent vowels, ~15) + yogavaahagalu (anusvara ಂ, visarga ಃ)
2. **Vyanjanagalu** (consonants, ~34), grouped by *varga*:
   - ಕ-varga: ಕ ಖ ಗ ಘ ಙ
   - ಚ-varga: ಚ ಛ ಜ ಝ ಞ
   - ಟ-varga: ಟ ಠ ಡ ಢ ಣ
   - ತ-varga: ತ ಥ ದ ಧ ನ
   - ಪ-varga: ಪ ಫ ಬ ಭ ಮ
   - avargeeya: ಯ ರ ಲ ವ ಶ ಷ ಸ ಹ ಳ
3. **Kagunita** — each consonant × each vowel sign (matra). The ka / kā / ki / kī / ku … grid.
   Generated as `consonant + vowel-sign` Unicode sequences.
4. **Ottakshara** — stacked conjuncts: `consonant + virama (್) + consonant`. The largest set; introduced last.

### Data shape (per character)
```js
{
  id: "ka",            // stable slug
  glyph: "ಕ",          // the Kannada character (may be a multi-codepoint sequence)
  roman: "ka",         // romanization (see scheme below)
  category: "consonant", // vowel | yogavaahaka | consonant | kagunita | ottakshara
  group: "ka-varga",   // sub-grouping for lesson ordering
  audio: null          // reserved for future baked-in clip path
}
```

### Romanization scheme
Readable **ISO 15919–style** transliteration (diacritics over ASCII digraphs where
it aids clarity). Examples:

- Vowels: `a ā i ī u ū r̥ e ē ai o ō au`
- Consonants: `ka kha ga gha ṅa | ca cha ja jha ña | ṭa ṭha ḍa ḍha ṇa | ta tha da dha na | pa pha ba bha ma | ya ra la va śa ṣa sa ha ḷa`

A simplified ASCII fallback (`ka kha ... sha sha`) can be offered as a display toggle later.

---

## 3. Learning Loop

Mirrors Duolingo's alphabet learner: small batches, heavy repetition, spaced review.

### Unit progression (unlocks in order)
1. **Vowels** — swaragalu in batches of ~5
2. **Consonants** — one varga per lesson group
3. **Kagunita** — vowel signs introduced progressively, applied to already-known consonants
4. **Ottakshara** — common conjuncts

Each **lesson** introduces 3–5 new characters, then drills them mixed with review of
previously learned characters. Completing a lesson unlocks the next.

### Spaced repetition / mastery
- Strength reflects **exposure**: a character grows stronger each distinct lesson/
  review session it appears in, reaching **full strength after 15 sessions** (shown
  as a 0–5 meter on the home dashboard).
- Each session pushes a character's next-review time further out the more often it
  has been seen, so well-known characters resurface less often.
- **Review sessions** surface the most-due characters across all unlocked units.

> **Design note — item-type-agnostic SRS.** The scheduling engine tracks generic
> *items* keyed by id, where an item is a *character* today. The future Reading &
> Vocabulary module (§8) introduces *words* as items of the same shape, so the SRS
> must not assume "character". Building it generically now avoids a rewrite later.

---

## 4. Exercise Types

### Phase 1 — core (build first)
1. **Match pairs** — tap to match Kannada glyphs ↔ romanizations.
2. **Multiple choice (recognize)** — show glyph, pick the correct romanization.
3. **Multiple choice (recall)** — show romanization, pick the correct glyph.
4. **Tap what you hear** — play TTS, pick the matching glyph.

### Phase 2 — tracing (add after Phase 1)
Handwriting practice on an HTML `<canvas>`, with **progressive scaffolding**:

1. **Guided trace** — full glyph shown as a bold guide outline; user traces directly over it.
2. **Faint trace** — guide reduced to a faint/dotted outline; user traces with less help.
3. **Blind draw** — blank canvas; user reproduces the glyph from memory.

**Scoring approach:** outline-overlap, not stroke order. We render the target glyph to
an offscreen canvas and compare the user's drawn pixels against it — rewarding coverage
of the glyph and penalizing strokes far outside it. (Stroke-order validation is out of
scope: there is no readily available Kannada stroke-order dataset, unlike kana/kanji.)

A character advances through the three scaffolding levels as the learner succeeds,
matching the "trace → less guidance → blind" progression.

---

## 5. Architecture

```
Browser (Android Chrome)
   │  HTML + CSS + vanilla JS  (no build step)
   │  Web Speech API for TTS
   ▼
Node server (Termux)
   • serves static frontend
   • GET/POST progress  → progress.json
```

### Frontend
- Single-page app, hash-based routing (`#/`, `#/lesson/...`, `#/review`).
- Vanilla JS modules; no React/bundler. State held in memory, synced to server.
- Character data generated at build/start time into a JSON the frontend loads.

### Backend (Node + Express)
- Static file serving for the frontend.
- Minimal progress API:
  - `GET  /api/progress` → current progress JSON
  - `POST /api/progress` → persist progress
- Persistence: a single `progress.json` file (no DB needed for one user). SQLite is a possible upgrade later.

### Persistence model (`progress.json`)
```js
{
  items: { "ka": { lessons: 3, seen: true, lastSeen: 1719230000, due: 1719300000 }, ... },
  units: { vowels: { lessonsDone: 4 }, consonants: { lessonsDone: 2 }, ... },
  settings: { romanizationStyle: "iso15919" }
}
```

---

## 6. Project Structure (proposed)
```
lexicon/
├── DESIGN.md
├── package.json
├── server.js                 # Express: static + progress API
├── scripts/
│   └── generate-characters.js # builds character data from Unicode rules
├── data/
│   ├── characters.json        # generated character set
│   └── progress.json          # runtime progress (gitignored)
└── public/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── app.js             # routing + bootstrap
        ├── data.js            # loads characters + progress
        ├── srs.js             # strength / scheduling logic
        ├── exercises/         # match, multiple-choice, audio, tracing
        └── tts.js             # Web Speech API wrapper
```

---

## 7. Roadmap

- **M1 — Foundation:** ✅ character generator, Node server, progress persistence, character data for vowels + consonants.
- **M2 — Core loop (vowels + consonants):** ✅ unit/lesson map, Phase-1 exercises (intro, MC recognize/recall, audio, match), SRS, review sessions. *End-to-end usable here.*
- **M3 — Kagunita:** ✅ generate the 408-cell grid; one unit per consonant series (ಕ → ಕಾ ಕಿ ಕೀ …), 6 forms per lesson.
- **M4 — Ottakshara:** common conjuncts.
- **M5 — Tracing:** canvas exercises with progressive scaffolding (Phase 2).
- **M6 — Audio upgrade (optional):** generate + verify baked-in clips, swap TTS for files.

---

## 8. Future Module — Reading & Vocabulary from Texts

A larger module to add **after** the alphabet learner ships. The model is
comprehensible input (à la LingQ): import real content, learn its vocabulary in the
existing learning flow, and reach the point of reading the text unaided.

### Concept / flow
1. **Import** a story or book as text (start with plain `.txt` / clean Unicode).
2. **Tokenize** into words (Kannada uses spaces, so whitespace tokenization works).
3. **Look up** each word's lemma + meaning + romanization.
4. **Introduce** unknown words into the SRS / learning flow, prioritized by frequency.
5. **Read mode** — read the text with tap-to-reveal meanings, tracking how much you know.
6. **Goal:** reach high **known-word coverage** of the text ("you know 82% of this story") and read it unaided.

### Prerequisite
Assumes the learner can already decode the script — so this builds *on top of* the
alphabet learner, reusing the same **item-type-agnostic SRS** (§3 design note): words
are just items with a strength score, like characters.

### Hard parts (Kannada-specific), in order of risk
1. **Morphology (biggest).** Kannada is agglutinative and heavily inflected — case
   endings, postpositions, and sandhi attach to stems, so a surface word ≠ dictionary
   headword. Needs **lemmatization** to teach reusable vocabulary and to look words up.
   Stemmers exist (IndicNLP etc.) but quality is limited.
2. **PDF extraction.** Tokenization is easy; PDFs are not. Many Kannada PDFs are scanned
   images (need OCR — Tesseract `kan`, mediocre) or use **legacy non-Unicode fonts**
   (Nudi/Baraha) that extract as garbage. Start with `.txt` / clean Unicode; treat
   PDF + OCR as a later, best-effort add-on.
3. **Meaning source.** Two viable paths, likely hybrid:
   - **Local dictionary** — e.g. the open *Alar* Kannada–English dataset (~150k entries).
     Offline, fast, no rate limits; misses inflected/rare forms.
   - **LLM API (preferred)** — a model like **Claude (Anthropic API)** can return, per
     word in a sentence, the *lemma + meaning + contextual romanization* in one shot,
     largely sidestepping the morphology problem. Needs network + costs at import time.
   - **Hybrid:** local dictionary first, LLM for misses — keeps cost and latency down.

### Status — v1 shipped
Built as a separate **Reading** section (own tab). Implemented:
- Import a Kannada text (paste); bundled sample stories with curated glossaries.
- Tokenize → frequency-rank → path of lessons (most frequent first).
- Words are items (category `word`, id `w:<word>`) reusing the SRS + exercises.
  The English meaning is always shown during word exercises, and there's a
  **word ↔ meaning** matching exercise. Tracing is excluded for words (the canvas
  is too small for multi-character words). Deterministic transliteration (`translit.js`).
- Per-text **coverage** bar, frequency-weighted and based on lessons-encountered
  (so it moves after the first lesson; full credit after 3 lessons with a word).
- **Read-it-yourself** view with known/unknown highlighting + tap-to-reveal.
- Server: `GET/POST /api/texts`; imported texts persisted to `data/texts-user.json`.

Still open:
- **Meaning enrichment for imported texts** — bundled texts have curated meanings;
  user imports currently get transliteration only. Next: an optional server endpoint
  that calls the **Claude API** to fill `glossary` (lemma + meaning) when a key is set.
- **Lemmatization** (group inflected forms) and **PDF/OCR import** remain future work.

---

## 9. Open Questions / Future
- **TTS verification:** TTS pronunciation of isolated syllables should be spot-checked by a native speaker before relying on it for learning.
- **Romanization toggle:** offer simplified ASCII vs ISO 15919 display.
- **Conjunct selection:** ottakshara set is large; start with the most common conjuncts rather than the full combinatorial space.
- **Multi-device sync:** server-side progress already enables this; no extra work needed unless concurrent edits become a concern.
