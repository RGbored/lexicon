'use strict';

/**
 * Daily streak, streak freezes, and points (DESIGN.md). Lives in progress.stats.
 *
 * - Each completed session awards POINTS_PER points.
 * - The streak increments once per active day; a missed day is bridged by
 *   spending streak freezes (one per missed day), otherwise the streak resets.
 * - PER_WEEK freezes are granted at the start of each new week, capped at MAX.
 */
const Stats = (() => {
  const DAY = 86400000;
  const POINTS_PER = 5;
  const PER_WEEK = 2;
  const MAX_FREEZES = 5;

  // Local-calendar day index (so day boundaries follow the user's timezone).
  function dayNum(t) {
    const d = new Date(t);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  }
  const weekNum = (t) => Math.floor(dayNum(t) / 7);

  function ensure(p) {
    if (!p.stats) p.stats = { points: 0, streak: 0, lastDay: null, freezes: 0, freezeWeek: null };
    return p.stats;
  }

  // Call once per completed session.
  function recordLesson(p, now = Date.now()) {
    const s = ensure(p);
    s.points += POINTS_PER;

    // Weekly freeze grant (also seeds freezes on the very first session).
    const wk = weekNum(now);
    if (s.freezeWeek === null || wk > s.freezeWeek) {
      s.freezes = Math.min(MAX_FREEZES, s.freezes + PER_WEEK);
      s.freezeWeek = wk;
    }

    // Daily streak, spending freezes to bridge missed days.
    const today = dayNum(now);
    if (s.lastDay === null) {
      s.streak = 1;
    } else {
      const gap = today - s.lastDay;
      if (gap <= 0) {
        // already active today — streak unchanged
      } else if (gap === 1) {
        s.streak += 1;
      } else {
        const missed = gap - 1;
        if (s.freezes >= missed) { s.freezes -= missed; s.streak += 1; }
        else { s.streak = 1; }
      }
    }
    s.lastDay = today;
    return s;
  }

  const todayDone = (p, now = Date.now()) => ensure(p).lastDay === dayNum(now);

  return { ensure, recordLesson, todayDone, POINTS_PER, MAX_FREEZES };
})();
