import { describe, it, expect } from 'vitest';
import { parseCardIds } from '../mergeOwned';
import { MAX_BATCH_SIZE } from '../request';

describe('parseCardIds', () => {
  it('accepts an empty list', () => {
    expect(parseCardIds([])).toEqual({ ok: true, ids: [] });
  });

  it('accepts a list of non-empty string ids', () => {
    expect(parseCardIds(['a', 'b'])).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('rejects a non-array payload', () => {
    const result = parseCardIds('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('array');
  });

  it('rejects entries that are empty or not strings', () => {
    expect(parseCardIds(['a', '']).ok).toBe(false);
    expect(parseCardIds(['a', 5]).ok).toBe(false);
  });

  it('rejects a list over the per-request cap', () => {
    const ids = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `c${i}`);
    const result = parseCardIds(ids);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(String(MAX_BATCH_SIZE));
  });
});
