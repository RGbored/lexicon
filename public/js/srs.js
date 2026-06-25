'use strict';

/**
 * Item-type-agnostic progress engine (DESIGN.md §3).
 * Operates on plain item objects: { lessons, seen, lastSeen, due }.
 * An "item" is a character today and a word later — this module never assumes
 * which.
 *
 * Strength reflects EXPOSURE, not per-answer correctness: a character grows
 * stronger each distinct lesson/review session it appears in, reaching full
 * strength after FULL_LESSONS sessions. Scheduling (`due`) spaces reviews out
 * further the more often you've seen it.
 */
const SRS = (() => {
  const FULL_LESSONS = 15; // sessions-with-this-character for full strength
  const SEGMENTS = 5;      // strength meter resolution (0–5)

  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  // Review spacing by how many lessons the character has appeared in.
  const INTERVALS = [4 * HOUR, DAY, 2 * DAY, 4 * DAY, 7 * DAY, 12 * DAY, 20 * DAY];

  function newItem() {
    return { lessons: 0, seen: false, lastSeen: 0, due: 0 };
  }

  // Call once per completed session in which the item appeared.
  function encounter(item, now = Date.now()) {
    item.lessons = (item.lessons || 0) + 1;
    item.seen = true;
    item.lastSeen = now;
    item.due = now + INTERVALS[Math.min(item.lessons, INTERVALS.length - 1)];
    return item;
  }

  // 0–SEGMENTS, full at FULL_LESSONS lessons.
  function strength(item) {
    const lessons = item && item.lessons ? item.lessons : 0;
    return Math.min(SEGMENTS, Math.floor((lessons / FULL_LESSONS) * SEGMENTS));
  }

  function isDue(item, now = Date.now()) {
    return !!item && item.seen && item.due <= now;
  }

  return { FULL_LESSONS, SEGMENTS, newItem, encounter, strength, isDue };
})();
