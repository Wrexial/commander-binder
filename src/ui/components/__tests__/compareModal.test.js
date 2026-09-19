import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/compareState.js', () => ({
  loadViewerCollection: vi.fn(),
  addToViewerWishlist: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../state/cardState.js', () => ({
  getOwnedCardIds: vi.fn(() => new Set()),
  setCardsOwned: vi.fn(),
}));
vi.mock('../../../state/listsState.js', () => ({
  getListCardIds: vi.fn(() => []),
}));
vi.mock('../../../state/mainState.js', () => ({ mainState: { shareToken: null } }));
vi.mock('../../../state/wishlistState.js', () => ({
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { showCompareModal, showListCompareModal } from '../compareModal.js';
import { addToViewerWishlist, loadViewerCollection } from '../../../state/compareState.js';
import { getOwnedCardIds } from '../../../state/cardState.js';
import { getListCardIds } from '../../../state/listsState.js';
import { mainState } from '../../../state/mainState.js';
import { setCardsWanted } from '../../../state/wishlistState.js';
import { cardStore } from '../../../state/cardStore.js';
import { resetCardCatalog, setCardCatalog } from '../../../state/cardCatalog.js';
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
  getListCardIds.mockReturnValue([]);
  mainState.shareToken = null;
});

afterEach(() => {
  document.body.innerHTML = '';
  cardStore.clear();
  resetCardCatalog();
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

  it('labels collection ids that are not loaded via the all-cards catalog', async () => {
    getOwnedCardIds.mockReturnValue(new Set(['ghost', 'b1']));
    loadViewerCollection.mockResolvedValue(new Set(['b1']));
    setCardCatalog({ cardNames: ['Ghost Card'], cardNameById: { ghost: 'Ghost Card' } });

    await showCompareModal();

    const rows = [...document.querySelectorAll('.bulk-row')].map((el) => el.textContent);
    expect(rows).toContain('Ghost Card');
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

describe('showListCompareModal', () => {
  it('diffs the list against the collection and wishlists the gaps', async () => {
    getListCardIds.mockReturnValue(['o1', 'b1']);
    // o1 is on the list but not owned; m1 is owned but not on the list.
    getOwnedCardIds.mockReturnValue(new Set(['m1', 'b1']));

    await showListCompareModal({ id: 'L1', name: 'Trade pile' });

    const chips = [...document.querySelectorAll('.bulk-summary-chip')].map((el) => el.textContent);
    expect(chips.some((text) => text.includes('You have') && text.includes('1'))).toBe(true);
    expect(chips.some((text) => text.includes("You don't have") && text.includes('1'))).toBe(true);

    // Both list buckets plus the cards you own that aren't on the list.
    const rows = [...document.querySelectorAll('.bulk-row')].map((el) => el.textContent);
    expect(rows).toContain('Both Have');
    expect(rows).toContain('Only They Have');
    expect(rows).toContain('Only I Have');
    expect(chips.some((text) => text.includes('not on the list') && text.includes('1'))).toBe(true);

    [...document.querySelectorAll('.modal-button-container button')]
      .find((candidate) => candidate.textContent === 'Wishlist missing')
      .click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsWanted).toHaveBeenCalledWith([{ id: 'o1' }], true);
  });

  it('explains when the list itself is empty', async () => {
    getListCardIds.mockReturnValue([]);

    await showListCompareModal({ id: 'L1', name: 'Empty' });

    expect(document.querySelector('.bulk-empty').textContent).toBe('This list has no cards yet.');
  });

  it('uses the viewer collection and wishlist in a share view', async () => {
    getListCardIds.mockReturnValue(['o1']);
    loadViewerCollection.mockResolvedValue(new Set(['m1']));
    mainState.shareToken = 'tok';

    await showListCompareModal({ id: 'L1', name: 'Shared pile' });

    expect(loadViewerCollection).toHaveBeenCalled();

    [...document.querySelectorAll('.modal-button-container button')]
      .find((candidate) => candidate.textContent === 'Wishlist missing')
      .click();
    await Promise.resolve();
    await Promise.resolve();

    expect(addToViewerWishlist).toHaveBeenCalledWith(['o1']);
    expect(setCardsWanted).not.toHaveBeenCalled();
  });
});
