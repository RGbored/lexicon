'use strict';

/**
 * Router + home screen (the lesson map). Hash routes:
 *   #/                       lesson map
 *   #/lesson/:unit/:index    run a lesson
 *   #/review                 run a review session
 */
const App = (() => {
  let units = [];
  const statusEl = () => document.getElementById('status');
  const contentEl = () => document.getElementById('content');

  // ── unlock / progress helpers ────────────────────────────────────────────
  const unitDone = (u) => Data.unit(u.id).lessonsDone >= u.lessons.length;

  function unitUnlocked(i) {
    return i === 0 || unitDone(units[i - 1]);
  }

  function dueIds() {
    const items = Data.progressData().items;
    const now = Date.now();
    return Object.keys(items)
      .filter((id) => SRS.isDue(items[id], now) && Data.get(id))
      .sort((a, b) => items[a].due - items[b].due);
  }

  // ── home ─────────────────────────────────────────────────────────────────
  function home() {
    const due = dueIds();
    const root = contentEl();
    root.innerHTML = '';

    if (due.length) {
      const review = document.createElement('button');
      review.className = 'review-banner';
      review.innerHTML = `<span>🔁 Review</span><span class="count">${due.length} due</span>`;
      review.onclick = () => { location.hash = '#/review'; };
      root.appendChild(review);
    }

    units.forEach((u, ui) => {
      const unlocked = unitUnlocked(ui);
      const done = Data.unit(u.id).lessonsDone;
      const section = document.createElement('section');
      section.className = 'unit' + (unlocked ? '' : ' locked');
      section.innerHTML = `<h2>${u.title} <span class="unit-prog">${done}/${u.lessons.length}</span></h2>`;

      const map = document.createElement('div');
      map.className = 'lesson-map';
      u.lessons.forEach((lesson, li) => {
        const isDone = li < done;
        const isOpen = unlocked && li <= done;
        const node = document.createElement('button');
        node.className = 'lesson' + (isDone ? ' done' : isOpen ? ' open' : ' locked');
        node.disabled = !isOpen;
        const preview = lesson.ids.map((id) => Data.get(id).glyph).join(' ');
        node.innerHTML = `<span class="lesson-glyphs">${preview}</span>` +
          `<span class="lesson-tag">${isDone ? '✓' : isOpen ? '▶' : '🔒'}</span>`;
        node.onclick = () => { location.hash = `#/lesson/${u.id}/${li}`; };
        map.appendChild(node);
      });
      section.appendChild(map);
      root.appendChild(section);
    });

    renderStrengthDashboard(root);

    const learned = Object.values(Data.progressData().items).filter((i) => i.seen).length;
    statusEl().textContent = `${learned} characters seen` + (due.length ? ` · ${due.length} due for review` : '');
  }

  // Per-character strength (0–5) shown as a 5-segment meter. Strength grows with
  // the number of lessons a character has appeared in (full at SRS.FULL_LESSONS).
  // Seen characters are highlighted; unseen ones stay faint.
  function renderStrengthDashboard(root) {
    const section = document.createElement('section');
    section.className = 'unit';
    section.innerHTML = `<h2>Strength <span class="unit-prog">full at ${SRS.FULL_LESSONS} lessons</span></h2>`;
    const grid = document.createElement('div');
    grid.className = 'strength-grid';
    for (const c of Data.all()) {
      const it = Data.peek(c.id);
      const s = SRS.strength(it);
      const lessons = it ? it.lessons : 0;
      const cell = document.createElement('div');
      cell.className = 'scell' + (it && it.seen ? '' : ' unseen');
      cell.title = `${lessons} lesson${lessons === 1 ? '' : 's'}`;
      const meter = [0, 1, 2, 3, 4].map((i) => `<i class="${i < s ? 'on' : ''}"></i>`).join('');
      cell.innerHTML =
        `<span class="sg">${c.glyph}</span>` +
        `<span class="sr">${c.roman}</span>` +
        `<span class="meter">${meter}</span>`;
      grid.appendChild(cell);
    }
    section.appendChild(grid);
    root.appendChild(section);
  }

  // ── sessions ──────────────────────────────────────────────────────────────
  function learnedPool() {
    const items = Data.progressData().items;
    return Object.keys(items).filter((id) => items[id].seen && Data.get(id));
  }

  function startLesson(unitId, li) {
    const u = units.find((x) => x.id === unitId);
    if (!u || !u.lessons[li]) return home();
    const lesson = u.lessons[li];
    statusEl().textContent = `${u.title} · lesson ${li + 1}`;
    Session.start({
      title: `${u.title} ${li + 1}`,
      queue: Session.buildLessonQueue(lesson, learnedPool()),
      onComplete: () => {
        const unit = Data.unit(u.id);
        if (li === unit.lessonsDone) unit.lessonsDone += 1; // sequential advance
        Data.saveNow();
      },
    });
  }

  function startReview() {
    const due = dueIds();
    if (!due.length) return home();
    statusEl().textContent = 'Review';
    Session.start({
      title: 'Review',
      queue: Session.buildReviewQueue(due.slice(0, 15)),
      onComplete: () => Data.saveNow(),
    });
  }

  // ── routing ───────────────────────────────────────────────────────────────
  function setActiveTab(hash) {
    const reading = hash.startsWith('#/reading') || hash.startsWith('#/text');
    document.querySelectorAll('.tabs a').forEach((a) => {
      a.classList.toggle('active', (a.dataset.tab === 'reading') === reading);
    });
  }

  function renderStats() {
    const bar = document.getElementById('stats');
    if (!bar || !Data.progressData()) return;
    const s = Stats.ensure(Data.progressData());
    const done = Stats.todayDone(Data.progressData());
    bar.innerHTML =
      `<span class="stat flame${done ? ' on' : ''}">🔥 ${s.streak}</span>` +
      `<span class="stat">⭐ ${s.points}</span>` +
      `<span class="stat">❄️ ${s.freezes}</span>`;
  }

  function route() {
    const hash = location.hash || '#/';
    const parts = hash.split('/'); // ['#', 'text', 'id', 'lesson', '0']
    setActiveTab(hash);
    renderStats();
    if (parts[1] === 'lesson' && parts[2] != null && parts[3] != null) {
      startLesson(parts[2], parseInt(parts[3], 10));
    } else if (parts[1] === 'review') {
      startReview();
    } else if (parts[1] === 'reading') {
      Reading.home(contentEl());
    } else if (parts[1] === 'text' && parts[2] != null) {
      const id = decodeURIComponent(parts[2]);
      if (parts[3] === 'lesson' && parts[4] != null) Reading.startLesson(id, parseInt(parts[4], 10));
      else if (parts[3] === 'read') Reading.read(id, contentEl());
      else Reading.text(id, contentEl());
    } else {
      home();
    }
  }

  async function boot() {
    try {
      await Promise.all([Data.load(), Reading.load()]);
      units = Curriculum.build(Data.all());
      window.addEventListener('hashchange', route);
      document.getElementById('home-link').onclick = (e) => {
        e.preventDefault();
        location.hash = '#/';
      };
      route();
    } catch (err) {
      statusEl().textContent = 'Could not load. Did you run `npm run generate`?';
      console.error(err);
    }
  }

  return { boot };
})();

App.boot();
