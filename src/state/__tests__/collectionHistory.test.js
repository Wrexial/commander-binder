import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dayKey, getHistory, recordSnapshot } from '../collectionHistory.js';

beforeEach(() => {
  localStorage.clear();
});

describe('collectionHistory', () => {
  it('records a snapshot and has no previous on the first day', () => {
    const previous = recordSnapshot(
      { owned: 10, total: 100, value: 50, setsCompleted: 1 },
      new Date('2024-05-01T10:00:00')
    );

    expect(previous).toBeNull();
    expect(getHistory()).toEqual([
      { date: '2024-05-01', owned: 10, total: 100, value: 50, setsCompleted: 1 },
    ]);
  });

  it('replaces the same day and compares against the previous day', () => {
    recordSnapshot(
      { owned: 10, total: 100, value: 50, setsCompleted: 1 },
      new Date('2024-05-01T10:00:00')
    );
    recordSnapshot(
      { owned: 12, total: 100, value: 55, setsCompleted: 2 },
      new Date('2024-05-01T18:00:00')
    );
    expect(getHistory()).toHaveLength(1);

    const previous = recordSnapshot(
      { owned: 15, total: 100, value: 60, setsCompleted: 2 },
      new Date('2024-05-02T09:00:00')
    );

    expect(previous).toMatchObject({ date: '2024-05-01', owned: 12 });
    expect(getHistory()).toHaveLength(2);
  });

  it('ignores malformed stored data', () => {
    localStorage.setItem(
      'collectionHistory',
      JSON.stringify([{ date: '2024-05-01' }, null, { date: 'x', owned: 1, total: 1, value: 1 }])
    );

    expect(getHistory()).toEqual([{ date: 'x', owned: 1, total: 1, value: 1 }]);
  });

  it('caps the rolling window', () => {
    for (let i = 0; i < 100; i++) {
      recordSnapshot({ owned: i, total: 100, value: 0 }, new Date(2024, 0, 1 + i));
    }

    expect(getHistory()).toHaveLength(90);
  });

  it('stays best-effort when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getHistory()).toEqual([]);
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => recordSnapshot({ owned: 1, total: 1, value: 0 })).not.toThrow();
    setItem.mockRestore();
  });

  it('formats a local day key', () => {
    expect(dayKey(new Date(2024, 0, 5))).toBe('2024-01-05');
  });
});
