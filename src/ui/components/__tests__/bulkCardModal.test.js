import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createBulkCheckModal } from '../bulkCardModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { isCardOwned } from '../../../state/cardState.js';

function makeCard(name) {
  return { id: name, name, type_line: 'Legendary Creature — Human', colors: [] };
}

function typeList(textarea, value) {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input'));
  vi.advanceTimersByTime(300);
}

function rowTexts() {
  return [...document.querySelectorAll('.bulk-row')].map((row) => row.textContent);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([]);
  isCardOwned.mockReturnValue(false);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('bulk check modal', () => {
  it('reports owned, missing and unknown cards', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    createBulkCheckModal().show();
    typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nArcane Signet\nFake Card');

    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet', 'Fake Card']);

    const labels = [...document.querySelectorAll('.bulk-group')].map((group) =>
      group.querySelector('h3').firstChild.textContent.trim()
    );
    expect(labels).toEqual(['Owned', 'Missing', 'Not found']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('copies missing names to the clipboard', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Arcane Signet')]);
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    createBulkCheckModal().show();
    typeList(document.querySelector('.bulk-modal textarea'), 'Arcane Signet');

    document.querySelector('.bulk-modal .primary').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Arcane Signet');
  });

  it('shows the modal and removes it when its close button is clicked', async () => {
    createBulkCheckModal().show();

    expect(document.querySelector('.list-modal-backdrop').style.display).toBe('block');

    const closeButton = [...document.querySelectorAll('.modal-button-container button')].find(
      (button) => button.textContent === 'Close'
    );
    closeButton.click();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('does not stack a second modal while one is already open', () => {
    createBulkCheckModal().show();

    createBulkCheckModal().show();

    expect(document.querySelectorAll('.list-modal-backdrop')).toHaveLength(1);
  });
});
