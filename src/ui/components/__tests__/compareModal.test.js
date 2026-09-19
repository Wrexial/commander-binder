import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/compareState.js', () => ({
  loadViewerCollection: vi.fn(),
  addToViewerWishlist: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../state/cardState.js', () => ({
  getOwnedCardIds: vi.fn(() => new Set()),
  setCardsOwned: vi.fn(),
}));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { showCompareModal } from '../compareModal.js';
import { addToViewerWishlist, loadViewerCollection } from '../../../state/compareState.js';
import { getOwnedCardIds } from '../../../state/cardState.js';
import { cardStore } from '../../../state/cardStore.js';
import { showToast } from '../toast.js';

function card(id, name) {
  return { id, name, released_at: '2020-01-01' };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  cardStore.clear();
  cardStore.add(card('o1', 'Only They Have'));
  cardStore.add(card('m1', 'Only I Have'));
  cardStore.add(card('b1', 'Both Have'));
  getOwnedCardIds.mockReturnValue(new Set(['o1', 'b1']));
  loadViewerCollection.mockResolvedValue(new Set(['m1', 'b1']));
});

afterEach(() => {
  document.body.innerHTML = '';
  cardStore.clear();
});

describe('showCompareModal', () => {
  it('summarises and lists both sides of the diff', async () => {
    await showCompareModal();

    const chips = [...document.querySelectorAll('.bulk-summary-chip')].map((el) => el.textContent);
    expect(
      chips.some((text) => text.includes("They have · you're missing") && text.includes('1'))
    ).toBe(true);
    expect(
      chips.some((text) => text.includes("You have · they're missing") && text.includes('1'))
    ).toBe(true);
    expect(chips.some((text) => text.includes('In both') && text.includes('1'))).toBe(true);

    const rows = [...document.querySelectorAll('.bulk-row')].map((el) => el.textContent);
    expect(rows).toContain('Only They Have');
    expect(rows).toContain('Only I Have');
    expect(rows).not.toContain('Both Have');
  });

  it('reports when the collections are identical', async () => {
    getOwnedCardIds.mockReturnValue(new Set(['b1']));
    loadViewerCollection.mockResolvedValue(new Set(['b1']));

    await showCompareModal();

    expect(document.querySelector('.bulk-empty').textContent).toBe('You both have the same cards.');
    expect(document.querySelectorAll('.bulk-row')).toHaveLength(0);
  });

  it('wishlists the cards only the owner has', async () => {
    await showCompareModal();

    const button = [...document.querySelectorAll('.modal-button-container button')].find(
      (candidate) => candidate.textContent === 'Wishlist missing'
    );
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(addToViewerWishlist).toHaveBeenCalledWith(['o1']);
    expect(button.textContent).toBe('Wishlisted');
    expect(showToast).toHaveBeenCalledWith('Added 1 card to your wishlist.', 'success');
  });

  it('copies the names the owner has that the viewer lacks', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    await showCompareModal();
    [...document.querySelectorAll('.modal-button-container button')]
      .find((candidate) => candidate.textContent === 'Copy names')
      .click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Only They Have');
  });
});
