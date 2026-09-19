// src/ui/__tests__/search.test.js
import { describe, it, expect, vi } from 'vitest';
import { parseQuery, evaluateCondition } from '../../ui/search.js';
import * as cardState from '../../state/cardState.js';
import * as wishlistState from '../../state/wishlistState.js';

vi.mock('../../state/appState.js', () => ({
  appState: {
    seenSetCodes: new Set(['dom']),
  },
}));

describe('parseQuery', () => {
  it('should parse a simple query', () => {
    const query = 't:creature';
    const result = parseQuery(query);
    expect(result).toEqual([{ type: 'filter', value: 't:creature' }]);
  });

  it('should parse a query with an "and" operator', () => {
    const query = 't:creature and c:w';
    const result = parseQuery(query);
    expect(result).toEqual([
      {
        type: 'and',
        left: { type: 'filter', value: 't:creature' },
        right: { type: 'filter', value: 'c:w' },
      },
    ]);
  });

  it('should parse a query with an "or" operator', () => {
    const query = 't:creature or c:w';
    const result = parseQuery(query);
    expect(result).toEqual([
      {
        type: 'or',
        left: { type: 'filter', value: 't:creature' },
        right: { type: 'filter', value: 'c:w' },
      },
    ]);
  });

  it('should parse a query with parentheses', () => {
    const query = '(t:creature or t:artifact) and c:w';
    const result = parseQuery(query);
    expect(result).toEqual([
      {
        type: 'and',
        left: {
          type: 'or',
          left: { type: 'filter', value: 't:creature' },
          right: { type: 'filter', value: 't:artifact' },
        },
        right: { type: 'filter', value: 'c:w' },
      },
    ]);
  });

  it('should handle negated terms', () => {
    const query = '!t:creature';
    const result = parseQuery(query);
    expect(result).toEqual([{ type: 'filter', value: '!t:creature' }]);
  });

  it('should handle complex queries', () => {
    const query = 't:creature o:"flying" (c:U or c:W) and !s:M21';
    const result = parseQuery(query);
    expect(result).toEqual([
      {
        type: 'filter',
        value: 't:creature',
      },
      {
        type: 'filter',
        value: 'o:"flying"',
      },
      {
        type: 'and',
        left: {
          type: 'or',
          left: {
            type: 'filter',
            value: 'c:U',
          },
          right: {
            type: 'filter',
            value: 'c:W',
          },
        },
        right: {
          type: 'filter',
          value: '!s:M21',
        },
      },
    ]);
  });
});

describe('evaluateCondition', () => {
  const card = {
    cardData: {
      name: 'Serra Angel',
      type_line: 'Creature — Angel',
      oracle_text: 'Flying, vigilance',
      color_identity: ['W'],
      set: 'dom',
      set_name: 'Dominaria',
      released_at: '2018-04-27',
      rarity: 'uncommon',
    },
  };

  it('should return true for a matching type filter', () => {
    const condition = { type: 'filter', value: 't:creature' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should return false for a non-matching type filter', () => {
    const condition = { type: 'filter', value: 't:artifact' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(false);
  });

  it('should return true for a matching "and" condition', () => {
    const condition = {
      type: 'and',
      left: { type: 'filter', value: 't:creature' },
      right: { type: 'filter', value: 'c:w' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should return false for a non-matching "and" condition', () => {
    const condition = {
      type: 'and',
      left: { type: 'filter', value: 't:creature' },
      right: { type: 'filter', value: 'c:b' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(false);
  });

  it('should return true for a matching "or" condition', () => {
    const condition = {
      type: 'or',
      left: { type: 'filter', value: 't:creature' },
      right: { type: 'filter', value: 'c:b' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should return true for a matching "or" condition', () => {
    const condition = {
      type: 'or',
      left: { type: 'filter', value: 't:creature' },
      right: { type: 'filter', value: 'c:b' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should return false for a non-matching "or" condition', () => {
    const condition = {
      type: 'or',
      left: { type: 'filter', value: 't:artifact' },
      right: { type: 'filter', value: 'c:b' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(false);
  });

  it('should handle negated filters', () => {
    const condition = { type: 'filter', value: '!t:artifact' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle oracle text filters', () => {
    const condition = { type: 'filter', value: 'o:flying' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle color filters', () => {
    const condition = { type: 'filter', value: 'c:w' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle set filters', () => {
    const condition = { type: 'filter', value: 's:dom' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle rarity filters', () => {
    const condition = { type: 'filter', value: 'r:uncommon' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle date filters', () => {
    const condition = { type: 'filter', value: 'd:2018' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle owned filters', () => {
    vi.spyOn(cardState, 'isCardOwned').mockReturnValue(true);
    const condition = { type: 'filter', value: 'is:owned' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle missing filters', () => {
    vi.spyOn(cardState, 'isCardOwned').mockReturnValue(false);
    expect(evaluateCondition(card, { type: 'filter', value: 'is:missing' })).toBe(true);

    vi.spyOn(cardState, 'isCardOwned').mockReturnValue(true);
    expect(evaluateCondition(card, { type: 'filter', value: 'is:missing' })).toBe(false);
  });

  it('should handle wishlist filters', () => {
    vi.spyOn(wishlistState, 'isCardWanted').mockReturnValue(true);
    expect(evaluateCondition(card, { type: 'filter', value: 'is:wanted' })).toBe(true);

    vi.spyOn(wishlistState, 'isCardWanted').mockReturnValue(false);
    expect(evaluateCondition(card, { type: 'filter', value: 'is:wanted' })).toBe(false);
  });

  it('should handle colourless and multicolour filters', () => {
    const colorless = { cardData: { name: 'Karn', color_identity: [] } };
    const mono = { cardData: { name: 'Serra Angel', color_identity: ['W'] } };
    const multi = { cardData: { name: 'Atraxa', color_identity: ['W', 'U', 'B', 'G'] } };

    expect(evaluateCondition(colorless, { type: 'filter', value: 'is:colorless' })).toBe(true);
    expect(evaluateCondition(mono, { type: 'filter', value: 'is:colorless' })).toBe(false);
    expect(evaluateCondition(mono, { type: 'filter', value: 'is:multicolor' })).toBe(false);
    expect(evaluateCondition(multi, { type: 'filter', value: 'is:multicolor' })).toBe(true);
  });

  it('should handle double-faced card filters', () => {
    const dfc = {
      cardData: { name: 'Delver', card_faces: [{}, {}] },
    };

    expect(evaluateCondition(dfc, { type: 'filter', value: 'is:dfc' })).toBe(true);
    expect(evaluateCondition(card, { type: 'filter', value: 'is:dfc' })).toBe(false);
  });

  it('should handle name filters', () => {
    const condition = { type: 'filter', value: 'serra angel' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });
});

describe('price filter', () => {
  const priced = (eur) => ({
    cardData: {
      name: 'Priced Card',
      type_line: 'Creature — Angel',
      color_identity: [],
      prices: { eur, usd: '999.00' },
    },
  });

  it('filters on the EUR price the UI displays', () => {
    expect(evaluateCondition(priced('3.00'), { type: 'filter', value: 'price:1-5' })).toBe(true);
    expect(evaluateCondition(priced('30.00'), { type: 'filter', value: 'price:1-5' })).toBe(false);
  });

  it('treats a bare value as a minimum', () => {
    expect(evaluateCondition(priced('30.00'), { type: 'filter', value: 'price:20' })).toBe(true);
    expect(evaluateCondition(priced('3.00'), { type: 'filter', value: 'price:20' })).toBe(false);
  });
});
