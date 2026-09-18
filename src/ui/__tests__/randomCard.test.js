import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
}));
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
}));
vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

import { pickRandom, surpriseMe } from '../randomCard.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';
import { showToast } from '../components/toast.js';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = vi.fn();
  cardStore.getAll.mockReturnValue([]);
  isCardOwned.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pickRandom', () => {
  it('returns null for an empty or invalid list', () => {
    expect(pickRandom([], () => 0)).toBeNull();
    expect(pickRandom(null, () => 0)).toBeNull();
  });

  it('picks from the injected rng and clamps out-of-range values', () => {
    const items = ['a', 'b', 'c'];
    expect(pickRandom(items, () => 0)).toBe('a');
    expect(pickRandom(items, () => 0.5)).toBe('b');
    expect(pickRandom(items, () => 1)).toBe('c');
  });
});

describe('surpriseMe', () => {
  it('tells the user to wait when nothing has loaded yet', () => {
    cardStore.getAll.mockReturnValue([]);

    surpriseMe();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('loaded yet'), 'warning');
  });

  it('announces when nothing is missing', () => {
    cardStore.getAll.mockReturnValue([{ name: 'A' }]);
    isCardOwned.mockReturnValue(true);

    surpriseMe();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('complete'), 'success');
  });

  it('warns when the chosen card is not mounted yet', () => {
    cardStore.getAll.mockReturnValue([{ name: 'A' }]);
    isCardOwned.mockReturnValue(false);

    surpriseMe();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('not loaded'), 'warning');
  });

  it('scrolls to and flashes a mounted missing card', () => {
    vi.useFakeTimers();
    cardStore.getAll.mockReturnValue([{ name: 'A' }, { name: 'B' }]);
    isCardOwned.mockImplementation((card) => card.name === 'A');

    document.body.innerHTML =
      '<div class="binder collapsed"><div class="section collapsed"></div></div>';
    const tile = document.createElement('div');
    tile.className = 'card';
    tile.cardData = { name: 'B' };
    document.querySelector('.section').appendChild(tile);

    surpriseMe();

    expect(tile.classList.contains('card-surprise')).toBe(true);
    expect(tile.scrollIntoView).toHaveBeenCalled();
    expect(document.querySelector('.section').classList.contains('collapsed')).toBe(false);
    expect(document.querySelector('.binder').classList.contains('collapsed')).toBe(false);

    vi.advanceTimersByTime(2100);
    expect(tile.classList.contains('card-surprise')).toBe(false);
  });
});
