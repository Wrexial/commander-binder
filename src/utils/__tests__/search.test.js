// src/utils/__tests__/search.test.js
import { describe, it, expect, vi } from 'vitest';
import { parseQuery, evaluateCondition } from '../../search';
import * as cardState from '../../cardState';

vi.mock('../../appState', () => ({
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
                "type": "filter",
                "value": "t:creature"
            },
            {
                "type": "filter",
                "value": "o:\"flying\""
            },
            {
                "type": "and",
                "left": {
                    "type": "or",
                    "left": {
                        "type": "filter",
                        "value": "c:U"
                    },
                    "right": {
                        "type": "filter",
                        "value": "c:W"
                    }
                },
                "right": {
                    "type": "filter",
                    "value": "!s:M21"
                }
            }
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
    vi.spyOn(cardState, 'isCardMissing').mockReturnValue(false);
    const condition = { type: 'filter', value: 'is:owned' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });

  it('should handle name filters', () => {
    const condition = { type: 'filter', value: 'serra angel' };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(true);
  });
});
