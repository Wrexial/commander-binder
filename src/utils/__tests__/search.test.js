// src/utils/__tests__/search.test.js
import { describe, it, expect, vi } from 'vitest';
import { parseQuery, evaluateCondition } from '../../search';

vi.mock('../../cardState', () => ({
  isCardMissing: vi.fn(),
}));

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

  it('should return false for a non-matching "or" condition', () => {
    const condition = {
      type: 'or',
      left: { type: 'filter', value: 't:artifact' },
      right: { type: 'filter', value: 'c:b' },
    };
    const result = evaluateCondition(card, condition);
    expect(result).toBe(false);
  });
});
