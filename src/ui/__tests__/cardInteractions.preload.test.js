import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/cardImages.js', () => ({
  preloadCardImages: vi.fn(),
  getCardImageUrls: vi.fn(() => null),
}));
vi.mock('../tooltip.js', () => ({
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
  positionTooltip: vi.fn(),
}));
vi.mock('../../state/cardSettings.js', () => ({ cardSettings: { showTooltip: true } }));
vi.mock('../../state/appState.js', () => ({ appState: { isViewOnlyMode: false } }));
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  toggleCardOwned: vi.fn(),
  setCardsOwned: vi.fn(),
}));
vi.mock('../components/toast.js', () => ({ showUndo: vi.fn(), showToast: vi.fn() }));
vi.mock('../components/ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../layout.js', () => ({ adjustBinderOwnedCount: vi.fn() }));
vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getPrintings: vi.fn(() => []) },
}));

import { initCardInteractions } from '../cardInteractions.js';
import { preloadCardImages } from '../../utils/cardImages.js';

describe('hover image preloading', () => {
  let container;
  let tooltip;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    container = document.createElement('div');
    tooltip = document.createElement('div');
    const card = document.createElement('div');
    card.className = 'card';
    card.cardData = { id: 'c1', name: 'Card' };
    container.appendChild(card);
    document.body.append(container, tooltip);

    initCardInteractions(container, tooltip);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('preloads the image once the hover settles', () => {
    const card = container.querySelector('.card');
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(preloadCardImages).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(preloadCardImages).toHaveBeenCalledWith(card.cardData);
  });

  it('does not preload when the cursor leaves before the delay', () => {
    const card = container.querySelector('.card');
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    card.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
    );

    vi.advanceTimersByTime(200);
    expect(preloadCardImages).not.toHaveBeenCalled();
  });

  it('does not restart the timer while moving within the same card', () => {
    const card = container.querySelector('.card');
    const child = document.createElement('span');
    card.appendChild(child);

    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(100);
    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(30); // 130ms since entering the card

    expect(preloadCardImages).toHaveBeenCalledTimes(1);
  });
});
