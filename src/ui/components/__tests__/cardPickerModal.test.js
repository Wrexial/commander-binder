import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const cards = vi.hoisted(() => [
  { id: 'atraxa', name: 'Atraxa, Praetors Voice', set: 'c16', prices: { eur: 12.5 } },
  { id: 'ajani', name: 'Ajani, Mentor of Heroes', set: 'jou', prices: { eur: 4 } },
  { id: 'sram', name: 'Sram, Senior Edificer', set: 'aer', prices: {} },
]);

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: {
    getAll: vi.fn(() => cards),
    getPrintings: vi.fn((name) => cards.filter((card) => card.name === name)),
    getByPrintingId: vi.fn((id) => cards.find((card) => card.id === id) || null),
    add: vi.fn(),
  },
}));

vi.mock('../../../state/preferredPrintings.js', () => ({
  resolveDisplayPrinting: vi.fn((name) => cards.find((card) => card.name === name) || null),
}));

vi.mock('../../../api/cardSearch.js', () => ({
  autocompleteCardNames: vi.fn(async () => ['Sram, Senior Edificer', 'Atraxa, Praetors Voice']),
  loadPrintingsForName: vi.fn(async () => cards),
  ensurePrintingsLoaded: vi.fn(async () => undefined),
}));

vi.mock('../../../utils/prices.js', () => ({
  getDisplayedPrice: vi.fn((card) => card?.prices?.eur ?? null),
  formatPrice: vi.fn((value) => `€${value}`),
}));

import { createCardPickerModal, rankCardNames } from '../cardPickerModal.js';
import { analyzeA11y } from '../../../__tests__/helpers/a11y.js';
import { autocompleteCardNames, loadPrintingsForName } from '../../../api/cardSearch.js';
import { resetCardCatalog, setCardCatalog } from '../../../state/cardCatalog.js';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  resetCardCatalog();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rankCardNames', () => {
  it('ranks prefix matches before word-start and substring matches', () => {
    expect(rankCardNames(cards, 'at').map((card) => card.id)).toEqual(['atraxa']);
    expect(rankCardNames(cards, 'praetors').map((card) => card.id)).toEqual(['atraxa']);
    expect(rankCardNames(cards, 'mentor').map((card) => card.id)).toEqual(['ajani']);
  });

  it('ignores queries shorter than two characters', () => {
    expect(rankCardNames(cards, 'a')).toEqual([]);
  });
});

describe('cardPickerModal', () => {
  it('prompts for a query before searching', () => {
    const picker = createCardPickerModal({ onPick: vi.fn() });
    picker.show();

    expect(document.querySelector('.card-picker-empty').textContent).toContain('two letters');
    expect(autocompleteCardNames).not.toHaveBeenCalled();
  });

  it('shows local matches immediately and merges the live results', async () => {
    vi.useFakeTimers();
    const picker = createCardPickerModal({ onPick: vi.fn() });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'sr';
    input.dispatchEvent(new Event('input'));

    // Local match from cardStore renders before the network responds.
    expect(document.querySelector('.card-picker-name').textContent).toBe('Sram, Senior Edificer');

    await vi.advanceTimersByTimeAsync(300);

    expect(autocompleteCardNames).toHaveBeenCalledWith('sr');
    const names = [...document.querySelectorAll('.card-picker-name')].map((el) => el.textContent);
    expect(names).toContain('Atraxa, Praetors Voice');
  });

  it('uses the all-cards catalog without hitting the API once it is loaded', () => {
    setCardCatalog({ cardNames: ['Sol Ring', 'Solitude'], cardNameById: {} });
    const picker = createCardPickerModal({ onPick: vi.fn() });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'sol';
    input.dispatchEvent(new Event('input'));

    const names = [...document.querySelectorAll('.card-picker-name')].map((el) => el.textContent);
    expect(names).toEqual(['Sol Ring', 'Solitude']);
    expect(autocompleteCardNames).not.toHaveBeenCalled();
  });

  it('picks an already-loaded card without fetching its printings', async () => {
    const onPick = vi.fn();
    const picker = createCardPickerModal({ onPick });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'aj';
    input.dispatchEvent(new Event('input'));

    document.querySelector('.card-picker-result').click();
    await vi.waitFor(() => expect(onPick).toHaveBeenCalled());

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ajani' }));
    expect(loadPrintingsForName).not.toHaveBeenCalled();
  });

  it('loads printings before picking a card that is not in the store', async () => {
    vi.useFakeTimers();
    // The live catalog returns a name not present in the local store.
    autocompleteCardNames.mockResolvedValueOnce(['Sol Ring']);
    const picker = createCardPickerModal({ onPick: vi.fn() });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'sol';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    const row = document.querySelector('.card-picker-result');
    expect(row.querySelector('.card-picker-name').textContent).toBe('Sol Ring');
    row.click();

    await vi.waitFor(() => expect(loadPrintingsForName).toHaveBeenCalledWith('Sol Ring'));
  });

  it('offers a remove action when the pocket already holds a card', () => {
    const onRemove = vi.fn();
    const picker = createCardPickerModal({ onPick: vi.fn(), onRemove });
    picker.show({ showRemove: true });

    const remove = document.querySelector('.card-picker-remove');
    expect(remove.hidden).toBe(false);
    remove.click();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    createCardPickerModal({ onPick: vi.fn() }).show();
    const { violations, summary } = await analyzeA11y(document.body);
    expect(violations.length, summary).toBe(0);
  });
});
