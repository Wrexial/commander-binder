import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []), getPrintings: vi.fn(() => []) },
}));
vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createImportModal } from '../importModal.js';
import { cardStore } from '../../../state/cardStore.js';
import { isCardOwned, setCardsOwned } from '../../../state/cardState.js';
import { showToast } from '../toast.js';

const solRing = { id: 'id-sol', name: 'Sol Ring', set: 'cmm', collector_number: '342' };
const atraxa = {
  id: 'id-atraxa',
  name: "Atraxa, Praetors' Voice",
  set: '2xm',
  collector_number: '197',
};

function paste(text) {
  const textArea = document.querySelector('.transfer-textarea');
  textArea.value = text;
  textArea.dispatchEvent(new Event('input'));
  vi.advanceTimersByTime(300);
}

const primary = () => document.querySelector('.modal-button-container .primary');
const chipTexts = () =>
  [...document.querySelectorAll('.bulk-summary-chip')].map((chip) => chip.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([solRing, atraxa]);
  cardStore.getPrintings.mockImplementation((name) => (name === 'Sol Ring' ? [solRing] : [atraxa]));
  isCardOwned.mockReturnValue(false);
  setCardsOwned.mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('importModal', () => {
  it('shows an empty state before anything is pasted', () => {
    createImportModal().show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
    expect(primary().disabled).toBe(true);
  });

  it('matches pasted cards and flags unknown ones', () => {
    createImportModal().show();
    paste('1 Sol Ring\n1 Nonexistent Card');

    const chips = chipTexts();
    expect(chips[0]).toContain('New');
    expect(chips[2]).toContain('Not found');
    expect(primary().disabled).toBe(false);
  });

  it('imports the matched new cards', async () => {
    createImportModal().show();
    paste("Sol Ring\nAtraxa, Praetors' Voice");

    primary().click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsOwned).toHaveBeenCalledTimes(1);
    const [imported, owned] = setCardsOwned.mock.calls[0];
    expect(imported.map((card) => card.name).sort()).toEqual([
      "Atraxa, Praetors' Voice",
      'Sol Ring',
    ]);
    expect(owned).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Imported 2 cards.', 'success');
  });

  it('reports already-owned cards and disables importing them again', () => {
    isCardOwned.mockReturnValue(true);
    createImportModal().show();
    paste('Sol Ring');

    expect(chipTexts()[1]).toContain('Already owned');
    expect(primary().disabled).toBe(true);
  });

  it('matches an exact printing from a Moxfield CSV', () => {
    createImportModal().show();
    paste(
      [
        'Count,Tradelist Count,Name,Edition,Edition Code,Collector Number,Foil,Text,Condition,Language,Metagame',
        '1,0,Sol Ring,Commander Masters,CMM,342,,,Near Mint,English,',
      ].join('\r\n')
    );

    expect(primary().textContent).toBe('Import 1 card');
  });
});
