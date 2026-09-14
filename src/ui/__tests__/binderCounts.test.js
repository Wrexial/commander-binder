import { describe, it, expect, vi } from 'vitest';

// Break the import chain into main.js/@clerk which is irrelevant here.
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
}));

import { updateBinderCounts, adjustBinderOwnedCount, recountBinder } from '../layout.js';

function makeBinder(owned, total) {
  const binder = document.createElement('div');
  binder.className = 'binder';
  binder.innerHTML = '<div class="binder-header"><span class="binder-owned"></span></div>';
  binder.ownedCards = owned;
  binder.totalCards = total;
  return binder;
}

describe('binder counts', () => {
  it('renders counts from the cached numbers', () => {
    const binder = makeBinder(2, 5);
    updateBinderCounts(binder);
    expect(binder.querySelector('.binder-owned').textContent).toBe('Owned: 2/5');
  });

  it('adjusts the owned count without rescanning the DOM', () => {
    const binder = makeBinder(2, 5);
    const spy = vi.spyOn(binder, 'querySelectorAll');

    adjustBinderOwnedCount(binder, 1);

    expect(binder.ownedCards).toBe(3);
    expect(binder.querySelector('.binder-owned').textContent).toBe('Owned: 3/5');
    expect(spy).not.toHaveBeenCalled();
  });

  it('never lets the owned count drop below zero', () => {
    const binder = makeBinder(0, 0);
    adjustBinderOwnedCount(binder, -1);
    expect(binder.ownedCards).toBe(0);
  });

  it('recounts total and owned cards from the DOM', () => {
    const binder = makeBinder(0, 0);
    for (let i = 0; i < 3; i++) {
      const card = document.createElement('div');
      card.className = i === 0 ? 'card owned' : 'card';
      binder.appendChild(card);
    }

    recountBinder(binder);

    expect(binder.totalCards).toBe(3);
    expect(binder.ownedCards).toBe(1);
    expect(binder.querySelector('.binder-owned').textContent).toBe('Owned: 1/3');
  });
});
