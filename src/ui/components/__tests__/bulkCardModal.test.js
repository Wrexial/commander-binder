import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
  getOwnedCardIds: vi.fn(() => new Set()),
}));

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createBulkAddModal, createBulkCheckModal } from '../bulkCardModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { isCardOwned, setCardsOwned } from '../../../state/cardState.js';
import { showToast } from '../toast.js';

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
  setCardsOwned.mockClear();
  showToast.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('bulk add modal', () => {
  it('categorizes input and only enables adding unowned cards', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    const modal = await createBulkAddModal();
    modal.show();

    typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nArcane Signet\nFake Card');

    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet', 'Fake Card']);
    expect(document.querySelector('.bulk-row-owned').textContent).toBe('Sol Ring');
    expect(document.querySelector('.bulk-row-missing').textContent).toBe('Arcane Signet');
    expect(document.querySelector('.bulk-row-unknown').textContent).toBe('Fake Card');

    const primary = document.querySelector('.bulk-modal .primary');
    expect(primary.textContent).toBe('Add 1 card');
    expect(primary.disabled).toBe(false);
  });

  it('de-duplicates repeated names (case-insensitively)', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring')]);

    const modal = await createBulkAddModal();
    modal.show();
    typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nsol ring\nSOL RING');

    expect(document.querySelectorAll('.bulk-row')).toHaveLength(1);
  });

  it('adds the unowned cards when confirmed', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Arcane Signet')]);

    const modal = await createBulkAddModal();
    modal.show();
    typeList(document.querySelector('.bulk-modal textarea'), 'Arcane Signet');

    document.querySelector('.bulk-modal .primary').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsOwned).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Arcane Signet' })],
      true
    );
    expect(showToast).toHaveBeenCalledWith('Added 1 card.', 'success');
  });

  it('closes on Escape', async () => {
    const modal = await createBulkAddModal();
    modal.show();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});

describe('bulk check modal', () => {
  it('reports owned, missing and unknown cards', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    const modal = await createBulkCheckModal();
    modal.show();

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

    const modal = await createBulkCheckModal();
    modal.show();
    typeList(document.querySelector('.bulk-modal textarea'), 'Arcane Signet');

    document.querySelector('.bulk-modal .primary').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Arcane Signet');
  });
});

describe('bulk modal wrappers', () => {
  it('shows the modal and removes it when its close button is clicked', async () => {
    const modal = await createBulkAddModal();
    modal.show();

    expect(document.querySelector('.list-modal-backdrop').style.display).toBe('block');

    const closeButton = [...document.querySelectorAll('.modal-button-container button')].find(
      (button) => button.textContent === 'Close'
    );
    closeButton.click();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('does not stack a second modal while one is already open', async () => {
    const first = await createBulkAddModal();
    first.show();

    const second = await createBulkCheckModal();
    second.show();

    expect(document.querySelectorAll('.list-modal-backdrop')).toHaveLength(1);
  });
});
