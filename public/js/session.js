'use strict';

/**
 * Runs a practice session: a queue of exercises rendered one at a time. Wrong
 * answers requeue once. When the session completes, every character that
 * appeared gains one "lesson encountered" (drives strength — see srs.js).
 *
 * Exercise shapes:
 *   { type:'intro', id }                   teach a new character
 *   { type:'mc', mode:'recognize', id }    show glyph (+ sound) → pick romanization
 *   { type:'mc', mode:'recall', id }       show romanization → pick glyph
 *   { type:'match', ids:[...] }            match glyphs ↔ romanizations
 *   { type:'tracing', id }                 handwrite the glyph on a canvas
 *
 * Sound always plays alongside on-screen romanization, so there are no
 * sound-only exercises.
 */
const Session = (() => {
  const ACCENT = '#d97706';

  // ── utilities ──────────────────────────────────────────────────────────
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const sample = (arr, n) => shuffle(arr).slice(0, n);

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // 3 distractors from the same category (characters or words); widen only if
  // the category is too small to fill the options.
  function distractors(targetId, count = 3) {
    const target = Data.get(targetId);
    let pool = Data.itemsByCategory(target.category).filter((c) => c.id !== targetId);
    if (pool.length < count) {
      const wide = target.category === 'word' ? Data.itemsByCategory('word') : Data.all();
      pool = wide.filter((c) => c.id !== targetId);
    }
    return shuffle(pool).slice(0, count).map((c) => c.id);
  }
  const optionsFor = (targetId) => shuffle([targetId, ...distractors(targetId)]);

  // Largest font that fits the glyph within the canvas (words are wider).
  function fitFont(text, size, family) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const x = c.getContext('2d');
    let px = size * 0.72;
    x.font = `${px}px ${family}`;
    const w = x.measureText(text).width;
    if (w > size * 0.86) px *= (size * 0.86) / w;
    return `${px}px ${family}`;
  }

  // A single drill for a character, with the type randomized for variety.
  const randDrill = (id) => ({ type: 'mc', mode: Math.random() < 0.5 ? 'recognize' : 'recall', id });

  // Compare user ink against the target glyph: coverage = how much of the letter
  // was traced; accuracy = how much of the ink landed on/near the letter.
  function scoreTrace(glyph, inkCanvas, size, font) {
    function maskData(thick) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = font;
      if (thick) { x.lineWidth = thick; x.strokeStyle = '#000'; x.lineJoin = 'round'; x.strokeText(glyph, size / 2, size / 2); }
      x.fillText(glyph, size / 2, size / 2);
      return x.getImageData(0, 0, size, size).data;
    }
    const target = maskData(0);
    const tol = maskData(34); // fattened glyph = acceptable region
    const user = inkCanvas.getContext('2d').getImageData(0, 0, size, size).data;
    let tCount = 0, covered = 0, uCount = 0, inTol = 0;
    for (let i = 3; i < target.length; i += 4) {
      const t = target[i] > 40, u = user[i] > 40, tl = tol[i] > 40;
      if (t) { tCount++; if (u) covered++; }
      if (u) { uCount++; if (tl) inTol++; }
    }
    return { coverage: tCount ? covered / tCount : 0, accuracy: uCount ? inTol / uCount : 0 };
  }

  // ── queue builders ─────────────────────────────────────────────────────
  // Characters accumulate: each new character is introduced, drilled once, then
  // earlier characters from this lesson are mixed back in before the next new
  // one. Two intros are never back-to-back, and the review load grows as you go.
  function buildLessonQueue(lesson, learnedPool, opts = {}) {
    const words = !!opts.words; // word lessons: match by meaning, no tracing
    const newIds = lesson.ids.slice();
    const q = [];
    const introduced = [];
    newIds.forEach((id, i) => {
      q.push({ type: 'intro', id });
      introduced.push(id);
      q.push(randDrill(id)); // drill the character/word just introduced
      if (i > 0) {
        const prior = introduced.slice(0, -1);
        const k = Math.min(prior.length, i === 1 ? 1 : 2); // grow, capped at 2
        for (const pid of sample(prior, k)) q.push(randDrill(pid));
      }
    });
    // Consolidation: match, (tracing for characters only), and a little review.
    q.push({ type: 'match', ids: newIds.slice(0, 5), by: words ? 'meaning' : 'roman' });
    if (!words) for (const id of newIds) q.push({ type: 'tracing', id });
    for (const id of sample(learnedPool.filter((x) => !newIds.includes(x)), 3)) q.push(randDrill(id));
    return q;
  }

  function buildReviewQueue(dueIds) {
    return dueIds.map((id, i) => {
      const isWord = Data.get(id)?.category === 'word'; // no tracing for words
      const r = i % 3;
      if (r === 0) return { type: 'mc', mode: 'recognize', id };
      if (r === 1) return { type: 'mc', mode: 'recall', id };
      return isWord ? { type: 'mc', mode: 'recall', id } : { type: 'tracing', id };
    });
  }

  // ── runtime state ──────────────────────────────────────────────────────
  let queue = [];
  let idx = 0;
  let onComplete = null;
  let stats = { correct: 0, total: 0 };
  let root = null;
  let returnTo = '#/';

  function start({ queue: q, title, onComplete: done, returnTo: ret }) {
    queue = q.slice();
    idx = 0;
    stats = { correct: 0, total: 0 };
    onComplete = done;
    returnTo = ret || '#/';
    root = document.getElementById('content');
    renderCurrent(title);
  }

  function renderCurrent(title) {
    if (idx >= queue.length) return finish(title);
    const ex = queue[idx];
    const pct = Math.round((idx / queue.length) * 100);
    root.innerHTML = `
      <div class="session">
        <div class="progressbar"><span style="width:${pct}%"></span></div>
        <div class="exercise"></div>
        <div class="foot"></div>
      </div>`;
    const ctx = {
      title,
      exEl: root.querySelector('.exercise'),
      footEl: root.querySelector('.foot'),
      ex,
    };
    RENDERERS[ex.type](ctx);
  }

  function advance(title) {
    idx += 1;
    renderCurrent(title);
  }

  // Track answers for the summary; requeue a missed exercise once. Strength is
  // not touched here — it's applied per-session at finish().
  function record(correct, ex) {
    stats.total += 1;
    if (correct) stats.correct += 1;
    if (!correct && !ex._requeued) {
      ex._requeued = true;
      queue.push({ ...ex });
    }
  }

  function continueButton(footEl, title, label = 'Continue') {
    const btn = el(`<button class="action">${label}</button>`);
    btn.onclick = () => advance(title);
    footEl.innerHTML = '';
    footEl.appendChild(btn);
  }

  // ── renderers ──────────────────────────────────────────────────────────
  const RENDERERS = {
    intro(ctx) {
      const c = Data.get(ctx.ex.id);
      const isWord = c.category === 'word';
      const meaning = c.meaning ? `<div class="word-meaning">“${c.meaning}”</div>` : '';
      const node = el(`
        <div class="intro">
          <div class="big-glyph${isWord ? ' word' : ''}">${c.glyph}</div>
          <div class="big-roman">${c.roman}</div>
          ${meaning}
          <button class="speak">🔊 Hear it</button>
          <p class="hint">${isWord ? 'New word' : 'New character'}</p>
        </div>`);
      node.querySelector('.speak').onclick = () => TTS.speak(c.glyph);
      ctx.exEl.appendChild(node);
      TTS.speak(c.glyph);
      continueButton(ctx.footEl, ctx.title);
    },

    mc(ctx) {
      const target = Data.get(ctx.ex.id);
      const recognize = ctx.ex.mode === 'recognize';
      const isWord = target.category === 'word';
      // For words, the English meaning is always on screen while practicing.
      const meaningLine = isWord && target.meaning ? `<div class="word-meaning">“${target.meaning}”</div>` : '';
      const prompt = recognize
        ? `<div class="big-glyph${isWord ? ' word' : ''}">${target.glyph}</div>${meaningLine}<button class="speak">🔊</button><p class="hint">${isWord ? 'How do you read this?' : 'Which sound is this?'}</p>`
        : `<div class="big-roman">${target.roman}</div>${meaningLine}<p class="hint">${isWord ? 'Which word is this?' : 'Which character is this?'}</p>`;
      const node = el(`<div class="mc">${prompt}<div class="options"></div></div>`);
      const optsEl = node.querySelector('.options');
      ctx.exEl.appendChild(node);
      if (recognize) {
        node.querySelector('.speak').onclick = () => TTS.speak(target.glyph);
        TTS.speak(target.glyph); // sound plays, with romanization options visible
      }

      let answered = false;
      for (const oid of optionsFor(target.id)) {
        const o = Data.get(oid);
        const b = el(`<button class="option${recognize ? '' : ' glyph'}">${recognize ? o.roman : o.glyph}</button>`);
        b.dataset.id = oid;
        b.onclick = () => {
          if (answered) return;
          answered = true;
          const correct = oid === target.id;
          b.classList.add(correct ? 'correct' : 'wrong');
          if (!correct) {
            [...optsEl.children].find((c) => c.dataset.id === target.id)?.classList.add('correct');
          }
          [...optsEl.children].forEach((c) => (c.disabled = true));
          record(correct, ctx.ex);
          continueButton(ctx.footEl, ctx.title);
        };
        optsEl.appendChild(b);
      }
    },

    match(ctx) {
      const ids = ctx.ex.ids;
      const by = ctx.ex.by || 'roman'; // 'meaning' → match words to English meanings
      const rightLabel = (id) => {
        const it = Data.get(id);
        return by === 'meaning' ? (it.meaning || it.roman) : it.roman;
      };
      const node = el(`
        <div class="match">
          <p class="hint">${by === 'meaning' ? 'Match words to meanings' : 'Match the pairs'}</p>
          <div class="cols"><div class="col left"></div><div class="col right"></div></div>
        </div>`);
      const leftEl = node.querySelector('.left');
      const rightEl = node.querySelector('.right');
      ctx.exEl.appendChild(node);

      const matched = new Set();
      let mistakeMade = false;
      let selected = null; // { kind, id, btn }

      function token(kind, id, label) {
        const b = el(`<button class="token tok-${kind}">${label}</button>`);
        b.dataset.id = id;
        b.onclick = () => {
          if (matched.has(id) || (selected && selected.btn === b)) return;
          if (!selected) {
            selected = { kind, id, btn: b };
            b.classList.add('sel');
            return;
          }
          if (selected.kind === kind) { // re-pick within same column
            selected.btn.classList.remove('sel');
            selected = { kind, id, btn: b };
            b.classList.add('sel');
            return;
          }
          const ok = selected.id === id; // opposite columns → evaluate
          selected.btn.classList.remove('sel');
          if (ok) {
            matched.add(id);
            for (const t of [selected.btn, b]) { t.classList.add('done'); t.disabled = true; }
            if (matched.size === ids.length) {
              record(!mistakeMade, ctx.ex);
              continueButton(ctx.footEl, ctx.title);
            }
          } else {
            mistakeMade = true;
            for (const t of [selected.btn, b]) {
              t.classList.add('miss');
              setTimeout(() => t.classList.remove('miss'), 350);
            }
          }
          selected = null;
        };
        return b;
      }

      for (const id of shuffle(ids)) leftEl.appendChild(token('glyph', id, Data.get(id).glyph));
      for (const id of shuffle(ids)) rightEl.appendChild(token('roman', id, rightLabel(id)));
    },

    tracing(ctx) {
      const c = Data.get(ctx.ex.id);
      const strength = SRS.strength(Data.peek(c.id));
      // Scaffolding fades as strength grows: guide → faint → blind.
      const level = strength >= 4 ? 'blind' : strength >= 2 ? 'faint' : 'guide';
      const guideOpacity = level === 'guide' ? 0.33 : level === 'faint' ? 0.12 : 0;
      const label = level === 'guide' ? 'Trace over the guide'
        : level === 'faint' ? 'Faint guide — trace it'
        : 'Draw it from memory';

      const SIZE = 300;
      const font = fitFont(c.glyph, SIZE, 'system-ui, "Noto Sans Kannada", sans-serif');
      const node = el(`
        <div class="tracing">
          <div class="big-roman">${c.roman}</div>
          <p class="hint">${label}</p>
          <div class="canvas-wrap">
            <canvas class="trace-canvas" width="${SIZE}" height="${SIZE}"></canvas>
          </div>
          <div class="trace-tools">
            <button class="speak">🔊</button>
            <button class="clear">Clear</button>
          </div>
          <p class="trace-result hint"></p>
        </div>`);
      ctx.exEl.appendChild(node);
      TTS.speak(c.glyph);

      const canvas = node.querySelector('.trace-canvas');
      const g = canvas.getContext('2d');
      const ink = document.createElement('canvas'); // user strokes only (for scoring)
      ink.width = SIZE; ink.height = SIZE;
      const ig = ink.getContext('2d');
      const brush = 16;

      function paintGuide() {
        g.clearRect(0, 0, SIZE, SIZE);
        if (guideOpacity > 0) {
          g.save();
          g.globalAlpha = guideOpacity;
          g.fillStyle = '#2b2b2b';
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
          g.fillText(c.glyph, SIZE / 2, SIZE / 2);
          g.restore();
        }
        g.drawImage(ink, 0, 0); // keep prior ink on top of the guide
      }
      paintGuide();

      let drawing = false, last = null;
      function pos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (SIZE / r.width), y: (e.clientY - r.top) * (SIZE / r.height) };
      }
      function line(c2, color, a, b) {
        c2.strokeStyle = color; c2.lineWidth = brush; c2.lineCap = 'round'; c2.lineJoin = 'round';
        c2.beginPath(); c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); c2.stroke();
      }
      canvas.addEventListener('pointerdown', (e) => {
        drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const p = pos(e);
        line(g, ACCENT, last, p);  // visible
        line(ig, '#000', last, p); // scoring layer
        last = p;
      });
      const stop = () => { drawing = false; };
      canvas.addEventListener('pointerup', stop);
      canvas.addEventListener('pointercancel', stop);

      node.querySelector('.speak').onclick = () => TTS.speak(c.glyph);
      node.querySelector('.clear').onclick = () => { ig.clearRect(0, 0, SIZE, SIZE); paintGuide(); };

      let scored = false;
      const checkBtn = el('<button class="action">Check</button>');
      checkBtn.onclick = () => {
        if (scored) return;
        scored = true;
        const { coverage, accuracy } = scoreTrace(c.glyph, ink, SIZE, font);
        const passCoverage = level === 'blind' ? 0.42 : 0.5;
        const pass = coverage >= passCoverage && accuracy >= 0.55;
        node.querySelector('.trace-result').textContent =
          `${Math.round(coverage * 100)}% traced — ${pass ? 'nice!' : 'keep practicing'}`;
        record(pass, ctx.ex);
        continueButton(ctx.footEl, ctx.title);
      };
      ctx.footEl.appendChild(checkBtn);
    },
  };

  function finish(title) {
    // Strength = distinct lessons encountered: credit every character that
    // appeared anywhere in this completed session, once.
    const encountered = new Set();
    for (const ex of queue) {
      if (ex.id) encountered.add(ex.id);
      if (ex.ids) for (const id of ex.ids) encountered.add(id);
    }
    for (const id of encountered) SRS.encounter(Data.item(id));

    if (onComplete) onComplete(stats);

    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 100;
    root.innerHTML = `
      <div class="session summary">
        <div class="big-glyph">🎉</div>
        <h2>${title} complete</h2>
        <p class="hint">${stats.correct}/${stats.total} correct${stats.total ? ` · ${pct}%` : ''}</p>
        <div class="foot"></div>
      </div>`;
    const btn = el('<button class="action">Back to map</button>');
    btn.onclick = () => { location.hash = returnTo; };
    root.querySelector('.foot').appendChild(btn);
  }

  return { start, buildLessonQueue, buildReviewQueue };
})();
