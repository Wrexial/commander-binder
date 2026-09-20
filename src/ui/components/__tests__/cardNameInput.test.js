import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
  primaryName: (cardOrName) =>
    typeof cardOrName === 'string' ? cardOrName : cardOrName?.name || '',
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
});
