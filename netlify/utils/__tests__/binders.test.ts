import { describe, it, expect } from 'vitest';
import {
  MAX_BINDERS,
  MAX_BINDER_NAME_LENGTH,
  MAX_BINDER_COLUMNS,
  MAX_BINDER_PAGES,
  MAX_BINDER_SLOTS,
  parseBinderDimension,
  parseBinderDimensions,
  parseBinderId,
  parseBinderName,
  parseBinderSlots,
  parseMergeBinders,
} from '../binders';

describe('parseBinderName', () => {
  it('trims and accepts a normal name', () => {
    expect(parseBinderName('  Trade binder  ')).toEqual({ ok: true, value: 'Trade binder' });
  });

  it('rejects non-strings and blank names', () => {
    expect(parseBinderName(42).ok).toBe(false);
    expect(parseBinderName('   ').ok).toBe(false);
  });

  it('caps the length', () => {
    expect(parseBinderName('a'.repeat(MAX_BINDER_NAME_LENGTH)).ok).toBe(true);
    expect(parseBinderName('a'.repeat(MAX_BINDER_NAME_LENGTH + 1)).ok).toBe(false);
  });
});

describe('parseBinderId', () => {
  it('requires a non-empty string', () => {
    expect(parseBinderId('abc')).toEqual({ ok: true, value: 'abc' });
    expect(parseBinderId('').ok).toBe(false);
    expect(parseBinderId(null).ok).toBe(false);
  });
});

describe('parseBinderDimension', () => {
  it('defaults when missing', () => {
    expect(parseBinderDimension(undefined, 'columns', { min: 1, max: 16, fallback: 3 })).toEqual({
      ok: true,
      value: 3,
    });
  });

  it('accepts in-range integers and rejects everything else', () => {
    expect(parseBinderDimension(5, 'columns', { min: 1, max: 16, fallback: 3 }).ok).toBe(true);
    expect(parseBinderDimension(0, 'columns', { min: 1, max: 16, fallback: 3 }).ok).toBe(false);
    expect(parseBinderDimension(17, 'columns', { min: 1, max: 16, fallback: 3 }).ok).toBe(false);
    expect(parseBinderDimension(4.5, 'columns', { min: 1, max: 16, fallback: 3 }).ok).toBe(false);
    expect(parseBinderDimension('4', 'columns', { min: 1, max: 16, fallback: 3 }).ok).toBe(false);
  });
});

describe('parseBinderDimensions', () => {
  it('validates the whole grid', () => {
    expect(parseBinderDimensions({})).toEqual({
      ok: true,
      value: { columns: 3, rows: 3, pages: 1 },
    });
    expect(parseBinderDimensions({ columns: 4, rows: 4, pages: 10 }).ok).toBe(true);
    expect(parseBinderDimensions({ columns: MAX_BINDER_COLUMNS + 1 }).ok).toBe(false);
    expect(parseBinderDimensions({ pages: MAX_BINDER_PAGES + 1 }).ok).toBe(false);
  });
});

describe('parseBinderSlots', () => {
  it('defaults to an empty map', () => {
    expect(parseBinderSlots(undefined)).toEqual({ ok: true, value: {} });
    expect(parseBinderSlots(null)).toEqual({ ok: true, value: {} });
  });

  it('accepts valid slot keys and ids', () => {
    expect(parseBinderSlots({ '0:0:0': 'card-a', '2:3:4': 'card-b' })).toEqual({
      ok: true,
      value: { '0:0:0': 'card-a', '2:3:4': 'card-b' },
    });
  });

  it('rejects non-objects, bad keys and bad values', () => {
    expect(parseBinderSlots([]).ok).toBe(false);
    expect(parseBinderSlots('x').ok).toBe(false);
    expect(parseBinderSlots({ bad: 'card-a' }).ok).toBe(false);
    expect(parseBinderSlots({ '0:0:0': '' }).ok).toBe(false);
    expect(parseBinderSlots({ '0:0:0': 5 }).ok).toBe(false);
  });

  it('caps the number of slots', () => {
    const slots = Object.fromEntries(
      Array.from({ length: MAX_BINDER_SLOTS + 1 }, (_, i) => [`0:${i}:0`, `card-${i}`])
    );
    expect(parseBinderSlots(slots).ok).toBe(false);
  });
});

describe('parseMergeBinders', () => {
  it('normalizes a payload', () => {
    const result = parseMergeBinders([
      { name: ' Trade binder ', columns: 4, rows: 4, pages: 2, slots: { '0:0:0': 'a' } },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ name: 'Trade binder', columns: 4, rows: 4, pages: 2, slots: { '0:0:0': 'a' } }],
    });
  });

  it('applies dimension defaults and rejects malformed entries', () => {
    expect(parseMergeBinders([{ name: 'X' }])).toEqual({
      ok: true,
      value: [{ name: 'X', columns: 3, rows: 3, pages: 1, slots: {} }],
    });
    expect(parseMergeBinders('x').ok).toBe(false);
    expect(parseMergeBinders([null]).ok).toBe(false);
    expect(parseMergeBinders([{ name: '' }]).ok).toBe(false);
  });

  it('caps the number of binders', () => {
    const many = Array.from({ length: MAX_BINDERS + 1 }, (_, i) => ({ name: `Binder ${i}` }));
    expect(parseMergeBinders(many).ok).toBe(false);
  });
});
