'use strict';

/**
 * Router + alphabet navigation. To keep the alphabet tab uncluttered as the
 * character set grows (kagunita, later ottakshara), it drills down:
 *   #/                       section cards (Vowels, Consonants, Kagunita, …)
 *   #/section/:id            a section — lessons, or a grid of series (kagunita)
 *   #/unit/:id               one series' lessons (kagunita)
 *   #/lesson/:unit/:index    run a lesson
 *   #/review                 run a review session
 *   #/strength               per-character strength dashboard
 * Reading mode lives in reading.js (#/reading, #/text/...).
 */
const App = (() => {
  let units = [];
  const SECTION_TITLES = {
    vowels: 'Vowels', consonants: 'Consonants', kagunita: 'Kagunita', ottakshara: 'Ottakshara',
  };

  const statusEl = () => document.getElementById('status');
  const contentEl = () => document.getElementById('content');

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ── structure / unlock helpers ───────────────────────────────────────────
  function sectionIds() {
    const seen = new Set(); const out = [];
    for (const u of units) if (!seen.has(u.section)) { seen.add(u.section); out.push(u.section); }
    return out;
  }
  const unitsOf = (sid) => units.filter((u) => u.section === sid);
  const unitDone = (u) => Data.unit(u.id).lessonsDone >= u.lessons.length;

  // Index of the first not-yet-complete unit; everything up to it is unlocked.
  function firstIncomplete() {
    for (let i = 0; i < units.length; i++) if (!unitDone(units[i])) return i;
    return units.length;
  }
  const unitUnlocked = (u) => units.indexOf(u) <= firstIncomplete();

  function dueIds() {
    const items = Data.progressData().items;
    const now = Date.now();
    return Object.keys(items)
      .filter((id) => SRS.isDue(items[id], now) && Data.get(id))
      .sort((a, b) => items[a].due - items[b].due);
  }
  const seenCharCount = () => Data.all().filter((c) => Data.peek(c.id)?.seen).length;

  function backRow(hash, title) {
    const row = el(`<div class="page-head"><button class="back">←</button><h2>${title}</h2></div>`);
    row.querySelector('.back').onclick = () => { location.hash = hash; };
    return row;
  }

  // ── home: section cards ──────────────────────────────────────────────────
  function home() {
    const root = contentEl();
    root.innerHTML = '';

    const due = dueIds();
    if (due.length) {
      const review = el(`<button class="review-banner"><span>🔁 Review</span><span class="count">${due.length} due</span></button>`);
      review.onclick = () => { location.hash = '#/review'; };
      root.appendChild(review);
    }

    const fi = firstIncomplete();
    for (const sid of sectionIds()) {
      const sUnits = unitsOf(sid);
      const total = sUnits.reduce((a, u) => a + u.lessons.length, 0);
      const done = sUnits.reduce((a, u) => a + Math.min(Data.unit(u.id).lessonsDone, u.lessons.length), 0);
      const unlocked = units.indexOf(sUnits[0]) <= fi;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const tag = done >= total ? '✓' : unlocked ? '▶' : '🔒';
      const card = el(`
        <button class="section-card ${unlocked ? '' : 'locked'}">
          <div class="section-main">
            <span class="section-title">${SECTION_TITLES[sid] || sid}</span>
            <span class="section-sub">${done}/${total} lessons</span>
          </div>
          <div class="cov">
            <div class="cov-bar"><span style="width:${pct}%"></span></div>
            <span class="section-tag">${tag}</span>
          </div>
        </button>`);
      if (unlocked) card.onclick = () => { location.hash = `#/section/${sid}`; };
      else card.disabled = true;
      root.appendChild(card);
    }

    const strengthLink = el('<button class="link-row">View character strength →</button>');
    strengthLink.onclick = () => { location.hash = '#/strength'; };
    root.appendChild(strengthLink);

    statusEl().textContent = `${seenCharCount()} characters seen` + (due.length ? ` · ${due.length} due` : '');
  }

  // ── section: lessons (small sections) or a grid of series (kagunita) ──────
  function renderSection(sid) {
    const root = contentEl();
    const sUnits = unitsOf(sid);
    if (!sUnits.length) return home();
    root.innerHTML = '';
    root.appendChild(backRow('#/', SECTION_TITLES[sid] || sid));

    if (sUnits.length === 1) {
      renderLessonMap(root, sUnits[0]);
    } else {
      const fi = firstIncomplete();
      const grid = el('<div class="series-grid"></div>');
      for (const u of sUnits) {
        const unlocked = units.indexOf(u) <= fi;
        const done = Data.unit(u.id).lessonsDone;
        const cls = done >= u.lessons.length ? 'done' : unlocked ? 'open' : 'locked';
        const tile = el(`<button class="series-tile ${cls}"><span class="series-glyph">${u.glyph || u.title}</span><span class="series-prog">${done}/${u.lessons.length}</span></button>`);
        if (unlocked) tile.onclick = () => { location.hash = `#/unit/${u.id}`; };
        else tile.disabled = true;
        grid.appendChild(tile);
      }
      root.appendChild(grid);
    }
    statusEl().textContent = SECTION_TITLES[sid] || sid;
  }

  function renderUnit(unitId) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return home();
    const root = contentEl();
    root.innerHTML = '';
    root.appendChild(backRow(`#/section/${u.section}`, u.title));
    renderLessonMap(root, u);
    statusEl().textContent = u.title;
  }

  function renderLessonMap(root, u) {
    const unlocked = unitUnlocked(u);
    const done = Data.unit(u.id).lessonsDone;
    const map = el('<div class="lesson-map"></div>');
    u.lessons.forEach((lesson, li) => {
      const isDone = li < done;
      const isOpen = unlocked && li <= done;
      const preview = lesson.ids.map((id) => Data.get(id).glyph).join(' ');
      const node = el(`<button class="lesson ${isDone ? 'done' : isOpen ? 'open' : 'locked'}"><span class="lesson-glyphs">${preview}</span><span class="lesson-tag">${isDone ? '✓' : isOpen ? '▶' : '🔒'}</span></button>`);
      if (isOpen) node.onclick = () => { location.hash = `#/lesson/${u.id}/${li}`; };
      else node.disabled = true;
      map.appendChild(node);
    });
    root.appendChild(map);
  }

  // ── strength dashboard (own page; only characters you've started) ─────────
  function renderStrength() {
    const root = contentEl();
    root.innerHTML = '';
    root.appendChild(backRow('#/', 'Character strength'));

    let any = false;
    for (const sid of sectionIds()) {
      const ids = new Set();
      for (const u of unitsOf(sid)) for (const l of u.lessons) for (const id of l.ids) ids.add(id);
      const seen = [...ids].filter((id) => Data.peek(id)?.seen);
      if (!seen.length) continue;
      any = true;
      const sec = el(`<section class="unit"><h3>${SECTION_TITLES[sid] || sid} <span class="unit-prog">full at ${SRS.FULL_LESSONS} lessons</span></h3><div class="strength-grid"></div></section>`);
      const grid = sec.querySelector('.strength-grid');
      for (const id of seen) {
        const c = Data.get(id);
        const it = Data.peek(id);
        const s = SRS.strength(it);
        const meter = [0, 1, 2, 3, 4].map((i) => `<i class="${i < s ? 'on' : ''}"></i>`).join('');
        grid.appendChild(el(`<div class="scell" title="${it.lessons} lesson${it.lessons === 1 ? '' : 's'}"><span class="sg">${c.glyph}</span><span class="sr">${c.roman}</span><span class="meter">${meter}</span></div>`));
      }
      root.appendChild(sec);
    }
    if (!any) root.appendChild(el('<p class="hint">Complete a lesson to start building strength.</p>'));
    statusEl().textContent = 'Character strength';
  }

  // ── sessions ──────────────────────────────────────────────────────────────
  function learnedPool() {
    const items = Data.progressData().items;
    return Object.keys(items).filter((id) => items[id].seen && Data.get(id));
  }

  function startLesson(unitId, li) {
    const u = units.find((x) => x.id === unitId);
    if (!u || !u.lessons[li]) return home();
    const sUnits = unitsOf(u.section);
    const returnTo = sUnits.length === 1 ? `#/section/${u.section}` : `#/unit/${u.id}`;
    Session.start({
      title: `${u.title} ${li + 1}`,
      queue: Session.buildLessonQueue(u.lessons[li], learnedPool()),
      returnTo,
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
    const parts = hash.split('/'); // ['#', 'section', 'kagunita']
    setActiveTab(hash);
    renderStats();
    if (parts[1] === 'lesson' && parts[2] != null && parts[3] != null) startLesson(parts[2], parseInt(parts[3], 10));
    else if (parts[1] === 'review') startReview();
    else if (parts[1] === 'section' && parts[2] != null) renderSection(parts[2]);
    else if (parts[1] === 'unit' && parts[2] != null) renderUnit(parts[2]);
    else if (parts[1] === 'strength') renderStrength();
    else if (parts[1] === 'reading') Reading.home(contentEl());
    else if (parts[1] === 'text' && parts[2] != null) {
      const id = decodeURIComponent(parts[2]);
      if (parts[3] === 'lesson' && parts[4] != null) Reading.startLesson(id, parseInt(parts[4], 10));
      else if (parts[3] === 'read') Reading.read(id, contentEl());
      else Reading.text(id, contentEl());
    } else home();
  }

  async function boot() {
    try {
      await Promise.all([Data.load(), Reading.load()]);
      units = Curriculum.build(Data.all());
      window.addEventListener('hashchange', route);
      document.getElementById('home-link').onclick = (e) => { e.preventDefault(); location.hash = '#/'; };
      route();
    } catch (err) {
      statusEl().textContent = 'Could not load. Did you run `npm run generate`?';
      console.error(err);
    }
  }

  return { boot };
})();

App.boot();
