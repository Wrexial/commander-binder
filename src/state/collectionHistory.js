/**
 * A small, device-local history of collection totals, used by the statistics
 * modal to show progress since the last visit.
 *
 * Kept in `localStorage` (not the synced settings blob, which is capped at
 * 8 KB) and capped to a rolling window, one entry per local calendar day.
 * Storage is best-effort: without it the progress section simply shows the
 * "tracking starts today" state.
 */
const STORAGE_KEY = 'collectionHistory';
/** Rolling window (~3 months of daily visits). */
const MAX_ENTRIES = 90;

/** Local YYYY-MM-DD, so "a new day" follows the user's clock, not UTC. */
export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidSnapshot(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.date === 'string' &&
    Number.isFinite(entry.owned) &&
    Number.isFinite(entry.total) &&
    Number.isFinite(entry.value)
  );
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isValidSnapshot) : [];
  } catch {
    return [];
  }
}

function write(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* storage unavailable — the progress section just won't accumulate */
  }
}

/** Every stored snapshot, oldest first. */
export function getHistory() {
  return read();
}

/**
 * Record (or replace) today's snapshot. Returns the most recent entry *before*
 * today, or `null` when this is the first day being tracked.
 *
 * @param {{owned: number, total: number, value: number, setsCompleted?: number}} totals
 * @param {Date} [date] Injectable "now" for tests.
 * @returns {object|null}
 */
export function recordSnapshot({ owned, total, value, setsCompleted = 0 }, date = new Date()) {
  const entries = read();
  const key = dayKey(date);
  const previous = [...entries].reverse().find((entry) => entry.date < key) || null;

  const snapshot = { date: key, owned, total, value, setsCompleted };
  const withoutToday = entries.filter((entry) => entry.date !== key);
  withoutToday.push(snapshot);
  withoutToday.sort((a, b) => a.date.localeCompare(b.date));
  write(withoutToday);

  return previous;
}

/** Drop all history (tests). */
export function resetHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
