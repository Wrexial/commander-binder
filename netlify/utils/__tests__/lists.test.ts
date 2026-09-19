import { describe, it, expect } from 'vitest';
import {
  MAX_LIST_NAME_LENGTH,
  MAX_LIST_NOTES_LENGTH,
  MAX_LISTS,
  parseCardIdList,
  parseIsPublic,
  parseListId,
  parseListName,
  parseListNotes,
  parseMergeLists,
} from '../lists';

describe('parseListName', () => {
  it('trims and accepts a normal name', () => {
    expect(parseListName('  Trade pile  ')).toEqual({ ok: true, value: 'Trade pile' });
  });

  it('rejects non-strings and blank names', () => {
    expect(parseListName(42).ok).toBe(false);
    expect(parseListName('   ').ok).toBe(false);
  });

  it('caps the length', () => {
    expect(parseListName('a'.repeat(MAX_LIST_NAME_LENGTH)).ok).toBe(true);
    expect(parseListName('a'.repeat(MAX_LIST_NAME_LENGTH + 1)).ok).toBe(false);
  });
});

describe('parseListNotes', () => {
  it('defaults to an empty string', () => {
    expect(parseListNotes(undefined)).toEqual({ ok: true, value: '' });
    expect(parseListNotes(null)).toEqual({ ok: true, value: '' });
  });

  it('rejects non-strings and over-long notes', () => {
    expect(parseListNotes(5).ok).toBe(false);
    expect(parseListNotes('a'.repeat(MAX_LIST_NOTES_LENGTH + 1)).ok).toBe(false);
  });
});

describe('parseIsPublic', () => {
  it('defaults to false', () => {
    expect(parseIsPublic(undefined)).toEqual({ ok: true, value: false });
  });

  it('accepts a boolean and rejects anything else', () => {
    expect(parseIsPublic(true)).toEqual({ ok: true, value: true });
    expect(parseIsPublic('yes').ok).toBe(false);
  });
});

describe('parseListId', () => {
  it('requires a non-empty string', () => {
    expect(parseListId('abc')).toEqual({ ok: true, value: 'abc' });
    expect(parseListId('').ok).toBe(false);
    expect(parseListId(null).ok).toBe(false);
  });
});

describe('parseCardIdList', () => {
  it('accepts an empty array and non-empty strings', () => {
    expect(parseCardIdList([])).toEqual({ ok: true, value: [] });
    expect(parseCardIdList(['a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('rejects holes and non-arrays', () => {
    expect(parseCardIdList(['a', '']).ok).toBe(false);
    expect(parseCardIdList('a').ok).toBe(false);
  });
});

describe('parseMergeLists', () => {
  it('normalizes a payload', () => {
    const result = parseMergeLists([
      { name: ' Trade pile ', notes: 'spares', isPublic: true, cardIds: ['a'] },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ name: 'Trade pile', notes: 'spares', isPublic: true, cardIds: ['a'] }],
    });
  });

  it('tolerates a missing notes/isPublic/cardIds', () => {
    expect(parseMergeLists([{ name: 'Deck' }])).toEqual({
      ok: true,
      value: [{ name: 'Deck', notes: '', isPublic: false, cardIds: [] }],
    });
  });

  it('rejects malformed entries and an over-long list array', () => {
    expect(parseMergeLists([{ name: '' }]).ok).toBe(false);
    expect(parseMergeLists(['nope']).ok).toBe(false);
    expect(parseMergeLists(Array.from({ length: MAX_LISTS + 1 }, () => ({ name: 'x' }))).ok).toBe(
      false
    );
  });
});
