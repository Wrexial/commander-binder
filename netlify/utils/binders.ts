// netlify/utils/binders.ts
import type { ParseResult } from './lists';

/** Upper bound on how many binders one account may hold. */
export const MAX_BINDERS = 50;

/** Binder names are short labels ("Trade binder", "Modern 2024"). */
export const MAX_BINDER_NAME_LENGTH = 60;

/** Pocket-grid bounds; matches the client's Binder Builder limits. */
export const MAX_BINDER_COLUMNS = 16;
export const MAX_BINDER_ROWS = 16;
export const MAX_BINDER_PAGES = 200;

/** A binder can't hold more occupied pockets than this (payload guard). */
export const MAX_BINDER_SLOTS = 10000;
/** Serialized slots size cap, so one binder can't bloat a request/row. */
export const MAX_BINDER_SLOTS_BYTES = 1024 * 1024;

/** `"page:row:col"` for one pocket. */
const SLOT_KEY = /^\d+:\d+:\d+$/;

export type BinderSlots = Record<string, string>;

/** A trimmed, non-empty binder name within {@link MAX_BINDER_NAME_LENGTH}. */
export function parseBinderName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, message: "'name' must be a string." };
  }
  const name = value.trim();
  if (name.length === 0) {
    return { ok: false, message: "'name' must not be empty." };
  }
  if (name.length > MAX_BINDER_NAME_LENGTH) {
    return { ok: false, message: `'name' is limited to ${MAX_BINDER_NAME_LENGTH} characters.` };
  }
  return { ok: true, value: name };
}

/** A non-empty binder id. */
export function parseBinderId(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, message: "'binderId' must be a non-empty string." };
  }
  return { ok: true, value };
}

/**
 * A grid dimension (columns/rows/pages). Missing values fall back to the
 * provided default; anything present must be an in-range integer.
 */
export function parseBinderDimension(
  value: unknown,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback: number }
): ParseResult<number> {
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false, message: `'${field}' must be an integer between ${min} and ${max}.` };
  }
  return { ok: true, value };
}

/** The grid dimensions of a binder, validated against the shared bounds. */
export function parseBinderDimensions(record: Record<string, unknown>): ParseResult<{
  columns: number;
  rows: number;
  pages: number;
}> {
  const columns = parseBinderDimension(record.columns, 'columns', {
    min: 1,
    max: MAX_BINDER_COLUMNS,
    fallback: 3,
  });
  if (!columns.ok) return columns;
  const rows = parseBinderDimension(record.rows, 'rows', {
    min: 1,
    max: MAX_BINDER_ROWS,
    fallback: 3,
  });
  if (!rows.ok) return rows;
  const pages = parseBinderDimension(record.pages, 'pages', {
    min: 1,
    max: MAX_BINDER_PAGES,
    fallback: 1,
  });
  if (!pages.ok) return pages;

  return { ok: true, value: { columns: columns.value, rows: rows.value, pages: pages.value } };
}

/**
 * Validate a `slots` payload (`"page:row:col" -> printing id`). A missing value
 * becomes the empty map. Keys and values are strictly checked so a malformed
 * map can never reach the database.
 */
export function parseBinderSlots(value: unknown): ParseResult<BinderSlots> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: "'slots' must be an object." };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_BINDER_SLOTS) {
    return { ok: false, message: `'slots' is limited to ${MAX_BINDER_SLOTS} entries.` };
  }

  const slots: BinderSlots = {};
  for (const [key, id] of entries) {
    if (!SLOT_KEY.test(key)) {
      return { ok: false, message: `Invalid slot key '${key}'.` };
    }
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, message: 'Each slot must map to a non-empty printing id.' };
    }
    slots[key] = id;
  }

  if (JSON.stringify(slots).length > MAX_BINDER_SLOTS_BYTES) {
    return { ok: false, message: "'slots' is too large." };
  }

  return { ok: true, value: slots };
}

export type MergeBinder = {
  name: string;
  columns: number;
  rows: number;
  pages: number;
  slots: BinderSlots;
};

/**
 * Validate the `binders` payload a guest sends when merging device-local
 * binders into their account. The handler unions them by name, so re-sending
 * after a failure is safe.
 */
export function parseMergeBinders(value: unknown): ParseResult<MergeBinder[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "'binders' must be an array." };
  }
  if (value.length > MAX_BINDERS) {
    return { ok: false, message: `'binders' is limited to ${MAX_BINDERS} entries.` };
  }

  const binders: MergeBinder[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, message: 'Each binder must be an object.' };
    }

    const record = entry as Record<string, unknown>;
    const name = parseBinderName(record.name);
    if (!name.ok) return name;
    const dimensions = parseBinderDimensions(record);
    if (!dimensions.ok) return dimensions;
    const slots = parseBinderSlots(record.slots);
    if (!slots.ok) return slots;

    binders.push({
      name: name.value,
      columns: dimensions.value.columns,
      rows: dimensions.value.rows,
      pages: dimensions.value.pages,
      slots: slots.value,
    });
  }

  return { ok: true, value: binders };
}
