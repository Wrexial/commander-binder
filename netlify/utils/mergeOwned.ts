import { MAX_BATCH_SIZE } from './request';

export type CardIdParseResult = { ok: true; ids: string[] } | { ok: false; message: string };

/**
 * Validate and normalize the `cardIds` payload for the merge endpoint. Unlike
 * the batch toggle, a merge accepts an empty list (a guest with nothing local
 * yet), so only the shape and the per-request cap are enforced.
 */
export function parseCardIds(value: unknown): CardIdParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, message: "'cardIds' must be an array." };
  }
  if (value.length > MAX_BATCH_SIZE) {
    return { ok: false, message: `'cardIds' is limited to ${MAX_BATCH_SIZE} entries.` };
  }

  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length !== value.length) {
    return { ok: false, message: "'cardIds' must contain non-empty strings." };
  }

  return { ok: true, ids };
}
