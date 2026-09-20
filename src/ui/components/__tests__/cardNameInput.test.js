import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
  primaryName: (cardOrName) =>
    (typeof cardOrName === 'string' ? cardOrName : cardOrName?.name || '').split(' // ')[0],
}));
vi.mock('../../../state/cardCatalog.js', () => ({
  getCatalogNames: vi.fn(() => []),
}));

import { createCardNameInput } from '../cardNameInput.js';
import { cardStore } from '../../../state/cardStore.js';
import { getCatalogNames } from '../../../state/cardCatalog.js';

function type(input, value) {
  input.textArea.value = value;
  input.textArea.dispatchEvent(new Event('input'));
}

function suggestionTexts() {
  return [...document.querySelectorAll('.suggestion-item')].map((el) => el.textContent);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  cardStore.getAll.mockReturnValue([]);
  getCatalogNames.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCardNameInput', () => {
  it('picks up catalog names that arrive after the input was created', () => {
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);

    type(input, 'sol');
    expect(suggestionTexts()).toEqual([]);

    getCatalogNames.mockReturnValue(['Sol Ring']);
    type(input, 'sol');

    expect(suggestionTexts()).toContain('Sol Ring');
  });

  it('rebuilds suggestions when the name index grows (hydrated cards)', () => {
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);

    type(input, 'sol');
    expect(suggestionTexts()).toEqual([]);

    // `resolveMissingCards` mutates the shared index as cards hydrate.
    input.nameIndex.set('sol ring', { id: 'a', name: 'Sol Ring' });
    type(input, 'sol');

    expect(suggestionTexts()).toContain('Sol Ring');
  });

  it('inserts the picked suggestion on the current line', () => {
    cardStore.getAll.mockReturnValue([{ id: 'a', name: 'Sol Ring' }]);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    type(input, 'sol');

    document
      .querySelector('.suggestion-item')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(input.textArea.value).toBe('Sol Ring\n');
  });

  it('ranks prefix matches before word-start and substring matches', () => {
    getCatalogNames.mockReturnValue(['Boring Card', 'Sol Ring', 'Ring of Three']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);

    type(input, 'ring');

    expect(suggestionTexts()).toEqual(['Ring of Three', 'Sol Ring', 'Boring Card']);
  });

  it('caps the suggestion list', () => {
    getCatalogNames.mockReturnValue(
      Array.from({ length: 9 }, (_, i) => `Ring ${String(i).padStart(2, '0')}`)
    );
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);

    type(input, 'ring');

    expect(suggestionTexts()).toHaveLength(6);
  });

  it('shows nothing for a one-character query', () => {
    getCatalogNames.mockReturnValue(['Sol Ring']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);

    type(input, 's');

    expect(suggestionTexts()).toEqual([]);
  });

  it('navigates with the arrow keys and inserts the active match on Enter', () => {
    getCatalogNames.mockReturnValue(['Alpaca', 'Alpha', 'Alpine']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    type(input, 'alp');
    const items = [...document.querySelectorAll('.suggestion-item')];

    const press = (key) =>
      input.textArea.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    expect(items[0].classList.contains('active')).toBe(true);
    press('ArrowDown');
    expect(items[1].classList.contains('active')).toBe(true);

    press('Enter');
    expect(input.textArea.value).toBe('Alpha\n');
  });

  it('selects the last suggestion when ArrowUp is pressed from a fresh list', () => {
    getCatalogNames.mockReturnValue(['Alpaca', 'Alpha', 'Alpine']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    type(input, 'alp');
    const items = [...document.querySelectorAll('.suggestion-item')];

    input.textArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(items[items.length - 1].classList.contains('active')).toBe(true);
  });

  it('hides the list on Escape', () => {
    getCatalogNames.mockReturnValue(['Sol Ring']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    type(input, 'sol');
    expect(suggestionTexts()).toContain('Sol Ring');

    input.textArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(suggestionTexts()).toEqual([]);
  });

  it('keeps the lines after the cursor and moves the caret past the pick', () => {
    getCatalogNames.mockReturnValue(['Sol Ring']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    input.textArea.value = 'sol\nArcane Signet';
    input.textArea.setSelectionRange(3, 3);
    input.textArea.dispatchEvent(new Event('input'));

    document
      .querySelector('.suggestion-item')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(input.textArea.value).toBe('Sol Ring\nArcane Signet');
    expect(input.textArea.selectionStart).toBe('Sol Ring\n'.length);
  });

  it('indexes a multi-face card under its front and full printed names', () => {
    cardStore.getAll.mockReturnValue([{ id: 'a', name: 'Front // Back' }]);

    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });

    expect(input.nameIndex.get('front')).toEqual({ id: 'a', name: 'Front // Back' });
    expect(input.nameIndex.get('front // back')).toEqual({ id: 'a', name: 'Front // Back' });
  });

  it('hides the list shortly after blur', () => {
    vi.useFakeTimers();
    getCatalogNames.mockReturnValue(['Sol Ring']);
    const input = createCardNameInput({ placeholder: 'p', ariaLabel: 'a' });
    document.body.appendChild(input.el);
    type(input, 'sol');
    expect(suggestionTexts()).toContain('Sol Ring');

    input.textArea.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(120);

    expect(suggestionTexts()).toEqual([]);
  });
});
