'use strict';

/**
 * Loads the character set + progress from the server and exposes lookups.
 * Progress writes are debounced; saveNow() flushes immediately (used at the
 * end of a lesson so unit completion is durable before navigating).
 */
const Data = (() => {
  let characters = [];
  const byId = new Map();
  let progress = null;
  let saveTimer = null;

  async function load() {
    const [cd, pg] = await Promise.all([
      fetch('/api/characters').then((r) => r.json()),
      fetch('/api/progress').then((r) => r.json()),
    ]);
    if (cd.error) throw new Error(cd.error);
    characters = cd.characters;
    byId.clear();
    for (const c of characters) byId.set(c.id, c);
    progress = pg || {};
    progress.items = progress.items || {};
    progress.units = progress.units || {};
    progress.settings = progress.settings || { romanizationStyle: 'iso15919' };
  }

  const all = () => characters; // alphabet only (curriculum + dashboard)
  const get = (id) => byId.get(id);
  const progressData = () => progress;

  // Ad-hoc items (e.g. words from the Reading module) are resolvable via get()
  // and itemsByCategory() but kept out of all(), so they don't leak into the
  // alphabet curriculum or strength dashboard.
  function registerItems(items) {
    for (const it of items) byId.set(it.id, it);
  }
  function itemsByCategory(category) {
    const out = [];
    for (const it of byId.values()) if (it.category === category) out.push(it);
    return out;
  }

  // Get-or-create the SRS record for an id.
  function item(id) {
    if (!progress.items[id]) progress.items[id] = SRS.newItem();
    return progress.items[id];
  }
  const peek = (id) => progress.items[id] || null;

  function unit(id) {
    if (!progress.units[id]) progress.units[id] = { lessonsDone: 0 };
    return progress.units[id];
  }

  function post() {
    return fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    }).catch((e) => console.warn('save failed', e));
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(post, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    return post();
  }

  return { load, all, get, progressData, item, peek, unit, save, saveNow, registerItems, itemsByCategory };
})();
