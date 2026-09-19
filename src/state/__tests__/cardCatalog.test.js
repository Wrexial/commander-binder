import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCatalogNames,
  isCardCatalogLoaded,
  rankCatalogNames,
  resetCardCatalog,
  resolveCatalogName,
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

  it('resets', () => {
    setCardCatalog({ cardNames: ['Sol Ring'], cardNameById: { a: 'Sol Ring' } });
    resetCardCatalog();

    expect(isCardCatalogLoaded()).toBe(false);
    expect(resolveCatalogName('a')).toBeNull();
  });
});
