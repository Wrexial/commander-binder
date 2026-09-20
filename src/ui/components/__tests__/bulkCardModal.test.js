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
  cardStore: {
    getAll: vi.fn(() => []),
    getPrintings: vi.fn(() => []),
    getByPrintingId: vi.fn(),
  },
  primaryName: (cardOrName) =>
    (typeof cardOrName === 'string' ? cardOrName : cardOrName?.name || '').split(' // ')[0],
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createBulkCheckModal } from '../bulkCardModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { isCardOwned } from '../../../state/cardState.js';
import { isCardWanted } from '../../../state/wishlistState.js';
import { isInList } from '../../../state/listsState.js';
import { getBinders, isCardInBinder } from '../../../state/bindersState.js';
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

/** Card names, without the location badges that share the row. */
function rowTexts() {
  return [...document.querySelectorAll('.bulk-row')].map(
    (row) => row.querySelector('.bulk-row-name')?.textContent ?? row.textContent
  );
}

function groupLabels() {
  return [...document.querySelectorAll('.bulk-group')].map((group) =>
    group.querySelector('h3').firstChild.textContent.trim()
  );
}

/** The location badges shown beside a card name. */
function locationsFor(name) {
  const row = [...document.querySelectorAll('.bulk-row')].find(
    (candidate) => candidate.querySelector('.bulk-row-name')?.textContent === name
  );
  return [...(row?.querySelectorAll('.bulk-location') || [])].map((badge) => badge.textContent);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([]);
  cardStore.getPrintings.mockReturnValue([]);
  isCardOwned.mockReturnValue(false);
  isCardWanted.mockReturnValue(false);
  isInList.mockReturnValue(false);
  getBinders.mockReturnValue([]);
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
  it('reports found, missing-everywhere and unknown cards', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    createBulkCheckModal().show();
    await typeList(
      document.querySelector('.bulk-modal textarea'),
      'Sol Ring\nArcane Signet\nFake Card'
    );

    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet', 'Fake Card']);

    expect(groupLabels()).toEqual(['Found', 'Missing everywhere', 'Not found']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('reports every place a card lives at once', async () => {
    getBinders.mockReturnValue([{ id: 'B1', name: 'Trade binder' }]);
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring')]);
    isCardOwned.mockReturnValue(true);
    isCardWanted.mockReturnValue(true);
    isInList.mockReturnValue(true);
    isCardInBinder.mockReturnValue(true);

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring');

    expect(locationsFor('Sol Ring')).toEqual([
      'Collection',
      'Wishlist',
      'Trade pile',
      'Binder: Trade binder',
    ]);
    expect(groupLabels()).toEqual(['Found']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy missing');
    expect(document.querySelector('.bulk-modal .primary').disabled).toBe(true);
  });

  it('flags a card that lives only in a list or binder as found', async () => {
    getBinders.mockReturnValue([{ id: 'B1', name: 'Trade binder' }]);
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isInList.mockImplementation((id, card) => card.name === 'Sol Ring');
    isCardInBinder.mockImplementation((id, card) => card.name === 'Arcane Signet');

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), 'Sol Ring\nArcane Signet');

    expect(locationsFor('Sol Ring')).toEqual(['Trade pile']);
    expect(locationsFor('Arcane Signet')).toEqual(['Binder: Trade binder']);
    expect(groupLabels()).toEqual(['Found']);
    expect(document.querySelector('.bulk-modal .primary').disabled).toBe(true);
  });

  it('strips quantities and set suffixes from pasted decklists', async () => {
    cardStore.getAll.mockReturnValue([makeCard('Sol Ring'), makeCard('Arcane Signet')]);
    isCardOwned.mockImplementation((card) => card.name === 'Sol Ring');

    createBulkCheckModal().show();
    await typeList(
      document.querySelector('.bulk-modal textarea'),
      '1 Sol Ring\n2x Arcane Signet (ELD) 331'
    );

    expect(groupLabels()).toEqual(['Found', 'Missing everywhere']);
    expect(rowTexts()).toEqual(['Sol Ring', 'Arcane Signet']);
    expect(document.querySelector('.bulk-modal .primary').textContent).toBe('Copy 1 missing');
  });

  it('resolves an exact set/collector printing when names collide', async () => {
    const cmm = { id: 'cmm-342', name: 'Sol Ring', set: 'cmm', collector_number: '342' };
    const twom = { id: '2xm-999', name: 'Sol Ring', set: '2xm', collector_number: '999' };
    // The name index lands on 2XM (first); the printing index must win.
    cardStore.getAll.mockReturnValue([twom, cmm]);
    cardStore.getPrintings.mockReturnValue([cmm, twom]);
    isCardOwned.mockReturnValue(true);

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), '1 Sol Ring (CMM) 342');

    expect(isCardOwned).toHaveBeenCalledWith(cmm);
  });

  it('shows a loading state for a known card that is still hydrating', async () => {
    cardStore.getAll.mockReturnValue([]);
    cardStore.getPrintings.mockReturnValue([]);
    resolveCatalogPrintingId.mockReturnValue('id-sol');
    let releaseHydrate;
    hydrateCardsByIds.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseHydrate = resolve;
        })
    );

    createBulkCheckModal().show();
    const area = document.querySelector('.bulk-modal textarea');
    area.value = 'Sol Ring';
    area.dispatchEvent(new Event('input'));

    // Known to the catalog but not hydrated yet: loading, not "not found".
    expect(groupLabels()).toContain('Loading…');
    expect(groupLabels()).not.toContain('Not found');

    // Start the debounced resolve; it parks on the pending hydrate.
    await vi.advanceTimersByTimeAsync(300);
    expect(typeof releaseHydrate).toBe('function');

    const sol = makeCard('Sol Ring');
    cardStore.getAll.mockReturnValue([sol]);
    releaseHydrate([sol]);
    await vi.advanceTimersByTimeAsync(0);

    expect(groupLabels()).toContain('Missing everywhere');
    expect(groupLabels()).not.toContain('Loading…');
  });

  it('resolves names before copying missing cards', async () => {
    cardStore.getAll.mockReturnValue([]);
    cardStore.getPrintings.mockReturnValue([]);
    resolveCatalogPrintingId.mockReturnValue('id-sol');
    const sol = makeCard('Sol Ring');
    hydrateCardsByIds.mockImplementation(async () => {
      cardStore.getAll.mockReturnValue([sol]);
      return [sol];
    });
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    createBulkCheckModal().show();
    const area = document.querySelector('.bulk-modal textarea');
    area.value = 'Sol Ring';
    area.dispatchEvent(new Event('input'));
    // Copy before the debounce fires: the resolve must still run.
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
    );

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    expect(hydrateCardsByIds).toHaveBeenCalledWith(['id-sol']);
    expect(writeText).toHaveBeenCalledWith('Sol Ring');
  });

  it('keeps a name that starts with a number when it exists verbatim', async () => {
    cardStore.getAll.mockReturnValue([makeCard('1996 World Champion')]);
    isCardOwned.mockReturnValue(true);

    createBulkCheckModal().show();
    await typeList(document.querySelector('.bulk-modal textarea'), '1996 World Champion');

    expect(groupLabels()).toEqual(['Found']);
    expect(rowTexts()).toEqual(['1996 World Champion']);
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
    expect(groupLabels()).toEqual(['Found']);
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
