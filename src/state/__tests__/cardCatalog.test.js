import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCatalogNames,
  getCatalogPrintingIds,
  isCardCatalogLoaded,
  rankCatalogNames,
  resetCardCatalog,
  resolveCatalogName,
  resolveCatalogPrintingId,
  setCardCatalog,
} from '../cardCatalog.js';

beforeEach(() => {
  resetCardCatalog();
});

describe('cardCatalog', () => {
  it('starts empty', () => {
    expect(isCardCatalogLoaded()).toBe(false);
    expect(resolveCatalogName('anything')).toBeNull();
    expect(rankCatalogNames('sol')).toEqual([]);
  });

  it('publishes names and the id map', () => {
    setCardCatalog({
      cardNames: ['Sol Ring', 'Solitude', 'Arcane Signet'],
      cardNameById: { 'id-sol': 'Sol Ring', 'id-arc': 'Arcane Signet' },
    });

    expect(isCardCatalogLoaded()).toBe(true);
    expect(getCatalogNames()).toHaveLength(3);
    expect(resolveCatalogName('id-sol')).toBe('Sol Ring');
    expect(resolveCatalogName('unknown')).toBeNull();
  });

  it('ranks prefix matches before word-start and substring matches', () => {
    setCardCatalog({
      cardNames: ['Ring of Three Wishes', 'Sol Ring', 'Isolate'],
      cardNameById: {},
    });

    // 'Ring of…' is a prefix match; 'Sol Ring' matches on its second word.
    expect(rankCatalogNames('ring')).toEqual(['Ring of Three Wishes', 'Sol Ring']);

    // 'Sol Ring' is a prefix match; 'Isolate' only contains the query.
    setCardCatalog({ cardNames: ['Sol Ring', 'Isolate'], cardNameById: {} });
    expect(rankCatalogNames('sol')).toEqual(['Sol Ring', 'Isolate']);
    expect(rankCatalogNames('s')).toEqual([]);
  });

  it('caps the number of results', () => {
    setCardCatalog({
      cardNames: Array.from({ length: 50 }, (_, i) => `Forest ${i}`),
      cardNameById: {},
    });

    expect(rankCatalogNames('forest', 5)).toHaveLength(5);
  });

  it('derives a name -> id lookup when only the id -> name map is present', () => {
    // Older cached subsets predate `cardIdByName`; name resolution must still work.
    setCardCatalog({
      cardNames: ['Sol Ring'],
      cardNameById: { 'id-sol-a': 'Sol Ring', 'id-sol-b': 'Sol Ring' },
    });

    expect(resolveCatalogPrintingId('sol ring')).toBe('id-sol-a');
    expect(resolveCatalogPrintingId('unknown')).toBeNull();
  });

  it('lists every printing id for a name', () => {
    setCardCatalog({
      cardNames: ['Sol Ring'],
      cardNameById: { 'id-sol-a': 'Sol Ring', 'id-sol-b': 'Sol Ring', 'id-other': 'Other' },
    });

    expect(getCatalogPrintingIds('sol ring')).toEqual(['id-sol-a', 'id-sol-b']);
    expect(getCatalogPrintingIds('unknown')).toBeNull();
    // The returned array is a copy, so a caller can't mutate the catalog.
    getCatalogPrintingIds('sol ring').push('nope');
    expect(getCatalogPrintingIds('sol ring')).toEqual(['id-sol-a', 'id-sol-b']);
  });

  it('matches a multi-face card by its full or front-face name', () => {
    setCardCatalog({ cardNames: ['Front'], cardNameById: { a: 'Front', b: 'Front' } });

    expect(getCatalogPrintingIds('Front // Back')).toEqual(['a', 'b']);
    expect(resolveCatalogPrintingId('Front // Back')).toBe('a');
  });

  it('resets', () => {
    setCardCatalog({ cardNames: ['Sol Ring'], cardNameById: { a: 'Sol Ring' } });
    resetCardCatalog();

    expect(isCardCatalogLoaded()).toBe(false);
    expect(resolveCatalogName('a')).toBeNull();
  });
});
