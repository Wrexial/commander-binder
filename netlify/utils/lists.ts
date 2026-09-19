// netlify/utils/lists.ts
import { MAX_BATCH_SIZE } from './request';

/** Upper bound on how many named lists one account may hold. */
export const MAX_LISTS = 100;

/** List names are short labels ("Trade pile", "Deck: Atraxa"). */
export const MAX_LIST_NAME_LENGTH = 60;

/** Per-list notes (a deck plan, trade terms, …) — generous but bounded. */
export const MAX_LIST_NOTES_LENGTH = 2000;

/** A single add/remove request never carries more card ids than a batch toggle. */
export const MAX_LIST_ITEMS = MAX_BATCH_SIZE;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** A trimmed, non-empty list name within {@link MAX_LIST_NAME_LENGTH}. */
export function parseListName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, message: "'name' must be a string." };
  }
  const name = value.trim();
  if (name.length === 0) {
    return { ok: false, message: "'name' must not be empty." };
  }
  if (name.length > MAX_LIST_NAME_LENGTH) {
    return { ok: false, message: `'name' is limited to ${MAX_LIST_NAME_LENGTH} characters.` };
  }
  return { ok: true, value: name };
}

/** Optional notes; a missing value becomes the empty string. */
export function parseListNotes(value: unknown): ParseResult<string> {
  if (value === undefined || value === null) return { ok: true, value: '' };
  if (typeof value !== 'string') {
    return { ok: false, message: "'notes' must be a string." };
  }
  if (value.length > MAX_LIST_NOTES_LENGTH) {
    return { ok: false, message: `'notes' is limited to ${MAX_LIST_NOTES_LENGTH} characters.` };
  }
  return { ok: true, value };
}

/** Optional public flag; a missing value defaults to private. */
export function parseIsPublic(value: unknown): ParseResult<boolean> {
  if (value === undefined || value === null) return { ok: true, value: false };
  if (typeof value !== 'boolean') {
    return { ok: false, message: "'isPublic' must be a boolean." };
  }
  return { ok: true, value };
}

/** A non-empty list id. */
export function parseListId(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, message: "'listId' must be a non-empty string." };
  }
  return { ok: true, value };
}

/**
 * Validate and normalize a `cardIds` payload for a list item mutation. An empty
 * array is accepted (a no-op), matching the merge endpoint's tolerance.
 */
export function parseCardIdList(value: unknown): ParseResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "'cardIds' must be an array." };
  }
  if (value.length > MAX_LIST_ITEMS) {
    return { ok: false, message: `'cardIds' is limited to ${MAX_LIST_ITEMS} entries.` };
  }

  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length !== value.length) {
    return { ok: false, message: "'cardIds' must contain non-empty strings." };
  }

  return { ok: true, value: ids };
}

export type MergeList = {
  name: string;
  notes: string;
  isPublic: boolean;
  cardIds: string[];
};

/**
 * Validate the `lists` payload a guest sends when merging device-local lists
 * into their account. Returns the normalized lists in payload order; the
 * handler unions them into the account by name (so re-sending is safe).
 */
export function parseMergeLists(value: unknown): ParseResult<MergeList[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "'lists' must be an array." };
  }
  if (value.length > MAX_LISTS) {
    return { ok: false, message: `'lists' is limited to ${MAX_LISTS} entries.` };
  }

  const lists: MergeList[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, message: 'Each list must be an object.' };
    }

    const record = entry as Record<string, unknown>;
    const name = parseListName(record.name);
    if (!name.ok) return name;
    const notes = parseListNotes(record.notes);
    if (!notes.ok) return notes;
    const isPublic = parseIsPublic(record.isPublic);
    if (!isPublic.ok) return isPublic;
    const cardIds = parseCardIdList(record.cardIds ?? []);
    if (!cardIds.ok) return cardIds;

    lists.push({
      name: name.value,
      notes: notes.value,
      isPublic: isPublic.value,
      cardIds: cardIds.value,
    });
  }

  return { ok: true, value: lists };
}
