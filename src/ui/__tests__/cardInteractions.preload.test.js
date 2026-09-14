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
import { cardSettings } from '../../state/cardSettings.js';

describe('touch image preloading', () => {
  let container;
  let tooltip;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cardSettings.showTooltip = true;

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

  /** Dispatch a touchstart with coordinates onto an element. */
  function startTouch(target) {
    const event = new Event('touchstart', { bubbles: true });
    event.touches = [{ clientX: 10, clientY: 10 }];
    target.dispatchEvent(event);
  }

  it('preloads the image as soon as a touch starts', () => {
    const card = container.querySelector('.card');
    startTouch(card);

    expect(preloadCardImages).toHaveBeenCalledWith(card.cardData);
  });

  it('does not preload when tooltips are disabled', () => {
    cardSettings.showTooltip = false;
    const card = container.querySelector('.card');
    startTouch(card);

    expect(preloadCardImages).not.toHaveBeenCalled();
  });

  it('does not preload on mouse hover (touch-only tooltip)', () => {
    const card = container.querySelector('.card');
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    vi.advanceTimersByTime(500);
    expect(preloadCardImages).not.toHaveBeenCalled();
  });
});
