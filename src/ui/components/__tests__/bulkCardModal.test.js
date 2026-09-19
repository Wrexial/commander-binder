import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../state/listsState.js', () => ({
  getLists: vi.fn(() => [{ id: 'L1', name: 'Trade pile' }]),
  getList: vi.fn((id) => (id === 'L1' ? { id: 'L1', name: 'Trade pile' } : null)),
  isInList: vi.fn(() => false),
}));

vi.mock('../../../state/bindersState.js', () => ({
  getBinders: vi.fn(() => []),
  getBinder: vi.fn(() => null),
  isCardInBinder: vi.fn(() => false),
}));

vi.mock('../../../state/cardCatalog.js', () => ({
  getCatalogNames: vi.fn(() => []),
  isCardCatalogLoaded: vi.fn(() => true),
  resolveCatalogPrintingId: vi.fn(() => null),
}));
vi.mock('../../../api/cardSearch.js', () => ({
  hydrateCardsByIds: vi.fn(async () => []),
  loadPrintingsForName: vi.fn(async () => []),
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
import { isInList } from '../../../state/listsState.js';
import { getBinder, getBinders, isCardInBinder } from '../../../state/bindersState.js';
import { resolveCatalogPrintingId } from '../../../state/cardCatalog.js';
import { hydrateCardsByIds } from '../../../api/cardSearch.js';

function makeCard(name) {
  return { id: name, name, type_line: 'Legendary Creature — Human', colors: [] };
}

async function typeList(textarea, value) {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input'));
  // The preview resolves catalog matches asynchronously, so flush those
  // microtasks along with the debounce timer.
  await vi.advanceTimersByTimeAsync(300);
}

function rowTexts() {
  return [...document.querySelectorAll('.bulk-row')].map((row) => row.textContent);
}

function groupLabels() {
  return [...document.querySelectorAll('.bulk-group')].map((group) =>
    group.querySelector('h3').firstChild.textContent.trim()
  );
}

const target = (label) =>
  [...document.querySelectorAll('.target-toggle-option')].find(
    (button) => button.textContent === label
  );

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([]);
  isCardOwned.mockReturnValue(false);
  isInList.mockReturnValue(false);
  getBinders.mockReturnValue([]);
  getBinder.mockReturnValue(null);
  isCardInBinder.mockReturnValue(false);
  resolveCatalogPrintingId.mockReturnValue(null);
  hydrateCardsByIds.mockResolvedValue([]);
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
    await typeList(
      document.querySelector('.bulk-modal textarea'),
      'Sol Ring\nArcane Signet\nFake Card'
    );

    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet', 'Fake Card']);

    expect(groupLabels()).toEqual(['Owned', 'Missing', 'Not found']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('strips quantities and set suffixes from pasted decklists', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    createBulkCheckModal().show();
    await typeList(
      document.querySelector('.bulk-modal textarea'),
      '1 Sol Ring\n2x Arcane Signet (ELD) 331'
    );

    expect(groupLabels()).toEqual(['Owned', 'Missing']);
    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('keeps a name that starts with a number when it exists verbatim', async () => {
    cardStore.getAll.mockReturnValue([makeCard('1996 World Champion')]);
    isCardOwned.mockReturnValue(true);

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), '1996 World Champion');

    expect(groupLabels()).toEqual(['Owned']);
    expect(rowTexts()).toEqual(['1996 World Champion']);
  });

  it('checks against a custom list', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isInList.mockImplementation((id, card) => card.name === 'Sol Ring');

    createBulkCheckModal().show();
    target('Trade pile').click();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nArcane Signet');

    expect(groupLabels()).toEqual(['In “Trade pile”', 'Not in “Trade pile”']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('defaults the target to a binder when opened with it', () => {
    getBinders.mockReturnValue([{ id: 'B1', name: 'Trade binder' }]);
    getBinder.mockReturnValue({ id: 'B1', name: 'Trade binder' });

    createBulkCheckModal({ target: 'binder:B1' }).show();

    expect(document.querySelector('.bulk-modal-subtitle').textContent).toContain('Trade binder');
  });

  it('checks against a binder', async () => {
    getBinders.mockReturnValue([{ id: 'B1', name: 'Trade binder' }]);
    getBinder.mockReturnValue({ id: 'B1', name: 'Trade binder' });
    isCardInBinder.mockImplementation((id, card) => card.name === 'Sol Ring');
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);

    createBulkCheckModal().show();
    target('Binder: Trade binder').click();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nArcane Signet');

    expect(groupLabels()).toEqual(['In “Trade binder”', 'Not in “Trade binder”']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('resolves all-cards catalog names that are not in the loaded store', async () => {
    cardStore.getAll.mockReturnValue([]);
    isCardOwned.mockReturnValue(true);
    resolveCatalogPrintingId.mockReturnValue('id-sol');
    hydrateCardsByIds.mockImplementation(async () => {
      cardStore.getAll.mockReturnValue([makeCard('Sol Ring')]);
      return [makeCard('Sol Ring')];
    });

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring');

    expect(hydrateCardsByIds).toHaveBeenCalledWith(['id-sol']);
    expect(groupLabels()).toEqual(['Owned']);
  });

  it('copies missing names to the clipboard', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Arcane Signet')]);
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Arcane Signet');

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
