import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getByPrintingId: vi.fn() },
  primaryName: (card) => (typeof card === 'string' ? card : (card?.name || '').split(' // ')[0]),
}));
vi.mock('../../../state/cardState.js', () => ({
  getOwnedAddedAt: vi.fn(() => new Map()),
}));

import {
  formatAddedAt,
  recentAdditions,
  createRecentActivityModal,
} from '../recentActivityModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { getOwnedAddedAt } from '../../../state/cardState.js';

const NOW = Date.parse('2024-06-10T12:00:00.000Z');

describe('formatAddedAt', () => {
  it('renders relative times', () => {
    expect(formatAddedAt('2024-06-10T11:59:40.000Z', NOW)).toBe('just now');
    expect(formatAddedAt('2024-06-10T11:30:00.000Z', NOW)).toBe('30m ago');
    expect(formatAddedAt('2024-06-10T09:00:00.000Z', NOW)).toBe('3h ago');
    expect(formatAddedAt('2024-06-08T12:00:00.000Z', NOW)).toBe('2d ago');
  });

  it('falls back to a locale date past a week', () => {
    const value = formatAddedAt('2024-05-01T12:00:00.000Z', NOW);
    expect(value).not.toBe('');
    expect(value).not.toContain('ago');
  });

  it('returns an empty string for an invalid timestamp', () => {
    expect(formatAddedAt('not-a-date', NOW)).toBe('');
  });
});

describe('recentAdditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts newest first and skips cards not in the store', () => {
    const cards = {
      a: { id: 'a', name: 'Alpha', set: 'lea' },
      b: { id: 'b', name: 'Beta', set: 'm21' },
    };
    cardStore.getByPrintingId.mockImplementation((id) => cards[id]);
    const addedAt = new Map([
      ['a', '2024-06-01T00:00:00.000Z'],
      ['b', '2024-06-05T00:00:00.000Z'],
      ['missing', '2024-06-09T00:00:00.000Z'],
    ]);

    const rows = recentAdditions(addedAt);

    expect(rows.map((row) => row.card.name)).toEqual(['Beta', 'Alpha']);
  });

  it('de-duplicates different printings of the same card', () => {
    cardStore.getByPrintingId.mockImplementation((id) => ({ id, name: 'Sol Ring' }));
    const addedAt = new Map([
      ['p1', '2024-06-01T00:00:00.000Z'],
      ['p2', '2024-06-02T00:00:00.000Z'],
    ]);

    expect(recentAdditions(addedAt)).toHaveLength(1);
  });

  it('caps the list', () => {
    cardStore.getByPrintingId.mockImplementation((id) => ({ id, name: `Card ${id}` }));
    const addedAt = new Map(
      Array.from({ length: 10 }, (_, i) => [`p${i}`, `2024-06-${String(i + 1).padStart(2, '0')}`])
    );

    expect(recentAdditions(addedAt, 3)).toHaveLength(3);
  });
});

describe('createRecentActivityModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('lists the recently added cards', () => {
    cardStore.getByPrintingId.mockReturnValue({ id: 'a', name: 'Alpha', set: 'lea' });
    getOwnedAddedAt.mockReturnValue(new Map([['a', new Date().toISOString()]]));

    createRecentActivityModal().show();

    expect(document.querySelector('.activity-modal')).not.toBeNull();
    expect(document.querySelector('.activity-name').textContent).toBe('Alpha');
    expect(document.querySelector('.activity-set').textContent).toBe('LEA');
    expect(document.querySelector('.activity-time').textContent).toBe('just now');
  });

  it('shows an empty state when nothing has been added', () => {
    getOwnedAddedAt.mockReturnValue(new Map());

    createRecentActivityModal().show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
  });
});
