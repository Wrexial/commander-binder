import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []), getPrintings: vi.fn(() => []) },
  primaryName: (cardOrName) =>
    (typeof cardOrName === 'string' ? cardOrName : cardOrName?.name || '').split(' // ')[0],
}));
vi.mock('../../../state/listsState.js', () => ({
  getLists: vi.fn(() => [{ id: 'L1', name: 'Trade pile' }]),
  getList: vi.fn((id) => (id === 'L1' ? { id: 'L1', name: 'Trade pile' } : null)),
  isInList: vi.fn(() => false),
  addCardsToList: vi.fn(() => Promise.resolve()),
  createList: vi.fn(async ({ name }) => ({ id: 'new-list', name })),
}));
vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../state/cardCatalog.js', () => ({
  getCatalogNames: vi.fn(() => []),
  isCardCatalogLoaded: vi.fn(() => true),
  resolveCatalogPrintingId: vi.fn(() => null),
}));
vi.mock('../../../api/cardSearch.js', () => ({
  hydrateCardsByIds: vi.fn(async () => []),
  loadPrintingsForName: vi.fn(async () => []),
}));

import { createAddCardsModal } from '../addCardsModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { isCardOwned, setCardsOwned } from '../../../state/cardState.js';
import { isCardWanted, setCardsWanted } from '../../../state/wishlistState.js';
import { addCardsToList, isInList } from '../../../state/listsState.js';
import { isCardCatalogLoaded, resolveCatalogPrintingId } from '../../../state/cardCatalog.js';
import { hydrateCardsByIds, loadPrintingsForName } from '../../../api/cardSearch.js';
import { showToast } from '../toast.js';

const solRing = { id: 'id-sol', name: 'Sol Ring', set: 'cmm', collector_number: '342' };
const atraxa = {
  id: 'id-atraxa',
  name: "Atraxa, Praetors' Voice",
  set: '2xm',
  collector_number: '197',
};

function textArea() {
  return document.querySelector('.bulk-modal textarea');
}

function paste(text) {
  const area = textArea();
  area.value = text;
  area.dispatchEvent(new Event('input'));
  vi.advanceTimersByTime(300);
}

const primary = () => document.querySelector('.modal-button-container .primary');
const chipTexts = () =>
  [...document.querySelectorAll('.bulk-summary-chip')].map((chip) => chip.textContent);
