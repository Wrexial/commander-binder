import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../state/cardState.js', () => ({
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import {
  addOwnedCards,
  createCollectionModal,
  normalizeName,
  previewGroup,
  summaryChip,
} from '../collectionModal.js';
import { setCardsOwned } from '../../../state/cardState.js';
import { updateAllCardStates } from '../../cards.js';
import { updateAllBinderCounts } from '../../layout.js';
import { updateOwnedCounter } from '../ownedCounter.js';
import { showToast } from '../toast.js';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('normalizeName', () => {
  it('trims, lowercases and tolerates empty input', () => {
    expect(normalizeName('  Sol Ring ')).toBe('sol ring');
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('summaryChip / previewGroup', () => {
  it('renders a count chip', () => {
    const html = summaryChip('owned', 'Owned', 3);
    expect(html).toContain('bulk-chip-owned');
    expect(html).toContain('<strong>3</strong>');
  });

  it('escapes card names', () => {
    const html = previewGroup('unknown', 'Not found', ['<img src=x onerror=alert(1)>']);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('omits empty groups', () => {
    expect(previewGroup('owned', 'Owned', [])).toBe('');
  });
});

describe('createCollectionModal', () => {
  it('builds the titled chrome and named buttons', () => {
    const { contentArea, buttons } = createCollectionModal({
      title: 'Test Modal',
      subtitle: 'Sub',
      actions: [
        { id: 'primary', className: 'primary', text: 'Go' },
        { id: 'close', text: 'Close' },
      ],
    });

    expect(document.querySelector('.bulk-modal h2').textContent).toBe('Test Modal');
    expect(document.querySelector('.bulk-modal-subtitle').textContent).toBe('Sub');
    expect(contentArea.classList.contains('modal-content-area')).toBe(true);
    expect(buttons.primary.className).toBe('primary');
    expect(buttons.close.textContent).toBe('Close');
  });
});

describe('addOwnedCards', () => {
  it('marks cards owned and refreshes the chrome', async () => {
    const cards = [{ id: 'a' }, { id: 'b' }];

    await addOwnedCards(cards, 'Added 2 cards.');

    expect(setCardsOwned).toHaveBeenCalledWith(cards, true);
    expect(showToast).toHaveBeenCalledWith('Added 2 cards.', 'success');
    expect(updateAllCardStates).toHaveBeenCalled();
    expect(updateAllBinderCounts).toHaveBeenCalled();
    expect(updateOwnedCounter).toHaveBeenCalled();
  });

  it('propagates failures without a success toast', async () => {
    setCardsOwned.mockRejectedValueOnce(new Error('nope'));

    await expect(addOwnedCards([{ id: 'a' }], 'Added.')).rejects.toThrow('nope');
    expect(showToast).not.toHaveBeenCalled();
  });
});
