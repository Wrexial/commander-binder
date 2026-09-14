import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  getOwnedCardIds: vi.fn(() => new Set(['a', 'b'])),
}));
vi.mock('../../../state/appState.js', () => ({
  appState: { seenNames: new Set(['x', 'y', 'z']) },
}));

import { updateOwnedCounter } from '../ownedCounter.js';
import { isCardOwned, getOwnedCardIds } from '../../../state/cardState.js';

describe('updateOwnedCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCardOwned.mockReturnValue(false);
    getOwnedCardIds.mockReturnValue(new Set(['a', 'b']));
    document.body.innerHTML = '<div id="owned-counter"></div><input id="search-input" />';
  });

  it('uses the total owned count without scanning the DOM when not searching', () => {
    const spy = vi.spyOn(document, 'querySelectorAll');

    updateOwnedCounter();

    expect(document.getElementById('owned-counter').textContent).toBe('Owned: 2/3');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('counts only visible owned cards while searching', () => {
    document.getElementById('search-input').value = 'drag';

    const visible = document.createElement('div');
    visible.className = 'card';
    visible.cardData = { id: 'a' };

    const hidden = document.createElement('div');
    hidden.className = 'card';
    hidden.cardData = { id: 'b' };
    hidden.style.display = 'none';

    document.body.append(visible, hidden);
    isCardOwned.mockImplementation((c) => c.id === 'a');

    updateOwnedCounter();

    expect(document.getElementById('owned-counter').textContent).toBe('Owned: 1/1 shown (2 total)');
  });
});
