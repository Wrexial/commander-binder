import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Test-controlled ownership, keyed by card name (matching the real logic). */
const state = vi.hoisted(() => ({ owned: new Set() }));

vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn((card) => state.owned.has(card.name)),
}));
vi.mock('../../state/wishlistState.js', () => ({ isCardWanted: vi.fn(() => false) }));
vi.mock('../../state/selectionState.js', () => ({
  isCardSelected: vi.fn(() => false),
  isSelectionMode: vi.fn(() => false),
}));
vi.mock('../../state/preferredPrintings.js', () => ({
  getPreferredPrinting: vi.fn(() => null),
  resolveDisplayPrinting: vi.fn(() => null),
}));
vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getPrintingPosition: vi.fn(() => ({ index: 1, total: 1 })) },
}));

import { createCardElement, updateCardState } from '../cards.js';

const card = {
  id: 'bolt',
  name: 'Lightning Bolt',
  set: 'lea',
  collector_number: '161',
  color_identity: ['R'],
};

beforeEach(() => {
  state.owned.clear();
});

describe('binder pocket owned indicator', () => {
  it('shows a read-only Missing/Owned pill and never a collection toggle', () => {
    const tile = createCardElement(card, 0, { collection: false });
    const pill = tile.querySelector('.card-owned-status');

    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('Missing');
    expect(pill.classList.contains('is-missing')).toBe(true);
    // Layout-only tiles keep the collection controls out of the pocket.
    expect(tile.querySelector('.card-toggle')).toBeNull();
    expect(tile.querySelector('.card-wishlist')).toBeNull();
  });

  it('updates the pill in place when ownership changes', () => {
    const tile = createCardElement(card, 0, { collection: false });

    state.owned.add('Lightning Bolt');
    updateCardState(tile);

    const pill = tile.querySelector('.card-owned-status');
    expect(pill.textContent).toBe('Owned');
    expect(pill.classList.contains('is-owned')).toBe(true);
    expect(pill.classList.contains('is-missing')).toBe(false);
  });

  it('leaves collection tiles without the pill', () => {
    const tile = createCardElement(card, 0, { collection: true });
    expect(tile.querySelector('.card-owned-status')).toBeNull();
  });
});
