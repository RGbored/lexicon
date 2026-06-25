'use strict';

/**
 * Item-type-agnostic spaced-repetition engine (DESIGN.md §3).
 * Operates on plain item objects: { strength, lastSeen, due, seen }.
 * An "item" is a character today and a word later — this module never
 * assumes which.
 */
const SRS = (() => {
  const MAX = 5;
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  // Interval until next due, indexed by strength box (Leitner-style).
  const INTERVALS = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 16 * DAY];
  const LAPSE = 10 * 60 * 1000; // wrong answers resurface in ~10 min

  function newItem() {
    return { strength: 0, lastSeen: 0, due: 0, seen: false };
  }

  function grade(item, correct, now = Date.now()) {
    item.seen = true;
    item.lastSeen = now;
    if (correct) {
      item.strength = Math.min(item.strength + 1, MAX);
      item.due = now + INTERVALS[item.strength];
    } else {
      item.strength = Math.max(item.strength - 1, 0);
      item.due = now + LAPSE;
    }
    return item;
  }

  function isDue(item, now = Date.now()) {
    return !!item && item.seen && item.due <= now;
  }

  return { MAX, newItem, grade, isDue };
})();