const target = (label) =>
  [...document.querySelectorAll('.target-toggle-option')].find(
    (button) => button.textContent === label
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([solRing, atraxa]);
  cardStore.getPrintings.mockImplementation((name) => (name === 'Sol Ring' ? [solRing] : [atraxa]));
  isCardOwned.mockReturnValue(false);
  isInList.mockReturnValue(false);
  setCardsOwned.mockResolvedValue();
  resolveCatalogPrintingId.mockReturnValue(null);
  hydrateCardsByIds.mockResolvedValue([]);
  isCardCatalogLoaded.mockReturnValue(true);
  loadPrintingsForName.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('addCardsModal', () => {
  it('resolves all-cards catalog names that are not in the loaded store', async () => {
    // The store only knows Atraxa, but the catalog knows Sol Ring too.
    const catalogSolRing = { id: 'id-catalog-sol', name: 'Sol Ring' };
    cardStore.getAll.mockReturnValue([atraxa]);
    cardStore.getPrintings.mockReturnValue([]);
    resolveCatalogPrintingId.mockReturnValue('id-catalog-sol');
    hydrateCardsByIds.mockImplementation(async () => {
      cardStore.getAll.mockReturnValue([atraxa, catalogSolRing]);
      cardStore.getPrintings.mockImplementation((name) =>
        name === 'Sol Ring' ? [catalogSolRing] : []
      );
      return [catalogSolRing];
    });

    createAddCardsModal().show();
    textArea().value = 'Sol Ring';
    textArea().dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    expect(resolveCatalogPrintingId).toHaveBeenCalledWith('Sol Ring');
    expect(hydrateCardsByIds).toHaveBeenCalledWith(['id-catalog-sol']);
    expect(chipTexts()[0]).toBe('Will add 1');
    expect(chipTexts()[2]).toBe('Not found 0');
  });

  it('falls back to a live lookup before the all-cards catalog has loaded', async () => {
    isCardCatalogLoaded.mockReturnValue(false);
    cardStore.getAll.mockReturnValue([]);
    cardStore.getPrintings.mockReturnValue([]);
    const live = { id: 'id-live', name: 'Live Card' };
    loadPrintingsForName.mockImplementation(async () => {
      cardStore.getAll.mockReturnValue([live]);
      cardStore.getPrintings.mockReturnValue([live]);
      return [live];
    });

    createAddCardsModal().show();
    textArea().value = 'Live Card';
    textArea().dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    expect(loadPrintingsForName).toHaveBeenCalledWith('Live Card');
    expect(chipTexts()[0]).toBe('Will add 1');
  });

  it('shows an empty state before anything is entered', () => {
    createAddCardsModal().show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
    expect(primary().disabled).toBe(true);
  });

  it('matches pasted cards and flags unknown ones', () => {
    createAddCardsModal().show();
    paste('1 Sol Ring\n1 Nonexistent Card');

    const chips = chipTexts();
    expect(chips[0]).toContain('Will add');
    expect(chips[2]).toContain('Not found');
    expect(primary().disabled).toBe(false);
  });

  it('matches a multi-face card by its front-face name', () => {
    const dfc = { id: 'id-dfc', name: 'Front Face // Back Face' };
    cardStore.getAll.mockReturnValue([dfc]);
    cardStore.getPrintings.mockReturnValue([dfc]);

    createAddCardsModal().show();
    paste('Front Face');

    expect(chipTexts()[0]).toBe('Will add 1');
    expect(chipTexts()[2]).toBe('Not found 0');
  });

  it('adds the matched new cards', async () => {
    createAddCardsModal().show();
    paste("Sol Ring\nAtraxa, Praetors' Voice");

    primary().click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsOwned).toHaveBeenCalledTimes(1);
    const [added, owned] = setCardsOwned.mock.calls[0];
    expect(added.map((card) => card.name).sort()).toEqual(["Atraxa, Praetors' Voice", 'Sol Ring']);
    expect(owned).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Added 2 cards.', 'success');
  });

  it('reports already-owned cards and disables adding them again', () => {
    isCardOwned.mockReturnValue(true);
    createAddCardsModal().show();
    paste('Sol Ring');

    expect(chipTexts()[1]).toContain('Already owned');
    expect(primary().disabled).toBe(true);
  });

  it('switches the target to the wishlist and adds there', async () => {
    createAddCardsModal().show();
    target('Wishlist').click();
    expect(document.querySelector('.bulk-modal-header h2').textContent).toBe('Add to Wishlist');

    paste('Sol Ring');
    primary().click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsWanted).toHaveBeenCalledWith([solRing], true);
    expect(setCardsOwned).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Added 1 card to your wishlist.', 'success');
  });

  it('skips cards already on the wishlist', () => {
    isCardWanted.mockReturnValue(true);
    createAddCardsModal().show();
    target('Wishlist').click();
    paste('Sol Ring');

    expect(chipTexts()[1]).toContain('Already wanted');
    expect(primary().disabled).toBe(true);
  });

  it('switches the target to a custom list and adds there', async () => {
    createAddCardsModal().show();
    target('Trade pile').click();
    expect(document.querySelector('.bulk-modal-header h2').textContent).toBe('Add to “Trade pile”');

    paste('Sol Ring');
    primary().click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(addCardsToList).toHaveBeenCalledWith('L1', [solRing]);
    expect(setCardsOwned).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Added 1 card to “Trade pile”.', 'success');
  });

  it('flags cards already in the selected list', () => {
    isInList.mockReturnValue(true);
    createAddCardsModal().show();
    target('Trade pile').click();
    paste('Sol Ring');

    expect(chipTexts()[1]).toContain('Already in “Trade pile”');
    expect(primary().disabled).toBe(true);
  });

  it('adds a name that starts with a number when it exists verbatim', () => {
    const weird = { id: 'id-1996', name: '1996 World Champion' };
    cardStore.getAll.mockReturnValue([weird]);
    cardStore.getPrintings.mockReturnValue([weird]);

    createAddCardsModal().show();
    paste('1996 World Champion');

    expect(primary().textContent).toBe('Add 1 card');
  });

  it('matches an exact printing from a Moxfield CSV', () => {
    createAddCardsModal().show();
    paste(
      [
        'Count,Tradelist Count,Name,Edition,Edition Code,Collector Number,Foil,Text,Condition,Language,Metagame',
        '1,0,Sol Ring,Commander Masters,CMM,342,,,Near Mint,English,',
      ].join('\r\n')
    );

    expect(primary().textContent).toBe('Add 1 card');
  });

  it('reads the pasted text from a chosen file', async () => {
    createAddCardsModal().show();

    const fileInput = document.querySelector('.transfer-file');
    Object.defineProperty(fileInput, 'files', {
      value: [{ text: () => Promise.resolve('Sol Ring') }],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(textArea().value).toBe('Sol Ring');
    expect(primary().textContent).toBe('Add 1 card');
  });

  it('offers autocomplete suggestions while typing a name', () => {
    createAddCardsModal().show();
    const area = textArea();
    area.value = 'sol';
    area.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', bubbles: true }));

    const item = [...document.querySelectorAll('.suggestion-item')].find(
      (el) => el.textContent === 'Sol Ring'
    );
    expect(item).toBeTruthy();

    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(area.value).toBe('Sol Ring\n');
  });
});
