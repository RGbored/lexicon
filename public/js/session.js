'use strict';

/**
 * Runs a practice session: a queue of exercises rendered one at a time, each
 * grading the involved item(s) through the SRS. Wrong answers requeue once.
 *
 * Exercise shapes:
 *   { type:'intro', id }                   teach a new character
 *   { type:'mc', mode:'recognize', id }    show glyph (+ sound) → pick romanization
 *   { type:'mc', mode:'recall', id }       show romanization → pick glyph
 *   { type:'match', ids:[...] }            match glyphs ↔ romanizations
 *   { type:'tracing', id }                 handwrite the glyph on a canvas
 *
 * Sound always plays alongside on-screen romanization (the TTS isn't reliable
 * enough to test by ear alone), so there are no sound-only exercises.
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

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // 3 distractors for a target, preferring same-category characters.
  function distractors(targetId, count = 3) {
    const target = Data.get(targetId);
    const same = Data.all().filter((c) => c.id !== targetId && c.category === target.category);
    const pool = same.length >= count ? same : Data.all().filter((c) => c.id !== targetId);
    return shuffle(pool).slice(0, count).map((c) => c.id);
  }
  const optionsFor = (targetId) => shuffle([targetId, ...distractors(targetId)]);

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
  // New characters are introduced one at a time, each immediately followed by
  // two drills, so two intros are never back-to-back (always >=2 exercises
  // between new characters). Match, tracing and light review consolidate after.
  function buildLessonQueue(lesson, learnedPool) {
    const newIds = lesson.ids.slice();
    const q = [];
    for (const id of newIds) {
      q.push({ type: 'intro', id });
      q.push({ type: 'mc', mode: 'recognize', id });
      q.push({ type: 'mc', mode: 'recall', id });
    }
    q.push({ type: 'match', ids: newIds.slice(0, 5) });
    for (const id of newIds) q.push({ type: 'tracing', id });
    const review = shuffle(learnedPool.filter((id) => !newIds.includes(id))).slice(0, 3);
    for (const id of review) {
      q.push({ type: 'mc', mode: Math.random() < 0.5 ? 'recognize' : 'recall', id });
    }
    return q;
  }

  function buildReviewQueue(dueIds) {
    return dueIds.map((id, i) => {
      const r = i % 3;
      if (r === 0) return { type: 'mc', mode: 'recognize', id };
      if (r === 1) return { type: 'mc', mode: 'recall', id };
      return { type: 'tracing', id };
    });
  }

  // ── runtime state ──────────────────────────────────────────────────────
  let queue = [];
  let idx = 0;
  let onComplete = null;
  let stats = { correct: 0, total: 0 };
  let root = null;

  function start({ queue: q, title, onComplete: done }) {
    queue = q.slice();
    idx = 0;
    stats = { correct: 0, total: 0 };
    onComplete = done;
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

  // Grade involved items, update stats, requeue once on a miss.
  function record(correct, ids, ex) {
    for (const id of ids) SRS.grade(Data.item(id), correct);
    stats.total += 1;
    if (correct) stats.correct += 1;
    if (!correct && !ex._requeued) {
      ex._requeued = true;
      queue.push({ ...ex });
    }
    Data.save();
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
      Data.item(c.id).seen = true;
      const node = el(`
        <div class="intro">
          <div class="big-glyph">${c.glyph}</div>
          <div class="big-roman">${c.roman}</div>
          <button class="speak">🔊 Hear it</button>
          <p class="hint">New character</p>
        </div>`);
      node.querySelector('.speak').onclick = () => TTS.speak(c.glyph);
      ctx.exEl.appendChild(node);
      TTS.speak(c.glyph);
      continueButton(ctx.footEl, ctx.title);
    },

    mc(ctx) {
      const target = Data.get(ctx.ex.id);
      const recognize = ctx.ex.mode === 'recognize';
      const prompt = recognize
        ? `<div class="big-glyph">${target.glyph}</div><button class="speak">🔊</button><p class="hint">Which sound is this?</p>`
        : `<div class="big-roman">${target.roman}</div><p class="hint">Which character is this?</p>`;
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
          record(correct, [target.id], ctx.ex);
          continueButton(ctx.footEl, ctx.title);
        };
        optsEl.appendChild(b);
      }
    },

    match(ctx) {
      const ids = ctx.ex.ids;
      const node = el(`
        <div class="match">
          <p class="hint">Match the pairs</p>
          <div class="cols"><div class="col left"></div><div class="col right"></div></div>
        </div>`);
      const leftEl = node.querySelector('.left');
      const rightEl = node.querySelector('.right');
      ctx.exEl.appendChild(node);

      const matched = new Set();
      const mistakes = new Set();
      let selected = null; // { kind, id, btn }

      function token(kind, id, label) {
        const b = el(`<button class="token">${label}</button>`);
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
              for (const mid of ids) record(!mistakes.has(mid), [mid], ctx.ex);
              continueButton(ctx.footEl, ctx.title);
            }
          } else {
            mistakes.add(selected.id); mistakes.add(id);
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
      for (const id of shuffle(ids)) rightEl.appendChild(token('roman', id, Data.get(id).roman));
    },

    tracing(ctx) {
      const c = Data.get(ctx.ex.id);
      const strength = Data.peek(c.id)?.strength ?? 0;
      // Scaffolding tied to strength: full guide first, fading as it's mastered.
      const level = strength >= 5 ? 'blind' : strength >= 4 ? 'faint' : 'guide';
      const guideOpacity = level === 'guide' ? 0.33 : level === 'faint' ? 0.12 : 0;
      const label = level === 'guide' ? 'Trace over the guide'
        : level === 'faint' ? 'Faint guide — trace it'
        : 'Draw it from memory';

      const SIZE = 300;
      const font = `${SIZE * 0.72}px system-ui, "Noto Sans Kannada", sans-serif`;
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
        record(pass, [c.id], ctx.ex);
        continueButton(ctx.footEl, ctx.title);
      };
      ctx.footEl.appendChild(checkBtn);
    },
  };

  function finish(title) {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 100;
    if (onComplete) onComplete(stats);
    root.innerHTML = `
      <div class="session summary">
        <div class="big-glyph">🎉</div>
        <h2>${title} complete</h2>
        <p class="hint">${stats.correct}/${stats.total} correct${stats.total ? ` · ${pct}%` : ''}</p>
        <div class="foot"></div>
      </div>`;
    const btn = el('<button class="action">Back to map</button>');
    btn.onclick = () => { location.hash = '#/'; };
    root.querySelector('.foot').appendChild(btn);
  }

  return { start, buildLessonQueue, buildReviewQueue };
})();
