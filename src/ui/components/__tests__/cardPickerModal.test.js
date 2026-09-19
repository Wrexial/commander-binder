import { vi, describe, it, expect, beforeEach } from 'vitest';

const cards = vi.hoisted(() => [
  { id: 'atraxa', name: 'Atraxa, Praetors Voice', set: 'c16', prices: { eur: 12.5 } },
  { id: 'ajani', name: 'Ajani, Mentor of Heroes', set: 'jou', prices: { eur: 4 } },
  { id: 'sram', name: 'Sram, Senior Edificer', set: 'aer', prices: {} },
]);

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: {
    getAll: vi.fn(() => cards),
    getPrintings: vi.fn(() => cards),
    getByPrintingId: vi.fn((id) => cards.find((card) => card.id === id) || null),
  },
}));

vi.mock('../../../state/preferredPrintings.js', () => ({
  resolveDisplayPrinting: vi.fn((name) => cards.find((card) => card.name === name) || null),
}));

vi.mock('../../../utils/prices.js', () => ({
  getDisplayedPrice: vi.fn((card) => card?.prices?.eur ?? null),
  formatPrice: vi.fn((value) => `€${value}`),
}));

import { createCardPickerModal, rankCardNames, resetCardPickerIndex } from '../cardPickerModal.js';

beforeEach(() => {
  document.body.innerHTML = '';
  resetCardPickerIndex();
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
  it('lists matching cards and reports the picked display printing', () => {
    const onPick = vi.fn();
    const picker = createCardPickerModal({ onPick });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'aj';
    input.dispatchEvent(new Event('input'));

    const rows = document.querySelectorAll('.card-picker-result');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.card-picker-name').textContent).toBe('Ajani, Mentor of Heroes');
    expect(rows[0].querySelector('.card-picker-price').textContent).toBe('€4');

    rows[0].click();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ajani' }));
  });

  it('shows an empty state when nothing matches', () => {
    const picker = createCardPickerModal({ onPick: vi.fn() });
    picker.show();

    const input = document.querySelector('.card-picker-search');
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input'));

    expect(document.querySelector('.card-picker-result')).toBeNull();
    expect(document.querySelector('.card-picker-empty')).not.toBeNull();
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
});
