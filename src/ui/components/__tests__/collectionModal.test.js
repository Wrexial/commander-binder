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
  createTargetToggle,
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

  it('marks card entries as previewable', () => {
    const html = previewGroup('owned', 'Owned', [{ id: 'a', name: 'Alpha' }]);
    expect(html).toContain('data-card-preview');
    expect(html).toContain('data-card-id="a"');
    expect(html).toContain('Alpha');
  });

  it('leaves plain string names non-interactive', () => {
    const html = previewGroup('unknown', 'Not found', ['Ghost']);
    expect(html).not.toContain('data-card-preview');
  });
});

describe('createTargetToggle', () => {
  it('starts collapsed behind a summary and expands on demand', () => {
    const onChange = vi.fn();
    const toggle = createTargetToggle({
      options: [
        { id: 'owned', label: 'Collection' },
        { id: 'wishlist', label: 'Wishlist' },
      ],
      initial: 'owned',
      onChange,
    });
    document.body.appendChild(toggle.el);

    const summary = toggle.el.querySelector('.target-toggle-summary');
    const optionsRow = toggle.el.querySelector('.target-toggle-options');
    expect(optionsRow.hidden).toBe(true);
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(summary.textContent).toContain('Collection');
    expect(summary.getAttribute('aria-controls')).toBe(optionsRow.id);

    summary.click();
    expect(optionsRow.hidden).toBe(false);
    expect(summary.getAttribute('aria-expanded')).toBe('true');

    // Picking a target reports the change, updates the summary and re-collapses.
    toggle.el.querySelectorAll('.target-toggle-option')[1].click();
    expect(onChange).toHaveBeenCalledWith('wishlist');
    expect(optionsRow.hidden).toBe(true);
    expect(summary.textContent).toContain('Wishlist');
  });

  it('keeps the + New actions last, after the selectable targets', () => {
    const toggle = createTargetToggle({
      options: [{ id: 'owned', label: 'Collection' }],
      initial: 'owned',
      onChange: vi.fn(),
      actions: [
        { id: 'new-list', label: '+ New list', onClick: vi.fn() },
        { id: 'new-binder', label: '+ New binder', onClick: vi.fn() },
      ],
    });
    document.body.appendChild(toggle.el);

    const optionsRow = toggle.el.querySelector('.target-toggle-options');
    const actionButtons = [...optionsRow.querySelectorAll('.target-toggle-new')];
    expect(actionButtons.map((button) => button.textContent)).toEqual([
      '+ New list',
      '+ New binder',
    ]);
    expect(optionsRow.lastElementChild).toBe(actionButtons[1]);
    expect(optionsRow.querySelector('.target-toggle-option').textContent).toBe('Collection');
  });

  it('calls the matching action when a + New button is clicked', () => {
    const onNewBinder = vi.fn();
    const toggle = createTargetToggle({
      options: [{ id: 'owned', label: 'Collection' }],
      initial: 'owned',
      onChange: vi.fn(),
      actions: [
        { id: 'new-list', label: '+ New list', onClick: vi.fn() },
        { id: 'new-binder', label: '+ New binder', onClick: onNewBinder },
      ],
    });
    document.body.appendChild(toggle.el);

    toggle.el.querySelector('[data-action="new-binder"]').click();

    expect(onNewBinder).toHaveBeenCalledTimes(1);
  });

  it('marks the active option as pressed when it changes', () => {
    const toggle = createTargetToggle({
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      initial: 'a',
      onChange: vi.fn(),
    });
    document.body.appendChild(toggle.el);
    const [first, second] = toggle.el.querySelectorAll('.target-toggle-option');
    expect(first.getAttribute('aria-pressed')).toBe('true');

    toggle.setValue('b');

    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a newly created option before the + New actions', () => {
    const toggle = createTargetToggle({
      options: [{ id: 'owned', label: 'Collection' }],
      initial: 'owned',
      onChange: vi.fn(),
      actions: [{ id: 'new-list', label: '+ New list', onClick: vi.fn() }],
    });
    document.body.appendChild(toggle.el);

    toggle.addOption({ id: 'l1', label: 'Trade Binder' });

    const optionsRow = toggle.el.querySelector('.target-toggle-options');
    const labels = [...optionsRow.children].map((child) => child.textContent);
    expect(labels).toEqual(['Collection', 'Trade Binder', '+ New list']);
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
