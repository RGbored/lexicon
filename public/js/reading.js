'use strict';

/**
 * Reading & Vocabulary module (DESIGN.md §8) — kept separate from the alphabet
 * learner in the UI. Import a Kannada text, learn its words in frequency order
 * via the shared exercise engine (SRS + scaffolding), track how much of the text
 * you can read, and read it yourself with tap-to-reveal.
 *
 * Words are registered as items (category 'word') so Session/SRS handle them
 * exactly like characters. Word ids are `w:<word>`, shared across texts so
 * vocabulary learned in one text counts everywhere.
 */
const Reading = (() => {
  const KANNADA = /[ಀ-೿]+/g;
  const READ_FULL = 3;      // lessons a word has appeared in for full reading credit
  const LESSON_SIZE = 6;

  let texts = [];
  const cache = new Map();  // textId -> derived data

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  const wid = (w) => 'w:' + w;

  async function load() {
    const r = await fetch('/api/texts').then((x) => x.json()).catch(() => ({ texts: [] }));
    texts = r.texts || [];
  }

  // Tokenize → frequency-rank → word items + lesson path. Registers items so the
  // shared engine can resolve them. Cached per text.
  function derive(text) {
    if (cache.has(text.id)) return cache.get(text.id);
    const tokens = text.body.match(KANNADA) || [];
    const freq = new Map();
    const firstAt = new Map();
    tokens.forEach((t, i) => {
      freq.set(t, (freq.get(t) || 0) + 1);
      if (!firstAt.has(t)) firstAt.set(t, i);
    });
    const unique = [...freq.keys()].sort(
      (a, b) => freq.get(b) - freq.get(a) || firstAt.get(a) - firstAt.get(b)
    );
    const items = unique.map((w) => ({
      id: wid(w),
      glyph: w,
      roman: Translit.word(w),
      meaning: (text.glossary && text.glossary[w]) || '',
      category: 'word',
    }));
    Data.registerItems(items);
    const lessons = chunk(unique.map(wid), LESSON_SIZE).map((ids) => ({ ids }));
    const d = { text, tokens, freq, firstAt, unique, items, lessons };
    cache.set(text.id, d);
    return d;
  }

  // Fraction of the text you can read, weighted by word frequency. Credit is
  // based on how many lessons a word has appeared in (so the bar moves right
  // after the first lesson), with partial credit until READ_FULL.
  function coverage(text) {
    const d = derive(text);
    if (!d.tokens.length) return 0;
    let credit = 0;
    for (const w of d.unique) {
      const it = Data.peek(wid(w));
      const lessons = it ? it.lessons : 0;
      credit += d.freq.get(w) * Math.min(lessons, READ_FULL) / READ_FULL;
    }
    return credit / d.tokens.length;
  }

  const statusEl = () => document.getElementById('status');

  // ── reading home: import + text list ─────────────────────────────────────
  function home(root) {
    root.innerHTML = '';

    const imp = el(`
      <section class="unit">
        <h2>Import a text</h2>
        <input class="text-title" placeholder="Title (optional)" />
        <textarea class="text-body" rows="4" placeholder="Paste Kannada text here…"></textarea>
        <label class="text-file-label">📄 …or upload a .txt file
          <input type="file" class="text-file" accept=".txt,text/plain" hidden />
        </label>
        <button class="action add-text">Add text</button>
      </section>`);
    imp.querySelector('.text-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        imp.querySelector('.text-body').value = reader.result;
        const ti = imp.querySelector('.text-title');
        if (!ti.value.trim()) ti.value = file.name.replace(/\.txt$/i, '');
      };
      reader.readAsText(file);
    });
    imp.querySelector('.add-text').onclick = () => {
      const title = imp.querySelector('.text-title').value.trim();
      const body = imp.querySelector('.text-body').value.trim();
      if (body) importText(title, body);
    };
    root.appendChild(imp);

    const section = el('<section class="unit"><h2>Texts</h2><div class="text-list"></div></section>');
    const list = section.querySelector('.text-list');
    for (const t of texts) {
      const cov = Math.round(coverage(t) * 100);
      const card = el(`
        <button class="text-card">
          <div class="text-card-main">
            <span class="text-card-title">${t.title}</span>
            <span class="text-card-sub">${t.source || (t.user ? 'imported' : '')}</span>
          </div>
          <div class="cov">
            <div class="cov-bar"><span style="width:${cov}%"></span></div>
            <span class="cov-pct">${cov}%</span>
          </div>
        </button>`);
      card.onclick = () => { location.hash = `#/text/${encodeURIComponent(t.id)}`; };
      list.appendChild(card);
    }
    if (!texts.length) list.appendChild(el('<p class="hint">No texts yet — paste one above.</p>'));
    root.appendChild(section);
    statusEl().textContent = `${texts.length} text${texts.length === 1 ? '' : 's'}`;
  }

  // ── a text: coverage + lesson path + read button ─────────────────────────
  function text(id, root) {
    const t = texts.find((x) => x.id === id);
    if (!t) { location.hash = '#/reading'; return; }
    const d = derive(t);
    const u = Data.unit('text:' + id);
    const cov = Math.round(coverage(t) * 100);
    root.innerHTML = '';

    const head = el(`
      <section class="unit">
        <h2>${t.title}</h2>
        <div class="cov big">
          <div class="cov-bar"><span style="width:${cov}%"></span></div>
          <span class="cov-pct">${cov}%</span>
        </div>
        <p class="hint">You can read about ${cov}% of this text · ${d.unique.length} unique words</p>
        <button class="action read-btn">Read the text</button>
      </section>`);
    head.querySelector('.read-btn').onclick = () => { location.hash = `#/text/${encodeURIComponent(id)}/read`; };
    root.appendChild(head);

    const section = el('<section class="unit"><h2>Lessons</h2><div class="lesson-map"></div></section>');
    const map = section.querySelector('.lesson-map');
    d.lessons.forEach((lesson, i) => {
      const done = i < u.lessonsDone;
      const open = i <= u.lessonsDone;
      const node = el(`<button class="lesson ${done ? 'done' : open ? 'open' : 'locked'}"></button>`);
      node.disabled = !open;
      const preview = lesson.ids.map((wi) => Data.get(wi).glyph).join(' · ');
      node.innerHTML = `<span class="lesson-glyphs">${preview}</span><span class="lesson-tag">${done ? '✓' : open ? '▶' : '🔒'}</span>`;
      node.onclick = () => { location.hash = `#/text/${encodeURIComponent(id)}/lesson/${i}`; };
      map.appendChild(node);
    });
    root.appendChild(section);
    statusEl().textContent = t.title;
  }

  function startLesson(id, i) {
    const t = texts.find((x) => x.id === id);
    if (!t) { location.hash = '#/reading'; return; }
    const d = derive(t);
    const lesson = d.lessons[i];
    if (!lesson) { location.hash = `#/text/${encodeURIComponent(id)}`; return; }
    const learned = d.unique.map(wid).filter((w) => Data.peek(w)?.seen);
    Session.start({
      title: `${t.title.split('—')[0].trim()} ${i + 1}`,
      queue: Session.buildLessonQueue(lesson, learned, { words: true }),
      returnTo: `#/text/${encodeURIComponent(id)}`,
      onComplete: () => {
        const u = Data.unit('text:' + id);
        if (i === u.lessonsDone) u.lessonsDone += 1;
        Data.saveNow();
      },
    });
  }

  // ── read-it-yourself view ────────────────────────────────────────────────
  function read(id, root) {
    const t = texts.find((x) => x.id === id);
    if (!t) { location.hash = '#/reading'; return; }
    derive(t); // ensure words registered
    root.innerHTML = '';

    const info = el('<div class="read-info hint">Tap a word to hear it and see its meaning</div>');
    const body = el('<div class="read-body"></div>');
    for (const part of t.body.split(/([ಀ-೿]+)/)) {
      if (!part) continue;
      if (/[ಀ-೿]/.test(part)) {
        const lessons = Data.peek(wid(part))?.lessons || 0;
        const cls = lessons >= READ_FULL ? 'known' : lessons >= 1 ? 'learning' : 'unknown';
        const span = el(`<span class="rw ${cls}">${part}</span>`);
        span.onclick = () => {
          TTS.speak(part);
          const meaning = (t.glossary && t.glossary[part]) || '';
          info.innerHTML = `<b>${part}</b> — ${Translit.word(part)}${meaning ? ` · ${meaning}` : ''}`;
        };
        body.appendChild(span);
      } else {
        body.appendChild(document.createTextNode(part));
      }
    }

    const back = el('<button class="action">Back to text</button>');
    back.onclick = () => { location.hash = `#/text/${encodeURIComponent(id)}`; };

    root.appendChild(info);
    root.appendChild(el('<div class="read-legend hint"><span class="rw unknown">new</span><span class="rw learning">learning</span><span class="rw known">known</span></div>'));
    root.appendChild(body);
    const foot = el('<div class="foot"></div>');
    foot.appendChild(back);
    root.appendChild(foot);
    statusEl().textContent = `Reading: ${t.title}`;
  }

  async function importText(title, body) {
    const r = await fetch('/api/texts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled', body }),
    }).then((x) => x.json()).catch(() => null);
    if (r && r.text) {
      texts.push(r.text);
      cache.delete(r.text.id);
      location.hash = `#/text/${encodeURIComponent(r.text.id)}`;
    } else {
      home(document.getElementById('content'));
    }
  }

  return { load, home, text, startLesson, read, derive, coverage };
})();
